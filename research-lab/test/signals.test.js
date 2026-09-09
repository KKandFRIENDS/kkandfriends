import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/errors.js';
import { canonicalizeSourceUrl, classifySourceUrl, normalizeSignals } from '../src/signals.js';

const policy = {
  primaryDomains: ['example.org'],
  signalOnlyDomains: ['news.example'],
  maxAgeDays: 14,
};

test('source classification derives trust from the domain, not model labels', () => {
  assert.equal(classifySourceUrl('https://data.example.org/report', policy), 'primary');
  assert.equal(classifySourceUrl('https://news.example/story', policy), 'secondary');
  assert.throws(() => classifySourceUrl('https://unknown.example/story', policy), ContractError);
});

test('source classification blocks non-HTTPS and private-network targets', () => {
  assert.throws(() => classifySourceUrl('http://example.org/report', policy), ContractError);
  assert.throws(() => classifySourceUrl('https://127.0.0.1/secret', policy), ContractError);
  assert.throws(() => classifySourceUrl('https://192.168.1.5/secret', policy), ContractError);
  assert.throws(() => classifySourceUrl('https://user:pass@example.org/report', policy), ContractError);
});

test('canonical URL removes tracking parameters and fragments', () => {
  assert.equal(
    canonicalizeSourceUrl('https://EXAMPLE.org/report?utm_source=x&id=7#section'),
    'https://example.org/report?id=7',
  );
});

test('signal normalization rejects stale items and deduplicates canonical URLs', () => {
  const now = new Date('2099-01-15T00:00:00.000Z');
  const base = {
    id: 'one',
    title: 'Official report',
    summary: 'Summary',
    publishedAt: '2099-01-10T00:00:00.000Z',
    source: { title: 'Official', url: 'https://example.org/report?utm_source=a' },
  };
  const result = normalizeSignals(
    [
      base,
      { ...base, id: 'two', source: { ...base.source, url: 'https://example.org/report?utm_source=b' } },
      { ...base, id: 'old', publishedAt: '2098-01-01T00:00:00.000Z' },
    ],
    policy,
    { now },
  );
  assert.equal(result.signals.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /stale/);
});
