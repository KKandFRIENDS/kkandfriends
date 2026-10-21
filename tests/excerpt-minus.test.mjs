import assert from 'node:assert/strict';
import test from 'node:test';
import { excerpt } from '../js/markdown.js';

// 2026-10-22 site review: excerpt() turned every "-" into a space, so a list card or meta description
// read "나스닥 26,424.82( 0.02%)" and "코스피 5,552.74( 3.73%)": a fall looked like a rise.
test('excerpt keeps minus signs and dates', () => {
  const text = excerpt('나스닥 26,424.82 (-0.02%)로 제자리였고 코스피는 5,552.74(-3.73%)로 밀렸다. 2026-10-16 기준.');
  assert.match(text, /\(-0\.02%\)/);
  assert.match(text, /\(-3\.73%\)/);
  assert.match(text, /2026-10-16/);
});

test('excerpt still drops markdown bullets, rules, headings and emphasis', () => {
  const body = '간밤 요약.\n\n## 숫자\n- **S&P 500** 7,744.06 (+0.33%) → 올랐다\n- **코스피** 5,554.22 (-7.57%) → 빠졌다\n\n---\n\n> 인용';
  const text = excerpt(body, 400);
  assert.equal(text, '간밤 요약. 숫자 S&P 500 7,744.06 (+0.33%) → 올랐다 코스피 5,554.22 (-7.57%) → 빠졌다 인용');
  assert.ok(!/(^|\s)-\s/.test(text), 'no stray bullet hyphens');
});

test('excerpt still truncates', () => {
  assert.equal(excerpt('가'.repeat(30), 10), `${'가'.repeat(10)}…`);
});
