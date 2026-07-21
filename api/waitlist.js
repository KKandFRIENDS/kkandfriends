// POST /api/waitlist — accept a founding-membership / waitlist application.
import {
  ensureTable,
  validateApplication,
  saveApplication,
  sendNotifications,
} from '../lib/waitlist-db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Vercel parses JSON bodies automatically; fall back to manual read if needed.
  let body = req.body;
  if (body == null || typeof body === 'string') {
    try {
      body = body ? JSON.parse(body) : await readJson(req);
    } catch {
      return res.status(400).json({ ok: false, error: 'Malformed JSON.' });
    }
  }

  const check = validateApplication(body);
  if (!check.ok) {
    // Silently accept honeypot hits so bots get no signal.
    if (check.error === 'spam') return res.status(200).json({ ok: true });
    return res.status(400).json({ ok: false, error: check.error });
  }

  try {
    await ensureTable();
    const { duplicate } = await saveApplication(check.data, {
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim(),
      userAgent: req.headers['user-agent'] || '',
      source: typeof body.source === 'string' ? body.source.slice(0, 120) : '',
    });

    // Don't block the response on email delivery.
    sendNotifications(check.data).catch(() => {});

    return res.status(200).json({ ok: true, duplicate });
  } catch (err) {
    console.error('waitlist error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Something went wrong. Please try again. / 잠시 후 다시 시도해 주세요.' });
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
    req.on('error', reject);
  });
}
