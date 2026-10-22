// 이번 주 체크 포인트: the pure parts (week window, item validation, view
// assembly) plus the renderers and the /week handler. Spec:
// docs/superpowers/specs/2026-10-22-week-calendar-design.md
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { lawsEffectiveIn } from '../lib/stats/openlaw.js';
import CALENDAR from '../data/week-calendar/index.js';
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
  assert.match(quiet, /이번 주 .*일정은 없습니다/);
  assert.doesNotMatch(quiet, /아직 준비되지 않았습니다/);
  assert.match(unprepared, /올해 일정이 아직 준비되지 않았습니다/);
  assert.doesNotMatch(unprepared, /일정은 없습니다/);
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

// ── home band ───────────────────────────────────────────────────────────────

test('home: the week band starts hidden, comes after the latest-posts block and links to /week', async () => {
  const home = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(home, /<div class="ih-week" id="home-week" hidden>/);
  assert.match(home, /<a class="ih-all" href="\/week">전체 일정 보기 →<\/a>/);
  // After .ih-latest, so nothing that is already on the page moves when it appears.
  assert.ok(home.indexOf('id="home-week"') > home.indexOf('id="insights-latest-grid"'));
  assert.ok(home.indexOf('id="home-week"') < home.indexOf('loadLatestInsights'));
  // Hidden must win over the band's own display rules.
  assert.match(home, /\.insights-hub \.ih-week\[hidden\] \{ display:none; \}/);
});

test('home: the loader reads the JSON, builds rows with textContent and shows the band only with data', async () => {
  const home = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const start = home.indexOf('(function loadHomeWeek');
  assert.ok(start > 0, 'loader script exists');
  const loader = home.slice(start, home.indexOf('</script>', start));
  assert.match(loader, /fetch\('\/api\/desk\?view=week&format=json'/);
  assert.match(loader, /textContent/);
  assert.doesNotMatch(loader, /innerHTML|insertAdjacentHTML/);
  assert.match(loader, /!data\.items\.length\) return/);
  assert.match(loader, /band\.hidden = false/);
  assert.match(loader, /catch\(function\(\)\{\s*\/\* leave the band hidden/);
});

test('home: the band reuses the existing type scale and fonts', async () => {
  const home = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const css = home.slice(home.indexOf('.insights-hub .ih-week {'), home.indexOf('.insights-hub .ih-week {') + 1400);
  assert.match(css, /font-family: var\(--font-serif\); font-size:16\.5px/);
  assert.doesNotMatch(css, /font-family:\s*['"]/, 'named fonts are not allowed, only the variables');
  assert.match(css, /@media\(max-width:820px\)/);
});

test('home: the three series cards are exactly as before', async () => {
  const home = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal((home.match(/class="ih-series-card /g) ?? []).length, 3);
  assert.match(home, /\.insights-hub \.ih-series \{ display:grid; grid-template-columns:repeat\(3,1fr\)/);
});

// ── the shipped calendar data ───────────────────────────────────────────────

test('the shipped calendar: every item passes validation, ids are unique, 2026 is prepared', () => {
  const { rejected, years, items } = loadWeekItems(CALENDAR);
  assert.deepEqual(rejected, []);
  assert.ok(years.includes(2026), 'the 2026 file has verified items');
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const file of CALENDAR) assert.equal(typeof file.year, 'number');
});

test('the shipped calendar: official sources only, one of the sites that were actually read', () => {
  const hosts = new Set(loadWeekItems(CALENDAR).items.map((i) => new URL(i.source.url).hostname));
  for (const host of hosts) assert.match(host, /^(www\.bok\.or\.kr|www\.federalreserve\.gov|mods\.go\.kr)$/);
});

test('home: on phones the date column stops being a fixed 112px (it would become a tall gap in a column layout)', async () => {
  const home = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(home, /@media\(max-width:820px\)\{ \.insights-hub \.ih-week-list li \{ flex-direction:column; gap:4px; \} \.insights-hub \.ih-week-when \{ flex:none; \} \}/);
});

// ── final-review fixes (2026-10-22) ─────────────────────────────────────────

const COVERED = { covers: ['한국은행', '미국 Fed'], missing: ['통계청', '미국 BLS'] };

test('a quiet week names what was checked and what is not listed, so it cannot pass for "nothing happens"', () => {
  const files = [{ year: 2026, ...COVERED, items: [item('z', '2026-12-01')] }];
  const html = renderWeekPage(viewOf({ files, now: new Date('2026-11-04T03:00:00Z') }));
  assert.match(html, /이번 주 한국은행·미국 Fed 일정은 없습니다/);
  assert.match(html, /아직 싣지 않는 일정: 통계청·미국 BLS/);
  assert.doesNotMatch(html, /예정된 주요 일정이 없습니다/);
});

test('the not-listed note also shows on a week that does have items', () => {
  const html = renderWeekPage(viewOf({ files: [{ year: 2026, ...COVERED, items: [item('x', '2026-10-21')] }] }));
  assert.match(html, /아직 싣지 않는 일정: 통계청·미국 BLS/);
});

test('the page description does not claim sources that are not in the data', () => {
  const html = renderWeekPage(viewOf());
  assert.doesNotMatch(html, /<meta name="description" content="[^"]*통계청/);
});

test('weekend wording says next week in the empty messages too', () => {
  const files = [{ year: 2026, ...COVERED, items: [item('z', '2026-12-01')] }];
  const html = renderWeekPage(viewOf({ files, now: new Date('2026-11-07T03:00:00Z'), law: { status: 'empty', items: [] } }));
  assert.match(html, /다음 주 한국은행·미국 Fed 일정은 없습니다/);
  assert.match(html, /다음 주 시행되는 법령이 없습니다/);
  assert.doesNotMatch(html, /이번 주 시행되는 법령|이번 주 한국은행/);
});

test('year-end: a window that touches 2027 is "not prepared" unless the 2027 file has items', () => {
  const only2026 = [{ year: 2026, ...COVERED, items: [item('dec', '2026-12-30')] }];
  const view = buildWeekView({ now: new Date('2026-12-30T03:00:00Z'), files: only2026, law: LAW_OK });
  assert.equal(view.calendar.status, 'not-prepared');
});

test('a short-cache response may be served stale while it refreshes (no jump when the band appears late)', async () => {
  const res = await call(makeWeekHandler(deps({ fetchLaw: async () => ({ status: 'unavailable', items: [] }) })));
  assert.match(res.headers['cache-control'], /s-maxage=60.*stale-while-revalidate=\d+/);
});

test('the law-unavailable message does not promise a retry (it may be a missing setting)', () => {
  const html = renderWeekPage(viewOf({ law: { status: 'unavailable', items: [] } }));
  assert.match(html, /지금 확인할 수 없습니다/);
  assert.doesNotMatch(html, /다시 확인해 주세요/);
});

test('US items say their date is the local US date', () => {
  for (const i of loadWeekItems(CALENDAR).items.filter((x) => x.region === 'us')) {
    assert.match(i.title + i.note, /현지/, i.id);
  }
});

test('shipped files declare what they cover and what they do not', () => {
  for (const f of CALENDAR) {
    assert.ok(Array.isArray(f.covers) && f.covers.length > 0, `${f.year}: covers`);
    assert.ok(Array.isArray(f.missing), `${f.year}: missing`);
  }
});

test('home loader builds every row before touching the list, so a bad row cannot leave a half-filled band', async () => {
  const home = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const start = home.indexOf('(function loadHomeWeek');
  const loader = home.slice(start, home.indexOf('</script>', start));
  assert.match(loader, /var rows = data\.items\.map\(/);
  assert.match(loader, /list\.append\.apply\(list, rows\)/);
  assert.ok(loader.indexOf('data.items.map(') < loader.indexOf('list.append.apply'));
});

// 2026-10-22: 국가데이터처(옛 통계청) 「2026년 물가, 고용, 산업활동동향 보도계획」(mods.go.kr, PDF) 에서 읽은 날짜.
// 같은 날 10월 월간 보도계획 페이지의 10/2·10/16·10/30과 일치함을 확인했다.
const NDS = [
  ['2026-10-30', '2026년 9월 산업활동동향', '08:00'],
  ['2026-11-03', '2026년 10월 소비자물가동향'],
  ['2026-11-11', '2026년 10월 고용동향'],
  ['2026-11-30', '2026년 10월 산업활동동향'],
  ['2026-12-02', '2026년 11월 소비자물가동향'],
  ['2026-12-16', '2026년 11월 고용동향'],
  ['2026-12-30', '2026년 11월 산업활동동향'],
  ['2026-12-31', '2026년 12월 및 연간 소비자물가동향'],
];

test('the shipped calendar carries the key-indicator dates read from the 국가데이터처 plan', () => {
  const items = loadWeekItems(CALENDAR).items.filter((i) => new URL(i.source.url).hostname === 'mods.go.kr');
  assert.deepEqual(items.map((i) => i.date), NDS.map(([d]) => d));
  for (const [date, label, time] of NDS) {
    const item = items.find((i) => i.date === date);
    assert.ok(item.title.includes(label.replace(/^2026년 /, '').replace(/^(\d+월)(?: 및 연간)? /, '$1 ').split(' ').pop()), `${date} title`);
    assert.equal(item.time, time, `${date} time`);
    assert.equal(item.region, 'kr');
  }
});

test('the 국가데이터처 items name the stat in plain words and the month it covers', () => {
  const items = loadWeekItems(CALENDAR).items.filter((i) => new URL(i.source.url).hostname === 'mods.go.kr');
  for (const i of items) assert.match(i.title, /(소비자물가|고용|산업활동)동향/, i.id);
  assert.ok(items.some((i) => /10월분/.test(i.note)) && items.some((i) => /11월분/.test(i.note)));
});

test('coverage now names the 국가데이터처 indicators and no longer lists 통계청 as missing', () => {
  const f = CALENDAR.find((x) => x.year === 2026);
  assert.ok(f.covers.some((c) => c.includes('국가데이터처')));
  assert.ok(!f.missing.some((m) => m.includes('통계청 주요 지표')));
  assert.ok(f.missing.some((m) => m.includes('BLS')), 'BLS is still unread');
});

test('a week with an indicator release lists it (Oct 26 week has the 10/30 industrial output release)', () => {
  const view = buildWeekView({ now: new Date('2026-10-27T03:00:00Z'), files: CALENDAR, law: LAW_OK });
  const days = view.calendar.items.map((i) => i.date);
  assert.ok(days.includes('2026-10-28') && days.includes('2026-10-30'));
});
