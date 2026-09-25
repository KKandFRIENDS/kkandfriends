import { loadConfig } from './config.js';
import { createPool, databaseHealth } from './db.js';
import { createAuth } from './auth.js';
import { buildApp } from './app.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const auth = createAuth(config);
const app = await buildApp({ config, pool, auth, databaseHealth });

async function shutdown(signal) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ host: '0.0.0.0', port: config.port });

