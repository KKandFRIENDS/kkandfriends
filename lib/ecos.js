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
// Regexes are anchored against the labels ECOS actually publishes (verified
// against a live /api/ecos-probe dump, 2026-08-07). Anchoring matters: an
// unanchored /소비자물가/ also swallows "농산물 및 석유류제외 소비자물가지수",
// and whichever row is consumed first wins.
//
// There is no 국고채 10년 in the 100대 지표 — the curve stops at 5년. Asking for
// one produced a permanent miss, so the 5년 point is what we take.
const PICKS = [
  // ── Rates. Daily, and the reason this integration exists.
  { label: '한국은행 기준금리', re: /^한국은행 기준금리/ },
  { label: '콜금리(익일물)', re: /^콜금리/ },
  { label: 'CD(91일)', re: /^CD수익률/ },
  { label: '국고채(3년)', re: /^국고채수익률\(3년\)/ },
  { label: '국고채(5년)', re: /^국고채수익률\(5년\)/ },
  { label: '회사채(3년,AA-)', re: /^회사채수익률/ },
  { label: '예금은행 대출금리', re: /^예금은행 대출금리/ },
  { label: '가계대출연체율', re: /^가계대출연체율/ },
  // ── Flow and positioning. The closest ECOS gets to the 수급 the brief cannot
  //    otherwise see; 증권투자(부채) is foreign money into Korean securities, so
  //    a negative print is an outflow.
  { label: '투자자예탁금', re: /^투자자예탁금/ },
  { label: '외국인 증권투자(순유입)', re: /^증권투자\(부채\)/ },
  // ── Cycle and prices. Monthly or quarterly — the as-of date carries that.
  { label: '소비자물가지수', re: /^소비자물가지수/ },
  { label: '생산자물가지수', re: /^생산자물가지수/ },
  { label: '소비자심리지수', re: /^소비자심리지수/ },
  { label: '선행지수순환변동치', re: /^선행지수순환변동치/ },
  { label: '경제성장률(전기대비)', re: /^경제성장률/ },
  { label: '경상수지', re: /^경상수지/ },
  { label: '외환보유액', re: /^외환보유액/ },
  { label: 'M2(광의통화)', re: /^M2/ },
  { label: '가계신용', re: /^가계신용/ },
  { label: '실업률', re: /^실업률/ },
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
  const picks = selectPicks(res.rows);
  // Logged on success too, not just on failure: this line in the Vercel function
  // log is the only way to tell "ECOS never answered" apart from "ECOS answered
  // and the model chose not to use the numbers" without the CRON_SECRET needed
  // to open the probe. A 0/N here means the PICKS regexes miss the BOK's
  // current labels; no line at all means this code never ran.
  const matched = picks.filter((p) => !p.derived).length;
  console.log(
    `ecos: ${matched}/${PICKS.length} indicators matched, ${picks.length - matched} spreads derived (${res.rows.length} rows returned)`
  );
  return picks;
}

// The labels PICKS asks for, so the probe can report misses without keeping a
// hand-copied duplicate of this list.
export function pickLabels() {
  return PICKS.map((p) => p.label);
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
  return [...out, ...deriveSpreads(out)];
}

// Two spreads the price tape cannot show on its own — and the credit one is the
// whole point of having ECOS at all: it is what tells you whether the day the
// index fell was also a day funding got more expensive. Computed here so the
// model never subtracts anything itself, and only when both legs carry the same
// as-of date, because a spread across two different days is not a spread.
function deriveSpreads(picked) {
  const by = new Map(picked.map((p) => [p.name, p]));
  const out = [];

  const spread = (label, longLeg, shortLeg, note) => {
    const a = by.get(longLeg);
    const b = by.get(shortLeg);
    if (!a || !b || a.cycle !== b.cycle) return;
    const bp = (a.num - b.num) * 100;
    out.push({
      name: label,
      value: `${bp.toFixed(1)}bp`,
      unit: 'bp',
      cycle: a.cycle,
      asOf: a.asOf,
      num: bp,
      derived: true,
      formatted: `${label} ${bp.toFixed(1)}bp (${note}, ${a.asOf} 기준)`,
    });
  };

  spread('신용스프레드', '회사채(3년,AA-)', '국고채(3년)', '회사채AA- 3년 − 국고채 3년');
  spread('국고채 커브(5년−3년)', '국고채(5년)', '국고채(3년)', '기울기');
  return out;
}

// The BOK has renamed these fields before; accept the known aliases rather
// than trusting one spelling.
function statName(row) {
  return String(row?.KEYSTAT_NAME ?? row?.STAT_NAME ?? row?.NAME ?? '');
}

// ECOS publishes several series in units nobody actually writes with: 외환보유액
// in 천달러 (a nine-digit number), M2 and 가계신용 in 십억원. Rescaling once,
// here, is the same principle as pre-formatting the quotes — the model copies a
// printable string instead of doing division it can get wrong in public.
const RESCALE = {
  천달러: { factor: 1e5, unit: '억달러', digits: 1 },
  백만달러: { factor: 1e2, unit: '억달러', digits: 1 },
  십억원: { factor: 1e3, unit: '조원', digits: 1 },
  백만원: { factor: 1e6, unit: '조원', digits: 1 },
};

function formatRow(label, row) {
  const raw = String(row?.DATA_VALUE ?? '').trim();
  if (!raw || raw === '-') return null;
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;

  const rawUnit = String(row?.UNIT_NAME ?? '').trim();
  const cycle = String(row?.CYCLE ?? '').trim();
  const asOf = formatCycle(cycle);

  const scale = RESCALE[rawUnit];
  const num = scale ? n / scale.factor : n;
  const unit = scale ? scale.unit : rawUnit;
  const digits = scale ? scale.digits : decimalsOf(raw);
  // Grouped, because ECOS sends large numbers with no separators at all and
  // "427948361" is not a figure anyone can read at speed.
  const value = num.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  // "2020=100" is an index base, not a unit — it belongs next to the date, not
  // glued to the number, or the line reads as "119.77 2020=100".
  const isBase = /=\s*[\d,]+$/.test(unit);
  const head = /%$/.test(unit) ? `${value}%` : unit && !isBase ? `${value} ${unit}` : value;
  const stamp = isBase ? `${unit}, ${asOf} 기준` : `${asOf} 기준`;

  return {
    name: label,
    value,
    unit,
    cycle,
    asOf,
    num,
    formatted: asOf ? `${label} ${head} (${stamp})` : `${label} ${head}`,
  };
}

// Print back exactly as many decimals as the bank published — 3.742 stays
// 3.742, 2.75 stays 2.75 — instead of imposing one width on every series.
function decimalsOf(raw) {
  const m = raw.replace(/,/g, '').match(/\.(\d+)$/);
  return m ? Math.min(m[1].length, 3) : 0;
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
