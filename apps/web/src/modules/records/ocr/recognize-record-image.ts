export const MAX_RECORD_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_EDGE = 2400;
const OCR_TIMEOUT = 120_000;
const IMAGE_ERROR = '无法读取图片，请换用清晰的 JPG、PNG 或 WebP 图片。';
const ENGINE_ERROR = '本地识别引擎加载失败，请重启软件后重试。';

export interface RecordImageResult {
  text: string;
  confidence: number;
}
export interface RecordImageOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export function validateRecordImage(file: Blob): void {
  if (!file.size) throw new Error('图片为空，请重新选择。');
  if (file.size > MAX_RECORD_IMAGE_BYTES) throw new Error('图片不能超过 12 MB。');
  const name = 'name' in file && typeof file.name === 'string' ? file.name : '';
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase()) &&
    !(file.type === '' && /\.(jpe?g|png|webp)$/i.test(name))
  ) {
    throw new Error('仅支持 JPG、PNG 或 WebP 图片。');
  }
}

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('Recognition cancelled', 'AbortError');
}
function cancellable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(abortError(signal));
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener('abort', cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal?.removeEventListener('abort', cancel));
  });
}

/** Browser decoding handles phone EXIF orientation; bound the canvas/WASM input on laptops. */
async function prepareImage(file: Blob, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  const url = URL.createObjectURL(file);
  const image = new Image();
  let abort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(abortError(signal));
      signal?.addEventListener('abort', abort, { once: true });
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(IMAGE_ERROR));
      image.src = url;
    });
    signal?.throwIfAborted();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error(IMAGE_ERROR);
    if (width * height > MAX_PIXELS) throw new Error('图片尺寸过大，请缩小后重试。');
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error(IMAGE_ERROR);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = await cancellable(
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error(IMAGE_ERROR))),
          'image/png',
        );
      }),
      signal,
    );
    signal?.throwIfAborted();
    return result;
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
    image.onload = null;
    image.onerror = null;
    image.src = '';
    URL.revokeObjectURL(url);
  }
}

/** All image/text data stays in memory. No upload, browser persistence or CDN fallback. */
async function recognizeImage(file: Blob, options: RecordImageOptions): Promise<RecordImageResult> {
  validateRecordImage(file);
  options.signal?.throwIfAborted();
  const image = await prepareImage(file, options.signal);
  options.signal?.throwIfAborted();
  return new Promise<RecordImageResult>((resolve, reject) => {
    let worker: Worker | undefined;
    let settled = false;
    let progress = 0;
    const finish = (error?: Error, result?: RecordImageResult) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', cancel);
      worker?.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const cancel = () => finish(abortError(options.signal));
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      worker = new Worker(new URL('./recognize-record.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onerror = () => finish(new Error(ENGINE_ERROR));
      worker.onmessageerror = () => finish(new Error(ENGINE_ERROR));
      worker.onmessage = (event: MessageEvent) => {
        if (settled) return;
        if (event.data.type === 'progress') {
          progress = Math.max(progress, Math.min(1, Number(event.data.progress) || 0));
          options.onProgress?.(progress);
        } else if (event.data.type === 'result') {
          finish(undefined, {
            text: String(event.data.text ?? ''),
            confidence: Number(event.data.confidence) || 0,
          });
        } else if (event.data.type === 'error') finish(new Error(ENGINE_ERROR));
      };
      worker.postMessage({ image, assetBase: new URL('/ocr/', window.location.href).href });
    } catch {
      finish(new Error(ENGINE_ERROR));
    }
  });
}

export async function recognizeRecordImage(
  file: Blob,
  options: RecordImageOptions = {},
): Promise<RecordImageResult> {
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(abortError(options.signal));
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error('识别超时，请缩小图片或重新拍摄后重试。')),
    OCR_TIMEOUT,
  );
  try {
    return await recognizeImage(file, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
