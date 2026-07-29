// ============================================================================
//  ecos.js — Bank of Korea ECOS: the Korean macro numbers Yahoo cannot give.
//
//  The briefs already have prices (Yahoo) and headlines (Google News). What
//  they have never had is the domestic backdrop a Seoul desk reads the tape
//  against: 기준금리, 국고채, CD, 회사채, 물가, 외환보유액, 가계신용. ECOS is
//  the Bank of Korea's official open API, it is free, and it is the primary
//  source — not a scrape.
//
//  Same contract as market-sources.js: BEST EFFORT, ALWAYS. No key set, a
//  blocked host, a renamed field — every one of those resolves to "no ECOS
//  data" and the brief publishes exactly as it does today. Nothing in this
//  file may throw, and it must never be the reason a cron fails.
//
//  ── Why KeyStatisticList and not StatisticSearch ────────────────────────────
//  KeyStatisticList ("100대 통계지표") returns the BOK's whole headline
//  dashboard in ONE request, already labelled, dated and unit-tagged by the
//  bank itself. The alternative is StatisticSearch, which needs a hard-coded
//  통계표코드 + 항목코드 per series — and those codes are exactly what breaks
//  silently when the BOK reorganises a table. The cost of this choice is that
//  we get levels only, no day-over-day change. For a macro backdrop the level
//  IS the point; the daily *moves* already come from Yahoo.
//
//  Values are passed through as strings EXACTLY as the BOK published them and
//  assembled into ready-to-print lines here, so the model copies rather than
//  computes — the same rule the quotes follow.
//
//  Env: ECOS_API_KEY (Vercel → Settings → Environment Variables). Issue one at
//  https://ecos.bok.or.kr → 오픈API → 인증키 신청. Free, instant.
// ============================================================================

const BASE = 'https://ecos.bok.or.kr/api';
const TIMEOUT = 7000;

// Read at call time, not at module load: a redeploy that adds the key then
// takes effect on its own, with no code change here.
const apiKey = () => (process.env.ECOS_API_KEY || '').trim();

export function ecosConfigured() {
  return Boolean(apiKey());
}

// ─── What we pull out of the 100 ────────────────────────────────────────────
// Matched against the BOK's own KEYSTAT_NAME by regex rather than by exact
// string, because the bank rewords these labels from time to time ("국고채
// (3년)" vs "국고채(3년)"). First match wins and each row is consumed once, so
// the order below is also the priority order.
//
// Deliberately ABSENT: 원/달러 and 코스피. Yahoo already supplies both WITH the
// day's change, and ECOS would hand the model a second, staler number for the
// same thing — the one situation most likely to produce a wrong sentence.
const PICKS = [
  { label: '한국은행 기준금리', re: /기준금리/ },
  { label: '콜금리(익일물)', re: /콜금리/ },
  { label: 'CD(91일)', re: /CD/ },
  { label: '국고채(3년)', re: /국고채.*3\s*년/ },
  { label: '국고채(10년)', re: /국고채.*10\s*년/ },
  { label: '회사채(3년,AA-)', re: /회사채/ },
  { label: '예금은행 대출금리', re: /대출금리/ },
  { label: '소비자물가 등락률', re: /소비자물가/ },
  { label: '생산자물가 등락률', re: /생산자물가/ },
  { label: '경제성장률', re: /경제성장률/ },
  { label: '경상수지', re: /경상수지/ },
  { label: '외환보유액', re: /외환보유액/ },
  { label: 'M2(광의통화)', re: /M2|광의통화/ },
  { label: '가계신용', re: /가계신용/ },
  { label: '실업률', re: /실업률/ },
];

// Returns [{ name, value, unit, cycle, asOf, formatted }] for every indicator
// that matched, in PICKS order. Returns [] — never throws — when the key is
// missing or ECOS is unreachable.
export async function fetchEcosKeyStats() {
  const res = await callEcos(`KeyStatisticList/${encodeURIComponent(apiKey())}/json/kr/1/100`);
  if (!res.ok) {
    if (res.error) console.warn('ecos: key statistics unavailable —', res.error);
    return [];
  }
  return selectPicks(res.rows);
}

// Split out so the probe endpoint can run the same selection over rows it has
// already fetched, and report matches and misses side by side.
export function selectPicks(rows) {
  const used = new Set();
  const out = [];

  for (const pick of PICKS) {
    const row = rows.find((r) => !used.has(r) && pick.re.test(statName(r)));
    if (!row) continue;
    const line = formatRow(pick.label, row);
    if (!line) continue;
    used.add(row);
    out.push(line);
  }
  return out;
}

// The BOK has renamed these fields before; accept the known aliases rather
// than trusting one spelling.
function statName(row) {
  return String(row?.KEYSTAT_NAME ?? row?.STAT_NAME ?? row?.NAME ?? '');
}

function formatRow(label, row) {
  const value = String(row?.DATA_VALUE ?? '').trim();
  if (!value || value === '-') return null;

  const unit = String(row?.UNIT_NAME ?? '').trim();
  const cycle = String(row?.CYCLE ?? '').trim();
  const asOf = formatCycle(cycle);
  // "연%" / "%" read fine as a bare %; anything else (십억원, 억달러) needs the
  // space so it doesn't glue onto the number.
  const suffix = /%$/.test(unit) ? '%' : unit ? ` ${unit}` : '';

  return {
    name: label,
    value,
    unit,
    cycle,
    asOf,
    formatted: asOf ? `${label} ${value}${suffix} (${asOf} 기준)` : `${label} ${value}${suffix}`,
  };
}

// ECOS stamps every row with the period it belongs to, and the shape tells you
// the frequency: 20260729 daily, 202607 monthly, 20262Q quarterly, 2026 annual.
// Rendering it is what stops the model quoting a Q1 number as if it were today.
function formatCycle(cycle) {
  if (/^\d{8}$/.test(cycle)) return `${cycle.slice(0, 4)}-${cycle.slice(4, 6)}-${cycle.slice(6, 8)}`;
  if (/^\d{6}$/.test(cycle)) return `${cycle.slice(0, 4)}년 ${Number(cycle.slice(4, 6))}월`;
  if (/^\d{4}[1-4]Q$/i.test(cycle)) return `${cycle.slice(0, 4)}년 ${cycle[4]}분기`;
  if (/^\d{4}Q[1-4]$/i.test(cycle)) return `${cycle.slice(0, 4)}년 ${cycle[5]}분기`;
  if (/^\d{4}$/.test(cycle)) return `${cycle}년`;
  return cycle || '';
}

// ─── Transport ──────────────────────────────────────────────────────────────

// One place where every ECOS quirk is absorbed. Callers get {ok, rows, error}
// and nothing else — in particular the request URL is never surfaced, because
// the API key travels inside the path and would otherwise leak into logs and
// error payloads.
export async function callEcos(path) {
  if (!apiKey()) return { ok: false, error: 'ECOS_API_KEY is not set' };

  let text;
  try {
    const res = await fetch(`${BASE}/${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: `request failed: ${String(err?.message || err)}` };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'ECOS returned a non-JSON body' };
  }

  // ECOS answers 200 OK even when it is refusing you; the verdict is in the
  // payload. INFO-100 = bad or missing key, INFO-200 = no data for that query.
  if (json?.RESULT?.CODE) {
    return { ok: false, error: `${json.RESULT.CODE}: ${json.RESULT.MESSAGE || ''}`.trim() };
  }

  // Every list endpoint wraps its rows in a single envelope named after itself
  // ({ KeyStatisticList: { list_total_count, row: [...] } }), so read it
  // positionally instead of hard-coding one endpoint's name.
  const envelope = json && typeof json === 'object' ? Object.values(json)[0] : null;
  const rows = envelope?.row;
  if (!Array.isArray(rows)) return { ok: false, error: 'unexpected ECOS payload shape' };

  return { ok: true, rows, total: Number(envelope.list_total_count) || rows.length };
}
