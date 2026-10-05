import { parseFeedXml } from '../rss.js';

const QUERIES = [
  'macroeconomics OR inflation OR "interest rates"',
  'stocks OR earnings OR liquidity',
  'bitcoin OR stablecoin OR tokenized stocks',
  '"artificial intelligence" OR "AI agents" OR semiconductors',
];
const COMMUNITIES = '(subreddit:economics OR subreddit:finance OR subreddit:investing OR subreddit:Bitcoin OR subreddit:technology OR subreddit:artificial)';

const score = post => Number(post.score || 0) + 2 * Number(post.num_comments || 0);

export async function collectRedditSignals({ fetchImpl = fetch } = {}) {
  // One shared RSS request avoids four simultaneous fallback requests being rate-limited.
  let rssFallback;
  function publicRss() {
    return rssFallback ??= (async () => {
      const params = new URLSearchParams({ q: `(${QUERIES.join(' OR ')}) AND ${COMMUNITIES}`, sort: 'top', t: 'week', limit: '25', type: 'link' });
      const response = await fetchImpl(`https://www.reddit.com/search.rss?${params}`, {
        headers: { 'user-agent': 'KKandFriends-Editorial/1.0' }, redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
      return parseFeedXml(await response.text(), { id: 'reddit-rss', name: 'Reddit public RSS' }, { maxItems: 25 });
    })();
  }
  const results = await Promise.all(QUERIES.map(async (query, index) => {
    try {
      const params = new URLSearchParams({ q: `(${query}) AND ${COMMUNITIES}`, sort: 'top', t: 'week', limit: '25', type: 'link' });
      const response = await fetchImpl(`https://www.reddit.com/search.json?${params}`, {
        headers: { 'user-agent': 'KKandFriends-Editorial/1.0' },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const entries = await publicRss();
        return { index, error: null, posts: entries.filter(item => /^https:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/comments\//.test(item.source.url)).map(item => ({
          id: item.id, title: item.title, permalink: item.source.url, created_utc: Date.parse(item.publishedAt) / 1000,
          subreddit: new URL(item.source.url).pathname.split('/')[2], rss: true,
        })) };
      }
      const payload = await response.json();
      return { index, posts: (payload?.data?.children || []).map(item => item?.data).filter(Boolean), error: null };
    } catch (error) {
      return { index, posts: [], error: error instanceof Error ? error.message : String(error) };
    }
  }));
  const unique = [...new Map(results.flatMap(result => result.posts)
    .filter(post => post.id && post.title && post.permalink && post.created_utc && !post.over_18)
    .map(post => [post.id, post])).values()]
    .sort((a, b) => score(b) - score(a) || Number(b.created_utc) - Number(a.created_utc))
    .slice(0, 15);
  const signals = unique.map(post => {
    const url = new URL(post.permalink, 'https://www.reddit.com').toString();
    const observation = post.rss ? 'Reddit public RSS search observed this discussion. Engagement counts are unavailable through RSS.' : `Reddit public-search scan observed this discussion with ${Number(post.score || 0)} points and ${Number(post.num_comments || 0)} comments at collection.`;
    const excerpt = `${observation} This is a social-interest indicator, not evidence that the post or comments are true. Community: r/${String(post.subreddit || 'unknown')}. Topic: ${post.title}.`;
    return {
      id: `reddit-${post.id}`, title: post.title, summary: excerpt, excerpt,
      publishedAt: new Date(Number(post.created_utc) * 1000).toISOString(),
      source: { title: `Reddit r/${String(post.subreddit || 'unknown')}`, url, type: 'secondary' },
      signalKind: 'social-interest',
    };
  });
  return {
    signals,
    trustedExcerpts: new Map(signals.map(signal => [signal.id, { url: signal.source.url, excerpt: signal.excerpt, signalKind: signal.signalKind }])),
    status: signals.length ? 'ready' : 'unavailable',
    report: { queries: QUERIES.length, raw: new Set(results.flatMap(result => result.posts).map(post => post.id)).size, retained: signals.length, errors: results.filter(result => result.error).map(result => `query-${result.index + 1}: ${result.error}`) },
  };
}
