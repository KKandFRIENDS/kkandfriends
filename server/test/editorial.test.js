import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';

const token = 'e'.repeat(32);
const config = {
  production: false,
  publicOrigin: 'https://www.kkandfriends.com',
  apiOrigin: 'https://api.kkandfriends.com',
  adminUserId: 'admin-id',
  editorialInternalToken: token,
  editorialPublishEnabled: true,
};

const auth = {
  handler: async () => new Response('{}'),
  api: { getSession: async () => null },
};

test('editorial endpoint rejects missing credentials before querying', async () => {
  let queries = 0;
  const pool = { query: async () => { queries += 1; return { rows: [] }; } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'POST', url: '/api/internal/editorial', payload: { action: 'request', path: 'editorial_drafts?select=*' } });
  assert.equal(response.statusCode, 401);
  assert.equal(queries, 0);
  await app.close();
});

test('editorial endpoint converts an allowed query into parameterized SQL', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: '2026-09-25-ai' }] };
  } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({
    method: 'POST',
    url: '/api/internal/editorial',
    headers: { authorization: `Bearer ${token}` },
    payload: { action: 'request', path: 'editorial_drafts?status=eq.published&select=id,edition_date,payload&order=edition_date.desc&limit=56' },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: [{ id: '2026-09-25-ai' }] });
  assert.deepEqual(calls[0].params, ['published']);
  assert.match(calls[0].sql, /where "status" = \$1 order by "edition_date" desc limit 56$/);
  await app.close();
});

test('editorial endpoint rejects tables outside its allowlist', async () => {
  let queries = 0;
  const pool = { query: async () => { queries += 1; return { rows: [] }; } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({
    method: 'POST',
    url: '/api/internal/editorial',
    headers: { authorization: `Bearer ${token}` },
    payload: { action: 'request', path: 'profiles?select=*' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(queries, 0);
  await app.close();
});

test('editorial bridge allows only the manual-create RPC with parameterized values', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ result: { id: '2026-09-27-weekly' } }] }; } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const payload = { desk: { id: 'weekly' }, content: { title: 'Weekly' } };
  const response = await app.inject({ method: 'POST', url: '/api/internal/editorial', headers: { authorization: `Bearer ${token}` }, payload: { action: 'rpc', name: 'editorial_manual_create', args: { p_date: '2026-09-27', p_payload: payload, p_hash: 'a'.repeat(64) } } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: { id: '2026-09-27-weekly' } });
  assert.match(calls[0].sql, /editorial_manual_create/);
  assert.deepEqual(calls[0].params, ['2026-09-27', payload, 'a'.repeat(64)]);
  await app.close();
});

test('browser editorial endpoint requires an authenticated admin session', async () => {
  const calls = [];
  const adminAuth = { handler: async () => new Response('{}'), api: { getSession: async () => ({ user: { id: 'admin-id' }, session: { id: 'session-id' } }) } };
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/from profiles/.test(sql)) return { rows: [{ id: 'admin-id', status: 'approved' }] };
    return { rows: [] };
  } };
  const app = await buildApp({ config, pool, auth: adminAuth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'GET', url: '/api/v1/editorial' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { drafts: [], runs: [] });
  assert.equal(calls.filter(({ sql }) => /editorial_(drafts|runs)/.test(sql)).length, 2);
  await app.close();
});

const routineToken = 'r'.repeat(40);
const routineConfig = { ...config, editorialRoutineToken: routineToken };
const seoulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function routineBody(date = seoulToday()) {
  const weekly = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
  const headings = weekly
    ? ['이번 주 핵심', '거시경제', '금융시장', 'Bitcoin', 'AI', '주요 논쟁', '한국', '종합 판단', '다음 주 관찰 항목']
    : ['핵심 판단', '확인된 사실', '시장의 해석', '검토할 관점', '반론', '관찰 지표'];
  const per = Math.ceil((weekly ? 2000 : 950) / headings.length);
  return {
    date,
    content: { title: '시험 제목', summary: '시험 소개', sections: headings.map((heading, i) => ({ heading, text: '가'.repeat(per), sourceIds: [i % 2 ? 'S02' : 'S01'] })) },
    sources: [
      { id: 'S01', title: '원자료', url: 'https://www.sec.gov/newsroom/a', type: 'primary', excerpt: 'The Commission reported 208 initial public offerings in the first half.' },
      { id: 'S02', title: '독립 출처', url: 'https://www.renaissancecapital.com/b', type: 'secondary', excerpt: 'There have been 110 IPOs priced this year, down 30.4% from last year.' },
    ],
    evidence: [
      { statement: '상반기 IPO 208건', quote: 'reported 208 initial public offerings', asOf: '2026-06-30', unit: '건', sourceId: 'S01' },
      { statement: '올해 IPO 110건', quote: 'There have been 110 IPOs priced', asOf: '2026-09-28', unit: '건', sourceId: 'S02' },
    ],
    review: { passed: true, issues: [] },
  };
}

test('routine endpoint rejects a missing or wrong token before touching the database', async () => {
  let queries = 0;
  const pool = { query: async () => { queries += 1; return { rows: [] }; } };
  const app = await buildApp({ config: routineConfig, pool, auth, databaseHealth: async () => true });
  for (const headers of [{}, { authorization: `Bearer ${token}` }]) {
    const response = await app.inject({ method: 'POST', url: '/api/routine/editorial', headers, payload: routineBody() });
    assert.equal(response.statusCode, 401);
  }
  assert.equal(queries, 0);
  await app.close();
});

test('routine endpoint is closed when no routine token is configured', async () => {
  const pool = { query: async () => ({ rows: [] }) };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'POST', url: '/api/routine/editorial', headers: { authorization: 'Bearer undefined' }, payload: routineBody() });
  assert.equal(response.statusCode, 401);
  await app.close();
});

test('routine endpoint queues a validated draft for approval only', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ result: { id: `${params[0]}-x`, status: 'awaiting_approval' } }] }; } };
  const app = await buildApp({ config: routineConfig, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'POST', url: '/api/routine/editorial', headers: { authorization: `Bearer ${routineToken}` }, payload: routineBody() });
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(response.json().status, 'awaiting_approval');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /editorial_manual_create/);
  const payload = calls[0].params[1];
  assert.equal(payload.qa.routineDraft, true);
  assert.equal(payload.qa.modelReview.passed, true);
  assert.equal(payload.models.writer, 'claude-code-routine');
  await app.close();
});

test('routine endpoint rejects quotes that are not in the source excerpt', async () => {
  let queries = 0;
  const pool = { query: async () => { queries += 1; return { rows: [] }; } };
  const app = await buildApp({ config: routineConfig, pool, auth, databaseHealth: async () => true });
  const body = routineBody();
  body.evidence[0].quote = 'a quote that never appeared anywhere';
  const response = await app.inject({ method: 'POST', url: '/api/routine/editorial', headers: { authorization: `Bearer ${routineToken}` }, payload: body });
  assert.equal(response.statusCode, 400);
  assert.equal(queries, 0);
  await app.close();
});

test('routine endpoint refuses old editions and duplicate dates', async () => {
  const pool = { query: async () => { const error = new Error('duplicate'); error.code = '23505'; throw error; } };
  const app = await buildApp({ config: routineConfig, pool, auth, databaseHealth: async () => true });
  const old = await app.inject({ method: 'POST', url: '/api/routine/editorial', headers: { authorization: `Bearer ${routineToken}` }, payload: routineBody('2026-01-05') });
  assert.equal(old.statusCode, 400);
  const dup = await app.inject({ method: 'POST', url: '/api/routine/editorial', headers: { authorization: `Bearer ${routineToken}` }, payload: routineBody() });
  assert.equal(dup.statusCode, 409);
  await app.close();
});
