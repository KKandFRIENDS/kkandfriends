import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner writing surfaces expose Lounge, KK Original, KK Daily and KK Weekly consistently', async () => {
  const [thoughts, lounge, original, review] = await Promise.all([
    read('thoughts.html'), read('write.html'), read('write-original.html'), read('admin-editorial.html'),
  ]);
  for (const html of [lounge, original]) {
    assert.match(html, /\/write-desk\?series=daily/);
    assert.match(html, /\/write-desk\?series=weekly/);
  }
  assert.match(thoughts, /id="owner-write-actions"/);
  assert.match(review, /KK Daily 글쓰기/);
  assert.match(review, /KK Weekly 글쓰기/);
});

test('manual desk editor writes free-format Daily/Weekly that the server accepts', async () => {
  // 2026-10-02 KK: Daily is a short free-prose update, Weekly wraps up that
  // week's dailies. The automated pipeline keeps its fixed headings (core.js).
  const [editor, server, core] = await Promise.all([read('js/desk-editor.js'), read('server/src/routes/editorial.js'), read('research-lab/src/desk/core.js')]);
  assert.match(editor, /format: 'free'/);
  assert.match(editor, /\[600, 6000\] : \[300, 1000\]/);
  assert.match(server, /daily: \[300, 1000\], weekly: \[600, 6000\]/);
  assert.match(editor, /이번 주 Daily 불러오기/);
  for (const heading of ['핵심 판단', '관찰 지표', '이번 주 핵심', '다음 주 관찰 항목']) assert.match(core, new RegExp(heading));
});
