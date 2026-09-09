export async function collectXSignals({ token = process.env.X_BEARER_TOKEN, fetchImpl = fetch } = {}) {
  if (!token) return { signals: [], status: 'not_configured' };
  const params = new URLSearchParams({
    query: '(bitcoin OR crypto OR markets OR macroeconomics OR "artificial intelligence") lang:en -is:retweet',
    max_results: '100', sort_order: 'relevancy',
    'tweet.fields': 'created_at,public_metrics,author_id,lang',
  });
  const response = await fetchImpl(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`X API HTTP ${response.status}`);
  const payload = await response.json();
  const score = post => {
    const metrics = post.public_metrics || {};
    return Number(metrics.like_count || 0) + 3 * Number(metrics.retweet_count || 0) + 3 * Number(metrics.quote_count || 0) + Number(metrics.reply_count || 0);
  };
  const signals = (payload.data || []).filter(post => post.id && post.text && post.created_at).sort((a, b) => score(b) - score(a)).slice(0, 15).map(post => {
    const metrics = post.public_metrics || {};
    const clean = post.text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    const url = `https://x.com/i/web/status/${post.id}`;
    const excerpt = `${clean} Public engagement at collection: ${Number(metrics.like_count || 0)} likes, ${Number(metrics.retweet_count || 0)} reposts, ${Number(metrics.quote_count || 0)} quotes, ${Number(metrics.reply_count || 0)} replies.`;
    return { id: `x-${post.id}`, title: clean.slice(0, 160), summary: excerpt, excerpt, publishedAt: post.created_at, source: { title: 'X public post', url } };
  });
  return { signals, status: 'ready' };
}
