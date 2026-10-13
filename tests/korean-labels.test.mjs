import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');

async function pages() {
  const files = [];
  for (const dir of ['', 'posts', 'lib']) {
    for (const name of await readdir(path.join(ROOT, dir))) {
      if (/\.(html|js)$/.test(name)) files.push(path.join(dir, name));
    }
  }
  return files;
}

// 2026-10-13 KK decision: labels are Korean first. Navigation, footer and form
// labels no longer carry an English twin ("Home / 홈", "Apply / 신청"). Brand
// names (THOUGHTS, KK, Daily Markets) stay as they are.
test('no "English / 한국어" twin labels on the site', async () => {
  for (const file of await pages()) {
    const text = await read(file);
    assert.doesNotMatch(text, />[A-Za-z][A-Za-z &'’]* \/ [가-힣][^<]*</, `${file} still has an English / 한국어 label`);
  }
});

test('main navigation uses 소개 · 커뮤니티 · 멤버십, not English capitals', async () => {
  for (const file of await pages()) {
    const text = await read(file);
    assert.doesNotMatch(text, /<a href="(?:\/#about|\/community|\/membership)"[^>]*>(?:ABOUT|COMMUNITY|MEMBERSHIP)<\/a>/, `${file} has an English main-nav label`);
  }
  const home = await read('index.html');
  assert.match(home, /<li><a href="#about">소개<\/a><\/li>\s*<li><a href="\/community">커뮤니티<\/a><\/li>\s*<li><a href="\/membership">멤버십<\/a><\/li>/);
});

// At the top of the home page the sticky header sits under the 74px ticker, so
// the fixed mobile menu must start where the header ends or its first link is
// hidden behind it.
test('home mobile menu is placed below the header', async () => {
  const home = await read('index.html');
  assert.match(home, /function placeMenu\(\)/);
  assert.match(home, /menu\.style\.top = Math\.max\(0, Math\.round\(nav\.getBoundingClientRect\(\)\.bottom\)\)/);
});
