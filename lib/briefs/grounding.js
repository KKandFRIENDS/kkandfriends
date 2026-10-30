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

// "$6.3 billion" turned into "6.3조 원": the digits are provided, the currency is not. An amount in
// 조/억 원 must appear in the inputs as a 원 amount; a dollar figure is never converted.
export function findInventedWon(text, source) {
  const wonAllowed = new Set();
  for (const t of tokens(source)) {
    if (/^\s*(?:조|억)\s*원/.test(t.after)) for (const n of expand(t.value)) wonAllowed.add(n);
  }
  const found = new Set();
  for (const m of String(text ?? '').matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(조|억)\s*원/g)) {
    const v = Math.abs(toNumber(m[1]));
    if (!wonAllowed.has(v) && !wonAllowed.has(Math.round(v * 10) / 10)) found.add(`${m[1]}${m[2]} 원`);
  }
  return [...found];
}

// Style patterns: reading data that is not in the inputs, or closing an
// interpretation as if it were a fact.
const FX = '(?:원\\/달러|환율|원화)';
const FLOW = '(?:외국인|자금)';
const FLOW_VERB = '(?:이탈|(?<!순)유입|빠져나|그림|자연스럽|아니었|아니다)';
const S = '(?:[^.\\n]|(?<=\\d)\\.(?=\\d))';
const STYLE = [
  /(?:쪽에|것에|편에)?\s*가깝다/g,
  /더 정확하다/g,
  /셈이다/g,
  /신호다(?![가-힣])/g,
  /(?:자금|돈)[^.\n]*(?:뜻|얘기)이다/g,
  /(?:이|주어진|제공된|제공되지 않은?)\s*(?:데이터|정보|숫자|자료)(?:로|만으로|에는|에서는)?[^.\n]{0,20}(?:할 수 있는 일이 아니|확인되지 않|근거가 없)/g,
  /라는 얘기다/g,
  /(?:이틀|사흘|나흘|닷새|엿새|열흘|\d+일|\d+주|\d+개월|넉 달|석 달|두 달|세 달|\d+달|\d+번|네 번)\s*(?:째|연속)/g,
  /[^.\n]*아니라[^.\n]*(?:뜻|얘기|장면|그림|셈)이다/g,
  new RegExp(`${S}*${FX}${S}*${FLOW}${S}*${FLOW_VERB}${S}*`, 'g'),
  new RegExp(`${S}*${FLOW}${S}*${FX}${S}*${FLOW_VERB}${S}*`, 'g'),
];

// "78,446 ... 78,000선 아래": the number is right and the sentence is wrong. When a provided
// value sits strictly above the line (equal is not above: "1,412,000 아래" for a price of 1,412,000
// is fine; within one step: 1,000 for round thousands, else 100), a sentence that STATES "아래/밑/미만"
// about that line is a wrong-side claim. Questions and conditions ("5,700 아래로 더 가는지") are not
// statements, so only past and present verbs count. A wrong fact fails the run like an invented number.
const STATE_VERB = '(?:으로|로|에서|에)?\\s*(?:더\\s*)?(?:내려왔|내려앉|내려갔|내려가고|내렸|밀렸|밀려|떨어졌|떨어져|빠졌|무너졌|하락했|마감|출발|열렸|머물|있다|이다|였다|이었다)';
export function findWrongSide(text, source) {
  const values = tokens(source).map((t) => Math.abs(t.value));
  const found = new Set();
  const pattern = new RegExp(`(\\d[\\d,]*)\\s*(?:달러|원|포인트)?\\s*(?:선|대)?\\s*(?:아래|밑|미만|하회)${STATE_VERB}`, 'g');
  for (const m of String(text ?? '').matchAll(pattern)) {
    const n = toNumber(m[1]);
    if (!Number.isFinite(n) || n < 1000) continue;
    const step = n % 1000 === 0 ? 1000 : 100;
    if (values.some((v) => v > n && v < n + step)) found.add(`${m[1]} 아래`);
  }
  return [...found];
}

export function findStylePatterns(text) {
  const found = new Set();
  for (const pattern of STYLE) {
    for (const m of String(text ?? '').matchAll(pattern)) found.add(m[0].trim().slice(0, 60));
  }
  return [...found];
}

// Errors from the guards that a second, fresh writing attempt usually avoids.
export const isGuardFailure = (error) => /데이터에 없는 숫자|틀린 방향의 선|단정 표현|완결성 검사/.test(String(error?.message || error));

const FIX_RULES = ({ numbers, wrong, phrases }) => `You correct a Korean market brief before it is published under KK's name.

${numbers.length ? `These numbers are not in the data the brief was given. They were invented, or they are a wrong restatement:
${numbers.map((n) => `- "${n}"`).join('\n')}
Rewrite the sentences that use them so the number is gone. Do not replace it with another number, and do not add any new number. Name the thing without a threshold (for example "스프레드가 더 벌어지는지 본다").
` : ''}${wrong.length ? `These sentences put a value on the wrong side of a line (the value is actually at or above it):
${wrong.map((n) => `- "${n}"`).join('\n')}
Rewrite them with the right side (for example "78,000대" or "78,000 위") or drop the line. Do not add a number.
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
  const numbers = [...findInventedNumbers(`${title}\n${body}`, source), ...findInventedWon(`${title}\n${body}`, source)];
  const wrong = findWrongSide(body, source);
  const phrases = findStylePatterns(body);
  const hard = (n, w) => [...(n.length ? [`데이터에 없는 숫자 (${n.join(', ')})`] : []), ...(w.length ? [`틀린 방향의 선 (${w.join(', ')})`] : [])].join(' / ');
  if (!numbers.length && !wrong.length && !phrases.length) return { title, body, grounding: { fixed: [], remaining: [] } };

  let reply;
  try {
    reply = await call(FIX_RULES({ numbers, wrong, phrases }), `TITLE: ${title}\n\n${body}`);
  } catch (error) {
    if (numbers.length || wrong.length) throw new Error(`${hard(numbers, wrong)} — 수정 호출 실패: ${String(error.message || error).slice(0, 120)}`);
    return { title, body, grounding: { fixed: [], remaining: phrases } };
  }
  const m = String(reply || '').match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/);
  const after = m ? { title: fixedTitle ? title : m[1].trim().slice(0, 200), body: m[2].replace(/^\s*#\s+.*\n+/, '').trim() } : null;
  const broke = after ? checkFix({ title, body }, after) : 'format';

  if (!after || broke) {
    // A bad rewrite is never published. Wrong facts fail the run; style patterns
    // fall back to the original text and KK is told.
    if (numbers.length || wrong.length) throw new Error(`${hard(numbers, wrong)} — 수정본이 ${broke || 'format'}`);
    return { title, body, grounding: { fixed: [], remaining: phrases } };
  }

  const stillNumbers = [...findInventedNumbers(`${after.title}\n${after.body}`, source), ...findInventedWon(`${after.title}\n${after.body}`, source)];
  const stillWrong = findWrongSide(after.body, source);
  if (stillNumbers.length || stillWrong.length) throw new Error(`${hard(stillNumbers, stillWrong)} 수정 후에도 남음`);
  const stillPhrases = findStylePatterns(after.body);
  return { ...after, grounding: { fixed: [...numbers, ...wrong, ...phrases].filter((x) => !stillPhrases.includes(x)), remaining: stillPhrases } };
}
