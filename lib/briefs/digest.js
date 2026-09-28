// Weekly Friends' Voices digest — Mondays 09:00 KST, scheduled on the VPS by
// ops/briefs (cron) rather than Vercel. Reads the week's posts, upcoming events
// and opted-in recipients through the VPS internal automation API, then sends a
// per-member email via Resend with a one-click unsubscribe link.
//
// Every run that does not send what it should — missing configuration, API or
// Resend failure, or only some recipients reached — alerts KK on Telegram.
// A marker in BRIEFS_STATE_DIR (/state in the container) records a finished
// week so a re-run cannot email everyone twice; --force overrides it.
//
// Manual run on the VPS (see ops/briefs/README.md):
//   node ops/briefs/run.mjs digest --dry          → build it, send nothing
//   node ops/briefs/run.mjs digest --to=me@x.com  → send one copy to that address only
//   node ops/briefs/run.mjs digest --force        → send even if this week already went out
//
// Env: EDITORIAL_INTERNAL_TOKEN, RESEND_API_KEY, RESEND_FROM (required);
//      TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (alerts); COMMUNITY_API_URL, SITE_URL.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { communityInternal } from '../community-internal.js';
import { kstParts } from '../market-sources.js';

const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';
const STATE_DIR = process.env.BRIEFS_STATE_DIR || '/state';

export async function runDigest({ dry = false, force = false, to = '' } = {}) {
  const internalToken = process.env.EDITORIAL_INTERNAL_TOKEN;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!internalToken || !resendKey || !from) {
    const missing = [
      !internalToken && 'EDITORIAL_INTERNAL_TOKEN',
      !resendKey && 'RESEND_API_KEY',
      !from && 'RESEND_FROM',
    ].filter(Boolean);
    await alertAdmin(`⚠️ 주간 다이제스트 설정 누락 — ${missing.join(', ')}`);
    return { ok: false, error: 'not configured', missing };
  }

  const { date } = kstParts();
  const marker = path.join(STATE_DIR, `digest-${date}.done`);
  const live = !dry && !to;
  if (live && !force && existsSync(marker)) {
    return { ok: true, skipped: 'already sent today', date };
  }

  try {
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const now = new Date().toISOString();
    const { posts = [], events = [], recipients = [] } = await communityInternal('digestContext', { since: weekAgo, now });
    const counts = { date, posts: posts.length, events: events.length, recipients: recipients.length };

    // Nothing to say → don't send an empty digest.
    if (!posts.length && !events.length) {
      if (live) markDone(marker);
      return { ok: true, sent: 0, reason: 'no activity this week', ...counts };
    }
    if (!recipients.length && !to) {
      if (live) markDone(marker);
      return { ok: true, sent: 0, reason: 'no opted-in recipients', ...counts };
    }

    const postsHtml = posts.map((p) => `
      <tr><td style="padding:14px 0;border-bottom:1px solid #1c2436;">
        ${p.category ? `<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4A90D9;margin-bottom:4px;">${esc(p.category)}</div>` : ''}
        <a href="${SITE_URL}/voices?id=${p.id}" style="font-family:Georgia,serif;font-size:18px;color:#ffffff;text-decoration:none;">${esc(p.title)}</a>
        <div style="font-size:13px;color:#9DB0C7;margin-top:4px;">${esc(p.author_name || '멤버')} · ${excerpt(p.body, 120)}</div>
      </td></tr>`).join('');

    const eventsHtml = events.map((e) => {
      const d = new Date(e.event_at);
      const when = d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #1c2436;">
        <a href="${SITE_URL}/events" style="font-size:16px;color:#ffffff;text-decoration:none;">🗓 ${esc(e.title)}</a>
        <div style="font-size:13px;color:#9DB0C7;margin-top:3px;">${esc(when)}${e.location ? ` · ${esc(e.location)}` : ''}</div>
      </td></tr>`;
    }).join('');

    if (dry) return { ok: true, dry: true, ...counts, titles: posts.map((p) => p.title) };

    // --to sends one copy to that address, with a harmless placeholder unsubscribe link.
    const targets = to
      ? [{ contact_email: to, display_name: 'KK', unsub_token: 'preview' }]
      : recipients;

    let sent = 0;
    const failed = [];
    for (const r of targets) {
      const unsub = `${SITE_URL}/unsubscribe?token=${r.unsub_token}`;
      const html = digestHtml({ name: r.display_name, postsHtml, eventsHtml, hasPosts: posts.length, hasEvents: events.length, unsub });
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: r.contact_email,
          subject: 'KK & Friends — 이번 주 라운지 소식',
          html,
          headers: { 'List-Unsubscribe': `<${unsub}>` },
        }),
        signal: AbortSignal.timeout(15_000),
      }).catch((err) => ({ ok: false, status: String(err.message || err) }));
      if (res.ok) sent++;
      else failed.push(res.status);
    }

    // Mark the week done once anything went out, so a retry can't double-send.
    if (live && sent > 0) markDone(marker);
    if (failed.length) {
      await alertAdmin(`⚠️ 주간 다이제스트 일부 실패 (${date}) — ${sent}/${targets.length}명 발송, 실패 사유: ${[...new Set(failed)].join(', ').slice(0, 200)}`);
    }
    return { ok: failed.length === 0, sent, failed: failed.length, preview: Boolean(to), ...counts };
  } catch (err) {
    console.error('digest error:', err);
    await alertAdmin(`⚠️ 주간 다이제스트 실패 (${date})\n${String(err.message || err).slice(0, 400)}`);
    return { ok: false, date, error: String(err.message || err) };
  }
}

function markDone(marker) {
  try {
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, new Date().toISOString());
  } catch (err) {
    console.warn('digest: could not write state marker:', err.message);
  }
}

// Failure notice → KK's own Telegram chat (never the members' channel).
async function alertAdmin(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  }).catch(() => {});
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
