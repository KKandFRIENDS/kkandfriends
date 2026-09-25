import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

const exportRoot = path.resolve(process.env.EXPORT_DIR || './private-export');
const uploadRoot = path.resolve(process.env.UPLOAD_ROOT || './imported-uploads');
const databaseUrl = process.env.DATABASE_URL;
const apiOrigin = (process.env.API_ORIGIN || '').replace(/\/$/, '');
if (!databaseUrl || !apiOrigin) throw new Error('DATABASE_URL and API_ORIGIN are required');

const manifest = JSON.parse(await readFile(path.join(exportRoot, 'manifest.json'), 'utf8'));
const TABLE_ORDER = [
  'profiles','member_posts','comments','comment_likes','post_likes','notifications',
  'events','event_rsvps','reports','nominations','daily_briefs','editorial_runs',
  'editorial_drafts','editorial_events','kk_original_posts',
];
const allowed = new Set(TABLE_ORDER);
const quote = (identifier) => `"${String(identifier).replaceAll('"', '""')}"`;
const legacyPrefixes = [
  `${manifest.sourceUrl}/storage/v1/object/public/post-images/`,
  `${manifest.sourceUrl}/storage/v1/object/authenticated/post-images/`,
];
const rewrite = (value) => {
  if (typeof value === 'string') {
    for (const prefix of legacyPrefixes) if (value.includes(prefix)) value = value.replaceAll(prefix, `${apiOrigin}/uploads/legacy/`);
  }
  return value;
};

async function insertRows(client, table, rows) {
  if (!allowed.has(table)) throw new Error(`Table is not whitelisted: ${table}`);
  for (const row of rows || []) {
    const columns = Object.keys(row);
    const values = columns.map((column) => rewrite(row[column]));
    const params = columns.map((_, index) => `$${index + 1}`).join(',');
    const identityOverride = table === 'editorial_events' ? ' overriding system value' : '';
    await client.query(`insert into ${quote(table)} (${columns.map(quote).join(',')})${identityOverride} values (${params}) on conflict do nothing`, values);
  }
}

async function importAuth(client) {
  for (const user of manifest.users || []) {
    const email = user.email || `${user.id}@migration.invalid`;
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || meta.user_name || meta.preferred_username || 'Member';
    const image = meta.avatar_url || meta.picture || null;
    await client.query(`insert into "user"(id,name,email,"emailVerified",image,"createdAt","updatedAt")
      values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do nothing`,
    [user.id, name, email, Boolean(user.email_confirmed_at), image, user.created_at || new Date(), user.updated_at || user.created_at || new Date()]);
    const identities = user.identities?.length ? user.identities : [{
      identity_id: randomUUID(),
      provider: user.app_metadata?.provider,
      provider_id: meta.provider_id || meta.sub,
      identity_data: { sub: meta.provider_id || meta.sub },
      created_at: user.created_at,
      updated_at: user.updated_at,
    }];
    for (const identity of identities) {
      const accountId = identity.identity_data?.sub || identity.provider_id || identity.id;
      if (!identity.provider || !accountId) continue;
      await client.query(`insert into account(id,"accountId","providerId","userId","createdAt","updatedAt")
        values($1,$2,$3,$4,$5,$6) on conflict("providerId","accountId") do nothing`,
      [identity.identity_id || randomUUID(), String(accountId), identity.provider, user.id,
        identity.created_at || user.created_at || new Date(), identity.updated_at || identity.created_at || new Date()]);
    }
  }
}

async function copyTree(source, destination) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) { await mkdir(to, { recursive: true }); await copyTree(from, to); }
    else if (entry.isFile()) {
      try { await copyFile(from, to, constants.COPYFILE_EXCL); }
      catch (error) {
        if (error.code !== 'EEXIST' || await fileHash(from) !== await fileHash(to)) throw error;
      }
    }
  }
}

async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function databaseCounts(client) {
  const counts = {};
  for (const table of ['user', ...TABLE_ORDER]) {
    const result = await client.query(`select count(*)::int as count from ${quote(table)}`);
    counts[table === 'user' ? 'auth_users' : table] = result.rows[0].count;
  }
  return counts;
}

function reconciliationMismatches(counts) {
  return Object.entries(manifest.counts || {})
    .filter(([name, expected]) => name !== 'storage_objects' && counts[name] !== expected)
    .map(([name, expected]) => ({ name, expected, actual: counts[name] }));
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query('begin');
  await importAuth(client);
  for (const table of TABLE_ORDER) await insertRows(client, table, manifest.tables?.[table]);
  const counts = await databaseCounts(client);
  const mismatches = reconciliationMismatches(counts);
  if (mismatches.length) throw new Error(`Reconciliation failed: ${JSON.stringify(mismatches)}`);
  await client.query('commit');
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
}

await mkdir(path.join(uploadRoot, 'legacy'), { recursive: true });
await copyTree(path.join(exportRoot, 'uploads'), path.join(uploadRoot, 'legacy'));

const counts = await databaseCounts(pool);
await pool.end();
console.log(JSON.stringify({ ok: true, counts, uploads: manifest.counts?.storage_objects || 0 }, null, 2));
