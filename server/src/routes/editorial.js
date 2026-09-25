import { createHash, timingSafeEqual } from 'node:crypto';
import { resolveViewer, requireAdmin } from '../access.js';

const DESKS = [
  ['weekly', 'KK WEEKLY', 'Global'], ['macro', 'MACRO MONDAY', 'Macro'],
  ['markets', 'MARKETS TUESDAY', 'Equity'], ['bitcoin', 'BITCOIN WEDNESDAY', 'Digital Assets'],
  ['ai', 'AI THURSDAY', 'Global'], ['signals', 'SIGNAL FRIDAY', 'Global'],
  ['korea', 'KOREA SATURDAY', 'Korea'],
];
const DAILY_SECTIONS = ['핵심 판단', '확인된 사실', '시장의 해석', '검토할 관점', '반론', '관찰 지표'];
const WEEKLY_SECTIONS = ['이번 주 핵심', '거시경제', '금융시장', 'Bitcoin', 'AI', '주요 논쟁', '한국', '종합 판단', '다음 주 관찰 항목'];

function deskFor(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Invalid date');
  const [id, label, topic] = DESKS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return { id, label, topic, series: id === 'weekly' ? 'KK WEEKLY' : 'DAILY DESK' };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const hashContent = (content) => createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
const hasText = (value, max = 10000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

function validateContent(content, { sources, date, related = [] }) {
  const desk = deskFor(date);
  if (!hasText(content?.title, 160) || !hasText(content?.summary, 400)) throw new Error('Title and summary required');
  const headings = desk.id === 'weekly' ? WEEKLY_SECTIONS : DAILY_SECTIONS;
  if (!Array.isArray(content.sections) || content.sections.length !== headings.length) throw new Error('Section structure invalid');
  const sourceIds = new Set(sources.map((source) => source.id));
  content.sections.forEach((section, index) => {
    if (section.heading !== headings[index] || !hasText(section.text) || !Array.isArray(section.sourceIds) || !section.sourceIds.length || section.sourceIds.some((id) => !sourceIds.has(id))) throw new Error('Every section requires known sources');
  });
  const characters = [...content.sections.map((section) => section.text).join('\n\n')].length;
  const [min, max] = desk.id === 'weekly' ? [1600, 4000] : [800, 1200];
  if (characters < min || characters > max) throw new Error(`Body length ${characters}; expected ${min}–${max} including spaces`);
  if (!Array.isArray(content.relatedUrls) || content.relatedUrls.some((url) => !related.some((item) => item.url === url))) throw new Error('Unknown related article');
  const joined = JSON.stringify(content);
  if (/<\/?[a-z]|\[확인 필요\]|https?:\/\//i.test(content.sections.map((section) => section.text).join(' '))) throw new Error('Use source IDs, plain text and resolved facts');
  if (/내가 .*근무|나는 .*경험|제가 .*경험|내 경험상/.test(joined)) throw new Error('Unapproved personal experience');
  return { characters, checks: ['출처 ID', '인용문 대조', '문단 구조', '글자 수', '관련 글 URL'], humanReviewRequired: true };
}

function validateEvidence(claims, sources) {
  if (!Array.isArray(claims) || claims.length < 2 || claims.length > 15) throw new Error('2–15 evidence records required');
  const lookup = new Map(sources.map((source) => [source.id, source]));
  for (const claim of claims) {
    const source = lookup.get(claim.sourceId);
    if (!source || !hasText(claim.statement, 1200) || !hasText(claim.quote, 300) || claim.quote.length < 15 || !source.excerpt.includes(claim.quote)) throw new Error('Evidence quote is not in retrieved source');
    if (source.signalKind || !hasText(claim.asOf, 100) || !hasText(claim.unit, 100)) throw new Error('Evidence date and unit required');
  }
  if (!claims.some((claim) => lookup.get(claim.sourceId).type === 'primary')) throw new Error('Primary evidence required');
}

function validateManualDraft(body) {
  if (!body || body.action !== 'create' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new Error('Invalid manual draft');
  const desk = deskFor(body.date);
  if (!['DAILY DESK', 'KK WEEKLY'].includes(body.series) || desk.series !== body.series) throw new Error('Series and date do not match');
  if (!Array.isArray(body.sources) || body.sources.length < 2 || body.sources.length > 12) throw new Error('At least two sources are required');
  const sources = body.sources.map((source, index) => {
    if (!source || !hasText(source.title, 300) || !['primary', 'secondary'].includes(source.type) || !hasText(source.quote, 20000) || source.quote.trim().length < 30) throw new Error('Invalid source');
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid source URL');
    return { id: `M${index + 1}`, title: source.title.trim(), url: url.href, type: source.type, excerpt: source.quote.trim(), publishedAt: body.date };
  });
  const sourceIds = sources.map((source) => source.id);
  const content = {
    title: String(body.content?.title || '').trim(), summary: String(body.content?.summary || '').trim(),
    sections: Array.isArray(body.content?.sections) ? body.content.sections.map((section) => ({ heading: String(section.heading || '').trim(), text: String(section.text || '').trim(), sourceIds })) : [],
    relatedUrls: [],
  };
  const evidence = sources.map((source) => ({ statement: `${source.title}에서 확인한 수동 작성 근거`, quote: source.excerpt, asOf: body.date, unit: '원문', sourceId: source.id }));
  const qa = validateContent(content, { date: body.date, sources, related: [] });
  validateEvidence(evidence, sources);
  return {
    schemaVersion: 1, desk, content, sources, evidence,
    counterargument: content.sections.find((section) => section.heading === '반론' || section.heading === '주요 논쟁')?.text || '',
    watchItem: content.sections.at(-1)?.text || '',
    top5: [{ id: 'manual-chief-draft', title: content.title, score: 100, reason: 'Chief가 고정 포맷으로 직접 작성', reasons: [] }],
    selectedId: 'manual-chief-draft', related: [],
    qa: { ...qa, modelReview: null, manualDraft: true, humanReviewRequired: true },
    models: { writer: 'manual' }, memoryIds: [], collection: { manual: true },
  };
}

function validateReplacementPayload(payload, draft) {
  if (!payload || typeof payload !== 'object' || JSON.stringify(payload).length > 500000) throw new Error('Invalid replacement payload');
  if (!Array.isArray(payload.sources) || payload.sources.length < 2 || payload.sources.length > 20) throw new Error('Replacement sources required');
  const sourceIds = new Set();
  for (const source of payload.sources) {
    if (!source || !hasText(source.id, 100) || sourceIds.has(source.id) || !hasText(source.title, 300) || !['primary', 'secondary'].includes(source.type) || !hasText(source.excerpt, 20000) || source.excerpt.length < 30) throw new Error('Invalid replacement source');
    sourceIds.add(source.id);
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid replacement source URL');
  }
  if (!Array.isArray(payload.related) || !Array.isArray(payload.top5) || !payload.top5.length || typeof payload.selectedId !== 'string') throw new Error('Incomplete replacement payload');
  if (!payload.qa || payload.qa.modelReview?.passed !== true || !Array.isArray(payload.qa.modelReview?.issues) || payload.qa.modelReview.issues.length) throw new Error('Model review required');
  validateEvidence(payload.evidence, payload.sources);
  const normalized = { ...payload, desk: deskFor(draft.edition_date) };
  normalized.qa = { ...payload.qa, ...validateContent(payload.content, { date: draft.edition_date, sources: payload.sources, related: payload.related }), modelReview: payload.qa.modelReview, replacedByAdmin: true };
  return normalized;
}

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

export async function registerEditorialRoutes(app, { auth, pool, config }) {
  app.get('/api/v1/editorial', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const [drafts, runs] = await Promise.all([
      pool.query('select * from editorial_drafts order by edition_date desc limit 40'),
      pool.query('select * from editorial_runs order by edition_date desc limit 14'),
    ]);
    return { drafts: drafts.rows, runs: runs.rows };
  });

  app.post('/api/v1/editorial', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    try {
      const body = request.body;
      if (body?.action === 'create') {
        const payload = validateManualDraft(body);
        const draft = await runRpc(pool, 'editorial_manual_create', { p_date: body.date, p_payload: payload, p_hash: hashContent(payload.content) });
        return reply.status(201).send({ draft });
      }
      if (!body || !/^\d{4}-\d{2}-\d{2}-(macro|markets|bitcoin|ai|signals|korea|weekly)$/.test(body.id) || !Number.isSafeInteger(body.version) || !['revise', 'replace', 'approve', 'reject', 'publish'].includes(body.action)) return reply.status(400).send({ error: 'Invalid request' });
      const result = await pool.query('select * from editorial_drafts where id=$1 limit 1', [body.id]);
      const draft = result.rows[0];
      if (!draft) return reply.status(404).send({ error: 'Not found' });
      if (draft.version !== body.version) return reply.status(409).send({ error: '다른 변경이 있습니다. 새로고침하세요.' });
      let payload = draft.payload;
      if (body.action === 'revise') {
        validateContent(body.content, { date: draft.edition_date, sources: payload.sources, related: payload.related });
        payload = { ...payload, content: body.content, desk: deskFor(draft.edition_date), qa: { ...payload.qa, modelReview: null, revisedByAdmin: true } };
      }
      if (body.action === 'replace') {
        if (draft.status !== 'rejected') return reply.status(409).send({ error: '보류된 초안만 근거 묶음을 교체할 수 있습니다.' });
        payload = validateReplacementPayload(body.payload, draft);
      }
      if (body.action === 'approve' && body.reviewed !== true) return reply.status(400).send({ error: '출처·숫자·견해 검토 확인이 필요합니다.' });
      if (body.action === 'publish' && !config.editorialPublishEnabled) return reply.status(503).send({ error: '발행 연결이 아직 활성화되지 않았습니다.' });
      const changed = await runRpc(pool, 'editorial_transition', {
        p_id: body.id, p_version: body.version, p_action: body.action === 'replace' ? 'revise' : body.action,
        p_payload: payload, p_hash: hashContent(payload.content), p_reviewed: body.reviewed === true,
      });
      return { draft: changed };
    } catch (error) {
      request.log.warn({ code: error.code || error.name }, 'editorial admin request failed');
      const status = ['23505', 'P0001'].includes(error.code) ? 409 : error instanceof SyntaxError ? 400 : 400;
      return reply.status(status).send({ error: error.message || 'Editorial operation failed' });
    }
  });

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
