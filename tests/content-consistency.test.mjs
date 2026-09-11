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

// /sitemap.xml is served by a function, not a committed file, so that desk
// editions can appear in it. Render it here with an empty desk archive: this
// test is about the posts, and tests/discoverability.test.mjs covers the rest.
async function generatedSitemap() {
  const { makeSitemapHandler } = await import('../api/desk.js');
  let body = '';
  const res = {
    setHeader: () => res,
    status: () => res,
    send: (value) => { body = value; return res; },
    json: (value) => { body = value; return res; },
  };
  await makeSitemapHandler({ storeFactory: () => ({ request: async () => [] }) })(
    { method: 'GET', query: {} },
    res,
  );
  return body;
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

test('published post totals stay dynamic while the homepage uses a unified live feed', async () => {
  const [home, thoughts, sitemap, total] = await Promise.all([
    source('index.html'),
    source('thoughts.html'),
    // The sitemap is generated now (the sitemap view of api/desk.js) so it can
    // include the desk
    // archive; the assertion below still holds it to every published post.
    generatedSitemap(),
    publishedPostCount(),
  ]);

  assert.doesNotMatch(home, /전체 \d+편 보기/);
  assert.match(home, /id="insights-latest-grid"/);
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

test('the insights hub keeps three editorial choices and three latest fallbacks', async () => {
  const home = await source('index.html');
  assert.equal((home.match(/class="ih-series-card/g) || []).length, 3);
  assert.equal((home.match(/class="ih-latest-card"/g) || []).length, 3);
});

test('the insights hub uses the site blue palette, never the retired gold', async () => {
  const home = await source('index.html');
  const hub = home.match(/\.insights-hub \{[\s\S]*?<\/style>/);
  assert.ok(hub, 'insights hub stylesheet not found in index.html');
  assert.doesNotMatch(hub[0], /#C8A24E/i, 'retired gold hex remains in insights CSS');
  assert.doesNotMatch(hub[0], /200\s*,\s*162\s*,\s*78/, 'retired gold rgb remains in insights CSS');
});

test('homepage editorial cards deep-link to their own series filters', async () => {
  const [home, desk, thoughts] = await Promise.all([source('index.html'), source('js/desk.js'), source('thoughts.html')]);

  assert.match(home, /\/desk\?series=DAILY%20DESK/);
  assert.match(home, /\/desk\?series=KK%20WEEKLY/);
  assert.match(home, /\/thoughts\?series=KK%20ORIGINAL/);
  assert.match(desk, /params\.get\('series'\)/);
  assert.match(thoughts, /allowedSeries\.includes\(requestedSeries\)/);
});
