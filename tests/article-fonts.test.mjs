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

// Infographics follow the same rule (2026-11-06 KK): headings and key figures
// in Playfair Display + Noto Serif KR, the rest in Pretendard.
import { existsSync } from 'node:fs';
import { buildInfographicSvg, serifRuns, INFOGRAPHIC_FONTS } from '../scripts/desk-infographic.mjs';

test('infographic loads the site serif fonts', () => {
  for (const file of INFOGRAPHIC_FONTS) assert.ok(existsSync(file), file);
  assert.ok(INFOGRAPHIC_FONTS.some(f => f.endsWith('NotoSerifKR-Bold.ttf')));
  assert.ok(INFOGRAPHIC_FONTS.some(f => f.endsWith('PlayfairDisplay-Bold.ttf')));
});

test('serif text is split into Hangul (Noto Serif KR) and Latin (Playfair) runs', () => {
  assert.equal(serifRuns('코스피 7.87%'),
    '<tspan font-family="Noto Serif KR">코스피 </tspan><tspan font-family="Playfair Display">7.87%</tspan>');
  // a syllable outside the 2,350-character subset falls back to Pretendard
  assert.match(serifRuns('똠'), /font-family="Pretendard">똠/);
});

test('infographic title, headings and stat values use the serif runs', () => {
  const { svg } = buildInfographicSvg({
    title: '제목 AI', sections: [{ type: 'stats', heading: '소제목', items: [{ value: '1.5%', label: '라벨' }, { value: '2%', label: '라벨' }] }],
  });
  assert.match(svg, /<tspan font-family="Noto Serif KR">제목 <\/tspan><tspan font-family="Playfair Display">AI<\/tspan>/);
  assert.match(svg, /<tspan font-family="Noto Serif KR">소제목<\/tspan>/);
  assert.match(svg, /<tspan font-family="Playfair Display">1\.5%<\/tspan>/);
  assert.doesNotMatch(svg, /<tspan[^>]*>라벨/);
});
