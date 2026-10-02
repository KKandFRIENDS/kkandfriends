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

test('personal-experience guard checks each field within one sentence', async () => {
  const { hasPersonalExperience } = await import('../src/routes/editorial.js');
  const draft = (text, extra = '평범한 문장입니다.') => ({ title: '제목', summary: '요약', sections: [{ heading: '핵심 판단', text }, { heading: '반론', text: extra }] });
  // Previously rejected: "드러나는 " in one place and "경험" anywhere later.
  assert.equal(hasPersonalExperience(draft('시장에서 드러나는 신호가 있다.', '과거 경험과 다르다.')), false);
  assert.equal(hasPersonalExperience(draft('시장에서 드러나는 신호는\n과거 경험과 다르다.')), false);
  assert.equal(hasPersonalExperience(draft('나는 딜링룸에서 이런 장면을 경험했다.')), true);
  assert.equal(hasPersonalExperience(draft('그때 내가 근무하던 은행은 달랐다.')), true);
  assert.equal(hasPersonalExperience(draft('제가 직접 경험한 일입니다.')), true);
  assert.equal(hasPersonalExperience(draft('내 경험상 이런 장세는 짧다.')), true);
  assert.equal(hasPersonalExperience({ ...draft('평범'), title: '나는 그 시절을 경험했다' }), true);
});
