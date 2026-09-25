import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = file => readFile(path.join(ROOT, file), 'utf8');

test('public series names use the canonical KK labels', async () => {
  const files = await Promise.all([
    'index.html', 'thoughts.html', 'desk.html', 'write-original.html',
    'write-desk.html', 'js/original-editor.js', 'js/desk-editor.js',
  ].map(source));
  const visible = files.join('\n');

  for (const label of ['KK Original', 'KK Daily', 'KK Weekly']) assert.match(visible, new RegExp(label));
  assert.doesNotMatch(visible, />KK ORIGINAL</);
  assert.doesNotMatch(visible, />DAILY DESK</);
  assert.doesNotMatch(visible, />KK WEEKLY</);
  assert.doesNotMatch(visible, />KK THOUGHTS</);
});

test('shared controls expose canonical geometry and reduced-motion behavior', async () => {
  const [type, brand] = await Promise.all([source('typography.css'), source('brand.css')]);
  assert.match(type, /--control-height:\s*44px/);
  assert.match(type, /--radius-control:\s*4px/);
  assert.match(type, /prefers-reduced-motion:\s*reduce/);
  assert.match(brand, /\.site-nav\s*\{/);
  assert.match(brand, /\.site-nav-mobile\.open/);
});

test('every static article uses the shared public navigation and canonical byline', async () => {
  const entries = await readdir(path.join(ROOT, 'posts'), { withFileTypes: true });
  const posts = entries.filter(entry => entry.isFile() && entry.name.endsWith('.html'));
  for (const post of posts) {
    const html = await source(path.join('posts', post.name));
    assert.match(html, /class="site-nav"/, `${post.name} is missing the shared navigation`);
    assert.match(html, /\/js\/site-nav\.js/, `${post.name} is missing the navigation behavior`);
    assert.match(html, /Chief of KK &amp; Friends/, `${post.name} has the retired byline`);
    assert.doesNotMatch(html, /Back to THOUGHTS|APPLY TO JOIN/);
  }
});

test('primary public CTAs use concise Korean action labels', async () => {
  const [home, thoughts] = await Promise.all([source('index.html'), source('thoughts.html')]);
  assert.doesNotMatch(`${home}\n${thoughts}`, /가입 신청 \/ Apply|Apply to Join \/|가입 신청 · Apply/);
  assert.match(home, />가입 신청하기</);
  assert.match(thoughts, />가입 신청하기</);
});
