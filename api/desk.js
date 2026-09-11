// One function, four public surfaces.
//
// They are bundled together rather than split into api/desk-page.js,
// api/sitemap.js and api/rss.js because the deployment sits at its plan's
// twelve-function ceiling: three more files build fine locally and then fail
// the deploy. vercel.json rewrites each path here with a `view` marker:
//
//   /api/desk          -> the JSON list the /desk index fetches (default)
//   /desk/<slug>       -> view=page     one edition, server-rendered
//   /sitemap.xml       -> view=sitemap  static pages + posts + editions
//   /rss.xml, /feed.xml-> view=rss      posts + editions in one feed
//
// Each view is exported separately so tests can drive it with a fake store.

import { createEditorialStore } from '../lib/editorial-store.js';
import { publicArticle } from '../research-lab/src/desk/core.js';
import { renderDeskPage, renderDeskNotFound, DESK_SLUG } from '../lib/desk-render.js';
import { buildRss, buildSitemap, STATIC_PAGES } from '../lib/feeds.js';
import { posts } from '../lib/post-index.js';

const PUBLISHED = 'editorial_drafts?status=eq.published';
const RSS_MAX_ITEMS = 50;

// ── /api/desk — the JSON the index page fetches ─────────────────────────────

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

// ── /desk/<slug> — one edition, server-rendered ─────────────────────────────

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

    let rows;
    try {
      rows = await storeFactory().request(
        `${PUBLISHED}&select=id,edition_date,payload,published_at&limit=1&id=eq.${encodeURIComponent(slug)}`,
      );
    } catch {
      // Never cache an outage as if it were a missing article.
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).send(renderDeskNotFound());
    }

    if (!rows?.length) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
      return res.status(404).send(renderDeskNotFound());
    }

    // An edition never changes once published, so it can sit in the CDN.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(renderDeskPage(publicArticle(rows[0])));
  };
}

// ── /sitemap.xml ────────────────────────────────────────────────────────────
//
// Was a hand-maintained static file that drifted: it listed no desk edition at
// all (the whole DAILY DESK / KK WEEKLY archive was invisible to search), had
// no <lastmod>, and was missing /join, /terms, /privacy and /desk.

export function makeSitemapHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const newestPost = posts[0]?.date;
    const entries = STATIC_PAGES.map(p => ({
      url: p.path,
      // The two archive pages change whenever anything publishes.
      lastmod: p.path === '/' || p.path === '/thoughts' ? newestPost : undefined,
      changefreq: p.changefreq,
      priority: p.priority,
    }));

    for (const post of posts) {
      entries.push({ url: post.url, lastmod: post.date, changefreq: 'yearly', priority: '0.8' });
    }

    // The desk store can be down. A sitemap missing today's edition is a far
    // smaller problem than a 503 that makes crawlers drop the whole file.
    let degraded = false;
    try {
      const rows = await storeFactory().request(
        `${PUBLISHED}&select=id,edition_date&order=edition_date.desc&limit=500`,
      );
      for (const row of rows) {
        entries.push({ url: `/desk/${row.id}`, lastmod: row.edition_date, changefreq: 'yearly', priority: '0.7' });
      }
    } catch {
      degraded = true;
    }

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

export function makeRssHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const items = posts.map(p => ({
      title: p.title, url: p.url, description: p.description, date: p.date, section: p.section,
    }));

    let degraded = false;
    try {
      const rows = await storeFactory().request(
        `${PUBLISHED}&select=id,edition_date,payload,published_at&order=edition_date.desc&limit=100`,
      );
      for (const row of rows) {
        const a = publicArticle(row);
        items.push({
          title: a.content.title,
          url: `/desk/${a.slug}`,
          description: a.content.summary,
          date: a.publishedAt || a.date,
          section: a.desk?.topic || a.desk?.series || null,
        });
      }
    } catch {
      // A feed reader that gets a 503 shows the subscriber nothing.
      degraded = true;
    }

    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', degraded
      ? 'public, max-age=0, s-maxage=120'
      : 'public, max-age=0, s-maxage=900');
    return res.status(200).send(buildRss(items.slice(0, RSS_MAX_ITEMS)));
  };
}

// ── dispatch ────────────────────────────────────────────────────────────────

export function makeHandler(options = {}) {
  const views = {
    page: makeDeskPageHandler(options),
    sitemap: makeSitemapHandler(options),
    rss: makeRssHandler(options),
  };
  const json = makePublicHandler(options);
  return function handler(req, res) {
    const view = req.query?.view;
    return (views[view] ?? json)(req, res);
  };
}

export default makeHandler();
