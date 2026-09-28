import { writeFileSync } from 'node:fs';
const keys = ['EDITORIAL_INTERNAL_TOKEN','COMMUNITY_API_URL','SITE_URL','GEMINI_API_KEY','GEMINI_MODEL','OPENROUTER_API_KEY','OPENROUTER_MODEL','AI_GATEWAY_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_MODEL','ANTHROPIC_EFFORT','ECOS_API_KEY','RESEND_API_KEY','RESEND_FROM','BRIEFS_STATE_DIR','TELEGRAM_BOT_TOKEN','TELEGRAM_CHANNEL_ID','TELEGRAM_CHAT_ID'];
writeFileSync('/run/briefs-env.json', JSON.stringify(Object.fromEntries(keys.filter(k => process.env[k]).map(k => [k, process.env[k]]))), { mode: 0o600 });
