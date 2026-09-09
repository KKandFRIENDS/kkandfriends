import { STREAMS } from './constants.js';
import { ContractError } from './errors.js';
import { validateCandidate } from './validation.js';

export function buildDiscoveryPrompt({ weekKey, signals, recentTitles = [] }) {
  if (!Array.isArray(signals) || signals.length === 0) {
    throw new ContractError('Discovery requires at least one signal', ['signals']);
  }

  const signalLines = signals.map((signal) =>
    JSON.stringify({
      id: signal.id,
      title: signal.title,
      summary: signal.summary,
      sourceType: signal.source.type,
      publishedAt: signal.publishedAt,
    }),
  );

  return [
    '# KKandFriends weekly topic discovery',
    `WEEK: ${weekKey}`,
    `STREAMS: ${STREAMS.join(', ')}`,
    '',
    'General readers are the audience. Find structural changes, second-order effects, and capital-allocation consequences.',
    'Return exactly 3 candidates per stream, 15 total.',
    'Use only signal IDs supplied below. Do not invent URLs, numbers, quotes, personal experiences, or sources.',
    'Scores are raw judgments from 0 to 10. Code will clamp and calculate the weighted total.',
    'conflictStatus must be clear, human_review, or restricted.',
    '',
    '## Recent titles — avoid the same central claim',
    ...recentTitles.map((title) => `- ${title}`),
    '',
    '## Signals',
    ...signalLines,
    '',
    '## JSON contract',
    JSON.stringify({
      candidates: [
        {
          id: 'stable-id',
          stream: 'Macro',
          title: 'Korean title',
          centralClaim: 'one sentence',
          scoreRationales: {
            publicRelevance: 'reason',
            significance: 'reason',
            evidenceQuality: 'reason',
            newInsight: 'reason',
            kkFit: 'reason',
            timeliness: 'reason',
          },
          scores: {
            publicRelevance: 0,
            significance: 0,
            evidenceQuality: 0,
            newInsight: 0,
            kkFit: 0,
            timeliness: 0,
          },
          sourceIds: ['signal-id'],
          duplicateOf: null,
          conflictStatus: 'clear',
        },
      ],
    }),
    '',
    'Return JSON only.',
  ].join('\n');
}

export function parseDiscoveryOutput(payload, signals) {
  if (!payload || !Array.isArray(payload.candidates)) {
    throw new ContractError('Discovery output must contain candidates', ['candidates']);
  }
  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  const seenIds = new Set();

  const candidates = payload.candidates.map((raw, index) => {
    if (seenIds.has(raw.id)) {
      throw new ContractError(`Duplicate candidate id: ${raw.id}`, [`candidates[${index}].id`]);
    }
    seenIds.add(raw.id);
    if (!Array.isArray(raw.sourceIds) || raw.sourceIds.length === 0) {
      throw new ContractError(`Candidate has no source IDs: ${raw.id}`, ['sourceIds']);
    }
    const sources = raw.sourceIds.map((sourceId) => {
      const signal = signalById.get(sourceId);
      if (!signal) {
        throw new ContractError(`Unknown signal ID: ${sourceId}`, [raw.id]);
      }
      return {
        id: sourceId,
        type: signal.source.type,
        title: signal.source.title,
        url: signal.source.url,
        publishedAt: signal.publishedAt,
      };
    });
    return validateCandidate({
      id: raw.id,
      stream: raw.stream,
      title: raw.title,
      centralClaim: raw.centralClaim,
      scoreRationales: raw.scoreRationales,
      scores: raw.scores,
      sources,
      duplicateOf: raw.duplicateOf ?? null,
      conflictStatus: raw.conflictStatus,
    });
  });

  const counts = Object.fromEntries(
    STREAMS.map((stream) => [stream, candidates.filter((candidate) => candidate.stream === stream).length]),
  );
  const wrongCounts = Object.entries(counts).filter(([, count]) => count !== 3);
  if (candidates.length !== 15 || wrongCounts.length > 0) {
    throw new ContractError('Discovery must return exactly 3 candidates per stream', [
      `total=${candidates.length}`,
      ...wrongCounts.map(([stream, count]) => `${stream}=${count}`),
    ]);
  }
  return candidates;
}
