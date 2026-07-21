// POST /api/waitlist — accept a founding-membership / waitlist application.
import {
  ensureTable,
  validateApplication,
  saveApplication,
  sendNotifications,
} from '../../../lib/waitlist-db.js';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Malformed JSON.' }, { status: 400 });
  }

  const check = validateApplication(body);
  if (!check.ok) {
    // Silently accept honeypot hits so bots get no signal.
    if (check.error === 'spam') return Response.json({ ok: true });
    return Response.json({ ok: false, error: check.error }, { status: 400 });
  }

  try {
    await ensureTable();
    const { duplicate } = await saveApplication(check.data, {
      ip: (request.headers.get('x-forwarded-for') || '').split(',')[0].trim(),
      userAgent: request.headers.get('user-agent') || '',
      source: typeof body.source === 'string' ? body.source.slice(0, 120) : '',
    });

    // Don't block the response on email delivery.
    sendNotifications(check.data).catch(() => {});

    return Response.json({ ok: true, duplicate });
  } catch (err) {
    console.error('waitlist error:', err);
    return Response.json(
      { ok: false, error: 'Something went wrong. Please try again. / 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    );
  }
}
