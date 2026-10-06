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
  // js/desk.js only forwards to the lounge since 2026-10-06; it lists nothing.
  const editor = await readFile(new URL('../js/desk-editor.js', import.meta.url), 'utf8');
  assert.match(editor, /displayDate/);
  assert.doesNotMatch(editor, /esc\(d\.edition_date\)/);
});
