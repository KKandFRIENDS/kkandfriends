// 한국 물가·집값·임금 누적 변동 차트 (2026-10-22 KK 요청: 미국 BLS 차트의 한국판, 사이트 톤으로).
//
//   node scripts/kr-price-chart.mjs out.png                 # 받아서 그린다
//   node scripts/kr-price-chart.mjs out.png --cache d.json  # d.json이 있으면 읽고, 없으면 받아서 저장
//
// 자료 (모두 2000년 기준 누적 변동, 세로축은 로그 눈금):
//   물가   KOSIS 101 / DT_1J22001 지출목적별 소비자물가지수, 전국, 월간 (키: KOSIS_API_KEY)
//   집값   한국은행 ECOS 901Y062 주택매매가격지수(KB국민은행), 월간 (키: ECOS_API_KEY)
//   임금   KOSIS 고용노동부 사업체노동력조사 임금총액, 5인 이상, 연평균 (표 6개를 이은 것, 아래 참고)
// Claude Code 컨테이너에서는 NODE_USE_ENV_PROXY=1을 앞에 붙인다.
//
// 모양은 KK & FRIENDS 차트 카드(1600x1140, 남색 바탕, 오른쪽 끝에 색깔 라벨)이고,
// 글꼴은 레포의 Pretendard(fonts/)만 쓴다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { callKosis } from '../lib/stats/kosis.js';
import { callEcos } from '../lib/ecos.js';
import { CARD_FONTS } from '../lib/ig-card.js';

export const W = 1600;
export const H = 1140;
const START = '200001';

export const SERIES = [
  { code: 'P63ACA', src: 'ecos', label: '서울 아파트값', color: '#FF6B6B' },
  { code: 'P63AC', src: 'ecos', label: '전국 아파트값', color: '#FF9F5A' },
  { code: 'A', src: 'cpi', label: '식료품·비주류음료', color: '#FFC857' },
  { code: 'K', src: 'cpi', label: '음식·숙박(외식 포함)', color: '#E8E36A' },
  { code: 'WAGE', src: 'wage', label: '월평균 임금', color: '#B79CFF', thick: true },
  { code: '0', src: 'cpi', label: '소비자물가 전체', color: '#FFFFFF', dashed: true },
  { code: 'F031', src: 'cpi', label: '병원 서비스', color: '#5FD3A5' },
  { code: 'D011', src: 'cpi', label: '주택임차료(전·월세)', color: '#5BA4F5' },
  { code: 'H', src: 'cpi', label: '통신', color: '#7FDBE8' },
  { code: 'H03102', src: 'cpi', label: '휴대전화료', color: '#F78FB3' },
];

const C = { grid: '#1C2A44', axis: '#8193AB', ink: '#F2F5FA', sub: '#B9C6D6', accent: '#4A90D9' };

// ─── Data ───────────────────────────────────────────────────────────────────

async function retry(fn, label, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    last = await fn();
    if (last.ok) return last;
  }
  throw new Error(`${label}: ${last.error}`);
}

async function fetchCpi(code) {
  const res = await retry(() => callKosis('Param/statisticsParameterData.do', {
    orgId: '101', tblId: 'DT_1J22001', prdSe: 'M', startPrdDe: START, endPrdDe: '203012',
    objL1: 'T10', objL2: code, itmId: 'T',
  }), `cpi ${code}`);
  return res.rows.map(r => [String(r.PRD_DE), Number(r.DT)]);
}

async function fetchKb(code) {
  const res = await retry(() => callEcos(`StatisticSearch/${process.env.ECOS_API_KEY}/json/kr/1/400/901Y062/M/${START}/203012/${code}`), `kb ${code}`);
  return res.rows.map(r => [String(r.TIME), Number(r.DATA_VALUE)]);
}

// 사업체노동력조사 전체근로자 임금총액(5인 이상 사업장), 연도별 평균. 통계 개편으로 표가 6개로 나뉘어 있다.
// 연평균 표(1999~2010)는 그 값을, 월간 표(2011~)는 12개월 평균을 쓴다. 2026년은 일부 달뿐이라 빼고 2025년까지.
const WAGE_TABLES = [
  { tblId: 'DT_MONY011', prdSe: 'Y', from: '1999', to: '2001', itmId: '13103205066MD_17', objs: ['13102205066INDUSTRYS.000', '13102205066SIZES.00', '13102205066SEXS.0'] },
  { tblId: 'DT_MON0025', prdSe: 'Y', from: '2002', to: '2007', itmId: '13103205049MD_17', objs: ['13102205049INDUSTRYS.0000', '13102205049SIZES.00', '13102205049SEXS.0'] },
  { tblId: 'DT_118N_MON035', prdSe: 'Y', from: '2008', to: '2010', itmId: '13103110311MD_12', objs: ['15118INDUSTRY_9S0', '13102110311SIZES.00'] },
  { tblId: 'DT_118N_MON041', prdSe: 'M', from: '201101', to: '201912', itmId: '13103110311MD_12', objs: ['15118INDUSTRY_9S0', 'size02'] },
  { tblId: 'DT_118N_MON051', prdSe: 'M', from: '202001', to: '202512', itmId: '13103110311MD_12', objs: ['190326INDUSTRY_10S0', 'size02'] },
];

async function fetchWage() {
  const out = [];
  for (const t of WAGE_TABLES) {
    const params = { orgId: '118', tblId: t.tblId, prdSe: t.prdSe, startPrdDe: t.from, endPrdDe: t.to, itmId: t.itmId };
    t.objs.forEach((o, i) => { params[`objL${i + 1}`] = o; });
    const res = await retry(() => callKosis('Param/statisticsParameterData.do', params), `wage ${t.tblId}`);
    const byYear = {};
    for (const r of res.rows) (byYear[String(r.PRD_DE).slice(0, 4)] ||= []).push(Number(r.DT));
    for (const [y, vals] of Object.entries(byYear)) {
      const need = t.prdSe === 'M' ? 12 : 1;
      if (vals.length !== need) throw new Error(`wage ${t.tblId} ${y}: ${vals.length} values, expected ${need}`);
      out.push([Number(y), vals.reduce((a, b) => a + b, 0) / vals.length, t.tblId]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export async function loadData(cachePath) {
  if (cachePath && existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'));
  const monthly = {};
  for (const s of SERIES) {
    if (s.src === 'cpi') monthly[s.code] = await fetchCpi(s.code);
    if (s.src === 'ecos') monthly[s.code] = await fetchKb(s.code);
  }
  for (const [code, rows] of Object.entries(monthly)) {
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    if (rows[0]?.[0] !== START) throw new Error(`${code}: series does not start at ${START} (starts ${rows[0]?.[0]})`);
  }
  const data = { monthly, wage: await fetchWage() };
  if (cachePath) writeFileSync(cachePath, JSON.stringify(data));
  return data;
}

// 연평균 임금을 2000년 = 1로 이은 지수. 표가 바뀌는 해에는 두 표가 겹치는 해가 없어 증가율을 알 수 없다.
// 2008년(-4.3%)과 2011년(+1.0%)은 개편으로 수준이 어긋난 것이 분명해서, 그 해 증가율을 앞뒤 해 증가율의 평균으로 이었다(추정).
// 2002년(+11.2%)과 2020년(+0.7%)은 앞뒤 흐름과 크게 다르지 않아 원자료 그대로 둔다.
export const WAGE_BREAK_YEARS = [2008, 2011];
export function chainWage(rows) {
  const val = Object.fromEntries(rows.map(([y, v]) => [y, v]));
  const g = y => val[y] / val[y - 1] - 1;
  const idx = { 2000: 1 };
  for (let y = 2001; y <= 2025; y += 1) {
    if (!(y in val)) throw new Error(`wage: missing ${y}`);
    const growth = WAGE_BREAK_YEARS.includes(y) ? (g(y - 1) + g(y + 1)) / 2 : g(y);
    idx[y] = idx[y - 1] * (1 + growth);
  }
  return Object.entries(idx).map(([y, v]) => [Number(y) * 12 + 6, (v - 1) * 100]); // 7월 위치에 점
}

// ─── Drawing ────────────────────────────────────────────────────────────────

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const txt = (x, y, s, size, fill, { weight = 400, anchor = 'start', spacing = 0 } = {}) =>
  `<text x="${x}" y="${Math.round(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(s)}</text>`;
const monthIndex = p => Number(p.slice(0, 4)) * 12 + Number(p.slice(4, 6)) - 1;
const koMonth = p => `${p.slice(0, 4)}년 ${Number(p.slice(4, 6))}월`;
const pct = v => `${v >= 0 ? '+' : '-'}${Math.abs(Math.round(v)).toLocaleString('en-US')}%`;

// 끝값이 가까운 라벨을 위아래로 벌린다. 위에서부터 minGap 이상 떨어지게 한 번 밀고, 아래가 넘치면 되올린다.
export function spreadLabels(ys, minGap, top, bottom) {
  const order = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]);
  const out = order.map(([y]) => y);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.max(out[i], i === 0 ? top : out[i - 1] + minGap);
  for (let i = out.length - 1; i >= 0; i -= 1) out[i] = Math.min(out[i], i === out.length - 1 ? bottom : out[i + 1] - minGap);
  const res = [];
  order.forEach(([, idx], k) => { res[idx] = out[k]; });
  return res;
}

function seriesPoints(def, data) {
  if (def.src === 'wage') return chainWage(data.wage);
  const rows = data.monthly[def.code];
  if (!rows) throw new Error(`missing series ${def.code}`);
  return rows.map(([p, v]) => [monthIndex(p), (v / rows[0][1] - 1) * 100]);
}

export function buildChartSvg(data) {
  const series = SERIES.map(def => ({ ...def, pts: seriesPoints(def, data) }));

  const plot = { l: 150, r: 1160, t: 270, b: 900 };
  const x0 = monthIndex(START);
  const x1 = Math.max(...series.filter(s => s.src !== 'wage').map(s => s.pts.at(-1)[0]));
  const factor = v => 1 + v / 100;
  const lo = Math.log(0.5), hi = Math.log(5.5);
  const X = m => plot.l + ((m - x0) / (x1 - x0)) * (plot.r - plot.l);
  const Y = v => plot.b - ((Math.log(factor(v)) - lo) / (hi - lo)) * (plot.b - plot.t);

  let o = '';
  // 로그 눈금: 0.5배, 1배, 2배, 3배, 5배 (= -50%, 0, +100%, +200%, +400%)
  for (const v of [-50, 0, 100, 200, 400]) {
    o += `<line x1="${plot.l}" y1="${Y(v)}" x2="${plot.r}" y2="${Y(v)}" stroke="${v === 0 ? '#3A4D6E' : C.grid}" stroke-width="${v === 0 ? 1.6 : 1}"/>`;
    o += txt(plot.l - 22, Y(v) + 6, `${v > 0 ? '+' : ''}${v}%`, 20, C.axis, { anchor: 'end' });
  }
  for (let yr = 2000; yr <= 2025; yr += 5) {
    const x = X(yr * 12);
    o += `<line x1="${x}" y1="${plot.t}" x2="${x}" y2="${plot.b}" stroke="${C.grid}" stroke-width="1"/>`;
    o += txt(x, plot.b + 40, String(yr), 20, C.axis, { anchor: 'middle' });
  }
  o += txt(X(x1), plot.b + 40, String(Math.floor(x1 / 12)), 20, C.axis, { anchor: 'middle' });
  o += txt(plot.r - 8, Y(0) + 26, '기준선: 2000년 = 0%', 18, C.axis, { anchor: 'end' });

  // 선: 전체 물가는 점선을 맨 위에 그려 겹쳐도 보이게 한다.
  const ordered = [...series].sort((a, b) => Number(!!a.dashed) - Number(!!b.dashed));
  for (const s of ordered) {
    const d = s.pts.map(([m, v], i) => `${i ? 'L' : 'M'}${X(m).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    o += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.dashed ? 3 : s.thick ? 4.6 : 3.2}" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="9 7"' : ''}/>`;
  }

  // 오른쪽 끝 라벨. 임금은 2025년이 끝이라 선 끝에서 라벨까지 점선으로 이어 준다.
  const endY = series.map(s => Y(s.pts.at(-1)[1]));
  const labelY = spreadLabels(endY, 40, plot.t - 6, plot.b + 6);
  series.forEach((s, i) => {
    const v = s.pts.at(-1)[1];
    const ex = X(s.pts.at(-1)[0]);
    const note = s.src === 'wage' ? ' · 2025년' : '';
    o += `<circle cx="${ex}" cy="${endY[i]}" r="4.5" fill="${s.color}"/>`;
    o += `<path d="M${ex + 6} ${endY[i]} L${plot.r + 22} ${endY[i]} L${plot.r + 40} ${labelY[i]}" fill="none" stroke="${s.color}" stroke-opacity="0.55" stroke-width="1.3"${s.src === 'wage' ? ' stroke-dasharray="3 5"' : ''}/>`;
    o += `<text x="${plot.r + 48}" y="${Math.round(labelY[i] + 8)}" font-size="25" fill="${C.ink}">` +
      `<tspan fill="${s.color}" font-weight="700">${esc(s.label)}</tspan><tspan fill="${C.sub}"> (${pct(v)}${note})</tspan></text>`;
  });

  // 머리말·꼬리말
  const last = code => data.monthly[code].at(-1)[0];
  const head = txt(130, 84, 'KK & FRIENDS', 26, C.accent, { weight: 700, spacing: 3 })
    + `<text x="130" y="170" font-size="64" font-weight="700" fill="${C.ink}">2000년 이후 <tspan font-weight="400" fill="${C.sub}">(월급·물가·집값은 얼마나 올랐나)</tspan></text>`
    + txt(130, 222, '한국 소비자물가·아파트값·월평균 임금의 누적 변동 · 2000년 대비 · 로그 눈금', 26, C.sub);
  const foot = `<line x1="130" y1="${H - 138}" x2="${W - 30}" y2="${H - 138}" stroke="${C.grid}"/>`
    + txt(130, H - 104, '출처: 통계청(국가데이터처) KOSIS 소비자물가지수(전국) · 한국은행 ECOS 주택매매가격지수(KB국민은행) · 고용노동부 사업체노동력조사(5인 이상 임금총액). 정보 제공 목적입니다.', 18, C.axis)
    + txt(130, H - 76, `끝점: 물가 ${koMonth(last('0'))}, 아파트값 ${koMonth(last('P63AC'))}, 임금 2025년 연평균. 물가·아파트값은 2000년 1월, 임금은 2000년 연평균 기준입니다. 주택임차료는 집값이 아닌 전·월세 물가입니다.`, 17, '#6F819B')
    + txt(130, H - 50, `임금은 통계 개편으로 표가 나뉘어 있어 이었습니다. 수준이 어긋난 ${WAGE_BREAK_YEARS.join('·')}년은 전후 해 증가율의 평균으로 추정했습니다. 통신 일시 급락(2020년 10월, 2025년 8월)은 원자료 그대로입니다.`, 17, '#6F819B')
    + txt(W - 40, H - 22, 'www.kkandfriends.com', 24, C.accent, { weight: 700, anchor: 'end' });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0D1730"/><stop offset="1" stop-color="#070B16"/></linearGradient></defs>`
    + `<rect width="100%" height="100%" fill="url(#bg)"/><rect width="100%" height="6" fill="${C.accent}"/>`
    + `<g font-family="Pretendard">${head}${o}${foot}</g></svg>`;
  return { svg, series };
}

export async function renderPng(svg) {
  const { Resvg } = await import('@resvg/resvg-js');
  return new Resvg(svg, {
    font: { fontFiles: CARD_FONTS, loadSystemFonts: false, defaultFontFamily: 'Pretendard' },
  }).render().asPng();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--cache');
  const cache = ci >= 0 ? args[ci + 1] : null;
  const out = args.find((a, i) => !a.startsWith('--') && i !== ci + 1);
  if (!out) {
    console.error('usage: node scripts/kr-price-chart.mjs out.png [--cache data.json]');
    process.exit(2);
  }
  const data = await loadData(cache);
  const { svg, series } = buildChartSvg(data);
  writeFileSync(out, await renderPng(svg));
  console.log(`ok ${W}x${H} ${out}`);
  for (const s of series) console.log(`  ${s.label.padEnd(14)} ${pct(s.pts.at(-1)[1])}`);
}
