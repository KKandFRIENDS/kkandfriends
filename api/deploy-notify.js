// POST /api/deploy-notify — Vercel deployment webhook receiver.
// On deployment.succeeded for the main branch, sends a Telegram notification.
//
// Required Vercel env vars:
//   VERCEL_WEBHOOK_SECRET  — from Vercel dashboard → Project → Settings → Webhooks
//   TELEGRAM_BOT_TOKEN     — same bot used by kk-researchlab
//   TELEGRAM_CHAT_ID       — same chat_id used by kk-researchlab
import { createHmac } from 'node:crypto';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const raw = await readRaw(req);

  // Verify Vercel HMAC-SHA1 signature when secret is configured.
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers['x-vercel-signature'] ?? '';
    const expected = createHmac('sha1', secret).update(raw).digest('hex');
    if (sig !== expected) return res.status(401).end();
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).end();
  }

  // Only act on successful deploys of the main branch.
  if (event.type !== 'deployment.succeeded') return res.status(200).end();
  const dep = event.payload?.deployment;
  if (!dep) return res.status(200).end();
  if (dep.meta?.githubCommitRef !== 'main') return res.status(200).end();

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

  return res.status(200).json({ ok: true });
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
