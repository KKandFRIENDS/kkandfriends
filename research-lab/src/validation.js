import { SCORE_WEIGHTS, STREAMS } from './constants.js';
import { ContractError } from './errors.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, path, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path} must be a non-empty string`);
  }
}

export function validateCandidate(candidate) {
  const errors = [];
  if (!isPlainObject(candidate)) {
    throw new ContractError('Candidate must be an object', ['candidate']);
  }

  requireString(candidate.id, 'id', errors);
  requireString(candidate.title, 'title', errors);
  requireString(candidate.centralClaim, 'centralClaim', errors);

  if (!STREAMS.includes(candidate.stream)) {
    errors.push(`stream must be one of: ${STREAMS.join(', ')}`);
  }

  if (!isPlainObject(candidate.scores)) {
    errors.push('scores must be an object');
  } else {
    for (const key of Object.keys(SCORE_WEIGHTS)) {
      if (typeof candidate.scores[key] !== 'number' || !Number.isFinite(candidate.scores[key])) {
        errors.push(`scores.${key} must be a finite number`);
      }
    }
  }

  if (!Array.isArray(candidate.sources) || candidate.sources.length === 0) {
    errors.push('sources must contain at least one source');
  } else {
    candidate.sources.forEach((source, index) => {
      requireString(source.id, `sources[${index}].id`, errors);
      requireString(source.url, `sources[${index}].url`, errors);
      if (!['primary', 'secondary'].includes(source.type)) {
        errors.push(`sources[${index}].type must be primary or secondary`);
      }
    });
  }

  if (candidate.duplicateOf != null && typeof candidate.duplicateOf !== 'string') {
    errors.push('duplicateOf must be null or a string');
  }

  if (!['clear', 'human_review', 'restricted'].includes(candidate.conflictStatus)) {
    errors.push('conflictStatus must be clear, human_review, or restricted');
  }

  if (errors.length > 0) {
    throw new ContractError(`Invalid candidate: ${candidate.id ?? 'unknown'}`, errors);
  }
  return candidate;
}

export function validateDossier(dossier, candidate) {
  const errors = [];
  if (!isPlainObject(dossier)) {
    throw new ContractError(`Dossier missing for ${candidate.id}`, ['dossier']);
  }

  requireString(dossier.whyNow, 'dossier.whyNow', errors);
  requireString(dossier.counterargument, 'dossier.counterargument', errors);
  requireString(dossier.falsifier, 'dossier.falsifier', errors);

  if (!Array.isArray(dossier.facts) || dossier.facts.length === 0) {
    errors.push('dossier.facts must contain at least one fact');
  }

  if (!Array.isArray(dossier.numbers) || dossier.numbers.length < 2 || dossier.numbers.length > 3) {
    errors.push('dossier.numbers must contain 2 or 3 verified numbers');
  }

  const sourceIds = new Set(candidate.sources.map((source) => source.id));
  for (const [index, fact] of (dossier.facts ?? []).entries()) {
    requireString(fact.claim, `dossier.facts[${index}].claim`, errors);
    if (fact.status !== 'verified') {
      errors.push(`dossier.facts[${index}].status must be verified`);
    }
    if (!sourceIds.has(fact.sourceId)) {
      errors.push(`dossier.facts[${index}].sourceId is not in candidate.sources`);
    }
  }

  for (const [index, number] of (dossier.numbers ?? []).entries()) {
    requireString(number.display, `dossier.numbers[${index}].display`, errors);
    requireString(number.context, `dossier.numbers[${index}].context`, errors);
    if (!sourceIds.has(number.sourceId)) {
      errors.push(`dossier.numbers[${index}].sourceId is not in candidate.sources`);
    }
  }

  if (errors.length > 0) {
    throw new ContractError(`Invalid dossier: ${candidate.id}`, errors);
  }
  return dossier;
}
