import { getClient, signInWithGoogle } from './auth.js';
const $ = id => document.getElementById(id);
const el = (tag, text, parent) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; parent?.append(node); return node; };
let token, drafts = [], selected, busy = false;
async function api(body) {
  const r = await fetch('/api/editorial', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || '요청 실패'); return data;
}
const labels = { awaiting_approval: '승인 대기', approved: '승인 완료', rejected: '보류', published: '발행 완료' };
async function refresh() {
  if (busy) return;
  try {
    const session = await getClient()?.auth.getSession(); token = session?.data?.session?.access_token;
    $('login').hidden = Boolean(token);
    if (!token) { $('status').textContent = '관리자 계정으로 로그인하세요.'; return; }
    const data = await api(); drafts = data.drafts;
    $('drafts').replaceChildren(); $('runs').replaceChildren();
    for (const run of data.runs) el('p', `${run.edition_date} · ${run.status} · ${run.detail?.reason || `${run.detail?.retrieved ?? '—'}개 원문 확인`}`, $('runs'));
    for (const draft of drafts) { const button = el('button', `${draft.edition_date} · ${labels[draft.status]}\n${draft.payload.content.title}`, $('drafts')); button.dataset.id = draft.id; button.onclick = () => render(drafts.find(d => d.id === draft.id)); }
    const next = drafts.find(d => d.id === selected?.id) || drafts[0]; if (next) render(next);
    $('status').textContent = drafts.length ? '검토할 글을 선택하세요.' : '아직 생성된 초안이 없습니다.';
  } catch (e) { $('status').textContent = e.message; }
}
function render(draft) {
  selected = draft;
  drafts = drafts.map(d => d.id === draft.id ? draft : d);
  for (const button of $('drafts').querySelectorAll('button')) if (button.dataset.id === draft.id) button.textContent = `${draft.edition_date} · ${labels[draft.status]}\n${draft.payload.content.title}`;
  const root = $('review'); root.replaceChildren();
  const p = draft.payload;
  el('p', `${p.desk.label} · ${labels[draft.status]} · 버전 ${draft.version}`, root).className = 'eyebrow';
  el('p', '자동 검수는 출처의 진실성이나 인과관계를 보증하지 않습니다. 원자료·숫자·표현·이해상충을 직접 확인하세요.', root).className = 'notice';
  const fields = [];
  function field(label, value, multiline = false) { const id = `field-${fields.length}`; const l = el('label', label, root); l.htmlFor = id; const input = el(multiline ? 'textarea' : 'input', undefined, root); if (!multiline) input.type = 'text'; input.id = id; input.value = value; input.disabled = draft.status === 'published'; fields.push(input); return input; }
  const title = field('제목', p.content.title); const summary = field('짧은 소개', p.content.summary);
  const sections = p.content.sections.map(section => ({ ...section, input: field(section.heading, section.text, true) }));
  const top = el('details', undefined, root); el('summary', '후보 평가와 선정 이유', top);
  for (const c of p.top5) el('p', `${c.id === p.selectedId ? '선정 · ' : ''}${c.title} (${c.score})\n${c.reason}\n${c.reasons.join(', ')}`, top);
  const evidence = el('details', undefined, root); evidence.open = true; el('summary', '근거와 원자료', evidence);
  for (const c of p.evidence) { const box = el('div', undefined, evidence); box.className = 'evidence'; el('p', c.statement, box); el('blockquote', c.quote, box); el('small', `${c.asOf} · ${c.unit}`, box); const s = p.sources.find(s => s.id === c.sourceId); if (s) sourceLink(s, box); }
  const sources = el('details', undefined, root); el('summary', '전체 출처 및 검수 결과', sources);
  for (const s of p.sources) sourceLink(s, sources);
  el('p', `검사: ${p.qa.checks.join(', ')}\n모델 검수: ${p.qa.modelReview?.passed ? '통과' : '수정 후 관리자 재검토 필요'}`, sources);
  const checkedLabel = el('label', undefined, root); const checked = el('input', undefined, checkedLabel); checked.type = 'checkbox'; checkedLabel.append(' 원자료·숫자·견해·이해상충을 확인했습니다.');
  const actions = el('div', undefined, root); actions.className = 'actions';
  function currentContent() { return { ...p.content, title: title.value, summary: summary.value, sections: sections.map(({ input, ...s }) => ({ ...s, text: input.value })) }; }
  function dirty() { return JSON.stringify(currentContent()) !== JSON.stringify(p.content); }
  async function action(kind) {
    if (busy) return;
    if (kind !== 'revise' && dirty()) { $('status').textContent = '수정한 내용을 먼저 저장하세요. 저장하면 기존 승인이 해제됩니다.'; return; }
    busy = true; actions.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      token = (await getClient().auth.getSession()).data.session?.access_token;
      const data = await api({ id: draft.id, version: draft.version, action: kind, reviewed: checked.checked, ...(kind === 'revise' ? { content: currentContent() } : {}) });
      render(data.draft);
      if (kind === 'publish') {
        const result = await fetch(`/api/desk?slug=${encodeURIComponent(draft.id)}`, { cache: 'no-store' });
        if (!result.ok || !(await result.json()).articles?.some(a => a.slug === draft.id)) throw new Error('발행은 저장됐지만 공개 페이지 확인에 실패했습니다. 새로고침 후 확인하세요.');
      }
      $('status').textContent = kind === 'publish' ? '발행 완료 — 공개 API 응답까지 확인했습니다.' : '저장했습니다.';
    } catch (e) { $('status').textContent = e.message; actions.querySelectorAll('button').forEach(b => b.disabled = false); }
    finally { busy = false; }
  }
  if (draft.status !== 'published') {
    el('button', '수정 저장 · 재승인', actions).onclick = () => action('revise');
    if (draft.status === 'awaiting_approval') el('button', '승인', actions).onclick = () => action('approve');
    if (draft.status === 'approved') { const b = el('button', '사이트에 발행', actions); b.className = 'primary'; b.onclick = () => action('publish'); }
    if (draft.status !== 'rejected') el('button', '보류', actions).onclick = () => action('reject');
  } else { const a = el('a', '공개 글 보기 →', actions); a.href = `/desk?slug=${encodeURIComponent(draft.id)}`; }
}
function sourceLink(s, parent) { const p = el('p', undefined, parent); const a = el('a', s.title, p); if (/^https:\/\//.test(s.url)) a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
$('login').onclick = () => signInWithGoogle(); $('refresh').onclick = refresh; refresh();
