// Pre-publish dash warning in the KK Original and Daily/Weekly editors (2026-11-07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findDashes, dashConfirmText, confirmDashes } from '../js/dash-check.js';

test('finds em dashes and spaced en dashes, by field', () => {
  const found = findDashes({ 제목: '금리 — 중력', 요약: '없음', 본문: '하나 – 둘. 셋 — 넷' });
  assert.equal(found.total, 3);
  assert.deepEqual(found.parts, ['제목 1곳', '본문 2곳']);
  assert.ok(found.examples.length >= 2 && found.examples.length <= 3);
});

test('leaves number ranges, minus signs and hyphens alone', () => {
  assert.equal(findDashes({ 본문: '3.75–4.00% 구간, 코스피 −1.2%, 2026-11-07, AI-native' }), null);
});

test('clean text needs no question; a dash asks, and the answer decides', () => {
  let asked = 0;
  assert.equal(confirmDashes({ 본문: '쉼표로 썼다.' }, () => { asked++; return false; }), true);
  assert.equal(asked, 0);
  assert.equal(confirmDashes({ 본문: 'A — B' }, () => false), false);
  assert.equal(confirmDashes({ 본문: 'A — B' }, () => true), true);
});

test('the warning names the count and allows quoted source titles', () => {
  const text = dashConfirmText(findDashes({ 본문: 'A — B' }));
  assert.match(text, /1곳/);
  assert.match(text, /인용한 출처 제목/);
});

test('both editors check before publishing', () => {
  for (const file of ['js/original-editor.js', 'js/desk-editor.js']) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /import \{ confirmDashes \} from '\/js\/dash-check\.js'/, file);
    assert.match(src, /confirmDashes\(/, file);
  }
});
