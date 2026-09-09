function escapeTable(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function renderReasons(reasons) {
  return reasons.length === 0 ? '—' : reasons.join(', ');
}

export function renderEditorialPackage(result) {
  const lines = [
    `# Weekly Editorial Package — ${result.weekKey}`,
    '',
    `**상태:** ${result.ready ? 'READY FOR KK REVIEW' : 'BLOCKED'}`,
    '',
    '## 다섯 스트림 후보',
    '',
    '| 순위 | 스트림 | 주제 | 점수 | 판정 |',
    '|---:|---|---|---:|---|',
  ];

  result.selection.finalists.forEach((evaluation, index) => {
    lines.push(
      `| ${index + 1} | ${escapeTable(evaluation.candidate.stream)} | ${escapeTable(evaluation.candidate.title)} | ${evaluation.score.toFixed(1)} | ${renderReasons(evaluation.reasons)} |`,
    );
  });

  if (result.selection.missingStreams.length > 0) {
    lines.push('', `**누락 스트림:** ${result.selection.missingStreams.join(', ')}`);
  }

  lines.push('', '## 주말 선정 2편', '');
  for (const item of result.items) {
    lines.push(
      `### ${item.slot}. ${item.candidate.title}`,
      '',
      `- 스트림: ${item.candidate.stream}`,
      `- 점수: ${item.score.toFixed(1)}`,
      `- 중심 주장: ${item.candidate.centralClaim}`,
      `- 왜 지금: ${item.dossier.whyNow}`,
      `- 가장 강한 반론: ${item.dossier.counterargument}`,
      `- 논지가 깨지는 조건: ${item.dossier.falsifier}`,
      `- QA: ${item.qa.passed ? 'PASS' : `FAIL — ${item.qa.errors.join(', ')}`}`,
      '',
      '#### 검증 수치',
      '',
      ...item.dossier.numbers.map(
        (number) => `- ${number.display} — ${number.context} [${number.sourceId}]`,
      ),
      '',
      '#### 원고',
      '',
      item.draft.markdown,
      '',
    );
  }

  if (result.blockers.length > 0) {
    lines.push('## Blockers', '', ...result.blockers.map((blocker) => `- ${blocker}`), '');
  }

  return lines.join('\n');
}
