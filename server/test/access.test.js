import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';

const config = {
  production: false,
  publicOrigin: 'https://www.kkandfriends.com',
  apiOrigin: 'https://api.kkandfriends.com',
  adminUserId: 'admin-id',
};

const authFor = (user) => ({
  handler: async () => new Response('{}'),
  api: { getSession: async () => user ? { user, session: { id: 'session-id' } } : null },
});

test('member endpoints reject anonymous callers before querying application data', async () => {
  let queries = 0;
  const pool = { query: async () => { queries += 1; return { rows: [] }; } };
  const app = await buildApp({ config, pool, auth: authFor(null), databaseHealth: async () => true });
  const response = await app.inject({ method: 'GET', url: '/api/v1/posts' });
  assert.equal(response.statusCode, 401);
  assert.equal(queries, 0);
  await app.close();
});

test('pending users cannot read the member lounge', async () => {
  const pool = { query: async () => ({ rows: [{ id: 'pending-id', status: 'pending' }] }) };
  const app = await buildApp({ config, pool, auth: authFor({ id: 'pending-id', name: 'Pending' }), databaseHealth: async () => true });
  const response = await app.inject({ method: 'GET', url: '/api/v1/posts' });
  assert.equal(response.statusCode, 403);
  await app.close();
});

test('approved members cannot use admin routes', async () => {
  const pool = { query: async () => ({ rows: [{ id: 'member-id', status: 'approved' }] }) };
  const app = await buildApp({ config, pool, auth: authFor({ id: 'member-id', name: 'Member' }), databaseHealth: async () => true });
  const response = await app.inject({ method: 'GET', url: '/api/v1/admin/reports' });
  assert.equal(response.statusCode, 403);
  await app.close();
});

test('public original feed is available without authentication', async () => {
  const pool = { query: async (sql) => {
    assert.match(sql, /status='published'/);
    return { rows: [{ slug: 'test-article', status: 'published' }] };
  } };
  const app = await buildApp({ config, pool, auth: authFor(null), databaseHealth: async () => true });
  const response = await app.inject({ method: 'GET', url: '/api/v1/original' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().posts[0].slug, 'test-article');
  await app.close();
});

test('CORS permits the PUT used to publish an existing KK ORIGINAL draft', async () => {
  const pool = { query: async () => ({ rows: [] }) };
  const app = await buildApp({ config, pool, auth: authFor(null), databaseHealth: async () => true });
  const response = await app.inject({
    method: 'OPTIONS',
    url: '/api/v1/original/draft-id',
    headers: {
      origin: config.publicOrigin,
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'content-type',
    },
  });
  assert.equal(response.statusCode, 204);
  assert.match(response.headers['access-control-allow-methods'], /\bPUT\b/);
  assert.equal(response.headers['access-control-allow-origin'], config.publicOrigin);
  await app.close();
});

test('unsubscribe requires a valid opaque token and does not reveal the member', async () => {
  let queries = 0;
  const pool = { query: async (sql, params) => {
    queries += 1;
    assert.match(sql, /digest_opt_in=false/);
    assert.deepEqual(params, ['123e4567-e89b-42d3-a456-426614174000']);
    return { rows: [{ id: 'private-member-id' }] };
  } };
  const app = await buildApp({ config, pool, auth: authFor(null), databaseHealth: async () => true });
  const invalid = await app.inject({ method: 'POST', url: '/api/v1/unsubscribe', payload: { token: 'bad' } });
  assert.equal(invalid.statusCode, 400);
  assert.equal(queries, 0);
  const valid = await app.inject({ method: 'POST', url: '/api/v1/unsubscribe', payload: { token: '123e4567-e89b-42d3-a456-426614174000' } });
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(valid.json(), { unsubscribed: true });
  assert.equal(queries, 1);
  assert.ok(!valid.body.includes('private-member-id'));
  await app.close();
});
