// The plumbing that decides whether anything KK writes can be found or shared:
// canonical URLs, the generated sitemap and feed, and the server-rendered desk
// page. These are the failures nobody notices by looking at the site.

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { buildRss, buildSitemap, linkedinItems, instagramItems, cardPath, DIGITAL_ASSET_DISCLOSURE, STATIC_PAGES } from '../lib/feeds.js';
import { wrapText, CARD_WIDTH, CARD_HEIGHT } from '../lib/ig-card.js';
import { DESK_SLUG, renderDeskPage, metaDescription, displayDate } from '../lib/desk-render.js';
import { makeDeskPageHandler, makeMarketPageHandler, makeMarketsListHandler, makeSitemapHandler, makeRssHandler, makeLinkedinFeedHandler, makeInstagramFeedHandler, makeCardHandler, makeHandler } from '../api/desk.js';
import { renderMarketPage } from '../lib/markets-render.js';
import { posts } from '../lib/post-index.js';
import { publicArticle } from '../research-lab/src/desk/core.js';

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

// A Daily Markets brief, shaped like a row out of the VPS API's /api/v1/markets.
const BRIEF = {
  id: '11111111-2222-3333-4444-555555555555', slug: '2026-09-11-start', kind: 'global', date: '2026-09-11',
  title: '오늘의 시작 (9/11 금)', category: '시장/매크로', published_at: '2026-09-10T22:02:00.000Z',
  preview: '밤사이 금리가 움직였다 & 주식은 조용했다.\n\n## 숫자\n- **S&P 500** 6,234.11 (+0.82%) → 반등',
};
BRIEF.body = `${BRIEF.preview}\n\n> 본 자료는 정보 제공 목적이며`;

// `api` answers like the VPS API: the public markets list/item, and the
// members-only desk edition according to who `cookie` is.
const fakeApi = ({ editions = [], briefs = [BRIEF] } = {}) => async (path, { cookie } = {}) => {
  if (path.startsWith('/api/v1/markets/')) {
    const brief = briefs.find(b => path.endsWith(`/${b.slug}`));
    return brief ? { status: 200, data: { brief } } : { status: 404, data: null };
  }
  if (path.startsWith('/api/v1/markets')) return { status: 200, data: { briefs } };
  if (path.startsWith('/api/v1/desk/')) {
    if (cookie !== 'member') return { status: cookie ? 403 : 401, data: null };
    const edition = editions.find(e => path.endsWith(`/${e.id}`));
    return edition ? { status: 200, data: { edition } } : { status: 404, data: null };
  }
  return { status: 404, data: null };
};
const fakeStore = (rows, briefs = [BRIEF]) => () => ({ request: async () => rows, api: fakeApi({ editions: rows, briefs }) });
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

test('sitemap excludes pages that explicitly opt out of indexing', async () => {
  for (const path of ['/join', '/terms', '/privacy']) {
    assert.ok(!STATIC_PAGES.some(page => page.path === path), `${path} must not be submitted in the sitemap`);
    const html = await source(`${path.slice(1)}.html`);
    assert.match(html, /<meta name="robots" content="noindex, follow">/, `${path} no longer declares noindex`);
  }
});

test('sitemap discovery pages use the newest publication date across every series', async () => {
  const storeFactory = () => ({
    request: async () => [{ slug: '20260925-gdp-3-63-capex', published_at: '2026-09-25T01:55:43.000Z' }],
    api: fakeApi({ briefs: [{ ...BRIEF, slug: '2026-09-24-close', kind: 'korea_close', date: '2026-09-24' }] }),
  });
  const res = fakeRes();
  await makeSitemapHandler({ storeFactory })({ method: 'GET', query: {} }, res);
  assert.match(res.body, /<loc>https:\/\/www\.kkandfriends\.com\/<\/loc><lastmod>2026-09-25<\/lastmod>/);
  assert.match(res.body, /<loc>https:\/\/www\.kkandfriends\.com\/thoughts<\/loc><lastmod>2026-09-25<\/lastmod>/);
  assert.match(res.body, /<loc>https:\/\/www\.kkandfriends\.com\/original\/20260925-gdp-3-63-capex<\/loc>/);
});

test('/sitemap.xml lists Daily Markets and leaves out the members-only editions', async () => {
  const res = fakeRes();
  await makeSitemapHandler({ storeFactory: fakeStore([{ id: '2026-09-10-ai', edition_date: '2026-09-10' }]) })(
    { method: 'GET', query: {} }, res,
  );
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /application\/xml/);
  assert.match(res.body, /<loc>https:\/\/www\.kkandfriends\.com\/markets\/2026-09-11-start<\/loc>/);
  assert.doesNotMatch(res.body, /\/desk/, 'KK Daily / Weekly are members-only since 2026-10-06');
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

test('/rss.xml carries posts and Daily Markets, newest first, and no desk edition', async () => {
  const res = fakeRes();
  await makeRssHandler({ storeFactory: fakeStore([EDITION]) })({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /application\/rss\+xml/);
  const items = [...res.body.matchAll(/<link>([^<]+)<\/link>/g)].map(m => m[1]).slice(1);
  const brief = 'https://www.kkandfriends.com/markets/2026-09-11-start';
  const briefAt = items.indexOf(brief);
  assert.ok(briefAt >= 0, 'the brief should appear in the feed');
  const olderPost = items.findIndex(u => u.includes('/posts/20260905_'));
  assert.ok(olderPost > briefAt, 'the 2026-09-11 brief should precede the 2026-09-05 post');
  assert.ok(!items.some(u => u.includes('/desk/')), 'members-only editions stay out of the public feed');
  assert.match(res.body, /<title>오늘의 시작 \(9\/11 금\)<\/title>/);
  assert.ok(res.body.includes(posts[0].title.replace(/&/g, '&amp;')));
});

test('a desk-store outage still returns a readable feed', async () => {
  const res = fakeRes();
  await makeRssHandler({ storeFactory: brokenStore() })({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes(posts[0].url));
});

// ── LinkedIn share feed ─────────────────────────────────────────────────────

const routedStore = ({ originals = [], briefs = [] }) => () => ({
  request: async () => originals,
  api: fakeApi({ briefs }),
});

test('/linkedin.xml lists only Originals and posts published since the cutoff', async () => {
  const original = {
    slug: '20261006-kk-original-123456', title: '장부가 아니라 생존 장치다', summary: '기업이 비트코인을 담는 이유.',
    category: 'Macro', published_at: '2026-10-06T06:00:00.000Z', created_at: '2026-10-06T06:00:00.000Z',
  };
  const freshBrief = { ...BRIEF, slug: '2026-10-07-start', date: '2026-10-07', published_at: '2026-10-06T22:02:00.000Z' };
  const res = fakeRes();
  await makeLinkedinFeedHandler({ storeFactory: routedStore({ originals: [original], briefs: [freshBrief, BRIEF] }) })(
    { method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /application\/rss\+xml/);
  const links = [...res.body.matchAll(/<link>([^<]+)<\/link>/g)].map(m => m[1]).slice(1);
  assert.deepEqual(links, ['https://www.kkandfriends.com/original/20261006-kk-original-123456'],
    'post-cutoff Originals only — no back catalogue, no Daily Markets, no members-only edition');
  // Filed under Macro, but about bitcoin: the disclosure still applies.
  assert.ok(res.body.includes(`기업이 비트코인을 담는 이유. (${DIGITAL_ASSET_DISCLOSURE})`));
  assert.match(res.body, /<atom:link href="https:\/\/www\.kkandfriends\.com\/linkedin\.xml"/);
  // LinkedIn's API ignores og:image; the Zap needs the thumbnail URL from the item.
  assert.match(res.body, /<enclosure url="https:\/\/www\.kkandfriends\.com\/og-image\.png" type="image\/png"/);
  assert.match(res.body, /<media:content url="https:\/\/www\.kkandfriends\.com\/og-image\.png" medium="image"/);
  assert.match(res.body, /xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/);
});

test('/linkedin.xml fails on a store outage instead of serving a partial feed', async () => {
  // A posts-only feed followed by the full one would make Zapier repost editions.
  const res = fakeRes();
  await makeLinkedinFeedHandler({ storeFactory: brokenStore() })({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['cache-control'], 'no-store');
});

// ── Instagram share feed and cards ──────────────────────────────────────────

const IG_ORIGINAL = {
  slug: '20261007-ai-blackrock', title: 'AI는 비트코인 통장을 만들까', summary: '기업이 비트코인을 담는 이유.',
  category: 'Macro', published_at: '2026-10-06T22:05:44.000Z', created_at: '2026-10-06T22:05:44.000Z',
};

test('/instagram.xml points each new Original at its own JPEG card, caption keeps its lines', async () => {
  const freshBrief = { ...BRIEF, slug: '2026-10-07-start', date: '2026-10-07', published_at: '2026-10-06T22:02:00.000Z' };
  const res = fakeRes();
  await makeInstagramFeedHandler({ storeFactory: routedStore({ originals: [IG_ORIGINAL], briefs: [freshBrief] }) })(
    { method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  const links = [...res.body.matchAll(/<link>([^<]+)<\/link>/g)].map(m => m[1]).slice(1);
  assert.deepEqual(links, ['https://www.kkandfriends.com/original/20261007-ai-blackrock']);
  assert.match(res.body, /<enclosure url="https:\/\/www\.kkandfriends\.com\/card\/original\/20261007-ai-blackrock\.jpg" type="image\/jpeg"/);
  // Instagram captions are laid out in lines and carry no clickable link.
  assert.match(res.body, /기업이 비트코인을 담는 이유\.\n\n\(필자는 디지털 자산 관련 상장사에 재직 중입니다\.\)\n\n전문은 프로필 링크/);
  assert.match(res.body, /#KKandFriends/);
  assert.match(res.body, /<atom:link href="https:\/\/www\.kkandfriends\.com\/instagram\.xml"/);
});

test('/instagram.xml fails on a store outage instead of serving a partial feed', async () => {
  const res = fakeRes();
  await makeInstagramFeedHandler({ storeFactory: brokenStore() })({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 503);
});

test('only Originals and THOUGHTS posts get a card', () => {
  assert.equal(cardPath('/original/20261007-ai-blackrock'), '/card/original/20261007-ai-blackrock.jpg');
  assert.equal(cardPath('/posts/20260925_everything_will_be_a_token'), '/card/posts/20260925_everything_will_be_a_token.jpg');
  for (const url of ['/markets/2026-10-07-start', '/desk/2026-10-07-ai', '/voices?id=1', '/original/../x']) {
    assert.equal(cardPath(url), null, url);
  }
  assert.deepEqual(instagramItems([{ title: 't', url: '/markets/2026-10-07-start', description: 'd', date: '2026-10-07T00:00:00Z' }]), []);
});

test('the card endpoint renders a 1080x1350 JPEG for a published Original', async () => {
  const res = fakeRes();
  await makeCardHandler({ storeFactory: routedStore({ originals: [IG_ORIGINAL] }) })(
    { method: 'GET', query: { kind: 'original', slug: '20261007-ai-blackrock.jpg' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'image/jpeg');
  const jpg = res.body;
  assert.equal(jpg[0], 0xFF); assert.equal(jpg[1], 0xD8); // JPEG SOI: Instagram's API takes nothing else
  // SOF0 frame header carries height then width.
  const sof = jpg.indexOf(Buffer.from([0xFF, 0xC0]));
  assert.equal(jpg.readUInt16BE(sof + 5), CARD_HEIGHT);
  assert.equal(jpg.readUInt16BE(sof + 7), CARD_WIDTH);
});

test('the card endpoint 404s unknown articles and junk slugs', async () => {
  for (const query of [{ kind: 'original', slug: 'nope.jpg' }, { kind: 'markets', slug: 'x.jpg' }, { kind: 'original', slug: '../etc.jpg' }]) {
    const res = fakeRes();
    await makeCardHandler({ storeFactory: routedStore({ originals: [] }) })({ method: 'GET', query }, res);
    assert.equal(res.statusCode, 404, JSON.stringify(query));
  }
});

test('card titles wrap at spaces and end in an ellipsis past the line limit', () => {
  const lines = wrapText('하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열', 100, 400, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
  assert.ok(lines.every(l => !l.startsWith(' ')));
});

test('linkedin items never include the lounge, KK Daily / Weekly or Daily Markets', () => {
  const items = linkedinItems([
    { title: '라운지 글', url: '/voices/abc', description: 'x', date: '2026-10-07T00:00:00Z', section: null },
    { title: 'Daily', url: '/desk/2026-10-07-bitcoin', description: 'y', date: '2026-10-07T00:00:00Z', section: 'Digital Assets' },
    { title: '오늘의 시작', url: '/markets/2026-10-07-start', description: 'z', date: '2026-10-07T00:00:00Z', section: 'Global' },
    { title: '제목: 비트코인 원장', url: '/original/abc', description: '요약: 장부', date: '2026-10-07T00:00:00Z', section: 'Macro' },
  ]);
  assert.deepEqual(items.map(i => i.url), ['/original/abc']);
  assert.equal(items[0].title, '비트코인 원장');
  assert.ok(items[0].description.endsWith(`(${DIGITAL_ASSET_DISCLOSURE})`));
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
  assert.match(html, /<meta name="robots" content="noindex">/, 'members-only since 2026-10-06');
  assert.match(html, /<meta property="og:title" content="자동화된 AI 연구 인턴">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /"@type":"NewsArticle"/);
  assert.match(html, /실행 속도는 빨라졌지만/, 'the summary must be in the served HTML');
  assert.match(html, /판단이 병목이 됐다/, 'the body must be in the served HTML');
  // Ampersands from the body must not break the document.
  assert.match(html, /속도도 결국 품질을 바꾼다 &amp; 그 반대도 마찬가지다/);
  const withoutStructuredData = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  const executableScripts = withoutStructuredData.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
  assert.deepEqual(executableScripts, [
    '<script type="module" src="/blog/discussion.js"></script>',
    '<script type="module" src="/js/site-nav.js"></script>',
    '<script type="module" src="/js/original-edit-link.js"></script>',
  ], 'the rendered page should only carry the trusted discussion, shared-navigation and Chief edit-link modules');
  // Like, share and comments, keyed by the edition id (same widget as THOUGHTS and KK ORIGINAL).
  assert.match(html, /<div id="kk-discussion" data-post-slug="2026-09-10-ai"><\/div>/);
});

test('desk publication dates stay machine precise in metadata but human readable on screen', () => {
  const article = publicArticle({ ...EDITION, edition_date: '2026-09-10T00:00:00.000Z' });
  assert.equal(article.date, '2026-09-10');
  assert.equal(displayDate(article.date), '2026. 9. 10.');
  const html = renderDeskPage(article);
  assert.match(html, /AI THURSDAY · 2026\. 9\. 10\./);
  assert.doesNotMatch(html, /AI THURSDAY · 2026-09-10T00:00:00\.000Z/);
  assert.match(html, /article:published_time" content="2026-09-10T00:30:00\.000Z"/);
});

test('homepage latest rail merges Daily Markets and database-backed KK ORIGINAL posts', async () => {
  const home = await source('index.html');
  assert.match(home, /fetchJson\('\/api\/desk\?view=originals'\)/);
  assert.match(home, /fetchJson\('\/api\/desk\?view=markets'\)/);
  assert.match(home, /url:'\/original\/'\+encodeURIComponent\(article\.slug\)/);
  assert.match(home, /url:'\/markets\/'\+encodeURIComponent\(article\.slug\)/);
  assert.doesNotMatch(home, /url:'\/desk/, 'members-only editions are not on the public homepage');
});

test('meta descriptions stay short enough to survive a link preview', () => {
  const long = { content: { summary: 'x'.repeat(400) } };
  assert.equal(metaDescription(long).length, 200);
  assert.ok(metaDescription(long).endsWith('…'));
});

test('/desk/<slug> serves members only, 404s cleanly, and never caches', async () => {
  const run = async (store, slug, cookie) => {
    const res = fakeRes();
    await makeDeskPageHandler({ storeFactory: store })({ method: 'GET', query: { slug }, headers: cookie ? { cookie } : {} }, res);
    return res;
  };
  const ok = await run(fakeStore([EDITION]), '2026-09-10-ai', 'member');
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers['content-type'], /text\/html/);
  assert.match(ok.body, /자동화된 AI 연구 인턴/);
  assert.equal(ok.headers['cache-control'], 'private, no-store', 'a member page must never sit in the CDN');

  for (const [cookie, signedIn] of [[undefined, false], ['someone', true]]) {
    const gate = await run(fakeStore([EDITION]), '2026-09-10-ai', cookie);
    assert.equal(gate.statusCode, 403);
    assert.match(gate.body, /멤버 전용 글입니다/);
    assert.doesNotMatch(gate.body, /자동화된 AI 연구 인턴|판단이 병목이 됐다/, 'no edition text for non-members');
    assert.match(gate.body, /noindex/);
    assert.equal(/signInButtonsHtml/.test(gate.body), !signedIn);
    assert.equal(gate.headers['cache-control'], 'private, no-store');
  }

  const missing = await run(fakeStore([]), '2026-09-10-ai', 'member');
  assert.equal(missing.statusCode, 404);
  assert.match(missing.body, /noindex/);

  const bad = await run(fakeStore([EDITION]), 'not-a-slug', 'member');
  assert.equal(bad.statusCode, 404);

  const down = await run(brokenStore(), '2026-09-10-ai', 'member');
  assert.equal(down.statusCode, 503);
  assert.equal(down.headers['cache-control'], 'private, no-store',
    'an outage must not be cached as a missing article');
});

test('/markets/<slug> renders a public brief with its own metadata', async () => {
  const run = async (store, slug) => {
    const res = fakeRes();
    await makeMarketPageHandler({ storeFactory: store })({ method: 'GET', query: { slug } }, res);
    return res;
  };
  const ok = await run(fakeStore([]), '2026-09-11-start');
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers['cache-control'], /^public/);
  assert.match(ok.body, /<title>오늘의 시작 \(9\/11 금\) · Daily Markets · KK &amp; Friends<\/title>/);
  assert.match(ok.body, /<link rel="canonical" href="https:\/\/www\.kkandfriends\.com\/markets\/2026-09-11-start">/);
  assert.doesNotMatch(ok.body, /noindex/);
  assert.match(ok.body, /금리가 움직였다 &amp; 주식은 조용했다/, 'body escaped and served');
  // The thread is the lounge post's own, so earlier comments carry over.
  assert.match(ok.body, /data-post-slug="member:11111111-2222-3333-4444-555555555555"/);
  assert.equal((await run(fakeStore([]), '2026-09-11-close')).statusCode, 404);
  assert.equal((await run(fakeStore([]), '../etc')).statusCode, 404);
  const down = await run(brokenStore(), '2026-09-11-start');
  assert.equal(down.statusCode, 503);
  assert.equal(down.headers['cache-control'], 'no-store');

  const list = fakeRes();
  await makeMarketsListHandler({ storeFactory: fakeStore([]) })({ method: 'GET', query: {} }, list);
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.body.articles.map(a => [a.slug, a.label, a.category]), [['2026-09-11-start', '오늘의 시작', 'Global']]);
  assert.ok(list.body.articles[0].summary.startsWith('밤사이 금리가 움직였다'));
  assert.ok(renderMarketPage(BRIEF).includes('← Daily Markets'));
});

test('the old /desk index forwards to the lounge and keeps legacy ?slug= links', async () => {
  const js = await source('js/desk.js');
  assert.match(js, /\/desk\/\$\{encodeURIComponent\(slug\)\}/, 'already-shared ?slug= links must be redirected, not broken');
  assert.match(js, /'\/voices\?tab=desk'/);
});

test('routing and robots agree about the feed and sitemap', async () => {
  const vercel = JSON.parse(await source('vercel.json'));
  const rewrites = Object.fromEntries(vercel.rewrites.map(r => [r.source, r.destination]));
  // All four public surfaces share one function: the deployment sits at its
  // plan's twelve-function ceiling, so extra api/ files fail the deploy.
  assert.equal(rewrites['/sitemap.xml'], '/api/desk?view=sitemap');
  assert.equal(rewrites['/rss.xml'], '/api/desk?view=rss');
  assert.equal(rewrites['/feed.xml'], '/api/desk?view=rss');
  assert.equal(rewrites['/linkedin.xml'], '/api/desk?view=linkedin');
  assert.equal(rewrites['/instagram.xml'], '/api/desk?view=instagram');
  assert.equal(rewrites['/card/:kind/:slug'], '/api/desk?view=card&kind=:kind&slug=:slug');
  assert.equal(rewrites['/desk/:slug'], '/api/desk?view=page&slug=:slug');
  assert.equal(rewrites['/original/:slug'], '/api/desk?view=original&slug=:slug');
  assert.equal(rewrites['/markets/:slug'], '/api/desk?view=market&slug=:slug');
  const functions = (await readdir(path.join(ROOT, 'api'), { recursive: true, withFileTypes: true }))
    .filter(e => e.isFile() && e.name.endsWith('.js')).length;
  assert.ok(functions <= 12, `${functions} serverless functions exceeds the deployable ceiling of 12`);

  // A static file would shadow the rewrite: Vercel only rewrites on a miss.
  await assert.rejects(() => source('sitemap.xml'), 'a static sitemap.xml would shadow /api/sitemap');

  const robots = await source('robots.txt');
  // Crawlable on purpose: already-indexed editions must be fetched to see
  // their 403 / noindex and drop out of search.
  assert.ok(!/Disallow: \/desk/.test(robots), 'the desk pages must stay crawlable');
  assert.ok(!/Disallow: \/markets/.test(robots), 'Daily Markets is public');

  for (const file of ['index.html', 'thoughts.html']) {
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
  await handler({ method: 'GET', query: { view: 'page', slug: '2026-09-10-ai' }, headers: { cookie: 'member' } }, page);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.body, /자동화된 AI 연구 인턴/);

  const market = fakeRes();
  await handler({ method: 'GET', query: { view: 'market', slug: '2026-09-11-start' } }, market);
  assert.match(market.body, /오늘의 시작 \(9\/11 금\)/);

  const sitemap = fakeRes();
  await handler({ method: 'GET', query: { view: 'sitemap' } }, sitemap);
  assert.match(sitemap.headers['content-type'], /application\/xml/);
  assert.match(sitemap.body, /<urlset/);

  const feed = fakeRes();
  await handler({ method: 'GET', query: { view: 'rss' } }, feed);
  assert.match(feed.headers['content-type'], /application\/rss\+xml/);
  assert.match(feed.body, /<rss version="2.0"/);

  // No view, or an unknown one: the public KK Daily / Weekly list is gone.
  for (const query of [{}, { view: 'nonsense' }]) {
    const json = fakeRes();
    await handler({ method: 'GET', query }, json);
    assert.equal(json.statusCode, 410);
    assert.equal(json.body?.articles, undefined, `no edition list for ${JSON.stringify(query)}`);
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
