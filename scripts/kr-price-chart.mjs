// 한국 물가 누적 변동 차트 (2026-10-22 KK 요청: 미국 BLS 차트의 한국판, 사이트 톤으로).
//
//   node scripts/kr-price-chart.mjs out.png                 # KOSIS에서 받아 그린다
//   node scripts/kr-price-chart.mjs out.png --cache d.json  # d.json이 있으면 읽고, 없으면 받아서 저장
//
// 자료: KOSIS 101 / DT_1J22001 「지출목적별 소비자물가지수(품목포함, 2020=100)」, 전국, 월간.
// 2000년 1월 값을 1로 두고 매달의 누적 변동률을 그린다. 키는 KOSIS_API_KEY(환경변수).
// Claude Code 컨테이너에서는 NODE_USE_ENV_PROXY=1을 앞에 붙인다.
//
// 모양은 KK & FRIENDS 차트 카드(1600x1140, 남색 바탕, 오른쪽 끝에 색깔 라벨)이고,
// 글꼴은 레포의 Pretendard(fonts/)만 쓴다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { callKosis } from '../lib/stats/kosis.js';
import { CARD_FONTS } from '../lib/ig-card.js';

export const W = 1600;
export const H = 1140;
const START = '200001';

// 위에서부터 그리는 순서가 아니라 라벨이 겹치지 않게 끝값 순으로 자동 배치된다.
export const SERIES = [
  { code: 'A', label: '식료품·비주류음료', color: '#FFC857' },
  { code: 'K', label: '음식·숙박(외식 포함)', color: '#FF8A65' },
  { code: 'J', label: '교육', color: '#B79CFF' },
  { code: '0', label: '소비자물가 전체', color: '#FFFFFF', dashed: true },
  { code: 'F031', label: '병원 서비스', color: '#5FD3A5' },
  { code: 'D011', label: '주택임차료(전·월세)', color: '#5BA4F5' },
  { code: 'H', label: '통신', color: '#7FDBE8' },
  { code: 'H03102', label: '휴대전화료', color: '#F78FB3' },
];

const C = { bg: '#0A0F1E', grid: '#1C2A44', axis: '#8193AB', ink: '#F2F5FA', sub: '#B9C6D6', accent: '#4A90D9' };

// ─── Data ───────────────────────────────────────────────────────────────────

async function fetchSeries(code) {
  const res = await callKosis('Param/statisticsParameterData.do', {
    orgId: '101', tblId: 'DT_1J22001', prdSe: 'M', startPrdDe: START, endPrdDe: '203012',
    objL1: 'T10', objL2: code, itmId: 'T',
  });
  if (!res.ok) throw new Error(`${code}: ${res.error}`);
  const rows = res.rows.map(r => [String(r.PRD_DE), Number(r.DT)]).filter(([, v]) => Number.isFinite(v));
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  if (rows[0]?.[0] !== START) throw new Error(`${code}: series does not start at ${START} (starts ${rows[0]?.[0]})`);
  return { code, name: res.rows[0].C2_NM, rows };
}

export async function loadData(cachePath) {
  if (cachePath && existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'));
  const series = [];
  for (const s of SERIES) series.push(await fetchSeries(s.code)); // 한 번에 하나씩, KOSIS가 느리다
  const asOf = series.map(s => s.rows.at(-1)[0]).reduce((a, b) => (a < b ? a : b));
  const data = { asOf, series };
  if (cachePath) writeFileSync(cachePath, JSON.stringify(data));
  return data;
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

export function buildChartSvg(data) {
  const series = SERIES.map(def => {
    const found = data.series.find(s => s.code === def.code);
    if (!found) throw new Error(`missing series ${def.code}`);
    const base = found.rows[0][1];
    return { ...def, pts: found.rows.map(([p, v]) => [monthIndex(p), (v / base - 1) * 100]), end: found.rows.at(-1) };
  });

  const plot = { l: 150, r: 1160, t: 270, b: 900 };
  const x0 = monthIndex(START);
  const x1 = Math.max(...series.map(s => s.pts.at(-1)[0]));
  const yMin = -50, yMax = 200;
  const X = m => plot.l + ((m - x0) / (x1 - x0)) * (plot.r - plot.l);
  const Y = v => plot.b - ((v - yMin) / (yMax - yMin)) * (plot.b - plot.t);

  let o = '';
  // 격자와 세로축
  for (let v = yMin; v <= yMax; v += 50) {
    o += `<line x1="${plot.l}" y1="${Y(v)}" x2="${plot.r}" y2="${Y(v)}" stroke="${v === 0 ? '#3A4D6E' : C.grid}" stroke-width="${v === 0 ? 1.6 : 1}"/>`;
    o += txt(plot.l - 22, Y(v) + 6, `${v > 0 ? '+' : ''}${v}%`, 20, C.axis, { anchor: 'end' });
  }
  for (let yr = 2000; yr <= 2025; yr += 5) {
    const x = X(yr * 12);
    o += `<line x1="${x}" y1="${plot.t}" x2="${x}" y2="${plot.b}" stroke="${C.grid}" stroke-width="1"/>`;
    o += txt(x, plot.b + 40, String(yr), 20, C.axis, { anchor: 'middle' });
  }
  o += txt(X(x1), plot.b + 40, String(Math.floor(x1 / 12)), 20, C.axis, { anchor: 'middle' });
  o += txt(plot.l + 8, plot.b - 14, '기준선: 2000년 1월 = 0%', 18, C.axis);

  // 선: 전체 물가는 점선, 나머지는 실선. 전체 물가를 맨 위에 올려 겹쳐도 보이게 마지막에 그린다.
  const ordered = [...series].sort((a, b) => Number(!!a.dashed) - Number(!!b.dashed));
  for (const s of ordered) {
    const d = s.pts.map(([m, v], i) => `${i ? 'L' : 'M'}${X(m).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    o += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.dashed ? 3 : 3.4}" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="9 7"' : ''}/>`;
  }

  // 오른쪽 끝 라벨
  const endY = series.map(s => Y(s.pts.at(-1)[1]));
  const labelY = spreadLabels(endY, 40, plot.t - 6, plot.b);
  series.forEach((s, i) => {
    const v = s.pts.at(-1)[1];
    const ex = X(s.pts.at(-1)[0]);
    o += `<circle cx="${ex}" cy="${endY[i]}" r="4.5" fill="${s.color}"/>`;
    o += `<path d="M${ex + 6} ${endY[i]} L${plot.r + 22} ${endY[i]} L${plot.r + 40} ${labelY[i]}" fill="none" stroke="${s.color}" stroke-opacity="0.55" stroke-width="1.3"/>`;
    o += `<text x="${plot.r + 48}" y="${Math.round(labelY[i] + 8)}" font-size="26" fill="${C.ink}">` +
      `<tspan fill="${s.color}" font-weight="700">${esc(s.label)}</tspan><tspan fill="${C.sub}"> (${pct(v)})</tspan></text>`;
  });

  // 머리말·꼬리말
  const asOf = koMonth(data.asOf);
  const head = txt(130, 84, 'KK & FRIENDS', 26, C.accent, { weight: 700, spacing: 3 })
    + `<text x="130" y="170" font-size="64" font-weight="700" fill="${C.ink}">2000년 이후 <tspan font-weight="400" fill="${C.sub}">(26년간 무엇이 얼마나 올랐나)</tspan></text>`
    + txt(130, 222, '한국 소비자물가 품목별 누적 변동 · 2000년 1월 대비 · 전국', 26, C.sub);
  const foot = `<line x1="130" y1="${H - 128}" x2="${W - 30}" y2="${H - 128}" stroke="${C.grid}"/>`
    + txt(130, H - 92, '출처: 통계청(국가데이터처) KOSIS, 지출목적별 소비자물가지수(품목포함, 2020=100), 전국 월간. 정보 제공 목적입니다.', 20, C.axis)
    + txt(130, H - 60, `2020년 기준 지수를 2000년 1월 = 1로 다시 환산했고, 끝점은 ${asOf}입니다. 주택임차료는 집값이 아니라 전세·월세 물가입니다.`, 18, '#6F819B')
    + txt(130, H - 32, '통신·휴대전화료의 일시 급락(2020년 10월, 2025년 8월)은 원자료 그대로입니다. 임금은 이 통계표에 없어 넣지 않았습니다.', 18, '#6F819B')
    + txt(W - 40, H - 40, 'www.kkandfriends.com', 24, C.accent, { weight: 700, anchor: 'end' });

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
  console.log(`ok ${W}x${H} ${out} (끝점 ${koMonth(data.asOf)})`);
  for (const s of series) console.log(`  ${s.label.padEnd(14)} ${pct(s.pts.at(-1)[1])}`);
}
