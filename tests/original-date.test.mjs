import assert from 'node:assert/strict';
import test from 'node:test';
import { originalDate, publicOriginal, renderOriginalPage, seoulDay } from '../lib/original-render.js';

// 2026-10-22 (KK): an original published at 07:45 KST (22:45 UTC the day before) showed
// "2026. 10. 21." because the UTC timestamp was cut to its first ten characters.
test('the shown day is the Seoul day, not the UTC day', () => {
  assert.equal(seoulDay('2026-10-21T22:45:51.211Z'), '2026-10-22');
  assert.equal(seoulDay('2026-10-21T14:59:59Z'), '2026-10-21', '23:59:59 KST is still the 21st');
  assert.equal(seoulDay('2026-10-21T15:00:00Z'), '2026-10-22', 'midnight KST starts the 22nd');
  assert.equal(seoulDay('2026-10-22'), '2026-10-22', 'a plain date is left alone');
  assert.equal(seoulDay('not a date'), 'not a date');
});

test('originalDate prefers published_at, then updated_at, then created_at', () => {
  const stamp = '2026-10-21T22:45:51.211Z';
  assert.equal(originalDate({ published_at: stamp, updated_at: '2026-10-25T00:00:00Z' }), '2026-10-22');
  assert.equal(originalDate({ updated_at: stamp }), '2026-10-22');
  assert.equal(originalDate({ created_at: stamp }), '2026-10-22');
  assert.equal(originalDate({}), '');
});

test('the published page and the list API show the same Seoul day', () => {
  const row = { slug: 'x', title: '제목', summary: '요약', body: '본문', category: 'Macro', published_at: '2026-10-21T22:45:51.211Z' };
  assert.equal(publicOriginal(row).date, '2026-10-22');
  const html = renderOriginalPage(publicOriginal(row, { includeBody: true }));
  assert.match(html, /2026\. 10\. 22\. · By KK/);
  assert.match(html, /article:published_time" content="2026-10-21T22:45:51\.211Z"/, 'the exact timestamp stays UTC for search engines');
});
