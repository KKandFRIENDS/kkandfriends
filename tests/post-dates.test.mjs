import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = (file) => readFile(path.join(ROOT, file), 'utf8');

// A bulk edit once turned every post's date line into "$12026. 9. 25.</span>":
// the opening tag was replaced by the literal "$1". Each post must show its own
// publish date, taken from the file name, inside the styled .article-date span.
test('every post shows its publish date in an article-date span', async () => {
  const entries = await readdir(path.join(ROOT, 'posts'), { withFileTypes: true });
  for (const entry of entries.filter((e) => e.isFile() && e.name.endsWith('.html'))) {
    const html = await source(`posts/${entry.name}`);
    assert.doesNotMatch(html, /\$1\d{4}\./, `${entry.name} has a "$1" left in its date line`);
    const [, year, month, day] = entry.name.match(/^(\d{4})(\d{2})(\d{2})_/);
    const expected = `${year}. ${Number(month)}. ${Number(day)}.`;
    assert.ok(html.includes(`<span class="article-date">${expected}</span>`), `${entry.name} should show ${expected}`);
  }
});
