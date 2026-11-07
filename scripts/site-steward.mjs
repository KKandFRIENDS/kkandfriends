#!/usr/bin/env node
// Site Steward: read-only health check of the live site (2026-11-07, KK request).
// Usage: node scripts/site-steward.mjs [--base https://www.kkandfriends.com] [--out report.json]
// Crawls the sitemap, checks every internal link and image, and scans visible text
// for house-rule breaks (em dash, banned sentence, personal Gmail).
// It never writes to the site. It requests slowly (3 at a time, 300 ms apart) so it does not trip
// the API's per-visitor rate limit; a 503/429 is retried up to three times with longer pauses.

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const BASE = opt('--base', 'https://www.kkandfriends.com').replace(/\/$/, '');
const OUT = opt('--out', null);
const CONCURRENCY = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url, method = 'GET') {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const text = method === 'GET' ? await res.text() : '';
    return { status: res.status, ms: Date.now() - t0, text };
  } catch (error) {
    return { status: 0, ms: Date.now() - t0, text: '', error: String(error.message || error) };
  }
}

// 503/429 here is almost always the API's per-visitor limit (120 a minute), not an outage.
// Back off 5 s, 20 s, 45 s before counting a page as down (2026-11-07: one retry left 14 pages unchecked).
const BACKOFF_MS = [5000, 20000, 45000];
async function fetchChecked(url, method) {
  let r = await fetchOnce(url, method);
  for (const wait of BACKOFF_MS) {
    if (!(r.status === 503 || r.status === 429 || r.status === 0)) break;
    await sleep(wait); r = await fetchOnce(url, method);
  }
  if (method === 'HEAD' && (r.status === 405 || r.status === 403)) r = await fetchOnce(url, 'GET');
  return r;
}

async function pool(items, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); await sleep(300); }
  }));
  return out;
}

function visibleText(html) {
  const meta = [...html.matchAll(/<title>([^<]*)/gi), ...html.matchAll(/<meta[^>]+content="([^"]*)"/gi)].map((m) => m[1]).join(' ');
  const body = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
  return (body + ' ' + meta).replace(/&mdash;/g, '—').replace(/&amp;/g, '&');
}

// Which pages the dash rule covers (KK decisions, 2026-11-07). Older content is counted, not listed.
//  - KK Original: from 2026-10-15 (the day the rule was set).
//  - Daily Markets: from 2026-10-17 (the brief's dash filter went live during 10/16; the 07:00 brief that day predates it).
//  - posts/ (THOUGHTS archive): all old.
//  - Every other page: always.
// ALLOWED_DASHES: dashes KK has accepted on a page (e.g. inside a quoted source title). More than this is flagged.
const ALLOWED_DASHES = {
  '/original/20261024-ai-cyber-risk-financial-trust': 1, // quoted source title in the reference list
  '/': 1, // home "latest" card repeats an old post title (20260924_five_percent_gravity)
};
// List pages repeat titles and excerpts of the posts they link to; each post is judged on its own page.
const LISTING_PAGES = new Set(['/thoughts']);
function dashRuleApplies(path) {
  let m;
  if (path.startsWith('/posts/') || LISTING_PAGES.has(path)) return false;
  if ((m = path.match(/^\/original\/(\d{8})/))) return m[1] >= '20261015';
  if ((m = path.match(/^\/markets\/(\d{4}-\d{2}-\d{2})/))) return m[1] >= '2026-10-17';
  return true;
}

const titleOf = (html) => (html.match(/<title>([^<]*)/i) || [])[1]?.trim() || '';
const RULES = {
  emDash: /—/g,
  banned: /내 해석이지|공식 전망이 아니/g,
  personalGmail: /kiseok\.kim\.1969@gmail|kim\.kiseok\.1969@gmail/g,
};

const sitemap = await fetchChecked(`${BASE}/sitemap.xml`, 'GET');
if (sitemap.status !== 200) { console.error(`sitemap ${sitemap.status}`); process.exit(1); }
const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

const pages = await pool(urls, async (url) => {
  const r = await fetchChecked(url, 'GET');
  const h = r.text;
  const text = visibleText(h);
  const count = (re) => (text.match(re) || []).length;
  return {
    url: url.replace(BASE, '') || '/', status: r.status, ms: r.ms, title: titleOf(h),
    missing: [
      !/<title>[^<]+/i.test(h) && 'title',
      !/<meta[^>]+name="description"/i.test(h) && 'description',
      !/property="og:image"/i.test(h) && 'og:image',
      !/rel="canonical"/i.test(h) && 'canonical',
    ].filter(Boolean),
    titleEmDash: titleOf(h).includes('—'),
    emDash: count(RULES.emDash), banned: count(RULES.banned), personalGmail: count(RULES.personalGmail),
    links: [...h.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
  };
});

const linkSource = new Map();
for (const p of pages) {
  for (const raw of p.links) {
    if (/^(mailto:|tel:|javascript:|#|data:)/.test(raw) || raw.includes('${') || raw.includes("' +")) continue;
    let u; try { u = new URL(raw, BASE + p.url); } catch { continue; }
    if (!u.hostname.endsWith('kkandfriends.com')) continue;
    u.hash = '';
    if (!linkSource.has(u.href)) linkSource.set(u.href, p.url);
  }
  delete p.links;
}
const linkList = [...linkSource.keys()].filter((u) => !urls.includes(u));
const linkResults = await pool(linkList, async (u) => ({ url: u, status: (await fetchChecked(u, 'HEAD')).status }));
const brokenLinks = linkResults.filter((l) => l.status === 0 || l.status >= 400).map((l) => ({ ...l, on: linkSource.get(l.url) }));

const endpoints = ['/robots.txt', '/rss.xml', '/linkedin.xml', '/instagram.xml', '/week', 'https://api.kkandfriends.com/health'];
const endpointResults = await pool(endpoints, async (e) => {
  const r = await fetchChecked(e.startsWith('http') ? e : BASE + e, 'GET');
  return { endpoint: e, status: r.status, items: (r.text.match(/<item>/g) || []).length };
});

const report = {
  checkedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }) + ' KST',
  base: BASE,
  pages: pages.length,
  notOk: pages.filter((p) => p.status !== 200).map((p) => ({ url: p.url, status: p.status })),
  missingTags: pages.filter((p) => p.missing.length).map((p) => ({ url: p.url, missing: p.missing })),
  titleEmDash: pages.filter((p) => p.titleEmDash).map((p) => ({ url: p.url, title: p.title })),
  emDashPages: pages.filter((p) => p.emDash).map((p) => ({ url: p.url, count: p.emDash })),
  // Pages the dash rule covers, with more dashes than KK has accepted. These are the ones to report.
  ruleDashPages: pages.filter((p) => dashRuleApplies(p.url) && p.emDash > (ALLOWED_DASHES[p.url] || 0))
    .map((p) => ({ url: p.url, count: p.emDash, allowed: ALLOWED_DASHES[p.url] || 0 })),
  oldDashPages: pages.filter((p) => !dashRuleApplies(p.url) && p.emDash).length,
  bannedPages: pages.filter((p) => p.banned).map((p) => ({ url: p.url, count: p.banned })),
  personalGmailPages: pages.filter((p) => p.personalGmail).map((p) => p.url),
  slowest: [...pages].sort((a, b) => b.ms - a.ms).slice(0, 5).map((p) => ({ url: p.url, ms: p.ms })),
  linksChecked: linkList.length,
  brokenLinks,
  endpoints: endpointResults,
};

const json = JSON.stringify(report, null, 2);
if (OUT) { const { writeFile } = await import('node:fs/promises'); await writeFile(OUT, json); }
console.log(json);
