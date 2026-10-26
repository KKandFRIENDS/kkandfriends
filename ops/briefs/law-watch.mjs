// Watch the 자본시장법 family for amendments: node ops/briefs/law-watch.mjs [--dry]
//
// Not scheduled yet. To run it daily, add a line to briefs.cron (KK's call).
// Exit code 1 on any failure; the run has already alerted KK on Telegram.
// --dry reads the API and prints what it would do, writing nothing and sending nothing.
import { existsSync, readFileSync } from 'node:fs';

const ENV_FILE = '/run/briefs-env.json';
if (existsSync(ENV_FILE)) {
  for (const [key, value] of Object.entries(JSON.parse(readFileSync(ENV_FILE, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const { runLawWatch } = await import('../../lib/stats/law-watch.js');
const dry = process.argv.includes('--dry');
const stateFile = `${process.env.BRIEFS_STATE_DIR || '/state'}/law-watch.json`;

const result = await runLawWatch({ stateFile, dry });
console.log(JSON.stringify({ at: new Date().toISOString(), kind: 'law-watch', dry, ...result }, null, dry ? 2 : 0));
process.exit(result.ok ? 0 : 1);
