#!/usr/bin/env node
// Site Steward: read-only health check of the live site (2026-11-07, KK request).
// Usage: node scripts/site-steward.mjs [--base https://www.kkandfriends.com] [--out report.json]
// Crawls the sitemap, checks every internal link and image, and scans visible text
// for house-rule breaks (em dash, banned sentence, personal Gmail).
// It never writes to the site. It requests slowly (3 at a time) so it does not trip
// the API's per-visitor rate limit; a 503 is retried once after a pause before it counts.

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

async function fetchChecked(url, method) {
  let r = await fetchOnce(url, method);
  if (r.status === 503 || r.status === 429 || r.status === 0) { await sleep(5000); r = await fetchOnce(url, method); }
  if (method === 'HEAD' && (r.status === 405 || r.status === 403)) r = await fetchOnce(url, 'GET');
  return r;
}

async function pool(items, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); await sleep(150); }
  }));
  return out;
}

function visibleText(html) {
  const meta = [...html.matchAll(/<title>([^<]*)/gi), ...html.matchAll(/<meta[^>]+content="([^"]*)"/gi)].map((m) => m[1]).join(' ');
  const body = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
  return (body + ' ' + meta).replace(/&mdash;/g, '—').replace(/&amp;/g, '&');
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
