import assert from 'node:assert/strict';
import test from 'node:test';

import { dateOnly, displayDate } from '../js/date-format.js';

test('database timestamps display as calendar dates only', () => {
  assert.equal(dateOnly('2026-09-24T00:00:00.000Z'), '2026-09-24');
  assert.equal(displayDate('2026-09-24T00:00:00.000Z'), '2026. 9. 24.');
  assert.equal(displayDate('2026-01-05'), '2026. 1. 5.');
});

test('editorial lists use the shared date-only formatter', async () => {
  const { readFile } = await import('node:fs/promises');
  const [admin, editor, desk] = await Promise.all([
    readFile(new URL('../js/editorial-admin.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/desk-editor.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/desk.js', import.meta.url), 'utf8'),
  ]);
  for (const source of [admin, editor, desk]) assert.match(source, /displayDate/);
  assert.doesNotMatch(admin, /`\$\{(?:run|draft)\.edition_date\}/);
  assert.doesNotMatch(editor, /esc\(d\.edition_date\)/);
});
