// Run one lounge job: node ops/briefs/run.mjs <global|korea-close|digest> [--dry] [--force] [--to=email]
//
// Cron gives jobs an empty environment, so start.sh snapshots the container's
// env to /run/briefs-env.json at boot and this loads it before the brief module
// is imported (the modules read process.env at load time). Exit code 1 on any
// failure so the cron log shows it; the brief itself has already alerted KK.
import { existsSync, readFileSync } from 'node:fs';

const ENV_FILE = '/run/briefs-env.json';
if (existsSync(ENV_FILE)) {
  for (const [key, value] of Object.entries(JSON.parse(readFileSync(ENV_FILE, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const kind = process.argv[2];
const args = process.argv.slice(3);
const flags = new Set(args);
const to = (args.find((a) => a.startsWith('--to=')) || '').slice('--to='.length);
const runners = {
  global: async () => (await import('../../lib/briefs/global.js')).runGlobalBrief,
  'korea-close': async () => (await import('../../lib/briefs/korea-close.js')).runKoreaCloseBrief,
  digest: async () => (await import('../../lib/briefs/digest.js')).runDigest,
};
if (!runners[kind]) {
  console.error('usage: node ops/briefs/run.mjs <global|korea-close|digest> [--dry] [--force] [--to=email]');
  process.exit(2);
}

const run = await runners[kind]();
const result = await run({ dry: flags.has('--dry'), force: flags.has('--force'), to });
console.log(JSON.stringify({ at: new Date().toISOString(), kind, ...result }, null, flags.has('--dry') ? 2 : 0));
process.exit(result.ok ? 0 : 1);
