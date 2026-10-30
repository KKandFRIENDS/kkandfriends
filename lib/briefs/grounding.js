// Grounding guard for the public briefs. Runs after the claim guard and before
// anything is published.
//
// 2026-10-30 `--dry` previews of the longer prompt: the model invented decision
// thresholds ("70bp", "1,340"), read the won/dollar rate as foreign fund flows
// (the inputs carry no flow data), and closed paragraphs with "~쪽에 가깝다",
// "~는 뜻이다". The prompt forbids all of it, and a cheap model still does it
// once in a while, so the text is checked in code.
//
// Two checks, one rewrite pass on the same writing route:
//   1. Numbers the inputs do not contain. A number is "provided" if it appears
//      in the system prompt or the data block (quotes, macro, official, 52-week
//      line, headlines), or is a plain rounding of one ("4%" for 4.37%, "141만"
//      for 1,412,000, "5,600선" for 5,672). Anything else is invented: it fails
//      the run if the rewrite does not remove it. A wrong number under KK's
//      name is worse than no brief.
//   2. Interpretation patterns ("~쪽에 가깝다", "~한 셈이다", FX read as foreign
//      flows). These are style, not facts: one rewrite attempt, and if some
//      remain the brief is still published and KK is told which phrases.
import { checkFix } from './claims.js';

const toNumber = (token) => Number(String(token).replace(/,/g, ''));

// Numeric tokens with their following text, for the suffix test.
function tokens(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/(?<![\d.])\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/,+$/, '');
    const value = toNumber(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ raw, value, after: String(text).slice(m.index + m[0].length, m.index + m[0].length + 12), before: String(text).slice(Math.max(0, m.index - 1), m.index) });
  }
  return out;
}

// Every plain re-expression of a provided number that a reader would accept as
// the same number: itself, rounded or truncated, in 만/억/조 units, and the
// round hundred/thousand it sits in ("5,600선", "6,000선").
function expand(value) {
  const v = Math.abs(value);
  const set = new Set([v, Math.round(v), Math.floor(v), Math.round(v * 10) / 10, Math.round(v * 100) / 100]);
  for (const unit of [1e3, 1e4, 1e8, 1e12]) {
    if (v >= unit) { set.add(Math.floor(v / unit)); set.add(Math.round(v / unit)); set.add(Math.round((v / unit) * 10) / 10); }
  }
  if (v >= 100) { set.add(Math.floor(v / 100) * 100); set.add(Math.floor(v / 1000) * 1000); }
  return set;
}

// English headlines carry "$42.4 billion" while the brief says 424억 달러: a
// billion is 10억, a million is 100만 (as 만), a trillion is 1조.
const MAGNITUDE = [[/^\s*(?:billion|bn|B)\b/i, 10], [/^\s*(?:million|mn|M)\b/i, 100], [/^\s*(?:trillion|tn|T)\b/i, 1]];

export function providedNumbers(source) {
  // 0.01 is the bp explanation ("bp는 0.01%p"). The system prompt is NOT part of the
  // source: its rule examples ("70bp", "1,340") must never count as provided.
  const allowed = new Set([0.01]);
  for (const t of tokens(source)) {
    for (const n of expand(t.value)) allowed.add(n);
    for (const [pattern, factor] of MAGNITUDE) {
      if (pattern.test(t.after)) for (const n of expand(Math.round(t.value * factor * 100) / 100)) allowed.add(n);
    }
  }
  return allowed;
}

// Only numbers a reader takes as a data point are checked: decimals, 100 and
// above, and anything with a unit (%, bp, 달러 ...). Dates, years, counts like
// "3분기" and ordinals are skipped.
const UNIT_AFTER = /^\s*(?:%|bp|달러|원|조|억|만|배)/;
const NOT_DATA = /^\s*(?:[월일시분초년주번째개건곳가지분기차]|\/)/;
function isCandidate(t) {
  if (t.before === '/' || t.after.startsWith('/')) return false;
  if (Number.isInteger(t.value) && t.value >= 2000 && t.value <= 2035 && !UNIT_AFTER.test(t.after)) return false;
  if (UNIT_AFTER.test(t.after)) return true;
  if (NOT_DATA.test(t.after)) return false;
  return t.raw.includes('.') || t.value >= 100;
}

export function findInventedNumbers(text, source) {
  const allowed = providedNumbers(source);
  const found = new Set();
  for (const t of tokens(text)) {
    if (!isCandidate(t)) continue;
    const v = Math.abs(t.value);
    if (allowed.has(v) || allowed.has(Math.round(v * 10) / 10) || allowed.has(Math.round(v * 100) / 100)) continue;
    found.add(`${t.raw}${t.after.match(/^\s*(?:%p?|bp|달러|원|조|억|만|배)/)?.[0].trim() ?? ''}`);
  }
  return [...found];
}

// Style patterns: reading data that is not in the inputs, or closing an
// interpretation as if it were a fact.
const FX = '(?:원\\/달러|환율|원화)';
const FLOW = '(?:외국인|자금)';
const FLOW_VERB = '(?:이탈|유입|빠져나|그림|자연스럽|아니었|아니다)';
const STYLE = [
  /(?:쪽에|것에|편에)?\s*가깝다/g,
  /더 정확하다/g,
  /(?:한|된|인|진)\s*셈이다/g,
  /라는 얘기다/g,
  /(?:이틀|사흘|나흘|닷새|엿새|열흘|\d+일|\d+주|\d+개월|넉 달|석 달|두 달|세 달|\d+달|\d+번|네 번)\s*(?:째|연속)/g,
  /[^.\n]*아니라[^.\n]*(?:뜻|얘기|장면|그림|셈)이다/g,
  new RegExp(`[^.\\n]*${FX}[^.\\n]*${FLOW}[^.\\n]*${FLOW_VERB}[^.\\n]*`, 'g'),
  new RegExp(`[^.\\n]*${FLOW}[^.\\n]*${FX}[^.\\n]*${FLOW_VERB}[^.\\n]*`, 'g'),
];

export function findStylePatterns(text) {
  const found = new Set();
  for (const pattern of STYLE) {
    for (const m of String(text ?? '').matchAll(pattern)) found.add(m[0].trim().slice(0, 60));
  }
  return [...found];
}

const FIX_RULES = ({ numbers, phrases }) => `You correct a Korean market brief before it is published under KK's name.

${numbers.length ? `These numbers are not in the data the brief was given. They were invented, or they are a wrong restatement:
${numbers.map((n) => `- "${n}"`).join('\n')}
Rewrite the sentences that use them so the number is gone. Do not replace it with another number, and do not add any new number. Name the thing without a threshold (for example "스프레드가 더 벌어지는지 본다").
` : ''}${phrases.length ? `These expressions state an interpretation as a fact, or read data the brief does not have (for example foreign fund flows from the exchange rate):
${phrases.map((p) => `- "${p}"`).join('\n')}
Rewrite only those sentences. State what the numbers show. Where a cause or meaning is needed, say "~로 보인다" only if the brief's own headlines support it, otherwise say it needs more confirmation ("확인이 더 필요하다"), or leave it out. Do not infer fund flows from the exchange rate.
` : ''}
Everything else stays:
- Keep the first line in the form "TITLE: ...".
- Keep every number that is not listed above, exactly. Add none.
- Keep every "##" heading, bullet, → arrow and the 💡 line (one sentence, one thing to watch).
- Add no fact, cause or opinion.

Output: the TITLE line, a blank line, then the markdown body. Nothing else.`;

// `call(system, user)` is the brief's own writing route. `source` is everything
// the model was given (system prompt + data block).
export async function enforceGrounding({ title, body, source, call, fixedTitle = false }) {
  const numbers = findInventedNumbers(`${title}\n${body}`, source);
  const phrases = findStylePatterns(body);
  if (!numbers.length && !phrases.length) return { title, body, grounding: { fixed: [], remaining: [] } };

  let reply;
  try {
    reply = await call(FIX_RULES({ numbers, phrases }), `TITLE: ${title}\n\n${body}`);
  } catch (error) {
    if (numbers.length) throw new Error(`데이터에 없는 숫자 (${numbers.join(', ')}) — 수정 호출 실패: ${String(error.message || error).slice(0, 120)}`);
    return { title, body, grounding: { fixed: [], remaining: phrases } };
  }
  const m = String(reply || '').match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/);
  const after = m ? { title: fixedTitle ? title : m[1].trim().slice(0, 200), body: m[2].replace(/^\s*#\s+.*\n+/, '').trim() } : null;
  const broke = after ? checkFix({ title, body }, after) : 'format';

  if (!after || broke) {
    // A bad rewrite is never published. Invented numbers fail the run; style
    // patterns fall back to the original text and KK is told.
    if (numbers.length) throw new Error(`데이터에 없는 숫자 (${numbers.join(', ')}) — 수정본이 ${broke || 'format'}`);
    return { title, body, grounding: { fixed: [], remaining: phrases } };
  }

  const stillNumbers = findInventedNumbers(`${after.title}\n${after.body}`, source);
  if (stillNumbers.length) throw new Error(`데이터에 없는 숫자가 수정 후에도 남음 (${stillNumbers.join(', ')})`);
  const stillPhrases = findStylePatterns(after.body);
  return { ...after, grounding: { fixed: [...numbers, ...phrases].filter((x) => !stillPhrases.includes(x)), remaining: stillPhrases } };
}
