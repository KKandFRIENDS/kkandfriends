// POST /api/deploy-notify — Vercel deployment webhook receiver.
// On deployment.succeeded for the main branch, sends a Telegram notification.
//
// Required Vercel env vars:
//   VERCEL_WEBHOOK_SECRET  — from Vercel dashboard → Project → Settings → Webhooks
//   TELEGRAM_BOT_TOKEN     — same bot used by kk-researchlab
//   TELEGRAM_CHAT_ID       — same chat_id used by kk-researchlab
import { createHmac } from 'node:crypto';

export async function POST(request) {
  const raw = await request.text();

  // Verify Vercel HMAC-SHA1 signature when secret is configured.
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (secret) {
    const sig = request.headers.get('x-vercel-signature') ?? '';
    const expected = createHmac('sha1', secret).update(raw).digest('hex');
    if (sig !== expected) return new Response(null, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  // Only act on successful deploys of the main branch.
  if (event.type !== 'deployment.succeeded') return new Response(null, { status: 200 });
  const dep = event.payload?.deployment;
  if (!dep) return new Response(null, { status: 200 });
  if (dep.meta?.githubCommitRef !== 'main') return new Response(null, { status: 200 });

  // Extract post title from "Publish: <title>" commit message.
  const firstLine = (dep.meta?.githubCommitMessage ?? '').split('\n')[0];
  const title = firstLine.startsWith('Publish:')
    ? firstLine.replace(/^Publish:\s*/, '').trim()
    : firstLine;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    const text = `✅ 발행 완료 — ${title}\nkkandfriends.com에 반영됐습니다.`;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }

  return Response.json({ ok: true });
}
