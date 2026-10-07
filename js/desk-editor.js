import { isConfigured, currentUser, signInButtonsHtml, wireSignIn, isAdmin, esc } from '/js/auth-vps.js';
import { displayDate } from '/js/date-format.js';
import { API_URL } from '/config.js';

const DAILY_SECTIONS = ['핵심 판단', '확인된 사실', '시장의 해석', '검토할 관점', '반론', '관찰 지표'];
const WEEKLY_SECTIONS = ['이번 주 핵심', '거시경제', '금융시장', 'Bitcoin', 'AI', '주요 논쟁', '한국', '종합 판단', '다음 주 관찰 항목'];
const DESK_IDS = ['weekly', 'macro', 'markets', 'bitcoin', 'ai', 'signals', 'korea'];
const DAY_LABELS = ['KK WEEKLY', 'MACRO MONDAY', 'MARKETS TUESDAY', 'BITCOIN WEDNESDAY', 'AI THURSDAY', 'SIGNAL FRIDAY', 'KOREA SATURDAY'];
const root = document.getElementById('root');
// ?id=2026-10-05-macro opens that edition (links from Telegram and the old
// /admin-editorial review screen land here).
const wantedId = (new URLSearchParams(location.search).get('id') || '').match(/^(\d{4}-\d{2}-\d{2})-(weekly|macro|markets|bitcoin|ai|signals|korea)$/);
let series = wantedId ? (wantedId[2] === 'weekly' ? 'weekly' : 'daily') : new URLSearchParams(location.search).get('series') === 'weekly' ? 'weekly' : 'daily';
let drafts = [];
// The saved draft for the chosen date, if any. Only one draft per date is
// allowed, so when the morning Desk already made one, this page edits it.
let current = null;

boot();
async function boot() {
  if (!isConfigured()) return showError('회원 시스템이 아직 연결되지 않았습니다.');
  const user = await currentUser();
  if (!user) {
    root.innerHTML = `<div class="card center stack"><h2>Chief 로그인이 필요합니다</h2>${signInButtonsHtml()}</div>`;
    wireSignIn(root, location.href); return;
  }
  if (!isAdmin(user)) return showError('DAILY · WEEKLY 편집실은 Chief 계정만 사용할 수 있습니다.');
  try { drafts = (await editorialApi()).drafts || []; } catch { drafts = []; }
  render();
}

function showError(message) { root.innerHTML = `<div class="banner error">${esc(message)}</div>`; }
function kstToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()); }
function alignedDate(kind) {
  const base = new Date(`${kstToday()}T00:00:00Z`); const day = base.getUTCDay();
  const offset = kind === 'weekly' ? (7 - day) % 7 : day === 0 ? 1 : 0;
  base.setUTCDate(base.getUTCDate() + offset); return base.toISOString().slice(0, 10);
}
function dayOf(date) { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
// Daily: a short update on the day's topic. Weekly: a wrap-up of that week's
// dailies. Both are free prose; the server stores the body as one untitled
// section (format: 'free'). Keep in sync with FREE_LENGTH in
// server/src/routes/editorial.js.
function rangeFor() { return series === 'weekly' ? [600, 6000] : [300, 2500]; }
const OLD_HEADINGS = new Set([...DAILY_SECTIONS, ...WEEKLY_SECTIONS]);
// Drafts saved by the earlier fixed-heading editor: drop the bare "## 핵심 판단"
// lines so the text written under them carries over.
const stripOldHeadings = text => String(text || '').split(/\r?\n/)
  .filter(line => !OLD_HEADINGS.has(line.trim().replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').trim()))
  .join('\n').replace(/\n{3,}/g, '\n\n').trim();

// Per-series local draft so a refresh or tab switch does not lose work.
const storeKey = () => `kkf-desk-draft-${series}`;
function loadLocal() { try { return JSON.parse(localStorage.getItem(storeKey()) || 'null'); } catch { return null; } }
function saveLocal() {
  if (current) return;
  try { localStorage.setItem(storeKey(), JSON.stringify({ title: val('title'), summary: val('summary'), body: val('body'), sources: val('sources'), related })); } catch {}
}
function clearLocal() { try { localStorage.removeItem(storeKey()); } catch {} }
const val = id => document.getElementById(id)?.value ?? '';
let related = [];

function render() {
  const [min, max] = rangeFor(); const saved = loadLocal() || {}; const weekly = series === 'weekly';
  related = weekly && Array.isArray(saved.related) ? saved.related : [];
  root.innerHTML = `
    <div class="editor-head">
      <div class="eyebrow" style="text-align:left;margin:0;">${weekly ? 'KK Weekly 새 초안 · 이번 주 Daily 정리' : 'KK Daily 새 초안 · 오늘의 업데이트'}</div>
      <div class="series-tabs"><button class="series-tab ${!weekly ? 'active' : ''}" data-series="daily">KK Daily</button><button class="series-tab ${weekly ? 'active' : ''}" data-series="weekly">KK Weekly</button></div>
    </div>

    <div class="existing-note" id="existing-note" hidden></div>

    <input class="title-input" id="title" maxlength="160" placeholder="제목을 입력하세요" value="${esc(saved.title || '')}">

    <div class="meta-row">
      <label class="muted" for="edition-date">기준일</label><input type="date" id="edition-date" value="${wantedId && (wantedId[2] === 'weekly') === weekly ? wantedId[1] : alignedDate(series)}">
      <input id="desk-label" readonly tabindex="-1">
      <span class="spacer"></span><span class="status" id="length-note">본문 0자 · 기준 ${min.toLocaleString()}–${max.toLocaleString()}자</span>
    </div>

    <textarea class="summary-input" id="summary" maxlength="400" placeholder="요약 — 목록과 검색에 표시할 한두 문장 (최대 400자)">${esc(saved.summary || '')}</textarea>

    <div class="toolbar" id="toolbar">
      ${weekly ? '<button data-act="import">이번 주 Daily 불러오기</button>' : ''}
      <span class="toolbar-help">${weekly ? '불러온 Daily 목록 위·아래에 한 주 정리를 자유롭게 쓰세요' : '소제목 없이 자유롭게 쓰세요'} · 빈 줄로 문단 구분 · 본문에 URL은 넣지 않습니다</span>
      <button data-act="preview" style="margin-left:auto;">👁 미리보기</button>
    </div>

    <div class="split">
      <textarea class="body" id="body" spellcheck="false" placeholder="${weekly ? '이번 주를 관통한 흐름부터 적어 주세요.' : '오늘 무엇이 바뀌었고, 왜 중요한지 적어 주세요.'}">${esc(stripOldHeadings(saved.body))}</textarea>
      <div class="preview-pane mobile-hide" id="preview-pane"><div class="preview-label">미리보기</div><div class="rendered" id="preview"></div></div>
    </div>

    <details class="source-card" open>
      <summary>출처 · 링크 1개 이상 <span class="muted" id="source-count"></span></summary>
      <textarea id="sources" placeholder="출처 제목 | https://주소&#10;다른 출처 | https://주소">${esc(saved.sources || '')}</textarea>
      <p class="source-help" id="source-help">한 줄에 하나씩 <b>제목 | https://주소</b>. 글 하단에 출처로 표시됩니다.</p>
    </details>

    <label class="review-check"><input type="checkbox" id="reviewed"> 원자료·숫자·견해·이해상충을 확인했습니다</label>
    <div class="actions"><button class="btn" id="publish">발행</button><button class="btn btn-ghost" id="submit">초안만 저장</button><span class="spacer"></span><button class="btn btn-ghost" id="reset">새로 쓰기</button><a class="btn btn-ghost" href="/voices?tab=desk">취소</a></div>
    <div class="msg" id="msg" style="margin-top:12px;"></div>
    ${draftList()}`;
  wire(); updateDateLabel(); loadEdition(); update();
}

function draftList() {
  const rows = drafts.slice(0, 8).map(d => `<a class="draft-row" href="/write-desk?id=${encodeURIComponent(d.id)}"><span><strong>${esc(d.payload?.content?.title || d.id)}</strong><small>${esc(d.payload?.desk?.label || '')} · ${esc(displayDate(d.edition_date))}</small></span><span>${esc(STATUS[d.status] || d.status)}</span></a>`).join('');
  return `<section class="draft-list"><h2>최근 KK Daily · KK Weekly</h2>${rows || '<p class="muted">아직 저장된 초안이 없습니다.</p>'}</section>`;
}

function wire() {
  root.querySelectorAll('[data-series]').forEach(button => button.onclick = () => { saveLocal(); series = button.dataset.series; history.replaceState(null, '', `/write-desk?series=${series}`); render(); });
  document.getElementById('edition-date').onchange = () => { updateDateLabel(); loadEdition(); update(); };
  for (const id of ['title', 'summary', 'body', 'sources']) document.getElementById(id).addEventListener('input', () => { update(); saveLocal(); });
  document.getElementById('toolbar').addEventListener('click', event => {
    const act = event.target.closest('button')?.dataset.act;
    if (act === 'preview') document.getElementById('preview-pane').classList.toggle('mobile-hide');
    if (act === 'import') importWeek();
  });
  document.getElementById('reset').onclick = () => {
    if (current) return setMessage('error', '이 기준일에는 이미 초안이 있어 새로 쓸 수 없습니다. 내용을 고쳐서 발행하거나 다른 기준일을 골라 주세요.');
    if (!confirm('제목·요약·본문·출처를 모두 비울까요?')) return; clearLocal(); render();
  };
  document.getElementById('submit').onclick = () => run(false);
  document.getElementById('publish').onclick = () => run(true);
}
function updateDateLabel() {
  const date = document.getElementById('edition-date').value; const day = dayOf(date); const mismatch = (series === 'weekly') !== (day === 0);
  const label = document.getElementById('desk-label'); label.value = mismatch ? '선택한 시리즈와 요일이 맞지 않습니다' : DAY_LABELS[day]; label.style.borderColor = mismatch ? '#e76f51' : '';
}

const STATUS = { awaiting_approval: '발행 전', approved: '발행 전', rejected: '보류', published: '발행 완료' };
const setField = (id, value) => { const node = document.getElementById(id); if (node) node.value = value ?? ''; };
// Body of a saved draft as one free text. Drafts the Desk made before the free
// format have fixed headings; their paragraphs are joined and headings dropped.
function draftBody(draft) {
  const content = draft.payload?.content || {}; const sections = content.sections || [];
  return content.format === 'free' ? sections[0]?.text || '' : sections.map(s => String(s.text || '').trim()).filter(Boolean).join('\n\n');
}
// Fill the editor from the draft already saved for the chosen date, or from
// this browser's unsent text when there is none.
function loadEdition() {
  const date = val('edition-date'); const draft = date ? drafts.find(d => d.id === `${date}-${DESK_IDS[dayOf(date)]}`) : null;
  const wasEditing = Boolean(current); current = draft || null;
  const note = document.getElementById('existing-note');
  setButtons(true); setPublishedMode(Boolean(draft && draft.status === 'published'));
  if (!draft) {
    note.hidden = true;
    if (wasEditing) { const saved = loadLocal() || {}; setField('title', saved.title); setField('summary', saved.summary); setField('body', stripOldHeadings(saved.body)); setField('sources', saved.sources); related = series === 'weekly' && Array.isArray(saved.related) ? saved.related : []; }
    return;
  }
  const p = draft.payload || {};
  setField('title', p.content?.title); setField('summary', p.content?.summary); setField('body', draftBody(draft));
  setField('sources', (p.sources || []).map(s => `${s.title} | ${s.url}`).join('\n'));
  related = Array.isArray(p.related) ? p.related : [];
  const published = draft.status === 'published';
  const auto = !p.qa?.manualDraft; const notes = Array.isArray(p.qa?.modelReview?.notes) ? p.qa.modelReview.notes : [];
  note.hidden = false;
  note.innerHTML = published
    ? `발행된 글입니다. 제목·요약·본문·출처를 고친 뒤 <b>변경 사항 저장</b>을 누르면 같은 주소에 바로 반영됩니다(멤버 전용 화면). <a href="/desk/${encodeURIComponent(draft.id)}">글 보기 →</a>`
    : `${auto ? '아침 자동 초안' : '저장해 둔 초안'}을 불러왔습니다. 고친 뒤 아래 <b>발행</b>을 누르면 바로 사이트에 올라갑니다.${p.content?.format === 'free' ? '' : ' 예전 소제목 형식이라 소제목을 빼고 문단만 남겼습니다.'}`
      + (notes.length ? `<details open><summary>편집 검수 메모 ${notes.length}건</summary>${notes.map(n => `<p>· ${esc(n)}</p>`).join('')}</details>` : '');
}
function setButtons(enabled) { for (const id of ['publish', 'submit', 'reviewed']) document.getElementById(id).disabled = !enabled; }
// A published edition is edited in place: one '변경 사항 저장' button, no
// draft save (that would take it off the site) and no review checkbox.
function setPublishedMode(on) {
  document.getElementById('publish').textContent = on ? '변경 사항 저장' : '발행';
  document.getElementById('submit').hidden = on;
  document.querySelector('.review-check').hidden = on;
}

// Weekly: the Monday–Saturday window that ends the day before the chosen Sunday.
function weekWindow(sunday) {
  const end = new Date(`${sunday}T00:00:00Z`); const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6); end.setUTCDate(end.getUTCDate() - 1);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}
async function importWeek() {
  const date = val('edition-date');
  if (dayOf(date) !== 0) return setMessage('error', 'KK Weekly 기준일(일요일)을 먼저 맞춰 주세요.');
  const [from, to] = weekWindow(date);
  setMessage('', `${from} ~ ${to} 발행된 Daily를 불러오는 중…`);
  try {
    // Members-only list on the VPS API (the public /api/desk list is gone).
    const response = await fetch(`${API_URL}/api/v1/desk`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const week = ((await response.json()).editions || [])
      .filter(a => a.series === 'DAILY DESK' && a.date >= from && a.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!week.length) return setMessage('error', `${from} ~ ${to}에 발행된 Daily가 없습니다.`);
    related = week.map(a => ({ title: `${a.label} · ${a.title}`, url: `/desk/${a.id}` }));
    const marks = '①②③④⑤⑥';
    const list = week.map((a, i) => `${marks[i] || '·'} ${a.label} — ${a.title}\n${a.summary}`).join('\n\n');
    const body = document.getElementById('body');
    body.value = `${body.value.trim() ? `${body.value.trim()}\n\n` : ''}이번 주 Daily\n\n${list}`;
    update(); saveLocal(); body.focus();
    setMessage('', `Daily ${week.length}편을 불러왔습니다. 글 하단 '이번 주 Daily'에 링크로도 붙습니다.`);
  } catch { setMessage('error', 'Daily 목록을 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.'); }
}

const paragraphsOf = text => text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
function update() {
  const body = val('body').trim(); const [min, max] = rangeFor(); const total = [...body].length;
  const note = document.getElementById('length-note');
  note.textContent = `본문 ${total.toLocaleString()}자 · 기준 ${min.toLocaleString()}–${max.toLocaleString()}자`;
  note.style.color = total >= min && total <= max ? 'var(--green)' : '';
  const sources = parseSources(); const warning = contentBlocker({ title: val('title').trim(), summary: val('summary').trim(), body });
  document.getElementById('preview').innerHTML = `
    ${val('title').trim() ? `<h2>${esc(val('title').trim())}</h2>` : ''}
    ${val('summary').trim() ? `<blockquote>${esc(val('summary').trim())}</blockquote>` : ''}
    ${paragraphsOf(body).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') || '<p class="muted">— 본문이 비어 있습니다 —</p>'}
    ${sources.length ? `<p class="muted">출처 · ${sources.map(s => esc(s.title || s.url)).join(' · ')}</p>` : ''}
    ${related.length ? `<h3>이번 주 Daily</h3>${related.map(r => `<p class="muted">${esc(r.title)}</p>`).join('')}` : ''}
    ${warning ? `<p class="preview-warn">⚠ ${esc(warning)}</p>` : ''}`;
  document.getElementById('source-count').textContent = sources.length ? `· ${sources.length}개 입력됨` : '';
}

// "제목 | https://주소" per line. Older four-part lines (종류 | 제목 | 주소 | 인용)
// still parse: the title is the field before the URL.
function parseSources() {
  return val('sources').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split('|').map(value => value.trim()); const at = parts.findIndex(part => /^https?:\/\//i.test(part));
    if (at < 0) return { title: parts.join(' '), url: '' };
    return { title: parts.slice(0, at).filter(part => !['primary', 'secondary'].includes(part)).join(' ') || parts[at], url: parts[at] };
  });
}
function collect() {
  const date = val('edition-date'); const day = dayOf(date);
  if ((series === 'weekly') !== (day === 0)) return setMessage('error', series === 'weekly' ? 'KK Weekly 기준일은 일요일이어야 합니다.' : 'KK Daily 기준일은 월요일부터 토요일까지입니다.');
  const title = val('title').trim(), summary = val('summary').trim(), body = val('body').trim();
  const sources = parseSources(); const [min, max] = rangeFor(); const chars = [...body].length;
  if (!title || !summary) return setMessage('error', '제목과 요약을 입력해 주세요.');
  if (chars < min || chars > max) return setMessage('error', `본문은 공백 포함 ${min.toLocaleString()}–${max.toLocaleString()}자여야 합니다. 현재 ${chars.toLocaleString()}자입니다.`);
  const blocker = contentBlocker({ title, summary, body }); if (blocker) return setMessage('error', blocker);
  if (!sources.length) return setMessage('error', '출처를 1개 이상 입력해 주세요. 한 줄에 “제목 | https://주소”입니다.');
  const bad = sources.find(s => !/^https:\/\//.test(s.url) || !s.title); if (bad) return setMessage('error', `출처 형식을 확인해 주세요: “${bad.title || bad.url}”. 한 줄에 “제목 | https://주소”입니다.`);
  return { date, title, summary, body, sources };
}
// Save the text: a new draft, or a full edit (title, summary, body, sources,
// weekly links) of the one already saved for this date. A published edition
// is updated in place and stays published.
async function save({ date, title, summary, body, sources }) {
  const fields = { content: { title, summary, body }, sources, related: series === 'weekly' ? related : [] };
  if (!current) return (await editorialApi({ action: 'create', format: 'free', date, series: series === 'weekly' ? 'KK WEEKLY' : 'DAILY DESK', ...fields })).draft;
  const action = current.status === 'published' ? 'update' : 'revise';
  return (await editorialApi({ id: current.id, version: current.version, action, format: 'free', ...fields })).draft;
}
function remember(draft) { current = draft; drafts = [draft, ...drafts.filter(d => d.id !== draft.id)]; }
// 발행: save → approve → publish in one go, then check the public API.
// 초안만 저장: save only.
async function run(publish) {
  const input = collect(); if (!input) return;
  if (current?.status === 'published') {
    setButtons(false); setMessage('', '저장하는 중…');
    try { remember(await save(input)); loadEdition(); setMessage('', '변경 사항을 저장했습니다. 글에 반영됩니다.'); }
    catch (error) { setMessage('error', serverMessage(error, input.date)); loadEdition(); }
    return;
  }
  if (publish && !document.getElementById('reviewed').checked) return setMessage('error', '발행 전에 “원자료·숫자·견해·이해상충을 확인했습니다”에 체크해 주세요.');
  if (publish && !confirm('지금 사이트에 발행할까요?')) return;
  setButtons(false); setMessage('', publish ? '발행하는 중…' : '저장하는 중…');
  try {
    let draft = await save(input); clearLocal(); remember(draft);
    if (!publish) { setMessage('', '저장했습니다. 아직 발행 전입니다. 이 화면에서 언제든 다시 열어 발행할 수 있습니다.'); return loadEdition(); }
    draft = (await editorialApi({ id: draft.id, version: draft.version, action: 'approve', reviewed: true })).draft; remember(draft);
    draft = (await editorialApi({ id: draft.id, version: draft.version, action: 'publish' })).draft; remember(draft);
    loadEdition();
    const check = await fetch(`${API_URL}/api/v1/desk/${encodeURIComponent(draft.id)}`, { credentials: 'include', cache: 'no-store' });
    const live = check.ok && (await check.json()).edition?.id === draft.id;
    setMessage('', live ? '발행 완료. 라운지(멤버 전용)에 올라갔습니다. 글로 이동합니다…' : '발행은 저장됐지만 화면 확인에 실패했습니다. 잠시 후 라운지 목록에서 확인해 주세요.');
    if (live) setTimeout(() => { location.href = `/desk/${encodeURIComponent(draft.id)}`; }, 800);
  } catch (error) { setMessage('error', serverMessage(error, input.date)); loadEdition(); }
}

// The API server (server/src/routes/editorial.js validateFreeContent) rejects
// these; checking first lets the message say what to fix, in Korean.
// PERSONAL mirrors PERSONAL_EXPERIENCE there: each field on its own, phrase at
// a word start, within one sentence.
const PERSONAL = [
  [/(?:^|[^가-힣])내가\s[^.!?\n]*근무/, '내가 … 근무'], [/(?:^|[^가-힣])나는\s[^.!?\n]*경험/, '나는 … 경험'],
  [/(?:^|[^가-힣])제가\s[^.!?\n]*경험/, '제가 … 경험'], [/내 경험상/, '내 경험상'],
];
function contentBlocker({ title, summary, body }) {
  if (/https?:\/\//i.test(body)) return '본문에 URL(http://, https://)이 있습니다. 주소는 출처 칸에만 넣어 주세요.';
  if (/\[확인 필요\]/.test(body)) return '본문에 [확인 필요] 표시가 남아 있습니다. 확인한 사실로 바꾸거나 문장을 빼 주세요.';
  if (/<\/?[a-z]/i.test(body)) return '본문에 HTML 태그처럼 읽히는 글자(< 뒤에 영문)가 있습니다. 풀어 써 주세요.';
  for (const [where, value] of [['제목', title], ['요약', summary], ['본문', body]]) for (const [pattern, label] of PERSONAL) {
    const match = String(value || '').match(pattern); if (!match) continue;
    return `${where}에 본인 경험 문장(‘${label}’)이 있습니다: “${match[0].trim().slice(0, 40)}”. 표현을 바꿔 주세요.`;
  }
  return '';
}
const SERVER_MESSAGES = [
  [/Unapproved personal experience/, () => '본인 경험 문장 규칙에 걸려 거절되었습니다. ‘나는 … 경험’, ‘내가 … 근무’, ‘제가 … 경험’, ‘내 경험상’ 표현을 바꿔 주세요.'],
  [/Use source IDs, plain text/, () => '본문에 URL, [확인 필요] 표시, 또는 HTML 태그처럼 읽히는 글자가 있어 거절되었습니다.'],
  [/Body length (\d+); expected ([\d–]+)/, m => `본문 분량이 ${Number(m[1]).toLocaleString()}자입니다. 기준은 ${m[2]}자입니다.`],
  [/Title and summary required/, () => '제목(160자 이내)과 요약(400자 이내)을 확인해 주세요.'],
  [/Section structure invalid|Every section requires/, () => '본문이 비어 있거나 형식이 맞지 않습니다.'],
  [/Series and date do not match|Invalid date/, () => '기준일과 시리즈가 맞지 않습니다. Daily는 월~토, Weekly는 일요일입니다.'],
  [/Invalid source URL/, () => '출처 주소는 https:// 로 시작해야 합니다.'],
  [/Invalid source|At least one source|At least two sources/, () => '출처 형식을 확인해 주세요. 한 줄에 “제목 | https://주소”, 1줄 이상입니다.'],
  [/Unknown related article/, () => '불러온 이번 주 Daily 목록이 맞지 않습니다. “이번 주 Daily 불러오기”를 다시 눌러 주세요.'],
];
function serverMessage(error, date) {
  const text = String(error.message || '');
  if (/\((401|403)\)$/.test(text)) return 'Chief 계정 로그인이 풀렸습니다. 새로고침 후 다시 로그인해 주세요. 쓰신 글은 이 브라우저에 저장되어 있습니다.';
  if (/\(409\)$/.test(text)) {
    const id = `${date}-${['weekly', 'macro', 'markets', 'bitcoin', 'ai', 'signals', 'korea'][dayOf(date)]}`;
    return /Stale draft|다른 변경/.test(text) ? '다른 곳에서 이 초안이 바뀌었습니다. 새로고침 후 다시 눌러 주세요. 쓰신 내용은 복사해 두세요.'
      : `이 기준일(${date})에는 이미 초안(${id})이 있습니다. 새로고침하면 그 초안이 열립니다.`;
  }
  for (const [pattern, say] of SERVER_MESSAGES) { const m = text.match(pattern); if (m) return say(m); }
  if (/발행 연결/.test(text)) return '서버에서 발행 기능이 꺼져 있습니다(EDITORIAL_PUBLISH_ENABLED). 초안은 저장됐습니다.';
  return `처리하지 못했습니다: ${text}`;
}
function setMessage(type, text) { const node = document.getElementById('msg'); node.className = `msg ${type}`; node.textContent = text; }
async function editorialApi(body) {
  const response = await fetch(`${API_URL}/api/v1/editorial`, { method: body ? 'POST' : 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(`${data.error || '요청 실패'} (${response.status})`); return data;
}
