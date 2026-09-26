import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { makeOriginalListHandler, makeOriginalPageHandler } from '../api/desk.js';
import { ORIGINAL_SLUG, publicOriginal, renderOriginalPage } from '../lib/original-render.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = file => readFile(path.join(ROOT, file), 'utf8');
const ROW = {
  slug: '20260924-liquidity-cycle',
  title: '유동성의 가격',
  summary: '가격보다 먼저 바뀌는 것은 자금의 조건이다.',
  body: '## 핵심 판단\n\n유동성은 **공짜가 아니다**.\n\n<script>alert(1)</script>',
  category: 'Macro',
  status: 'published',
  published_at: '2026-09-24T01:00:00.000Z',
  updated_at: '2026-09-24T01:00:00.000Z',
  created_at: '2026-09-23T01:00:00.000Z',
};

const store = rows => () => ({ request: async () => rows });
const brokenStore = () => () => ({ request: async () => { throw new Error('down'); } });
const response = () => ({
  statusCode: null, body: null, headers: {},
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; },
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
  send(value) { this.body = value; return this; },
});

test('migration keeps KK ORIGINAL public reads and owner writes separate', async () => {
  const sql = await source('db/migrations/017_kk_original_posts.sql');
  assert.match(sql, /create table if not exists public\.kk_original_posts/);
  assert.match(sql, /status = 'published' or public\.is_admin\(\)/);
  assert.match(sql, /for insert to authenticated[\s\S]*public\.is_admin\(\)/);
  assert.match(sql, /for update to authenticated[\s\S]*public\.is_admin\(\)/);
  assert.doesNotMatch(sql, /grant delete/i, 'permanent deletion must not be exposed');
});

test('owner editor is admin-gated and supports draft, publish and unpublish', async () => {
  const [html, js] = await Promise.all([source('write-original.html'), source('js/original-editor.js')]);
  assert.match(html, /KK Original 글쓰기/);
  assert.match(js, /if \(!isAdmin\(user\)\)/);
  assert.match(js, /save\('draft'\)/);
  assert.match(js, /save\('published'\)/);
  assert.match(js, /발행 취소/);
  assert.doesNotMatch(js, /\.delete\(/, 'the editor must not permanently delete posts');
  assert.doesNotMatch(js, /supabase|\.from\(|\.storage/i, 'the owner editor must use the VPS API only');
  assert.match(js, /communityApi\.createOriginal/);
});

test('publicOriginal omits the body from index results', () => {
  assert.deepEqual(publicOriginal(ROW), {
    slug: ROW.slug, title: ROW.title, summary: ROW.summary, category: ROW.category,
    series: 'KK Original', date: '2026-09-24', publishedAt: ROW.published_at,
  });
  assert.equal(publicOriginal(ROW, { includeBody: true }).body, ROW.body);
});

test('original renderer escapes raw HTML while preserving safe markdown', () => {
  const html = renderOriginalPage(publicOriginal(ROW, { includeBody: true }));
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.kkandfriends\.com\/original\/20260924-liquidity-cycle">/);
  assert.match(html, /<strong>공짜가 아니다<\/strong>/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /"@type":"Article"/);
  assert.match(html, /id="kk-discussion" data-post-slug="20260924-liquidity-cycle"/);
  assert.match(html, /<script type="module" src="\/blog\/discussion\.js"><\/script>/);
});

test('original list and page serve only the store result and fail closed', async () => {
  const list = response();
  await makeOriginalListHandler({ storeFactory: store([ROW]) })({ method: 'GET', query: {} }, list);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.articles[0].slug, ROW.slug);
  assert.equal(list.body.articles[0].body, undefined);

  const page = response();
  await makeOriginalPageHandler({ storeFactory: store([ROW]) })({ method: 'GET', query: { slug: ROW.slug } }, page);
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /유동성의 가격/);

  for (const slug of ['', '../secret', 'UPPER', 'a--b']) {
    assert.equal(ORIGINAL_SLUG.test(slug), false);
  }
  const bad = response();
  await makeOriginalPageHandler({ storeFactory: store([ROW]) })({ method: 'GET', query: { slug: '../secret' } }, bad);
  assert.equal(bad.statusCode, 404);

  const down = response();
  await makeOriginalPageHandler({ storeFactory: brokenStore() })({ method: 'GET', query: { slug: ROW.slug } }, down);
  assert.equal(down.statusCode, 503);
  assert.equal(down.headers['cache-control'], 'no-store');
});

test('THOUGHTS loads database originals into the KK Original series', async () => {
  const thoughts = await source('thoughts.html');
  assert.match(thoughts, /fetchJson\('\/api\/desk\?view=originals'\)/);
  assert.match(thoughts, /href: '\/original\/'/);
  assert.match(thoughts, /series: 'KK Original'/);
  assert.match(thoughts, /id="kk-original-write"[^>]+href="\/write-original"[^>]+hidden/);
  assert.match(thoughts, /currentUser, isAdmin/);
  assert.match(thoughts, /if \(isAdmin\(user\)\)/);
});

