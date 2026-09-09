import { collectRssFeeds } from '../rss.js';

const QUERIES = [
  ['macro', '(Federal Reserve OR inflation OR interest rates OR bond market) when:1d'],
  ['markets', '(stocks OR equity market OR earnings OR liquidity) when:1d'],
  ['bitcoin', '(Bitcoin OR crypto markets OR stablecoin) when:1d'],
  ['ai', '(artificial intelligence OR AI chips OR data center) when:1d'],
];

const stopwords = new Set(['after','amid','and','are','for','from','has','how','into','its','new','not','over','says','that','the','this','with']);
function headlineParts(title) {
  const parts = title.split(' - ');
  const publisher = parts.length > 1 ? parts.pop().trim() : 'Unknown publisher';
  const headline = parts.join(' - ').trim() || title.trim();
  const tokens = new Set(headline.toLowerCase().replace(/[^a-z0-9가-힣 ]/g, ' ').split(/\s+/).filter(token => token.length > 2 && !stopwords.has(token)));
  return { headline, publisher, tokens };
}
function similarity(a, b) {
  const intersection = [...a].filter(token => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export async function collectGoogleNewsSignals({ fetchImpl = fetch, now = new Date() } = {}) {
  const feeds = QUERIES.map(([id, query]) => ({
    id: `google-news-${id}`,
    name: `Google News ${id}`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
  }));
  const collected = await collectRssFeeds({ feeds, fetchImpl, maxItemsPerFeed: 25 });
  const unique = [...new Map(collected.signals.map(signal => [signal.source.url, signal])).values()]
    .map(signal => ({ ...signal, ...headlineParts(signal.title) }));
  const clusters = [];
  for (const item of unique) {
    const cluster = clusters.find(candidate => similarity(candidate.tokens, item.tokens) >= 0.5);
    if (cluster) cluster.items.push(item);
    else clusters.push({ tokens: item.tokens, items: [item] });
  }
  const ranked = clusters.map(cluster => {
    const items = cluster.items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const lead = items[0];
    const publishers = new Set(items.map(item => item.publisher));
    const ageHours = Math.max(0, (now - new Date(lead.publishedAt)) / 3_600_000);
    const recency = Math.max(0, 24 - ageHours);
    const score = items.length * 4 + publishers.size * 3 + recency / 6;
    return { lead, items, publishers, score };
  }).sort((a, b) => b.score - a.score || new Date(b.lead.publishedAt) - new Date(a.lead.publishedAt)).slice(0, 15);
  const signals = ranked.map(({ lead, items, publishers, score }) => {
    const excerpt = `Google News search scan observed ${items.length} closely related headline${items.length === 1 ? '' : 's'} from ${publishers.size} publisher${publishers.size === 1 ? '' : 's'} in the retrieved results. The newest matching headline was published at ${new Date(lead.publishedAt).toISOString()}. This is a media-attention indicator with a computed momentum score of ${score.toFixed(1)}, not evidence that the reported claim is true. Headline: ${lead.headline}.`;
    return {
      id: `gn-${lead.id}`, title: lead.headline, summary: excerpt, excerpt,
      publishedAt: new Date(lead.publishedAt).toISOString(),
      source: { title: `Google News: ${lead.publisher}`, url: lead.source.url },
      signalKind: 'news-momentum',
    };
  });
  return { signals, trustedExcerpts: new Map(signals.map(signal => [signal.id, { url: signal.source.url, excerpt: signal.excerpt, signalKind: signal.signalKind }])), status: signals.length ? 'ready' : 'unavailable', report: { queries: feeds.length, raw: collected.signals.length, unique: unique.length, clusters: clusters.length, retained: signals.length, errors: collected.errors } };
}
