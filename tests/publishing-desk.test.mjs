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
  // 2026-10-07 KK: both series take up to 10,000 characters.
  assert.match(editor, /\[600, 10000\] : \[300, 10000\]/);
  assert.match(server, /daily: \[300, 10000\], weekly: \[600, 10000\]/);
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

test('Daily/Weekly attachments are uploaded on /write-desk and listed under the article', async () => {
  const editor = await read('js/desk-editor.js');
  assert.match(editor, /uploadAttachment/);
  assert.match(editor, /attachments \}/);
  const { renderDeskPage } = await import('../lib/desk-render.js');
  const url = 'https://api.kkandfriends.com/uploads/2026/10/0b6f2c1e-1a2b-4c3d-8e9f-0123456789ab/report.pdf';
  const html = renderDeskPage({ slug: '2026-10-05-macro', date: '2026-10-05', desk: { id: 'macro', label: 'MACRO MONDAY', series: 'DAILY DESK' },
    content: { format: 'free', title: '제목', summary: '요약', sections: [{ heading: '', text: '본문', sourceIds: [] }],
      attachments: [{ name: '<b>리포트</b>.pdf', url, size: 2097152 }, { name: 'bad', url: 'javascript:alert(1)' }] }, sources: [], related: [] });
  assert.match(html, /<h2>첨부 파일<\/h2>/);
  assert.ok(html.includes(`<a href="${url}">&lt;b&gt;리포트&lt;/b&gt;.pdf (2.0MB)</a>`));
  assert.doesNotMatch(html, /javascript:/);
});

test('every writing screen can attach documents, not only images', async () => {
  const [lounge, original, helper, api] = await Promise.all([read('write.html'), read('js/original-editor.js'), read('js/attachments.js'), read('js/vps-api.js')]);
  for (const page of [lounge, original]) {
    assert.match(page, /from ["']\/js\/attachments\.js["']/);
    assert.match(page, /ATTACH_ACCEPT/);
  }
  for (const ext of ['pdf', 'docx', 'xlsx', 'pptx', 'hwp']) assert.match(helper, new RegExp(`\\b${ext}:`));
  assert.match(api, /X-File-Name/);
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

test('the Daily/Weekly editor has the KK Original layout (2026-11-05 KK request)', async () => {
  const editor = await read('js/desk-editor.js');
  assert.match(editor, /목록과 검색에 표시할 한 문단 요약/);
  assert.match(editor, /class="meta-grid"/);
  assert.match(editor, /분야 \(요일 주제\)/);
  assert.match(editor, /공개 주소/);
  for (const kind of ['h2', 'bold', 'italic', 'quote', 'ul', 'code']) assert.match(editor, new RegExp(`data-md="${kind}"`));
  assert.match(editor, /data-act="attach"/, 'the 이미지·파일 button opens the attachment picker');
  assert.doesNotMatch(editor, /data-md="link"/, 'the server rejects URLs in the body, so there is no link button');
  assert.match(editor, /renderMarkdown\(body\)/, 'the preview uses the same renderer as the article');
  assert.doesNotMatch(editor, /data-tags|id="tags"/, 'tags stay KK Original only');
});

test('a free Daily/Weekly body is rendered as safe Markdown on the article page', async () => {
  const { renderDeskPage } = await import('../lib/desk-render.js');
  const text = '## 소제목\n\n**굵게** 쓴 문장과 *기울임*.\n\n- 첫째\n- 둘째\n\n> 인용\n\n그냥 문단 & 기호 <script>';
  const html = renderDeskPage({ slug: '2026-11-05-ai', date: '2026-11-05', desk: { id: 'ai', label: 'AI THURSDAY', series: 'DAILY DESK' },
    content: { format: 'free', title: '제목', summary: '요약', sections: [{ heading: '', text, sourceIds: [] }] }, sources: [], related: [] });
  assert.match(html, /<section class="desk-body">/);
  assert.match(html, /<h3>소제목<\/h3>/);
  assert.match(html, /<strong>굵게<\/strong>/);
  assert.match(html, /<em>기울임<\/em>/);
  assert.match(html, /<ul><li>첫째<\/li><li>둘째<\/li><\/ul>/);
  assert.match(html, /<blockquote>인용<\/blockquote>/);
  assert.match(html, /그냥 문단 &amp; 기호 &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>(?!<)/);
});
