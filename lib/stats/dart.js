// ============================================================================
//  dart.js — OpenDART (금융감독원 전자공시): what companies have just told the
//  market they will do with their capital.
//
//  Two uses, kept apart on purpose:
//
//   1. Briefs get AGGREGATES only (fetchDisclosureSnapshot): "N rights issues,
//      M convertible bonds, split by market". The manifesto says 종목을 찍지
//      않는다, and a company name next to a 유상증자 headline reads as a call.
//   2. KK's drafts get company-level lines (fetchMajorReports + fetchFilingDetail)
//      through scripts/stats-card.mjs, where KK decides what to name.
//
//  Same contract as lib/ecos.js: BEST EFFORT, ALWAYS. No key, a blocked host, a
//  renamed field: each resolves to { ok: false, error } or an empty list and
//  the caller carries on. Nothing here throws and the key never appears in an
//  error string.
//
//  Verified against live calls on 2026-10-21 (list.json, piicDecsn.json,
//  cvbdIsDecsn.json). Status "000" is success, "013" is "no rows" (not a
//  failure). DART answers 200 OK even when it refuses you, so the verdict is in
//  the payload.
//
//  Env: DART_API_KEY. Issue one at https://opendart.fss.or.kr → 인증키 신청.
// ============================================================================

import { getJson, withQuery, kstYmd, isoFromYmd, isoFromKoreanDate, toNumber, formatWon } from './http.js';

const BASE = 'https://opendart.fss.or.kr/api';
const PAGE_COUNT = 100;
const MAX_PAGES = 5;

const apiKey = () => (process.env.DART_API_KEY || '').trim();

export function dartConfigured() {
  return Boolean(apiKey());
}

// 주요사항보고서 (pblntf_ty=B) report names we care about. The list endpoint
// returns the report name as "주요사항보고서(유상증자결정)", sometimes prefixed
// "[기재정정]". Matching is by keyword, not exact string.
export const KINDS = [
  { id: 'rights', label: '유상증자 결정', re: /유상증자결정/ },
  { id: 'bonus', label: '무상증자 결정', re: /무상증자결정/ },
  { id: 'cb', label: '전환사채 발행 결정', re: /전환사채권발행결정/ },
  { id: 'eb', label: '교환사채 발행 결정', re: /교환사채권발행결정/ },
  { id: 'bw', label: '신주인수권부사채 발행 결정', re: /신주인수권부사채권발행결정/ },
  { id: 'reduction', label: '감자 결정', re: /감자결정/ },
  { id: 'buyback', label: '자기주식 취득·처분 결정', re: /자기주식(?:취득|처분)결정/ },
  { id: 'merger', label: '회사합병 결정', re: /회사합병결정/ },
];

const MARKETS = { Y: '유가증권', K: '코스닥', N: '코넥스', E: '기타' };
const AMENDED = /^\[(?:기재정정|첨부정정|첨부추가)\]/;

export function classifyReport(reportNm) {
  const name = String(reportNm ?? '');
  const kind = KINDS.find((k) => k.re.test(name));
  return { kind: kind?.id ?? null, label: kind?.label ?? '', amended: AMENDED.test(name) };
}

export function dartUrl(rceptNo) {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(rceptNo)}`;
}

// One place where every DART quirk is absorbed. { ok, list, total, totalPage }
// or { ok: false, error }.
export async function callDart(path, params = {}) {
  if (!apiKey()) return { ok: false, error: 'DART_API_KEY is not set' };
  const res = await getJson(withQuery(`${BASE}/${path}`, { crtfc_key: apiKey(), ...params }), {
    secrets: [apiKey()],
  });
  if (!res.ok) return res;

  const j = res.json || {};
  if (j.status === '013') return { ok: true, list: [], total: 0, totalPage: 0 };
  if (j.status !== '000') return { ok: false, error: `DART ${j.status ?? '?'}: ${j.message || ''}`.trim() };
  const list = Array.isArray(j.list) ? j.list : [];
  return {
    ok: true,
    list,
    total: Number(j.total_count) || list.length,
    totalPage: Number(j.total_page) || 1,
  };
}

// ─── The day's filings ──────────────────────────────────────────────────────

// Scan 주요사항보고서 from `days` ago through today (Korea time) and keep the
// kinds in KINDS. Returns { ok, items, scanned, truncated, from, to }.
export async function fetchMajorReports({ days = 1, now = new Date(), maxPages = MAX_PAGES } = {}) {
  const from = kstYmd(now, -(Math.max(1, days) - 1));
  const to = kstYmd(now);
  const items = [];
  let scanned = 0;
  let truncated = false;

  for (let page = 1; page <= maxPages; page += 1) {
    const res = await callDart('list.json', {
      bgn_de: from, end_de: to, pblntf_ty: 'B', page_no: page, page_count: PAGE_COUNT,
    });
    if (!res.ok) return { ok: false, error: res.error };

    scanned += res.list.length;
    for (const row of res.list) {
      const c = classifyReport(row.report_nm);
      if (!c.kind) continue;
      items.push({
        corpName: String(row.corp_name ?? ''),
        corpCode: String(row.corp_code ?? ''),
        stockCode: String(row.stock_code ?? '').trim(),
        market: MARKETS[row.corp_cls] ?? '기타',
        kind: c.kind,
        label: c.label,
        amended: c.amended,
        reportNm: String(row.report_nm ?? ''),
        rceptNo: String(row.rcept_no ?? ''),
        rceptDt: String(row.rcept_dt ?? ''),
        url: dartUrl(row.rcept_no),
      });
    }
    if (page >= res.totalPage) break;
    if (page === maxPages) truncated = true;
  }
  return { ok: true, items, scanned, truncated, from, to };
}

// ─── Aggregates for the briefs ──────────────────────────────────────────────

// Count NEW filings by kind and market. Amendments are excluded: a 기재정정 is
// the same decision filed again, and counting it twice overstates the day.
export function summarizeReports(items) {
  const byKind = new Map();
  for (const it of items) {
    if (it.amended) continue;
    const row = byKind.get(it.kind) ?? { label: it.label, total: 0, markets: new Map() };
    row.total += 1;
    row.markets.set(it.market, (row.markets.get(it.market) ?? 0) + 1);
    byKind.set(it.kind, row);
  }
  return KINDS.filter((k) => byKind.has(k.id)).map((k) => {
    const row = byKind.get(k.id);
    const markets = [...row.markets.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`);
    return { kind: k.id, label: row.label, total: row.total, markets };
  });
}

// Ready-to-print lines. Carries the period and the as-of clock so the model
// cannot quote a 17:30 count as if it were the whole day.
export function formatSummaryLines(summary, { from, to, asOf = '' } = {}) {
  const period = from === to ? isoFromYmd(to) : `${isoFromYmd(from)}~${isoFromYmd(to)}`;
  const tail = asOf ? `, ${asOf} 접수분까지` : '';
  return summary.map((s) => ({
    name: s.label,
    value: String(s.total),
    unit: '건',
    asOf: period,
    source: 'DART',
    formatted: `주요사항보고서 ${s.label} ${s.total}건 (${s.markets.join(', ')}; 신규 접수 기준, ${period}${tail})`,
  }));
}

// Never throws. { ok, lines, from, to, scanned, truncated } or { ok: false, error }.
export async function fetchDisclosureSnapshot({ days = 1, now = new Date(), asOf = '' } = {}) {
  try {
    const res = await fetchMajorReports({ days, now });
    if (!res.ok) return { ok: false, error: res.error, lines: [] };
    const lines = formatSummaryLines(summarizeReports(res.items), { from: res.from, to: res.to, asOf });
    return { ok: true, lines, from: res.from, to: res.to, scanned: res.scanned, truncated: res.truncated };
  } catch (err) {
    return { ok: false, error: `dart: ${String(err?.message || err)}`, lines: [] };
  }
}

// ─── Company-level detail (drafts only) ─────────────────────────────────────

const DETAIL_ENDPOINT = { rights: 'piicDecsn.json', cb: 'cvbdIsDecsn.json' };

function ymdToDate(ymd) {
  const iso = isoFromYmd(ymd);
  return iso ? new Date(`${iso}T00:00:00+09:00`) : new Date();
}

// Parse the rights-issue row (piicDecsn) into numbers and one printable line.
export function parseRightsIssue(row, corpName = '') {
  const newShares = toNumber(row?.nstk_ostk_cnt);
  const preShares = toNumber(row?.bfic_tisstk_ostk);
  if (newShares === null) return null;
  const method = String(row?.ic_mthn ?? '').trim();
  const ratio = preShares ? Math.round((newShares / preShares) * 1000) / 10 : null;
  const name = corpName || String(row?.corp_name ?? '');
  const pre = preShares ? `, 증자 전 보통주 ${preShares.toLocaleString('ko-KR')}주의 ${ratio}%` : '';
  return {
    newShares, preShares, ratio, method,
    formatted: `${name} 유상증자${method ? `(${method})` : ''} 신주 보통주 ${newShares.toLocaleString('ko-KR')}주${pre}`,
  };
}

// Parse the convertible-bond row (cvbdIsDecsn).
export function parseConvertibleBond(row, corpName = '') {
  const face = toNumber(row?.bd_fta);
  if (face === null) return null;
  const coupon = String(row?.bd_intr_ex ?? '').trim();
  const ytm = String(row?.bd_intr_sf ?? '').trim();
  const conv = toNumber(row?.cv_prc);
  const maturity = isoFromKoreanDate(row?.bd_mtd);
  const board = isoFromKoreanDate(row?.bddd);
  const tranche = String(row?.bd_tm ?? '').trim();
  const name = corpName || String(row?.corp_name ?? '');
  const parts = [
    `${name} 전환사채${tranche ? ` ${tranche}회차` : ''} ${formatWon(face)}`,
    coupon ? `표면이자율 ${coupon}%` : '',
    ytm ? `만기이자율 ${ytm}%` : '',
    conv !== null ? `전환가액 ${conv.toLocaleString('ko-KR')}원` : '',
    maturity ? `만기 ${maturity}` : '',
  ].filter(Boolean);
  return {
    face, coupon, ytm, convPrice: conv, maturity, board, tranche,
    formatted: `${parts.join(', ')}${board ? ` (이사회결의 ${board})` : ''}`,
  };
}

// Detail for one filing. Only 유상증자 and 전환사채 have a detail endpoint here;
// any other kind returns { ok: false } and the caller prints the headline only.
export async function fetchFilingDetail(item) {
  const path = DETAIL_ENDPOINT[item?.kind];
  if (!path) return { ok: false, error: 'no detail endpoint for this kind' };

  const end = String(item.rceptDt || kstYmd());
  const res = await callDart(path, {
    corp_code: item.corpCode,
    bgn_de: kstYmd(ymdToDate(end), -90),
    end_de: end,
  });
  if (!res.ok) return { ok: false, error: res.error };

  // The same company can have several decisions in the window; the receipt
  // number is what ties a row to the filing we are describing.
  const row = res.list.find((r) => String(r.rcept_no) === item.rceptNo) ?? null;
  if (!row) return { ok: false, error: 'filing not found in detail window' };

  const parsed = item.kind === 'rights'
    ? parseRightsIssue(row, item.corpName)
    : parseConvertibleBond(row, item.corpName);
  if (!parsed) return { ok: false, error: 'detail fields missing or non-numeric' };
  return { ok: true, detail: parsed, formatted: parsed.formatted, url: item.url };
}
