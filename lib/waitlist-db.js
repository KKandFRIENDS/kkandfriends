// Shared backend helpers for the waitlist feature.
// Lives outside /api so Vercel does not expose it as an HTTP route;
// it is bundled into the functions that import it.

import { createPool } from '@vercel/postgres';

// Resolve a Postgres connection string from whichever env var the provider set.
// Vercel-managed Postgres sets POSTGRES_URL; the Neon marketplace integration
// may instead expose DATABASE_URL. Prefer pooled connection strings.
//
// The pool is created lazily on first query (not at module load) so that the
// Next.js build — which imports route modules without database env vars — and
// any request that never touches the DB don't require a connection string.
let pool = null;
function getPool() {
  if (!pool) {
    const connectionString =
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL_UNPOOLED;
    pool = createPool(connectionString ? { connectionString } : undefined);
  }
  return pool;
}

export const sql = (...args) => getPool().sql(...args);

const VALID_TIERS = new Set(['associate', 'vp', 'md', 'undecided']);

// Create the table on first use so there is no separate migration step.
let tableReady = false;
export async function ensureTable() {
  if (tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS waitlist (
      id           BIGSERIAL PRIMARY KEY,
      name         TEXT        NOT NULL,
      email        TEXT        NOT NULL UNIQUE,
      organization TEXT,
      role         TEXT,
      tier         TEXT,
      message      TEXT,
      locale       TEXT,
      source       TEXT,
      ip           TEXT,
      user_agent   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  tableReady = true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate + normalize an incoming application. Returns { ok, data } or { ok:false, error }.
export function validateApplication(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }

  // Honeypot: real users never fill this hidden field.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return { ok: false, error: 'spam' };
  }

  const clip = (v, max) =>
    typeof v === 'string' ? v.trim().slice(0, max) : '';

  const name = clip(body.name, 120);
  const email = clip(body.email, 200).toLowerCase();
  const organization = clip(body.organization, 160);
  const role = clip(body.role, 160);
  let tier = clip(body.tier, 40).toLowerCase();
  const message = clip(body.message, 2000);
  const locale = clip(body.locale, 12) || 'ko';

  if (!name) return { ok: false, error: 'Name is required. / 이름을 입력해 주세요.' };
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'A valid email is required. / 올바른 이메일을 입력해 주세요.' };
  }
  if (!VALID_TIERS.has(tier)) tier = 'undecided';

  return { ok: true, data: { name, email, organization, role, tier, message, locale } };
}

// Insert (or update on repeat email) an application. Returns { duplicate: boolean }.
export async function saveApplication(data, meta) {
  const { name, email, organization, role, tier, message, locale } = data;
  const { ip = '', userAgent = '', source = '' } = meta || {};

  const result = await sql`
    INSERT INTO waitlist
      (name, email, organization, role, tier, message, locale, source, ip, user_agent)
    VALUES
      (${name}, ${email}, ${organization}, ${role}, ${tier}, ${message}, ${locale}, ${source}, ${ip}, ${userAgent})
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      organization = EXCLUDED.organization,
      role = EXCLUDED.role,
      tier = EXCLUDED.tier,
      message = EXCLUDED.message,
      locale = EXCLUDED.locale,
      source = EXCLUDED.source,
      updated_at = now()
    RETURNING (xmax = 0) AS inserted
  `;
  return { duplicate: !result.rows[0]?.inserted };
}

// Fire-and-forget notification emails via the Resend REST API.
// No-op (and never throws) unless RESEND_API_KEY + RESEND_FROM are configured.
export async function sendNotifications(data) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM; // e.g. "KK & Friends <noreply@kkandfriends.com>"
  if (!apiKey || !from) return;

  const adminEmail = process.env.ADMIN_EMAIL;
  const send = (payload) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, ...payload }),
    }).catch(() => {});

  const tasks = [];

  // Confirmation to the applicant.
  tasks.push(
    send({
      to: data.email,
      subject: 'KK & Friends — Waitlist confirmed / 대기자 등록이 완료되었습니다',
      html: `
        <div style="font-family:Georgia,serif;color:#0E1422;line-height:1.7">
          <p>Dear ${escapeHtml(data.name)},</p>
          <p>Thank you for joining the KK &amp; Friends waitlist. We have received your application and will be in touch as founding membership opens.</p>
          <p style="color:#555">KK &amp; Friends 대기자 명단에 등록해 주셔서 감사합니다. 신청이 접수되었으며, 창립 멤버십이 열리는 대로 연락드리겠습니다.</p>
          <p style="margin-top:24px">— KK &amp; Friends</p>
        </div>`,
    })
  );

  // Notification to the admin inbox.
  if (adminEmail) {
    tasks.push(
      send({
        to: adminEmail,
        subject: `New waitlist application: ${data.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h3>New waitlist application</h3>
            <ul>
              <li><b>Name:</b> ${escapeHtml(data.name)}</li>
              <li><b>Email:</b> ${escapeHtml(data.email)}</li>
              <li><b>Organization:</b> ${escapeHtml(data.organization) || '—'}</li>
              <li><b>Role:</b> ${escapeHtml(data.role) || '—'}</li>
              <li><b>Tier:</b> ${escapeHtml(data.tier)}</li>
              <li><b>Message:</b> ${escapeHtml(data.message) || '—'}</li>
            </ul>
          </div>`,
      })
    );
  }

  await Promise.allSettled(tasks);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
