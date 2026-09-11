#!/usr/bin/env node
// Rebuilds lib/post-index.js from the committed post files.
//
// The feeds (/rss.xml, /sitemap.xml) are served by serverless functions, which
// cannot read the 34 static post files at request time. This script flattens
// the metadata already present in each post's <head> into one manifest the
// functions can import. Run it after adding or retitling a post:
//
//   node scripts/build-post-index.mjs
//
// The manifest is emitted as a JS module, not JSON: a plain ESM import works on
// every Node version and Vercel's bundler traces it automatically, whereas JSON
// import attributes (`with { type: 'json' }`) and runtime fs reads both need
// version- or config-specific handling.
//
// It fails loudly rather than writing a half-filled manifest — a feed missing a
// post is worse than a build that stops and says which post is malformed.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = join(ROOT, 'posts');

const unescapeHtml = s => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .trim();

const meta = (html, attr, name) => {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i');
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${name}["']`, 'i');
  const m = html.match(re) || html.match(alt);
  return m ? unescapeHtml(m[1]) : null;
};

// The <title> carries the " | KK & Friends" suffix; og:title is the clean one.
const titleOf = (html, slug) => {
  const og = meta(html, 'property', 'og:title');
  if (og) return og;
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!t) throw new Error(`${slug}: no <title> and no og:title`);
  return unescapeHtml(t[1]).replace(/\s*\|\s*KK\s*&\s*Friends\s*$/i, '');
};

// Filenames are YYYYMMDD_slug.html; article:published_time is authoritative
// when present because a post can be backdated or republished.
const dateOf = (html, file, slug) => {
  const declared = meta(html, 'property', 'article:published_time');
  if (declared && /^\d{4}-\d{2}-\d{2}/.test(declared)) return declared.slice(0, 10);
  const m = file.match(/^(\d{4})(\d{2})(\d{2})_/);
  if (!m) throw new Error(`${slug}: no article:published_time and filename has no date prefix`);
  return `${m[1]}-${m[2]}-${m[3]}`;
};

const files = (await readdir(POSTS)).filter(f => f.endsWith('.html')).sort();
if (!files.length) throw new Error('posts/ has no .html files — refusing to write an empty manifest');

const posts = [];
for (const file of files) {
  const slug = file.replace(/\.html$/, '');
  const html = await readFile(join(POSTS, file), 'utf8');
  const description = meta(html, 'property', 'og:description') || meta(html, 'name', 'description');
  if (!description) throw new Error(`${slug}: no description or og:description`);
  posts.push({
    slug,
    url: `/posts/${slug}`,
    title: titleOf(html, slug),
    description,
    date: dateOf(html, file, slug),
    section: meta(html, 'property', 'article:section') || null,
  });
}

posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? 1 : -1));

const banner = `// GENERATED FILE — do not edit by hand.
// Run \`node scripts/build-post-index.mjs\` after adding or retitling a post.
// Source of truth is the <head> of each file in posts/.

`;

await writeFile(
  join(ROOT, 'lib', 'post-index.js'),
  `${banner}export const generated = ${JSON.stringify(new Date().toISOString().slice(0, 10))};\n\nexport const posts = ${JSON.stringify(posts, null, 2)};\n`,
);
console.log(`lib/post-index.js — ${posts.length} posts, newest ${posts[0].date} (${posts[0].slug})`);
