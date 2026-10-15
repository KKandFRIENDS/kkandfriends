import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { stripDashes } from '../lib/briefs/dashes.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// 2026-10-15 (KK): no em dashes in published briefs. The output check is the guarantee.
test('stripDashes replaces em dashes and spaced en dashes', () => {
  assert.equal(stripDashes('금리는 올랐다 — 주식은 버텼다'), '금리는 올랐다, 주식은 버텼다');
  assert.equal(stripDashes('금리는 올랐다—주식은 버텼다'), '금리는 올랐다, 주식은 버텼다');
  assert.equal(stripDashes('이유가 있다. — 그리고 반전이다'), '이유가 있다. 그리고 반전이다');
  assert.equal(stripDashes('— 인용으로 시작\n끝나는 줄 —'), '인용으로 시작\n끝나는 줄');
  assert.equal(stripDashes('A – B'), 'A, B');
});

test('stripDashes leaves numbers, minus signs, code and links alone', () => {
  const kept = '- **코스피** 6,023.66 (−10.84%) → 하락\n목표금리 3.75–4.00%\n`a — b` 와 https://example.com/a—b';
  assert.equal(stripDashes(kept), kept);
  assert.ok(!/[—]/.test(stripDashes('x — y — z')));
});

test('both briefs ban dashes in the prompt and run the check before publishing', async () => {
  for (const file of ['lib/briefs/global.js', 'lib/briefs/korea-close.js']) {
    const src = await readFile(path.join(ROOT, file), 'utf8');
    assert.match(src, /em dash\(—\)와 en dash\(–\) 금지/, file);
    assert.match(src, /withDisclaimer\(stripDashes\(checked\.body\)\)/, file);
    const prompt = src.slice(src.indexOf('const SYSTEM_PROMPT'), src.indexOf('async function notifyTelegram'));
    assert.equal((prompt.match(/—/g) || []).length, 1, `${file}: the only dash left in the prompt is the rule naming it`);
  }
});
