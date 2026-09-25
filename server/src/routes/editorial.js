import { timingSafeEqual } from 'node:crypto';

const TABLES = {
  editorial_drafts: {
    columns: new Set(['id','edition_date','status','version','payload','content_hash','approved_hash','approved_at','published_at','updated_at']),
    filters: new Set(['id','edition_date','status']),
    orders: new Set(['edition_date','published_at','updated_at']),
  },
  editorial_runs: {
    columns: new Set(['edition_date','status','attempt','lease_until','started_at','finished_at','detail']),
    filters: new Set(['edition_date','status']),
    orders: new Set(['edition_date','started_at','finished_at']),
  },
  kk_original_posts: {
    columns: new Set(['id','created_by','slug','title','summary','body','category','status','created_at','updated_at','published_at']),
    filters: new Set(['slug','status']),
    orders: new Set(['published_at','updated_at','created_at']),
  },
};

const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length >= 32 &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function querySpec(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length > 2000) throw new Error('Invalid editorial query');
  const url = new URL(rawPath, 'http://internal');
  const table = url.pathname.replace(/^\//, '');
  const spec = TABLES[table];
  if (!spec) throw new Error('Editorial table is not allowed');
  const requested = url.searchParams.get('select') || '*';
  const columns = requested === '*' ? ['*'] : requested.split(',').map((item) => item.trim());
  if (!columns.length || columns.some((column) => !spec.columns.has(column))) throw new Error('Editorial column is not allowed');
  const params = [];
  const where = [];
  for (const field of spec.filters) {
    const raw = url.searchParams.get(field);
    if (!raw) continue;
    const separator = raw.indexOf('.');
    const operation = raw.slice(0, separator);
    const value = raw.slice(separator + 1);
    if (separator < 1 || !['eq','gte'].includes(operation) || (operation === 'gte' && field !== 'edition_date')) {
      throw new Error('Editorial filter is not allowed');
    }
    params.push(value);
    where.push(`${quote(field)} ${operation === 'eq' ? '=' : '>='} $${params.length}`);
  }
  let order = '';
  const orderParam = url.searchParams.get('order');
  if (orderParam) {
    const [field, direction = 'asc'] = orderParam.split('.');
    if (!spec.orders.has(field) || !['asc','desc'].includes(direction)) throw new Error('Editorial order is not allowed');
    order = ` order by ${quote(field)} ${direction}`;
  }
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 500);
  const select = columns[0] === '*' ? '*' : columns.map(quote).join(',');
  return { sql: `select ${select} from ${quote(table)}${where.length ? ` where ${where.join(' and ')}` : ''}${order} limit ${limit}`, params };
}

async function runRpc(pool, name, args = {}) {
  if (name === 'editorial_claim') {
    const result = await pool.query('select editorial_claim($1::date,$2::uuid) as result', [args.p_date, args.p_attempt]);
    return result.rows[0]?.result;
  }
  if (name === 'editorial_finish') {
    const result = await pool.query('select editorial_finish($1::date,$2::uuid,$3::jsonb,$4,$5::jsonb) as result',
      [args.p_date, args.p_attempt, args.p_payload, args.p_hash, args.p_detail || {}]);
    return result.rows[0]?.result;
  }
  if (name === 'editorial_transition') {
    const result = await pool.query('select editorial_transition($1,$2,$3,$4::jsonb,$5,$6) as result',
      [args.p_id, args.p_version, args.p_action, args.p_payload, args.p_hash, Boolean(args.p_reviewed)]);
    return result.rows[0]?.result;
  }
  if (name === 'editorial_manual_create') {
    const result = await pool.query(
      'select editorial_manual_create($1::date,$2::jsonb,$3) as result',
      [args.p_date, args.p_payload, args.p_hash],
    );
    return result.rows[0]?.result;
  }
  throw new Error('Editorial RPC is not allowed');
}

export async function registerEditorialRoutes(app, { pool, config }) {
  app.post('/api/internal/editorial', async (request, reply) => {
    const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!same(supplied, config.editorialInternalToken)) return reply.status(401).send({ error: 'Unauthorized' });
    try {
      if (request.body?.action === 'request') {
        const spec = querySpec(request.body.path);
        const result = await pool.query(spec.sql, spec.params);
        return { data: result.rows };
      }
      if (request.body?.action === 'rpc') return { data: await runRpc(pool, request.body.name, request.body.args) };
      return reply.status(400).send({ error: 'Invalid editorial action' });
    } catch (error) {
      request.log.warn({ code: error.code || error.name }, 'editorial internal request failed');
      const status = ['23505','P0001'].includes(error.code) ? 409 : 400;
      return reply.status(status).send({ error: 'Editorial operation failed', code: error.code || error.name });
    }
  });
}
