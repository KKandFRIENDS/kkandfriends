import { resolveViewer, requireMember, requireViewer } from '../access.js';

const isMemberSlug = (slug) => slug.startsWith('member:');

export async function registerDiscussionRoutes(app, { auth, pool, config }) {
  app.get('/api/v1/discussions/:slug', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (isMemberSlug(request.params.slug) && !requireMember(viewer, reply)) return;
    const [comments, postLikes, commentLikes] = await Promise.all([
      pool.query(`select c.*, count(cl.user_id)::int as like_count
        from comments c left join comment_likes cl on cl.comment_id=c.id
        where c.post_slug=$1 and (c.is_hidden=false or c.author_id=$2 or $3::boolean)
        group by c.id order by c.created_at`, [request.params.slug, viewer?.user.id || '', viewer?.isAdmin || false]),
      pool.query('select count(*)::int as count from post_likes where post_slug=$1', [request.params.slug]),
      viewer ? pool.query('select comment_id from comment_likes where user_id=$1', [viewer.user.id]) : Promise.resolve({ rows: [] }),
    ]);
    const mine = viewer ? await pool.query('select 1 from post_likes where post_slug=$1 and user_id=$2', [request.params.slug, viewer.user.id]) : { rows: [] };
    return {
      comments: comments.rows,
      postLikeCount: postLikes.rows[0]?.count || 0,
      likedPost: mine.rows.length > 0,
      likedCommentIds: commentLikes.rows.map((row) => row.comment_id),
    };
  });

  app.post('/api/v1/discussions/:slug/comments', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (isMemberSlug(request.params.slug) ? !requireMember(viewer, reply) : !requireViewer(viewer, reply)) return;
    const body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
    if (!body || body.length > 2000) return reply.status(400).send({ error: 'Comment must be 1-2000 characters' });
    const parentId = request.body?.parentId || null;
    const result = await pool.query(
      `insert into comments (post_slug,parent_id,author_id,author_name,author_avatar_url,body)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [request.params.slug, parentId, viewer.user.id, viewer.user.name || null, viewer.user.image || null, body],
    );
    return reply.status(201).send({ comment: result.rows[0] });
  });

  app.delete('/api/v1/comments/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    const result = await pool.query('delete from comments where id=$1 and (author_id=$2 or $3::boolean) returning id', [request.params.id, viewer.user.id, viewer.isAdmin]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Comment not found' });
    return reply.status(204).send();
  });

  app.patch('/api/v1/admin/comments/:id/moderation', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!viewer?.isAdmin) return reply.status(viewer ? 403 : 401).send({ error: 'Admin required' });
    if (typeof request.body?.isHidden !== 'boolean') return reply.status(400).send({ error: 'isHidden must be boolean' });
    const result = await pool.query('update comments set is_hidden=$2 where id=$1 returning *', [request.params.id, request.body.isHidden]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Comment not found' });
    return { comment: result.rows[0] };
  });

  app.put('/api/v1/discussions/:slug/like', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (isMemberSlug(request.params.slug) ? !requireMember(viewer, reply) : !requireViewer(viewer, reply)) return;
    await pool.query('insert into post_likes(post_slug,user_id) values($1,$2) on conflict do nothing', [request.params.slug, viewer.user.id]);
    return reply.status(204).send();
  });
  app.delete('/api/v1/discussions/:slug/like', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    await pool.query('delete from post_likes where post_slug=$1 and user_id=$2', [request.params.slug, viewer.user.id]);
    return reply.status(204).send();
  });
  app.put('/api/v1/comments/:id/like', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    await pool.query('insert into comment_likes(comment_id,user_id) values($1,$2) on conflict do nothing', [request.params.id, viewer.user.id]);
    return reply.status(204).send();
  });
  app.delete('/api/v1/comments/:id/like', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    await pool.query('delete from comment_likes where comment_id=$1 and user_id=$2', [request.params.id, viewer.user.id]);
    return reply.status(204).send();
  });
}
