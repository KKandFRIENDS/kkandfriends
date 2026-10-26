// ============================================================================
//  http.js — the one place the official-statistics clients talk to the network.
//
//  Same contract as lib/ecos.js: BEST EFFORT, ALWAYS. Nothing here throws, and
//  a caller only ever sees { ok, json } or { ok: false, error }. The request
//  URL is never surfaced, because every one of these APIs carries its key in
//  the query string and would otherwise leak into logs, alerts and the model's
//  prompt. Errors are also scrubbed of any secret the caller names.
// ============================================================================

const DEFAULT_TIMEOUT = 8000;
const UA = 'Mozilla/5.0 (compatible; KKandFriendsBot/1.0; +https://www.kkandfriends.com)';

// Replace every occurrence of a secret (and its URL-encoded form) with ***.
export function redact(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    const s = String(secret ?? '');
    if (s.length < 4) continue;
    out = out.split(s).join('***');
    const enc = encodeURIComponent(s);
    if (enc !== s) out = out.split(enc).join('***');
  }
  return out;
}

// GET a URL and parse JSON. `secrets` are scrubbed from any error text.
export async function getJson(url, { timeout = DEFAULT_TIMEOUT, secrets = [], headers = {} } = {}) {
  let text;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA, ...headers },
      signal: AbortSignal.timeout(timeout),
    });
    text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: redact(`request failed: ${String(err?.message || err)}`, secrets) };
  }

  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'non-JSON body' };
  }
}

// Append query parameters, skipping empty ones. Returns a string; callers must
// not log it (it contains the key).
export function withQuery(base, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  return `${base}?${q.toString()}`;
}

// ─── Dates and numbers shared by the clients ────────────────────────────────

// YYYYMMDD for a Date in Korea time, optionally shifted by whole days.
export function kstYmd(now = new Date(), offsetDays = 0) {
  const shifted = new Date(now.getTime() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(shifted);
  return parts.replace(/-/g, '');
}

// "20261021" -> "2026-10-21"
export function isoFromYmd(ymd) {
  const s = String(ymd ?? '').trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '';
}

// "2026년 10월 21일" -> "2026-10-21"; anything else -> ''.
export function isoFromKoreanDate(text) {
  const m = String(text ?? '').match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

// "18,000,000,000" -> 18000000000; "-" or junk -> null.
export function toNumber(raw) {
  const s = String(raw ?? '').trim().replace(/,/g, '');
  if (!s || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// 18000000000 -> "180억원"; 1.2e12 -> "1.2조원". The model copies this string
// instead of dividing, the same rule lib/ecos.js follows.
export function formatWon(n) {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  const trim = (x, d) => Number(x.toFixed(d)).toLocaleString('ko-KR', { maximumFractionDigits: d });
  if (abs >= 1e12) return `${trim(n / 1e12, 2)}조원`;
  if (abs >= 1e8) return `${trim(n / 1e8, 1)}억원`;
  if (abs >= 1e4) return `${trim(n / 1e4, 0)}만원`;
  return `${n.toLocaleString('ko-KR')}원`;
}
