import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('an external uptime check watches the VPS API and the website from GitHub', async () => {
  const wf = await readFile(path.join(root, '.github/workflows/uptime.yml'), 'utf8');
  assert.match(wf, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(wf, /https:\/\/api\.kkandfriends\.com\/health/);
  assert.match(wf, /https:\/\/www\.kkandfriends\.com\//);
  assert.match(wf, /secrets\.TELEGRAM_BOT_TOKEN/);
  // Alerts only on a state change, so an outage does not spam the chat.
  assert.match(wf, /\[ "\$PREV" != "failure" \]/);
  assert.match(wf, /\[ "\$PREV" = "failure" \]/);
});
