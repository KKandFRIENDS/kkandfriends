import { selectWeeklyTopics } from './selection.js';
import { validateDossier } from './validation.js';
import { verifyDraft } from './qa.js';
import { renderEditorialPackage } from './renderer.js';

export function runWeeklyPipeline({
  weekKey,
  candidates,
  draftsByCandidateId,
  experienceRegistry,
  usedMetaphors = [],
  lengthRange,
  minScore,
}) {
  const selection = selectWeeklyTopics(candidates, { minScore });
  const blockers = [];
  const items = [];

  if (!selection.ready) {
    blockers.push(`eligible_streams_missing:${selection.missingStreams.join(',')}`);
  }

  selection.selected.forEach((evaluation, index) => {
    const candidate = evaluation.candidate;
    const dossier = validateDossier(candidate.dossier, candidate);
    const draft = draftsByCandidateId[candidate.id];
    const requestedExperienceIds = candidate.dossier.experienceIds ?? [];
    const qa = verifyDraft({
      draft,
      dossier,
      experienceRegistry,
      requestedExperienceIds,
      usedMetaphors,
      lengthRange,
    });
    if (!qa.passed) blockers.push(`${candidate.id}:${qa.errors.join(',')}`);
    items.push({
      slot: index === 0 ? 'Saturday' : 'Sunday',
      candidate,
      score: evaluation.score,
      dossier,
      draft,
      qa,
    });
  });

  const result = {
    weekKey,
    selection,
    items,
    blockers,
    ready: selection.ready && items.length === 2 && blockers.length === 0,
  };
  return { ...result, markdown: renderEditorialPackage(result) };
}
