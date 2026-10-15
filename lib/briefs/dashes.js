// No em dashes in published briefs (2026-10-15 KK). The prompts ask the model to
// avoid them and the humanizer pass removes them, but nothing used to check the
// result, so a skipped or failed polish could still publish one. This is the check.
//
// Only U+2014 (—) and a spaced U+2013 ( – ) are replaced. An en dash between digits
// ("3.75–4.00%") is part of a number copied from the data and is left alone, and so
// is the minus sign U+2212 in "−10.84%". Code fences, inline code and URLs are untouched.

const PROTECTED = /```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+/g;

function fix(text) {
  return text
    .replace(/^[ \t]*[—–][ \t]*/gm, '')           // a dash opening a line: drop it
    .replace(/[ \t]*[—–][ \t]*$/gm, '')           // a dash closing a line: drop it
    .replace(/([.,!?:;)\]"'”’])[ \t]*—[ \t]*/g, '$1 ')  // already punctuated: just a space
    .replace(/[ \t]*—[ \t]*/g, ', ')               // the usual case: a comma
    .replace(/[ \t]+–[ \t]+/g, ', ');              // spaced en dash only
}

export function stripDashes(text) {
  const keep = [];
  const masked = String(text ?? '').replace(PROTECTED, (match) => `\u0000${keep.push(match) - 1}\u0000`);
  return fix(masked).replace(/\u0000(\d+)\u0000/g, (_, index) => keep[Number(index)]);
}
