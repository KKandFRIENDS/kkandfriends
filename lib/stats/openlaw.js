// ============================================================================
//  openlaw.js — 국가법령정보 공동활용 (open.law.go.kr / law.go.kr DRF): which
//  statutes changed, and which changes are already scheduled to take effect.
//
//  The question it answers for a Seoul desk is not "what does the 자본시장법
//  say" but "what moved, and when does it bite". The eflaw search with nw=2
//  returns 시행예정 versions, which is where the next date lives.
//
//  Same contract as lib/ecos.js: BEST EFFORT, ALWAYS. Nothing here throws.
//
//  Verified against live calls on 2026-10-21 (lawSearch.do, target=law and
//  target=eflaw, nw=1 연혁 / nw=2 시행예정 / nw=3 현행). Fields used:
//  법령명한글, 법령일련번호, 공포일자, 시행일자, 제개정구분명, 현행연혁코드.
//  A query is a SUBSTRING match, so "자본시장과 금융투자업에 관한 법률" also
//  returns its 시행령 and 시행규칙; rows are filtered to the exact name asked.
//
//  Transport note: from the Claude Code container HTTPS to law.go.kr is reset
//  by the egress proxy while HTTP works. On the VPS HTTPS is expected to work
//  (확인 필요: not yet tested there); OPENLAW_BASE overrides the base URL either way.
//
//  Env: OPENLAW_OC (the 법제처 OC id, a registration id rather than a secret
//  token, but it is still kept out of logs). Issue one at https://open.law.go.kr
// ============================================================================

import { getJson, withQuery, isoFromYmd } from './http.js';

const oc = () => (process.env.OPENLAW_OC || '').trim();
const base = () => (process.env.OPENLAW_BASE || 'https://www.law.go.kr').replace(/\/+$/, '');

export function openlawConfigured() {
  return Boolean(oc());
}

const ROOT_LAW = '자본시장과 금융투자업에 관한 법률';
export const DEFAULT_LAWS = [ROOT_LAW, `${ROOT_LAW} 시행령`, `${ROOT_LAW} 시행규칙`];

// OPENLAW_WATCH="법령명1,법령명2" replaces the default list (exact names).
export function watchedLaws() {
  const raw = (process.env.OPENLAW_WATCH || '').split(',').map((s) => s.trim()).filter(Boolean);
  return raw.length ? raw : DEFAULT_LAWS;
}

// ─── Transport ──────────────────────────────────────────────────────────────

// { ok, rows } or { ok: false, error }. `law` is one object when there is one
// hit and an array when there are several, and absent when there are none.
export async function callLawSearch(params = {}) {
  if (!oc()) return { ok: false, error: 'OPENLAW_OC is not set' };
  const res = await getJson(
    withQuery(`${base()}/DRF/lawSearch.do`, { OC: oc(), type: 'JSON', ...params }),
    { secrets: [oc()] },
  );
  if (!res.ok) return res;

  const root = res.json?.LawSearch ?? res.json ?? {};
  // A bad OC comes back as a normal 200 with a message instead of a LawSearch.
  if (root.resultCode && String(root.resultCode) !== '00') {
    return { ok: false, error: `OpenLaw ${root.resultCode}: ${root.resultMsg || ''}`.trim() };
  }
  if (!root.target && !root.law && !root.totalCnt) {
    return { ok: false, error: 'unexpected OpenLaw payload shape' };
  }
  const rows = root.law == null ? [] : Array.isArray(root.law) ? root.law : [root.law];
  return { ok: true, rows, total: Number(root.totalCnt) || rows.length };
}

function normalize(row) {
  return {
    name: String(row['법령명한글'] ?? ''),
    mst: String(row['법령일련번호'] ?? ''),
    promulgated: isoFromYmd(row['공포일자']),
    effective: isoFromYmd(row['시행일자']),
    kind: String(row['제개정구분명'] ?? ''),
    status: String(row['현행연혁코드'] ?? ''),
    ministry: String(row['소관부처명'] ?? ''),
  };
}

// nw: 1 = 연혁, 2 = 시행예정, 3 = 현행.
export async function fetchLawVersions(name, nw) {
  const res = await callLawSearch({ target: 'eflaw', query: name, nw, display: 100 });
  if (!res.ok) return res;
  const versions = res.rows.map(normalize).filter((v) => v.name === name);
  return { ok: true, versions };
}

// { ok, name, current, upcoming } — current is the version in force (or null),
// upcoming the scheduled ones, soonest first.
export async function fetchLawStatus(name) {
  const [now3, next2] = await Promise.all([fetchLawVersions(name, 3), fetchLawVersions(name, 2)]);
  if (!now3.ok) return { ok: false, name, error: now3.error };
  if (!next2.ok) return { ok: false, name, error: next2.error };
  const upcoming = [...next2.versions].sort((a, b) => a.effective.localeCompare(b.effective));
  return { ok: true, name, current: now3.versions[0] ?? null, upcoming };
}

// Never throws. ok is true when at least one law could be read; per-law
// failures are listed in `errors` so a partial answer is never mistaken for a
// complete one.
export async function fetchLawWatch({ names = watchedLaws() } = {}) {
  try {
    const settled = await Promise.allSettled(names.map((n) => fetchLawStatus(n)));
    const statuses = [];
    const errors = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled' && s.value.ok) statuses.push(s.value);
      else errors.push(`${names[i]}: ${s.status === 'fulfilled' ? s.value.error : String(s.reason?.message || s.reason)}`);
    });
    return { ok: statuses.length > 0, statuses, errors, error: statuses.length ? undefined : errors.join('; ') };
  } catch (err) {
    return { ok: false, statuses: [], errors: [], error: `openlaw: ${String(err?.message || err)}` };
  }
}

// ─── Change detection ───────────────────────────────────────────────────────

export function stateFrom(statuses) {
  const state = {};
  for (const s of statuses) {
    state[s.name] = {
      currentMst: s.current?.mst ?? '',
      currentEffective: s.current?.effective ?? '',
      upcoming: s.upcoming.map((u) => u.mst),
    };
  }
  return state;
}

// Compare the last saved state with what the API says now. The first run has
// nothing to compare, so it records a baseline and reports no changes: a
// watcher that announced every existing amendment as news on day one would
// teach KK to ignore it.
export function diffLawState(prev, statuses) {
  const next = stateFrom(statuses);
  if (!prev || typeof prev !== 'object' || Object.keys(prev).length === 0) {
    return { baseline: true, changes: [], next };
  }
  const changes = [];
  for (const s of statuses) {
    const before = prev[s.name];
    if (!before) continue;
    if (s.current && before.currentMst && s.current.mst !== before.currentMst) {
      changes.push({
        type: 'in_force',
        name: s.name,
        text: `${s.name}: 현행 버전이 바뀌었습니다 (시행 ${before.currentEffective || '?'} → ${s.current.effective}, ${s.current.kind}, 공포 ${s.current.promulgated})`,
      });
    }
    const known = new Set(before.upcoming ?? []);
    for (const u of s.upcoming) {
      if (known.has(u.mst)) continue;
      changes.push({
        type: 'upcoming',
        name: s.name,
        text: `${s.name}: 시행예정 개정이 추가됐습니다 (공포 ${u.promulgated}, 시행 ${u.effective}, ${u.kind})`,
      });
    }
  }
  return { baseline: false, changes, next };
}

// ─── Printable lines ────────────────────────────────────────────────────────

const DAY = 86400000;
function daysBetween(isoA, isoB) {
  return Math.round((Date.parse(`${isoB}T00:00:00Z`) - Date.parse(`${isoA}T00:00:00Z`)) / DAY);
}

// One ready-to-print line per law. `todayIso` (YYYY-MM-DD, Korea time) decides
// which upcoming dates are still in the future; a date already past is not
// "upcoming" any more even if the API has not refreshed yet.
export function formatLawLines(statuses, todayIso) {
  return statuses.map((s) => {
    const cur = s.current;
    const head = cur
      ? `${s.name} 현행 ${cur.effective} 시행 (${cur.promulgated} 공포, ${cur.kind})`
      : `${s.name} (현행 정보 없음)`;
    const future = s.upcoming.filter((u) => !todayIso || u.effective >= todayIso);
    const tail = future.length
      ? `; 시행예정 개정 ${future.length}건 (시행일 ${future.map((u) => u.effective).join(', ')})`
      : '; 시행예정 개정 없음';
    return {
      name: s.name,
      value: String(future.length),
      unit: '건',
      asOf: cur?.effective ?? '',
      source: '국가법령정보센터',
      formatted: `${head}${tail}`,
    };
  });
}

// Recently promulgated versions (current or upcoming), newest first.
export function recentPromulgations(statuses, todayIso, withinDays = 14) {
  const out = [];
  for (const s of statuses) {
    for (const v of [s.current, ...s.upcoming]) {
      if (!v || !v.promulgated) continue;
      const age = daysBetween(v.promulgated, todayIso);
      if (age >= 0 && age <= withinDays) out.push({ ...v, ageDays: age });
    }
  }
  const seen = new Set();
  return out
    .filter((v) => (seen.has(v.mst) ? false : (seen.add(v.mst), true)))
    .sort((a, b) => a.ageDays - b.ageDays);
}

// ─── Week calendar ──────────────────────────────────────────────────────────

// Versions (in force or scheduled) whose 시행일 falls in [from, to], both
// YYYY-MM-DD and both included. A version that took effect earlier this week
// is "current" by now, so both lists are searched; a version listed in both is
// returned once. Soonest first, then by law name.
export function lawsEffectiveIn(statuses, from, to) {
  const seen = new Set();
  const out = [];
  for (const s of statuses) {
    for (const v of [s.current, ...s.upcoming]) {
      if (!v || !v.effective || v.effective < from || v.effective > to) continue;
      if (seen.has(v.mst)) continue;
      seen.add(v.mst);
      out.push({ name: s.name, effective: v.effective, kind: v.kind });
    }
  }
  return out.sort((a, b) => a.effective.localeCompare(b.effective) || a.name.localeCompare(b.name));
}
