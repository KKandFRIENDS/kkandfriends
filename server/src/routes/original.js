import { resolveViewer, requireAdmin } from '../access.js';

const CATEGORIES = new Set(['Macro', 'Korea', 'Equity', 'Digital Assets', 'Global', 'Manifesto']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const clean = (value) => typeof value === 'string' ? value.trim() : '';

function validate(body) {
  const post = {
    slug: clean(body?.slug), title: clean(body?.title), summary: clean(body?.summary),
    body: clean(body?.body), category: body?.category, status: body?.status || 'draft',
  };
  if (!SLUG.test(post.slug) || !post.title || post.title.length > 200 || !post.summary || post.summary.length > 500 ||
      !post.body || post.body.length > 100000 || !CATEGORIES.has(post.category) || !['draft', 'published'].includes(post.status)) return null;
  return post;
}

export async function registerOriginalRoutes(app, { auth, pool, config }) {
  app.get('/api/v1/original', async (request, reply) => {
    const wantsDrafts = request.query?.includeDrafts === 'true';
    if (wantsDrafts) {
      const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
      if (!requireAdmin(viewer, reply)) return;
    }
    const result = wantsDrafts
      ? await pool.query('select * from kk_original_posts order by updated_at desc')
      : await pool.query("select * from kk_original_posts where status='published' order by published_at desc");
    return { posts: result.rows };
  });

  app.get('/api/v1/original/:slug', async (request, reply) => {
    const result = await pool.query("select * from kk_original_posts where slug=$1 and status='published'", [request.params.slug]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Article not found' });
    return { post: result.rows[0] };
  });

  app.post('/api/v1/original', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const post = validate(request.body);
    if (!post) return reply.status(400).send({ error: 'Invalid article' });
    const result = await pool.query(
      `insert into kk_original_posts(created_by,slug,title,summary,body,category,status,published_at)
       values($1,$2,$3,$4,$5,$6,$7,case when $7='published' then now() else null end) returning *`,
      [viewer.user.id, post.slug, post.title, post.summary, post.body, post.category, post.status],
    );
    return reply.status(201).send({ post: result.rows[0] });
  });

  app.put('/api/v1/original/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const post = validate(request.body);
    if (!post) return reply.status(400).send({ error: 'Invalid article' });
    const result = await pool.query(
      `update kk_original_posts set slug=$2,title=$3,summary=$4,body=$5,category=$6,status=$7,
       published_at=case when $7='published' then coalesce(published_at,now()) else null end where id=$1 returning *`,
      [request.params.id, post.slug, post.title, post.summary, post.body, post.category, post.status],
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Article not found' });
    return { post: result.rows[0] };
  });
}
