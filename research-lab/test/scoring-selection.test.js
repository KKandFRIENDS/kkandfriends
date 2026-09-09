import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/errors.js';
import { calculateCandidateScore, clampScore, evaluateCandidate } from '../src/scoring.js';
import { selectWeeklyTopics } from '../src/selection.js';
import { validateCandidate, validateDossier } from '../src/validation.js';
import { sampleCandidates } from '../fixtures/sample-week.js';

test('clampScore keeps scores inside 0..10', () => {
  assert.equal(clampScore(-5), 0);
  assert.equal(clampScore(6.4), 6.4);
  assert.equal(clampScore(99), 10);
});

test('weighted score is deterministic and rounded once', () => {
  assert.equal(calculateCandidateScore(sampleCandidates[0]), 94);
});

test('candidate validation rejects an unknown stream', () => {
  assert.throws(
    () => validateCandidate({ ...sampleCandidates[0], stream: 'Global' }),
    ContractError,
  );
});

test('candidate without a primary source is ineligible', () => {
  const candidate = {
    ...sampleCandidates[0],
    sources: sampleCandidates[0].sources.map((source) => ({ ...source, type: 'secondary' })),
  };
  assert.deepEqual(evaluateCandidate(candidate).reasons, ['missing_primary_source']);
});

test('recent duplicates and restricted conflicts never pass', () => {
  const duplicate = { ...sampleCandidates[0], duplicateOf: 'old-post' };
  const restricted = { ...sampleCandidates[0], conflictStatus: 'restricted' };
  assert.equal(evaluateCandidate(duplicate).eligible, false);
  assert.equal(evaluateCandidate(restricted).eligible, false);
});

test('selection returns one finalist per stream and two different streams', () => {
  const lowerAi = {
    ...sampleCandidates[0],
    id: 'ai-2',
    scores: { ...sampleCandidates[0].scores, publicRelevance: 7 },
  };
  const result = selectWeeklyTopics([...sampleCandidates, lowerAi]);
  assert.equal(result.ready, true);
  assert.equal(result.finalists.length, 5);
  assert.equal(result.selected.length, 2);
  assert.notEqual(result.selected[0].candidate.stream, result.selected[1].candidate.stream);
  assert.equal(result.finalists.filter((item) => item.candidate.stream === 'AI').length, 1);
});

test('selection reports a stream whose candidates fail the threshold', () => {
  const candidates = sampleCandidates.map((candidate) =>
    candidate.stream === 'Korea'
      ? { ...candidate, scores: Object.fromEntries(Object.keys(candidate.scores).map((key) => [key, 1])) }
      : candidate,
  );
  const result = selectWeeklyTopics(candidates);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingStreams, ['Korea']);
});

test('dossier requires 2 or 3 verified numbers tied to known sources', () => {
  const candidate = sampleCandidates[0];
  assert.doesNotThrow(() => validateDossier(candidate.dossier, candidate));
  assert.throws(
    () => validateDossier({ ...candidate.dossier, numbers: [] }, candidate),
    ContractError,
  );
});
