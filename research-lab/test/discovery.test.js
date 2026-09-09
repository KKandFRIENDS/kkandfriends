import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/errors.js';
import { STREAMS } from '../src/constants.js';
import { buildDiscoveryPrompt, parseDiscoveryOutput } from '../src/discovery.js';

const signals = STREAMS.map((stream, index) => ({
  id: `signal-${index}`,
  title: `${stream} signal`,
  summary: 'Synthetic signal for contract testing',
  publishedAt: '2099-01-01',
  source: {
    type: 'primary',
    title: `${stream} primary source`,
    url: `https://example.test/signal-${index}`,
  },
}));

function rawCandidate(stream, streamIndex, itemIndex) {
  return {
    id: `${streamIndex}-${itemIndex}`,
    stream,
    title: `${stream} candidate ${itemIndex}`,
    centralClaim: 'Synthetic central claim',
    scoreRationales: {},
    scores: {
      publicRelevance: 8,
      significance: 8,
      evidenceQuality: 8,
      newInsight: 8,
      kkFit: 8,
      timeliness: 8,
    },
    sourceIds: [`signal-${streamIndex}`],
    duplicateOf: null,
    conflictStatus: 'clear',
  };
}

const payload = {
  candidates: STREAMS.flatMap((stream, streamIndex) =>
    [0, 1, 2].map((itemIndex) => rawCandidate(stream, streamIndex, itemIndex)),
  ),
};

test('discovery prompt requires 15 grounded candidates', () => {
  const prompt = buildDiscoveryPrompt({ weekKey: '2099-W01', signals, recentTitles: ['old title'] });
  assert.match(prompt, /exactly 3 candidates per stream, 15 total/);
  assert.match(prompt, /Do not invent URLs/);
  assert.match(prompt, /old title/);
});

test('discovery parser hydrates source metadata from trusted signals', () => {
  const candidates = parseDiscoveryOutput(payload, signals);
  assert.equal(candidates.length, 15);
  assert.equal(candidates[0].sources[0].url, 'https://example.test/signal-0');
});

test('discovery parser rejects an invented source ID', () => {
  const tampered = structuredClone(payload);
  tampered.candidates[0].sourceIds = ['invented-source'];
  assert.throws(() => parseDiscoveryOutput(tampered, signals), ContractError);
});

test('discovery parser rejects uneven stream coverage', () => {
  const shortened = { candidates: payload.candidates.slice(1) };
  assert.throws(() => parseDiscoveryOutput(shortened, signals), ContractError);
});
