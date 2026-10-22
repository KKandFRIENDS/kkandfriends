// ============================================================================
//  week-calendar.js — 이번 주 체크 포인트: which week to show, which hand-kept
//  calendar items are trustworthy, and the view the page renders.
//
//  Pure on purpose (no network, no filesystem): the handler in api/desk.js
//  supplies the files and the law lookup, so every rule here is unit-testable.
//  Spec: docs/superpowers/specs/2026-10-22-week-calendar-design.md
// ============================================================================

import { kstYmd, isoFromYmd } from './stats/http.js';

const DAY = 86400000;
const REGIONS = ['kr', 'us', 'global'];

const utc = (iso) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);

function addDays(iso, n) {
  return isoOf(utc(iso) + n * DAY);
}

// A real calendar date: "2026-02-30" parses but does not round-trip.
function isRealDate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) && isoOf(utc(iso)) === iso;
}

// Monday..Sunday (Korea time) containing `now`. On Saturday and Sunday this
// week is over, so the window moves to the coming Monday..Sunday.
export function weekWindow(now = new Date()) {
  const today = isoFromYmd(kstYmd(now));
  const sinceMonday = (new Date(utc(today)).getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  const isNextWeek = sinceMonday >= 5;
  const from = addDays(today, isNextWeek ? 7 - sinceMonday : -sinceMonday);
  return { from, to: addDays(from, 6), isNextWeek };
}

// ─── Items ──────────────────────────────────────────────────────────────────

const text = (v) => typeof v === 'string' && v.trim().length > 0;

// An empty array means the item may be shown. Anything an item says about
// itself is untrusted until here: the source link in particular must be a
// plain https URL, because it ends up in an href.
export function validateItem(item, fileYear) {
  const errors = [];
  if (!item || typeof item !== 'object') return ['item is not an object'];

  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(item.id ?? ''))) errors.push('id must be lowercase letters, digits and hyphens');
  if (!isRealDate(item.date)) errors.push('date must be a real YYYY-MM-DD date');
  else if (fileYear !== undefined && Number(item.date.slice(0, 4)) !== fileYear) errors.push(`date is not in ${fileYear}`);
  if (item.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(item.time))) errors.push('time must be HH:MM');
  if (!REGIONS.includes(item.region)) errors.push(`region must be one of ${REGIONS.join(', ')}`);

  for (const [key, max] of [['title', 60], ['note', 120]]) {
    const v = item[key];
    if (!text(v)) errors.push(`${key} is required`);
    else {
      if (v.length > max) errors.push(`${key} is longer than ${max} characters`);
      if (/[\r\n]/.test(v)) errors.push(`${key} must be one line`);
      if (v.includes('—')) errors.push(`${key} must not contain an em dash`);
    }
  }

  const src = item.source;
  if (!src || !text(src.name)) errors.push('source.name is required');
  let url = null;
  try { url = new URL(String(src?.url ?? '')); } catch { /* handled below */ }
  if (!url || url.protocol !== 'https:') errors.push('source.url must be an https URL');

  if (!isRealDate(item.verifiedAt)) errors.push('verifiedAt must be a real YYYY-MM-DD date');
  return errors;
}

// ─── Loading and view assembly ──────────────────────────────────────────────

// files: [{ year, items }]. Only valid items survive; a repeated id keeps the
// first one. `years` lists the years that have at least one valid item: an
// empty file means "not prepared yet", which must never read as "quiet week".
export function loadWeekItems(files) {
  const items = [];
  const rejected = [];
  const years = new Set();
  const seen = new Set();
  for (const file of Array.isArray(files) ? files : []) {
    const list = Array.isArray(file?.items) ? file.items : [];
    for (const raw of list) {
      const errors = validateItem(raw, file.year);
      if (!errors.length && seen.has(raw.id)) errors.push('duplicate id');
      if (errors.length) {
        rejected.push({ id: String(raw?.id ?? ''), errors });
        continue;
      }
      seen.add(raw.id);
      items.push(raw);
      years.add(file.year);
    }
  }
  return { items, rejected, years: [...years].sort((a, b) => a - b) };
}

// Same day: timed items first (by time), untimed after.
function byWhen(a, b) {
  return a.date.localeCompare(b.date)
    || (a.time ? 0 : 1) - (b.time ? 0 : 1)
    || (a.time ?? '').localeCompare(b.time ?? '')
    || a.id.localeCompare(b.id);
}

// law: { status: 'ok'|'empty'|'unavailable', items, partial? } — what the
// handler learned from OpenLaw. `partial` means some laws could not be read, so
// even an empty answer is not trustworthy.
export function buildWeekView({ now = new Date(), files = [], law }) {
  const window = weekWindow(now);
  const { items, rejected, years } = loadWeekItems(files);

  const inWindow = items.filter((i) => i.date >= window.from && i.date <= window.to).sort(byWhen);
  const prepared = years.includes(Number(window.from.slice(0, 4)));
  const calendar = {
    status: !prepared ? 'not-prepared' : inWindow.length ? 'ok' : 'empty',
    items: prepared ? inWindow : [],
  };

  const lawIn = law ?? { status: 'unavailable', items: [] };
  const lawStatus = lawIn.status === 'unavailable' ? 'unavailable' : lawIn.partial ? 'partial' : lawIn.status;
  const lawItems = lawStatus === 'unavailable' ? [] : lawIn.items ?? [];

  return {
    window,
    calendar,
    law: { status: lawStatus, items: lawItems },
    rejected,
    shortCache: lawStatus === 'unavailable' || lawStatus === 'partial',
  };
}
