import { collectRssFeeds } from '../rss.js';

const QUERY_SETS = {
  signals: {
    locale: ['en-US', 'US', 'US:en'], queries: [
      ['macro', '(Federal Reserve OR inflation OR interest rates OR bond market) when:1d'],
      ['markets', '(stocks OR equity market OR earnings OR liquidity) when:1d'],
      ['bitcoin', '(Bitcoin OR crypto markets OR stablecoin) when:1d'],
      ['ai', '(artificial intelligence OR AI chips OR data center) when:1d'],
    ],
  },
  ai: {
    locale: ['en-US', 'US', 'US:en'], queries: [
      ['models', '(AI model OR artificial intelligence model OR AI agent) when:2d'],
      ['infrastructure', '(AI chips OR data center OR AI infrastructure) when:2d'],
      ['science-safety', '(AI science OR AI safety OR AI governance) when:2d'],
    ],
  },
  korea: {
    locale: ['ko', 'KR', 'KR:ko'], queries: [
      ['economy', '(한국 경제 OR 한국은행 OR 물가 OR 성장률) when:2d'],
      ['markets', '(한국 금융시장 OR 코스피 OR 금융위원회) when:2d'],
      ['industry', '(한국 산업정책 OR 반도체 OR 수출) when:2d'],
    ],
  },
  weekly: {
    locale: ['en-US', 'US', 'US:en'], queries: [
      ['macro', '(Federal Reserve OR inflation OR interest rates OR global economy) when:7d'],
      ['markets', '(stocks OR equity market OR earnings OR liquidity) when:7d'],
      ['bitcoin', '(Bitcoin OR stablecoin OR tokenized stocks) when:7d'],
      ['ai', '(artificial intelligence OR AI agents OR AI chips) when:7d'],
      ['korea', '(South Korea economy OR Korea markets OR Korea industry) when:7d'],
    ],
  },
};

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

export async function collectGoogleNewsSignals({ fetchImpl = fetch, now = new Date(), deskId = 'signals' } = {}) {
  const querySet = QUERY_SETS[deskId] || QUERY_SETS.signals;
  const [hl, gl, ceid] = querySet.locale;
  const feeds = querySet.queries.map(([id, query]) => ({
    id: `google-news-${id}`,
    name: `Google News ${id}`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`,
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
  const signalKind = deskId === 'signals' ? 'news-momentum' : 'news-discovery';
  const signals = ranked.map(({ lead, items, publishers, score }) => {
    const excerpt = `Google News search scan observed ${items.length} closely related headline${items.length === 1 ? '' : 's'} from ${publishers.size} publisher${publishers.size === 1 ? '' : 's'} in the retrieved results. The newest matching headline was published at ${new Date(lead.publishedAt).toISOString()}. This is a media-attention indicator with a computed momentum score of ${score.toFixed(1)}, not evidence that the reported claim is true. Headline: ${lead.headline}.`;
    return {
      id: `gn-${lead.id}`, title: lead.headline, summary: excerpt, excerpt,
      publishedAt: new Date(lead.publishedAt).toISOString(),
      source: { title: `Google News: ${lead.publisher}`, url: lead.source.url },
      signalKind,
    };
  });
  return { signals, trustedExcerpts: new Map(signals.map(signal => [signal.id, { url: signal.source.url, excerpt: signal.excerpt, signalKind: signal.signalKind }])), status: signals.length ? 'ready' : 'unavailable', report: { queries: feeds.length, raw: collected.signals.length, unique: unique.length, clusters: clusters.length, retained: signals.length, errors: collected.errors } };
}
