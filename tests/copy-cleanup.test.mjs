import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');

// 2026-10-27 site review before inviting friends: Korean first, no English twins in chrome, no underlined buttons.

const PUBLIC = ['index', 'membership', 'community', 'join', 'nominate', 'events', 'members', 'unsubscribe'];

test('page titles and link-preview text are Korean (Naver and Kakao show them as written)', async () => {
  for (const name of PUBLIC) {
    const html = await read(`${name}.html`);
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    assert.match(title, /[가-힣]/, `${name}: title is English: ${title}`);
    assert.doesNotMatch(title, /· (Join|Nominate|Events|Directory|Unsubscribe)\b/, `${name}: English twin in title`);
  }
  for (const name of ['index', 'membership', 'community']) {
    const html = await read(`${name}.html`);
    for (const key of ['name="description"', 'property="og:title"', 'property="og:description"', 'name="twitter:title"', 'name="twitter:description"']) {
      const m = html.match(new RegExp(`<meta ${key} content="([^"]*)"`));
      assert.ok(m, `${name}: ${key} missing`);
      assert.match(m[1], /[가-힣]/, `${name}: ${key} is English`);
      assert.doesNotMatch(m[1], /\b(elite|exclusive)\b/i, `${name}: ${key} oversells`);
    }
  }
});

test('home and membership carry no English twin lines', async () => {
  const text = (await read('index.html')) + (await read('membership.html'));
  for (const twin of ['Every application is personally reviewed', 'Free through 2026.', 'Personally reviewed by KK.', 'By Review', 'By Invitation',
    'Private roundtables &amp; events', 'Peer introductions', 'Choose your identity', 'Is this free to join?', 'How It <span>Works', 'Ready to <span>Apply',
    'Fill out the short application form', '가입 신청 / Apply', 'Looking ahead ·', 'Independent capacity ·', 'Now Open', "content: 'RECOMMENDED'"]) {
    assert.ok(!text.includes(twin), twin);
  }
});

test('the shared footer is Korean on every page that has it', async () => {
  const files = [];
  const walk = async (dir) => {
    for (const e of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) await walk(rel);
      else if (e.name.endsWith('.html')) files.push(rel);
    }
  };
  await walk('.');
  let footers = 0;
  for (const f of files) {
    const html = await read(f);
    if (!html.includes('kkf-footer-brand')) continue;
    footers += 1;
    assert.ok(!html.includes('Peer discussion and public-information market perspectives for experienced'), `${f}: English tagline`);
    assert.ok(!html.includes('kkf-footer-heading">Navigation'), `${f}: English heading`);
    assert.ok(!html.includes('All rights reserved. ·'), `${f}: English twin in copyright line`);
  }
  assert.ok(footers > 20, 'the footer is on many pages');
});

test('home link buttons are not underlined', async () => {
  const home = await read('index.html');
  assert.match(home, /\.nav-cta, \.btn-primary, \.btn-ghost, \.tier-btn, \.closing-btn \{ text-decoration: none; \}/);
});

test('unknown addresses get a Korean 404 page that search engines skip', async () => {
  const html = await read('404.html');
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /페이지를 찾을 수 없습니다/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /href="\/"/);
});
