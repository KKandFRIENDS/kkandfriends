// ============================================================================
//  kosis.js — KOSIS 국가통계포털 (통계청) open API: 물가, 인구, and the other
//  official series the Bank of Korea does not publish.
//
//  Same contract as lib/ecos.js: BEST EFFORT, ALWAYS. Nothing here throws, the
//  key never appears in an error string, and an indicator that has not been
//  confirmed against a live response is OFF by default.
//
//  ── What is verified and what is not (2026-10-21) ───────────────────────────
//  VERIFIED against the live service, with a dummy key (no real key was in
//  that session): the two endpoint paths below exist and answer with HTTP 200
//  and a JSON error object { err, errMsg } (err "11" = invalid key).
//  NOT VERIFIED: the success payload field names (PRD_DE, DT, UNIT_NM, ITM_NM,
//  C1_NM, TBL_NM, ...) and every 통계표 ID in INDICATORS. They come from the
//  KOSIS API guide as remembered, not from a response. Until
//  `node scripts/stats-probe.mjs kosis-cpi` has confirmed them against a real
//  key, each indicator carries verified:false and is skipped unless
//  KOSIS_UNVERIFIED=1. 확인 필요 — do not flip `verified` by guess.
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
export async function callKosis(path, params = {}) {
  if (!apiKey()) return { ok: false, error: 'KOSIS_API_KEY is not set' };
  const res = await getJson(
    withQuery(`${BASE}/${path}`, { method: 'getList', apiKey: apiKey(), format: 'json', jsonVD: 'Y', ...params }),
    { secrets: [apiKey()] },
  );
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
  // 소비자물가지수. 101 = 통계청, DT_1J22003 = 소비자물가지수(품목성질별), 2020=100.
  // 확인 필요: table id and the label regexes below.
  cpi: {
    label: '소비자물가지수(총지수)',
    orgId: '101',
    tblId: 'DT_1J22003',
    prdSe: 'M',
    verified: false,
    pick: (rows) => latest(rows, (r) => /^총지수$/.test(r.class1) && /소비자물가지수/.test(r.item) && !/등락|증감|전년|전월/.test(r.item)),
  },
  // 인구. The table id is not known yet; run `stats-probe kosis-search 주민등록인구`
  // with a real key, read the candidates, and fill orgId/tblId and `pick` in.
  population: {
    label: '주민등록인구',
    orgId: null,
    tblId: null,
    prdSe: 'M',
    verified: false,
    needsDiscovery: true,
    search: '주민등록인구',
    pick: () => null,
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
    const res = await fetchKosisSeries({ orgId: entry.orgId, tblId: entry.tblId, prdSe: entry.prdSe });
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
