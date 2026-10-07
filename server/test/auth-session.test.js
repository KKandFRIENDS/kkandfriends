import assert from 'node:assert/strict';
import test from 'node:test';
import { SESSION_MAX_AGE_SECONDS } from '../src/auth.js';

test('member sessions last 30 days', () => {
  assert.equal(SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 30);
});
