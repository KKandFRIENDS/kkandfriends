// 2026-11-06 KK: 사이트에 올라가는 글은 같은 글꼴 규칙으로.
// Every server-rendered article page loads the same heading fonts
// (Playfair Display + Noto Serif KR) as THOUGHTS posts and the editors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ARTICLE_FONT_LINKS } from '../lib/article-fonts.js';
import { renderOriginalPage } from '../lib/original-render.js';

const RENDERERS = ['lib/original-render.js', 'lib/desk-render.js', 'lib/markets-render.js', 'lib/week-render.js'];

test('article font links load Noto Serif KR and Playfair Display', () => {
  assert.match(ARTICLE_FONT_LINKS, /family=Playfair\+Display/);
  assert.match(ARTICLE_FONT_LINKS, /family=Noto\+Serif\+KR/);
});

test('every typography.css link in article renderers comes with the article fonts', async () => {
  for (const file of RENDERERS) {
    const src = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const sheets = src.match(/<link rel="stylesheet" href="\/typography\.css">/g) || [];
    const paired = src.match(/\$\{ARTICLE_FONT_LINKS\}\n<link rel="stylesheet" href="\/typography\.css">/g) || [];
    assert.ok(sheets.length > 0, `${file} loads typography.css`);
    assert.equal(paired.length, sheets.length, `${file}: every page loads the article fonts`);
  }
});

test('a rendered KK Original page carries the heading fonts before typography.css', () => {
  const html = renderOriginalPage({
    slug: 'font-check', title: '제목', summary: '요약', category: 'Korea',
    date: '2026-11-06', tags: [], body: '## 소제목\n본문',
  });
  const fonts = html.indexOf('family=Noto+Serif+KR');
  const typography = html.indexOf('/typography.css');
  assert.ok(fonts > 0 && fonts < typography);
});
