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
    if (mediaType === 'audio/webm') {
      duration = webmDurationMs(content) / 1000;
    } else {
      const metadata = await parseBuffer(content, {
        mimeType: mediaType,
        size: content.byteLength,
      });
      duration = metadata.format.duration;
    }
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

function webmDurationMs(content: Uint8Array): number {
  const bytes = Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  if (bytes.indexOf(Buffer.from('A_OPUS')) < 0) throw new Error('WebM does not contain Opus audio.');

  const scaleElement = bytes.indexOf(Buffer.from([0x2a, 0xd7, 0xb1]));
  let timecodeScale = 1_000_000;
  if (scaleElement >= 0) {
    const size = readEbmlVint(bytes, scaleElement + 3, true);
    if (size && !size.unknown && size.value >= 1 && size.value <= 8) {
      timecodeScale = readUnsigned(bytes, size.next, size.value);
    }
  }

  const clusterId = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
  let clusterAt = bytes.indexOf(clusterId);
  let latestTicks = -1;
  while (clusterAt >= 0) {
    const size = readEbmlVint(bytes, clusterAt + clusterId.length, true);
    if (!size) break;
    const nextCluster = bytes.indexOf(clusterId, size.next);
    const clusterEnd = size.unknown
      ? nextCluster >= 0
        ? nextCluster
        : bytes.length
      : Math.min(bytes.length, size.next + size.value);
    let clusterTicks = 0;
    let cursor = size.next;
    while (cursor < clusterEnd) {
      const id = readEbmlVint(bytes, cursor, false);
      if (!id) break;
      const elementSize = readEbmlVint(bytes, id.next, true);
      if (!elementSize || elementSize.unknown) break;
      const dataStart = elementSize.next;
      const dataEnd = dataStart + elementSize.value;
      if (dataEnd > clusterEnd) break;
      if (id.value === 0xe7 && elementSize.value >= 1 && elementSize.value <= 8) {
        clusterTicks = readUnsigned(bytes, dataStart, elementSize.value);
        latestTicks = Math.max(latestTicks, clusterTicks);
      } else if (id.value === 0xa3 && elementSize.value >= 4) {
        const track = readEbmlVint(bytes, dataStart, true);
        if (track && track.next + 2 <= dataEnd) {
          const relativeTicks = bytes.readInt16BE(track.next);
          latestTicks = Math.max(latestTicks, clusterTicks + relativeTicks);
        }
      }
      cursor = dataEnd;
    }
    clusterAt = nextCluster;
  }
  if (latestTicks < 0 || !Number.isFinite(timecodeScale) || timecodeScale <= 0)
    throw new Error('WebM duration is unavailable.');

  // Chromium records Opus in 20 ms packets. The final block timestamp marks the
  // packet start, so include one packet to report and enforce the full duration.
  return (latestTicks * timecodeScale) / 1_000_000 + 20;
}

function readEbmlVint(
  bytes: Buffer,
  offset: number,
  removeMarker: boolean,
): { value: number; next: number; unknown: boolean } | undefined {
  const first = bytes[offset];
  if (first === undefined || first === 0) return undefined;
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && (first & marker) === 0) {
    length += 1;
    marker >>= 1;
  }
  if (length > 8 || offset + length > bytes.length) return undefined;
  let value = BigInt(removeMarker ? first & (marker - 1) : first);
  for (let index = 1; index < length; index += 1)
    value = (value << 8n) | BigInt(bytes[offset + index]!);
  const unknown = removeMarker && value === (1n << BigInt(7 * length)) - 1n;
  if (unknown) return { value: 0, next: offset + length, unknown: true };
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  return { value: Number(value), next: offset + length, unknown };
}

function readUnsigned(bytes: Buffer, offset: number, length: number): number {
  let value = 0;
  for (let index = 0; index < length; index += 1) value = value * 256 + bytes[offset + index]!;
  return value;
}
