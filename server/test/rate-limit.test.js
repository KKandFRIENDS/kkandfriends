import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth.js';

const config = { production: false, publicOrigin: 'https://www.kkandfriends.com', apiOrigin: 'https://api.kkandfriends.com' };
const auth = {
  handler: async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } }),
  api: { getSession: async () => null },
};

test('rate limit counts each visitor behind the proxy separately', async () => {
  const app = await buildApp({ config, pool: {}, auth, databaseHealth: async () => true });
  const call = (ip) => app.inject({ method: 'GET', url: '/api/auth/get-session', remoteAddress: '172.18.0.3', headers: { 'x-forwarded-for': ip } });
  for (let i = 0; i < 120; i += 1) await call('203.0.113.7');
  assert.equal((await call('203.0.113.7')).statusCode, 429);
  assert.equal((await call('198.51.100.9')).statusCode, 200);
  await app.close();
});

test('a public client cannot pick its own rate-limit bucket', async () => {
  const app = await buildApp({ config, pool: {}, auth, databaseHealth: async () => true });
  const call = (ip) => app.inject({ method: 'GET', url: '/api/auth/get-session', remoteAddress: '203.0.113.50', headers: { 'x-forwarded-for': ip } });
  for (let i = 0; i < 120; i += 1) await call(`198.51.100.${i % 200}`);
  assert.equal((await call('192.0.2.1')).statusCode, 429);
  await app.close();
});

test('sessions last 30 days and slide forward daily', () => {
  const instance = createAuth({ ...config, databaseUrl: 'postgres://unused@127.0.0.1:1/none', authSecret: 'test-secret-'.repeat(4) });
  assert.equal(instance.options.session.expiresIn, 60 * 60 * 24 * 30);
  assert.equal(instance.options.session.updateAge, 60 * 60 * 24);
});
