import { isConfigured, currentUser, signInButtonsHtml, wireSignIn, isAdmin, esc } from '/js/auth-vps.js';
import { displayDate } from '/js/date-format.js';
import { API_URL } from '/config.js';

const DAILY_SECTIONS = ['핵심 판단', '확인된 사실', '시장의 해석', '검토할 관점', '반론', '관찰 지표'];
const WEEKLY_SECTIONS = ['이번 주 핵심', '거시경제', '금융시장', 'Bitcoin', 'AI', '주요 논쟁', '한국', '종합 판단', '다음 주 관찰 항목'];
const DAY_LABELS = ['KK WEEKLY', 'MACRO MONDAY', 'MARKETS TUESDAY', 'BITCOIN WEDNESDAY', 'AI THURSDAY', 'SIGNAL FRIDAY', 'KOREA SATURDAY'];
const root = document.getElementById('root');
let series = new URLSearchParams(location.search).get('series') === 'weekly' ? 'weekly' : 'daily';
let drafts = [];

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
function sectionsFor() { return series === 'weekly' ? WEEKLY_SECTIONS : DAILY_SECTIONS; }
function rangeFor() { return series === 'weekly' ? [1600, 4000] : [800, 1200]; }
function template() { return sectionsFor().map(heading => `## ${heading}\n\n`).join('\n'); }

// Per-series local draft so a refresh or tab switch does not lose work.
const storeKey = () => `kkf-desk-draft-${series}`;
function loadLocal() { try { return JSON.parse(localStorage.getItem(storeKey()) || 'null'); } catch { return null; } }
function saveLocal() {
  try { localStorage.setItem(storeKey(), JSON.stringify({ title: val('title'), summary: val('summary'), body: val('body'), sources: val('sources') })); } catch {}
}
function clearLocal() { try { localStorage.removeItem(storeKey()); } catch {} }
const val = id => document.getElementById(id)?.value ?? '';

function render() {
  const [min, max] = rangeFor(); const saved = loadLocal() || {};
  root.innerHTML = `
    <div class="editor-head">
      <div class="eyebrow" style="text-align:left;margin:0;">${series === 'weekly' ? 'KK Weekly' : 'KK Daily'} 새 초안</div>
      <div class="series-tabs"><button class="series-tab ${series === 'daily' ? 'active' : ''}" data-series="daily">KK Daily</button><button class="series-tab ${series === 'weekly' ? 'active' : ''}" data-series="weekly">KK Weekly</button></div>
    </div>

    <input class="title-input" id="title" maxlength="160" placeholder="제목을 입력하세요" value="${esc(saved.title || '')}">

    <div class="meta-row">
      <label class="muted" for="edition-date">기준일</label><input type="date" id="edition-date" value="${alignedDate(series)}">
      <input id="desk-label" readonly tabindex="-1">
      <span class="spacer"></span><span class="status" id="length-note">본문 0자 · 기준 ${min.toLocaleString()}–${max.toLocaleString()}자</span>
    </div>

    <textarea class="summary-input" id="summary" maxlength="400" placeholder="요약 — 목록과 검색에 표시할 핵심 결론을 1~2문장으로 (최대 400자)">${esc(saved.summary || '')}</textarea>

    <div class="toolbar" id="toolbar">
      <button data-act="template">목차 다시 넣기</button>
      <span class="toolbar-help">소제목은 <code>## 핵심 판단</code>처럼 한 줄로 · 순서 고정 · 본문은 서식 없이 공개됩니다</span>
      <button data-act="preview" style="margin-left:auto;">👁 미리보기</button>
    </div>

    <div class="split">
      <textarea class="body" id="body" spellcheck="false">${esc(saved.body || template())}</textarea>
      <div class="preview-pane mobile-hide" id="preview-pane"><div class="preview-label">미리보기</div><div class="rendered" id="preview"></div></div>
    </div>

    <details class="source-card" ${saved.sources ? 'open' : ''}>
      <summary>원자료 · 최소 2개, primary 1개 필수 <span class="muted" id="source-count"></span></summary>
      <textarea id="sources" placeholder="primary | 출처 제목 | https://공식-원자료 | 원문에서 확인한 30자 이상의 핵심 문장&#10;secondary | 교차검증 출처 | https://보도-또는-보고서 | 원문에서 확인한 30자 이상의 핵심 문장">${esc(saved.sources || '')}</textarea>
      <p class="source-help">한 줄에 하나씩 <b>종류 | 제목 | HTTPS 주소 | 원문 인용</b> 순서로 입력합니다. 본문에는 URL을 직접 넣지 않고, 발행 화면이 출처를 따로 표시합니다.</p>
    </details>

    <div class="actions"><button class="btn" id="submit">검토 초안 생성</button><a class="btn btn-ghost" href="/admin-editorial">검토·발행 화면</a><span class="spacer"></span><button class="btn btn-ghost" id="reset">새로 쓰기</button><a class="btn btn-ghost" href="/desk">취소</a></div>
    <div class="msg" id="msg" style="margin-top:12px;"></div>
    ${draftList()}`;
  wire(); updateDateLabel(); update();
}

function draftList() {
  const rows = drafts.slice(0, 8).map(d => `<a class="draft-row" href="/admin-editorial"><span><strong>${esc(d.payload?.content?.title || d.id)}</strong><small>${esc(d.payload?.desk?.label || '')} · ${esc(displayDate(d.edition_date))}</small></span><span>${esc(d.status)}</span></a>`).join('');
  return `<section class="draft-list"><h2>최근 KK Daily · KK Weekly</h2>${rows || '<p class="muted">아직 저장된 초안이 없습니다.</p>'}</section>`;
}

function wire() {
  root.querySelectorAll('[data-series]').forEach(button => button.onclick = () => { saveLocal(); series = button.dataset.series; history.replaceState(null, '', `/write-desk?series=${series}`); render(); });
  document.getElementById('edition-date').onchange = updateDateLabel;
  for (const id of ['title', 'summary', 'body', 'sources']) document.getElementById(id).addEventListener('input', () => { update(); saveLocal(); });
  document.getElementById('toolbar').addEventListener('click', event => {
    const act = event.target.closest('button')?.dataset.act;
    if (act === 'preview') document.getElementById('preview-pane').classList.toggle('mobile-hide');
    if (act === 'template') {
      const body = document.getElementById('body');
      if (body.value.trim() && !confirm('본문을 빈 목차로 바꿀까요? 지금 쓴 본문은 지워집니다.')) return;
      body.value = template(); update(); saveLocal(); body.focus();
    }
  });
  document.getElementById('reset').onclick = () => { if (!confirm('제목·요약·본문·원자료를 모두 비울까요?')) return; clearLocal(); render(); };
  document.getElementById('submit').onclick = submit;
}
function updateDateLabel() {
  const date = document.getElementById('edition-date').value; const day = dayOf(date); const mismatch = (series === 'weekly') !== (day === 0);
  const label = document.getElementById('desk-label'); label.value = mismatch ? '선택한 시리즈와 요일이 맞지 않습니다' : DAY_LABELS[day]; label.style.borderColor = mismatch ? '#e76f51' : '';
}

// Split the single body into the fixed sections. A heading is a line such as
// "## 핵심 판단", "2. 확인된 사실" or "**반론**" whose text is one of the fixed headings.
function parseBody(text) {
  const known = sectionsFor(); const found = []; let current = null; const stray = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:#{1,6}\s*)?(?:\*\*)?\s*(?:\d+[.)]\s*)?(.+?)\s*(?:\*\*)?\s*(?:\[[^\]]*\])?$/);
    const heading = match && known.includes(match[1].replace(/\*\*/g, '').trim()) ? match[1].replace(/\*\*/g, '').trim() : null;
    if (heading) { current = { heading, lines: [] }; found.push(current); }
    else if (current) current.lines.push(line);
    else if (line.trim()) stray.push(line);
  }
  const sections = found.map(s => ({ heading: s.heading, text: s.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() }));
  const order = sections.map(s => s.heading).join('|') === known.join('|');
  return { sections, order, stray: stray.length };
}

function update() {
  const { sections } = parseBody(val('body')); const [min, max] = rangeFor();
  const total = [...sections.map(s => s.text).filter(Boolean).join('\n\n')].length;
  const note = document.getElementById('length-note');
  note.textContent = `본문 ${total.toLocaleString()}자 · 기준 ${min.toLocaleString()}–${max.toLocaleString()}자`;
  note.style.color = total >= min && total <= max ? 'var(--green)' : '';
  const paragraphs = text => text.split(/\n{2,}/).filter(p => p.trim()).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const missing = sectionsFor().filter(h => !sections.some(s => s.heading === h));
  document.getElementById('preview').innerHTML = `
    ${val('title').trim() ? `<h2>${esc(val('title').trim())}</h2>` : ''}
    ${val('summary').trim() ? `<blockquote>${esc(val('summary').trim())}</blockquote>` : ''}
    ${sections.map(s => `<h3>${esc(s.heading)} <small class="muted">${[...s.text].length.toLocaleString()}자</small></h3>${paragraphs(s.text) || '<p class="muted">— 비어 있음 —</p>'}`).join('')}
    ${missing.length ? `<p class="muted">빠진 소제목: ${missing.map(esc).join(', ')}</p>` : ''}
    ${(warning => warning ? `<p class="preview-warn">⚠ ${esc(warning)}</p>` : '')(contentBlocker({ title: val('title').trim(), summary: val('summary').trim(), sections }))}`;
  const count = parseSources().length; document.getElementById('source-count').textContent = count ? `· ${count}개 입력됨` : '';
}

function parseSources() {
  return val('sources').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [type, title, url, ...quote] = line.split('|').map(value => value.trim()); return { type, title, url, quote: quote.join(' | ') };
  });
}
async function submit() {
  const date = document.getElementById('edition-date').value; const day = dayOf(date);
  if ((series === 'weekly') !== (day === 0)) return setMessage('error', series === 'weekly' ? 'KK Weekly 기준일은 일요일이어야 합니다.' : 'KK Daily 기준일은 월요일부터 토요일까지입니다.');
  const title = val('title').trim(), summary = val('summary').trim();
  const { sections, order, stray } = parseBody(val('body'));
  const sources = parseSources(); const [min, max] = rangeFor(); const chars = [...sections.map(s => s.text).join('\n\n')].length;
  if (!title || !summary) return setMessage('error', '제목과 요약을 입력해 주세요.');
  if (stray) return setMessage('error', `첫 소제목(## ${sectionsFor()[0]}) 앞에 글이 있습니다. 소제목 아래로 옮겨 주세요.`);
  if (!order) return setMessage('error', `소제목은 이 순서로 한 번씩 있어야 합니다: ${sectionsFor().join(' → ')}`);
  if (sections.some(s => !s.text)) return setMessage('error', `비어 있는 섹션이 있습니다: ${sections.filter(s => !s.text).map(s => s.heading).join(', ')}`);
  if (chars < min || chars > max) return setMessage('error', `본문은 공백 포함 ${min.toLocaleString()}–${max.toLocaleString()}자여야 합니다. 현재 ${chars.toLocaleString()}자입니다.`);
  const blocker = contentBlocker({ title, summary, sections }); if (blocker) return setMessage('error', blocker);
  if (sources.length < 2 || !sources.some(s => s.type === 'primary') || sources.some(s => !['primary', 'secondary'].includes(s.type) || !/^https:\/\//.test(s.url) || s.quote.length < 30)) return setMessage('error', '출처를 형식에 맞게 2개 이상 입력하고, primary 원자료를 1개 이상 포함해 주세요. 인용문은 30자 이상이어야 합니다.');
  const button = document.getElementById('submit'); button.disabled = true; setMessage('', '고정 포맷을 검증하고 초안을 생성하는 중…');
  try {
    const data = await editorialApi({ action: 'create', date, series: series === 'weekly' ? 'KK WEEKLY' : 'DAILY DESK', content: { title, summary, sections }, sources });
    clearLocal(); location.href = data.draft?.id ? `/admin-editorial?id=${encodeURIComponent(data.draft.id)}` : '/admin-editorial';
  } catch (error) { setMessage('error', serverMessage(error, date)); button.disabled = false; }
}

// The API server (server/src/routes/editorial.js validateContent) rejects these;
// checking first lets the message say where the problem is, in Korean.
// PERSONAL mirrors the server regexes exactly, including that they run over the
// JSON of the whole content, so "…나는 " in one section and "경험" anywhere later match.
const PERSONAL = [[/내가 .*근무/, '내가 … 근무'], [/나는 .*경험/, '나는 … 경험'], [/제가 .*경험/, '제가 … 경험'], [/내 경험상/, '내 경험상']];
function contentBlocker({ title, summary, sections }) {
  for (const s of sections) {
    if (/https?:\/\//i.test(s.text)) return `‘${s.heading}’ 섹션에 URL(http://, https://)이 있습니다. 주소는 원자료 칸에만 넣어 주세요.`;
    if (/\[확인 필요\]/.test(s.text)) return `‘${s.heading}’ 섹션에 [확인 필요] 표시가 남아 있습니다. 확인한 사실로 바꾸거나 문장을 빼 주세요.`;
    if (/<\/?[a-z]/i.test(s.text)) return `‘${s.heading}’ 섹션에 HTML 태그처럼 읽히는 글자(< 뒤에 영문)가 있습니다. 풀어 써 주세요.`;
  }
  const json = JSON.stringify({ title, summary, sections: sections.map(s => ({ heading: s.heading, text: s.text })) });
  for (const [pattern, label] of PERSONAL) {
    const match = json.match(pattern); if (!match) continue;
    const near = json.slice(Math.max(0, match.index - 8), match.index + label.split(' ')[0].length + 1).replace(/\\n|"/g, ' ').trim();
    return `본인 경험 문장 규칙(‘${label}’)에 걸렸습니다. “${near}” 부분부터 뒤쪽 글까지가 이 규칙과 맞물립니다. 문장 하나만이 아니라 글 전체에 걸쳐 검사하므로, 해당 표현을 바꾸거나 ‘${label.split(' … ').pop()}’ 단어를 다른 말로 바꿔 주세요.`;
  }
  return '';
}
const SERVER_MESSAGES = [
  [/Unapproved personal experience/, () => '본인 경험 문장 규칙에 걸려 거절되었습니다. ‘나는 … 경험’, ‘내가 … 근무’, ‘제가 … 경험’, ‘내 경험상’ 표현을 바꿔 주세요.'],
  [/Use source IDs, plain text/, () => '본문에 URL, [확인 필요] 표시, 또는 HTML 태그처럼 읽히는 글자가 있어 거절되었습니다.'],
  [/Body length (\d+); expected ([\d–]+)/, m => `본문 분량이 ${Number(m[1]).toLocaleString()}자입니다. 기준은 ${m[2]}자입니다.`],
  [/Title and summary required/, () => '제목(160자 이내)과 요약(400자 이내)을 확인해 주세요.'],
  [/Section structure invalid|Every section requires/, () => '소제목 구성이 고정 목차와 맞지 않거나 비어 있는 섹션이 있습니다.'],
  [/Series and date do not match|Invalid date/, () => '기준일과 시리즈가 맞지 않습니다. Daily는 월~토, Weekly는 일요일입니다.'],
  [/Invalid source URL/, () => '원자료 주소는 https:// 로 시작해야 합니다.'],
  [/Invalid source|At least two sources/, () => '원자료 형식을 확인해 주세요. 한 줄에 “종류 | 제목 | https://주소 | 30자 이상 인용”, 최소 2줄입니다.'],
  [/Evidence/, () => '원자료 인용문을 확인해 주세요. primary 원자료가 1개 이상 있어야 합니다.'],
];
function serverMessage(error, date) {
  const text = String(error.message || '');
  if (/\((401|403)\)$/.test(text)) return 'Chief 계정 로그인이 풀렸습니다. 새로고침 후 다시 로그인해 주세요. 쓰신 글은 이 브라우저에 저장되어 있습니다.';
  if (/\(409\)$/.test(text)) {
    const id = `${date}-${['weekly', 'macro', 'markets', 'bitcoin', 'ai', 'signals', 'korea'][dayOf(date)]}`;
    return `이 기준일(${date})에는 이미 초안이 있습니다(아침 자동 초안 포함). 같은 날짜에는 초안이 하나만 들어갑니다. 검토 화면(/admin-editorial?id=${id})에서 기존 초안 본문을 고쳐 저장하거나, 다른 기준일을 골라 주세요.`;
  }
  for (const [pattern, say] of SERVER_MESSAGES) { const m = text.match(pattern); if (m) return say(m); }
  return `초안을 만들지 못했습니다: ${text}`;
}
function setMessage(type, text) { const node = document.getElementById('msg'); node.className = `msg ${type}`; node.textContent = text; }
async function editorialApi(body) {
  const response = await fetch(`${API_URL}/api/v1/editorial`, { method: body ? 'POST' : 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(`${data.error || '요청 실패'} (${response.status})`); return data;
}
