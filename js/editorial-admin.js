import { currentUser, signInWithGoogle } from './auth-vps.js';
import { displayDate } from './date-format.js';
import { API_URL } from '/config.js';
const $ = id => document.getElementById(id);
const el = (tag, text, parent) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; parent?.append(node); return node; };
let drafts = [], selected, busy = false;
async function api(body) {
  const r = await fetch(`${API_URL}/api/v1/editorial`, { method: body ? 'POST' : 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || '요청 실패'); return data;
}
// Keep in sync with FREE_LENGTH in server/src/routes/editorial.js.
const FREE_LENGTH = { daily: [300, 1000], weekly: [600, 6000] };
const labels = { awaiting_approval: '승인 대기', approved: '승인 완료', rejected: '보류', published: '발행 완료' };
async function refresh() {
  if (busy) return;
  try {
    const user = await currentUser();
    $('login').hidden = Boolean(user);
    if (!user) { $('status').textContent = '관리자 계정으로 로그인하세요.'; return; }
    const data = await api(); drafts = data.drafts;
    $('drafts').replaceChildren(); $('runs').replaceChildren();
    for (const run of data.runs) el('p', `${displayDate(run.edition_date)} · ${run.status} · ${run.detail?.reason || `${run.detail?.retrieved ?? '—'}개 원문 확인`}`, $('runs'));
    for (const draft of drafts) { const button = el('button', `${displayDate(draft.edition_date)} · ${labels[draft.status]}\n${draft.payload.content.title}`, $('drafts')); button.dataset.id = draft.id; button.onclick = () => render(drafts.find(d => d.id === draft.id)); }
    // Open only what was asked for (?id=, from /write-desk) or, without ?id=,
    // the newest draft still waiting on a decision. Never fall back to an
    // unrelated draft: an old 보류 or published edition opened by default
    // looked like the wrong article.
    const wanted = selected?.id || new URLSearchParams(location.search).get('id');
    const actionable = drafts.find(d => d.status === 'awaiting_approval' || d.status === 'approved');
    const next = wanted ? drafts.find(d => d.id === wanted) : actionable;
    if (next) render(next); else $('review').replaceChildren();
    $('status').textContent = !drafts.length ? '아직 생성된 초안이 없습니다.'
      : wanted && !next ? `${wanted.slice(0, 10)} 초안이 아직 없습니다. KK Daily · KK Weekly 글쓰기에서 '검토 초안 생성'을 먼저 누르세요. 다른 글은 왼쪽 목록에서 고를 수 있습니다.`
      : !next ? '승인 대기 중인 초안이 없습니다. 다른 글은 왼쪽 목록에서 고르세요.'
      : '검토할 글을 선택하세요.';
  } catch (e) { $('status').textContent = e.message; }
}
// asFree: show an old fixed-heading draft (made by the Desk before the free
// format) as one KK Daily/Weekly body. Nothing changes on the server until
// '수정 저장' sends it back as a free-format revision.
function render(draft, { asFree = false } = {}) {
  selected = draft;
  drafts = drafts.map(d => d.id === draft.id ? draft : d);
  for (const button of $('drafts').querySelectorAll('button')) {
    const current = button.dataset.id === draft.id; button.setAttribute('aria-current', String(current));
    if (current) button.textContent = `${displayDate(draft.edition_date)} · ${labels[draft.status]}\n${draft.payload.content.title}`;
  }
  const root = $('review'); root.replaceChildren();
  const p = draft.payload;
  el('p', `${p.desk.label} · ${labels[draft.status]} · 버전 ${draft.version}`, root).className = 'eyebrow';
  el('p', '자동 검수는 출처의 진실성이나 인과관계를 보증하지 않습니다. 원자료·숫자·표현·이해상충을 직접 확인하세요.', root).className = 'notice';
  const fields = [];
  function field(label, value, multiline = false) { const id = `field-${fields.length}`; const l = el('label', label, root); l.htmlFor = id; const input = el(multiline ? 'textarea' : 'input', undefined, root); if (!multiline) input.type = 'text'; input.id = id; input.value = value; input.disabled = draft.status === 'published'; fields.push(input); return input; }
  const title = field('제목', p.content.title); const summary = field('짧은 소개', p.content.summary);
  const free = p.content.format === 'free' || asFree;
  const editable = draft.status !== 'published';
  const allSourceIds = [...new Set(p.content.sections.flatMap(s => s.sourceIds || []))];
  let sections = [], body = null;
  if (free) {
    const text = p.content.format === 'free' ? p.content.sections[0]?.text || '' : p.content.sections.map(s => s.text.trim()).filter(Boolean).join('\n\n');
    body = field('본문 (소제목 없는 자유 형식)', text, true); body.rows = 16;
    const [min, max] = FREE_LENGTH[p.desk.id === 'weekly' ? 'weekly' : 'daily'];
    const count = el('p', '', root); count.className = 'meta';
    const sync = () => { const n = [...body.value].length; count.textContent = `본문 ${n.toLocaleString()}자 · 기준 ${min.toLocaleString()}–${max.toLocaleString()}자${n < min ? ' — 더 써야 합니다' : n > max ? ' — 줄여야 저장됩니다' : ''}`; };
    body.addEventListener('input', sync); sync();
  } else {
    sections = p.content.sections.map(section => ({ ...section, input: field(section.heading || '본문', section.text, true) }));
    if (editable) {
      const box = el('div', undefined, root); box.className = 'notice';
      el('p', '이 초안은 예전 고정 목차(핵심 판단·확인된 사실…) 형식입니다. KK Daily 글쓰기와 같은 소제목 없는 자유 형식으로 바꿀 수 있습니다.', box);
      el('button', 'KK Daily 형식(자유 본문)으로 바꾸기', box).onclick = () => render(draft, { asFree: true });
    }
  }
  if (asFree) {
    const box = el('div', undefined, root); box.className = 'notice';
    el('p', '아직 저장되지 않았습니다. 본문을 다듬은 뒤 \'수정 저장 · 재승인\'을 누르면 자유 형식으로 바뀝니다. 소제목은 빠지고 문단만 남습니다.', box);
    el('button', '되돌리기 (고정 목차로)', box).onclick = () => render(draft);
  }
  const top = el('details', undefined, root); el('summary', '후보 평가와 선정 이유', top);
  for (const c of p.top5) el('p', `${c.id === p.selectedId ? '선정 · ' : ''}${c.title} (${c.score})\n${c.reason}\n${c.reasons.join(', ')}`, top);
  const evidence = el('details', undefined, root); evidence.open = true; evidence.hidden = !p.evidence.length; el('summary', '근거와 원자료', evidence);
  for (const c of p.evidence) { const box = el('div', undefined, evidence); box.className = 'evidence'; el('p', c.statement, box); el('blockquote', c.quote, box); el('small', `${c.asOf} · ${c.unit}`, box); const s = p.sources.find(s => s.id === c.sourceId); if (s) sourceLink(s, box); }
  const sources = el('details', undefined, root); sources.open = !p.evidence.length; el('summary', '전체 출처 및 검수 결과', sources);
  for (const s of p.sources) sourceLink(s, sources);
  el('p', `검사: ${p.qa.checks.join(', ')}\n모델 검수: ${p.qa.modelReview?.passed ? '통과' : '수정 후 관리자 재검토 필요'}`, sources);
  const notes = Array.isArray(p.qa.modelReview?.notes) ? p.qa.modelReview.notes : [];
  if (notes.length) { const memo = el('details', undefined, root); memo.open = true; el('summary', `편집 검수 메모 ${notes.length}건 (발행 전 확인)`, memo); for (const note of notes) el('p', `· ${note}`, memo); }
  const checkedLabel = el('label', undefined, root); const checked = el('input', undefined, checkedLabel); checked.type = 'checkbox'; checkedLabel.append(' 원자료·숫자·견해·이해상충을 확인했습니다.');
  const replacement = draft.status === 'rejected' ? field('보류 초안 근거 묶음 교체(JSON)', '', true) : null;
  if (replacement) replacement.placeholder = '검증을 통과한 전체 payload JSON';
  const actions = el('div', undefined, root); actions.className = 'actions';
  const note = el('p', '', root); note.className = 'action-note'; note.setAttribute('role', 'status');
  const say = text => { $('status').textContent = text; const current = $('review').querySelector('.action-note'); if (current) current.textContent = text; };
  function currentContent() {
    if (free) return { ...p.content, format: 'free', title: title.value, summary: summary.value, sections: [{ heading: '', text: body.value.trim(), sourceIds: allSourceIds }], relatedUrls: p.content.relatedUrls || [] };
    return { ...p.content, title: title.value, summary: summary.value, sections: sections.map(({ input, ...s }) => ({ ...s, text: input.value })) };
  }
  // Compare with what the fields showed on load, not the raw payload: the browser
  // normalises some text (\r\n in textareas, newlines in inputs), which would
  // otherwise make an untouched draft look edited and silently block approval.
  // A pending conversion is always unsaved, even before any typing.
  const loaded = asFree ? null : JSON.stringify(currentContent());
  function dirty() { return loaded === null || JSON.stringify(currentContent()) !== loaded; }
  async function action(kind, replacementPayload) {
    if (busy) return;
    if (kind !== 'revise' && dirty()) { say('수정한 내용을 먼저 저장하세요. 저장하면 기존 승인이 해제됩니다.'); return; }
    busy = true; actions.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      const data = await api({ id: draft.id, version: draft.version, action: kind, reviewed: checked.checked, ...(kind === 'revise' ? { content: currentContent() } : {}), ...(kind === 'replace' ? { payload: replacementPayload } : {}) });
      render(data.draft);
      if (kind === 'publish') {
        const result = await fetch(`/api/desk?slug=${encodeURIComponent(draft.id)}`, { cache: 'no-store' });
        if (!result.ok || !(await result.json()).articles?.some(a => a.slug === draft.id)) throw new Error('발행은 저장됐지만 공개 페이지 확인에 실패했습니다. 새로고침 후 확인하세요.');
      }
      say(kind === 'publish' ? '발행 완료 — 공개 API 응답까지 확인했습니다.' : '저장했습니다.');
    } catch (e) { say(e.message); actions.querySelectorAll('button').forEach(b => b.disabled = false); }
    finally { busy = false; }
  }
  if (draft.status !== 'published') {
    el('button', '수정 저장 · 재승인', actions).onclick = () => action('revise');
    if (replacement) {
      el('button', '근거 묶음 교체 · 재승인', actions).onclick = () => {
        try { action('replace', JSON.parse(replacement.value)); }
        catch { say('근거 묶음 JSON 형식을 확인하세요.'); }
      };
    }
    if (draft.status === 'awaiting_approval') {
      const approve = el('button', '승인', actions); approve.onclick = () => action('approve');
      const sync = () => { approve.disabled = !checked.checked; approve.title = checked.checked ? '' : '위 확인란에 체크하면 승인할 수 있습니다.'; };
      checked.addEventListener('change', sync); sync();
    }
    if (draft.status === 'approved') { const b = el('button', '사이트에 발행', actions); b.className = 'primary'; b.onclick = () => action('publish'); }
    if (draft.status !== 'rejected') el('button', '보류', actions).onclick = () => action('reject');
  } else { const a = el('a', '공개 글 보기 →', actions); a.href = `/desk?slug=${encodeURIComponent(draft.id)}`; }
}
function sourceLink(s, parent) { const p = el('p', undefined, parent); const a = el('a', s.title, p); if (/^https:\/\//.test(s.url)) a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
$('login').onclick = () => signInWithGoogle(location.pathname + location.search); $('refresh').onclick = refresh; refresh();
