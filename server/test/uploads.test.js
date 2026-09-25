import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validImage } from '../src/routes/uploads.js';

test('image validation accepts matching signatures', () => {
  assert.equal(validImage(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'), true);
  assert.equal(validImage(Buffer.from([137,80,78,71,13,10,26,10]), 'image/png'), true);
});

test('image validation rejects a spoofed content type and empty data', () => {
  assert.equal(validImage(Buffer.from('not an image'), 'image/png'), false);
  assert.equal(validImage(Buffer.alloc(0), 'image/jpeg'), false);
  assert.equal(validImage(Buffer.from('<svg/>'), 'image/svg+xml'), false);
});

test('Caddy serves the persisted upload volume without proxying it to the API', async () => {
  const [caddy, staging] = await Promise.all([
    readFile(new URL('../Caddyfile', import.meta.url), 'utf8'),
    readFile(new URL('../compose.staging.yaml', import.meta.url), 'utf8'),
  ]);
  assert.match(caddy, /handle_path \/uploads\/\*/);
  assert.match(caddy, /root \* \/srv\/kkf\/uploads[\s\S]*file_server/);
  assert.match(staging, /data\/uploads:\/srv\/kkf\/uploads:ro/);
});
