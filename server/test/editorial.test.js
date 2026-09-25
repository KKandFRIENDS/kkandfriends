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
