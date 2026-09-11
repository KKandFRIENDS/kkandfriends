// /desk — the DAILY DESK / KK WEEKLY index.
//
// Individual editions are no longer painted here: they are server-rendered at
// /desk/<slug> so each one carries its own title, description and canonical URL
// (see api/desk-page.js). This file lists and filters; it does not render
// articles. Links already shared as /desk?slug=… are redirected to the
// canonical path below so nothing posted in a chat room goes dead.
const $ = id => document.getElementById(id);
const el = (tag, text, parent) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; parent?.append(n); return n; };
let articles = [];
function link(label, url, parent) { const a = el('a', label, parent); if (/^https:\/\//.test(url) || /^\/(?!\/)/.test(url)) a.href = url; return a; }
function list() {
  $('articles').replaceChildren();
  const visible = articles.filter(a => ($('series').value === 'all' || a.desk.series === $('series').value) && ($('topic').value === 'all' || a.desk.topic === $('topic').value));
  for (const a of visible) { const card = el('article', undefined, $('articles')); card.className = 'card'; el('p', `${a.desk.label} · ${a.date}`, card).className = 'eyebrow'; link(a.content.title, `/desk/${encodeURIComponent(a.slug)}`, el('h2', undefined, card)); el('p', a.content.summary, card); }
  $('status').textContent = visible.length ? `${visible.length}편` : '아직 발행된 글이 없습니다.';
}
const params = new URLSearchParams(location.search);
const legacySlug = params.get('slug');
if (legacySlug && /^[\w-]{1,64}$/.test(legacySlug)) {
  location.replace(`/desk/${encodeURIComponent(legacySlug)}`);
} else {
  const requestedSeries = params.get('series');
  const requestedTopic = params.get('topic');
  if ([...$('series').options].some(option => option.value === requestedSeries)) $('series').value = requestedSeries;
  if ([...$('topic').options].some(option => option.value === requestedTopic)) $('topic').value = requestedTopic;
  try {
    const r = await fetch('/api/desk');
    if (!r.ok) throw new Error('글을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');
    articles = (await r.json()).articles;
    list();
  } catch(e) { $('status').textContent = e.message; }
  $('series').onchange = list; $('topic').onchange = list;
}
