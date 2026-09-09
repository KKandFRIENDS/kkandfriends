#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOpenAiCompatibleInvoker,
  createVercelAiGatewayInvoker,
  resolveVercelOidcToken,
} from '../src/model-adapters.js';
import { generateWeeklyEditorialPackage } from '../src/orchestrator.js';
import { collectRssFeeds } from '../src/rss.js';
import { normalizeSignals } from '../src/signals.js';

const here = dirname(fileURLToPath(import.meta.url));
const labRoot = resolve(here, '..');
const workspaceRoot = resolve(here, '../../../..');

async function loadLocalEnv() {
  const paths = [resolve(labRoot, '.env.local'), resolve(labRoot, '..', '.env.local')];
  for (const path of paths) try {
    const body = await readFile(path, 'utf8');
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const name = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(name in process.env)) process.env[name] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for live dry-run`);
  return value;
}

function models(name, fallbackName = null) {
  const raw = process.env[name] || (fallbackName ? process.env[fallbackName] : null);
  if (!raw) throw new Error(`${name} is required for live dry-run`);
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function createInvoker() {
  const provider = process.env.RESEARCH_PROVIDER ?? 'vercel-oidc';
  if (provider === 'vercel-oidc') {
    const token = resolveVercelOidcToken({ env: process.env });
    return createVercelAiGatewayInvoker({ tokenProvider: () => token });
  }
  if (provider === 'gateway-key') {
    return createOpenAiCompatibleInvoker({
      apiKey: required('AI_GATEWAY_API_KEY'),
      endpoint: process.env.AI_GATEWAY_ENDPOINT ?? 'https://ai-gateway.vercel.sh/v1/chat/completions',
    });
  }
  throw new Error('RESEARCH_PROVIDER must be vercel-oidc or gateway-key');
}

await loadLocalEnv();

const [feeds, sourcePolicy, experienceRegistry, master, universal, writingOs] = await Promise.all([
  readJson(resolve(labRoot, 'config/feeds.json')),
  readJson(resolve(labRoot, 'config/source-policy.json')),
  readJson(resolve(workspaceRoot, 'AI/Blog/ops/approved_experiences.json')),
  readFile(resolve(workspaceRoot, 'AI/Blog/KK-Master-Writing-Prompt.md'), 'utf8'),
  readFile(resolve(workspaceRoot, 'AI/KK_Writing_Prompt/KK_Universal_Writing_OnePager.md'), 'utf8'),
  readFile(resolve(workspaceRoot, 'AI/KK_Writing_Prompt/KK_Writing_OS_v1.0_ONEPAGER.md'), 'utf8'),
]);

// Validate all live-only configuration before making any network request.
const modelChains = {
  discovery: models('RESEARCH_DISCOVERY_MODELS', 'RESEARCH_MODELS'),
  research: models('RESEARCH_DOSSIER_MODELS', 'RESEARCH_MODELS'),
  writer: models('RESEARCH_WRITER_MODELS', 'RESEARCH_MODELS'),
};
const invoke = createInvoker();

const collected = await collectRssFeeds({ feeds });
const normalized = normalizeSignals(collected.signals, sourcePolicy);
if (normalized.signals.length < 5) {
  throw new Error(`Only ${normalized.signals.length} trusted recent signals were collected`);
}

const date = new Date();
const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
const week = Math.ceil((((date - yearStart) / 86_400_000) + yearStart.getUTCDay() + 1) / 7);
const weekKey = `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;

const result = await generateWeeklyEditorialPackage({
  weekKey,
  signals: normalized.signals,
  recentTitles: [],
  experienceRegistry,
  usedMetaphors: [],
  prompts: { master, universal, writingOs },
  modelChains,
  invoke,
});

process.stdout.write(`${result.markdown}\n`);
process.exitCode = result.ready ? 0 : 1;
