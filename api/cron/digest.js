// GET /api/cron/digest — weekly Friends' Voices digest.
//
// Triggered by Vercel Cron (see vercel.json). Uses the Supabase service_role key
// SERVER-SIDE ONLY to read approved members' emails + the week's activity, then
// sends a per-member email via Resend with a one-click unsubscribe link.
//
// DORMANT until these env vars are set in Vercel (see EMAIL_DIGEST_SETUP.md):
//   CRON_SECRET                 protects this endpoint (Vercel sends it as Bearer)
//   SUPABASE_SERVICE_ROLE_KEY   Supabase → Settings → API (secret! server only)
//   RESEND_API_KEY, RESEND_FROM email sending (verified domain)
// Optional: SUPABASE_URL (defaults to the project URL), SITE_URL.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pahdwduqxxiugqjkbhvq.supabase.co';
const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';

export default async function handler(req, res) {
  // Auth: when CRON_SECRET is set, require it. Vercel Cron sends it as a Bearer
  // header automatically; for a manual browser test we also accept ?key=<secret>.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    let qsKey = '';
    try { qsKey = new URL(req.url, 'http://x').searchParams.get('key') || ''; } catch {}
    if (auth !== `Bearer ${secret}` && qsKey !== secret) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!serviceKey || !resendKey || !from) {
    return res.status(200).json({ ok: true, skipped: 'digest not configured' });
  }

  const sb = (path) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }).then((r) => r.json());

  try {
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const now = new Date().toISOString();

    const [posts, events] = await Promise.all([
      sb(`member_posts?select=id,title,body,category,published_at,author_id&status=eq.published&is_hidden=eq.false&published_at=gte.${weekAgo}&order=published_at.desc&limit=20`),
      sb(`events?select=id,title,event_at,location&is_cancelled=eq.false&event_at=gte.${now}&order=event_at.asc&limit=8`),
    ]);

    // Nothing to say → don't send an empty digest.
    if ((!posts || !posts.length) && (!events || !events.length)) {
      return res.status(200).json({ ok: true, sent: 0, reason: 'no activity this week' });
    }

    // Author display names for post bylines.
    const authorIds = [...new Set((posts || []).map((p) => p.author_id))];
    let authors = {};
    if (authorIds.length) {
      const rows = await sb(`profiles?select=id,display_name&id=in.(${authorIds.join(',')})`);
      (rows || []).forEach((a) => { authors[a.id] = a.display_name; });
    }

    const recipients = await sb(`profiles?select=contact_email,display_name,unsub_token&status=eq.approved&digest_opt_in=eq.true&contact_email=not.is.null`);
    if (!recipients || !recipients.length) {
      return res.status(200).json({ ok: true, sent: 0, reason: 'no opted-in recipients' });
    }

    const postsHtml = (posts || []).map((p) => `
      <tr><td style="padding:14px 0;border-bottom:1px solid #1c2436;">
        ${p.category ? `<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4A90D9;margin-bottom:4px;">${esc(p.category)}</div>` : ''}
        <a href="${SITE_URL}/voices?id=${p.id}" style="font-family:Georgia,serif;font-size:18px;color:#ffffff;text-decoration:none;">${esc(p.title)}</a>
        <div style="font-size:13px;color:#9DB0C7;margin-top:4px;">${esc(authors[p.author_id] || '멤버')} · ${excerpt(p.body, 120)}</div>
      </td></tr>`).join('');

    const eventsHtml = (events || []).map((e) => {
      const d = new Date(e.event_at);
      const when = d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #1c2436;">
        <a href="${SITE_URL}/events" style="font-size:16px;color:#ffffff;text-decoration:none;">🗓 ${esc(e.title)}</a>
        <div style="font-size:13px;color:#9DB0C7;margin-top:3px;">${esc(when)}${e.location ? ` · ${esc(e.location)}` : ''}</div>
      </td></tr>`;
    }).join('');

    let sent = 0;
    for (const r of recipients) {
      const unsub = `${SITE_URL}/unsubscribe?token=${r.unsub_token}`;
      const html = digestHtml({ name: r.display_name, postsHtml, eventsHtml, hasPosts: (posts || []).length, hasEvents: (events || []).length, unsub });
      const ok = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: r.contact_email,
          subject: 'KK & Friends — 이번 주 라운지 소식',
          html,
          headers: { 'List-Unsubscribe': `<${unsub}>` },
        }),
      }).then((x) => x.ok).catch(() => false);
      if (ok) sent++;
    }
    return res.status(200).json({ ok: true, sent, recipients: recipients.length, posts: (posts || []).length, events: (events || []).length });
  } catch (err) {
    console.error('digest error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

function digestHtml({ name, postsHtml, eventsHtml, hasPosts, hasEvents, unsub }) {
  return `
  <div style="background:#060810;padding:32px 0;font-family:Georgia,serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:0 28px;">
          <div style="font-size:22px;font-weight:bold;letter-spacing:.06em;color:#ffffff;">KK <span style="color:#4A90D9;">&</span> FRIENDS</div>
          <div style="font-size:12px;color:#9DB0C7;letter-spacing:.1em;text-transform:uppercase;margin-top:2px;">이번 주 라운지 소식</div>
          <p style="color:#D2DCEA;font-size:15px;margin:22px 0 8px;">${esc(name || '멤버')}님, 안녕하세요.</p>
          ${hasPosts ? `<h2 style="color:#7AB8F5;font-size:15px;letter-spacing:.04em;margin:24px 0 4px;">✍️ 새로운 글</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${postsHtml}</table>` : ''}
          ${hasEvents ? `<h2 style="color:#7AB8F5;font-size:15px;letter-spacing:.04em;margin:28px 0 4px;">📅 다가오는 모임</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${eventsHtml}</table>` : ''}
          <div style="margin:30px 0;">
            <a href="${SITE_URL}/voices" style="display:inline-block;background:#4A90D9;color:#061018;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:4px;">라운지 열기 →</a>
          </div>
          <hr style="border:none;border-top:1px solid #1c2436;margin:24px 0;">
          <p style="font-size:11px;color:#5a6a82;line-height:1.6;">이 메일은 KK &amp; Friends 승인 멤버에게 발송되는 커뮤니티 소식입니다.<br>
            더 이상 받지 않으시려면 <a href="${unsub}" style="color:#9DB0C7;">수신거부</a>를 눌러주세요.</p>
        </td></tr>
      </table>
    </td></tr></table>
  </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function excerpt(md, max = 120) {
  const t = String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return esc(t.length > max ? t.slice(0, max).trim() + '…' : t);
}
