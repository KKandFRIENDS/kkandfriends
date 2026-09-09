#!/usr/bin/env node
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { dateKey, deskFor, hashContent } from '../src/desk/core.js';
import { collectDeskSources } from '../src/desk/collector.js';
import { rankDesk, researchDesk, writeDesk, editDesk, assembleDesk } from '../src/desk/stages.js';
import { createOpenAiCompatibleInvoker } from '../src/model-adapters.js';
import { createWorkerStore } from '../src/desk/worker-store.js';
import { notifyTelegram } from '../src/desk/notify.js';
import { collectGoogleNewsSignals } from '../src/desk/google-news-signals.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const env = process.env;
const date = dateKey();
const stage = process.argv[2];
const allowedStages = ['scan', 'rank', 'research', 'write', 'edit'];
if (!allowedStages.includes(stage)) throw new Error('Expected stage: scan, rank, research, write or edit');
const required = name => { if (!env[name]) throw new Error(`Missing configuration: ${name}`); return env[name]; };
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const stateRoot = resolve(env.DESK_STATE_DIR || '/state', date);
let activeAttempt = null;
let dbClaimed = false;
const statePath = name => resolve(stateRoot, `${name}.json`);
async function save(name, value) {
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  const temporary = statePath(`${name}.${randomUUID()}`);
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, statePath(name));
}
const load = name => json(statePath(name));

async function originals() {
  const files = await readdir(resolve(root, 'posts'));
  const rows = await Promise.all(files.filter(file => file.endsWith('.html')).map(async file => {
    const html = await readFile(resolve(root, 'posts', file), 'utf8');
    const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
    return { title, url: `/posts/${file.slice(0, -5)}` };
  }));
  return rows.filter(row => row.title);
}

function invoker() {
  return createOpenAiCompatibleInvoker({
    apiKey: required('OPENROUTER_API_KEY'), endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    timeoutMs: 20 * 60 * 1000, reasoning: { effort: 'low' },
    maxTokensByStage: { discovery: 16000, research: 16000, writer: 16000, editor: 12000 },
  });
}

async function scan(store) {
  const attempt = randomUUID();
  activeAttempt = attempt;
  const models = Object.fromEntries(['discovery', 'research', 'writer', 'editor'].map(name => [name, required(`DESK_${name.toUpperCase()}_MODEL`)]));
  const feeds = await json(env.DESK_FEEDS_FILE || resolve(root, 'research-lab/config/desk-feeds.json'));
  const policy = await json(env.DESK_SOURCE_POLICY_FILE || resolve(root, 'research-lab/config/desk-source-policy.json'));
  const supplemental = env.DESK_SIGNALS_FILE ? await json(env.DESK_SIGNALS_FILE) : [];
  const news = deskFor(date).id === 'signals'
    ? await collectGoogleNewsSignals()
    : { signals: [], trustedExcerpts: new Map(), status: 'not_scheduled', report: { queries: 0, raw: 0, unique: 0, clusters: 0, retained: 0, errors: [] } };
  const collected = await collectDeskSources({ feeds, policy, supplemental: [...supplemental, ...news.signals], trustedExcerpts: news.trustedExcerpts });
  collected.report.googleNews = { status: news.status, ...news.report };
  const since = new Date(`${date}T00:00:00+09:00`); since.setDate(since.getDate() - 56);
  const published = await store.request(`editorial_drafts?status=eq.published&edition_date=gte.${dateKey(since)}&select=id,edition_date,payload&order=edition_date.desc&limit=56`);
  const weekStart = new Date(`${date}T00:00:00+09:00`); weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const memory = published.filter(row => row.edition_date >= dateKey(weekStart) && row.edition_date < date).map(row => ({ id: row.id, date: row.edition_date, desk: row.payload.desk, content: row.payload.content }));
  const recent = [...await originals(), ...published.map(row => ({ title: row.payload.content.title, url: `/desk?slug=${row.id}` }))];
  await save('scan', { schemaVersion: 1, date, attempt, sources: collected.sources, collection: collected.report, recent, memory, models });
  console.log(JSON.stringify({ date, stage, status: 'ready', sources: collected.sources.length }));
}

async function runStage(store) {
  const scanState = await load('scan');
  activeAttempt = scanState.attempt;
  if (scanState.date !== date) throw new Error('Scan checkpoint is not for today');
  const invoke = invoker();
  if (stage === 'rank') {
    const ranked = await rankDesk({ ...scanState, invoke, model: scanState.models.discovery });
    await save('rank', ranked);
  } else if (stage === 'research') {
    const ranked = await load('rank');
    const researched = await researchDesk({ selected: ranked.selected, sources: scanState.sources, memory: scanState.memory, invoke, model: scanState.models.research });
    await save('research', researched);
  } else if (stage === 'write') {
    const ranked = await load('rank');
    const researched = await load('research');
    const written = await writeDesk({ date, ...ranked, ...researched, recent: scanState.recent, memory: scanState.memory, invoke, model: scanState.models.writer });
    await save('write', written);
  } else {
    const ranked = await load('rank');
    const researched = await load('research');
    const written = await load('write');
    if (!await store.rpc('editorial_claim', { p_date: date, p_attempt: scanState.attempt })) {
      console.log(JSON.stringify({ date, stage, status: 'skipped', reason: 'already_completed_or_running' }));
      return;
    }
    dbClaimed = true;
    const review = await editDesk({ ...written, ...researched, recent: scanState.recent, invoke, model: scanState.models.editor });
    const payload = assembleDesk({ ...ranked, ...researched, ...written, review, recent: scanState.recent, memory: scanState.memory, models: scanState.models, collection: scanState.collection });
    await store.rpc('editorial_finish', { p_date: date, p_attempt: scanState.attempt, p_payload: payload, p_hash: hashContent(payload.content), p_detail: { ...scanState.collection, models: scanState.models, delivered: true } });
    const notified = await notifyTelegram({ title: `[KK EDITORIAL DESK] ${payload.desk.label}`, text: `${payload.content.title}\n\n후보 선정과 초안 검수가 끝났습니다.\nhttps://www.kkandfriends.com/admin-editorial` });
    await save('edit', { review, notified, completedAt: new Date().toISOString() });
  }
  console.log(JSON.stringify({ date, stage, status: 'ready' }));
}

async function main() {
  const store = createWorkerStore();
  try {
    if (stage === 'scan') await scan(store); else await runStage(store);
  } catch (error) {
    const reason = String(error.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300);
    if (activeAttempt && dbClaimed) {
      try { await store.rpc('editorial_finish', { p_date: date, p_attempt: activeAttempt, p_payload: null, p_hash: null, p_detail: { stage, error: error.name, reason } }); } catch {}
    }
    const notified = await notifyTelegram({ title: `[KK EDITORIAL DESK] ${stage.toUpperCase()} 중단`, text: `${reason}\n\n관리 화면: https://www.kkandfriends.com/admin-editorial` }).catch(() => false);
    console.error(JSON.stringify({ date, stage, status: 'failed', error: error.name, reason, notified }));
    process.exitCode = 1;
  }
}
main();
