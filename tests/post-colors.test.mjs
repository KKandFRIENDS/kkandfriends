import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = (file) => readFile(path.join(ROOT, file), 'utf8');

// 2026-10-13: the site accent is blue. Seven posts had drifted to gold (tag,
// links, CTA, callouts) and nine had an orange (#E8A33D) left border on the
// "핵심 요약" takeaway box; none may bring either back.
test('posts use the blue accent, not the retired gold', async () => {
  const entries = await readdir(path.join(ROOT, 'posts'), { withFileTypes: true });
  const gold = /#(?:E8A800|E8A33D|F5C64A|C8A24E|B88900|E6C978|9C7E38|FFC547|D8AC5E)\b|rgba\(\s*(?:232,\s*168,\s*0|200,\s*162,\s*78|216,\s*172,\s*94|255,\s*180,\s*0),/i;
  for (const entry of entries.filter((e) => e.isFile() && e.name.endsWith('.html'))) {
    assert.doesNotMatch(await source(`posts/${entry.name}`), gold, `${entry.name} uses the old gold accent`);
  }
});
