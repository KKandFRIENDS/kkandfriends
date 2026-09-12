// The plumbing that decides whether anything KK writes can be found or shared:
// canonical URLs, the generated sitemap and feed, and the server-rendered desk
// page. These are the failures nobody notices by looking at the site.

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { buildRss, buildSitemap, STATIC_PAGES } from '../lib/feeds.js';
import { DESK_SLUG, renderDeskPage, metaDescription } from '../lib/desk-render.js';
import { makeDeskPageHandler, makeSitemapHandler, makeRssHandler, makeHandler } from '../api/desk.js';
import { posts } from '../lib/post-index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = file => readFile(path.join(ROOT, file), 'utf8');
const postFiles = async () =>
  (await readdir(path.join(ROOT, 'posts'), { withFileTypes: true }))
    .filter(e => e.isFile() && e.name.endsWith('.html'))
    .map(e => e.name);

// A published edition, shaped like a row out of editorial_drafts.
const EDITION = {
  id: '2026-09-10-ai',
  edition_date: '2026-09-10',
  published_at: '2026-09-10T00:30:00.000Z',
  payload: {
    desk: { id: 'ai', label: 'AI THURSDAY', topic: 'Global', series: 'DAILY DESK' },
    content: {
      title: '자동화된 AI 연구 인턴',
      summary: '실행 속도는 빨라졌지만 문제 선택과 중단 결정은 사람의 몫이다.',
      sections: [
        { heading: '핵심 판단', text: '판단이 병목이 됐다.', sourceIds: ['s1'] },
        { heading: '반론', text: '속도도 결국 품질을 바꾼다 & 그 반대도 마찬가지다.', sourceIds: ['s1'] },
      ],
      relatedUrls: ['/posts/20260614_ai_capex_risk'],
    },
    sources: [{ id: 's1', title: 'Primary release', url: 'https://example.org/a', publishedAt: '2026-09-09', excerpt: 'x' }],
    related: [{ title: 'AI capex risk', url: '/posts/20260614_ai_capex_risk' }],
  },
};

const fakeStore = rows => () => ({ request: async () => rows });
const brokenStore = () => () => ({ request: async () => { throw new Error('store down'); } });

function fakeRes() {
  const res = {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

// ── canonical URLs ──────────────────────────────────────────────────────────

test('no post declares a canonical or og:url that only exists as a redirect', async () => {
  // cleanUrls:true serves /posts/<slug> and 308-redirects /posts/<slug>.html,
  // so a canonical ending in .html points crawlers at a redirect.
  for (const file of await postFiles()) {
    const html = await source(`posts/${file}`);
    const declared = [...html.matchAll(/(?:rel="canonical" href|property="og:url" content)="([^"]+)"/g)]
      .map(m => m[1]);
    assert.ok(declared.length >= 2, `${file}: expected canonical and og:url`);
    for (const url of declared) {
      assert.ok(!url.endsWith('.html'), `${file}: ${url} is a redirect, not a canonical URL`);
      assert.match(url, /^https:\/\/www\.kkandfriends\.com\/posts\/[\w-]+$/, `${file}: ${url}`);
    }
  }
});

test('posts link to clean internal paths, not to .html files', async () => {
  for (const file of await postFiles()) {
    const html = await source(`posts/${file}`);
    assert.ok(!html.includes('../index.html'), `${file}: relative .html link to home`);
    assert.ok(!html.includes('../thoughts.html'), `${file}: relative .html link to THOUGHTS`);
  }
});

test('every post ends with a way into the community', async () => {
  // A 3,000-character essay is the main acquisition asset; before this the only
  // exit was "Back to THOUGHTS".
  for (const file of await postFiles()) {
    const html = await source(`posts/${file}`);
    assert.match(html, /class="article-cta"/, `${file}: no end-of-article CTA`);
    assert.match(html, /class="article-cta-primary" href="\/join"/, `${file}: CTA does not reach /join`);
    const ctaAt = html.indexOf('class="article-cta"');
    const footerAt = html.indexOf('<footer class="article-footer">');
    assert.ok(ctaAt < footerAt, `${file}: CTA must sit above the article footer`);
  }
});

test('the post manifest matches what is actually on disk', async () => {
  const files = await postFiles();
  assert.equal(posts.length, files.length,
    'lib/post-index.js is stale — run node scripts/build-post-index.mjs');
  for (const post of posts) {
    assert.ok(files.includes(`${post.slug}.html`), `manifest lists a missing post: ${post.slug}`);
    assert.ok(post.title && post.description && /^\d{4}-\d{2}-\d{2}$/.test(post.date), `bad entry: ${post.slug}`);
  }
});

// ── sitemap ─────────────────────────────────────────────────────────────────

test('sitemap covers static pages, posts and desk editions, and dedupes', () => {
  const xml = buildSitemap([
    { url: '/', lastmod: '2026-09-05' },
    { url: '/' },
    { url: '/desk/2026-09-10-ai', lastmod: '2026-09-10' },
  ]);
  assert.equal(xml.match(/<loc>https:\/\/www\.kkandfriends\.com\/<\/loc>/g).length, 1);
  assert.match(xml, /<loc>https:\/\/www\.kkandfriends\.com\/desk\/2026-09-10-ai<\/loc>/);
  assert.match(xml, /<lastmod>2026-09-10<\/lastmod>/);
});

test('/sitemap.xml lists the desk archive that the old static file omitted', async () => {
  const res = fakeRes();
  await makeSitemapHandler({ storeFactory: fakeStore([{ id: '2026-09-10-ai', edition_date: '2026-09-10' }]) })(
    { method: 'GET', query: {} }, res,
  );
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /application\/xml/);
  assert.match(res.body, /\/desk\/2026-09-10-ai/);
  for (const page of STATIC_PAGES) {
    assert.ok(res.body.includes(`<loc>https://www.kkandfriends.com${page.path}</loc>`),
      `sitemap is missing ${page.path}`);
  }
  for (const post of posts) {
    assert.ok(res.body.includes(`<loc>https://www.kkandfriends.com${post.url}</loc>`),
      `sitemap is missing ${post.url}`);
  }
});

test('a desk-store outage degrades the sitemap instead of failing it', async () => {
  // A 5xx makes a crawler drop the whole file; a sitemap missing today's
  // edition is the smaller loss.
  const res = fakeRes();
  await makeSitemapHandler({ storeFactory: brokenStore() })({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes(posts[0].url), 'posts should still be listed');
  assert.match(res.headers['cache-control'], /s-maxage=120/, 'a partial sitemap must expire quickly');
});

// ── feed ────────────────────────────────────────────────────────────────────

test('rss escapes markup and emits RFC-822 dates', () => {
  const xml = buildRss([
    { title: 'Tokens & "ledgers"', url: '/posts/x', description: 'a < b', date: '2026-09-05', section: 'Korea' },
  ], { now: new Date('2026-09-11T00:00:00Z') });
  assert.match(xml, /<title>Tokens &amp; &quot;ledgers&quot;<\/title>/);
  assert.match(xml, /<description>a &lt; b<\/description>/);
  assert.match(xml, /<pubDate>Sat, 05 Sep 2026 00:00:00 GMT<\/pubDate>/); // 09:00 KST
  assert.match(xml, /<guid isPermaLink="true">https:\/\/www\.kkandfriends\.com\/posts\/x<\/guid>/);
});

test('/rss.xml carries posts and desk editions, newest first', async () => {
  const res = fakeRes();
  await makeRssHandler({ storeFactory: fakeStore([EDITION]) })({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /application\/rss\+xml/);
  const order = [...res.body.matchAll(/<link>([^<]+)<\/link>/g)].map(m => m[1]);
  // Index 0 is the channel link; the items follow. Posts and desk editions must
  // interleave strictly by date, so pin the assertion to the dates rather than
  // to whichever post happens to be newest today.
  const items = order.slice(1);
  const edition = 'https://www.kkandfriends.com/desk/2026-09-10-ai';
  const editionAt = items.indexOf(edition);
  assert.ok(editionAt >= 0, 'the desk edition should appear in the feed');
  const olderPost = items.findIndex(u => u.includes('/posts/20260905_'));
  assert.ok(olderPost > editionAt,
    'the 2026-09-10 edition should precede the 2026-09-05 post');
  for (const newer of items.slice(0, editionAt)) {
    assert.ok(newer.includes('/posts/') || newer.includes('/desk/'),
      'only posts and desk editions belong in the feed');
  }
  assert.ok(res.body.includes(posts[0].title.replace(/&/g, '&amp;')));
});

test('a desk-store outage still returns a readable feed', async () => {
  const res = fakeRes();
  await makeRssHandler({ storeFactory: brokenStore() })({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes(posts[0].url));
});

// ── server-rendered desk page ───────────────────────────────────────────────

test('desk slugs outside the published series are rejected', () => {
  assert.ok(DESK_SLUG.test('2026-09-10-ai'));
  assert.ok(DESK_SLUG.test('2026-09-13-weekly'));
  for (const bad of ['2026-09-10-other', '../../etc/passwd', '2026-9-10-ai', '2026-09-10-ai?x=1', '']) {
    assert.ok(!DESK_SLUG.test(bad), `should reject ${JSON.stringify(bad)}`);
  }
});

test('a desk edition renders its own title, description and canonical URL', () => {
  // The old /desk?slug=… shell always said "Daily Desk · KK & Friends", so
  // every edition was uncrawlable and unfurled as a generic card.
  const html = renderDeskPage({
    slug: EDITION.id, date: EDITION.edition_date, publishedAt: EDITION.published_at,
    ...EDITION.payload, content: EDITION.payload.content,
  });
  assert.match(html, /<title>자동화된 AI 연구 인턴 · KK &amp; Friends<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.kkandfriends\.com\/desk\/2026-09-10-ai">/);
  assert.match(html, /<meta property="og:title" content="자동화된 AI 연구 인턴">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /"@type":"NewsArticle"/);
  assert.match(html, /실행 속도는 빨라졌지만/, 'the summary must be in the served HTML');
  assert.match(html, /판단이 병목이 됐다/, 'the body must be in the served HTML');
  // Ampersands from the body must not break the document.
  assert.match(html, /속도도 결국 품질을 바꾼다 &amp; 그 반대도 마찬가지다/);
  assert.ok(!/<script[^>]*>(?![\s\S]*application\/ld\+json)/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')),
    'the rendered page should carry no executable script');
});

test('meta descriptions stay short enough to survive a link preview', () => {
  const long = { content: { summary: 'x'.repeat(400) } };
  assert.equal(metaDescription(long).length, 200);
  assert.ok(metaDescription(long).endsWith('…'));
});

test('/desk/<slug> serves the edition, 404s cleanly, and never caches an outage', async () => {
  const ok = fakeRes();
  await makeDeskPageHandler({ storeFactory: fakeStore([EDITION]) })(
    { method: 'GET', query: { slug: '2026-09-10-ai' } }, ok,
  );
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers['content-type'], /text\/html/);
  assert.match(ok.body, /자동화된 AI 연구 인턴/);

  const missing = fakeRes();
  await makeDeskPageHandler({ storeFactory: fakeStore([]) })(
    { method: 'GET', query: { slug: '2026-09-10-ai' } }, missing,
  );
  assert.equal(missing.statusCode, 404);
  assert.match(missing.body, /noindex/);

  const bad = fakeRes();
  await makeDeskPageHandler({ storeFactory: fakeStore([EDITION]) })(
    { method: 'GET', query: { slug: 'not-a-slug' } }, bad,
  );
  assert.equal(bad.statusCode, 404);

  const down = fakeRes();
  await makeDeskPageHandler({ storeFactory: brokenStore() })(
    { method: 'GET', query: { slug: '2026-09-10-ai' } }, down,
  );
  assert.equal(down.statusCode, 503);
  assert.equal(down.headers['cache-control'], 'no-store',
    'an outage must not be cached as a missing article');
});

test('the desk index links to the canonical path and redirects legacy links', async () => {
  const js = await source('js/desk.js');
  const code = js.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
  assert.match(code, /\/desk\/\$\{encodeURIComponent\(a\.slug\)\}/, 'cards must link to /desk/<slug>');
  assert.ok(!code.includes('/desk?slug='), 'no card should link to the query-string form');
  assert.match(js, /location\.replace\(`\/desk\/\$\{encodeURIComponent\(legacySlug\)\}`\)/,
    'already-shared ?slug= links must be redirected, not broken');
  // The homepage deep-links into the filters; that must keep working.
  assert.match(js, /params\.get\('series'\)/);
  assert.match(js, /params\.get\('topic'\)/);
});

test('routing and robots agree about the feed and sitemap', async () => {
  const vercel = JSON.parse(await source('vercel.json'));
  const rewrites = Object.fromEntries(vercel.rewrites.map(r => [r.source, r.destination]));
  // All four public surfaces share one function: the deployment sits at its
  // plan's twelve-function ceiling, so extra api/ files fail the deploy.
  assert.equal(rewrites['/sitemap.xml'], '/api/desk?view=sitemap');
  assert.equal(rewrites['/rss.xml'], '/api/desk?view=rss');
  assert.equal(rewrites['/feed.xml'], '/api/desk?view=rss');
  assert.equal(rewrites['/desk/:slug'], '/api/desk?view=page&slug=:slug');
  const functions = (await readdir(path.join(ROOT, 'api'), { recursive: true, withFileTypes: true }))
    .filter(e => e.isFile() && e.name.endsWith('.js')).length;
  assert.ok(functions <= 12, `${functions} serverless functions exceeds the deployable ceiling of 12`);

  // A static file would shadow the rewrite: Vercel only rewrites on a miss.
  await assert.rejects(() => source('sitemap.xml'), 'a static sitemap.xml would shadow /api/sitemap');

  const robots = await source('robots.txt');
  assert.ok(!/Disallow: \/desk/.test(robots), 'the desk archive must stay crawlable');

  for (const file of ['index.html', 'thoughts.html', 'desk.html']) {
    assert.match(await source(file), /rel="alternate" type="application\/rss\+xml"/,
      `${file}: readers cannot find the feed`);
  }
});

// ── housekeeping ────────────────────────────────────────────────────────────

test('no page animates a selector that no longer exists', async () => {
  // These logged "GSAP target .pillar-card not found" on every visit, which is
  // how a real warning gets missed later.
  const html = await source('community.html');
  for (const dead of ['pillar-card', 'pillars-grid', 'philosophy-item', 'philosophy-inner']) {
    assert.ok(!html.includes(dead), `community.html still references ${dead}`);
  }
});

test('the editorial stylesheet uses the site blue, never the retired amber', async () => {
  const css = await source('editorial.css');
  assert.ok(!/e8a800/i.test(css), 'editorial.css still carries the retired amber accent');
  assert.match(css, /--accent:\s*#4A90D9/i);
});

test('the mobile nav toggle exposes its state', async () => {
  for (const file of ['index.html', 'community.html', 'membership.html', 'thoughts.html']) {
    const html = await source(file);
    assert.match(html, /id="nav-hamburger"[^>]*aria-expanded="false"/, `${file}: no initial aria-expanded`);
    assert.match(html, /aria-controls="nav-mobile-menu"/, `${file}: toggle is not tied to its menu`);
    assert.match(html, /setAttribute\('aria-expanded'/, `${file}: state is never updated`);
  }
});

test('GSAP pages honour a reduced-motion preference', async () => {
  for (const file of ['community.html', 'membership.html', 'thoughts.html']) {
    const html = await source(file);
    assert.match(html, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/,
      `${file}: hero entrance ignores the OS motion setting`);
  }
});

test('one function serves all four public surfaces, dispatched by view', async () => {
  // Consolidated because the deployment is at its plan's twelve-function
  // ceiling: splitting these out builds locally and then fails the deploy.
  const handler = makeHandler({ storeFactory: fakeStore([EDITION]) });

  const page = fakeRes();
  await handler({ method: 'GET', query: { view: 'page', slug: '2026-09-10-ai' } }, page);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.body, /자동화된 AI 연구 인턴/);

  const sitemap = fakeRes();
  await handler({ method: 'GET', query: { view: 'sitemap' } }, sitemap);
  assert.match(sitemap.headers['content-type'], /application\/xml/);
  assert.match(sitemap.body, /<urlset/);

  const feed = fakeRes();
  await handler({ method: 'GET', query: { view: 'rss' } }, feed);
  assert.match(feed.headers['content-type'], /application\/rss\+xml/);
  assert.match(feed.body, /<rss version="2.0"/);

  // No view, or an unknown one, keeps the JSON the /desk index fetches.
  for (const query of [{}, { view: 'nonsense' }]) {
    const json = fakeRes();
    await handler({ method: 'GET', query }, json);
    assert.equal(json.statusCode, 200);
    assert.ok(Array.isArray(json.body?.articles), `expected the JSON list for ${JSON.stringify(query)}`);
  }
});

test('the sign-in screen says what the review asks before demanding an account', async () => {
  // Handing over a Google or Kakao account to find out what is being asked is a
  // poor trade for someone whose employer has an opinion about what they join.
  const join = await source('join.html');

  assert.match(join, /const APPLICATION_FIELDS = \[/, 'no pre-login summary of the application');
  assert.match(join, /<h3>심사에서 묻는 것<\/h3>/);

  // The preview must appear in the signed-out branch, ahead of the buttons.
  const signedOut = join.match(/function renderSignedOut\(\)[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(signedOut, 'renderSignedOut not found');
  const previewAt = signedOut.indexOf('applicationFieldsHtml()');
  const buttonsAt = signedOut.indexOf('signInButtonsHtml()');
  assert.ok(previewAt !== -1, 'the signed-out screen does not render the preview');
  assert.ok(previewAt < buttonsAt, 'the preview must come before the sign-in buttons');

  // Every field the onboarding form collects has to be listed, or the preview
  // becomes a half-truth as the form grows.
  for (const [field, id] of [
    ['표시 이름', 'display_name'], ['본명', 'real_name'], ['소속', 'affiliation'],
    ['경력 소개', 'career_summary'], ['운영자에게', 'note_to_admin'],
  ]) {
    assert.ok(join.includes(`id="${id}"`), `the form no longer collects ${id}`);
    assert.ok(join.includes(field), `the pre-login preview omits ${field}`);
  }
});

test('no page declares a language alternate that does not exist', async () => {
  // The pages are bilingual inline under lang="ko"; there is no /en route, so
  // an en_US alternate or an hreflang would point crawlers at nothing.
  for (const file of ['index.html', 'thoughts.html', 'community.html', 'membership.html', 'join.html']) {
    const html = await source(file);
    assert.doesNotMatch(html, /<meta property="og:locale:alternate"/,
      `${file}: declares an alternate locale with no page behind it`);
    assert.doesNotMatch(html, /<link[^>]+hreflang=/,
      `${file}: declares hreflang with no separate language URL`);
  }
});
