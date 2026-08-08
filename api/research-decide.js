// GET /api/research-decide?token=…&action=approve|reject
//
// The other side of the approval gate. The [승인] / [반려] buttons on the
// Telegram approval request are plain URL buttons pointing here, so there is no
// Telegram webhook to register and nothing to silently stop working after a bot
// token rotation.
//
// Authority is the token itself: 128 bits of randomness, minted per run, stored
// in `research_runs.approval_token`, and cleared the moment a decision lands.
// It only ever appears in KK's private chat, and a spent link cannot be
// replayed — a second press gets "already decided", not a second send.
//
// Approving sends the summary block and attaches the full report. Rejecting
// sends nothing; the report stays archived either way.
//
// Requires migration db/migrations/015_research_lab.sql.

import { sendMessage, sendDocument, researchChatId } from '../lib/telegram.js';
import { loadResearchConfig } from '../lib/research-config.js';
import { reportFilename } from '../lib/research-report.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pahdwduqxxiugqjkbhvq.supabase.co';

export default async function handler(req, res) {
  let qs = new URLSearchParams();
  try { qs = new URL(req.url, 'http://x').searchParams; } catch {}

  const token = (qs.get('token') || '').trim();
  const action = (qs.get('action') || '').trim();

  if (!/^[a-f0-9]{32}$/.test(token) || !['approve', 'reject'].includes(action)) {
    return page(res, 400, '잘못된 요청', '링크가 올바르지 않습니다.');
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return page(res, 500, '설정 오류', 'SUPABASE_SERVICE_ROLE_KEY가 없습니다.');

  const db = supabase(serviceKey);

  const rows = await db.get(
    `research_runs?select=id,run_date,status,winner_title,winner_score,report_md,telegram_summary,candidates&approval_token=eq.${token}&limit=1`
  );
  const run = rows?.[0];
  if (!run) {
    // Either never valid, or already spent — the token is cleared on decision,
    // so these are indistinguishable from here, and that is fine.
    return page(res, 404, '만료된 링크', '이미 처리되었거나 유효하지 않은 링크입니다.');
  }
  if (run.status !== 'awaiting_approval') {
    return page(res, 409, '이미 처리됨', `이 리서치는 이미 "${run.status}" 상태입니다.`);
  }

  // Claim the decision: the status filter makes this the point of no return,
  // and asking for the updated rows back is what tells us whether we won. Two
  // quick presses both pass the SELECT above; only one gets a row here, and
  // only that one sends.
  const decided = await db.patchReturning(
    `research_runs?id=eq.${run.id}&status=eq.awaiting_approval`,
    {
      status: action === 'approve' ? 'approved' : 'rejected',
      approval_token: null,
      decided_at: new Date().toISOString(),
    }
  );
  if (!decided.ok) {
    return page(res, 500, '처리 실패', '상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!decided.json?.length) {
    return page(res, 409, '이미 처리됨', '방금 다른 창에서 처리된 것 같습니다. 텔레그램을 확인하세요.');
  }

  if (action === 'reject') {
    return page(
      res, 200, '반려 처리됨',
      `${run.run_date} 리서치를 반려했습니다. 아무것도 발송하지 않았고, 전문은 보관되어 있습니다.`
    );
  }

  let cfg = null;
  try { cfg = loadResearchConfig(); } catch {}
  const chat = researchChatId();
  if (!chat) return page(res, 200, '승인됨', '승인했지만 텔레그램 채팅 ID가 설정되어 있지 않아 발송하지 못했습니다.');

  const sent = await sendMessage({
    chatId: chat,
    text: run.telegram_summary || `${run.run_date} 리서치 승인됨 — ${run.winner_title}`,
    chunkChars: cfg?.telegram?.split_chunk_chars,
    delayMs: cfg?.telegram?.split_delay_ms,
  });

  if (run.report_md) {
    await sendDocument({
      chatId: chat,
      filename: reportFilename(run.run_date, run.candidates?.[0]?.slug),
      content: run.report_md,
      caption: `${run.run_date} 리서치 전문 (승인)`,
    });
  }

  return page(
    res, 200, '승인 완료',
    sent.ok
      ? `${run.run_date} · ${run.winner_title || ''} — 요약과 전문을 발송했습니다. 텔레그램을 확인하세요.`
      : `승인은 저장했지만 발송에 실패했습니다: ${sent.error || '알 수 없음'}`
  );
}

// A button press opens a browser, so the reply has to be a page, not JSON.
// Deliberately minimal and self-contained — it is read once, on a phone.
function page(res, status, title, message) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(`<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · KK &amp; Friends</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0b0d10; color:#e8eaed; padding:24px;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Noto Sans KR",sans-serif; }
  .card { max-width:420px; text-align:center; background:#14171c; border:1px solid #232830;
          border-radius:14px; padding:32px 24px; }
  h1 { font-size:1.15rem; margin:0 0 12px; letter-spacing:-.01em; }
  p { margin:0; font-size:.95rem; line-height:1.65; color:#a8b0ba; }
</style>
</head><body><div class="card">
<h1>${esc(title)}</h1>
<p>${esc(message)}</p>
</div></body></html>`);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    // Returns the rows it actually changed — an empty array means the filter
    // matched nothing, which is how a lost race is detected.
    patchReturning: (path, body) => send('PATCH', path, body, 'return=representation'),
  };
}
