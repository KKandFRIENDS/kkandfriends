import { collectRssFeeds } from '../rss.js';
import { normalizeSignals, classifySourceUrl } from '../signals.js';

export async function readSource(url, policy, fetchImpl = fetch) {
  classifySourceUrl(url, policy);
  const r = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'KKandFriends-Editorial/1.0' } });
  if (!r.ok || !/text\/(html|plain)|application\/(xml|xhtml)/i.test(r.headers.get('content-type') || '')) throw new Error('Source inaccessible or unsupported');
  const chunks = []; let size = 0;
  for await (const chunk of r.body) { size += chunk.length; if (size > 1500000) throw new Error('Source too large'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks).toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 18000);
}
export async function collectDeskSources({ feeds, policy, now = new Date(), fetchImpl = fetch, supplemental = [], trustedExcerpts = new Map() }) {
  feeds = feeds.filter(feed => !feed.disabled);
  // Feed URLs are curated configuration; redirects must never bypass policy.
  for (const feed of feeds) classifySourceUrl(feed.url, policy);
  const collected = await collectRssFeeds({ feeds, fetchImpl: (url, options) => fetchImpl(url, { ...options, redirect: 'error' }), maxItemsPerFeed: 15 });
  const normalized = normalizeSignals([...collected.signals, ...supplemental], policy, { now });
  const byUrl = new Map();
  for (const s of normalized.signals) if (!byUrl.has(s.source.url)) byUrl.set(s.source.url, s);
  const candidates = [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 50);
  const sources = []; const failures = [...collected.errors];
  for (let i = 0; i < candidates.length; i += 5) {
    const results = await Promise.all(candidates.slice(i, i + 5).map(async s => {
      try {
        const social = /(^|\.)(x\.com|twitter\.com)$/.test(new URL(s.source.url).hostname);
        const trusted = trustedExcerpts.get(s.id);
        const excerpt = trusted?.url === s.source.url && typeof trusted.excerpt === 'string' ? trusted.excerpt : await readSource(s.source.url, policy, fetchImpl);
        return { id: s.id, title: s.title, url: s.source.url, type: s.source.type, publishedAt: s.publishedAt, social, signalKind: trusted?.signalKind ?? null, excerpt };
      }
      catch { failures.push(`${s.id}: source unavailable`); return null; }
    }));
    sources.push(...results.filter(s => s && s.excerpt.length >= 100));
  }
  return { sources, report: { collected: collected.signals.length + supplemental.length, normalized: normalized.signals.length, retrieved: sources.length, target: '30–50', failures } };
}
