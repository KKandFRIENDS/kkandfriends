// /sitemap.xml — static pages + the 34 committed posts + published desk editions.
//
// Was a hand-maintained static file that drifted: it listed no desk article at
// all (the whole DAILY DESK / KK WEEKLY archive was invisible to search), had
// no <lastmod>, and was missing /join, /terms, /privacy and /desk.
//
// The desk store can be down; a sitemap missing today's edition is a far
// smaller problem than a 503 that makes crawlers drop the whole file, so a
// store failure degrades to pages + posts rather than failing the request.

import { createEditorialStore } from '../lib/editorial-store.js';
import { buildSitemap, STATIC_PAGES } from '../lib/feeds.js';
import { posts } from '../lib/post-index.js';

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

    let deskCount = 0;
    try {
      const rows = await storeFactory().request(
        'editorial_drafts?status=eq.published&select=id,edition_date&order=edition_date.desc&limit=500',
      );
      for (const row of rows) {
        entries.push({
          url: `/desk/${row.id}`,
          lastmod: row.edition_date,
          changefreq: 'yearly',
          priority: '0.7',
        });
      }
      deskCount = rows.length;
    } catch {
      deskCount = -1; // signalled through Cache-Control below, never as a 5xx
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // A partial sitemap should expire quickly; a complete one can sit in the CDN.
    res.setHeader('Cache-Control', deskCount < 0
      ? 'public, max-age=0, s-maxage=120'
      : 'public, max-age=0, s-maxage=3600');
    return res.status(200).send(buildSitemap(entries));
  };
}

export default makeSitemapHandler();
