import { timingSafeEqual } from 'node:crypto';

const KINDS = new Set(['global', 'korea_close']);
const NOTIFICATION_TYPES = new Set(['daily_brief', 'korea_close']);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length >= 32 &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

async function digestContext(pool, body) {
  const since = new Date(body.since);
  const now = new Date(body.now);
  if (!Number.isFinite(since.getTime()) || !Number.isFinite(now.getTime())) throw new Error('Invalid digest range');
  const [posts, events, recipients] = await Promise.all([
    pool.query(
      `select p.id,p.title,p.body,p.category,p.published_at,p.author_id,pr.display_name as author_name
       from member_posts p left join profiles pr on pr.id=p.author_id
       where p.status='published' and p.is_hidden=false and p.published_at >= $1
       order by p.published_at desc limit 20`,
      [since.toISOString()],
    ),
    pool.query(
      `select id,title,event_at,location from events
       where is_cancelled=false and event_at >= $1 order by event_at asc limit 8`,
      [now.toISOString()],
    ),
    pool.query(
      `select contact_email,display_name,unsub_token from profiles
       where status='approved' and digest_opt_in=true and contact_email is not null`,
    ),
  ]);
  return { posts: posts.rows, events: events.rows, recipients: recipients.rows };
}

async function briefClaim(pool, body) {
  if (!validDate(body.date) || !KINDS.has(body.kind)) throw new Error('Invalid brief lock');
  const inserted = await pool.query(
    `insert into daily_briefs (brief_date,kind,status) values ($1,$2,'running')
     on conflict do nothing returning brief_date`,
    [body.date, body.kind],
  );
  if (inserted.rowCount) return { claimed: true };
  if (!body.force) return { claimed: false };
  await pool.query(
    `update daily_briefs set status='running',post_id=null,notified=0 where brief_date=$1 and kind=$2`,
    [body.date, body.kind],
  );
  return { claimed: true, forced: true };
}

async function briefPublish(pool, config, body) {
  if (!validDate(body.date) || !KINDS.has(body.kind) || !NOTIFICATION_TYPES.has(body.notificationType)) {
    throw new Error('Invalid brief publication');
  }
  if (typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 200 ||
      typeof body.body !== 'string' || body.body.length < 1 || body.body.length > 100000 ||
      typeof body.category !== 'string' || body.category.length > 80) throw new Error('Invalid brief content');

  const client = await pool.connect();
  try {
    await client.query('begin');
    const post = await client.query(
      `insert into member_posts (author_id,title,body,category,status,published_at)
       values ($1,$2,$3,$4,'published',now()) returning id`,
      [config.adminUserId, body.title, body.body, body.category],
    );
    const postId = post.rows[0].id;
    const notifications = await client.query(
      `insert into notifications (user_id,type,actor_id,actor_name,member_post_id)
       select id,$1,$2,'KK',$3 from profiles
       where status='approved' and daily_brief_optin=true returning id`,
      [body.notificationType, config.adminUserId, postId],
    );
    const updated = await client.query(
      `update daily_briefs set status='published',post_id=$3,notified=$4
       where brief_date=$1 and kind=$2 and status='running' returning brief_date`,
      [body.date, body.kind, postId, notifications.rowCount],
    );
    if (!updated.rowCount) throw new Error('Brief lock is not active');
    await client.query('commit');
    return { postId, notified: notifications.rowCount };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function briefRelease(pool, body) {
  if (!validDate(body.date) || !KINDS.has(body.kind)) throw new Error('Invalid brief release');
  const result = await pool.query(
    `delete from daily_briefs where brief_date=$1 and kind=$2 and status='running'`,
    [body.date, body.kind],
  );
  return { released: result.rowCount > 0 };
}

export async function registerAutomationRoutes(app, { pool, config }) {
  app.post('/api/internal/automation', async (request, reply) => {
    const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!same(supplied, config.editorialInternalToken)) return reply.status(401).send({ error: 'Unauthorized' });
    try {
      const action = request.body?.action;
      if (action === 'digestContext') return { data: await digestContext(pool, request.body) };
      if (action === 'briefClaim') return { data: await briefClaim(pool, request.body) };
      if (action === 'briefPublish') return { data: await briefPublish(pool, config, request.body) };
      if (action === 'briefRelease') return { data: await briefRelease(pool, request.body) };
      return reply.status(400).send({ error: 'Invalid automation action' });
    } catch (error) {
      request.log.warn({ code: error.code || error.name }, 'automation internal request failed');
      const status = error.code === '23505' ? 409 : 400;
      return reply.status(status).send({ error: 'Automation operation failed', code: error.code || error.name });
    }
  });
}
