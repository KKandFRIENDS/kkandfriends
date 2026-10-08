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
// 2026-10-06: editions are members-only (they live in the lounge now). The
// page still carries its own title for the members who share it among
// themselves, but it is noindex and served only after the API's member check
// (api/desk.js). Readers without access get renderDeskMembersOnly().
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

export function displayDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}. ${Number(match[2])}. ${Number(match[3])}.` : String(value ?? '');
}

const displaySeries = value => value === 'DAILY DESK' ? 'KK Daily' : value === 'KK WEEKLY' ? 'KK Weekly' : value;

const publicNav = `<nav class="site-nav" aria-label="주 메뉴">
  <a class="nav-logo" href="/"><img src="/KK_and_FRIENDS.webp" alt="KK &amp; Friends" width="52" height="52"><span class="nav-logo-text"><span class="nav-logo-kk">KK &amp; FRIENDS</span><span class="nav-logo-sub">Financial Intelligence</span></span></a>
  <ul class="site-nav-links"><li><a href="/#about">ABOUT</a></li><li><a href="/community">COMMUNITY</a></li><li><a href="/membership">MEMBERSHIP</a></li><li><a href="/#kk">KK</a></li><li><a href="/thoughts" aria-current="page">THOUGHTS</a></li></ul>
  <a class="site-nav-cta" href="/join">가입 신청</a><button class="site-nav-hamburger" type="button" aria-label="메뉴 열기" aria-expanded="false" data-site-nav-toggle><span></span><span></span><span></span></button>
</nav><div class="site-nav-mobile" data-site-nav-mobile><a href="/#about">ABOUT</a><a href="/community">COMMUNITY</a><a href="/membership">MEMBERSHIP</a><a href="/#kk">KK</a><a href="/thoughts">THOUGHTS</a><a class="site-nav-cta" href="/join">가입 신청</a></div>`;

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
    isPartOf: { '@type': 'CreativeWorkSeries', name: displaySeries(article.desk?.series || 'DAILY DESK') },
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
    // Free-format drafts written by the Chief carry one untitled section:
    // no heading, paragraphs split on blank lines, links listed as 출처.
    if (!section.heading) {
      const paragraphs = String(section.text ?? '').split(/\n{2,}/).filter(p => p.trim())
        .map(p => `<p>${esc(p.trim())}</p>`).join('\n      ');
      return `<section>
      ${paragraphs}
      ${cites ? `<p class="meta">출처 · ${cites}</p>` : ''}
    </section>`;
    }
    return `<section>
      <h2>${esc(section.heading)}</h2>
      <p>${esc(section.text)}</p>
      ${cites ? `<p class="meta">${cites}</p>` : ''}
    </section>`;
  }).join('\n');
}

// Files the Chief attached on /write-desk (content.attachments). Only
// https upload links survive safeHref; names and sizes are escaped.
function attachmentsHtml(article) {
  const files = (article.content?.attachments || []).filter(file => file && safeHref(file.url));
  if (!files.length) return '';
  const size = bytes => !bytes ? '' : bytes >= 1048576 ? ` (${(bytes / 1048576).toFixed(1)}MB)` : ` (${Math.max(1, Math.round(bytes / 1024))}KB)`;
  const links = files.map(file => `<p>📎 ${anchor(`${file.name}${size(Number(file.size))}`, file.url)}</p>`).join('\n      ');
  return `<h2>첨부 파일</h2>\n      ${links}`;
}

function relatedHtml(article) {
  if (!article.related?.length) return '';
  const links = article.related.map(r => `<p>${anchor(r.title, r.url)}</p>`).join('\n      ');
  const heading = article.content?.format === 'free' && article.desk?.id === 'weekly' ? '이번 주 Daily' : '관련 KK 글';
  return `<h2>${heading}</h2>\n      ${links}`;
}

/** Full HTML document for one desk edition. */
export function renderDeskPage(article) {
  const url = `${SITE}/desk/${article.slug}`;
  const title = article.content.title;
  const description = metaDescription(article);
  const shownDate = displayDate(article.date);
  const label = article.desk?.label ? `${article.desk.label} · ${shownDate}` : shownDate;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · KK &amp; Friends</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="Kiseok Kim, KK">
<meta name="robots" content="noindex">
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
<link rel="stylesheet" href="/typography.css">
<link rel="stylesheet" href="/brand.css">
<script type="application/ld+json">${jsonLd(article, url)}</script>
</head>
<body>
${publicNav}
<main>
  <article class="article">
    <p><a href="/voices?tab=desk">← 라운지 · KK Daily · KK Weekly</a><span class="edit-slot" data-desk-edit="${esc(article.slug)}"></span></p>
    <p class="eyebrow">${esc(label)}</p>
    <h1>${esc(title)}</h1>
    <p class="meta">${esc(article.content.summary)}</p>
${sectionsHtml(article)}
    <p>By KK · Chief of KK &amp; Friends</p>
    <p class="meta">공개 자료에 기반한 시장 관점이며 개별 투자 권유가 아닙니다.</p>
    ${attachmentsHtml(article)}
    ${relatedHtml(article)}
  </article>
</main>
<div id="kk-discussion" data-post-slug="${esc(article.slug)}"></div>
<script type="module" src="/blog/discussion.js"></script>
<script type="module" src="/js/site-nav.js"></script>
<script type="module" src="/js/original-edit-link.js"></script>
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
<link rel="stylesheet" href="/typography.css">
<link rel="stylesheet" href="/brand.css">
</head>
<body>
${publicNav}
<main>
  <h1>글을 찾을 수 없습니다</h1>
  <p>주소가 바뀌었거나 아직 발행되지 않은 글입니다.</p>
  <p><a href="/voices?tab=desk">← 라운지 · KK Daily · KK Weekly</a></p>
</main>
<script type="module" src="/js/site-nav.js"></script>
</body>
</html>
`;
}

/** Shown instead of the edition to anyone the API did not let in. */
export function renderDeskMembersOnly({ signedIn = false } = {}) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>멤버 전용 글 · KK &amp; Friends</title>
<meta name="robots" content="noindex">
<meta property="og:title" content="KK &amp; Friends · 멤버 전용 글">
<meta property="og:description" content="KK Daily · KK Weekly는 승인된 멤버의 라운지에서 읽을 수 있습니다.">
<meta property="og:image" content="${SITE}/og-image.png">
<link rel="stylesheet" href="/editorial.css">
<link rel="stylesheet" href="/typography.css">
<link rel="stylesheet" href="/brand.css">
<style>#signin{display:grid;gap:10px;max-width:320px;margin:18px 0}#signin .btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:#fff;color:#111;font-size:15px;cursor:pointer}#signin svg{width:18px;height:18px}</style>
</head>
<body>
${publicNav}
<main>
  <h1>멤버 전용 글입니다</h1>
  <p>KK Daily · KK Weekly는 승인된 멤버의 라운지에서 읽을 수 있습니다.</p>
  ${signedIn
    ? '<p>아직 승인 전이거나 멤버가 아닌 계정입니다. 승인되면 이 주소에서 바로 열립니다.</p><p><a href="/join">가입 신청 →</a></p>'
    : '<p>멤버라면 로그인하면 이 글이 바로 열립니다.</p><div id="signin"></div><p><a href="/join">가입 신청 →</a></p>'}
  <p><a href="/thoughts">← 공개 글 (KK Original · Daily Markets)</a></p>
</main>
${signedIn ? '' : `<script type="module">
import { signInButtonsHtml, wireSignIn } from '/js/auth-vps.js';
const slot = document.getElementById('signin');
slot.innerHTML = signInButtonsHtml();
wireSignIn(slot, location.href);
</script>`}
<script type="module" src="/js/site-nav.js"></script>
</body>
</html>
`;
}
