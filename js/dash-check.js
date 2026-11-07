// Pre-publish dash check (2026-11-07, KK approved the Site Steward proposal).
// House rule: no em dash (—) or spaced en dash ( – ) in KK's published writing.
// The editors only warn before publishing; KK decides. A quoted source title may keep its dash.

const DASH = /—| – /g;

function snippets(text, max) {
  const out = [];
  for (const m of text.matchAll(DASH)) {
    if (out.length >= max) break;
    const start = Math.max(0, m.index - 18);
    const end = Math.min(text.length, m.index + m[0].length + 18);
    out.push(`${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`);
  }
  return out;
}

// fields: { 제목: '...', 요약: '...', 본문: '...' } → null, or { total, parts, examples }
export function findDashes(fields) {
  const parts = [];
  const examples = [];
  let total = 0;
  for (const [label, value] of Object.entries(fields)) {
    const text = String(value || '');
    const count = (text.match(DASH) || []).length;
    if (!count) continue;
    total += count;
    parts.push(`${label} ${count}곳`);
    examples.push(...snippets(text, 3 - examples.length).map((s) => `· ${label}: ${s}`));
  }
  return total ? { total, parts, examples } : null;
}

export function dashConfirmText(found) {
  return [
    `줄표(—)가 ${found.total}곳 있습니다 (${found.parts.join(', ')}).`,
    ...found.examples,
    '',
    '사이트 규칙은 쉼표·마침표·괄호로 바꾸는 것입니다. 인용한 출처 제목이면 그대로 두셔도 됩니다.',
    '',
    '[확인] 그대로 발행  ·  [취소] 돌아가서 고치기',
  ].join('\n');
}

// true = go ahead. Uses the browser's confirm unless one is passed in (tests).
export function confirmDashes(fields, ask = (msg) => globalThis.confirm(msg)) {
  const found = findDashes(fields);
  return found ? ask(dashConfirmText(found)) : true;
}
