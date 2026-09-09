import { readFileSync } from 'node:fs';
Object.assign(process.env, JSON.parse(readFileSync('/run/desk-env.json', 'utf8')));
await import('../bin/stage-desk.js');
