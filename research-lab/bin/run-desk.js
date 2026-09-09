#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { dateKey, deskFor, hashContent } from '../src/desk/core.js';
import { generateDesk } from '../src/desk/pipeline.js';
import { collectDeskSources } from '../src/desk/collector.js';
import { createOpenAiCompatibleInvoker } from '../src/model-adapters.js';
import { createWorkerStore } from '../src/desk/worker-store.js';
import { collectGoogleNewsSignals } from '../src/desk/google-news-signals.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const env = process.env;
const date = dateKey();
const required = name => { if (!env[name]) throw new Error(`Missing configuration: ${name}`); return env[name]; };
const json = async path => JSON.parse(await readFile(path, 'utf8'));
async function originals() {
  const files = await readdir(resolve(root, 'posts'));
  const rows = await Promise.all(files.filter(f => f.endsWith('.html')).map(async f => {
    const html = await readFile(resolve(root, 'posts', f), 'utf8');
    const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
    return { title, url: `/posts/${f.slice(0, -5)}` };
  }));
  return rows.filter(r => r.title);
}
async function main() {
  const models = Object.fromEntries(['discovery','research','writer','editor'].map(stage => [stage, required(`DESK_${stage.toUpperCase()}_MODEL`)]));
  const invoke = createOpenAiCompatibleInvoker({ apiKey: required('OPENROUTER_API_KEY'), endpoint: 'https://openrouter.ai/api/v1/chat/completions', timeoutMs: 300000, reasoning: { effort: 'low' }, maxTokensByStage: { discovery: 16000, research: 16000, writer: 16000, editor: 12000 } });
  const feeds = await json(env.DESK_FEEDS_FILE || resolve(root, 'research-lab/config/desk-feeds.json'));
  const policy = await json(env.DESK_SOURCE_POLICY_FILE || resolve(root, 'research-lab/config/desk-source-policy.json'));
  const supplemental = env.DESK_SIGNALS_FILE ? await json(env.DESK_SIGNALS_FILE) : [];
  const store = createWorkerStore();
  const attempt = randomUUID();
  if (!await store.rpc('editorial_claim', { p_date: date, p_attempt: attempt })) { console.log(JSON.stringify({ date, status: 'already_claimed' })); return; }
  try {
    const news = deskFor(date).id === 'signals'
      ? await collectGoogleNewsSignals()
      : { signals: [], trustedExcerpts: new Map(), status: 'not_scheduled', report: { queries: 0, raw: 0, unique: 0, clusters: 0, retained: 0, errors: [] } };
    const collected = await collectDeskSources({ feeds, policy, supplemental: [...supplemental, ...news.signals], trustedExcerpts: news.trustedExcerpts });
    collected.report.googleNews = { status: news.status, ...news.report };
    const since = new Date(`${date}T00:00:00+09:00`); since.setDate(since.getDate() - 56);
    const published = await store.request(`editorial_drafts?status=eq.published&edition_date=gte.${dateKey(since)}&select=id,edition_date,payload&order=edition_date.desc&limit=56`);
    const weekStart = new Date(`${date}T00:00:00+09:00`); weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const memory = published.filter(r => r.edition_date >= dateKey(weekStart) && r.edition_date < date).map(r => ({ id: r.id, date: r.edition_date, desk: r.payload.desk, content: r.payload.content }));
    const recent = [...await originals(), ...published.map(r => ({ title: r.payload.content.title, url: `/desk?slug=${r.id}` }))];
    const payload = await generateDesk({ date, sources: collected.sources, recent, memory, invoke, models });
    payload.collection = collected.report;
    await store.rpc('editorial_finish', { p_date: date, p_attempt: attempt, p_payload: payload, p_hash: hashContent(payload.content), p_detail: { ...collected.report, models } });
    console.log(JSON.stringify({ date, status: 'awaiting_approval', sources: collected.sources.length }));
  } catch (error) {
    // Provider responses and credentials are never logged. Bounded local error names only.
    const detail = { stage: 'generation', error: error.name, reason: String(error.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300) };
    await store.rpc('editorial_finish', { p_date: date, p_attempt: attempt, p_payload: null, p_hash: null, p_detail: detail });
    console.error(JSON.stringify({ date, status: 'failed', ...detail })); process.exitCode = 1;
  }
}
main().catch(error => { console.error(JSON.stringify({ status: 'configuration_or_database_failure', error: error.name })); process.exitCode = 1; });
