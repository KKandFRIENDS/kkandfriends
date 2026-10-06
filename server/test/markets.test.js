import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';

const config = {
  production: false,
  publicOrigin: 'https://www.kkandfriends.com',
  apiOrigin: 'https://api.kkandfriends.com',
  adminUserId: 'admin-id',
  editorialInternalToken: 'a'.repeat(32),
};
const BRIEF_ID = '11111111-2222-3333-4444-555555555555';
const authAs = (userId) => ({
  handler: async () => new Response('{}'),
  api: { getSession: async () => (userId ? { user: { id: userId }, session: {} } : null) },
});
function fakePool({ status = 'approved', briefs = [] } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/from profiles/.test(sql)) return { rows: [{ id: 'u1', status }] };
      if (/from daily_briefs/.test(sql)) return { rows: briefs.filter(b => !params?.length || typeof params[0] === 'number' || b.id === params[0] || (b.date === params[0] && b.kind === params[1])) };
      if (/from editorial_drafts/.test(sql)) return { rows: [{ id: '2026-10-06-markets', payload: {} }] };
      return { rows: [], rowCount: 0 };
    },
  };
}

test('Daily Markets list and item are public', async () => {
  const pool = fakePool({ briefs: [{ id: BRIEF_ID, kind: 'global', date: '2026-10-06', title: '오늘의 시작 (10/6 화)' }] });
  const app = await buildApp({ config, pool, auth: authAs(null), databaseHealth: async () => true });
  const list = await app.inject({ method: 'GET', url: '/api/v1/markets' });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().briefs.length, 1);
  assert.match(pool.calls.at(-1).sql, /b\.status = 'published' and p\.status = 'published' and p\.is_hidden = false/);
  const one = await app.inject({ method: 'GET', url: '/api/v1/markets/2026-10-06-start' });
  assert.equal(one.statusCode, 200);
  assert.equal(one.json().brief.title, '오늘의 시작 (10/6 화)');
  const moved = await app.inject({ method: 'GET', url: `/api/v1/markets/by-post/${BRIEF_ID}` });
  assert.equal(moved.statusCode, 200);
  const bad = await app.inject({ method: 'GET', url: '/api/v1/markets/2026-10-06-noon' });
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/markets/2026-10-06-close' })).statusCode, 404);
  assert.equal(bad.statusCode, 404);
  await app.close();
});

test('KK Daily / Weekly need an approved member', async () => {
  for (const [user, status, code] of [[null, 'approved', 401], ['u1', 'pending', 403], ['u1', 'approved', 200]]) {
    const app = await buildApp({ config, pool: fakePool({ status }), auth: authAs(user), databaseHealth: async () => true });
    const list = await app.inject({ method: 'GET', url: '/api/v1/desk' });
    const one = await app.inject({ method: 'GET', url: '/api/v1/desk/2026-10-06-markets' });
    assert.equal(list.statusCode, code);
    assert.equal(one.statusCode, code);
    await app.close();
  }
});

test('lounge feed leaves the briefs out', async () => {
  const pool = fakePool();
  const app = await buildApp({ config, pool, auth: authAs('u1'), databaseHealth: async () => true });
  await app.inject({ method: 'GET', url: '/api/v1/posts' });
  assert.match(pool.calls.at(-1).sql, /not exists \(select 1 from daily_briefs b where b\.post_id = p\.id\)/);
  await app.inject({ method: 'GET', url: '/api/v1/posts?mine=true' });
  assert.doesNotMatch(pool.calls.at(-1).sql, /daily_briefs/);
  await app.close();
});

test('a brief thread is public; other lounge threads stay members-only', async () => {
  const pool = fakePool({ briefs: [{ id: BRIEF_ID }] });
  const app = await buildApp({ config, pool, auth: authAs(null), databaseHealth: async () => true });
  const brief = await app.inject({ method: 'GET', url: `/api/v1/discussions/member:${BRIEF_ID}` });
  assert.equal(brief.statusCode, 200);
  const other = await app.inject({ method: 'GET', url: '/api/v1/discussions/member:99999999-2222-3333-4444-555555555555' });
  assert.equal(other.statusCode, 401);
  await app.close();
});
