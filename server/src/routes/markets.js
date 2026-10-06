import { resolveViewer, requireMember } from '../access.js';

// Two reading surfaces split out of the lounge on 2026-10-06 (KK decision):
//
// - Daily Markets: the automated 07:00 "오늘의 시작" and 17:30 "오늘의 마감"
//   briefs. They are still member_posts rows (the publish path did not change),
//   but they are now public, past ones included. A brief is a member_posts row
//   that daily_briefs points at.
// - KK Daily / KK Weekly: published editorial_drafts, now members-only. The
//   lounge lists them and /desk/<slug> on Vercel forwards the reader's cookie
//   here, so the gate is this server's membership check, not the browser.

const BRIEF_JOIN = `from daily_briefs b join member_posts p on p.id = b.post_id
  where b.status = 'published' and p.status = 'published' and p.is_hidden = false`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Public address: /markets/2026-10-06-start (07:00) or …-close (17:30).
// (brief_date, kind) is daily_briefs' primary key, so the slug is unique.
const SLUG_KIND = { start: 'global', close: 'korea_close' };
const MARKET_SLUG = /^(\d{4}-\d{2}-\d{2})-(start|close)$/;
const SLUG_SQL = `b.brief_date::text || case b.kind when 'global' then '-start' else '-close' end as slug`;
const DESK_ID = /^\d{4}-\d{2}-\d{2}-(macro|markets|bitcoin|ai|signals|korea|weekly)$/;

export async function isPublicBrief(pool, postId) {
  if (!UUID.test(String(postId))) return false;
  const result = await pool.query(`select 1 ${BRIEF_JOIN} and p.id = $1 limit 1`, [postId]);
  return result.rows.length > 0;
}

export async function registerMarketRoutes(app, { auth, pool, config }) {
  app.get('/api/v1/markets', async (request) => {
    const limit = Math.min(Math.max(Number.parseInt(request.query?.limit || '100', 10) || 100, 1), 500);
    const result = await pool.query(
      `select p.id, ${SLUG_SQL}, b.kind, b.brief_date::text as date, p.title, p.category, p.published_at,
              left(p.body, 600) as preview
       ${BRIEF_JOIN} order by b.brief_date desc, p.published_at desc limit $1`,
      [limit],
    );
    return { briefs: result.rows };
  });

  app.get('/api/v1/markets/:slug', async (request, reply) => {
    const m = String(request.params.slug).match(MARKET_SLUG);
    if (!m) return reply.status(404).send({ error: 'Not found' });
    const result = await pool.query(
      `select p.id, ${SLUG_SQL}, b.kind, b.brief_date::text as date, p.title, p.category, p.body, p.published_at, p.updated_at
       ${BRIEF_JOIN} and b.brief_date = $1::date and b.kind = $2 limit 1`,
      [m[1], SLUG_KIND[m[2]]],
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Not found' });
    return { brief: result.rows[0] };
  });

  // Old lounge links (/voices?id=<post id>) from Telegram and notifications.
  app.get('/api/v1/markets/by-post/:id', async (request, reply) => {
    if (!UUID.test(request.params.id)) return reply.status(404).send({ error: 'Not found' });
    const result = await pool.query(`select ${SLUG_SQL} ${BRIEF_JOIN} and p.id = $1 limit 1`, [request.params.id]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Not found' });
    return { slug: result.rows[0].slug };
  });

  app.get('/api/v1/desk', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const result = await pool.query(
      `select id, edition_date::text as date, published_at,
              payload->'content'->>'title' as title, payload->'content'->>'summary' as summary,
              payload->'desk'->>'series' as series, payload->'desk'->>'label' as label,
              payload->'desk'->>'topic' as topic
       from editorial_drafts where status = 'published' order by edition_date desc limit 200`,
    );
    return { editions: result.rows };
  });

  app.get('/api/v1/desk/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    if (!DESK_ID.test(request.params.id)) return reply.status(404).send({ error: 'Not found' });
    const result = await pool.query(
      `select id, edition_date, payload, published_at from editorial_drafts
       where status = 'published' and id = $1 limit 1`,
      [request.params.id],
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Not found' });
    return { edition: result.rows[0] };
  });
}
