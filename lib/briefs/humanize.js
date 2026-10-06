// Humanizer pass for the lounge briefs (KK rule 2026-10-04: every routine runs
// its final prose through .claude/skills/humanizer/SKILL.md).
//
// The briefs publish unattended under KK's name, so the pass may only change
// wording. The rewrite is thrown away, and the original published, when it
// changes a number, a section heading, the 💡 tip line or the → bullets, adds a
// table, shrinks the body sharply, or the model call fails. The caller reports
// a discarded pass to KK instead of treating it as a success.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_PATH = process.env.BRIEFS_HUMANIZER_SKILL
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.claude/skills/humanizer/SKILL.md');

let cachedSkill;
export function loadHumanizerSkill(file = SKILL_PATH) {
  if (file !== SKILL_PATH) return readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  cachedSkill ??= readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  return cachedSkill;
}

const HOUSE_RULES = `You edit a Korean market brief that is already written. Apply the HUMANIZER SKILL below in embedded mode and return only the final text.

The brief's house format is KK's writing sample, so it overrides the skill:
- Keep the first line exactly in the form "TITLE: ...". You may reword only the part after the last "·".
- Keep every "##" heading line exactly, in the same order.
- Keep every number, percentage, ticker, index name, date and quoted string exactly as written. Add or remove none.
- Keep bullets as bullets and keep every → arrow; the skill's rules on arrows, bold labels and emoji do not apply to them.
- Keep the 💡 line and its **bold** sentence.
- Keep the tone: mostly "~다", short sentences, Fed / risk-off / curve / dovish / carry left in English, and "확인 필요" where it appears.
- Add no fact, cause, opinion or example. No tables. Do not add a closing disclaimer.
- The skill's examples are English; apply the same structures in Korean, especially "A가 아니라 B", "A뿐 아니라 B", one-line closers that repeat the paragraph, sayings such as "본질은" or "결국 중요한 것은", and inflation such as "역사적" or "중대한 전환점".

Output: the TITLE line, a blank line, then the markdown body. Nothing else.`;

const numbers = (text) => (text.match(/\d[\d,.]*/g) || [])
  .map((value) => value.replace(/,/g, '').replace(/\.+$/, ''))
  .sort();
const headings = (text) => text.split('\n').filter((line) => /^\s*#{2,3}\s/.test(line)).map((line) => line.trim());
const count = (text, pattern) => (text.match(pattern) || []).length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function checkHumanized(before, after) {
  const all = (x) => `${x.title}\n${x.body}`;
  if (!same(numbers(all(before)), numbers(all(after)))) return 'numbers_changed';
  if (!same(headings(before.body), headings(after.body))) return 'headings_changed';
  if (count(before.body, /💡/g) !== count(after.body, /💡/g)) return 'tip_changed';
  if (count(after.body, /→/g) < count(before.body, /→/g)) return 'arrows_removed';
  if (/^\s*\|.*\|\s*$/m.test(after.body)) return 'table_added';
  if (after.body.length < before.body.length * 0.6) return 'body_shrank';
  return null;
}

// `call(system, user)` uses whichever writing route the brief already chose.
// `fixedTitle`: the caller sets the title in code ("오늘의 시작 (10/6 화)"), so
// whatever the model echoes on its TITLE line is discarded before checking.
export async function humanizeBrief({ title, body, call, skill, fixedTitle = false }) {
  const keep = (reason) => ({ title, body, humanizer: { applied: false, reason } });
  let text;
  try {
    text = skill ?? loadHumanizerSkill();
  } catch (error) {
    return keep(`skill_unavailable: ${String(error.code || error.message).slice(0, 80)}`);
  }
  let reply;
  try {
    reply = await call(`${HOUSE_RULES}\n\nHUMANIZER SKILL:\n${text}`, `TITLE: ${title}\n\n${body}`);
  } catch (error) {
    return keep(`model_failed: ${String(error.message || error).slice(0, 120)}`);
  }
  const m = String(reply || '').match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/);
  if (!m) return keep('format_changed');
  const after = { title: fixedTitle ? title : m[1].trim().slice(0, 200), body: m[2].replace(/^\s*#\s+.*\n+/, '').trim() };
  const reason = checkHumanized({ title, body }, after);
  return reason ? keep(reason) : { ...after, humanizer: { applied: true } };
}
