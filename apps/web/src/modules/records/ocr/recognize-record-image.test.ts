import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RECORD_IMAGE_BYTES,
  recognizeRecordImage,
  validateRecordImage,
} from './recognize-record-image';

const NativeURL = URL;
let imageMode: 'load' | 'error' | 'pending';
let imageWidth: number;
let imageHeight: number;
let canvasMode: 'ready' | 'empty' | 'pending';
let pendingCanvasCallback: BlobCallback | undefined;
let lastCanvas: HTMLCanvasElement | undefined;
let failPosting: boolean;
const createObjectURL = vi.fn(() => 'blob:local-medical-record');
const revokeObjectURL = vi.fn();
const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };

class TestImage {
  static instances: TestImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = imageWidth;
  naturalHeight = imageHeight;
  private source = '';

  constructor() {
    TestImage.instances.push(this);
  }
  get src() {
    return this.source;
  }
  set src(value: string) {
    this.source = value;
    if (value && imageMode !== 'pending') {
      void Promise.resolve().then(() =>
        imageMode === 'error' ? this.onerror?.() : this.onload?.(),
      );
    }
  }
}

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((_message: unknown) => {
    if (failPosting) throw new Error('Cannot clone');
  });
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    TestWorker.instances.push(this);
  }
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function imageFile(type = 'image/png', name = 'record.png', size = 128): File {
  const file = new File(['synthetic image'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function flushMicrotasks() {
  for (let count = 0; count < 15; count += 1) await Promise.resolve();
}

async function startedWorker(): Promise<TestWorker> {
  await flushMicrotasks();
  expect(TestWorker.instances).toHaveLength(1);
  return TestWorker.instances[0]!;
}

beforeEach(() => {
  imageMode = 'load';
  imageWidth = 3000;
  imageHeight = 1500;
  canvasMode = 'ready';
  pendingCanvasCallback = undefined;
  lastCanvas = undefined;
  failPosting = false;
  TestImage.instances = [];
  TestWorker.instances = [];
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  context.fillRect.mockClear();
  context.drawImage.mockClear();
  vi.stubGlobal('Image', TestImage);
  vi.stubGlobal('Worker', TestWorker);
  vi.stubGlobal(
    'URL',
    Object.assign(class extends NativeURL {}, { createObjectURL, revokeObjectURL }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
  ) {
    lastCanvas = this;
    if (canvasMode === 'pending') pendingCanvasCallback = callback;
    else
      callback(
        canvasMode === 'empty'
          ? null
          : new Blob(['decoded synthetic image'], { type: 'image/png' }),
      );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('validateRecordImage', () => {
  it.each([
    ['image/jpeg', 'record.jpg'],
    ['image/png', 'record.png'],
    ['image/webp', 'record.webp'],
    ['', 'PHONE.JPEG'],
  ])('accepts supported input %s / %s including files without MIME metadata', (type, name) => {
    expect(() => validateRecordImage(imageFile(type, name))).not.toThrow();
  });

  it.each([
    ['image/heic', 'record.heic'],
    ['application/pdf', 'record.png'],
    ['image/svg+xml', 'record.svg'],
    ['', 'record.pdf'],
  ])('rejects unsupported or conflicting formats before decoding: %s / %s', (type, name) => {
    expect(() => validateRecordImage(imageFile(type, name))).toThrow(
      '仅支持 JPG、PNG 或 WebP 图片。',
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects an empty image and sizes above 12 MB while accepting exactly 12 MB', () => {
    expect(() => validateRecordImage(imageFile('image/png', 'empty.png', 0))).toThrow('图片为空');
    expect(() =>
      validateRecordImage(imageFile('image/png', 'large.png', MAX_RECORD_IMAGE_BYTES + 1)),
    ).toThrow('12 MB');
    expect(() =>
      validateRecordImage(imageFile('image/png', 'limit.png', MAX_RECORD_IMAGE_BYTES)),
    ).not.toThrow();
  });
});

describe('recognizeRecordImage lifecycle', () => {
  it('normalizes and bounds large images, uses local assets and cleans up after success without uploading or persisting data', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    const result = recognizeRecordImage(imageFile());
    const worker = await startedWorker();
    expect(lastCanvas?.width).toBe(2400);
    expect(lastCanvas?.height).toBe(1200);
    expect(context.fillStyle).toBe('#ffffff');
    const message = worker.postMessage.mock.calls[0]![0] as { image: Blob; assetBase: string };
    expect(message.image.type).toBe('image/png');
    expect(message.assetBase).toBe(new NativeURL('/ocr/', window.location.href).href);
    expect(worker.url.origin).toBe(new NativeURL(window.location.href).origin);
    expect(worker.options.type).toBe('module');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-medical-record');
    expect(TestImage.instances[0]?.src).toBe('');
    worker.emit({ type: 'result', text: '主诉：发热3天', confidence: 93.5 });
    await expect(result).resolves.toEqual({ text: '主诉：发热3天', confidence: 93.5 });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('leaves already small images at their original resolution', async () => {
    imageWidth = 640;
    imageHeight = 480;
    const result = recognizeRecordImage(imageFile('image/webp', 'photo.webp'));
    const worker = await startedWorker();
    expect(lastCanvas?.width).toBe(640);
    expect(lastCanvas?.height).toBe(480);
    worker.emit({ type: 'result', text: '', confidence: 0 });
    await expect(result).resolves.toEqual({ text: '', confidence: 0 });
  });

  it('reports monotonic bounded progress and ignores late events after completion', async () => {
    const onProgress = vi.fn();
    const controller = new AbortController();
    const result = recognizeRecordImage(imageFile(), { onProgress, signal: controller.signal });
    const worker = await startedWorker();
    for (const progress of [0.4, 0.1, -1, 5]) worker.emit({ type: 'progress', progress });
    expect(onProgress.mock.calls.map(([value]) => value)).toEqual([0.4, 0.4, 0.4, 1]);
    worker.emit({ type: 'result', text: '测试', confidence: 80 });
    await result;
    worker.emit({ type: 'progress', progress: 0.9 });
    controller.abort();
    expect(onProgress).toHaveBeenCalledTimes(4);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects a pre-cancelled operation before creating any image or worker', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      recognizeRecordImage(imageFile(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(TestWorker.instances).toHaveLength(0);
  });

  it('cancels a pending image decode and releases the image URL', async () => {
    imageMode = 'pending';
    const controller = new AbortController();
    const result = recognizeRecordImage(imageFile(), { signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(TestImage.instances[0]?.src).toBe('');
    expect(TestWorker.instances).toHaveLength(0);
  });

  it('cancels during canvas conversion without waiting for a browser callback', async () => {
    canvasMode = 'pending';
    const controller = new AbortController();
    let error: unknown;
    const result = recognizeRecordImage(imageFile(), { signal: controller.signal }).catch(
      (caught: unknown) => {
        error = caught;
      },
    );
    await flushMicrotasks();
    expect(pendingCanvasCallback).toBeDefined();
    controller.abort();
    await flushMicrotasks();
    try {
      expect(error).toMatchObject({ name: 'AbortError' });
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(TestWorker.instances).toHaveLength(0);
    } finally {
      pendingCanvasCallback?.(new Blob(['late conversion']));
      await result;
    }
  });

  it('cancels OCR work immediately and terminates the worker exactly once', async () => {
    const controller = new AbortController();
    const result = recognizeRecordImage(imageFile(), { signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    const worker = await startedWorker();
    controller.abort();
    await rejected;
    worker.emit({ type: 'result', text: 'late result', confidence: 80 });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('times out OCR work and cleans the worker and abort listener', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = recognizeRecordImage(imageFile(), { signal: controller.signal });
    const rejected = expect(result).rejects.toThrow('识别超时');
    const worker = await startedWorker();
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    controller.abort();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also enforces a deadline when image decoding never replies', async () => {
    vi.useFakeTimers();
    imageMode = 'pending';
    const controller = new AbortController();
    let error: unknown;
    const result = recognizeRecordImage(imageFile(), { signal: controller.signal }).catch(
      (caught: unknown) => {
        error = caught;
      },
    );
    await vi.advanceTimersByTimeAsync(120_000);
    try {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('识别超时');
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(TestWorker.instances).toHaveLength(0);
    } finally {
      controller.abort();
      await result;
    }
  });

  it.each(['error', 'messageerror', 'engine'] as const)(
    'cleans up and returns a generic safe error on worker %s',
    async (failure) => {
      const result = recognizeRecordImage(imageFile());
      const rejected = expect(result).rejects.toThrow('本地识别引擎加载失败');
      const worker = await startedWorker();
      if (failure === 'error') worker.onerror?.();
      else if (failure === 'messageerror') worker.onmessageerror?.();
      else worker.emit({ type: 'error', text: 'private medical text must not enter the error' });
      await rejected;
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    },
  );

  it('cleans up if posting decoded image data to the worker fails', async () => {
    failPosting = true;
    await expect(recognizeRecordImage(imageFile())).rejects.toThrow('本地识别引擎加载失败');
    expect(TestWorker.instances[0]?.terminate).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('reports blocked worker construction without leaking the decoded source image URL', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Blocked by browser');
        }
      },
    );
    await expect(recognizeRecordImage(imageFile())).rejects.toThrow('本地识别引擎加载失败');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it.each([
    'decode',
    'zero dimensions',
    'excessive pixels',
    'missing canvas',
    'canvas conversion',
  ] as const)('rejects %s and releases resources before OCR starts', async (failure) => {
    if (failure === 'decode') imageMode = 'error';
    if (failure === 'zero dimensions') imageWidth = 0;
    if (failure === 'excessive pixels') {
      imageWidth = 10_000;
      imageHeight = 10_000;
    }
    if (failure === 'missing canvas')
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    if (failure === 'canvas conversion') canvasMode = 'empty';
    await expect(recognizeRecordImage(imageFile())).rejects.toThrow(
      failure === 'excessive pixels' ? '图片尺寸过大' : '无法读取图片',
    );
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(TestImage.instances[0]?.src).toBe('');
    expect(TestWorker.instances).toHaveLength(0);
  });
});
