import type { ApiError, ApiResponse } from '@doctor/contracts';
import { sessionToken } from '../../shared/api';

const FALLBACK_MESSAGE = 'Request failed. Please try again.';

export interface ERequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export class EApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(status: number, code: string, requestId: string, message: string) {
    super(message);
    this.name = 'EApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  static fromResponse(status: number, payload: unknown): EApiError {
    if (isApiError(payload)) {
      return new EApiError(
        status,
        payload.error.code,
        payload.meta.requestId,
        payload.error.message,
      );
    }

    return new EApiError(status, 'REQUEST_FAILED', 'unknown', FALLBACK_MESSAGE);
  }
}

export async function requestEApi<T>(
  path: string,
  options: ERequestOptions = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  const token = sessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !multipart) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    body:
      options.body === undefined
        ? undefined
        : multipart
          ? (options.body as FormData)
          : JSON.stringify(options.body),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw EApiError.fromResponse(response.status, payload);
  }

  return payload as ApiResponse<T>;
}

function isApiError(payload: unknown): payload is ApiError {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Partial<ApiError>;
  return (
    typeof candidate.error?.code === 'string' &&
    typeof candidate.error.message === 'string' &&
    typeof candidate.meta?.requestId === 'string'
  );
}
