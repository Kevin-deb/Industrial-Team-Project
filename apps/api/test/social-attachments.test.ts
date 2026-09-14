import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { LocalAttachmentStorage, validateMedia } from '../src/social/attachment-storage.js';
import { createApp } from '../src/app.js';

test('local attachment storage uses generated keys and exact bytes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'carelink-media-'));
  try {
    const storage = new LocalAttachmentStorage(root);
    const content = Buffer.from('not a real patient file');
    const key = await storage.write(content, '.bin');

    assert.match(key, /^[a-f0-9-]+\.bin$/);
    assert.ok(!key.includes('..'));
    assert.deepEqual(await storage.read(key), content);
    assert.deepEqual(await readFile(resolve(root, key)), content);
    await storage.remove(key);
    await storage.remove(key);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('media validation accepts a bounded PNG and rejects SVG or mismatched MIME', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const image = await validateMedia(png, 'image/png');
  assert.deepEqual(image, { kind: 'image', mediaType: 'image/png', width: 1, height: 1 });

  await assert.rejects(
    validateMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'),
    /不支持的图片格式/,
  );
  await assert.rejects(validateMedia(png, 'image/jpeg'), /文件内容与声明格式不一致/);
});

test('media validation measures WAV duration and enforces three minutes', async () => {
  const short = createWav(1);
  const audio = await validateMedia(short, 'audio/wav');
  assert.equal(audio.kind, 'audio');
  assert.equal(audio.mediaType, 'audio/wav');
  assert.ok(audio.durationMs && audio.durationMs >= 990 && audio.durationMs <= 1010);

  await assert.rejects(validateMedia(createWav(181), 'audio/wav'), /音频不能超过 3 分钟/);
});

test('attachment HTTP API uploads, streams, ranges and deletes local media', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'carelink-attachment-api-'));
  const app = await createApp({ databasePath: resolve(root, 'carelink.db') });
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const uploadedImage = await upload(app, png, 'image/png');
    assert.equal(uploadedImage.statusCode, 201, uploadedImage.body);
    const image = uploadedImage.json().data;
    assert.deepEqual(
      {
        kind: image.kind,
        mediaType: image.mediaType,
        byteSize: image.byteSize,
        width: image.width,
        height: image.height,
      },
      {
        kind: 'image',
        mediaType: 'image/png',
        byteSize: png.byteLength,
        width: 1,
        height: 1,
      },
    );
    assert.match(image.id, /^ATTACHMENT-/);
    assert.equal(image.contentUrl, `/api/v1/social/attachments/${image.id}/content`);
    assert.ok(!JSON.stringify(image).includes(root));

    const imageContent = await app.inject(image.contentUrl);
    assert.equal(imageContent.statusCode, 200, imageContent.body);
    assert.equal(imageContent.headers['content-type'], 'image/png');
    assert.deepEqual(imageContent.rawPayload, png);

    const wav = createWav(1);
    const uploadedAudio = await upload(app, wav, 'audio/wav');
    assert.equal(uploadedAudio.statusCode, 201, uploadedAudio.body);
    const audio = uploadedAudio.json().data;
    assert.equal(audio.kind, 'audio');
    assert.equal(audio.durationMs, 1000);

    const range = await app.inject({
      method: 'GET',
      url: audio.contentUrl,
      headers: { range: 'bytes=0-15' },
    });
    assert.equal(range.statusCode, 206, range.body);
    assert.equal(range.headers['content-range'], `bytes 0-15/${wav.byteLength}`);
    assert.equal(range.headers['content-length'], '16');
    assert.deepEqual(range.rawPayload, wav.subarray(0, 16));

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/social/attachments/${image.id}`,
    });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal((await app.inject(image.contentUrl)).statusCode, 404);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function upload(
  app: Awaited<ReturnType<typeof createApp>>,
  content: Buffer,
  mediaType: string,
) {
  const boundary = '----carelink-test-boundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ignored.bin"\r\nContent-Type: ${mediaType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return app.inject({
    method: 'POST',
    url: '/api/v1/social/attachments',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([head, content, tail]),
  });
}

function createWav(durationSeconds: number) {
  const sampleRate = 8000;
  const dataLength = sampleRate * durationSeconds * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}
