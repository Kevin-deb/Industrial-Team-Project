import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Small code-native product mark: a white medical cross and pulse on a teal tile.
// PNG-in-ICO is supported by every supported Windows version and needs no native build tool.
const size = 256;
const bytes = Buffer.alloc((size * 4 + 1) * size);
function segmentDistance(x, y, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
const pulse = [
  [48, 152],
  [80, 152],
  [99, 124],
  [118, 178],
  [145, 138],
  [161, 152],
  [208, 152],
];
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const qx = Math.abs(x - 127.5) - 80,
      qy = Math.abs(y - 127.5) - 80;
    const inside =
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= 43;
    const cross =
      (x >= 112 && x <= 143 && y >= 48 && y <= 112) || (x >= 95 && x <= 160 && y >= 65 && y <= 96);
    const line = pulse.slice(1).some((p, i) => segmentDistance(x, y, pulse[i], p) <= 5);
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    bytes[offset] = cross || line ? 255 : 11;
    bytes[offset + 1] = cross || line ? 255 : Math.round(140 + (20 * y) / size);
    bytes[offset + 2] = cross || line ? 255 : Math.round(147 + (16 * y) / size);
    bytes[offset + 3] = inside ? 255 : 0;
  }
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const kind = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([kind, data])));
  return Buffer.concat([length, kind, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(bytes)),
  chunk('IEND', Buffer.alloc(0)),
]);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
const assets = resolve(dirname(fileURLToPath(import.meta.url)), '../assets');
mkdirSync(assets, { recursive: true });
writeFileSync(resolve(assets, 'icon.png'), png);
writeFileSync(resolve(assets, 'icon.ico'), Buffer.concat([ico, png]));
