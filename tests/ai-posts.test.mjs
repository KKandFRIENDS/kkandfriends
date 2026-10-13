import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');

// 2026-10-14 (KK): the seven posts whose subject is AI moved to the AI category.
// A post's category is written in its own page, its THOUGHTS card and the search index.
const AI_POSTS = [
  '20260924_thought_price_725x', '20260821_seniority_has_a_name', '20260820_franchising_the_ai_stack',
  '20260802_cheap_tokens_expensive_silicon', '20260620_hyperscaler-capex', '20260614_ai_capex_risk', '20260422_ai_infra_korea',
];

test('AI posts carry the AI category everywhere it is written', async () => {
  const thoughts = await read('thoughts.html');
  const index = await read('lib/post-index.js');
  for (const slug of AI_POSTS) {
    const page = await read(`posts/${slug}.html`);
    assert.match(page, /<meta property="article:section" content="AI">/, `${slug} meta`);
    assert.match(page, /<span class="article-tag">AI<\/span>/, `${slug} tag`);
    assert.doesNotMatch(page, /"articleSection": "(?!AI")/, `${slug} json-ld`);
    const card = thoughts.slice(thoughts.indexOf(`href="/posts/${slug}"`));
    assert.match(card.slice(0, card.indexOf('</a>')), /data-category="AI"[\s\S]*<span class="post-category">AI<\/span>|<span class="post-category">AI<\/span>/, `${slug} card`);
    assert.match(card.slice(0, 200), /data-category="AI"/, `${slug} card category`);
    const entry = index.slice(index.indexOf(`"slug": "${slug}"`));
    assert.match(entry.slice(0, entry.indexOf('}')), /"section": "AI"/, `${slug} index`);
  }
});

test('the AI filter has exactly the moved posts', async () => {
  const thoughts = await read('thoughts.html');
  assert.equal((thoughts.match(/data-category="AI"/g) || []).length, AI_POSTS.length);
});
