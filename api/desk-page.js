// /desk/<slug> — one desk edition, rendered server-side.
//
// vercel.json rewrites /desk/:slug here. The old client-rendered /desk?slug=…
// links that are already shared keep working: js/desk.js redirects them to the
// canonical path, so nothing that was posted in a chat room goes dead.

import { createEditorialStore } from '../lib/editorial-store.js';
import { publicArticle } from '../research-lab/src/desk/core.js';
import { renderDeskPage, renderDeskNotFound, DESK_SLUG } from '../lib/desk-render.js';

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
        `editorial_drafts?status=eq.published&select=id,edition_date,payload,published_at&limit=1&id=eq.${encodeURIComponent(slug)}`,
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

export default makeDeskPageHandler();
