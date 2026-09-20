const QUERIES = [
  'macroeconomics OR inflation OR interest rates',
  'stocks OR earnings OR liquidity',
  'bitcoin OR stablecoin OR tokenized stocks',
  'artificial intelligence OR AI agents OR semiconductors',
];

const score = post => Number(post.score || 0) + 2 * Number(post.num_comments || 0);

export async function collectRedditSignals({ fetchImpl = fetch } = {}) {
  const results = await Promise.all(QUERIES.map(async (query, index) => {
    try {
      const params = new URLSearchParams({ q: query, sort: 'top', t: 'week', limit: '25', type: 'link' });
      const response = await fetchImpl(`https://www.reddit.com/search.json?${params}`, {
        headers: { 'user-agent': 'KKandFriends-Editorial/1.0' },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
    const excerpt = `Reddit public-search scan observed this discussion with ${Number(post.score || 0)} points and ${Number(post.num_comments || 0)} comments at collection. This is a social-interest indicator, not evidence that the post or comments are true. Community: r/${String(post.subreddit || 'unknown')}. Topic: ${post.title}.`;
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
    report: { queries: QUERIES.length, raw: results.reduce((sum, result) => sum + result.posts.length, 0), retained: signals.length, errors: results.filter(result => result.error).map(result => `query-${result.index + 1}: ${result.error}`) },
  };
}
