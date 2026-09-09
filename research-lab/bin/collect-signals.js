#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { collectRssFeeds } from '../src/rss.js';
import { normalizeSignals } from '../src/signals.js';

const here = dirname(fileURLToPath(import.meta.url));
const feeds = JSON.parse(await readFile(resolve(here, '../config/feeds.json'), 'utf8'));
const sourcePolicy = JSON.parse(await readFile(resolve(here, '../config/source-policy.json'), 'utf8'));

const collected = await collectRssFeeds({ feeds });
const normalized = normalizeSignals(collected.signals, sourcePolicy);
const output = {
  collectedAt: new Date().toISOString(),
  feedResults: collected.feedResults,
  feedErrors: collected.errors,
  acceptedSignalCount: normalized.signals.length,
  rejectedSignalCount: normalized.errors.length,
  rejectedExamples: normalized.errors.slice(0, 10),
  signals: normalized.signals,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = normalized.signals.length > 0 ? 0 : 1;
