// Server-side renderer for one desk edition.
//
// Why this exists: desk articles used to live only at /desk?slug=… and were
// painted by js/desk.js after load. The HTML a crawler or a link unfurler got
// was a 1.1KB shell whose <title> always read "Daily Desk · KK & Friends" —
// no headline, no summary, no canonical. So every DAILY DESK and KK WEEKLY
// edition was invisible to search and previewed as a generic card when shared
// into KakaoTalk, LinkedIn or Slack. Now /desk/<slug> returns the finished
// article with its own metadata.
//
// Content reaching here is already validated upstream (validateContent rejects
// HTML tags and bare URLs in section text), but everything is escaped anyway —
// the renderer must not depend on a validator two modules away.

export const SITE = 'https://www.kkandfriends.com';
export const DESK_SLUG = /^\d{4}-\d{2}-\d{2}-(macro|markets|bitcoin|ai|signals|korea|weekly)$/;

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Mirrors the client's link() guard: only absolute https or site-root paths.
const safeHref = url => (/^https:\/\/[^\s"'<>]+$/.test(url) || /^\/(?!\/)[^\s"'<>]*$/.test(url) ? url : null);

const anchor = (label, url) => {
  const href = safeHref(url);
  return href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label);
};

/** Plain-text summary trimmed for meta description / og:description. */
export function metaDescription(article, limit = 200) {
  const s = String(article.content?.summary ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= limit ? s : `${s.slice(0, limit - 1).trimEnd()}…`;
}

function jsonLd(article, url) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.content.title,
    description: metaDescription(article, 300),
    datePublished: article.publishedAt || article.date,
    dateModified: article.publishedAt || article.date,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: article.desk?.topic || undefined,
    isPartOf: { '@type': 'CreativeWorkSeries', name: article.desk?.series || 'DAILY DESK' },
    author: { '@type': 'Person', name: 'Kiseok Kim', alternateName: 'KK' },
    publisher: {
      '@type': 'Organization',
      name: 'KK & Friends',
      url: `${SITE}/`,
      logo: { '@type': 'ImageObject', url: `${SITE}/KK_and_FRIENDS.webp` },
    },
    citation: (article.sources || []).map(s => ({
      '@type': 'CreativeWork',
      name: s.title,
      url: safeHref(s.url) || undefined,
    })),
  };
  // </script> can never appear — content is escaped — but be explicit about it.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function sectionsHtml(article) {
  return (article.content.sections || []).map(section => {
    const cites = (section.sourceIds || []).map(id => {
      const source = (article.sources || []).find(s => s.id === id);
      if (!source) return '';
      return `${anchor(`[${article.sources.indexOf(source) + 1}] ${source.title}`, source.url)} `;
    }).join('');
    return `<section>
      <h2>${esc(section.heading)}</h2>
      <p>${esc(section.text)}</p>
      ${cites ? `<p class="meta">${cites}</p>` : ''}
    </section>`;
  }).join('\n');
}

function relatedHtml(article) {
  if (!article.related?.length) return '';
  const links = article.related.map(r => `<p>${anchor(r.title, r.url)}</p>`).join('\n      ');
  return `<h2>관련 KK 글</h2>\n      ${links}`;
}

/** Full HTML document for one desk edition. */
export function renderDeskPage(article) {
  const url = `${SITE}/desk/${article.slug}`;
  const title = article.content.title;
  const description = metaDescription(article);
  const label = article.desk?.label ? `${article.desk.label} · ${article.date}` : article.date;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · KK &amp; Friends</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="Kiseok Kim, KK">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0A0E1A">
<link rel="alternate" type="application/rss+xml" title="KK &amp; Friends" href="/rss.xml">

<meta property="og:type" content="article">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="KK &amp; Friends">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ko_KR">
<meta property="article:author" content="Kiseok Kim, KK">
<meta property="article:published_time" content="${esc(article.publishedAt || article.date)}">
${article.desk?.topic ? `<meta property="article:section" content="${esc(article.desk.topic)}">` : ''}

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/og-image.png">

<link rel="stylesheet" href="/editorial.css">
<script type="application/ld+json">${jsonLd(article, url)}</script>
</head>
<body>
<header>
  <a href="/">KK <span>&amp;</span> FRIENDS</a>
  <nav><a href="/thoughts">THOUGHTS</a><a href="/desk">DAILY DESK</a></nav>
</header>
<main>
  <article class="article">
    <p><a href="/desk">← 전체 글</a></p>
    <p class="eyebrow">${esc(label)}</p>
    <h1>${esc(title)}</h1>
    <p class="meta">${esc(article.content.summary)}</p>
${sectionsHtml(article)}
    <p>By KK · Chief of KKandFriends</p>
    <p class="meta">공개 자료에 기반한 시장 관점이며 개별 투자 권유가 아닙니다.</p>
    ${relatedHtml(article)}
  </article>
</main>
</body>
</html>
`;
}

/** Minimal 404 body, styled like the rest of the desk. */
export function renderDeskNotFound() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>글을 찾을 수 없습니다 · KK &amp; Friends</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/editorial.css">
</head>
<body>
<header>
  <a href="/">KK <span>&amp;</span> FRIENDS</a>
  <nav><a href="/thoughts">THOUGHTS</a><a href="/desk">DAILY DESK</a></nav>
</header>
<main>
  <h1>글을 찾을 수 없습니다</h1>
  <p>주소가 바뀌었거나 아직 발행되지 않은 글입니다.</p>
  <p><a href="/desk">← DAILY DESK 전체 글</a></p>
</main>
</body>
</html>
`;
}
