export function candidateQueue({ ranked, sources, maxCandidates = 3 }) {
  const limit = Number.isInteger(maxCandidates) && maxCandidates > 0 ? maxCandidates : 3;
  const eligible = ranked.top5.filter(candidate => {
    if (candidate.reasons?.length) return false;
    if (ranked.desk.id !== 'signals') return true;
    return candidate.sourceIds.some(id => sources.find(source => source.id === id)?.signalKind === 'news-momentum');
  });
  return [...eligible].sort((left, right) => {
    if (left.id === ranked.selected.id) return -1;
    if (right.id === ranked.selected.id) return 1;
    return 0;
  }).slice(0, limit);
}

export function candidateFailure(error) {
  if (Array.isArray(error?.issues)) return true;
  return /^(?:Editorial hold|Evidence|Insufficient exact source passages|Unknown evidence passage|Primary evidence|Body length|Title and summary|Section structure|Every section|Unknown related article|Use source IDs|Unapproved personal experience)/.test(String(error?.message || ''));
}

export function boundedFailure(candidate, error) {
  return {
    candidateId: String(candidate?.id || '').slice(0, 80),
    reason: String(error?.message || error?.name || 'candidate failed')
      .replace(/https?:\/\/\S+/g, '[URL]').replace(/[\r\n\t]+/g, ' ').slice(0, 300),
  };
}
