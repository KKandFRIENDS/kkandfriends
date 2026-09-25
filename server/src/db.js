import pg from 'pg';

export function createPool(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

export async function databaseHealth(pool) {
  const result = await pool.query('select 1 as ok');
  return result.rows[0]?.ok === 1;
}

