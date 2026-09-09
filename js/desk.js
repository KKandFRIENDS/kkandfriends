const $ = id => document.getElementById(id);
const el = (tag, text, parent) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; parent?.append(n); return n; };
let articles = [];
function link(label, url, parent) { const a = el('a', label, parent); if (/^https:\/\//.test(url) || /^\/(?!\/)/.test(url)) a.href = url; return a; }
function list() {
  $('articles').replaceChildren();
  const visible = articles.filter(a => ($('series').value === 'all' || a.desk.series === $('series').value) && ($('topic').value === 'all' || a.desk.topic === $('topic').value));
  for (const a of visible) { const card = el('article', undefined, $('articles')); card.className = 'card'; el('p', `${a.desk.label} · ${a.date}`, card).className = 'eyebrow'; link(a.content.title, `/desk?slug=${encodeURIComponent(a.slug)}`, el('h2', undefined, card)); el('p', a.content.summary, card); }
  $('status').textContent = visible.length ? `${visible.length}편` : '아직 발행된 글이 없습니다.';
}
function article(a) {
  $('intro').hidden = true; $('articles').className = 'article'; $('status').textContent = '';
  document.title = `${a.content.title} · KK & Friends`;
  const root = $('articles'); link('← 전체 글', '/desk', root); el('p', `${a.desk.label} · ${a.date}`, root).className = 'eyebrow'; el('h1', a.content.title, root); el('p', a.content.summary, root).className = 'meta';
  for (const section of a.content.sections) { const node = el('section', undefined, root); el('h2', section.heading, node); el('p', section.text, node); for (const id of section.sourceIds) { const source = a.sources.find(s => s.id === id); if (source) { link(`[${a.sources.indexOf(source) + 1}] ${source.title}`, source.url, node); node.append(' '); } } }
  el('p', 'By KK · Chief of KKandFriends', root); el('p', '공개 자료에 기반한 시장 관점이며 개별 투자 권유가 아닙니다.', root).className = 'meta';
  if (a.related.length) { el('h2', '관련 KK 글', root); for (const r of a.related) link(r.title, r.url, el('p', undefined, root)); }
}
try { const slug = new URLSearchParams(location.search).get('slug'); const r = await fetch(`/api/desk${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`); if (!r.ok) throw new Error(r.status === 404 ? '글을 찾을 수 없습니다.' : '글을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'); articles = (await r.json()).articles; if (slug) article(articles[0]); else list(); } catch(e) { $('status').textContent = e.message; }
$('series').onchange = list; $('topic').onchange = list;
