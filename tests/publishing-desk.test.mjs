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
  // The separate review screen was removed (2026-10-05): old links forward to /write-desk.
  assert.match(review, /location\.replace/);
  assert.match(review, /\/write-desk\?id=/);
});

test('manual desk editor writes free-format Daily/Weekly that the server accepts', async () => {
  // 2026-10-02 KK: Daily is a short free-prose update, Weekly wraps up that
  // week's dailies. The automated pipeline keeps its fixed headings (core.js).
  const [editor, server, core] = await Promise.all([read('js/desk-editor.js'), read('server/src/routes/editorial.js'), read('research-lab/src/desk/core.js')]);
  assert.match(editor, /format: 'free'/);
  assert.match(editor, /\[600, 6000\] : \[300, 1000\]/);
  assert.match(server, /daily: \[300, 1000\], weekly: \[600, 6000\]/);
  assert.match(editor, /이번 주 Daily 불러오기/);
  // Publishing happens on the writing page: save → approve → publish in one click.
  for (const action of ["'revise'", "'update'", "action: 'approve'", "action: 'publish'"]) assert.ok(editor.includes(action), action);
  // Saved drafts (auto, manual, published) can change every field, sources included.
  assert.doesNotMatch(editor, /readOnly = true/);
  assert.match(server, /action === 'update'/);
  assert.match(server, /export function editionDay/);
  assert.doesNotMatch(editor, /href="\/admin-editorial/);
  for (const heading of ['핵심 판단', '관찰 지표', '이번 주 핵심', '다음 주 관찰 항목']) assert.match(core, new RegExp(heading));
});

test('published KK Daily/Weekly pages offer the Chief a way back into the editor', async () => {
  const { renderDeskPage } = await import('../lib/desk-render.js');
  const html = renderDeskPage({ slug: '2026-10-05-macro', date: '2026-10-05', desk: { id: 'macro', label: 'MACRO MONDAY', series: 'DAILY DESK' },
    content: { format: 'free', title: '제목', summary: '요약', sections: [{ heading: '', text: '본문', sourceIds: [] }] }, sources: [], related: [] });
  assert.match(html, /data-desk-edit="2026-10-05-macro"/);
  assert.match(html, /<script type="module" src="\/js\/original-edit-link\.js"><\/script>/);
  const link = await read('js/original-edit-link.js');
  assert.match(link, /if \(!isAdmin\(user\)\) return;/, 'readers must never see the edit link');
  assert.match(link, /\/write-desk\?id=/);
});
