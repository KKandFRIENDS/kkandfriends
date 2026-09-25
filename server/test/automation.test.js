import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';

const token = 'a'.repeat(32);
const config = {
  production: false,
  publicOrigin: 'https://www.kkandfriends.com',
  apiOrigin: 'https://api.kkandfriends.com',
  adminUserId: 'admin-id',
  editorialInternalToken: token,
};
const auth = { handler: async () => new Response('{}'), api: { getSession: async () => null } };

test('automation endpoint rejects missing credentials before querying', async () => {
  let queries = 0;
  const pool = { query: async () => { queries += 1; return { rows: [], rowCount: 0 }; } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'POST', url: '/api/internal/automation', payload: { action: 'briefClaim' } });
  assert.equal(response.statusCode, 401);
  assert.equal(queries, 0);
  await app.close();
});

test('brief claim is idempotent unless force is explicit', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [], rowCount: 0 };
  } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const headers = { authorization: `Bearer ${token}` };
  const first = await app.inject({ method: 'POST', url: '/api/internal/automation', headers,
    payload: { action: 'briefClaim', date: '2026-09-25', kind: 'global', force: false } });
  assert.deepEqual(first.json(), { data: { claimed: false } });
  assert.equal(calls.length, 1);
  const forced = await app.inject({ method: 'POST', url: '/api/internal/automation', headers,
    payload: { action: 'briefClaim', date: '2026-09-25', kind: 'global', force: true } });
  assert.deepEqual(forced.json(), { data: { claimed: true, forced: true } });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].params, ['2026-09-25', 'global']);
  await app.close();
});

test('brief publication commits post, notifications, and lock together', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/returning id/.test(sql) && /member_posts/.test(sql)) return { rows: [{ id: 'post-id' }], rowCount: 1 };
      if (/insert into notifications/.test(sql)) return { rows: [{ id: 'n1' }, { id: 'n2' }], rowCount: 2 };
      if (/update daily_briefs/.test(sql)) return { rows: [{ brief_date: '2026-09-25' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push({ sql: 'release' }); },
  };
  const pool = { connect: async () => client };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'POST', url: '/api/internal/automation',
    headers: { authorization: `Bearer ${token}` }, payload: {
      action: 'briefPublish', date: '2026-09-25', kind: 'korea_close',
      notificationType: 'korea_close', title: '마감', body: '본문', category: '시장/매크로',
    } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: { postId: 'post-id', notified: 2 } });
  assert.equal(calls[0].sql, 'begin');
  assert.equal(calls.at(-2).sql, 'commit');
  assert.equal(calls.at(-1).sql, 'release');
  assert.equal(calls.some((call) => call.sql === 'rollback'), false);
  await app.close();
});

test('digest context uses fixed parameterized queries', async () => {
  const calls = [];
  const results = [
    { rows: [{ id: 'post', author_name: 'KK' }] },
    { rows: [{ id: 'event' }] },
    { rows: [{ contact_email: 'member@example.com' }] },
  ];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return results[calls.length - 1];
  } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'POST', url: '/api/internal/automation',
    headers: { authorization: `Bearer ${token}` }, payload: {
      action: 'digestContext', since: '2026-09-18T00:00:00.000Z', now: '2026-09-25T00:00:00.000Z',
    } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.posts[0].author_name, 'KK');
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /published_at >= \$1/);
  assert.deepEqual(calls[0].params, ['2026-09-18T00:00:00.000Z']);
  await app.close();
});
