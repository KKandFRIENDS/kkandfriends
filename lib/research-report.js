// Rendering for the research lab: the Obsidian-ready report and the Telegram
// summary. Pure functions — nothing here calls a model or sends anything.
//
// Two audiences, two formats, and the difference matters:
//   • the .md report keeps tables, because Obsidian renders them,
//   • the Telegram summary must not contain a single one, because Telegram
//     shows the pipes verbatim and the scoring table becomes a wall of junk.

const METRIC_LABELS = {
  timeliness: '시의성',
  recency: '최신성',
  finance_relevance: '경제·금융 관련성',
  differentiation: '차별성',
  evidence: '근거 가용성',
  reader_value: '독자 가치',
  risk: '리스크(역가점)',
};

const ORDER = ['timeliness', 'recency', 'finance_relevance', 'differentiation', 'evidence', 'reader_value', 'risk'];

const DISCLAIMER = '본 자료는 정보 제공 목적이며 특정 자산의 매수·매도 권유가 아닙니다.';

/** `2026-08-11_리서치주제선정.md` — no spaces, no characters that upset a vault. */
export function reportFilename(runDate, winnerSlug) {
  const slug = (winnerSlug || '').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${runDate}_리서치주제선정${slug ? `_${slug}` : ''}.md`;
}

/**
 * The full report. Written whether or not KK approves it — this file is the
 * archive, so it has to stand on its own with no chat context around it.
 */
export function buildReport({ kst, scan, ranked, guide, cfg, model, fellBack, held }) {
  const winner = ranked[0];
  const lines = [];

  lines.push('---');
  lines.push(`title: ${held ? '발행 보류 — 임계값 미달' : yaml(winner?.title)}`);
  lines.push(`date: ${kst.date}`);
  lines.push('tags:');
  lines.push('  - 리서치랩');
  lines.push('  - 주제선정');
  if (held) lines.push('  - 발행보류');
  lines.push('source: kkandfriends 리서치랩 (자동 생성)');
  lines.push(`model: ${model}${fellBack ? ' (폴백)' : ''}`);
  lines.push('---');
  lines.push('');
  lines.push(`# 리서치랩 주제 선정 — ${kst.date} (${kst.weekday})`);
  lines.push('');

  if (held) {
    lines.push(`> [!warning] 발행 보류`);
    lines.push(`> 후보 3개 모두 품질 임계값(${cfg.threshold.toFixed(1)})에 못 미쳤다. 집필 가이드는 생성하지 않았다.`);
  } else {
    lines.push('> [!summary] 선정 주제');
    lines.push(`> **${winner.title}** — 가중합 ${winner.total.toFixed(2)}`);
    lines.push(`> ${winner.thesis || ''}`);
  }
  lines.push('');

  lines.push('## 1. 트렌드 스캔');
  lines.push('');
  lines.push(scan?.trim() || '(스캔 결과 없음)');
  lines.push('');

  lines.push('## 2. 후보 주제');
  lines.push('');
  for (const c of ranked) {
    lines.push(`### ${c.rank}위 · ${c.title}  \`${c.total.toFixed(2)}\``);
    lines.push('');
    lines.push(`- **논지:** ${c.thesis || '—'}`);
    if (c.triggers?.length) {
      lines.push('- **트리거 뉴스:**');
      for (const t of c.triggers) {
        lines.push(`    - ${[t.outlet, t.date].filter(Boolean).join(' · ')} — ${t.headline || ''}`);
      }
    }
    if (c.industry_angle) lines.push(`- **산업적 각도:** ${c.industry_angle}`);
    if (c.series_position) lines.push(`- *(참고, 점수 미반영)* 시리즈 내 위치: ${c.series_position}`);
    lines.push(`- **이해상충 필터:** ${c.conflict_check || '통과'}`);
    if (c.adjustments?.length) {
      lines.push(`- **코드 보정:** ${c.adjustments.join(' / ')}`);
    }
    lines.push('');
  }

  lines.push('## 3. 채점표');
  lines.push('');
  lines.push(scoreTable(ranked, cfg));
  lines.push('');
  lines.push(
    `가중치: ${ORDER.map((m) => `${METRIC_LABELS[m]} ${Math.round(cfg.weights[m] * 100)}%`).join(' · ')}`
  );
  lines.push('');
  lines.push('각 후보의 채점 근거:');
  lines.push('');
  for (const c of ranked) {
    lines.push(`**${c.title}**`);
    for (const m of ORDER) {
      const why = c.rationale?.[m];
      if (why) lines.push(`- ${METRIC_LABELS[m]} ${c.scores[m]} — ${why}`);
    }
    lines.push('');
  }

  if (held) {
    lines.push('## 4. 재스캔 권고');
    lines.push('');
    lines.push(guide?.trim() || '(권고 없음)');
  } else {
    lines.push('## 4. 집필 가이드라인');
    lines.push('');
    lines.push(guide?.trim() || '(가이드 없음)');
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(`> [!warning] ${DISCLAIMER}`);
  lines.push('');
  lines.push(
    `*생성: ${model}${fellBack ? ' (폴백 발생)' : ''} · 임계값 ${cfg.threshold.toFixed(1)} · 설정 v${cfg.version}*`
  );

  return lines.join('\n');
}

function scoreTable(ranked, cfg) {
  const head = ['후보', ...ORDER.map((m) => `${METRIC_LABELS[m]}<br>${Math.round(cfg.weights[m] * 100)}%`), '가중합', '순위'];
  const rows = ranked.map((c) => [
    c.title,
    ...ORDER.map((m) => String(c.scores[m])),
    `**${c.total.toFixed(2)}**`,
    String(c.rank),
  ]);
  return [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/**
 * Fallback Telegram summary, built from the structured data.
 *
 * The prompt asks the model to emit this block between markers, and normally it
 * does. This exists for when it doesn't — a missing marker should cost KK a
 * slightly plainer message, not the whole notification. Built to the same
 * seven-part shape the prompt specifies.
 */
export function buildTelegramSummary({ kst, ranked, cfg, maxChars = 2800 }) {
  const winner = ranked[0];
  const parts = [
    `[KK & Friends 리서치랩 · ${kst.date} (${kst.weekday})]`,
    '',
    `선정: ${winner.title}`,
    winner.thesis ? `→ ${winner.thesis}` : '',
    '',
    `가중합 ${winner.total.toFixed(2)} (임계값 ${cfg.threshold.toFixed(1)})`,
    winner.rationale?.differentiation ? `1순위 이유: ${winner.rationale.differentiation}` : '',
    '',
  ];

  if (winner.triggers?.length) {
    parts.push('트리거 뉴스');
    for (const t of winner.triggers.slice(0, 2)) {
      parts.push(`· ${[t.outlet, t.date].filter(Boolean).join(' ')} — ${t.headline || ''}`);
    }
    parts.push('');
  }

  if (winner.required_evidence?.length) {
    parts.push('확보할 근거');
    for (const e of winner.required_evidence.slice(0, 3)) parts.push(`· ${e}`);
    parts.push('');
  }

  const others = ranked.slice(1);
  if (others.length) {
    parts.push('나머지 후보');
    for (const c of others) parts.push(`· ${c.title} — ${c.total.toFixed(2)}`);
    parts.push('');
  }

  parts.push(DISCLAIMER);

  return clip(parts.filter((l) => l !== undefined).join('\n'), maxChars);
}

/** The below-threshold message. No approval needed — nothing is being published. */
export function buildHoldSummary({ kst, ranked, cfg, reason }) {
  const parts = [
    `[KK & Friends 리서치랩 · ${kst.date} (${kst.weekday})]`,
    '',
    `오늘 후보 3개 모두 품질 기준(${cfg.threshold.toFixed(1)}) 미달 — 발행 보류.`,
    '',
  ];
  for (const c of ranked) parts.push(`· ${c.title} — ${c.total.toFixed(2)}`);
  parts.push('');
  parts.push(reason ? `재스캔 권고: ${clip(reason, 400)}` : '재스캔 권고: 기간을 넓히거나 지역·영역을 조정해 다시 스캔할 것.');
  return parts.join('\n');
}

function clip(text, max) {
  const t = String(text ?? '').replace(/\n{3,}/g, '\n\n').trim();
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
}

function yaml(v) {
  const s = String(v ?? '').replace(/"/g, "'");
  return /[:#\-{}[\]]/.test(s) ? `"${s}"` : s;
}

export { METRIC_LABELS, DISCLAIMER };
