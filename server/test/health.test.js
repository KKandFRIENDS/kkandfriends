import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';

const config = { production: false, publicOrigin: 'https://www.kkandfriends.com', apiOrigin: 'https://api.kkandfriends.com' };
const auth = {
  handler: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  api: { getSession: async () => null },
};

test('health reports database readiness without leaking diagnostics', async () => {
  const app = await buildApp({ config, pool: {}, auth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, database: true });
  await app.close();
});

test('health fails closed and session requires authentication', async () => {
  const app = await buildApp({ config, pool: {}, auth, databaseHealth: async () => { throw new Error('secret detail'); } });
  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 503);
  assert.ok(!health.body.includes('secret detail'));
  const session = await app.inject({ method: 'GET', url: '/api/v1/session' });
  assert.equal(session.statusCode, 401);
  await app.close();
});


test('rate limiting keys on the forwarded client, not the proxy', async () => {
  const app = await buildApp({ config, pool: {}, auth, databaseHealth: async () => true });
  const hit = (ip) => app.inject({ method: 'GET', url: '/health', remoteAddress: '172.18.0.2', headers: { 'x-forwarded-for': `6.6.6.6, ${ip}` } });
  const first = await hit('203.0.113.1');
  const second = await hit('203.0.113.1');
  const other = await hit('198.51.100.7');
  assert.equal(Number(second.headers['x-ratelimit-remaining']), Number(first.headers['x-ratelimit-remaining']) - 1);
  assert.equal(other.headers['x-ratelimit-remaining'], first.headers['x-ratelimit-remaining']);
  await app.close();
});
