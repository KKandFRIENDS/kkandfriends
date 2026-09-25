import { resolveViewer, requireAdmin, requireMember, requireViewer } from '../access.js';

const trim = (value) => typeof value === 'string' ? value.trim() : '';

export async function registerCommunityRoutes(app, { auth, pool, config }) {
  app.post('/api/v1/unsubscribe', async (request, reply) => {
    const token = trim(request.body?.token);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
      return reply.status(400).send({ error: 'Invalid unsubscribe token' });
    }
    const result = await pool.query(`update profiles set digest_opt_in=false
      where unsub_token=$1::uuid and digest_opt_in=true returning id`, [token]);
    return { unsubscribed: Boolean(result.rows[0]) };
  });

  app.get('/api/v1/events', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const result = await pool.query(`select e.*, count(r.user_id)::int as rsvp_count,
      bool_or(r.user_id=$1) as viewer_rsvp,
      coalesce(json_agg(r.user_id) filter(where r.user_id is not null),'[]') as attendee_ids
      from events e left join event_rsvps r on r.event_id=e.id
      group by e.id order by e.event_at`, [viewer.user.id]);
    return { events: result.rows };
  });
  app.post('/api/v1/events', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const title = trim(request.body?.title);
    if (!title || title.length > 200 || !request.body?.eventAt) return reply.status(400).send({ error: 'Invalid event' });
    const result = await pool.query(`insert into events(title,description,event_at,location,capacity,created_by)
      values($1,$2,$3,$4,$5,$6) returning *`, [title, trim(request.body.description) || null,
      request.body.eventAt, trim(request.body.location) || null, request.body.capacity || null, viewer.user.id]);
    return reply.status(201).send({ event: result.rows[0] });
  });
  app.patch('/api/v1/events/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const current = await pool.query('select * from events where id=$1', [request.params.id]);
    const event = current.rows[0];
    if (!event) return reply.status(404).send({ error: 'Event not found' });
    const title = request.body?.title === undefined ? event.title : trim(request.body.title);
    const description = request.body?.description === undefined ? event.description : trim(request.body.description) || null;
    const eventAt = request.body?.eventAt === undefined ? event.event_at : request.body.eventAt;
    const location = request.body?.location === undefined ? event.location : trim(request.body.location) || null;
    const capacity = request.body?.capacity === undefined ? event.capacity : request.body.capacity || null;
    const cancelled = request.body?.isCancelled === undefined ? event.is_cancelled : request.body.isCancelled;
    if (!title || title.length > 200 || !eventAt || typeof cancelled !== 'boolean') return reply.status(400).send({ error: 'Invalid event' });
    const result = await pool.query(`update events set title=$2,description=$3,event_at=$4,location=$5,capacity=$6,is_cancelled=$7
      where id=$1 returning *`, [event.id, title, description, eventAt, location, capacity, cancelled]);
    return { event: result.rows[0] };
  });
  app.delete('/api/v1/events/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const result = await pool.query('delete from events where id=$1 returning id', [request.params.id]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Event not found' });
    return reply.status(204).send();
  });
  app.put('/api/v1/events/:id/rsvp', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const result = await pool.query(`insert into event_rsvps(event_id,user_id)
      select e.id,$2 from events e where e.id=$1 and not e.is_cancelled
      and (e.capacity is null or (select count(*) from event_rsvps where event_id=e.id) < e.capacity)
      on conflict do nothing returning event_id`, [request.params.id, viewer.user.id]);
    if (!result.rows[0]) return reply.status(409).send({ error: 'Event is unavailable or full' });
    return reply.status(204).send();
  });
  app.delete('/api/v1/events/:id/rsvp', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    await pool.query('delete from event_rsvps where event_id=$1 and user_id=$2', [request.params.id, viewer.user.id]);
    return reply.status(204).send();
  });

  app.get('/api/v1/notifications', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    const result = await pool.query('select * from notifications where user_id=$1 order by created_at desc limit 100', [viewer.user.id]);
    return { notifications: result.rows };
  });
  app.patch('/api/v1/notifications/read', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    const ids = Array.isArray(request.body?.ids) ? request.body.ids.slice(0, 100) : [];
    if (!ids.length) return reply.status(400).send({ error: 'ids required' });
    await pool.query('update notifications set is_read=true where user_id=$1 and id=any($2::uuid[])', [viewer.user.id, ids]);
    return reply.status(204).send();
  });

  app.get('/api/v1/nominations', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const result = viewer.isAdmin
      ? await pool.query('select * from nominations order by created_at desc')
      : await pool.query('select * from nominations where nominator_id=$1 order by created_at desc', [viewer.user.id]);
    return { nominations: result.rows };
  });
  app.get('/api/v1/admin/nominations', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const result = await pool.query(`select n.*, p.display_name as nominator_name
      from nominations n left join profiles p on p.id=n.nominator_id
      order by n.created_at desc`);
    return { nominations: result.rows };
  });
  app.post('/api/v1/nominations', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const name = trim(request.body?.nomineeName), reason = trim(request.body?.reason);
    if (!name || name.length > 120 || !reason || reason.length > 2000) return reply.status(400).send({ error: 'Invalid nomination' });
    const result = await pool.query(`insert into nominations(nominator_id,nominee_name,nominee_contact,field,reason)
      values($1,$2,$3,$4,$5) returning *`, [viewer.user.id, name, trim(request.body.nomineeContact) || null,
      trim(request.body.field) || null, reason]);
    return reply.status(201).send({ nomination: result.rows[0] });
  });
  app.patch('/api/v1/admin/nominations/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const { status, adminNote } = request.body || {};
    if (status !== undefined && !['new','contacted','joined','declined'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status' });
    }
    if (status === undefined && adminNote === undefined) return reply.status(400).send({ error: 'No admin fields supplied' });
    const result = await pool.query(`update nominations
      set status=coalesce($2,status), admin_note=case when $3::boolean then $4 else admin_note end
      where id=$1 returning *`, [request.params.id, status ?? null, adminNote !== undefined, trim(adminNote) || null]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Nomination not found' });
    return { nomination: result.rows[0] };
  });
  app.delete('/api/v1/admin/nominations/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const result = await pool.query('delete from nominations where id=$1 returning id', [request.params.id]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Nomination not found' });
    return reply.status(204).send();
  });

  app.post('/api/v1/reports', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    if (!['post','comment'].includes(request.body?.targetType) || !request.body?.targetId) return reply.status(400).send({ error: 'Invalid report' });
    const result = await pool.query(`insert into reports(reporter_id,target_type,target_id,reason)
      values($1,$2,$3,$4) returning *`, [viewer.user.id, request.body.targetType, request.body.targetId, trim(request.body.reason) || null]);
    return reply.status(201).send({ report: result.rows[0] });
  });
  app.get('/api/v1/admin/reports', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const result = await pool.query(`select r.*, p.display_name as reporter_name,
      mp.title as target_title, mp.is_hidden as target_is_hidden
      from reports r
      left join profiles p on p.id=r.reporter_id
      left join member_posts mp on r.target_type='post' and mp.id=r.target_id
      order by r.created_at desc`);
    return { reports: result.rows };
  });
  app.patch('/api/v1/admin/reports/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const status = request.body?.status;
    if (!['open','resolved','dismissed'].includes(status)) return reply.status(400).send({ error: 'Invalid status' });
    const result = await pool.query(`update reports set status=$2,resolved_at=case when $2='open' then null else now() end
      where id=$1 returning *`, [request.params.id, status]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Report not found' });
    return { report: result.rows[0] };
  });

  app.get('/api/v1/admin/analytics', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const [profiles, posts, comments, postLikes] = await Promise.all([
      pool.query('select id,display_name,status,is_founding,field,created_at,onboarded from profiles'),
      pool.query('select id,author_id,title,status,is_hidden,created_at,published_at from member_posts'),
      pool.query('select id,post_slug,author_id,is_hidden,created_at from comments order by created_at desc limit 2000'),
      pool.query('select post_slug,created_at from post_likes order by created_at desc limit 2000'),
    ]);
    return { profiles: profiles.rows, posts: posts.rows, comments: comments.rows, postLikes: postLikes.rows };
  });
}
