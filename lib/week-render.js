// 이번 주 체크 포인트: the /week page and the home band's JSON.
//
// Every value that came from a data file or the law API goes through esc().
// Type sizes and colours are the ones /markets and the home "최신 글" cards
// already use, and fonts are only var(--font-sans) / var(--font-serif), so the
// page sits in the same system as the rest of the site.
import { SITE, nav } from './markets-render.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const DISCLAIMER = '본 자료는 정보 제공 목적이며 특정 자산의 매수·매도 권유가 아닙니다. 모든 투자 판단과 책임은 투자자 본인에게 있습니다.';
const LAW_SOURCE = { name: '법제처 국가법령정보센터', url: 'https://www.law.go.kr/' };
const REGION_LABEL = { kr: '한국', us: '미국', global: '글로벌' };
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

const parts = (iso) => iso.split('-').map(Number);
const monthDay = (iso) => { const [, m, d] = parts(iso); return `${m}월 ${d}일`; };
const dayLabel = (iso) => `${monthDay(iso)} (${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
const verifiedLabel = (iso) => { const [y, m, d] = parts(iso); return `${y}. ${m}. ${d}. 확인`; };

const STYLE = `body{background:#0A0E1A}.week-wrap{max-width:780px;margin:0 auto;padding:64px 24px 96px}.back{color:#9DB0C7;text-decoration:none}.eyebrow{margin-top:42px}.week-wrap h1{font-family:var(--font-serif);font-size:clamp(30px,5.4vw,50px);line-height:1.3;margin:12px 0 20px}.byline{font-size:13px;color:#9DB0C7;margin:0 0 36px;padding-bottom:24px;border-bottom:1px solid rgba(255,255,255,.12)}.week-wrap h2{font-family:var(--font-serif);font-size:24px;color:#fff;margin:40px 0 16px}.wk-list{list-style:none;margin:0;padding:0;display:grid;gap:16px}.wk-item{display:flex;gap:18px;padding:20px 22px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.1);border-radius:10px}.wk-when{flex:0 0 112px;display:flex;flex-direction:column;gap:4px}.wk-day{color:#fff;font-size:14px;font-weight:700}.wk-time{color:#8A94A6;font-size:12px}.wk-body{min-width:0}.wk-tag{color:#4A90D9;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.wk-item h3{margin:6px 0 8px;color:#fff;font-family:var(--font-serif);font-size:16.5px;font-weight:700;line-height:1.55;word-break:keep-all}.wk-item p{margin:0;color:#D5DDE8;font-size:14px;line-height:1.7;word-break:keep-all}.wk-item .wk-src{margin-top:10px;color:#9DB0C7;font-size:13px}.wk-item .wk-src a{color:#79AEE8}.wk-empty{margin:0;padding:20px 22px;color:#D5DDE8;font-size:14px;line-height:1.7;border:1px dashed rgba(255,255,255,.18);border-radius:10px}.wk-gap{margin:12px 0 0;color:#9DB0C7;font-size:13px;line-height:1.7}.wk-note{margin:48px 0 0;color:#9DB0C7;font-size:13px;line-height:1.7}@media(max-width:640px){.week-wrap{padding-top:40px}.wk-item{flex-direction:column;gap:10px}.wk-when{flex:none;flex-direction:row;align-items:baseline;gap:10px}}`;

function itemHtml(it) {
  const time = it.time ? `<span class="wk-time">${esc(it.time)} KST</span>` : '';
  return `<li class="wk-item"><div class="wk-when"><span class="wk-day">${esc(dayLabel(it.date))}</span>${time}</div>`
    + `<div class="wk-body"><span class="wk-tag">${esc(REGION_LABEL[it.region])}</span><h3>${esc(it.title)}</h3><p>${esc(it.note)}</p>`
    + `<p class="wk-src"><a href="${esc(it.source.url)}" rel="noopener noreferrer">${esc(it.source.name)}</a> · ${esc(verifiedLabel(it.verifiedAt))}</p></div></li>`;
}

function lawHtml(l) {
  return `<li class="wk-item"><div class="wk-when"><span class="wk-day">${esc(dayLabel(l.effective))}</span></div>`
    + `<div class="wk-body"><span class="wk-tag">법령</span><h3>${esc(l.name)}</h3><p>${esc(l.kind || '개정')} 시행</p>`
    + `<p class="wk-src"><a href="${esc(LAW_SOURCE.url)}" rel="noopener noreferrer">${esc(LAW_SOURCE.name)}</a></p></div></li>`;
}

const LAW_MESSAGE = {
  unavailable: '법령 시행 일정을 지금 확인할 수 없습니다.',
  partial: '일부만 확인됐습니다. 아래 목록에 없는 법령이 있을 수 있습니다.',
};

// A quiet week is worded from what the data really covers, never as a blanket
// "nothing this week".
function emptyCalendarMessage(week, covers) {
  return covers.length ? `${week} ${covers.join('·')} 일정은 없습니다.` : `${week} 등록된 일정은 없습니다.`;
}

export function renderWeekPage(view) {
  const { window: win, calendar, law } = view;
  const title = win.isNextWeek ? '다음 주 체크 포인트' : '이번 주 체크 포인트';
  const description = '이번 주 지켜볼 발표와 일정을 출처와 함께 모았습니다. 공식 달력과 법제처 자료에서 확인한 것만 싣습니다.';
  const week = win.isNextWeek ? '다음 주' : '이번 주';
  const url = `${SITE}/week`;

  const calendarBody = calendar.items.length
    ? `<ul class="wk-list">${calendar.items.map(itemHtml).join('')}</ul>`
    : `<p class="wk-empty">${esc(calendar.status === 'not-prepared' ? '올해 일정이 아직 준비되지 않았습니다.' : emptyCalendarMessage(week, calendar.covers))}</p>`;
  const gaps = calendar.status !== 'not-prepared' && calendar.missing.length
    ? `<p class="wk-gap">아직 싣지 않는 일정: ${esc(calendar.missing.join('·'))}. 이곳의 발표는 직접 확인해 주세요.</p>` : '';
  const lawList = law.items.length ? `<ul class="wk-list">${law.items.map(lawHtml).join('')}</ul>` : '';
  const lawNote = law.status === 'ok' ? ''
    : `<p class="wk-empty">${esc(law.status === 'empty' ? `${week} 시행되는 법령이 없습니다.` : LAW_MESSAGE[law.status] ?? LAW_MESSAGE.unavailable)}</p>`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>이번 주 체크 포인트 · KK &amp; Friends</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0A0E1A">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="KK &amp; Friends">
<meta property="og:title" content="이번 주 체크 포인트 · KK &amp; Friends">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/member.css">
<link rel="stylesheet" href="/typography.css">
<link rel="stylesheet" href="/brand.css">
<style>${STYLE}</style>
</head>
<body>
${nav.replace(' aria-current="page"', '')}
<main class="week-wrap">
  <a class="back" href="/thoughts">← THOUGHTS</a>
  <p class="eyebrow">KK &amp; Friends · 주간 일정</p>
  <h1>${esc(title)}</h1>
  <p class="byline">${esc(monthDay(win.from))} ~ ${esc(monthDay(win.to))} · 한국 시간 기준${win.isNextWeek ? ' · 이번 주는 끝나서 다음 주 일정을 보여드립니다' : ''}</p>
  <section aria-labelledby="wk-cal"><h2 id="wk-cal">발표·일정</h2>${calendarBody}${gaps}</section>
  <section aria-labelledby="wk-law"><h2 id="wk-law">시행되는 법령</h2>${lawList}${lawNote}</section>
  <p class="wk-note">일정은 각 기관이 공개한 달력에서 확인한 것만 싣습니다. 항목마다 출처와 확인한 날을 표시합니다. 일정은 기관 사정으로 바뀔 수 있습니다.</p>
  <p class="wk-note">${esc(DISCLAIMER)}</p>
</main>
<script type="module" src="/js/site-nav.js"></script>
</body>
</html>`;
}

// What the home band needs: the soonest `limit` entries, calendar items and law
// effective dates merged by day. Empty items means the band stays hidden.
export function homeWeekJson(view, limit = 5) {
  const rows = [
    ...view.calendar.items.map((i) => ({ date: i.date, time: i.time, title: i.title, region: i.region })),
    ...view.law.items.map((l) => ({ date: l.effective, title: `${l.name} 시행`, region: 'kr' })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.time ? 0 : 1) - (b.time ? 0 : 1) || (a.time ?? '').localeCompare(b.time ?? ''));
  return {
    from: view.window.from,
    to: view.window.to,
    isNextWeek: view.window.isNextWeek,
    items: rows.slice(0, limit).map((r) => (r.time ? r : { date: r.date, title: r.title, region: r.region })),
  };
}
