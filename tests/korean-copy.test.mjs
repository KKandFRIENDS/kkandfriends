import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');

// 2026-10-13 (KK): Korean first. Hero paragraphs and the analytics banner were still English twins.
test('membership and community body paragraphs are Korean', async () => {
  const text = (await read('membership.html')) + (await read('community.html'));
  for (const english of ['is an invite-first community', 'is not a platform', 'A look at what members actually do',
    'KK shares candid perspectives', 'Small-group discussions on market structure', 'you may belong here']) {
    assert.ok(!text.includes(english), english);
  }
});

test('analytics consent banner has no English twins', async () => {
  const js = await read('js/analytics-consent.js');
  for (const english of ['Optional analytics', 'Privacy\'', 'Reject', 'Allow analytics']) {
    assert.ok(!js.includes(english), english);
  }
  assert.match(js, /textContent = '거부'/);
  assert.match(js, /textContent = '분석 허용'/);
});
