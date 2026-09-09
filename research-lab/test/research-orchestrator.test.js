import test from 'node:test';
import assert from 'node:assert/strict';
import { STREAMS } from '../src/constants.js';
import { ContractError } from '../src/errors.js';
import { generateWeeklyEditorialPackage } from '../src/orchestrator.js';
import { buildDossierPrompt, parseDossierOutput } from '../src/research.js';
import {
  sampleDrafts,
  sampleExperienceRegistry,
} from '../fixtures/sample-week.js';

const signals = STREAMS.map((stream, index) => ({
  id: `signal-${index}`,
  title: `${stream} official signal`,
  summary: 'Synthetic summary',
  excerpt: 'Synthetic excerpt with two supported measurements.',
  publishedAt: '2099-01-01',
  source: {
    type: 'primary',
    title: `${stream} official source`,
    url: `https://example.test/signal-${index}`,
  },
}));

function rawCandidate(stream, streamIndex, itemIndex) {
  const score = 9.5 - streamIndex * 0.4 - itemIndex * 0.1;
  return {
    id: `${stream.toLowerCase().replaceAll(' ', '-')}-${itemIndex}`,
    stream,
    title: `${stream} synthetic candidate ${itemIndex}`,
    centralClaim: `${stream} synthetic structural claim`,
    scoreRationales: {},
    scores: {
      publicRelevance: score,
      significance: score,
      evidenceQuality: score,
      newInsight: score,
      kkFit: score,
      timeliness: score,
    },
    sourceIds: [`signal-${streamIndex}`],
    duplicateOf: null,
    conflictStatus: 'clear',
  };
}

const discoveryPayload = {
  candidates: STREAMS.flatMap((stream, streamIndex) =>
    [0, 1, 2].map((itemIndex) => rawCandidate(stream, streamIndex, itemIndex)),
  ),
};

function dossierPayload(candidateId, sourceId, experienceIds = []) {
  return {
    whyNow: 'Synthetic why now',
    facts: [
      { claim: 'Verified synthetic fact one', sourceId, status: 'verified' },
      { claim: 'Verified synthetic fact two', sourceId, status: 'verified' },
    ],
    numbers: [
      { id: `${candidateId}-n1`, display: '42%', context: 'Synthetic number one', sourceId },
      { id: `${candidateId}-n2`, display: '18개월', context: 'Synthetic number two', sourceId },
    ],
    counterargument: 'Synthetic counterargument',
    falsifier: 'Synthetic falsifier',
    experienceIds,
  };
}

function adaptDraft(sampleDraft, candidateId, sourceId, experienceClaims = []) {
  return {
    ...sampleDraft,
    title: `${candidateId} title`,
    metaphor: `${candidateId} metaphor`,
    experienceClaims,
    verifiedNumberIds: [`${candidateId}-n1`, `${candidateId}-n2`],
    citedSourceIds: [sourceId],
  };
}

test('research prompt exposes only supplied material and approved experience IDs', () => {
  const candidate = {
    ...rawCandidate('AI', 1, 0),
    sources: [{ id: 'signal-1', type: 'primary', title: 'AI source', url: 'https://example.test/signal-1' }],
  };
  const prompt = buildDossierPrompt({ candidate, signals, experienceRegistry: sampleExperienceRegistry });
  assert.match(prompt, /Use only the supplied signals/);
  assert.match(prompt, /career-jpm-hong-kong-start/);
  assert.doesNotMatch(prompt, /unapproved-example, /);
});

test('research parser rejects an unapproved experience choice', () => {
  const candidate = {
    ...rawCandidate('AI', 1, 0),
    sources: [{ id: 'signal-1', type: 'primary', title: 'AI source', url: 'https://example.test/signal-1' }],
  };
  const payload = dossierPayload(candidate.id, 'signal-1', ['unapproved-example']);
  assert.throws(
    () => parseDossierOutput(payload, candidate, sampleExperienceRegistry),
    ContractError,
  );
});

test('orchestrator runs discovery, research, writer, and deterministic QA', async () => {
  const calls = [];
  const invoke = async ({ stage, candidateId }) => {
    calls.push(`${stage}:${candidateId ?? '-'}`);
    if (stage === 'discovery') return JSON.stringify(discoveryPayload);

    const selectedIndex = candidateId.startsWith('macro') ? 0 : 1;
    const sourceId = `signal-${selectedIndex}`;
    if (stage === 'research') {
      const experienceIds = candidateId.startsWith('macro') ? [] : ['career-jpm-hong-kong-start'];
      return JSON.stringify(dossierPayload(candidateId, sourceId, experienceIds));
    }

    const baseDraft = candidateId.startsWith('macro') ? sampleDrafts['macro-1'] : sampleDrafts['ai-1'];
    const claims = candidateId.startsWith('macro')
      ? []
      : ['1996년 JP Morgan Summer Associate Internship Program에 참석해 인턴으로 JP Morgan 경력을 시작했다.'];
    return JSON.stringify(adaptDraft(baseDraft, candidateId, sourceId, claims));
  };

  const result = await generateWeeklyEditorialPackage({
    weekKey: '2099-W02',
    signals,
    recentTitles: [],
    experienceRegistry: sampleExperienceRegistry,
    usedMetaphors: [],
    prompts: { master: 'MASTER', universal: 'UNIVERSAL', writingOs: 'OS' },
    modelChains: {
      discovery: ['discover-model'],
      research: ['research-model'],
      writer: ['writer-model'],
    },
    invoke,
  });

  assert.equal(result.ready, true, result.blockers.join(', '));
  assert.equal(result.items.length, 2);
  assert.deepEqual(calls, [
    'discovery:-',
    'research:macro-0',
    'writer:macro-0',
    'research:ai-0',
    'writer:ai-0',
  ]);
  assert.equal(result.modelAudit.discovery.model, 'discover-model');
});
