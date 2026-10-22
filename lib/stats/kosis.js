// ============================================================================
//  kosis.js — KOSIS 국가통계포털 (통계청) open API: 물가, 인구, and the other
//  official series the Bank of Korea does not publish.
//
//  Same contract as lib/ecos.js: BEST EFFORT, ALWAYS. Nothing here throws, the
//  key never appears in an error string, and an indicator that has not been
//  confirmed against a live response is OFF by default.
//
//  ── What is verified and what is not (2026-10-21) ───────────────────────────
//  VERIFIED against live responses with a real key (stats-probe kosis-cpi,
//  kosis-search, and direct reads): both endpoint paths; the success payload
//  field names (PRD_DE, DT, UNIT_NM, ITM_NM, ITM_ID, C1, C1_NM, TBL_NM); and the
//  two indicators below, each read to its latest value (cpi 202609 = 120.43,
//  population 202609 = 51,082,431). Rows are strings in DT, periods YYYYMM.
//  NOT VERIFIED: the monthly 인구동향 table (DT_1B8000G) timed out on the one
//  try, so births/deaths are not wired. 확인 필요.
//
//  Env: KOSIS_API_KEY. Issue one at https://kosis.kr/openapi → 활용신청.
// ============================================================================

import { getJson, withQuery, toNumber } from './http.js';

const BASE = 'https://kosis.kr/openapi';
const apiKey = () => (process.env.KOSIS_API_KEY || '').trim();

export function kosisConfigured() {
  return Boolean(apiKey());
}

// ─── Transport ──────────────────────────────────────────────────────────────

// KOSIS answers a bad request with HTTP 200 and an object { err, errMsg }, and
// a good one with an ARRAY of rows. { ok, rows } or { ok: false, error }.
//
// KOSIS is the slowest of the four APIs: on 2026-10-22 three card runs each lost
// one of the two series to the old 8 s limit. So it gets 15 s and ONE retry, and
// only for transport failures (timeout, reset, HTTP 5xx). A KOSIS error object
// (bad key, bad table) is an answer, not a glitch, and is never retried.
const KOSIS_TIMEOUT = 15000;
const KOSIS_RETRIES = 1;
const transient = (error) => /^request failed/.test(error ?? '') || /^HTTP 5\d\d$/.test(error ?? '');

export async function callKosis(path, params = {}) {
  if (!apiKey()) return { ok: false, error: 'KOSIS_API_KEY is not set' };
  const url = withQuery(`${BASE}/${path}`, { method: 'getList', apiKey: apiKey(), format: 'json', jsonVD: 'Y', ...params });

  let res;
  for (let attempt = 0; attempt <= KOSIS_RETRIES; attempt += 1) {
    res = await getJson(url, { secrets: [apiKey()], timeout: KOSIS_TIMEOUT });
    if (res.ok || !transient(res.error)) break;
  }
  if (!res.ok) return res;

  const json = res.json;
  if (Array.isArray(json)) return { ok: true, rows: json };
  if (json && typeof json === 'object' && 'err' in json) {
    return { ok: false, error: `KOSIS ${json.err}: ${json.errMsg || ''}`.trim() };
  }
  return { ok: false, error: 'unexpected KOSIS payload shape' };
}

// One value series. `itmId` and `objL1` default to ALL so a table can be read
// before its codes are known; selection then happens on the returned labels.
export async function fetchKosisSeries({
  orgId, tblId, itmId = 'ALL', objL1 = 'ALL', objL2, prdSe = 'M', newEstPrdCnt = 2,
}) {
  const res = await callKosis('Param/statisticsParameterData.do', {
    orgId, tblId, itmId, objL1, objL2, prdSe, newEstPrdCnt,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    rows: res.rows.map((r) => ({
      period: String(r.PRD_DE ?? ''),
      value: toNumber(r.DT),
      rawValue: String(r.DT ?? ''),
      unit: String(r.UNIT_NM ?? ''),
      item: String(r.ITM_NM ?? ''),
      itemId: String(r.ITM_ID ?? ''),
      class1: String(r.C1_NM ?? ''),
      class1Id: String(r.C1 ?? ''),
      table: String(r.TBL_NM ?? ''),
    })),
  };
}

// Table search by name. Used by the probe to discover orgId and tblId; the
// response field names are not verified, so the raw rows are returned as well.
export async function searchKosisTables(name, { count = 10 } = {}) {
  const res = await callKosis('statisticsSearch.do', {
    searchNm: name, sort: 'RANK', startCount: 1, resultCount: count,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    raw: res.rows,
    tables: res.rows.map((r) => ({
      orgId: String(r.ORG_ID ?? ''),
      tblId: String(r.TBL_ID ?? ''),
      tblNm: String(r.TBL_NM ?? ''),
      orgNm: String(r.ORG_NM ?? ''),
    })),
  };
}

// ─── Indicators ─────────────────────────────────────────────────────────────

export function tableUrl(orgId, tblId) {
  return `https://kosis.kr/statHtml/statHtml.do?orgId=${encodeURIComponent(orgId)}&tblId=${encodeURIComponent(tblId)}`;
}

// 202609 -> "2026년 9월", 2026 -> "2026년"; anything else is printed as given.
export function formatPeriod(period) {
  const p = String(period ?? '').trim();
  if (/^\d{6}$/.test(p)) return `${p.slice(0, 4)}년 ${Number(p.slice(4, 6))}월`;
  if (/^\d{4}$/.test(p)) return `${p}년`;
  return p;
}

// Latest-period row that satisfies `match`. KOSIS returns several periods
// (newEstPrdCnt), so the newest period is chosen by comparing strings, which is
// safe for the YYYY / YYYYMM / YYYYMMDD shapes.
function latest(rows, match) {
  const hits = rows.filter((r) => r.value !== null && match(r));
  if (!hits.length) return null;
  return hits.reduce((a, b) => (b.period > a.period ? b : a));
}

export const INDICATORS = {
  // 소비자물가지수. 101 = 통계청, DT_1J22003 = 소비자물가지수(2020＝100), 시도별.
  // 실제 응답: ITM_NM "소비자물가지수(총지수)", C1_NM "전국"(C1 T10), UNIT_NM "2020＝100"
  // (전각 ＝). 202609 = 120.43. 시도 행이 함께 오므로 전국만 고른다.
  cpi: {
    label: '소비자물가지수(총지수)',
    orgId: '101',
    tblId: 'DT_1J22003',
    prdSe: 'M',
    verified: true,
    pick: (rows) => latest(rows, (r) => r.class1 === '전국' && /^소비자물가지수\(총지수\)$/.test(r.item)),
  },
  // 주민등록인구. 101 = 통계청 포털, DT_1B040A3 = 행정구역(시군구)별 성별 인구수
  // (행정안전부 주민등록, 월간, 최신 202609, 갱신 2026-10-02). objL1 "00" = 전국,
  // ITM_ID T20 = 총인구수(Koreans, 단위 명). 202609 = 51,082,431.
  // 외국인은 포함되지 않는다. 같은 검색 결과의 DT_1YL20651E 등은 열어 보지 않았다.
  population: {
    label: '주민등록인구',
    orgId: '101',
    tblId: 'DT_1B040A3',
    prdSe: 'M',
    objL1: '00',
    itmId: 'T20',
    verified: true,
    pick: (rows) => latest(rows, (r) => r.class1 === '전국' && r.itemId === 'T20'),
  },
};

function enabled(entry) {
  return entry.verified || process.env.KOSIS_UNVERIFIED === '1';
}

// { ok, name, value, unit, asOf, formatted, source, url } or { ok: false, error }.
export async function fetchKosisIndicator(id) {
  const entry = INDICATORS[id];
  if (!entry) return { ok: false, error: `unknown KOSIS indicator: ${id}` };
  if (entry.needsDiscovery || !entry.orgId || !entry.tblId) {
    return { ok: false, error: `${entry.label}: table id not confirmed yet (run stats-probe kosis-search ${entry.search ?? ''})`.trim() };
  }
  if (!enabled(entry)) {
    return { ok: false, error: `${entry.label}: not verified against a live response yet (확인 필요)` };
  }
  try {
    const res = await fetchKosisSeries({ orgId: entry.orgId, tblId: entry.tblId, prdSe: entry.prdSe, objL1: entry.objL1, itmId: entry.itmId });
    if (!res.ok) return { ok: false, error: res.error };
    const row = entry.pick(res.rows);
    if (!row) return { ok: false, error: `${entry.label}: no matching row (labels changed? run stats-probe)` };
    const asOf = formatPeriod(row.period);
    const value = row.value.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
    const unit = row.unit;
    return {
      ok: true,
      id,
      name: entry.label,
      value,
      num: row.value,
      unit,
      period: row.period,
      asOf,
      source: '통계청 KOSIS',
      url: tableUrl(entry.orgId, entry.tblId),
      formatted: `${entry.label} ${value}${unit ? ` ${unit}` : ''} (${asOf} 기준)`,
    };
  } catch (err) {
    return { ok: false, error: `kosis: ${String(err?.message || err)}` };
  }
}
