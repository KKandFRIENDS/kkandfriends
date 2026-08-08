// Loader for research-config.json — the settings behind the research-lab
// topic-selection run described in RESEARCH_PROMPT.md.
//
// Why this exists: the prompt says the conflict filter, model chain, source
// whitelist and scoring weights must live outside the code, so KK can change
// them without a deploy. This module reads that file, checks it is coherent,
// and hands back the deterministic pieces the orchestrator needs — the
// weighted sum, the ranking and the threshold are computed here, never by the
// model, so the same scores always produce the same winner.
//
// Env overrides (both optional, comma-separated, highest priority first):
//   RESEARCH_MODEL       reasoning chain, e.g. "claude-opus-5,claude-sonnet-5"
//   RESEARCH_SCAN_MODEL  step-1 web-search model
//
// Usage:
//   import { loadResearchConfig, recencyScore, rankCandidates } from './research-config.js';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = fileURLToPath(new URL('../research-config.json', import.meta.url));

const METRICS = [
  'timeliness',
  'recency',
  'finance_relevance',
  'differentiation',
  'evidence',
  'reader_value',
  'risk',
];

function envList(name) {
  const raw = process.env[name];
  if (!raw) return null;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : null;
}

// Throws rather than falling back to defaults. A silently half-applied conflict
// filter is worse than a run that refuses to start.
function validate(cfg) {
  const problems = [];

  if (!Array.isArray(cfg.conflict_filter) || cfg.conflict_filter.length === 0) {
    problems.push('conflict_filter is empty — the run has no exclusion list');
  }
  if (!Array.isArray(cfg.kk_roles) || cfg.kk_roles.length === 0) {
    problems.push('kk_roles is empty — the model cannot judge unlisted conflicts');
  }
  if (!cfg.models?.reason?.length) problems.push('models.reason is empty');
  if (!cfg.models?.scan?.length) problems.push('models.scan is empty');
  if (!Array.isArray(cfg.whitelist) || cfg.whitelist.length === 0) {
    problems.push('whitelist is empty — the evidence cap would apply to everything');
  }

  const missing = METRICS.filter((m) => typeof cfg.weights?.[m] !== 'number');
  if (missing.length) problems.push(`weights missing: ${missing.join(', ')}`);
  else {
    const sum = METRICS.reduce((t, m) => t + cfg.weights[m], 0);
    // Tolerance covers float noise (0.2 + 0.15 * 5 + 0.05 is not exactly 1).
    if (Math.abs(sum - 1) > 1e-9) problems.push(`weights sum to ${sum}, expected 1`);
  }

  const scale = cfg.recency_scale;
  if (!Array.isArray(scale) || scale.length === 0) problems.push('recency_scale is empty');
  else if (scale[scale.length - 1].max_days !== null) {
    problems.push('recency_scale needs a final open-ended bucket (max_days: null)');
  }

  if (typeof cfg.threshold !== 'number') problems.push('threshold must be a number');

  for (const key of cfg.tiebreak || []) {
    if (!METRICS.includes(key)) problems.push(`tiebreak references unknown metric "${key}"`);
  }

  if (problems.length) {
    throw new Error(`research-config.json is invalid:\n  - ${problems.join('\n  - ')}`);
  }
}

let cached = null;

export function loadResearchConfig({ reload = false } = {}) {
  if (cached && !reload) return cached;

  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  cfg.models = {
    scan: envList('RESEARCH_SCAN_MODEL') || cfg.models?.scan,
    reason: envList('RESEARCH_MODEL') || cfg.models?.reason,
  };
  validate(cfg);

  cached = cfg;
  return cfg;
}

// Days since the triggering story → 1–10. Buckets are inclusive of max_days.
export function recencyScore(daysOld, cfg = loadResearchConfig()) {
  for (const bucket of cfg.recency_scale) {
    if (bucket.max_days === null || daysOld <= bucket.max_days) return bucket.score;
  }
  return cfg.recency_scale[cfg.recency_scale.length - 1].score;
}

// `scores` is { timeliness: 8, recency: 10, … }, each 1–10. Risk is already
// inverted by the scorer (11 − risk), so every metric points the same way here.
export function weightedTotal(scores, cfg = loadResearchConfig()) {
  const missing = METRICS.filter((m) => typeof scores[m] !== 'number');
  if (missing.length) throw new Error(`candidate is missing scores: ${missing.join(', ')}`);
  const total = METRICS.reduce((t, m) => t + scores[m] * cfg.weights[m], 0);
  return Math.round(total * 100) / 100;
}

// Ranks candidates and marks which clear the publish threshold. Ties fall
// through cfg.tiebreak in order; anything still level keeps its input order.
export function rankCandidates(candidates, cfg = loadResearchConfig()) {
  const scored = candidates.map((c, index) => ({
    ...c,
    index,
    total: weightedTotal(c.scores, cfg),
  }));

  scored.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    for (const key of cfg.tiebreak) {
      if (b.scores[key] !== a.scores[key]) return b.scores[key] - a.scores[key];
    }
    return a.index - b.index;
  });

  return scored.map((c, i) => ({
    ...c,
    rank: i + 1,
    passes_threshold: c.total >= cfg.threshold,
  }));
}

// True when nothing is worth publishing — step 3.5 of the prompt.
export function shouldHold(ranked, cfg = loadResearchConfig()) {
  return !ranked.some((c) => c.total >= cfg.threshold);
}

/**
 * Turn one raw candidate from the model into a scored candidate.
 *
 * The model is asked for judgement only — five 1–10 metrics, a raw risk level,
 * the trigger date, and flags for the evidence rules it thinks apply. Recency,
 * the risk inversion and the evidence caps are computed here instead, because
 * those are arithmetic and a model that quietly rounds them the friendly way
 * defeats the whole point of the rubric.
 *
 * `notes` records every adjustment so the report can show its work.
 */
export function normalizeCandidate(raw, { asOf = new Date(), cfg = loadResearchConfig() } = {}) {
  const scores = {};
  const notes = [];

  for (const m of ['timeliness', 'finance_relevance', 'differentiation', 'evidence', 'reader_value']) {
    scores[m] = clamp10(raw.scores?.[m]);
  }

  // Recency comes from the date, not from the model's sense of "recent".
  const daysOld = daysSince(raw.trigger_date, asOf);
  scores.recency = daysOld === null ? cfg.recency_scale[cfg.recency_scale.length - 1].score : recencyScore(daysOld, cfg);
  if (daysOld === null) notes.push('트리거 날짜 없음 → 최신성 최저 구간 적용');

  // The rubric scores low risk highly; the model reports the risk itself.
  const riskLevel = clamp10(raw.risk_level);
  scores.risk = 11 - riskLevel;

  // Evidence hard rules. The model flags what it saw; the cap is applied here
  // so it cannot be talked around.
  const rules = cfg.evidence_hard_rules || {};
  const flags = raw.evidence_flags || {};
  const before = scores.evidence;

  if (flags.whitelist_external_only && typeof rules.cap_if_whitelist_external_only === 'number') {
    scores.evidence = Math.min(scores.evidence, rules.cap_if_whitelist_external_only);
  }
  if (flags.no_primary_source && typeof rules.cap_if_no_primary_source === 'number') {
    scores.evidence = Math.min(scores.evidence, rules.cap_if_no_primary_source);
  }
  if (flags.incomplete_onchain_metric && typeof rules.penalty_incomplete_onchain_metric === 'number') {
    scores.evidence = Math.max(1, scores.evidence + rules.penalty_incomplete_onchain_metric);
  }
  if (scores.evidence !== before) {
    notes.push(
      `근거 가용성 ${before} → ${scores.evidence} (${Object.entries(flags)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ')})`
    );
  }

  return { ...raw, scores, risk_level: riskLevel, days_old: daysOld, adjustments: notes };
}

/** Normalize every candidate, then rank them. The pair the cron actually calls. */
export function scoreAndRank(rawCandidates, { asOf = new Date(), cfg = loadResearchConfig() } = {}) {
  return rankCandidates(
    rawCandidates.map((c) => normalizeCandidate(c, { asOf, cfg })),
    cfg
  );
}

function clamp10(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, Math.round(n)));
}

// Whole days between an ISO date and now, in UTC. Negative (a trigger dated in
// the future, which models do produce) is treated as today.
function daysSince(isoDate, asOf) {
  if (!isoDate) return null;
  const then = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date(`${asOf.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

export { METRICS };
