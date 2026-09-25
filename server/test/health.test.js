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

