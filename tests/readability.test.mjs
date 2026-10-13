import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');

// 2026-10-13 readability floor: public text is never smaller than 11px, and
// links in the footer and on post pages are at least 44px tall on phones.
// Admin screens are Chief-only and excluded; the founder block is covered by
// its own rules (index.html .founder-*, .career-year).
async function publicFiles() {
  const files = [];
  for (const dir of ['', 'posts', 'blog']) {
    for (const name of await readdir(path.join(ROOT, dir))) {
      if (/\.(html|css)$/.test(name) && !name.startsWith('admin')) files.push(path.join(dir, name));
    }
  }
  return files;
}

test('no public text is set below 11px (founder block excepted)', async () => {
  for (const file of await publicFiles()) {
    const css = await read(file);
    for (const match of css.matchAll(/([^{}]*)\{[^{}]*?font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      const selector = match[1].trim().split('\n').pop().trim();
      // .post-nav-logo-sub is leftover CSS in every post: no element uses it any more.
      if (/^\.(career-year|founder-|post-nav-logo-sub)/.test(selector)) continue;
      assert.ok(Number(match[2]) >= 11, `${file}: ${selector} uses ${match[2]}px`);
    }
  }
});

test('footer and post back links are 44px touch rows on phones', async () => {
  assert.match(await read('site-footer.css'), /@media \(max-width: 720px\)[\s\S]*\.kkf-footer-col a \{ min-height: 44px;/);
  assert.match(await read('brand.css'), /\.post-nav-back,\s*\.article-footer-back \{[^}]*min-height: 44px/);
});

test('the end-of-post join button uses dark text on its accent fill', async () => {
  assert.match(await read('brand.css'), /\.article-cta-primary \{ color: #061018; \}/);
});
