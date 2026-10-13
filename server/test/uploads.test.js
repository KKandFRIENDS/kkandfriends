import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validImage, validFile, safeBaseName, encodePathName } from '../src/routes/uploads.js';

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

test('document attachments must match their declared format', () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]);
  assert.equal(validFile(Buffer.from('%PDF-1.7\n'), 'application/pdf'), true);
  assert.equal(validFile(zip, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), true);
  assert.equal(validFile(ole, 'application/x-hwp'), true);
  assert.equal(validFile(Buffer.from('<html><script>'), 'application/pdf'), false);
  assert.equal(validFile(zip, 'text/html'), false);
  assert.equal(validFile(Buffer.alloc(20 * 1024 * 1024 + 1, 0x25), 'application/pdf'), false);
});

test('attachment names stay readable but cannot escape their folder', () => {
  assert.equal(safeBaseName(encodeURIComponent('2026 3분기 리포트.pdf')), '2026 3분기 리포트');
  assert.equal(safeBaseName(encodeURIComponent('../../etc/passwd')), 'passwd');
  assert.equal(safeBaseName(encodeURIComponent('a?b#c<d>.docx')), 'a_b_c_d');
  assert.equal(safeBaseName(''), 'file');
  assert.equal(safeBaseName('%E0%A4%A'), 'file');
});

test('attachment URLs are safe inside a Markdown link', () => {
  assert.equal(encodePathName('보고서 (최종).pdf'), '%EB%B3%B4%EA%B3%A0%EC%84%9C%20%28%EC%B5%9C%EC%A2%85%29.pdf');
});
