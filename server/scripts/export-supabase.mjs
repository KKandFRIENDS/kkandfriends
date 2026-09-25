import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputRoot = path.resolve(process.env.EXPORT_DIR || './private-export');
if (!baseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const TABLES = [
  'profiles','member_posts','comments','comment_likes','post_likes','notifications',
  'events','event_rsvps','reports','nominations','daily_briefs','editorial_runs',
  'editorial_drafts','editorial_events','kk_original_posts',
];
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText} for ${new URL(url).pathname}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function exportTable(table) {
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    const page = await jsonFetch(`${baseUrl}/rest/v1/${table}?select=*`, {
      headers: { Range: `${offset}-${offset + 999}` },
    });
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function exportUsers() {
  const users = [];
  for (let page = 1;; page += 1) {
    const result = await jsonFetch(`${baseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`);
    const batch = result.users || [];
    users.push(...batch);
    if (batch.length < 1000) return users;
  }
}

async function listObjects(prefix = '') {
  const files = [];
  for (let offset = 0;; offset += 100) {
    const batch = await jsonFetch(`${baseUrl}/storage/v1/object/list/post-images`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    for (const item of batch) {
      const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id || item.metadata) files.push(objectPath);
      else files.push(...await listObjects(objectPath));
    }
    if (batch.length < 100) return files;
  }
}

async function exportObjects() {
  const files = await listObjects();
  for (const objectPath of files) {
    const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`${baseUrl}/storage/v1/object/authenticated/post-images/${encoded}`, { headers });
    if (!response.ok) throw new Error(`Failed to download post-images/${objectPath}: ${response.status}`);
    const destination = path.join(outputRoot, 'uploads', ...objectPath.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(await response.arrayBuffer()), { flag: 'wx' });
  }
  return files;
}

await mkdir(path.join(outputRoot, 'uploads'), { recursive: true });
const users = await exportUsers();
const tables = {};
const missingTables = [];
for (const table of TABLES) {
  try {
    tables[table] = await exportTable(table);
  } catch (error) {
    if (error.status !== 404) throw error;
    tables[table] = [];
    missingTables.push(table);
  }
}
const objects = await exportObjects();
const manifest = {
  exportedAt: new Date().toISOString(), source: new URL(baseUrl).host, sourceUrl: baseUrl,
  users, tables, objects, missingTables,
  counts: Object.fromEntries([['auth_users', users.length], ...Object.entries(tables).map(([k, v]) => [k, v.length]), ['storage_objects', objects.length]]),
};
await writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ ok: true, outputRoot, counts: manifest.counts }, null, 2));
