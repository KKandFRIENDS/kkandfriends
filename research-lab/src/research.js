import { ContractError } from './errors.js';
import { getApprovedExperiences } from './experiences.js';
import { validateDossier } from './validation.js';

export function buildDossierPrompt({ candidate, signals, experienceRegistry }) {
  const sourceIds = new Set(candidate.sources.map((source) => source.id));
  const relevantSignals = signals.filter((signal) => sourceIds.has(signal.id));
  if (relevantSignals.length === 0) {
    throw new ContractError(`No research signals for ${candidate.id}`, [candidate.id]);
  }

  const approvedExperienceIds = experienceRegistry.experiences
    .filter((experience) => experience.status === 'approved')
    .map((experience) => experience.id);

  return [
    '# KKandFriends research dossier',
    `CANDIDATE ID: ${candidate.id}`,
    `STREAM: ${candidate.stream}`,
    `TITLE: ${candidate.title}`,
    `CENTRAL CLAIM: ${candidate.centralClaim}`,
    '',
    'Use only the supplied signals. Do not fill gaps from memory.',
    'Every fact and number must point to a supplied sourceId.',
    'Include exactly 2 or 3 numbers. A number without direct support must be omitted.',
    'Include the strongest counterargument and one observable falsifier.',
    `Allowed experience IDs: ${approvedExperienceIds.join(', ') || 'none'}`,
    'Experience is optional. Do not choose one merely to decorate the article.',
    '',
    '## Source material',
    ...relevantSignals.map((signal) => JSON.stringify({
      sourceId: signal.id,
      title: signal.title,
      summary: signal.summary,
      excerpt: signal.excerpt ?? null,
      publishedAt: signal.publishedAt,
      sourceType: signal.source.type,
    })),
    '',
    '## JSON contract',
    JSON.stringify({
      whyNow: 'one paragraph',
      facts: [{ claim: 'verified claim', sourceId: 'signal-id', status: 'verified' }],
      numbers: [
        { id: 'stable-number-id', display: '42%', context: 'what it measures and date', sourceId: 'signal-id' },
      ],
      counterargument: 'strongest fair counterargument',
      falsifier: 'observable condition that would break the thesis',
      experienceIds: [],
    }),
    '',
    'Return JSON only.',
  ].join('\n');
}

export function parseDossierOutput(payload, candidate, experienceRegistry) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ContractError(`Research output must be an object: ${candidate.id}`, ['dossier']);
  }
  const dossier = {
    whyNow: payload.whyNow,
    facts: payload.facts,
    numbers: payload.numbers,
    counterargument: payload.counterargument,
    falsifier: payload.falsifier,
    experienceIds: payload.experienceIds ?? [],
  };
  validateDossier(dossier, candidate);
  getApprovedExperiences(experienceRegistry, dossier.experienceIds);
  return dossier;
}
