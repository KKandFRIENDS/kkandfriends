import { isConfigured, currentUser, signInButtonsHtml, wireSignIn, isAdmin, esc } from '/js/auth-vps.js';
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

function render() {
  const sections = sectionsFor(); const [min, max] = rangeFor();
  root.innerHTML = `
    <div class="desk-head"><div><p class="eyebrow" style="text-align:left;margin:0">PUBLISHING DESK</p><h1>DAILY · WEEKLY 글쓰기</h1><p class="muted">같은 목차, 같은 근거 기준, 같은 승인 절차를 사용합니다.</p></div><div class="series-tabs"><button class="series-tab ${series === 'daily' ? 'active' : ''}" data-series="daily">DAILY DESK</button><button class="series-tab ${series === 'weekly' ? 'active' : ''}" data-series="weekly">KK WEEKLY</button></div></div>
    <div class="format-card"><div><strong>고정 목차</strong><span>${sections.length}개 섹션</span></div><div><strong>본문 분량</strong><span>${min.toLocaleString()}–${max.toLocaleString()}자</span></div><div><strong>발행 절차</strong><span>작성 → 근거 확인 → 승인 → 발행</span></div></div>
    <div class="meta-grid"><div><label class="field-label" for="edition-date">기준일</label><input class="input" type="date" id="edition-date" value="${alignedDate(series)}"></div><div><label class="field-label" for="desk-label">발행판</label><input class="input" id="desk-label" readonly></div></div>
    <label class="field-label" for="title">제목</label><input class="input title-input" id="title" maxlength="160" placeholder="금융·산업 용어로 핵심 결론을 적으세요">
    <label class="field-label" for="summary" style="margin-top:14px">요약</label><textarea class="summary-input" id="summary" maxlength="400" placeholder="목록과 검색에 표시할 핵심 결론을 1~2문장으로 적으세요."></textarea>
    <div id="sections">${sections.map((heading, i) => `<section class="section-card"><div class="section-top"><h2>${i + 1}. ${esc(heading)}</h2><span class="count" data-count="${i}">0자</span></div><textarea data-section="${i}" data-heading="${esc(heading)}" placeholder="${esc(sectionPrompt(heading))}"></textarea></section>`).join('')}</div>
    <section class="source-card"><label class="field-label" for="sources">원자료 · 최소 2개, primary 1개 필수</label><textarea id="sources" placeholder="primary | 출처 제목 | https://공식-원자료 | 원문에서 확인한 30자 이상의 핵심 문장\nsecondary | 교차검증 출처 | https://보도-또는-보고서 | 원문에서 확인한 30자 이상의 핵심 문장"></textarea><p class="source-help">한 줄에 하나씩 <b>종류 | 제목 | HTTPS 주소 | 원문 인용</b> 순서로 입력합니다. 본문에는 URL을 직접 넣지 않고, 발행 화면이 출처를 따로 표시합니다.</p></section>
    <p class="editor-note" id="length-note">본문 합계 0자 · 기준 ${min.toLocaleString()}–${max.toLocaleString()}자</p>
    <div class="actions"><button class="btn" id="submit">검토 초안 생성</button><a class="btn btn-ghost" href="/admin-editorial">검토·발행 화면</a><span class="spacer"></span><a class="btn btn-ghost" href="/desk">취소</a></div><div class="msg status-box" id="msg"></div>
    ${draftList()}`;
  wire(); updateDateLabel(); updateCounts();
}

function sectionPrompt(heading) {
  const prompts = {
    '핵심 판단': '결론부터 적고, 왜 지금 중요한지 한 문단으로 설명하세요.', '확인된 사실': '원자료로 확인한 사실과 숫자만 적으세요.',
    '시장의 해석': '사실이 가격·유동성·기업에 미치는 영향을 적으세요.', '검토할 관점': '투자자와 기업이 구분해 봐야 할 조건을 적으세요.',
    '반론': '이 판단이 틀릴 수 있는 조건과 반대 근거를 적으세요.', '관찰 지표': '판단을 유지하거나 폐기할 다음 데이터와 시점을 적으세요.',
    '이번 주 핵심': '한 주를 관통한 변화와 결론을 적으세요.', '주요 논쟁': '엇갈린 해석과 각각의 근거를 분리하세요.',
    '종합 판단': '각 시장의 연결고리와 다음 국면의 판단을 적으세요.', '다음 주 관찰 항목': '다음 주 확인할 다섯 항목을 번호로 적으세요.',
  }; return prompts[heading] || `${heading}의 사실, 변화, 의미를 구분해 적으세요.`;
}

function draftList() {
  const rows = drafts.slice(0, 8).map(d => `<a class="draft-row" href="/admin-editorial"><span><strong>${esc(d.payload?.content?.title || d.id)}</strong><small>${esc(d.payload?.desk?.label || '')} · ${esc(d.edition_date)}</small></span><span>${esc(d.status)}</span></a>`).join('');
  return `<section class="draft-list"><h2>최근 DAILY · WEEKLY</h2>${rows || '<p class="muted">아직 저장된 초안이 없습니다.</p>'}</section>`;
}

function wire() {
  root.querySelectorAll('[data-series]').forEach(button => button.onclick = () => { series = button.dataset.series; history.replaceState(null, '', `/write-desk?series=${series}`); render(); });
  document.getElementById('edition-date').onchange = updateDateLabel;
  root.querySelectorAll('[data-section]').forEach(area => area.addEventListener('input', updateCounts));
  document.getElementById('submit').onclick = submit;
}
function updateDateLabel() {
  const date = document.getElementById('edition-date').value; const day = dayOf(date); const mismatch = (series === 'weekly') !== (day === 0);
  const label = document.getElementById('desk-label'); label.value = mismatch ? '선택한 시리즈와 요일이 맞지 않습니다' : DAY_LABELS[day]; label.style.borderColor = mismatch ? '#e76f51' : '';
}
function updateCounts() {
  let total = 0; root.querySelectorAll('[data-section]').forEach((area, i) => { const count = [...area.value].length; total += count; root.querySelector(`[data-count="${i}"]`).textContent = `${count.toLocaleString()}자`; });
  const [min, max] = rangeFor(); const note = document.getElementById('length-note'); note.textContent = `본문 합계 ${total.toLocaleString()}자 · 기준 ${min.toLocaleString()}–${max.toLocaleString()}자`; note.style.color = total >= min && total <= max ? 'var(--green)' : '';
}
function parseSources() {
  return document.getElementById('sources').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [type, title, url, ...quote] = line.split('|').map(value => value.trim()); return { type, title, url, quote: quote.join(' | ') };
  });
}
async function submit() {
  const date = document.getElementById('edition-date').value; const day = dayOf(date); const msg = document.getElementById('msg');
  if ((series === 'weekly') !== (day === 0)) return setMessage('error', series === 'weekly' ? 'KK WEEKLY 기준일은 일요일이어야 합니다.' : 'DAILY DESK 기준일은 월요일부터 토요일까지입니다.');
  const title = document.getElementById('title').value.trim(), summary = document.getElementById('summary').value.trim();
  const sections = [...root.querySelectorAll('[data-section]')].map(area => ({ heading: area.dataset.heading, text: area.value.trim() }));
  const sources = parseSources(); const [min, max] = rangeFor(); const chars = [...sections.map(s => s.text).join('\n\n')].length;
  if (!title || !summary || sections.some(s => !s.text)) return setMessage('error', '제목·요약·모든 고정 섹션을 입력해 주세요.');
  if (chars < min || chars > max) return setMessage('error', `본문은 공백 포함 ${min.toLocaleString()}–${max.toLocaleString()}자여야 합니다. 현재 ${chars.toLocaleString()}자입니다.`);
  if (sources.length < 2 || !sources.some(s => s.type === 'primary') || sources.some(s => !['primary', 'secondary'].includes(s.type) || !/^https:\/\//.test(s.url) || s.quote.length < 30)) return setMessage('error', '출처를 형식에 맞게 2개 이상 입력하고, primary 원자료를 1개 이상 포함해 주세요. 인용문은 30자 이상이어야 합니다.');
  const button = document.getElementById('submit'); button.disabled = true; setMessage('', '고정 포맷을 검증하고 초안을 생성하는 중…');
  try {
    await editorialApi({ action: 'create', date, series: series === 'weekly' ? 'KK WEEKLY' : 'DAILY DESK', content: { title, summary, sections }, sources });
    location.href = '/admin-editorial';
  } catch (error) { setMessage('error', error.message.includes('409') ? '이 날짜에는 이미 DAILY · WEEKLY 초안이 있습니다.' : error.message); button.disabled = false; }
}
function setMessage(type, text) { const node = document.getElementById('msg'); node.className = `msg status-box ${type}`; node.textContent = text; }
async function editorialApi(body) {
  const response = await fetch(`${API_URL}/api/v1/editorial`, { method: body ? 'POST' : 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(`${data.error || '요청 실패'} (${response.status})`); return data;
}
