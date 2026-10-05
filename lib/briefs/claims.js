// Claim guard for the lounge briefs. Runs after the humanizer and before
// anything is published.
//
// The prompts already forbid superlatives the data does not show, but nothing
// checked that the model obeyed. On 2026-10-05 the Korea close called KOSPI
// 7,003.74 its "사상 첫 7,000대 진입" although KOSPI had closed at 7,080.92 on
// 9/23, and it went out under KK's name. The model only ever sees today's
// close, the daily change and (since this change) a 52-week closing range, so
// a claim about all of history can never be backed by its inputs.
//
// Flow: find the phrases → ask the same model once to rewrite only those
// sentences → check again. If any remain, or the rewrite changed numbers,
// headings or the format, throw: the caller releases the lock and alerts KK,
// and nothing is published. A wrong brief under KK's name is worse than none.

const numbers = (text) => (text.match(/\d[\d,.]*/g) || []).map((v) => v.replace(/,/g, '').replace(/\.+$/, ''));
const headings = (text) => text.split('\n').filter((line) => /^\s*#{2,3}\s/.test(line)).map((line) => line.trim());
const count = (text, pattern) => (text.match(pattern) || []).length;

// The fix may drop a number that only existed inside the bad claim ("첫 7,000대"),
// but it may not add or change one.
function checkFix(before, after) {
  const pool = numbers(`${before.title}\n${before.body}`);
  for (const n of numbers(`${after.title}\n${after.body}`)) {
    const i = pool.indexOf(n);
    if (i < 0) return `numbers_changed (${n})`;
    pool.splice(i, 1);
  }
  if (JSON.stringify(headings(before.body)) !== JSON.stringify(headings(after.body))) return 'headings_changed';
  if (count(before.body, /💡/g) !== count(after.body, /💡/g)) return 'tip_changed';
  if (count(after.body, /→/g) < count(before.body, /→/g)) return 'arrows_removed';
  if (/^\s*\|.*\|\s*$/m.test(after.body)) return 'table_added';
  if (after.body.length < before.body.length * 0.6) return 'body_shrank';
  return null;
}

// "52주 신고가/신저가" is allowed: the 52-week line in the prompt can back it.
const PATTERNS = [
  /사상\s*(?:첫|처음|최초|최고|최대|최저|최악|초유)/g,
  /역대\s*(?:최고|최대|최저|최악|최초|처음|첫)/g,
  /처음으로/g,
  /최초/g,
  /전례\s*(?:없|가\s*없)/g,
  /유일(?:하게|한)/g,
  /(?<!52주\s?)신(?:고|저)가/g,
  /첫\s*[\d,.]+\s*(?:선|대|포인트|고지)?\s*(?:진입|돌파|안착)/g,
  /all[- ]time\s+(?:high|low)/gi,
  /record\s+(?:high|low|close)/gi,
  /first[- ]ever/gi,
];

export function findUnsupportedClaims(text) {
  const found = new Set();
  for (const pattern of PATTERNS) {
    for (const match of String(text ?? '').matchAll(pattern)) found.add(match[0].trim());
  }
  return [...found];
}

const FIX_RULES = (phrases) => `You correct a Korean market brief before it is published under KK's name.

These expressions claim something about all of history, or a ranking, that the brief's data cannot show:
${phrases.map((p) => `- "${p}"`).join('\n')}

Rewrite only the sentences that contain them so the claim is gone. Describe the level or move plainly instead. "52주 신고가" may stay only where the brief already says 52주. Everything else stays exactly as written:
- Keep the first line in the form "TITLE: ...". If the title holds one of the expressions, reword only that part.
- Keep every number, percentage, index name and date exactly. Add none; drop one only if it existed only inside the removed claim.
- Keep every "##" heading, bullet, → arrow and the 💡 line.
- Add no fact, cause or opinion.

Output: the TITLE line, a blank line, then the markdown body. Nothing else.`;

// `call(system, user)` is the brief's own writing route.
export async function enforceClaims({ title, body, call }) {
  const phrases = findUnsupportedClaims(`${title}\n${body}`);
  if (!phrases.length) return { title, body, claims: { fixed: [] } };

  let reply;
  try {
    reply = await call(FIX_RULES(phrases), `TITLE: ${title}\n\n${body}`);
  } catch (error) {
    throw new Error(`확인할 수 없는 단정 표현 (${phrases.join(', ')}) — 수정 호출 실패: ${String(error.message || error).slice(0, 120)}`);
  }
  const m = String(reply || '').match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/);
  if (!m) throw new Error(`확인할 수 없는 단정 표현 (${phrases.join(', ')}) — 수정본 형식 오류`);
  const after = { title: m[1].trim().slice(0, 200), body: m[2].replace(/^\s*#\s+.*\n+/, '').trim() };

  const broke = checkFix({ title, body }, after);
  if (broke) throw new Error(`확인할 수 없는 단정 표현 (${phrases.join(', ')}) — 수정본이 ${broke}`);
  const left = findUnsupportedClaims(`${after.title}\n${after.body}`);
  if (left.length) throw new Error(`확인할 수 없는 단정 표현이 수정 후에도 남음 (${left.join(', ')})`);

  return { ...after, claims: { fixed: phrases } };
}
