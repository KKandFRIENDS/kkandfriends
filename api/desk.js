// One function, several public surfaces.
//
// They are bundled together rather than split into api/desk-page.js,
// api/sitemap.js and api/rss.js because the deployment sits at its plan's
// twelve-function ceiling: three more files build fine locally and then fail
// the deploy. vercel.json rewrites each path here with a `view` marker:
//
//   /api/desk          -> 410: the public KK Daily/Weekly list is gone (below)
//   /desk/<slug>       -> view=page     one edition, members only
//   /markets/<slug>    -> view=market   one Daily Markets brief, public
//   /api/desk?view=markets              the Daily Markets list (JSON)
//   /sitemap.xml       -> view=sitemap  static pages + posts + Originals + briefs
//   /rss.xml, /feed.xml-> view=rss      the same, in one feed
//   /linkedin.xml      -> view=linkedin new items only, for the Zapier share
//
// 2026-10-06 (KK decision): KK Daily / KK Weekly moved into the members-only
// lounge, and the lounge's automated briefs came out as the public Daily
// Markets. Editions now leave the sitemap, RSS and LinkedIn feeds, and
// /desk/<slug> asks the VPS API, with the reader's own cookie, whether they
// may read it. The briefs come from the API's public /api/v1/markets.
//
// Each view is exported separately so tests can drive it with a fake store.

import { createEditorialStore } from '../lib/editorial-store.js';
import { publicArticle } from '../research-lab/src/desk/core.js';
import { renderDeskPage, renderDeskNotFound, renderDeskMembersOnly, DESK_SLUG } from '../lib/desk-render.js';
import { MARKET_SLUG, publicBrief, renderMarketPage, renderMarketNotFound } from '../lib/markets-render.js';
import {
  ORIGINAL_SLUG, publicOriginal, renderOriginalPage, renderOriginalNotFound,
} from '../lib/original-render.js';
import { buildRss, buildSitemap, linkedinItems, STATIC_PAGES } from '../lib/feeds.js';
import { posts } from '../lib/post-index.js';

const PUBLISHED = 'editorial_drafts?status=eq.published';
const ORIGINALS = 'kk_original_posts?status=eq.published';
const RSS_MAX_ITEMS = 50;

// ── the old public KK Daily / Weekly list ───────────────────────────────────
// No longer routed (see goneHandler). Kept for research-lab/test/preview-desk.mjs.

export function makePublicHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const slug = req.query?.slug;
      if (slug && !DESK_SLUG.test(slug)) return res.status(400).json({ error: 'Invalid slug' });
      const rows = await storeFactory().request(`${PUBLISHED}&select=id,edition_date,payload,published_at&order=edition_date.desc&limit=100${slug ? `&id=eq.${slug}` : ''}`);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      if (slug && !rows.length) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ articles: rows.map(publicArticle) });
    } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: '콘텐츠를 불러오지 못했습니다.' }); }
  };
}

// ── /desk/<slug> — one edition, members only ────────────────────────────────

export function makeDeskPageHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const slug = String(req.query?.slug ?? '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!DESK_SLUG.test(slug)) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
      return res.status(404).send(renderDeskNotFound());
    }

    // The answer depends on who is asking, so nothing here may sit in the CDN.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    let reply;
    try {
      reply = await storeFactory().api(`/api/v1/desk/${encodeURIComponent(slug)}`, { cookie: req.headers?.cookie });
    } catch {
      return res.status(503).send(renderDeskNotFound());
    }
    if (reply.status === 401 || reply.status === 403) {
      return res.status(403).send(renderDeskMembersOnly({ signedIn: reply.status === 403 }));
    }
    if (reply.status === 404) return res.status(404).send(renderDeskNotFound());
    if (reply.status !== 200 || !reply.data?.edition) return res.status(503).send(renderDeskNotFound());
    return res.status(200).send(renderDeskPage(publicArticle(reply.data.edition)));
  };
}

// ── Daily Markets — the public briefs ───────────────────────────────────────

async function marketBriefs(store, limit = 100) {
  const reply = await store.api(`/api/v1/markets?limit=${limit}`);
  if (reply.status !== 200 || !Array.isArray(reply.data?.briefs)) throw new Error(`markets HTTP ${reply.status}`);
  return reply.data.briefs.filter(row => MARKET_SLUG.test(String(row.slug || '')));
}

export function makeMarketsListHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const briefs = await marketBriefs(storeFactory());
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      return res.status(200).json({ articles: briefs.map(publicBrief) });
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'Daily Markets 목록을 불러오지 못했습니다.' });
    }
  };
}

export function makeMarketPageHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
    const slug = String(req.query?.slug ?? '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!MARKET_SLUG.test(slug)) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
      return res.status(404).send(renderMarketNotFound());
    }
    let reply;
    try {
      reply = await storeFactory().api(`/api/v1/markets/${encodeURIComponent(slug)}`);
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).send(renderMarketNotFound());
    }
    if (reply.status === 404) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
      return res.status(404).send(renderMarketNotFound());
    }
    if (reply.status !== 200 || !reply.data?.brief) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).send(renderMarketNotFound());
    }
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
    return res.status(200).send(renderMarketPage(reply.data.brief));
  };
}

// ── owner-written KK ORIGINAL posts ─────────────────────────────────────────

export function makeOriginalListHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
      const rows = await storeFactory().request(
        `${ORIGINALS}&select=slug,title,summary,category,published_at,updated_at,created_at&order=published_at.desc&limit=100`,
      );
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      return res.status(200).json({ articles: rows.map(row => publicOriginal(row)) });
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'KK ORIGINAL 목록을 불러오지 못했습니다.' });
    }
  };
}

export function makeOriginalPageHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
    const slug = String(req.query?.slug ?? '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!ORIGINAL_SLUG.test(slug)) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
      return res.status(404).send(renderOriginalNotFound());
    }
    let rows;
    try {
      rows = await storeFactory().request(
        `${ORIGINALS}&select=slug,title,summary,body,category,published_at,updated_at,created_at&limit=1&slug=eq.${encodeURIComponent(slug)}`,
      );
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).send(renderOriginalNotFound());
    }
    if (!rows?.length) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
      return res.status(404).send(renderOriginalNotFound());
    }
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
    return res.status(200).send(renderOriginalPage(publicOriginal(rows[0], { includeBody: true })));
  };
}

// ── /sitemap.xml ────────────────────────────────────────────────────────────
//
// Was a hand-maintained static file that drifted and had no <lastmod>. Only
// indexable canonical pages belong here; noindex legal and application pages,
// and the members-only KK Daily / Weekly editions, are intentionally excluded.

export function makeSitemapHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    let newestContentDate = posts[0]?.date;
    const entries = [];

    for (const post of posts) {
      entries.push({ url: post.url, lastmod: post.date, changefreq: 'yearly', priority: '0.8' });
    }

    // The store or the API can be down. A sitemap missing today's edition is a far
    // smaller problem than a 503 that makes crawlers drop the whole file.
    let degraded = false;
    try {
      const store = storeFactory();
      for (const row of await marketBriefs(store, 500)) {
        const date = String(row.date || '').slice(0, 10);
        entries.push({ url: `/markets/${row.slug}`, lastmod: date, changefreq: 'yearly', priority: '0.6' });
        if (date && (!newestContentDate || date > newestContentDate)) newestContentDate = date;
      }
      const originals = await store.request(
        `${ORIGINALS}&select=slug,published_at,updated_at,created_at&order=published_at.desc&limit=500`,
      );
      for (const row of originals) {
        if (!ORIGINAL_SLUG.test(String(row.slug || ''))) continue;
        const date = String(row.published_at || row.updated_at || row.created_at).slice(0, 10);
        entries.push({ url: `/original/${row.slug}`, lastmod: date, changefreq: 'yearly', priority: '0.8' });
        if (date && (!newestContentDate || date > newestContentDate)) newestContentDate = date;
      }
    } catch {
      degraded = true;
    }

    entries.unshift(...STATIC_PAGES.map(p => ({
      url: p.path,
      // The two discovery surfaces change whenever any series publishes.
      lastmod: p.path === '/' || p.path === '/thoughts' ? newestContentDate : undefined,
      changefreq: p.changefreq,
      priority: p.priority,
    })));

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // A partial sitemap should expire quickly; a complete one can sit in the CDN.
    res.setHeader('Cache-Control', degraded
      ? 'public, max-age=0, s-maxage=120'
      : 'public, max-age=0, s-maxage=3600');
    return res.status(200).send(buildSitemap(entries));
  };
}

// ── /rss.xml, /feed.xml ─────────────────────────────────────────────────────
//
// The site had no feed at all (both were 404), an odd gap for an audience that
// reads research for a living. One combined feed, newest first.

// Every public item (THOUGHTS posts, Daily Markets briefs, published Originals).
// `degraded` is true when the store could not be read and only posts remain.
async function feedItems(storeFactory) {
  const items = posts.map(p => ({
    title: p.title, url: p.url, description: p.description, date: p.date, section: p.section,
  }));

  let degraded = false;
  try {
    const store = storeFactory();
    for (const row of await marketBriefs(store)) {
      const brief = publicBrief(row);
      items.push({
        title: brief.title, url: `/markets/${brief.slug}`, description: brief.summary,
        date: brief.publishedAt || brief.date, section: brief.category, series: 'Daily Markets',
      });
    }
    const originals = await store.request(
      `${ORIGINALS}&select=slug,title,summary,category,published_at,updated_at,created_at&order=published_at.desc&limit=100`,
    );
    for (const row of originals) {
      if (!ORIGINAL_SLUG.test(String(row.slug || ''))) continue;
      const article = publicOriginal(row);
      items.push({ title: article.title, url: `/original/${article.slug}`, description: article.summary, date: article.publishedAt || article.date, section: article.category });
    }
  } catch {
    // A feed reader that gets a 503 shows the subscriber nothing.
    degraded = true;
  }
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { items, degraded };
}

export function makeRssHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { items, degraded } = await feedItems(storeFactory);

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', degraded
      ? 'public, max-age=0, s-maxage=120'
      : 'public, max-age=0, s-maxage=900');
    return res.status(200).send(buildRss(items.slice(0, RSS_MAX_ITEMS)));
  };
}

// ── /linkedin.xml ───────────────────────────────────────────────────────────
//
// Unlike /rss.xml this one fails instead of degrading. RSS by Zapier remembers
// which links it has seen; a posts-only feed during a store outage followed by
// the full one would make every edition look new and post it again.

export function makeLinkedinFeedHandler({ storeFactory = createEditorialStore, now = () => new Date() } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const { items, degraded } = await feedItems(storeFactory);
    if (degraded) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: '콘텐츠를 불러오지 못했습니다.' });
    }
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).send(buildRss(linkedinItems(items).slice(0, RSS_MAX_ITEMS), {
      now: now(), title: 'KK &amp; Friends — LinkedIn share feed', selfPath: '/linkedin.xml',
    }));
  };
}

// ── dispatch ────────────────────────────────────────────────────────────────

// /api/desk used to hand anyone the full KK Daily / Weekly list. Those are
// members-only now; the lounge reads them from the VPS API instead.
function goneHandler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  return res.status(410).json({ error: 'KK Daily·Weekly는 라운지(멤버 전용)로 옮겼습니다.' });
}

export function makeHandler(options = {}) {
  const views = {
    page: makeDeskPageHandler(options),
    market: makeMarketPageHandler(options),
    markets: makeMarketsListHandler(options),
    original: makeOriginalPageHandler(options),
    originals: makeOriginalListHandler(options),
    sitemap: makeSitemapHandler(options),
    rss: makeRssHandler(options),
    linkedin: makeLinkedinFeedHandler(options),
  };
  return function handler(req, res) {
    const view = req.query?.view;
    return (views[view] ?? goneHandler)(req, res);
  };
}

export default makeHandler();
