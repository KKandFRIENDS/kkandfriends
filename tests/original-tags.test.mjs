import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { makeOriginalPageHandler } from '../api/desk.js';
import { instagramCaption, instagramItems, linkedinItems } from '../lib/feeds.js';
import { publicOriginal, renderOriginalPage } from '../lib/original-render.js';
import { hashtags, parseTags, tagProblem } from '../js/tags.js';

// The server cannot be imported here (its dependencies live in server/), so lift its copy out of the source.
const serverSource = await readFile(new URL('../server/src/routes/original.js', import.meta.url), 'utf8');
const serverParseTags = new Function(`${serverSource.match(/const TAG_PATTERN[\s\S]*?\nfunction parseTags[\s\S]*?\n}\n/)[0]}; return parseTags;`)();

const ROW = {
  slug: '20261026-tags', title: '태그 시험', summary: '요약', body: '본문', category: 'Macro',
  published_at: '2026-10-26T01:00:00.000Z', tags: ['AI', '데이터센터'],
};

test('editor parses tags and the API copy agrees', () => {
  const cases = [
    ['#AI, 데이터센터 ,ai', ['AI', '데이터센터']],
    ['AI 인프라，사모신용、 ', ['AI인프라', '사모신용']],
    [['#a', '#A', 'b'], ['a', 'b']],
    ['', []],
    [undefined, []],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(parseTags(input), expected);
    assert.deepEqual(serverParseTags(input), expected);
  }
});

test('tagProblem rejects too many, symbols and long tags', () => {
  assert.equal(tagProblem(['a', 'b', 'c', 'd', 'e']), '');
  assert.match(tagProblem(['a', 'b', 'c', 'd', 'e', 'f']), /최대 5개/);
  assert.match(tagProblem(['a-b']), /쓸 수 없습니다/);
  assert.match(tagProblem(['가'.repeat(31)]), /쓸 수 없습니다/);
});

test('the post page shows tags and exposes them to search engines', () => {
  const article = { ...publicOriginal(ROW, { includeBody: true }) };
  assert.deepEqual(article.tags, ['AI', '데이터센터']);
  const html = renderOriginalPage(article);
  assert.match(html, /<li>#AI<\/li><li>#데이터센터<\/li>/);
  assert.match(html, /property="article:tag" content="AI"/);
  assert.match(html, /"keywords":"AI, 데이터센터"/);
  const plain = renderOriginalPage(publicOriginal({ ...ROW, tags: undefined }, { includeBody: true }));
  assert.doesNotMatch(plain, /class="tags"|article:tag|keywords/);
});

test('Instagram caption and LinkedIn feed use the post tags as hashtags', () => {
  const caption = instagramCaption({ title: 't', summary: 's', section: 'Macro', tags: ['AI', '데이터센터'] });
  assert.match(caption, /#AI #데이터센터|#AI\b.*#데이터센터/);
  assert.equal(caption.split('#AI').length, 2, 'no duplicate hashtag');
  const withoutTags = instagramCaption({ title: 't', summary: 's', section: 'Macro' });
  assert.doesNotMatch(withoutTags, /#데이터센터/);

  const item = { title: 't', url: '/original/x', description: 's', date: '2026-10-26T01:00:00.000Z', section: 'Macro', tags: ['AI', '데이터센터'] };
  assert.match(instagramItems([item])[0].description, /#데이터센터/);
  assert.match(linkedinItems([item])[0].description, /s #AI #데이터센터$/);
  assert.equal(linkedinItems([{ ...item, tags: undefined }])[0].description, 's');
  assert.deepEqual(hashtags(['AI', 'bad-tag']), ['#AI']);
});

test('page handler retries without tags until the API column exists', async () => {
  const calls = [];
  const store = () => ({
    request: async path => {
      calls.push(path);
      if (/,tags/.test(path)) throw new Error('unknown column');
      return [{ ...ROW, tags: undefined }];
    },
  });
  const res = {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    status(v) { this.statusCode = v; return this; },
    send(v) { this.body = v; return this; },
    json(v) { this.body = v; return this; },
  };
  await makeOriginalPageHandler({ storeFactory: store })({ query: { slug: ROW.slug }, method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode ?? 200, 200);
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1], /,tags/);
});
