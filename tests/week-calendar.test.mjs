// 이번 주 체크 포인트: the pure parts (week window, item validation, view
// assembly) plus the renderers and the /week handler. Spec:
// docs/superpowers/specs/2026-10-22-week-calendar-design.md
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { lawsEffectiveIn } from '../lib/stats/openlaw.js';
import { makeWeekHandler, makeHandler } from '../api/desk.js';
import { STATIC_PAGES, buildSitemap } from '../lib/feeds.js';
import { renderWeekPage, homeWeekJson } from '../lib/week-render.js';
import { weekWindow, validateItem, loadWeekItems, buildWeekView } from '../lib/week-calendar.js';

// ── week window ─────────────────────────────────────────────────────────────

test('weekWindow: a weekday is this Monday through Sunday in Korea time', () => {
  assert.deepEqual(weekWindow(new Date('2026-10-22T03:00:00Z')),
    { from: '2026-10-19', to: '2026-10-25', isNextWeek: false });
});

test('weekWindow: Friday 23:59:59 KST is still this week', () => {
  assert.deepEqual(weekWindow(new Date('2026-10-23T14:59:59Z')),
    { from: '2026-10-19', to: '2026-10-25', isNextWeek: false });
});

test('weekWindow: Saturday 00:00 KST rolls to next week', () => {
  assert.deepEqual(weekWindow(new Date('2026-10-23T15:00:00Z')),
    { from: '2026-10-26', to: '2026-11-01', isNextWeek: true });
});

test('weekWindow: Sunday evening shows next week', () => {
  assert.deepEqual(weekWindow(new Date('2026-10-25T10:00:00Z')),
    { from: '2026-10-26', to: '2026-11-01', isNextWeek: true });
});

test('weekWindow: a window may span the new year', () => {
  assert.deepEqual(weekWindow(new Date('2026-12-28T01:00:00Z')),
    { from: '2026-12-28', to: '2027-01-03', isNextWeek: false });
});

// ── item validation ─────────────────────────────────────────────────────────

const GOOD = {
  id: '2026-11-27-bok-mpc',
  date: '2026-11-27',
  time: '09:00',
  region: 'kr',
  title: '한국은행 금융통화위원회',
  note: '기준금리를 올리거나 내리거나 그대로 둘지 정하는 회의. 결과는 당일 발표.',
  source: { name: '한국은행 금융통화위원회 일정', url: 'https://www.bok.or.kr/' },
  verifiedAt: '2026-10-22',
};

test('validateItem: a complete item is valid', () => {
  assert.deepEqual(validateItem(GOOD, 2026), []);
});

test('validateItem: a time is optional', () => {
  const { time, ...noTime } = GOOD;
  assert.deepEqual(validateItem(noTime, 2026), []);
});

const BAD = {
  'http source': { source: { name: 'x', url: 'http://example.org/' } },
  'javascript source': { source: { name: 'x', url: 'javascript:alert(1)' } },
  'empty source url': { source: { name: 'x', url: '' } },
  'no source': { source: undefined },
  'impossible date': { date: '2026-02-30' },
  'bad time': { time: '25:00' },
  'unknown region': { region: 'jp' },
  'em dash in title': { title: '금통위 — 기준금리' },
  'empty title': { title: '' },
  'multi-line note': { note: '첫 줄\n둘째 줄' },
  'no verifiedAt': { verifiedAt: undefined },
  'id with a space': { id: 'a b' },
  'wrong file year': { date: '2027-01-04' },
};
for (const [name, patch] of Object.entries(BAD)) {
  test(`validateItem: rejects ${name}`, () => {
    assert.notEqual(validateItem({ ...GOOD, ...patch }, 2026).length, 0);
  });
}

// ── loading and view assembly ───────────────────────────────────────────────

const item = (id, date, extra = {}) => ({ ...GOOD, id, date, ...extra });
const NOON = new Date('2026-10-22T03:00:00Z'); // Thu, window 10-19 .. 10-25
const LAW_OK = { status: 'ok', items: [] };

test('loadWeekItems: keeps valid items, reports rejected ones, drops duplicate ids', () => {
  const files = [{ year: 2026, items: [
    item('a', '2026-11-02'),
    item('bad', '2026-11-03', { source: { name: 'x', url: 'http://example.org/' } }),
    item('a', '2026-11-04'),
  ] }];
  const { items, rejected, years } = loadWeekItems(files);
  assert.deepEqual(items.map((i) => [i.id, i.date]), [['a', '2026-11-02']]);
  assert.deepEqual(rejected.map((r) => r.id).sort(), ['a', 'bad']);
  assert.deepEqual(years, [2026]);
});

test('loadWeekItems: a file with no valid items does not count as prepared', () => {
  assert.deepEqual(loadWeekItems([{ year: 2026, items: [] }]).years, []);
  assert.deepEqual(loadWeekItems([]).years, []);
});

test('buildWeekView: only the window, sorted by date, timed items before untimed', () => {
  const { time, ...untimed } = item('u', '2026-10-21');
  const files = [{ year: 2026, items: [
    item('late', '2026-10-21', { time: '15:00' }),
    untimed,
    item('early', '2026-10-21', { time: '08:30' }),
    item('mon', '2026-10-19', { time: '10:00' }),
    item('outside', '2026-10-26', { time: '10:00' }),
  ] }];
  const view = buildWeekView({ now: NOON, files, law: LAW_OK });
  assert.equal(view.calendar.status, 'ok');
  assert.deepEqual(view.calendar.items.map((i) => i.id), ['mon', 'early', 'late', 'u']);
});

test('buildWeekView: a window spanning two years reads both files', () => {
  const files = [
    { year: 2026, items: [item('dec', '2026-12-30')] },
    { year: 2027, items: [item('jan', '2027-01-02', { date: '2027-01-02' })] },
  ];
  const view = buildWeekView({ now: new Date('2026-12-30T03:00:00Z'), files, law: LAW_OK });
  assert.deepEqual(view.calendar.items.map((i) => i.id), ['dec', 'jan']);
});

test('buildWeekView: a quiet week is "empty", an unprepared year is "not-prepared"', () => {
  const quiet = buildWeekView({ now: NOON, files: [{ year: 2026, items: [item('x', '2026-12-01')] }], law: LAW_OK });
  assert.equal(quiet.calendar.status, 'empty');
  for (const files of [[], [{ year: 2026, items: [] }], [{ year: 2025, items: [item('y', '2025-12-01', { date: '2025-12-01' })] }]]) {
    assert.equal(buildWeekView({ now: NOON, files, law: LAW_OK }).calendar.status, 'not-prepared');
  }
});

test('buildWeekView: invalid items never reach the calendar', () => {
  const files = [{ year: 2026, items: [item('bad', '2026-10-21', { source: { name: 'x', url: 'javascript:alert(1)' } })] }];
  const view = buildWeekView({ now: NOON, files, law: LAW_OK });
  assert.deepEqual(view.calendar.items, []);
  assert.deepEqual(view.rejected.map((r) => r.id), ['bad']);
});

test('buildWeekView: law status and cache hint', () => {
  const files = [{ year: 2026, items: [item('x', '2026-10-21')] }];
  const law = (l) => buildWeekView({ now: NOON, files, law: l });
  assert.deepEqual([law({ status: 'ok', items: [{ name: 'n', effective: '2026-10-21', kind: 'k' }] }).law.status, law({ status: 'ok', items: [] }).shortCache], ['ok', false]);
  assert.equal(law({ status: 'empty', items: [] }).law.status, 'empty');
  assert.equal(law({ status: 'empty', items: [] }).shortCache, false);
  const partial = law({ status: 'empty', items: [], partial: true });
  assert.deepEqual([partial.law.status, partial.shortCache], ['partial', true]);
  const down = law({ status: 'unavailable', items: [] });
  assert.deepEqual([down.law.status, down.shortCache], ['unavailable', true]);
});

// ── law effective dates ─────────────────────────────────────────────────────

const ver = (mst, effective, kind = '일부개정') => ({ mst, promulgated: '2026-06-01', effective, kind });
const status = (name, current, upcoming) => ({ ok: true, name, current, upcoming });

test('lawsEffectiveIn: upcoming versions inside the window, both ends included', () => {
  const statuses = [status('가법', ver('1', '2025-01-01'), [
    ver('2', '2026-10-19'), ver('3', '2026-10-25'), ver('4', '2026-10-26'), ver('5', '2026-10-18'),
  ])];
  assert.deepEqual(lawsEffectiveIn(statuses, '2026-10-19', '2026-10-25').map((l) => l.effective), ['2026-10-19', '2026-10-25']);
});

test('lawsEffectiveIn: a version that took effect this week (now current) still counts', () => {
  const statuses = [status('가법', ver('9', '2026-10-21', '타법개정'), [])];
  assert.deepEqual(lawsEffectiveIn(statuses, '2026-10-19', '2026-10-25'),
    [{ name: '가법', effective: '2026-10-21', kind: '타법개정' }]);
});

test('lawsEffectiveIn: the same version listed as current and upcoming appears once', () => {
  const v = ver('7', '2026-10-22');
  assert.equal(lawsEffectiveIn([status('가법', v, [v])], '2026-10-19', '2026-10-25').length, 1);
});

test('lawsEffectiveIn: sorted by date then name; empty input is empty', () => {
  const statuses = [
    status('나법', null, [ver('1', '2026-10-22')]),
    status('가법', null, [ver('2', '2026-10-22'), ver('3', '2026-10-20')]),
  ];
  assert.deepEqual(lawsEffectiveIn(statuses, '2026-10-19', '2026-10-25').map((l) => `${l.effective} ${l.name}`),
    ['2026-10-20 가법', '2026-10-22 가법', '2026-10-22 나법']);
  assert.deepEqual(lawsEffectiveIn([], '2026-10-19', '2026-10-25'), []);
});

// ── rendering ───────────────────────────────────────────────────────────────

const viewOf = ({ items = [item('x', '2026-10-21', { time: '09:00' })], files, law = LAW_OK, now = NOON } = {}) =>
  buildWeekView({ now, files: files ?? [{ year: 2026, items }], law });

test('renderWeekPage: canonical, title, shared stylesheets, no retired font, no em dash', () => {
  const html = renderWeekPage(viewOf());
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.kkandfriends\.com\/week">/);
  assert.match(html, /<title>이번 주 체크 포인트 · KK &amp; Friends<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="\/typography\.css">/);
  assert.doesNotMatch(html, /Source Serif/);
  assert.ok(!html.includes('—'), 'no em dash anywhere in the page');
  assert.doesNotMatch(html, /aria-current="page"/);
});

test('renderWeekPage: every item shows its source link and the day it was verified', () => {
  const html = renderWeekPage(viewOf());
  assert.match(html, /<a href="https:\/\/www\.bok\.or\.kr\/" rel="noopener noreferrer">한국은행 금융통화위원회 일정<\/a>/);
  assert.match(html, /2026\. 10\. 22\. 확인/);
  assert.match(html, /10월 21일 \(수\)/);
  assert.match(html, /09:00 KST/);
});

test('renderWeekPage: titles are escaped, never injected as markup', () => {
  const html = renderWeekPage(viewOf({ items: [item('x', '2026-10-21', { title: '<script>alert(1)</script> & x' })] }));
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; x/);
});

test('renderWeekPage: "not prepared" and "quiet week" use different words', () => {
  const quiet = renderWeekPage(viewOf({ files: [{ year: 2026, items: [item('z', '2026-12-01')] }] }));
  const unprepared = renderWeekPage(viewOf({ files: [] }));
  assert.match(quiet, /이번 주 예정된 주요 일정이 없습니다/);
  assert.doesNotMatch(quiet, /아직 준비되지 않았습니다/);
  assert.match(unprepared, /올해 일정이 아직 준비되지 않았습니다/);
  assert.doesNotMatch(unprepared, /예정된 주요 일정이 없습니다/);
});

test('renderWeekPage: each law state has its own words', () => {
  const law = (l) => renderWeekPage(viewOf({ law: l }));
  assert.match(law({ status: 'unavailable', items: [] }), /지금 확인할 수 없습니다/);
  assert.match(law({ status: 'empty', items: [], partial: true }), /일부만 확인됐습니다/);
  assert.match(law({ status: 'empty', items: [] }), /이번 주 시행되는 법령이 없습니다/);
  const listed = law({ status: 'ok', items: [{ name: '자본시장과 금융투자업에 관한 법률', effective: '2026-10-22', kind: '일부개정' }] });
  assert.match(listed, /자본시장과 금융투자업에 관한 법률/);
  assert.match(listed, /법제처/);
});

test('renderWeekPage: weekend view says it is next week', () => {
  const html = renderWeekPage(viewOf({ now: new Date('2026-10-25T10:00:00Z') }));
  assert.match(html, /다음 주 체크 포인트/);
  assert.match(html, /10월 26일 ~ 11월 1일/);
});

test('renderWeekPage: carries the standard investment disclaimer', () => {
  assert.match(renderWeekPage(viewOf()), /본 자료는 정보 제공 목적이며 특정 자산의 매수·매도 권유가 아닙니다\. 모든 투자 판단과 책임은 투자자 본인에게 있습니다\./);
});

test('homeWeekJson: five soonest entries, calendar and law merged by date', () => {
  const items = ['19', '20', '21', '22', '23', '24'].map((d) => item(`i${d}`, `2026-10-${d}`, { time: '09:00' }));
  const view = viewOf({ items, law: { status: 'ok', items: [{ name: '가법', effective: '2026-10-19', kind: '일부개정' }] } });
  const json = homeWeekJson(view);
  assert.deepEqual([json.from, json.to, json.isNextWeek], ['2026-10-19', '2026-10-25', false]);
  assert.equal(json.items.length, 5);
  assert.deepEqual(json.items.map((i) => i.date), ['2026-10-19', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.ok(json.items.some((i) => i.title === '가법 시행' && i.region === 'kr'));
});

test('homeWeekJson: nothing to show when the year is not prepared and no law applies', () => {
  assert.deepEqual(homeWeekJson(viewOf({ files: [] })).items, []);
});

// ── the /week handler ───────────────────────────────────────────────────────

const ROOT = path.resolve(import.meta.dirname, '..');
function fakeRes() {
  return {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
}
const FILES = [{ year: 2026, items: [item('x', '2026-10-21', { time: '09:00' })] }];
const deps = (over = {}) => ({ now: () => NOON, loadFiles: async () => FILES, fetchLaw: async () => LAW_OK, ...over });
const call = async (handler, req = { method: 'GET', query: {} }) => { const res = fakeRes(); await handler(req, res); return res; };

test('/week: 200 HTML with a one-hour CDN cache', async () => {
  const res = await call(makeWeekHandler(deps()));
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.headers['cache-control'], /s-maxage=3600/);
  assert.match(res.body, /한국은행 금융통화위원회/);
});

test('/week: when the law lookup is down the calendar still renders and the cache is short', async () => {
  const res = await call(makeWeekHandler(deps({ fetchLaw: async () => ({ status: 'unavailable', items: [] }) })));
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['cache-control'], /s-maxage=60(?!\d)/);
  assert.match(res.body, /한국은행 금융통화위원회/);
  assert.match(res.body, /지금 확인할 수 없습니다/);
});

test('/week: a law lookup that throws is treated as unavailable, not as a 500', async () => {
  const res = await call(makeWeekHandler(deps({ fetchLaw: async () => { throw new Error('boom'); } })));
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /지금 확인할 수 없습니다/);
});

test('/week: unreadable calendar data reads as "not prepared" with a short cache', async () => {
  const res = await call(makeWeekHandler(deps({ loadFiles: async () => { throw new Error('missing'); } })));
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /올해 일정이 아직 준비되지 않았습니다/);
  assert.match(res.headers['cache-control'], /s-maxage=60(?!\d)/);
});

test('/week?format=json: the home band payload, at most five items', async () => {
  const res = await call(makeWeekHandler(deps()), { method: 'GET', query: { format: 'json' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual([res.body.from, res.body.to, res.body.isNextWeek], ['2026-10-19', '2026-10-25', false]);
  assert.ok(res.body.items.length >= 1 && res.body.items.length <= 5);
});

test('/week: only GET and HEAD', async () => {
  assert.equal((await call(makeWeekHandler(deps()), { method: 'POST', query: {} })).statusCode, 405);
  assert.equal((await call(makeWeekHandler(deps()), { method: 'HEAD', query: {} })).statusCode, 200);
});

test('view=week is routed to the week handler', async () => {
  const res = await call(makeHandler(deps()), { method: 'GET', query: { view: 'week' } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<link rel="canonical" href="https:\/\/www\.kkandfriends\.com\/week">/);
});

test('/week is in the sitemap, rewritten by vercel.json, and not blocked in robots.txt', async () => {
  assert.ok(STATIC_PAGES.some((p) => p.path === '/week'));
  assert.match(buildSitemap([{ url: '/week' }]), /<loc>https:\/\/www\.kkandfriends\.com\/week<\/loc>/);
  const vercel = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.ok(vercel.rewrites.some((r) => r.source === '/week' && r.destination === '/api/desk?view=week'));
  assert.doesNotMatch(await readFile(path.join(ROOT, 'robots.txt'), 'utf8'), /Disallow:\s*\/week/);
});

test('existing function settings are untouched (fonts for the Instagram cards still ship)', async () => {
  const vercel = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.deepEqual(vercel.functions['api/desk.js'], { maxDuration: 30, includeFiles: 'fonts/Pretendard-*.otf' });
});

test('the week modules are loaded lazily, so they cannot break the other views', async () => {
  const src = await readFile(path.join(ROOT, 'api/desk.js'), 'utf8');
  assert.doesNotMatch(src, /^import .*week-(calendar|render)/m);
  assert.doesNotMatch(src, /^import .*data\/week-calendar/m);
});
