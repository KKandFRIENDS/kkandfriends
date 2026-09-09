import { STREAMS } from './constants.js';
import { evaluateCandidate } from './scoring.js';

function compareEvaluations(a, b) {
  return (
    b.score - a.score ||
    b.candidate.scores.evidenceQuality - a.candidate.scores.evidenceQuality ||
    b.candidate.scores.publicRelevance - a.candidate.scores.publicRelevance ||
    a.candidate.id.localeCompare(b.candidate.id)
  );
}

export function selectWeeklyTopics(candidates, options = {}) {
  const evaluations = candidates.map((candidate) => evaluateCandidate(candidate, options));
  const finalists = [];

  for (const stream of STREAMS) {
    const eligible = evaluations
      .filter((evaluation) => evaluation.eligible && evaluation.candidate.stream === stream)
      .sort(compareEvaluations);
    if (eligible.length > 0) finalists.push(eligible[0]);
  }

  finalists.sort(compareEvaluations);
  const selected = finalists.slice(0, 2);

  return {
    evaluations: evaluations.sort(compareEvaluations),
    finalists,
    selected,
    ready: finalists.length === STREAMS.length && selected.length === 2,
    missingStreams: STREAMS.filter(
      (stream) => !finalists.some((evaluation) => evaluation.candidate.stream === stream),
    ),
  };
}
