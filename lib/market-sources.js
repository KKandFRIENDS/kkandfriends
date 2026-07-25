// ============================================================================
//  market-sources.js — free, key-less market inputs for the daily brief.
//
//  Two sources, both public and unauthenticated:
//    • Quotes   — Yahoo Finance chart endpoint (last two daily closes).
//    • Headlines— Google News RSS (3 queries) + CNBC Top News RSS. Titles only.
//
//  Everything here is BEST EFFORT by design: a blocked or rate-limited source
//  must never take the cron down. Each fetch has its own timeout and any
//  failure resolves to "nothing from this source" instead of throwing. The
//  caller decides whether it has enough material to publish.
//
//  Numbers are formatted HERE, server-side, into ready-to-print strings. The
//  LLM is told to copy those strings verbatim — it never does the arithmetic,
//  so it cannot invent or miscompute a price.
// ============================================================================

const UA =
  'Mozilla/5.0 (compatible; KKandFriendsBot/1.0; +https://www.kkandfriends.com)';

// Yahoo symbols, in the order they should be offered to the model.
//   kind: 'pct'  → change shown as a percentage
//         'rate' → change shown in basis points (bond yields)
//   digits: decimal places for the level
const SYMBOLS = [
  { sym: '^GSPC',      name: 'S&P 500',    kind: 'pct',  digits: 2 },
  { sym: '^IXIC',      name: '나스닥',      kind: 'pct',  digits: 2 },
  { sym: '^DJI',       name: '다우',        kind: 'pct',  digits: 2 },
  { sym: '^VIX',       name: 'VIX',        kind: 'pct',  digits: 2 },
  { sym: '^TNX',       name: '미 10년물',   kind: 'rate', digits: 3 },
  { sym: 'DX-Y.NYB',   name: '달러인덱스',   kind: 'pct',  digits: 2 },
  { sym: 'KRW=X',      name: '원/달러',     kind: 'pct',  digits: 1 },
  { sym: 'CL=F',       name: 'WTI',        kind: 'pct',  digits: 2 },
  { sym: 'GC=F',       name: '금',          kind: 'pct',  digits: 2 },
  { sym: 'BTC-USD',    name: '비트코인',     kind: 'pct',  digits: 0 },
  { sym: '^KS11',      name: '코스피',      kind: 'pct',  digits: 2 },
];

const FEEDS = [
  googleNews('stock market when:1d'),
  googleNews('(federal reserve OR inflation OR bond yields) when:1d'),
  googleNews('(oil OR gold OR dollar OR bitcoin) when:1d'),
  'https://www.cnbc.com/id/100003114/device/rss/rss.html', // CNBC Top News
];

function googleNews(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

// ─── Quotes ─────────────────────────────────────────────────────────────────

// Returns [{ name, formatted, changePct }] for every symbol that answered.
// A symbol that fails or returns unusable data is simply left out.
export async function fetchQuotes() {
  const results = await Promise.all(SYMBOLS.map((s) => fetchQuote(s).catch(() => null)));
  return results.filter(Boolean);
}

async function fetchQuote(s) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.sym)}` +
    `?interval=1d&range=7d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const json = await res.json();

  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter((v) =>
    Number.isFinite(v)
  );

  // Prefer the two most recent daily closes; fall back to the meta block.
  let last = closes.length ? closes[closes.length - 1] : meta.regularMarketPrice;
  let prev = closes.length > 1 ? closes[closes.length - 2] : meta.previousClose ?? meta.chartPreviousClose;
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) return null;

  const changePct = ((last - prev) / prev) * 100;
  const level = fmt(last, s.digits);
  const move =
    s.kind === 'rate'
      ? `${signed((last - prev) * 100, 1)}bp`
      : `${signed(changePct, 2)}%`;
  const unit = s.kind === 'rate' ? '%' : '';

  return { name: s.name, formatted: `${s.name} ${level}${unit} (${move})`, changePct };
}

function fmt(v, digits) {
  return Number(v).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
function signed(v, digits) {
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

// ─── Headlines ──────────────────────────────────────────────────────────────

// Returns up to `limit` de-duplicated headline strings (titles only).
export async function fetchHeadlines(limit = 24) {
  const lists = await Promise.all(FEEDS.map((u) => fetchFeed(u).catch(() => [])));
  const seen = new Set();
  const out = [];
  // Round-robin across feeds so one chatty feed can't crowd the others out.
  for (let i = 0; out.length < limit; i++) {
    let advanced = false;
    for (const list of lists) {
      if (i >= list.length) continue;
      advanced = true;
      const title = list[i];
      const key = title.toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim().slice(0, 60);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(title);
      if (out.length >= limit) break;
    }
    if (!advanced) break;
  }
  return out;
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const titles = [];
  for (const chunk of xml.split(/<item[\s>]/).slice(1, 13)) {
    const m = chunk.match(/<title>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/title>/);
    if (!m) continue;
    const t = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
    if (t.length > 12) titles.push(t.slice(0, 180));
  }
  return titles;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// ─── KST date helpers ───────────────────────────────────────────────────────

const KO_WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const WD_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// The cron fires on a UTC schedule but every date the members see is Korean
// local time, so the brief's date/weekday is always derived in Asia/Seoul.
export function kstParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const dow = WD_INDEX[parts.weekday] ?? 0;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,        // 2026-07-27
    label: `${Number(parts.month)}/${Number(parts.day)}`,      // 7/27
    weekday: KO_WEEKDAY[dow],                                  // 월
    dow,                                                       // 0=Sun … 6=Sat
    isWeekend: dow === 0 || dow === 6,
  };
}
