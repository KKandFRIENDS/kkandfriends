// GET /api/ecos-probe?key=<CRON_SECRET> — read-only ECOS diagnostic.
//
// Why this exists: the ECOS key lives in Vercel, so nobody developing this
// repo can call the API from their own machine to see what the Bank of Korea
// actually returns. This endpoint is that missing feedback loop — open it once
// in a browser after setting ECOS_API_KEY and it reports, from production:
//
//   • whether the key is present and accepted (auth errors come back as
//     INFO-100 inside a 200 OK, so "it loaded" proves nothing on its own),
//   • every one of the 100 indicators with its exact KEYSTAT_NAME, value, unit
//     and CYCLE — the CYCLE is what settles whether a daily series is same-day
//     or T+1, i.e. whether it belongs in the 17:30 close brief at all,
//   • which PICKS in lib/ecos.js matched and which found nothing, so the
//     regexes can be corrected against real labels instead of guesses.
//
// It publishes nothing, writes nothing and calls no model. Safe to hit
// repeatedly. Optional: &table=<통계표코드> dumps that table's item codes, for
// wiring a specific series through StatisticSearch later.
//
// Delete this file once the ECOS integration is settled — it is scaffolding.

import { callEcos, ecosConfigured, selectPicks } from '../lib/ecos.js';

export default async function handler(req, res) {
  // Same shared secret as the crons. Unlike them this endpoint refuses to run
  // when CRON_SECRET is unset rather than falling open — it is a debug surface,
  // so the safe default is closed.
  const secret = process.env.CRON_SECRET;
  let qs = new URLSearchParams();
  try { qs = new URL(req.url, 'http://x').searchParams; } catch {}

  const auth = req.headers['authorization'] || '';
  if (!secret || (auth !== `Bearer ${secret}` && qs.get('key') !== secret)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (!ecosConfigured()) {
    return res.status(200).json({
      ok: false,
      configured: false,
      hint: 'ECOS_API_KEY is not set on this deployment. Add it in Vercel → Settings → Environment Variables, then redeploy (env vars only reach NEW deployments).',
    });
  }

  const keyStat = await callEcos('KeyStatisticList/' + encodeURIComponent(process.env.ECOS_API_KEY.trim()) + '/json/kr/1/100');

  if (!keyStat.ok) {
    return res.status(200).json({
      ok: false,
      configured: true,
      error: keyStat.error,
      hint: keyStat.error?.startsWith('INFO-100')
        ? 'ECOS rejected the key. Most often a stray space or newline pasted along with it — re-enter the value in Vercel and redeploy.'
        : undefined,
    });
  }

  // The full label list is the point of the probe: PICKS can only be made
  // accurate by reading the names the BOK actually publishes.
  const all = keyStat.rows.map((r) => ({
    class: r.CLASS_NAME ?? null,
    name: r.KEYSTAT_NAME ?? r.STAT_NAME ?? r.NAME ?? null,
    value: r.DATA_VALUE ?? null,
    unit: r.UNIT_NAME ?? null,
    cycle: r.CYCLE ?? null,
  }));

  const picked = selectPicks(keyStat.rows);
  const matched = new Set(picked.map((p) => p.name));

  const out = {
    ok: true,
    configured: true,
    total: keyStat.total,
    // What the briefs would print today, verbatim.
    picked: picked.map((p) => p.formatted),
    // A PICK listed here has a regex that matches nothing — fix it in lib/ecos.js.
    missed: MISSABLE.filter((label) => !matched.has(label)),
    // Raw field names, so a renamed field is visible rather than silent.
    sampleRow: keyStat.rows[0] ?? null,
    all,
  };

  const table = qs.get('table');
  if (table) {
    const items = await callEcos(
      `StatisticItemList/${encodeURIComponent(process.env.ECOS_API_KEY.trim())}/json/kr/1/100/${encodeURIComponent(table)}`
    );
    out.table = items.ok
      ? {
          code: table,
          count: items.total,
          items: items.rows.map((r) => ({
            itemCode: r.ITEM_CODE ?? null,
            itemName: r.ITEM_NAME ?? null,
            cycle: r.CYCLE ?? null,
            start: r.START_TIME ?? null,
            end: r.END_TIME ?? null,
          })),
        }
      : { code: table, error: items.error };
  }

  return res.status(200).json(out);
}

// Kept in sync by hand with the PICKS labels in lib/ecos.js — only used to
// report which ones came back empty.
const MISSABLE = [
  '한국은행 기준금리',
  '콜금리(익일물)',
  'CD(91일)',
  '국고채(3년)',
  '국고채(10년)',
  '회사채(3년,AA-)',
  '예금은행 대출금리',
  '소비자물가 등락률',
  '생산자물가 등락률',
  '경제성장률',
  '경상수지',
  '외환보유액',
  'M2(광의통화)',
  '가계신용',
  '실업률',
];
