// Feed and sitemap builders.
//
// Pure string builders so they can be unit-tested without a network or a store.
// The serverless handlers in api/rss.js and api/sitemap.js supply the entries.

export const SITE = 'https://www.kkandfriends.com';

// Static surfaces worth indexing. Everything under robots.txt's Disallow list
// (/admin*, /me, /write, /voices, /members, /events) stays out on purpose, and
// so does /desk: KK Daily / Weekly are members-only since 2026-10-06.
export const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/thoughts', changefreq: 'daily', priority: '0.9' },
  { path: '/community', changefreq: 'monthly', priority: '0.8' },
  { path: '/membership', changefreq: 'monthly', priority: '0.8' },
];

const xmlEscape = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Strip control characters that are legal in JS strings but not in XML 1.0.
const clean = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+/g, ' ').trim();

// Same as clean() but keeps line breaks: an Instagram caption is laid out in lines.
const cleanLines = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
  .replace(/\n{3,}/g, '\n\n').trim();

const imageType = url => (/\.jpe?g$/i.test(url) ? 'image/jpeg' : 'image/png');

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
 * @param {{title: string, url: string, description?: string, date: string, section?: string|null, image?: string}[]} items
 */
export function buildRss(items, {
  now = new Date(),
  title = 'KK &amp; Friends — KK Original &amp; Daily Markets',
  selfPath = '/rss.xml',
} = {}) {
  const entries = items.map(i => {
    const link = abs(i.url);
    return [
      '    <item>',
      `      <title>${xmlEscape(clean(i.title))}</title>`,
      `      <link>${xmlEscape(link)}</link>`,
      `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
      `      <pubDate>${rfc822(i.date)}</pubDate>`,
      i.section ? `      <category>${xmlEscape(clean(i.section))}</category>` : '',
      `      <description>${xmlEscape(i.keepLines ? cleanLines(i.description) : clean(i.description))}</description>`,
      i.image ? `      <enclosure url="${xmlEscape(abs(i.image))}" type="${imageType(i.image)}" length="0"/>` : '',
      i.image ? `      <media:content url="${xmlEscape(abs(i.image))}" medium="image" type="${imageType(i.image)}"/>` : '',
      '    </item>',
    ].filter(Boolean).join('\n');
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${title}</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}${selfPath}" rel="self" type="application/rss+xml"/>
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

// ── LinkedIn share feed ─────────────────────────────────────────────────────
//
// Zapier ("RSS by Zapier" → "LinkedIn: Create Company Update") polls
// /linkedin.xml and posts each new item to the company page, one post per
// article (2026-10-06 KK decision). The feed does the editorial work so the
// Zap stays a plain field mapping:
//
// - Only items published at or after LINKEDIN_SINCE. Turning the Zap on must
//   never flood the page with the back catalogue.
// - The lounge (/voices) is members-only and never appears here.
// - Daily Markets (/markets) stay out too: two automated briefs a day would
//   bury the company page, and KK has not asked for them there.
// - Digital-asset items carry the disclosure CLAUDE.md requires on LinkedIn.
// - Each item names its thumbnail. LinkedIn's API does not read a page's
//   og:image the way its share box does, so a Zapier post without an image URL
//   goes out as bare text (2026-10-08 KK report). Map the item's enclosure /
//   media URL to the Zap's image field.

export const LINKEDIN_SINCE = '2026-10-06T00:00:00+09:00';
// Same 1200x630 card every page declares as og:image.
export const LINKEDIN_IMAGE = '/og-image.png';
export const DIGITAL_ASSET_DISCLOSURE = '필자는 디지털 자산 관련 상장사에 재직 중입니다.';

// Category alone misses some: the 2026-10-04 Original on corporate bitcoin
// treasuries is filed under Macro.
const DIGITAL_ASSET_WORDS = /비트코인|bitcoin|\bbtc\b|디지털\s*자산|digital assets?|가상\s*자산|암호\s*화폐|크립토|crypto|스테이블\s*코인|stablecoin|이더리움|ethereum|토큰화|tokeniz/i;

export function isDigitalAsset(item) {
  if (item.section === 'Digital Assets') return true;
  return DIGITAL_ASSET_WORDS.test(`${item.title ?? ''} ${item.description ?? ''}`);
}

// Some desk drafts kept the model's "제목:" / "요약:" labels in the field.
const stripLabel = s => String(s ?? '').trim().replace(/^(제목|요약)\s*[:：]\s*/, '');

const publishedAt = date => (/^\d{4}-\d{2}-\d{2}$/.test(String(date))
  ? new Date(`${date}T09:00:00+09:00`) : new Date(date));

export function linkedinItems(items, { since = LINKEDIN_SINCE } = {}) {
  const cutoff = new Date(since);
  return items
    .filter(i => !/^\/(voices|markets|desk)\b/.test(String(i.url)))
    .filter(i => publishedAt(i.date) >= cutoff)
    .map(i => {
      const title = stripLabel(i.title);
      const summary = stripLabel(i.description);
      const description = isDigitalAsset({ ...i, title, description: summary })
        ? `${summary} (${DIGITAL_ASSET_DISCLOSURE})`
        : summary;
      return { ...i, title, description, image: i.image || LINKEDIN_IMAGE };
    });
}

// ── Instagram share feed ────────────────────────────────────────────────────
//
// Zapier ("RSS by Zapier" → "Instagram for Business: Publish Photo") polls
// /instagram.xml (2026-10-09 KK decision). Same articles and cutoff as the
// LinkedIn feed, with two differences Instagram forces:
//
// - The image is the article's own 1080x1350 JPEG card (/card/<kind>/<slug>.jpg,
//   lib/ig-card.js). The API takes JPEG only, and one shared picture would
//   fill the grid with copies.
// - Caption links are not clickable, so the caption points to the profile link
//   instead of carrying a URL, keeps its line breaks, and ends with hashtags.

const SECTION_TAGS = {
  Macro: ['#거시경제', '#macro'],
  'Digital Assets': ['#디지털자산', '#비트코인'],
  Equity: ['#주식', '#equity'],
  Korea: ['#한국경제'],
  Global: ['#글로벌경제'],
  AI: ['#AI'],
};
const BASE_TAGS = ['#KKandFriends', '#금융인사이트'];

/** `/original/x` → `/card/original/x.jpg`; null for anything without a card. */
export function cardPath(url) {
  const m = /^\/(original|posts)\/([A-Za-z0-9_-]+)$/.exec(String(url));
  return m ? `/card/${m[1]}/${m[2]}.jpg` : null;
}

export function instagramCaption({ title, summary, section, disclosure }) {
  const tags = [...BASE_TAGS, ...(SECTION_TAGS[section] ?? [])];
  if (disclosure && !tags.includes('#디지털자산')) tags.push('#디지털자산');
  return [
    title,
    summary,
    disclosure ? `(${disclosure})` : '',
    '전문은 프로필 링크 kkandfriends.com 에서 읽을 수 있습니다.',
    tags.join(' '),
  ].filter(Boolean).join('\n\n');
}

export function instagramItems(items, { since = LINKEDIN_SINCE } = {}) {
  const cutoff = new Date(since);
  return items
    .filter(i => cardPath(i.url))
    .filter(i => publishedAt(i.date) >= cutoff)
    .map(i => {
      const title = stripLabel(i.title);
      const summary = stripLabel(i.description);
      const disclosure = isDigitalAsset({ ...i, title, description: summary }) ? DIGITAL_ASSET_DISCLOSURE : '';
      return {
        ...i,
        title,
        description: instagramCaption({ title, summary, section: i.section, disclosure }),
        keepLines: true,
        image: cardPath(i.url),
      };
    });
}
