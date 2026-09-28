import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const source = (file) => readFile(path.join(root, file), 'utf8');

test('KKF backup runs nightly and restore-tests weekly, clear of the Hermes jobs', async () => {
  const cron = await source('ops/backup/kkf-backup.cron');
  // 04:10 KST daily = 19:10 UTC; weekly verify Mon 04:40 KST = Sun 19:40 UTC.
  assert.match(cron, /^10 19 \* \* \* root \/usr\/local\/sbin\/kkf-backup --apply /m);
  assert.match(cron, /^40 19 \* \* 0 root \/usr\/local\/sbin\/kkf-backup --verify /m);
});

test('KKF backup never touches the Hermes scripts and verifies before claiming success', async () => {
  const script = await source('ops/backup/kkf-backup.sh');
  assert.doesNotMatch(script, /hermes-ops\/backup/);
  assert.match(script, /set -Eeuo pipefail/);
  assert.match(script, /cmp -s "\$WORK\/set\.tar" "\$WORK\/check\.tar"/, 'encryption round trip');
  assert.match(script, /sha256sum --quiet -c SHA256SUMS/, 'corruption check on verify');
  assert.match(script, /--network none/, 'restore test runs without network');
  assert.match(script, /MODE=dry-run/, 'dry run is the default');
});
