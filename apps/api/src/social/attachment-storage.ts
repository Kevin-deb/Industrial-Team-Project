import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { imageSize } from 'image-size';
import { parseBuffer } from 'music-metadata';

export interface ValidatedMedia {
  kind: 'image' | 'audio';
  mediaType: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface AttachmentStoragePort {
  write(content: Uint8Array, extension: string): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

export class LocalAttachmentStorage implements AttachmentStoragePort {
  constructor(private readonly root: string) {}

  async write(content: Uint8Array, extension: string): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const suffix = /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.bin';
    const storageKey = `${randomUUID()}${suffix}`;
    const temporaryKey = `${storageKey}.tmp`;
    await writeFile(this.safePath(temporaryKey), content, { flag: 'wx' });
    await rename(this.safePath(temporaryKey), this.safePath(storageKey));
    return storageKey;
  }

  read(storageKey: string): Promise<Buffer> {
    return readFile(this.safePath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.safePath(storageKey), { force: true });
  }

  private safePath(storageKey: string): string {
    if (!/^[a-f0-9-]+\.[a-z0-9.]{1,12}$/.test(storageKey) || storageKey.includes('..')) {
      throw new Error('Invalid attachment storage key.');
    }
    return resolve(this.root, storageKey);
  }
}

const imageTypes = new Map([
  ['image/jpeg', { detected: 'jpg', extension: '.jpg' }],
  ['image/png', { detected: 'png', extension: '.png' }],
  ['image/webp', { detected: 'webp', extension: '.webp' }],
]);

const audioExtensions = new Map([
  ['audio/mpeg', '.mp3'],
  ['audio/mp4', '.m4a'],
  ['audio/x-m4a', '.m4a'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/webm', '.webm'],
  ['audio/ogg', '.ogg'],
]);

export function extensionForMedia(mediaType: string): string {
  return imageTypes.get(mediaType)?.extension ?? audioExtensions.get(mediaType) ?? '.bin';
}

export async function validateMedia(
  content: Uint8Array,
  claimedMediaType: string,
): Promise<ValidatedMedia> {
  const mediaType = normalizeMediaType(claimedMediaType);
  const image = imageTypes.get(mediaType);
  if (image) {
    if (content.byteLength > 5 * 1024 * 1024) throw new Error('图片不能超过 5 MB。');
    let dimensions: ReturnType<typeof imageSize>;
    try {
      dimensions = imageSize(content);
    } catch {
      throw new Error('无法读取图片内容。');
    }
    if (dimensions.type !== image.detected) throw new Error('文件内容与声明格式不一致。');
    if (!dimensions.width || !dimensions.height) throw new Error('无法读取图片尺寸。');
    return {
      kind: 'image',
      mediaType,
      width: dimensions.width,
      height: dimensions.height,
    };
  }
  if (mediaType.startsWith('image/')) throw new Error('不支持的图片格式。');
  if (!audioExtensions.has(mediaType)) throw new Error('不支持的音频格式。');
  if (content.byteLength > 10 * 1024 * 1024) throw new Error('音频不能超过 10 MB。');
  if (!matchesAudioSignature(content, mediaType)) {
    throw new Error('文件内容与声明格式不一致。');
  }
  let duration: number | undefined;
  try {
    const metadata = await parseBuffer(content, { mimeType: mediaType, size: content.byteLength });
    duration = metadata.format.duration;
  } catch {
    throw new Error('无法读取音频内容。');
  }
  if (!duration || !Number.isFinite(duration)) throw new Error('无法读取音频时长。');
  if (duration > 180.05) throw new Error('音频不能超过 3 分钟。');
  return { kind: 'audio', mediaType, durationMs: Math.round(duration * 1000) };
}

function normalizeMediaType(value: string) {
  const normalized = value.toLowerCase().split(';', 1)[0]!.trim();
  if (normalized === 'audio/x-wav') return 'audio/wav';
  if (normalized === 'audio/x-m4a') return 'audio/mp4';
  return normalized;
}

function matchesAudioSignature(content: Uint8Array, mediaType: string): boolean {
  const bytes = Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  if (mediaType === 'audio/wav')
    return (
      bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE'
    );
  if (mediaType === 'audio/ogg') return bytes.subarray(0, 4).toString() === 'OggS';
  if (mediaType === 'audio/webm') return bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3;
  if (mediaType === 'audio/mp4') return bytes.subarray(4, 8).toString() === 'ftyp';
  if (mediaType === 'audio/mpeg') {
    return (
      bytes.subarray(0, 3).toString() === 'ID3' ||
      (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    );
  }
  return false;
}
