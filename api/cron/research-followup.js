// GET /api/cron/research-followup — the approval gate's clock.
//
// Runs hourly. Two jobs, both cheap:
//   • a research run waiting longer than `approval.reminder_after_hours` gets
//     ONE reminder in the same chat,
//   • a run still unanswered at `approval.timeout_after_hours` is marked
//     timed_out and its token cleared. Nothing is sent.
//
// The v6 behaviour was to go silent after six hours and lose the day's work.
// The report is now written before the approval request goes out, so a timeout
// costs a send, not the research — this endpoint just closes the window.
//
// Silence never publishes. That is the safe default and it is not configurable
// by accident: `on_timeout` in research-config.json is read, and anything other
// than the archive-only behaviour is refused rather than guessed at.
//
// Requires migration db/migrations/015_research_lab.sql.

import { loadResearchConfig } from '../../lib/research-config.js';
import { sendMessage, researchChatId } from '../../lib/telegram.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pahdwduqxxiugqjkbhvq.supabase.co';
const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  let qs = new URLSearchParams();
  try { qs = new URL(req.url, 'http://x').searchParams; } catch {}
  if (secret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${secret}` && qs.get('key') !== secret) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(200).json({ ok: true, skipped: 'not configured' });

  let cfg;
  try {
    cfg = loadResearchConfig();
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }

  const db = supabase(serviceKey);
  const pending = await db.get(
    'research_runs?select=id,run_date,status,winner_title,winner_score,approval_token,created_at,reminded_at' +
    '&status=eq.awaiting_approval&order=created_at.asc&limit=20'
  );
  if (!pending?.length) return res.status(200).json({ ok: true, pending: 0 });

  const now = Date.now();
  const remindAfter = (cfg.approval?.reminder_after_hours ?? 3) * 3_600_000;
  const timeoutAfter = (cfg.approval?.timeout_after_hours ?? 6) * 3_600_000;
  const chat = researchChatId();

  const reminded = [];
  const timedOut = [];

  for (const run of pending) {
    const age = now - new Date(run.created_at).getTime();

    if (age >= timeoutAfter) {
      // Clear the token so a stale link in the chat history cannot approve a
      // run that has already closed. The status filter plus the returned rows
      // is the race guard: if KK pressed approve a moment ago, this updates
      // nothing and we must not announce a timeout over his approval.
      const closed = await db.patchReturning(`research_runs?id=eq.${run.id}&status=eq.awaiting_approval`, {
        status: 'timed_out',
        approval_token: null,
        decided_at: new Date().toISOString(),
      });
      if (!closed.json?.length) continue;
      timedOut.push(run.run_date);

      if (chat) {
        await sendMessage({
          chatId: chat,
          text: [
            `⏳ 리서치랩 ${run.run_date} — 미응답으로 마감`,
            '',
            `${run.winner_title || ''}`,
            '',
            `${cfg.approval.timeout_after_hours}시간 동안 응답이 없어 발송하지 않았습니다.`,
            '전문은 보관되어 있습니다 (research_runs).',
          ].join('\n'),
        });
      }
      continue;
    }

    if (age >= remindAfter && !run.reminded_at) {
      if (chat && run.approval_token) {
        const base = `${SITE_URL}/api/research-decide?token=${run.approval_token}`;
        const hoursLeft = Math.max(1, Math.round((timeoutAfter - age) / 3_600_000));
        await sendMessage({
          chatId: chat,
          text: [
            `🔔 리서치랩 ${run.run_date} — 미응답 상태`,
            '',
            `${run.winner_title || ''}${run.winner_score ? ` (${Number(run.winner_score).toFixed(2)})` : ''}`,
            '',
            `약 ${hoursLeft}시간 뒤 자동 마감됩니다. 마감되면 발송하지 않고 보관만 합니다.`,
          ].join('\n'),
          buttons: [[
            { text: '✅ 승인', url: `${base}&action=approve` },
            { text: '✖️ 반려', url: `${base}&action=reject` },
          ]],
        });
      }
      // Stamped whether or not the send worked — the reminder is once, and a
      // failing chat must not turn into an hourly retry loop.
      await db.patch(`research_runs?id=eq.${run.id}`, { reminded_at: new Date().toISOString() });
      reminded.push(run.run_date);
    }
  }

  return res.status(200).json({ ok: true, pending: pending.length, reminded, timedOut });
}

function supabase(serviceKey) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  const send = async (method, path, body, prefer) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { ok: res.ok, status: res.status, text, json };
  };
  return {
    get: (path) => send('GET', path).then((r) => (r.ok ? r.json : null)),
    patch: (path, body) => send('PATCH', path, body, 'return=minimal'),
    patchReturning: (path, body) => send('PATCH', path, body, 'return=representation'),
  };
}
