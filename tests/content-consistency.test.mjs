import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

async function source(file) {
  return readFile(path.join(ROOT, file), 'utf8');
}

// The number of published columns is derived from disk, never hardcoded here.
// Every public surface that states a total must agree with it, so a publish that
// forgets to bump a count fails this test instead of shipping a wrong number.
async function publishedPostCount() {
  const entries = await readdir(path.join(ROOT, 'posts'), { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.html')).length;
}

test('public biography copy consistently uses the since-1996 timeline', async () => {
  const [home, community, thoughts] = await Promise.all([
    source('index.html'),
    source('community.html'),
    source('thoughts.html'),
  ]);
  const combined = `${home}\n${community}\n${thoughts}`;
  const retiredClaims = [
    '30Y+',
    '30년 글로벌 금융 커리어의 경험과 네트워크',
    '현장에서 쌓은 30년의 경험이 담긴 KK의 시장 인사이트',
    '20 years of real experience',
    '20년 글로벌 금융 경력에서 나오는 생각들',
    '30년 글로벌 금융 경력에서 나오는 생각들',
    '20년 글로벌 금융 경력에서 나온 생각들',
    // Superseded by the 1996 start date; the 1997 IMF crisis may still be cited
    // inside article copy, so only the biography phrasings are retired.
    'experience since 1997',
    '1997년부터',
  ];

  for (const claim of retiredClaims) {
    assert.equal(combined.includes(claim), false, `retired biography claim remains: ${claim}`);
  }

  assert.match(home, /Since 1996/);
  assert.match(home, /1996년부터/);
  assert.match(community, /since 1996/i);
  assert.match(thoughts, /1996년부터/);
});

test('public article totals match the number of published posts', async () => {
  const [home, thoughts, sitemap, total] = await Promise.all([
    source('index.html'),
    source('thoughts.html'),
    source('sitemap.xml'),
    publishedPostCount(),
  ]);

  assert.match(
    home,
    new RegExp(`전체 ${total}편 보기`),
    `index.html latest-strip link must say 전체 ${total}편 보기`,
  );
  assert.match(
    thoughts,
    new RegExp(`>${total} posts<`),
    `thoughts.html post-count must say ${total} posts`,
  );

  const sitemapPosts = (sitemap.match(/\/posts\//g) || []).length;
  assert.equal(sitemapPosts, total, 'sitemap.xml must list every published post');

  const linked = new Set(thoughts.match(/\/posts\/[0-9A-Za-z_-]+/g) || []);
  assert.equal(linked.size, total, 'thoughts.html must link every published post');
});

test('the latest-strip stays a full row of three cards', async () => {
  const home = await source('index.html');
  const strip = home.match(/<div class="ls-grid">([\s\S]*?)<\/div>\s*<\/section>/);
  assert.ok(strip, 'latest-strip grid not found in index.html');
  const cards = strip[1].match(/class="ls-card"/g) || [];
  assert.equal(cards.length, 3, 'latest-strip must hold exactly 3 cards (grid is 3 columns)');
});

test('the latest-strip uses the site blue accent, never the retired gold', async () => {
  const home = await source('index.html');
  const strip = home.match(/\.latest-strip \{[\s\S]*?<\/style>/);
  assert.ok(strip, 'latest-strip stylesheet not found in index.html');
  assert.doesNotMatch(strip[0], /#C8A24E/i, 'retired gold hex remains in latest-strip CSS');
  assert.doesNotMatch(strip[0], /200\s*,\s*162\s*,\s*78/, 'retired gold rgb remains in latest-strip CSS');
});
