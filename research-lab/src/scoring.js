import { DEFAULT_MIN_SCORE, SCORE_WEIGHTS } from './constants.js';
import { validateCandidate } from './validation.js';

export function clampScore(value) {
  return Math.min(10, Math.max(0, value));
}

export function calculateCandidateScore(candidate) {
  validateCandidate(candidate);
  const weightedTotal = Object.entries(SCORE_WEIGHTS).reduce((total, [key, weight]) => {
    return total + (clampScore(candidate.scores[key]) / 10) * weight;
  }, 0);
  return Math.round(weightedTotal * 10) / 10;
}

export function evaluateCandidate(candidate, { minScore = DEFAULT_MIN_SCORE } = {}) {
  const score = calculateCandidateScore(candidate);
  const reasons = [];
  const hasPrimarySource = candidate.sources.some((source) => source.type === 'primary');

  if (!hasPrimarySource) reasons.push('missing_primary_source');
  if (candidate.duplicateOf) reasons.push('recent_duplicate');
  if (candidate.conflictStatus === 'restricted') reasons.push('restricted_conflict');
  if (candidate.conflictStatus === 'human_review') reasons.push('conflict_requires_human_review');
  if (score < minScore) reasons.push('below_threshold');

  return {
    candidate,
    score,
    eligible: reasons.length === 0,
    reasons,
  };
}
