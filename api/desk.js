import { createEditorialStore } from '../lib/editorial-store.js';
import { publicArticle } from '../research-lab/src/desk/core.js';
export function makePublicHandler({storeFactory = createEditorialStore} = {}) { return async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const slug = req.query?.slug;
    if (slug && !/^\d{4}-\d{2}-\d{2}-(macro|markets|bitcoin|ai|signals|korea|weekly)$/.test(slug)) return res.status(400).json({ error: 'Invalid slug' });
    const rows = await storeFactory().request(`editorial_drafts?status=eq.published&select=id,edition_date,payload,published_at&order=edition_date.desc&limit=100${slug ? `&id=eq.${slug}` : ''}`);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    if (slug && !rows.length) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ articles: rows.map(publicArticle) });
  } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: '콘텐츠를 불러오지 못했습니다.' }); }
}; }
export default makePublicHandler();
