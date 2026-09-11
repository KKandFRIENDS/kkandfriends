// /rss.xml — THOUGHTS posts and published desk editions in one feed.
//
// The site had no feed at all (/rss.xml and /feed.xml were both 404), which is
// an odd gap for an audience that reads research for a living. One combined
// feed, newest first, so a subscriber sees the daily desk and the long-form
// essays in the same reader.
//
// As with the sitemap, a desk-store failure degrades to posts-only rather than
// erroring: a feed reader that gets a 503 shows the subscriber nothing.

import { createEditorialStore } from '../lib/editorial-store.js';
import { publicArticle } from '../research-lab/src/desk/core.js';
import { buildRss } from '../lib/feeds.js';
import { posts } from '../lib/post-index.js';

const MAX_ITEMS = 50;

export function makeRssHandler({ storeFactory = createEditorialStore } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const items = posts.map(p => ({
      title: p.title,
      url: p.url,
      description: p.description,
      date: p.date,
      section: p.section,
    }));

    let degraded = false;
    try {
      const rows = await storeFactory().request(
        'editorial_drafts?status=eq.published&select=id,edition_date,payload,published_at&order=edition_date.desc&limit=100',
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
      degraded = true;
    }

    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', degraded
      ? 'public, max-age=0, s-maxage=120'
      : 'public, max-age=0, s-maxage=900');
    return res.status(200).send(buildRss(items.slice(0, MAX_ITEMS)));
  };
}

export default makeRssHandler();
