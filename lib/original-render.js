import { renderMarkdown } from '../js/markdown.js';

export const ORIGINAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SITE = 'https://www.kkandfriends.com';

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function originalDate(row) {
  return String(row.published_at || row.updated_at || row.created_at || '').slice(0, 10);
}

export function publicOriginal(row, { includeBody = false } = {}) {
  const article = {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    series: 'KK Original',
    date: originalDate(row),
    publishedAt: row.published_at,
  };
  if (includeBody) article.body = row.body;
  return article;
}

function metaDescription(value, limit = 200) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function jsonLd(article, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: metaDescription(article.summary, 300),
    datePublished: article.publishedAt || article.date,
    dateModified: article.publishedAt || article.date,
    articleSection: article.category,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@type': 'CreativeWorkSeries', name: 'KK Original' },
    author: { '@type': 'Person', name: 'Kiseok Kim', alternateName: 'KK' },
    publisher: {
      '@type': 'Organization', name: 'KK & Friends', url: `${SITE}/`,
      logo: { '@type': 'ImageObject', url: `${SITE}/KK_and_FRIENDS.webp` },
    },
  }).replace(/</g, '\\u003c');
}

export function renderOriginalPage(article) {
  const url = `${SITE}/original/${article.slug}`;
  const description = metaDescription(article.summary);
  const body = renderMarkdown(article.body);
  const shownDate = article.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, year, month, day) => `${year}. ${Number(month)}. ${Number(day)}.`);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(article.title)} · KK &amp; Friends</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="Kiseok Kim, KK">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0A0E1A">
<link rel="alternate" type="application/rss+xml" title="KK &amp; Friends" href="/rss.xml">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="KK &amp; Friends">
<meta property="og:title" content="${esc(article.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="ko_KR">
<meta property="article:author" content="Kiseok Kim, KK">
<meta property="article:published_time" content="${esc(article.publishedAt || article.date)}">
<meta property="article:section" content="${esc(article.category)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(article.title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/og-image.png">
<link rel="stylesheet" href="/member.css">
<link rel="stylesheet" href="/typography.css">
<link rel="stylesheet" href="/brand.css">
<link rel="stylesheet" href="/site-footer.css">
<style>
body{background:#0A0E1A}.original-wrap{max-width:780px;margin:0 auto;padding:64px 24px 96px}.back{color:#9DB0C7;text-decoration:none}.eyebrow{margin-top:42px}.original-wrap h1{font-family:'Noto Serif KR',serif;font-size:clamp(34px,6vw,58px);line-height:1.25;margin:12px 0 20px}.dek{font-size:19px;line-height:1.75;color:#B9C6D6;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:28px}.byline{font-size:13px;color:#9DB0C7;margin:18px 0 42px}.rendered{font-size:18px;line-height:1.95;color:#D5DDE8;word-break:keep-all}.rendered h2,.rendered h3,.rendered h4{color:#F4F7FB;margin:2em 0 .7em}.rendered p{margin:0 0 1.35em}.rendered a{color:#79AEE8}.rendered strong{color:#FFF}.rendered blockquote{border-left:3px solid #4A90D9;padding-left:18px;color:#B9C6D6}.rendered img{max-width:100%;height:auto;margin:24px 0}.rendered code,.rendered pre{background:#111A29}.rendered pre{padding:16px;overflow:auto}.article-cta{margin-top:64px;padding:28px;border:1px solid rgba(255,255,255,.12);background:#101827}.disclaimer{font-size:13px;color:#8293A8;margin-top:32px}@media(max-width:640px){.original-wrap{padding-top:40px}.rendered{font-size:16.5px}}
</style>
<script type="application/ld+json">${jsonLd(article, url)}</script>
</head>
<body>
<nav class="site-nav" aria-label="주 메뉴"><a class="nav-logo" href="/"><img src="/KK_and_FRIENDS.webp" alt="KK &amp; Friends" width="52" height="52"><span class="nav-logo-text"><span class="nav-logo-kk">KK &amp; FRIENDS</span><span class="nav-logo-sub">Financial Intelligence</span></span></a><ul class="site-nav-links"><li><a href="/#about">ABOUT</a></li><li><a href="/community">COMMUNITY</a></li><li><a href="/membership">MEMBERSHIP</a></li><li><a href="/#kk">KK</a></li><li><a href="/thoughts" aria-current="page">THOUGHTS</a></li></ul><a class="site-nav-cta" href="/join">가입 신청</a><button class="site-nav-hamburger" type="button" aria-label="메뉴 열기" aria-expanded="false" data-site-nav-toggle><span></span><span></span><span></span></button></nav>
<div class="site-nav-mobile" data-site-nav-mobile><a href="/#about">ABOUT</a><a href="/community">COMMUNITY</a><a href="/membership">MEMBERSHIP</a><a href="/#kk">KK</a><a href="/thoughts">THOUGHTS</a><a class="site-nav-cta" href="/join">가입 신청</a></div>
<main class="original-wrap">
  <a class="back" href="/thoughts?series=KK%20Original">← KK Original</a>
  <p class="eyebrow">KK Original · ${esc(article.category)}</p>
  <h1>${esc(article.title)}</h1>
  <p class="dek">${esc(article.summary)}</p>
  <p class="byline">${esc(shownDate)} · By KK · Chief of KK &amp; Friends</p>
  <article class="rendered">${body}</article>
  <section class="article-cta"><h2>같이 읽고, 다르게 생각합니다.</h2><p>시장과 산업을 오래 본 사람들이 근거를 놓고 대화하는 곳, KK &amp; Friends입니다.</p><p><a class="btn" href="/join">가입 신청하기</a></p></section>
  <p class="disclaimer">공개정보에 기반한 시장 관점이며 투자 자문이나 특정 종목 추천이 아닙니다.</p>
</main>
<div id="kk-subscribe"></div>
<script type="module" src="/blog/subscribe.js"></script>
<script type="module" src="/js/site-nav.js"></script>
</body>
</html>`;
}

export function renderOriginalNotFound() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>글을 찾을 수 없습니다 · KK &amp; Friends</title><link rel="stylesheet" href="/member.css"></head><body><main><h1>글을 찾을 수 없습니다</h1><p>주소가 바뀌었거나 아직 발행되지 않은 글입니다.</p><p><a href="/thoughts?series=KK%20Original">← KK Original</a></p></main></body></html>`;
}

