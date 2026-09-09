import { writeFileSync } from 'node:fs';
const keys = ['EDITORIAL_SITE_URL','EDITORIAL_WORKER_TOKEN','OPENROUTER_API_KEY','DESK_DISCOVERY_MODEL','DESK_RESEARCH_MODEL','DESK_WRITER_MODEL','DESK_EDITOR_MODEL','DESK_FEEDS_FILE','DESK_SOURCE_POLICY_FILE','DESK_SIGNALS_FILE'];
writeFileSync('/run/desk-env.json', JSON.stringify(Object.fromEntries(keys.filter(k => process.env[k]).map(k => [k, process.env[k]]))), { mode: 0o600 });
