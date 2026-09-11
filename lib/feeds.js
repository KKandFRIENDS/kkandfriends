// Feed and sitemap builders.
//
// Pure string builders so they can be unit-tested without a network or a store.
// The serverless handlers in api/rss.js and api/sitemap.js supply the entries.

export const SITE = 'https://www.kkandfriends.com';

// Static surfaces worth indexing. Everything under robots.txt's Disallow list
// (/admin*, /me, /write, /voices, /members, /events) stays out on purpose.
export const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/thoughts', changefreq: 'daily', priority: '0.9' },
  { path: '/desk', changefreq: 'daily', priority: '0.9' },
  { path: '/community', changefreq: 'monthly', priority: '0.8' },
  { path: '/membership', changefreq: 'monthly', priority: '0.8' },
  { path: '/join', changefreq: 'monthly', priority: '0.7' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
];

const xmlEscape = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Strip control characters that are legal in JS strings but not in XML 1.0.
const clean = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+/g, ' ').trim();

const abs = path => (/^https?:\/\//.test(path) ? path : `${SITE}${path.startsWith('/') ? path : `/${path}`}`);

/**
 * @param {{url: string, lastmod?: string, changefreq?: string, priority?: string}[]} entries
 */
export function buildSitemap(entries) {
  const seen = new Set();
  const urls = [];
  for (const e of entries) {
    const loc = abs(e.url);
    if (seen.has(loc)) continue; // a desk slug and a post slug must never collide into a dupe
    seen.add(loc);
    urls.push([
      '  <url>',
      `<loc>${xmlEscape(loc)}</loc>`,
      e.lastmod ? `<lastmod>${xmlEscape(e.lastmod)}</lastmod>` : '',
      e.changefreq ? `<changefreq>${xmlEscape(e.changefreq)}</changefreq>` : '',
      e.priority ? `<priority>${xmlEscape(e.priority)}</priority>` : '',
      '</url>',
    ].join(''));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

const rfc822 = date => {
  // Feed dates must be RFC-822. Posts carry a date-only string; anchor those to
  // 09:00 KST, the hour KK publishes, so ordering inside a day stays stable.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? new Date(`${date}T09:00:00+09:00`) : new Date(date);
  return Number.isNaN(d.getTime()) ? new Date(0).toUTCString() : d.toUTCString();
};

/**
 * @param {{title: string, url: string, description?: string, date: string, section?: string|null}[]} items
 */
export function buildRss(items, { now = new Date() } = {}) {
  const entries = items.map(i => {
    const link = abs(i.url);
    return [
      '    <item>',
      `      <title>${xmlEscape(clean(i.title))}</title>`,
      `      <link>${xmlEscape(link)}</link>`,
      `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
      `      <pubDate>${rfc822(i.date)}</pubDate>`,
      i.section ? `      <category>${xmlEscape(clean(i.section))}</category>` : '',
      `      <description>${xmlEscape(clean(i.description))}</description>`,
      '    </item>',
    ].filter(Boolean).join('\n');
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>KK &amp; Friends — THOUGHTS &amp; Daily Desk</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>1996년부터 이어온 글로벌 금융 실무 경험에서 나온, 공개자료 기반 시장 관점. Public-information market perspectives from KK (Kiseok Kim).</description>
    <language>ko</language>
    <copyright>© ${now.getUTCFullYear()} KK &amp; Friends</copyright>
    <managingEditor>kim.kiseok.1969@gmail.com (Kiseok Kim)</managingEditor>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <ttl>60</ttl>
${entries.join('\n')}
  </channel>
</rss>
`;
}
