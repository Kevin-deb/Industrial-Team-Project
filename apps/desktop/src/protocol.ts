import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';

export const APPLICATION_URL = 'carelink://app/';
const MAX_BODY_SIZE = 1024 * 1024;
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' carelink://app",
  "media-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "worker-src 'none'",
].join('; ');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function isApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'carelink:' &&
      url.hostname === 'app' &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function response(body: BodyInit | null, status = 200, headers: HeadersInit = {}): Response {
  const secured = new Headers(headers);
  secured.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  secured.set('X-Content-Type-Options', 'nosniff');
  secured.set('Referrer-Policy', 'no-referrer');
  secured.set('Cache-Control', 'no-store');
  return new Response(body, { status, headers: secured });
}

/** Only the bundled, sandboxed renderer can reach the in-process API. No TCP listener is opened. */
export function createProtocolHandler(services: FastifyInstance, rendererRoot: string) {
  return async (request: Request): Promise<Response> => {
    try {
      if (!isApplicationUrl(request.url)) return response('Forbidden', 403);
      const origin = request.headers.get('origin');
      if (origin && origin !== 'carelink://app') return response('Forbidden origin', 403);
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/v1/')) {
        const contentLength = Number(request.headers.get('content-length') ?? 0);
        if (contentLength > MAX_BODY_SIZE) return response('Request too large', 413);
        const payload = ['GET', 'HEAD'].includes(request.method)
          ? undefined
          : Buffer.from(await request.arrayBuffer());
        if (payload && payload.length > MAX_BODY_SIZE) return response('Request too large', 413);
        // Preserve the API's local-only origin/host guards. Never forward caller-supplied host.
        const headers: Record<string, string> = { host: '127.0.0.1', origin: 'http://127.0.0.1' };
        for (const name of ['accept', 'content-type', 'accept-language', 'if-match']) {
          const value = request.headers.get(name);
          if (value) headers[name] = value;
        }
        const result = await services.inject({
          method: request.method as
            'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS',
          url: url.pathname + url.search,
          headers,
          payload,
        });
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(result.headers)) {
          if (
            value !== undefined &&
            !['connection', 'transfer-encoding', 'content-length'].includes(name)
          )
            responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
        }
        return response(
          request.method === 'HEAD' || [204, 304].includes(result.statusCode) ? null : result.body,
          result.statusCode,
          responseHeaders,
        );
      }
      if (url.pathname.startsWith('/api/')) return response('Not found', 404);
      if (!['GET', 'HEAD'].includes(request.method)) return response('Method not allowed', 405);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes('\\') || pathname.includes('\0')) return response('Invalid path', 400);
      const target =
        pathname === '/' || !extname(pathname)
          ? resolve(rendererRoot, 'index.html')
          : resolve(rendererRoot, '.' + pathname);
      const relativeTarget = relative(rendererRoot, target);
      if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget))
        return response('Forbidden', 403);
      const content = await readFile(target);
      return response(request.method === 'HEAD' ? null : new Uint8Array(content), 200, {
        'Content-Type': MIME_TYPES[extname(target)] ?? 'application/octet-stream',
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        return response('Not found', 404);
      if (error instanceof URIError) return response('Invalid path', 400);
      console.error('Local application request failed:', error);
      return response('Local application service unavailable', 503);
    }
  };
}
