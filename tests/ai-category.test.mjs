import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');

// 2026-10-13 (KK): writing an AI piece, the editor had no AI category. Four places must agree:
// the editor list, the API's allowed set, the database check, and the THOUGHTS filter.
const LIST = ['Macro', 'Korea', 'Equity', 'Digital Assets', 'AI', 'Global', 'Manifesto'];
const quoted = (names) => names.map((name) => `'${name}'`).join(', ');

test('KK ORIGINAL category lists agree and include AI', async () => {
  assert.ok((await read('js/original-editor.js')).includes(`[${quoted(LIST)}]`), 'editor list');
  assert.ok((await read('server/src/routes/original.js')).includes(`new Set([${quoted(LIST)}])`), 'API set');
  const sql = await read('server/db/005_original_category_ai.sql');
  assert.ok(sql.includes(`check (category in (${LIST.map((name) => `'${name}'`).join(',')}))`), 'database check');
  assert.match(sql, /drop constraint if exists kk_original_posts_category_check/);
});

test('THOUGHTS has an AI filter button', async () => {
  assert.match(await read('thoughts.html'), /<button class="filter-btn" data-filter="AI" aria-pressed="false">AI<\/button>/);
});
