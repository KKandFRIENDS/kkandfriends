import { resolveViewer, requireAdmin, requireMember } from '../access.js';

const text = (value) => typeof value === 'string' ? value.trim() : '';
const validStatus = (value) => ['draft', 'published'].includes(value);

export async function registerPostRoutes(app, { auth, pool, config }) {
  app.get('/api/v1/posts', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const authorId = request.query?.authorId;
    const mine = request.query?.mine === 'true';
    let sql = `select p.*, json_build_object(
      'id', pr.id, 'display_name', pr.display_name, 'identity_mode', pr.identity_mode,
      'field', pr.field, 'avatar_url', pr.avatar_url, 'is_founding', pr.is_founding,
      'affiliation', case when pr.show_affiliation then pr.affiliation else null end
    ) as author from member_posts p join profiles pr on pr.id = p.author_id where `;
    const params = [];
    if (mine) {
      params.push(viewer.user.id);
      sql += `p.author_id = $1`;
    } else if (authorId) {
      params.push(authorId);
      sql += `p.author_id = $1 and p.status = 'published' and p.is_hidden = false`;
    } else {
      sql += `p.status = 'published' and p.is_hidden = false`;
    }
    const result = await pool.query(`${sql} order by coalesce(p.published_at, p.created_at) desc`, params);
    return { posts: result.rows };
  });

  app.get('/api/v1/posts/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const result = await pool.query('select * from member_posts where id = $1', [request.params.id]);
    const post = result.rows[0];
    if (!post || (post.status !== 'published' || post.is_hidden) && post.author_id !== viewer.user.id && !viewer.isAdmin) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    return { post };
  });

  app.post('/api/v1/posts', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const title = text(request.body?.title);
    const body = text(request.body?.body);
    const category = text(request.body?.category) || null;
    const status = request.body?.status || 'draft';
    if (!title || title.length > 200 || !body || body.length > 100000 || !validStatus(status)) {
      return reply.status(400).send({ error: 'Invalid post' });
    }
    const result = await pool.query(
      `insert into member_posts (author_id, title, body, category, status, published_at)
       values ($1, $2, $3, $4, $5, case when $5 = 'published' then now() else null end) returning *`,
      [viewer.user.id, title, body, category, status],
    );
    return reply.status(201).send({ post: result.rows[0] });
  });

  app.patch('/api/v1/posts/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const existing = await pool.query('select * from member_posts where id = $1', [request.params.id]);
    const post = existing.rows[0];
    if (!post || post.author_id !== viewer.user.id && !viewer.isAdmin) return reply.status(404).send({ error: 'Post not found' });
    const title = request.body?.title === undefined ? post.title : text(request.body.title);
    const body = request.body?.body === undefined ? post.body : text(request.body.body);
    const category = request.body?.category === undefined ? post.category : text(request.body.category) || null;
    const status = request.body?.status === undefined ? post.status : request.body.status;
    if (!title || title.length > 200 || !body || body.length > 100000 || !validStatus(status)) return reply.status(400).send({ error: 'Invalid post' });
    const result = await pool.query(
      `update member_posts set title=$2, body=$3, category=$4, status=$5,
       published_at=case when $5='published' then coalesce(published_at, now()) else published_at end
       where id=$1 returning *`, [post.id, title, body, category, status],
    );
    return { post: result.rows[0] };
  });

  app.delete('/api/v1/posts/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const result = await pool.query(
      'delete from member_posts where id=$1 and (author_id=$2 or $3::boolean) returning id',
      [request.params.id, viewer.user.id, viewer.isAdmin],
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Post not found' });
    return reply.status(204).send();
  });

  app.patch('/api/v1/admin/posts/:id/moderation', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    if (typeof request.body?.isHidden !== 'boolean') return reply.status(400).send({ error: 'isHidden must be boolean' });
    const result = await pool.query('update member_posts set is_hidden=$2 where id=$1 returning *', [request.params.id, request.body.isHidden]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Post not found' });
    return { post: result.rows[0] };
  });
}
