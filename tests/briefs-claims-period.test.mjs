import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { findUnsupportedClaims } from '../lib/briefs/claims.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// 2026-10-15 dry run: the Korea close said "6개월 만의 최저" and "어제까지의 상승분을 통째로 반납"
// with no data behind either, and the claim guard did not catch the first.
test('claim guard finds period comparisons the data cannot back', () => {
  assert.deepEqual(findUnsupportedClaims('코스피가 6개월 만의 최저로 내려앉았다.'), ['6개월 만의 최저']);
  assert.deepEqual(findUnsupportedClaims('19년 만의 최고를 찍었다'), ['19년 만의 최고']);
  assert.deepEqual(findUnsupportedClaims('3일 만에 반등했다. 반년 만의 저점이다.'), ['3일 만에', '반년 만의 저점']);
});

test('claim guard still allows a one-day move and 52-week wording', () => {
  assert.deepEqual(findUnsupportedClaims('코스피가 하루 만에 7.57% 빠졌다.'), []);
  assert.deepEqual(findUnsupportedClaims('코스피가 52주 신고가를 경신했다.'), []);
  assert.deepEqual(findUnsupportedClaims('5분 만에 끝났다. 10시간 만에 열렸다.'), []);
});

test('both brief prompts keep arrow glosses to meaning and ban unprovided period comparisons', async () => {
  for (const file of ['lib/briefs/global.js', 'lib/briefs/korea-close.js']) {
    const src = await readFile(path.join(ROOT, file), 'utf8');
    assert.match(src, /화살표\(→\) 뒤 풀이로 원인이나 돈의 이동을 단정하는 것/, file);
    assert.match(src, /제공되지 않은 기간 비교/, file);
  }
});
