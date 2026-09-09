import { createHash } from 'node:crypto';

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(code.toLowerCase().startsWith('x') ? Number.parseInt(code.slice(1), 16) : Number(code)),
    )
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return decodeXml(match[1]);
  }
  return '';
}

function link(block) {
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (atom) return decodeXml(atom[1]);
  return tag(block, ['link']);
}

export function parseFeedXml(xml, feed, { maxItems = 30 } = {}) {
  if (typeof xml !== 'string' || xml.trim() === '') throw new Error('empty feed');
  const rssItems = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const atomEntries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  const blocks = rssItems.length > 0 ? rssItems : atomEntries;
  if (blocks.length === 0) throw new Error('feed contains no item or entry');

  return blocks.slice(0, maxItems).map((block, index) => {
    const articleUrl = link(block);
    const title = tag(block, ['title']);
    const publishedAt = tag(block, ['pubDate', 'published', 'updated', 'dc:date']);
    const summary = tag(block, ['description', 'summary', 'content', 'content:encoded']);
    if (!articleUrl || !title || !publishedAt) throw new Error(`feed item ${index} is missing link, title, or date`);
    const id = createHash('sha256').update(`${feed.id}\n${articleUrl}`).digest('hex').slice(0, 24);
    return {
      id,
      title,
      summary: summary || title,
      publishedAt,
      source: { title: feed.name, url: articleUrl },
    };
  });
}

export async function collectRssFeeds({
  feeds,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  maxItemsPerFeed = 30,
}) {
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const response = await fetchImpl(feed.url, {
          headers: { 'user-agent': 'KKandFriends-ResearchLab/0.1' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xml = await response.text();
        return { feed, signals: parseFeedXml(xml, feed, { maxItems: maxItemsPerFeed }), error: null };
      } catch (error) {
        return { feed, signals: [], error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  return {
    signals: results.flatMap((result) => result.signals),
    errors: results.filter((result) => result.error).map((result) => `${result.feed.id}: ${result.error}`),
    feedResults: results.map((result) => ({
      feedId: result.feed.id,
      itemCount: result.signals.length,
      error: result.error,
    })),
  };
}
