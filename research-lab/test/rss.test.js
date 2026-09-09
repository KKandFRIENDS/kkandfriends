import test from 'node:test';
import assert from 'node:assert/strict';
import { collectRssFeeds, parseFeedXml } from '../src/rss.js';

const feed = { id: 'official', name: 'Official Feed', url: 'https://example.org/feed.xml' };
const rss = `<?xml version="1.0"?><rss><channel><item>
  <title><![CDATA[Research &amp; markets]]></title>
  <link>https://example.org/report?x=1&amp;y=2</link>
  <pubDate>Mon, 01 Jan 2099 00:00:00 GMT</pubDate>
  <description><![CDATA[<p>Verified summary.</p>]]></description>
</item></channel></rss>`;

test('RSS parser extracts title, link, date, and clean summary', () => {
  const signals = parseFeedXml(rss, feed);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].title, 'Research & markets');
  assert.equal(signals[0].source.url, 'https://example.org/report?x=1&y=2');
  assert.equal(signals[0].summary, 'Verified summary.');
});

test('collector isolates a failed feed and keeps successful results', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('bad')) return { ok: false, status: 503, text: async () => '' };
    return { ok: true, status: 200, text: async () => rss };
  };
  const result = await collectRssFeeds({
    feeds: [feed, { id: 'bad', name: 'Bad', url: 'https://bad.example/feed' }],
    fetchImpl,
  });
  assert.equal(result.signals.length, 1);
  assert.deepEqual(result.errors, ['bad: HTTP 503']);
});
