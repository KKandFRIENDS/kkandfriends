// Completeness gate for the daily briefs.
//
// 2026-10-26: the 07:00 global brief was published as a 188-character fragment
// ("... → 미국 대형주가 전") because the model's answer was cut at the token
// limit and nothing checked it. `callOpenRouter` only rejected an EMPTY answer,
// `raw.length < 120` passed, and the publish API only checks 1–100,000 chars.
// 51 members were notified and a Telegram teaser went out with the fragment.
//
// So: text that a model returns is not automatically a finished brief. Check
// the shape of the text (required sections, length, a real sentence at the end)
// before anything is published under KK's name. A missing brief is better than
// a broken one, which is the rule lib/briefs/claims.js already follows.
//
// The section names are the ones the system prompts fix ("출력 형식"). They are
// passed in by each brief so this module stays shared.

export const GLOBAL_SECTIONS = [
  '## 간밤에 있었던 일',
  '## 숫자 뒤에 있는 것',
  '## 오늘 한국 시장에서 볼 것',
  '💡',
];

export const KOREA_SECTIONS = [
  '## 오늘 있었던 일',
  '## 숫자 뒤에 있는 것',
  '## 내일 볼 것',
  '💡',
];

// The 💡 line is bold in the house format, so the text ends with "**" rather
// than a period. Strip the markdown markers, then require a Korean or Latin
// sentence ending. A cut-off answer ends in a bare syllable ("전") and fails.
const TAIL_MARKERS = /[*_~`"'”’)\]】\s]+$/;
const SENTENCE_END = /(?:[.!?…]|[다요자까죠음함]|니다|습니다)$/;

export function checkComplete(text, sections, { min = 500 } = {}) {
  const body = String(text ?? '').trim();
  if (!body) return 'empty body';

  const missing = sections.filter((section) => !body.includes(section));
  if (missing.length) return `missing sections: ${missing.join(', ')}`;

  if (body.length < min) return `body too short (${body.length} < ${min} chars)`;

  const lastLine = body.split('\n').filter((line) => line.trim()).pop() || '';
  const tail = lastLine.trim().replace(TAIL_MARKERS, '');
  if (!SENTENCE_END.test(tail)) return `last line does not end a sentence: "${tail.slice(-20)}"`;

  return null;
}
