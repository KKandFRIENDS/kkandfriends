import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

test('production config fails closed when a secret is missing', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL/);
});

test('production config requires HTTPS origins', () => {
  const env = {
    NODE_ENV: 'production', DATABASE_URL: 'postgres://x', BETTER_AUTH_SECRET: 'x',
    GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', KAKAO_CLIENT_ID: 'x',
    KAKAO_CLIENT_SECRET: 'x', ADMIN_USER_ID: 'x', PUBLIC_ORIGIN: 'http://site',
    API_ORIGIN: 'https://api.example.com', EDITORIAL_INTERNAL_TOKEN: 'x'.repeat(32),
  };
  assert.throws(() => loadConfig(env), /HTTPS/);
});

