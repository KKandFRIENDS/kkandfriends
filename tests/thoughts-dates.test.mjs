import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = (file) => readFile(path.join(ROOT, file), 'utf8');

// THOUGHTS card dates use the same Korean form as everywhere else
// ("2026. 9. 25.", js/date-format.js) and must match the post's file name.
test('THOUGHTS cards show Korean-form dates that match the post file', async () => {
  const html = await source('thoughts.html');
  assert.doesNotMatch(html, /class="post-date">[A-Z][a-z]+ \d{1,2}, \d{4}</, 'English date left on a THOUGHTS card');
  const cards = [...html.matchAll(/<a class="post-card[^"]*" href="\/posts\/(\d{4})(\d{2})(\d{2})_[^"]*"[\s\S]*?<span class="post-date">([^<]*)<\/span>/g)];
  assert.ok(cards.length > 0, 'no static THOUGHTS cards found');
  for (const [, year, month, day, shown] of cards) {
    assert.equal(shown, `${year}. ${Number(month)}. ${Number(day)}.`);
  }
});
