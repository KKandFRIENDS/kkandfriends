// POST /api/notify-approval — email a member that they've been approved.
//
// Called by the admin panel (admin-members.html) right after an approve. The
// caller must present the ADMIN's Supabase access token; the function verifies
// it is the admin, looks up the member's email server-side (service_role), and
// sends a welcome email via Resend.
//
// Reuses the digest env vars — no new setup:
//   SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM
//   Optional: SUPABASE_URL, SITE_URL, ADMIN_UID

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pahdwduqxxiugqjkbhvq.supabase.co';
const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';
const ADMIN_UID = process.env.ADMIN_UID || '6ac6cf72-1c88-4626-9124-27a6a2792e1e';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!serviceKey || !resendKey || !from) {
    return res.status(200).json({ ok: true, skipped: 'email not configured' });
  }

  // 1. Verify the caller is the admin (their Supabase access token as Bearer).
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ ok: false, error: 'no token' });
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!who || who.id !== ADMIN_UID) return res.status(403).json({ ok: false, error: 'not admin' });

  // 2. Read the target member (service_role) — must be approved.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const memberId = body && body.member_id;
  if (!memberId) return res.status(400).json({ ok: false, error: 'member_id required' });

  const rows = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=contact_email,display_name,status&id=eq.${memberId}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  ).then((r) => r.json()).catch(() => null);
  const member = rows && rows[0];
  if (!member || !member.contact_email) return res.status(200).json({ ok: true, skipped: 'no email' });
  if (member.status !== 'approved') return res.status(200).json({ ok: true, skipped: 'not approved' });

  // 3. Send the welcome email.
  const ok = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: member.contact_email,
      subject: 'KK & Friends — 가입이 승인되었습니다 🎉',
      html: welcomeHtml(member.display_name),
    }),
  }).then((x) => x.ok).catch(() => false);

  return res.status(200).json({ ok, sent: ok ? 1 : 0 });
}

function welcomeHtml(name) {
  return `
  <div style="background:#060810;padding:32px 0;font-family:Georgia,serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:0 28px;">
          <div style="font-size:22px;font-weight:bold;letter-spacing:.06em;color:#ffffff;">KK <span style="color:#4A90D9;">&</span> FRIENDS</div>
          <div style="font-size:12px;color:#9DB0C7;letter-spacing:.1em;text-transform:uppercase;margin-top:2px;">Membership</div>
          <h1 style="color:#ffffff;font-size:24px;margin:26px 0 10px;">환영합니다, ${esc(name || '')}님 🎉</h1>
          <p style="color:#D2DCEA;font-size:15px;line-height:1.75;margin:0 0 14px;">
            KK &amp; Friends 가입이 <b style="color:#7AB8F5;">승인</b>되었습니다. 검증된 금융시장 전문가들이 서로의 견해를
            나누는 멤버 전용 공간에 오신 것을 진심으로 환영합니다.</p>
          <p style="color:#9DB0C7;font-size:14px;line-height:1.75;margin:0 0 22px;">
            이제 <b>라운지(Friends' Voices)</b>에서 글을 읽고 쓰고, 다른 멤버들과 이야기 나누고, 오프라인 모임에 참여하실 수 있습니다.</p>
          <a href="${SITE_URL}/voices" style="display:inline-block;background:#4A90D9;color:#061018;font-size:14px;font-weight:bold;text-decoration:none;padding:13px 30px;border-radius:4px;">라운지 입장하기 →</a>
          <hr style="border:none;border-top:1px solid #1c2436;margin:28px 0 16px;">
          <p style="font-size:12px;color:#5a6a82;line-height:1.6;">문의: <a href="mailto:kim.kiseok.1969@gmail.com" style="color:#9DB0C7;">kim.kiseok.1969@gmail.com</a><br>— KK &amp; Friends</p>
        </td></tr>
      </table>
    </td></tr></table>
  </div>`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
