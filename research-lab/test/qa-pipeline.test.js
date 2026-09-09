import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDraft } from '../src/qa.js';
import { runWeeklyPipeline } from '../src/pipeline.js';
import {
  sampleCandidates,
  sampleDrafts,
  sampleExperienceRegistry,
  sampleWeekInput,
} from '../fixtures/sample-week.js';

test('valid synthetic KK draft passes deterministic QA', () => {
  const candidate = sampleCandidates[0];
  const result = verifyDraft({
    draft: sampleDrafts[candidate.id],
    dossier: candidate.dossier,
    experienceRegistry: sampleExperienceRegistry,
    requestedExperienceIds: candidate.dossier.experienceIds,
    usedMetaphors: ['장부와 지우개'],
  });
  assert.equal(result.passed, true, result.errors.join(', '));
  assert.ok(result.metrics.contentCharacters >= 2000);
});

test('QA rejects reused metaphors, banned labels, and missing disclaimer', () => {
  const candidate = sampleCandidates[0];
  const draft = {
    ...sampleDrafts[candidate.id],
    markdown: sampleDrafts[candidate.id].markdown
      .replace('By KK · Chief of KKandFriends', 'Skin in the game\n\nBy KK · Chief of KKandFriends')
      .replace(/본 자료는 정보 제공 목적이며[^\n]+/, ''),
  };
  const result = verifyDraft({
    draft,
    dossier: candidate.dossier,
    experienceRegistry: sampleExperienceRegistry,
    requestedExperienceIds: candidate.dossier.experienceIds,
    usedMetaphors: [draft.metaphor],
  });
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('metaphor_reused'));
  assert.ok(result.errors.some((error) => error.startsWith('banned_phrase:')));
  assert.ok(result.errors.includes('investment_disclaimer_missing'));
});

test('QA rejects an invented first-person experience', () => {
  const candidate = sampleCandidates[0];
  const draft = {
    ...sampleDrafts[candidate.id],
    experienceClaims: ['나는 2008년 위기에서 큰 수익을 냈다.'],
  };
  const result = verifyDraft({
    draft,
    dossier: candidate.dossier,
    experienceRegistry: sampleExperienceRegistry,
    requestedExperienceIds: candidate.dossier.experienceIds,
    usedMetaphors: [],
  });
  assert.equal(result.passed, false);
  assert.ok(result.errors.some((error) => error.startsWith('unapproved_experience_claim:')));
});

test('QA rejects metadata claims that are absent from the article body', () => {
  const candidate = sampleCandidates[0];
  const draft = {
    ...sampleDrafts[candidate.id],
    markdown: sampleDrafts[candidate.id].markdown
      .replace('42%', '마흔두 퍼센트')
      .replace(draftClaim(candidate.id), '경험 문장을 삭제한 자리'),
  };
  const result = verifyDraft({
    draft,
    dossier: candidate.dossier,
    experienceRegistry: sampleExperienceRegistry,
    requestedExperienceIds: candidate.dossier.experienceIds,
    usedMetaphors: [],
  });
  assert.ok(result.errors.includes('verified_number_not_in_draft:ai-1-source-n1'));
  assert.ok(result.errors.some((error) => error.startsWith('experience_claim_not_used_once:')));
});

function draftClaim(candidateId) {
  return sampleDrafts[candidateId].experienceClaims[0];
}

test('QA rejects repeated long sentences', () => {
  const candidate = sampleCandidates[0];
  const sentence = '같은 긴 문장을 세 번 반복하면 원고의 분량만 늘고 판단은 늘어나지 않는다.';
  const draft = {
    ...sampleDrafts[candidate.id],
    markdown: `${sampleDrafts[candidate.id].markdown}\n\n${sentence} ${sentence} ${sentence}`,
  };
  const result = verifyDraft({
    draft,
    dossier: candidate.dossier,
    experienceRegistry: sampleExperienceRegistry,
    requestedExperienceIds: candidate.dossier.experienceIds,
    usedMetaphors: [],
  });
  assert.ok(result.errors.includes('repeated_sentence'));
});

test('pipeline creates two reviewed weekend slots and a markdown package', () => {
  const result = runWeeklyPipeline(sampleWeekInput);
  assert.equal(result.ready, true, result.blockers.join(', '));
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].slot, 'Saturday');
  assert.equal(result.items[1].slot, 'Sunday');
  assert.match(result.markdown, /READY FOR KK REVIEW/);
  assert.match(result.markdown, /다섯 스트림 후보/);
});

test('pipeline blocks the package when one selected draft fails QA', () => {
  const brokenDrafts = {
    ...sampleDrafts,
    'macro-1': {
      ...sampleDrafts['macro-1'],
      markdown: sampleDrafts['macro-1'].markdown.replace('Bottom line:', 'Summary:'),
    },
  };
  const result = runWeeklyPipeline({ ...sampleWeekInput, draftsByCandidateId: brokenDrafts });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes('bottom_line_count')));
});
