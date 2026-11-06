// Page titles show up as-is in Google, Naver, KakaoTalk and LinkedIn previews.
// House rule: no em dash (2026-11-07 Site Steward, KK approved).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const TITLE_TAGS = /<title>[^<]*<\/title>|<meta (?:property|name)="(?:og:title|twitter:title)" content="[^"]*"/g;

test('top-level page titles and preview titles have no em dash', () => {
  const bad = [];
  for (const file of readdirSync('.').filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    for (const tag of html.match(TITLE_TAGS) || []) if (tag.includes('—')) bad.push(`${file}: ${tag}`);
  }
  assert.deepEqual(bad, []);
});

test('the RSS channel title has no em dash', () => {
  const src = readFileSync('lib/feeds.js', 'utf8');
  const line = src.split('\n').find((l) => /title = 'KK &amp; Friends/.test(l));
  assert.ok(line, 'channel title line found');
  assert.doesNotMatch(line, /—/);
});
