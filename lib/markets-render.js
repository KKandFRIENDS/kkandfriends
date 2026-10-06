// Daily Markets: the 07:00 "오늘의 시작" and 17:30 "오늘의 마감" briefs,
// public since 2026-10-06 (they used to sit in the members-only lounge).
// /markets/<date>-start|close is rendered here from the VPS API's public
// /api/v1/markets/<slug>.
import { renderMarkdown, excerpt } from '../js/markdown.js';

export const SITE = 'https://www.kkandfriends.com';
export const MARKET_SLUG = /^\d{4}-\d{2}-\d{2}-(start|close)$/;
export const MARKET_LABEL = { global: '오늘의 시작', korea_close: '오늘의 마감' };
// The THOUGHTS filter buttons these cards fall under.
export const MARKET_CATEGORY = { global: 'Global', korea_close: 'Korea' };

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const shortDate = value => String(value ?? '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, (_, y, m, d) => `${y}. ${Number(m)}. ${Number(d)}.`);

/** List/feed shape for one brief row from the VPS API. */
export function publicBrief(row) {
  return {
    slug: row.slug,
    kind: row.kind,
    label: MARKET_LABEL[row.kind] || 'Daily Markets',
    category: MARKET_CATEGORY[row.kind] || 'Global',
    date: String(row.date || '').slice(0, 10),
    publishedAt: row.published_at,
    title: row.title,
    summary: excerpt(row.body ?? row.preview ?? '', 160),
  };
}

const nav = `<nav class="site-nav" aria-label="주 메뉴"><a class="nav-logo" href="/"><img src="/KK_and_FRIENDS.webp" alt="KK &amp; Friends" width="52" height="52"><span class="nav-logo-text"><span class="nav-logo-kk">KK &amp; FRIENDS</span><span class="nav-logo-sub">Financial Intelligence</span></span></a><ul class="site-nav-links"><li><a href="/#about">ABOUT</a></li><li><a href="/community">COMMUNITY</a></li><li><a href="/membership">MEMBERSHIP</a></li><li><a href="/#kk">KK</a></li><li><a href="/thoughts" aria-current="page">THOUGHTS</a></li></ul><a class="site-nav-cta" href="/join">가입 신청</a><button class="site-nav-hamburger" type="button" aria-label="메뉴 열기" aria-expanded="false" data-site-nav-toggle><span></span><span></span><span></span></button></nav>
<div class="site-nav-mobile" data-site-nav-mobile><a href="/#about">ABOUT</a><a href="/community">COMMUNITY</a><a href="/membership">MEMBERSHIP</a><a href="/#kk">KK</a><a href="/thoughts">THOUGHTS</a><a class="site-nav-cta" href="/join">가입 신청</a></div>`;

const STYLE = `body{background:#0A0E1A}.markets-wrap{max-width:780px;margin:0 auto;padding:64px 24px 96px}.back{color:#9DB0C7;text-decoration:none}.eyebrow{margin-top:42px}.markets-wrap h1{font-family:'Noto Serif KR',serif;font-size:clamp(30px,5.4vw,50px);line-height:1.3;margin:12px 0 20px}.byline{font-size:13px;color:#9DB0C7;margin:0 0 36px;padding-bottom:24px;border-bottom:1px solid rgba(255,255,255,.12)}.rendered{font-size:17.5px;line-height:1.9;color:#D5DDE8;word-break:keep-all}.rendered h2,.rendered h3{color:#F4F7FB;margin:1.8em 0 .6em}.rendered p{margin:0 0 1.2em}.rendered ul,.rendered ol{margin:0 0 1.2em;padding-left:1.4em}.rendered li{margin:0 0 .4em}.rendered hr{border:none;border-top:1px solid rgba(255,255,255,.12);margin:2em 0}.rendered a{color:#79AEE8}.rendered strong{color:#FFF}.rendered blockquote{border-left:3px solid #4A90D9;padding-left:18px;color:#B9C6D6;margin:0 0 1.2em}.rendered em{color:#9DB0C7}.article-cta{margin-top:56px;padding:28px;border:1px solid rgba(255,255,255,.12);background:#101827}@media(max-width:640px){.markets-wrap{padding-top:40px}.rendered{font-size:16.5px}}`;

function jsonLd(brief, url, description) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: brief.title,
    description,
    datePublished: brief.published_at || brief.date,
    dateModified: brief.updated_at || brief.published_at || brief.date,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@type': 'CreativeWorkSeries', name: 'Daily Markets' },
    author: { '@type': 'Organization', name: 'KK & Friends' },
    publisher: {
      '@type': 'Organization', name: 'KK & Friends', url: `${SITE}/`,
      logo: { '@type': 'ImageObject', url: `${SITE}/KK_and_FRIENDS.webp` },
    },
  }).replace(/</g, '\\u003c');
}

/** Full HTML document for one brief (a row with body from /api/v1/markets/<slug>). */
export function renderMarketPage(brief) {
  const url = `${SITE}/markets/${brief.slug}`;
  const label = MARKET_LABEL[brief.kind] || 'Daily Markets';
  const description = excerpt(brief.body, 200);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(brief.title)} · Daily Markets · KK &amp; Friends</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0A0E1A">
<link rel="alternate" type="application/rss+xml" title="KK &amp; Friends" href="/rss.xml">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="KK &amp; Friends">
<meta property="og:title" content="${esc(brief.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="ko_KR">
<meta property="article:published_time" content="${esc(brief.published_at || brief.date)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(brief.title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/og-image.png">
<link rel="stylesheet" href="/member.css">
<link rel="stylesheet" href="/typography.css">
<link rel="stylesheet" href="/brand.css">
<style>${STYLE}</style>
<script type="application/ld+json">${jsonLd(brief, url, description)}</script>
</head>
<body>
${nav}
<main class="markets-wrap">
  <a class="back" href="/thoughts?series=Daily%20Markets">← Daily Markets</a>
  <p class="eyebrow">Daily Markets · ${esc(label)}</p>
  <h1>${esc(brief.title)}</h1>
  <p class="byline">${esc(shortDate(brief.date))} · KK &amp; Friends</p>
  <article class="rendered">${renderMarkdown(brief.body)}</article>
  <section class="article-cta"><h2>같이 읽고, 다르게 생각합니다.</h2><p>시장과 산업을 오래 본 사람들이 근거를 놓고 대화하는 곳, KK &amp; Friends입니다.</p><p><a class="btn" href="/join">가입 신청하기</a></p></section>
</main>
<div id="kk-discussion" data-post-slug="member:${esc(brief.id)}"></div>
<script type="module" src="/blog/discussion.js"></script>
<script type="module" src="/js/site-nav.js"></script>
</body>
</html>`;
}

export function renderMarketNotFound() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>글을 찾을 수 없습니다 · KK &amp; Friends</title><link rel="stylesheet" href="/member.css"></head><body><main><h1>글을 찾을 수 없습니다</h1><p>주소가 바뀌었거나 아직 발행되지 않은 글입니다.</p><p><a href="/thoughts?series=Daily%20Markets">← Daily Markets</a></p></main></body></html>`;
}
