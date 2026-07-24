// POST /api/notify-application — email KK when a new membership application lands.
//
// Called by /join right after an applicant finishes onboarding (status = pending).
// The caller presents their OWN Supabase access token; we verify it, read that
// same user's profile (service_role), and — only while it is still 'pending' —
// email the admin a heads-up with a link to the review panel. The recipient is
// always the admin (fixed), so this can't be used to email anyone else.
//
// Reuses the existing email env vars — no new setup:
//   SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM
//   Optional: SUPABASE_URL, SITE_URL, ADMIN_EMAIL

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pahdwduqxxiugqjkbhvq.supabase.co';
const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'kim.kiseok.1969@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }

  // service_role is required (verify token + read applicant). Email and Telegram
  // are each optional — whichever is configured gets sent.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(200).json({ ok: true, skipped: 'not configured' });
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  // 1. Verify the caller (their own Supabase access token as Bearer).
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ ok: false, error: 'no token' });
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!who || !who.id) return res.status(401).json({ ok: false, error: 'invalid token' });

  // 2. Read the caller's OWN profile (service_role). Only notify for a fresh
  //    pending application (avoids repeat mails after approval).
  const rows = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=display_name,real_name,field,note_to_admin,contact_email,status,created_at&id=eq.${who.id}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  ).then((r) => r.json()).catch(() => null);
  const a = rows && rows[0];
  if (!a) return res.status(200).json({ ok: true, skipped: 'no profile' });
  if (a.status !== 'pending') return res.status(200).json({ ok: true, skipped: 'not pending' });

  // 3. Notify the admin — email (Resend) and/or Telegram, whichever is set.
  let email = false, telegram = false;

  if (resendKey && from) {
    email = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: ADMIN_EMAIL,
        reply_to: a.contact_email || undefined,
        subject: `새 가입 신청 — ${a.display_name || '이름 미기재'}`,
        html: applicationHtml(a),
      }),
    }).then((x) => x.ok).catch(() => false);
  }

  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) {
    const lines = [
      '🆕 새 가입 신청 — KK & Friends',
      `이름: ${a.display_name || '(미기재)'}`,
      a.field ? `분야: ${a.field}` : '',
      a.real_name ? `실명: ${a.real_name}` : '',
      a.note_to_admin ? `메시지: ${a.note_to_admin}` : '',
      '',
      `심사하러 가기: ${SITE_URL}/admin-members`,
    ].filter(Boolean);
    telegram = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: tgChat, text: lines.join('\n'), disable_web_page_preview: true }),
    }).then((x) => x.ok).catch(() => false);
  }

  return res.status(200).json({ ok: email || telegram, email, telegram });
}

function applicationHtml(a) {
  const row = (label, val) => val
    ? `<tr><td style="padding:6px 0;color:#7A8FAA;font-size:13px;width:96px;vertical-align:top;">${esc(label)}</td><td style="padding:6px 0;color:#E8EEF6;font-size:14px;line-height:1.6;">${esc(val)}</td></tr>`
    : '';
  return `
  <div style="background:#060810;padding:32px 0;font-family:Georgia,serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:0 28px;">
          <div style="font-size:22px;font-weight:bold;letter-spacing:.06em;color:#ffffff;">KK <span style="color:#4A90D9;">&</span> FRIENDS</div>
          <div style="font-size:12px;color:#9DB0C7;letter-spacing:.1em;text-transform:uppercase;margin-top:2px;">Admin · 신규 가입 신청</div>
          <h1 style="color:#ffffff;font-size:22px;margin:26px 0 8px;">새 가입 신청이 도착했습니다</h1>
          <p style="color:#9DB0C7;font-size:14px;line-height:1.7;margin:0 0 18px;">아래 신청자를 검토하고 승인/거절해 주세요.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#0E1422;border:1px solid #1c2436;border-radius:8px;padding:8px 16px;">
            ${row('표시 이름', a.display_name)}
            ${row('실명', a.real_name)}
            ${row('분야', a.field)}
            ${row('이메일', a.contact_email)}
            ${row('메시지', a.note_to_admin)}
          </table>
          <a href="${SITE_URL}/admin-members" style="display:inline-block;margin-top:22px;background:#4A90D9;color:#061018;font-size:14px;font-weight:bold;text-decoration:none;padding:13px 30px;border-radius:4px;">심사하러 가기 →</a>
          <hr style="border:none;border-top:1px solid #1c2436;margin:28px 0 16px;">
          <p style="font-size:12px;color:#5a6a82;line-height:1.6;">KK &amp; Friends · 관리자 알림</p>
        </td></tr>
      </table>
    </td></tr></table>
  </div>`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
