import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');

async function publicFiles() {
  const files = [];
  for (const dir of ['', 'posts', 'js', 'lib', 'blog']) {
    for (const name of await readdir(path.join(ROOT, dir))) {
      if (/\.(html|css|js)$/.test(name)) files.push(path.join(dir, name));
    }
  }
  return files;
}

// 2026-10 typography decision: reading and interface text is Pretendard
// (typography.css); Playfair + Noto Serif KR only for headings.
test('Source Serif 4 is retired everywhere', async () => {
  for (const file of await publicFiles()) {
    assert.doesNotMatch(await read(file), /Source Serif 4|Source\+Serif\+4/, file);
  }
});

test('Pretendard is loaded once, from a pinned version', async () => {
  const typography = await read('typography.css');
  assert.match(typography, /cdn\.jsdelivr\.net\/npm\/pretendard@\d+\.\d+\.\d+\/dist\/web\/variable\/pretendardvariable-dynamic-subset\.css/);
  for (const file of await publicFiles()) {
    assert.doesNotMatch(await read(file), /orioncactus\/pretendard\/dist/, `${file} loads an unpinned Pretendard`);
  }
});

test('headings fall back to Pretendard for Hangul when Noto Serif KR is not loaded', async () => {
  const typography = await read('typography.css');
  assert.match(typography, /--font-serif:\s*"Playfair Display",\s*"Noto Serif KR",\s*"Pretendard Variable"/);
});
