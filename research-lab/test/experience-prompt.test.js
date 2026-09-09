import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/errors.js';
import { getApprovedExperiences, renderExperienceContext } from '../src/experiences.js';
import { composeWriterPrompt } from '../src/prompt.js';
import {
  sampleCandidates,
  sampleExperienceRegistry,
} from '../fixtures/sample-week.js';

test('experience registry is deny-by-default', () => {
  assert.throws(
    () => getApprovedExperiences(sampleExperienceRegistry, ['unapproved-example']),
    ContractError,
  );
});

test('approved experience exposes only allowed claims and forbidden inference', () => {
  const experiences = getApprovedExperiences(sampleExperienceRegistry, [
    'career-jpm-hong-kong-start',
  ]);
  const context = renderExperienceContext(experiences);
  assert.match(context, /1996년 JP Morgan Summer Associate/);
  assert.match(context, /담당 상품/);
  assert.doesNotMatch(context, /unapproved-example/);
});

test('writer prompt preserves priority and verified brief', () => {
  const candidate = sampleCandidates[0];
  const prompt = composeWriterPrompt({
    masterPrompt: 'MASTER RULE',
    universalPrompt: 'UNIVERSAL RULE',
    writingOsPrompt: 'QA RULE',
    candidate,
    dossier: candidate.dossier,
    experienceRegistry: sampleExperienceRegistry,
    experienceIds: ['career-jpm-hong-kong-start'],
  });
  assert.ok(prompt.indexOf('PRIORITY 1') < prompt.indexOf('PRIORITY 2'));
  assert.match(prompt, /MASTER RULE/);
  assert.match(prompt, /42%/);
  assert.match(prompt, /Return JSON only/);
});
