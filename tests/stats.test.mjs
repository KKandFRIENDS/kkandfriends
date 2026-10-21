import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { redact, kstYmd, isoFromYmd, isoFromKoreanDate, toNumber, formatWon, withQuery } from '../lib/stats/http.js';
import {
  classifyReport, callDart, fetchMajorReports, summarizeReports, formatSummaryLines,
  parseRightsIssue, parseConvertibleBond, fetchDisclosureSnapshot, fetchFilingDetail,
} from '../lib/stats/dart.js';
import {
  callLawSearch, fetchLawVersions, fetchLawStatus, fetchLawWatch, diffLawState, formatLawLines,
  recentPromulgations, watchedLaws, DEFAULT_LAWS,
} from '../lib/stats/openlaw.js';
import { callKosis, fetchKosisIndicator, formatPeriod, INDICATORS } from '../lib/stats/kosis.js';
import { fetchOfficialStats, crossCheck, renderCard, statsInBriefsEnabled, gatherCardEntries } from '../lib/stats/index.js';
import { runLawWatch } from '../lib/stats/law-watch.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// ─── helpers ────────────────────────────────────────────────────────────────

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => handler(String(url), opts);
  return () => { globalThis.fetch = original; };
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status });

async function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const KEY = 'TESTKEY-abcdef-123456';

// Shapes copied from live calls on 2026-10-21 (company names are fictional).
const dartRow = (over = {}) => ({
  corp_cls: 'K', corp_code: '00000001', corp_name: '가나다바이오', flr_nm: '가나다바이오',
  rcept_dt: '20261021', rcept_no: '20261021000001', report_nm: '주요사항보고서(전환사채권발행결정)',
  rm: '코', stock_code: '123456', ...over,
});
const dartList = (rows, extra = {}) => ({ status: '000', message: '정상', page_no: 1, page_count: 100, total_count: rows.length, total_page: 1, list: rows, ...extra });

// ─── http.js ────────────────────────────────────────────────────────────────

test('redact scrubs a secret and its URL-encoded form, and ignores trivial ones', () => {
  assert.equal(redact('failed https://x/?k=abc%2Bdef&z=1', ['abc+def']), 'failed https://x/?k=***&z=1');
  assert.equal(redact(`token ${KEY} end`, [KEY]), 'token *** end');
  assert.equal(redact('abc', ['a']), 'abc'); // too short to be a secret
});

test('date and number helpers', () => {
  assert.equal(kstYmd(new Date('2026-10-21T16:00:00Z')), '20261022'); // 01:00 KST next day
  assert.equal(kstYmd(new Date('2026-10-21T03:00:00Z'), -6), '20261015');
  assert.equal(isoFromYmd('20261021'), '2026-10-21');
  assert.equal(isoFromKoreanDate('2026년 10월 21일'), '2026-10-21');
  assert.equal(isoFromKoreanDate('2030년 1월 5일'), '2030-01-05');
  assert.equal(isoFromKoreanDate('-'), '');
  assert.equal(toNumber('18,000,000,000'), 18000000000);
  assert.equal(toNumber('-'), null);
  assert.equal(formatWon(18000000000), '180억원');
  assert.equal(formatWon(1.25e12), '1.25조원');
  assert.equal(formatWon(5000000), '500만원');
  assert.match(withQuery('http://x/a', { a: 1, b: '', c: undefined, d: '한글' }), /^http:\/\/x\/a\?a=1&d=/);
});

// ─── DART ───────────────────────────────────────────────────────────────────

test('classifyReport reads the kind and flags amendments', () => {
  assert.deepEqual(classifyReport('주요사항보고서(유상증자결정)'), { kind: 'rights', label: '유상증자 결정', amended: false });
  assert.equal(classifyReport('[기재정정]주요사항보고서(전환사채권발행결정)').amended, true);
  assert.equal(classifyReport('[기재정정]주요사항보고서(전환사채권발행결정)').kind, 'cb');
  assert.equal(classifyReport('주요사항보고서(자기전환사채매도결정)').kind, null); // not an issuance
  assert.equal(classifyReport('분기보고서').kind, null);
});

test('DART client: no key is an error, 013 is an empty success, other statuses are errors', async () => {
  await withEnv({ DART_API_KEY: undefined }, async () => {
    assert.deepEqual(await callDart('list.json'), { ok: false, error: 'DART_API_KEY is not set' });
  });
  await withEnv({ DART_API_KEY: KEY }, async () => {
    let restore = mockFetch(() => json({ status: '013', message: '조회된 데이타가 없습니다.' }));
    try { assert.deepEqual(await callDart('list.json'), { ok: true, list: [], total: 0, totalPage: 0 }); } finally { restore(); }
    restore = mockFetch(() => json({ status: '010', message: '등록되지 않은 키입니다.' }));
    try { assert.match((await callDart('list.json')).error, /^DART 010/); } finally { restore(); }
  });
});

test('DART client never puts the key in an error string', async () => {
  await withEnv({ DART_API_KEY: KEY }, async () => {
    const restore = mockFetch((url) => { throw new Error(`connect failed for ${url}`); });
    try {
      const res = await callDart('list.json');
      assert.equal(res.ok, false);
      assert.ok(!res.error.includes(KEY), res.error);
    } finally { restore(); }
  });
});

test('fetchMajorReports keeps the kinds we track, flags amendments, labels the market', async () => {
  await withEnv({ DART_API_KEY: KEY }, async () => {
    const rows = [
      dartRow(),
      dartRow({ corp_code: '2', corp_name: '라마사', corp_cls: 'Y', rcept_no: '2', report_nm: '[기재정정]주요사항보고서(유상증자결정)' }),
      dartRow({ corp_code: '3', corp_name: '바사', rcept_no: '3', report_nm: '주요사항보고서(유상증자결정)' }),
      dartRow({ corp_code: '4', rcept_no: '4', report_nm: '분기보고서' }),
    ];
    const restore = mockFetch(() => json(dartList(rows)));
    try {
      const res = await fetchMajorReports({ days: 1, now: new Date('2026-10-21T08:00:00Z') });
      assert.equal(res.ok, true);
      assert.equal(res.scanned, 4);
      assert.equal(res.items.length, 3);
      assert.equal(res.from, '20261021');
      assert.equal(res.to, '20261021');
      assert.equal(res.items.find((i) => i.corpName === '라마사').market, '유가증권');
      assert.equal(res.items.find((i) => i.corpName === '라마사').amended, true);
      assert.match(res.items[0].url, /^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=/);
    } finally { restore(); }
  });
});

test('summaries count NEW filings only and carry no company names', async () => {
  const items = [
    { kind: 'cb', label: '전환사채 발행 결정', market: '코스닥', amended: false, corpName: '가나다바이오' },
    { kind: 'cb', label: '전환사채 발행 결정', market: '코스닥', amended: false, corpName: '라마사' },
    { kind: 'cb', label: '전환사채 발행 결정', market: '유가증권', amended: true, corpName: '바사' },
    { kind: 'rights', label: '유상증자 결정', market: '유가증권', amended: false, corpName: '사아자' },
  ];
  const summary = summarizeReports(items);
  const cb = summary.find((s) => s.kind === 'cb');
  assert.equal(cb.total, 2); // the amendment is not a new filing
  const lines = formatSummaryLines(summary, { from: '20261021', to: '20261021', asOf: '17:30' });
  const text = lines.map((l) => l.formatted).join('\n');
  assert.match(text, /전환사채 발행 결정 2건/);
  assert.match(text, /2026-10-21/);
  assert.match(text, /17:30 접수분까지/);
  for (const name of ['가나다바이오', '라마사', '바사', '사아자']) assert.ok(!text.includes(name), name);
});

test('DART detail parsers turn live-shaped rows into printable lines', () => {
  const cb = parseConvertibleBond({
    bd_fta: '18,000,000,000', bd_intr_ex: '0.0', bd_intr_sf: '0.0', bd_mtd: '2030년 12월 11일',
    bd_tm: '7', bddd: '2026년 10월 21일', cv_prc: '1,142', corp_name: '가나다바이오',
  });
  assert.equal(cb.face, 18000000000);
  assert.equal(cb.maturity, '2030-12-11');
  assert.match(cb.formatted, /가나다바이오 전환사채 7회차 180억원/);
  assert.match(cb.formatted, /전환가액 1,142원/);
  assert.match(cb.formatted, /이사회결의 2026-10-21/);

  const ri = parseRightsIssue({ nstk_ostk_cnt: '326,796', bfic_tisstk_ostk: '25,185,909', ic_mthn: '제3자배정증자', corp_name: '라마사' });
  assert.equal(ri.ratio, 1.3);
  assert.match(ri.formatted, /제3자배정증자/);
  assert.match(ri.formatted, /326,796주/);
  assert.equal(parseRightsIssue({ nstk_ostk_cnt: '-' }), null);
});

test('fetchFilingDetail ties the row to the receipt number', async () => {
  await withEnv({ DART_API_KEY: KEY }, async () => {
    const item = { kind: 'cb', corpName: '가나다바이오', corpCode: '00000001', rceptNo: '20261021000001', rceptDt: '20261021', url: 'u' };
    const rows = [
      { rcept_no: '20260901000009', bd_fta: '1,000,000,000', bd_tm: '6' },
      { rcept_no: '20261021000001', bd_fta: '18,000,000,000', bd_tm: '7', bddd: '2026년 10월 21일' },
    ];
    const restore = mockFetch(() => json(dartList(rows)));
    try {
      const res = await fetchFilingDetail(item);
      assert.equal(res.ok, true);
      assert.match(res.formatted, /7회차 180억원/);
    } finally { restore(); }
    assert.equal((await fetchFilingDetail({ kind: 'merger' })).ok, false);
  });
});

test('fetchDisclosureSnapshot never throws and returns lines', async () => {
  await withEnv({ DART_API_KEY: KEY }, async () => {
    let restore = mockFetch(() => json(dartList([dartRow()])));
    try {
      const res = await fetchDisclosureSnapshot({ days: 1, now: new Date('2026-10-21T08:00:00Z'), asOf: '17:30' });
      assert.equal(res.ok, true);
      assert.equal(res.lines.length, 1);
    } finally { restore(); }
    restore = mockFetch(() => { throw new Error('boom'); });
    try { assert.equal((await fetchDisclosureSnapshot({})).ok, false); } finally { restore(); }
  });
});

// ─── OpenLaw ────────────────────────────────────────────────────────────────

const law = (name, over = {}) => ({
  '법령명한글': name, '법령일련번호': '288615', '공포일자': '20260804', '시행일자': '20261002',
  '제개정구분명': '타법개정', '현행연혁코드': '현행', '소관부처명': '금융위원회', ...over,
});
const lawPayload = (rows) => ({ LawSearch: { target: 'eflaw', resultCode: '00', resultMsg: 'success', totalCnt: String(rows.length), law: rows.length === 1 ? rows[0] : rows } });
const ROOT_LAW = DEFAULT_LAWS[0];

test('OpenLaw client: no OC is an error; a single hit arrives as an object and is normalized', async () => {
  await withEnv({ OPENLAW_OC: undefined }, async () => {
    assert.deepEqual(await callLawSearch({ target: 'law' }), { ok: false, error: 'OPENLAW_OC is not set' });
  });
  await withEnv({ OPENLAW_OC: 'myocid' }, async () => {
    const restore = mockFetch(() => json(lawPayload([law(ROOT_LAW)])));
    try {
      const res = await callLawSearch({ target: 'law' });
      assert.equal(res.ok, true);
      assert.equal(res.rows.length, 1);
    } finally { restore(); }
  });
});

test('OpenLaw: substring hits (시행령, 시행규칙) are filtered to the exact name', async () => {
  await withEnv({ OPENLAW_OC: 'myocid' }, async () => {
    const rows = [law(ROOT_LAW), law(`${ROOT_LAW} 시행령`, { '법령일련번호': '291081' })];
    const restore = mockFetch(() => json(lawPayload(rows)));
    try {
      const res = await fetchLawVersions(ROOT_LAW, 3);
      assert.equal(res.versions.length, 1);
      assert.equal(res.versions[0].mst, '288615');
      assert.equal(res.versions[0].effective, '2026-10-02');
    } finally { restore(); }
  });
});

test('OpenLaw: an error code in the payload is an error, and the OC never leaks', async () => {
  await withEnv({ OPENLAW_OC: 'myocid' }, async () => {
    let restore = mockFetch(() => json({ LawSearch: { resultCode: '01', resultMsg: '사용자 정보 검증에 실패하였습니다.' } }));
    try { assert.match((await callLawSearch({})).error, /^OpenLaw 01/); } finally { restore(); }
    restore = mockFetch((url) => { throw new Error(`reset ${url}`); });
    try { assert.ok(!(await callLawSearch({})).error.includes('myocid')); } finally { restore(); }
  });
});

test('fetchLawStatus sorts upcoming versions soonest first; fetchLawWatch reports partial failure', async () => {
  await withEnv({ OPENLAW_OC: 'myocid' }, async () => {
    const restore = mockFetch((url) => {
      const u = new URL(url);
      if (u.searchParams.get('query') === 'BROKEN') return json({ LawSearch: { resultCode: '99', resultMsg: 'x' } });
      const nw = u.searchParams.get('nw');
      const name = u.searchParams.get('query');
      if (nw === '3') return json(lawPayload([law(name)]));
      return json(lawPayload([
        law(name, { '법령일련번호': '2', '시행일자': '20270204', '현행연혁코드': '시행예정' }),
        law(name, { '법령일련번호': '3', '시행일자': '20261113', '현행연혁코드': '시행예정' }),
      ]));
    });
    try {
      const status = await fetchLawStatus(ROOT_LAW);
      assert.deepEqual(status.upcoming.map((u) => u.effective), ['2026-11-13', '2027-02-04']);
      const watch = await fetchLawWatch({ names: [ROOT_LAW, 'BROKEN'] });
      assert.equal(watch.ok, true);
      assert.equal(watch.statuses.length, 1);
      assert.equal(watch.errors.length, 1);
      assert.match(watch.errors[0], /^BROKEN/);
    } finally { restore(); }
  });
});

test('OPENLAW_WATCH overrides the default list', async () => {
  await withEnv({ OPENLAW_WATCH: undefined }, async () => assert.deepEqual(watchedLaws(), DEFAULT_LAWS));
  await withEnv({ OPENLAW_WATCH: '전자금융거래법, 신용정보의 이용 및 보호에 관한 법률' }, async () => {
    assert.deepEqual(watchedLaws(), ['전자금융거래법', '신용정보의 이용 및 보호에 관한 법률']);
  });
});

function status(name, currentMst, upcomingMsts = []) {
  return {
    ok: true, name,
    current: { name, mst: currentMst, promulgated: '2026-08-04', effective: '2026-10-02', kind: '타법개정', status: '현행' },
    upcoming: upcomingMsts.map((m, i) => ({ name, mst: m, promulgated: '2026-09-08', effective: `2026-1${i + 1}-09`, kind: '일부개정', status: '시행예정' })),
  };
}

test('diffLawState: first run is a baseline with no changes; later runs report real changes only', () => {
  const first = diffLawState(null, [status('A법', '1', ['10', '11'])]);
  assert.equal(first.baseline, true);
  assert.deepEqual(first.changes, []);

  const same = diffLawState(first.next, [status('A법', '1', ['10', '11'])]);
  assert.equal(same.baseline, false);
  assert.deepEqual(same.changes, []);

  const added = diffLawState(first.next, [status('A법', '1', ['10', '11', '12'])]);
  assert.equal(added.changes.length, 1);
  assert.equal(added.changes[0].type, 'upcoming');

  const inForce = diffLawState(first.next, [status('A법', '2', ['11'])]);
  assert.equal(inForce.changes.some((c) => c.type === 'in_force'), true);
  assert.equal(inForce.changes.some((c) => c.type === 'upcoming'), false); // 10 left the list, nothing new was added
});

test('law lines mention the next effective dates and drop dates already past', () => {
  const s = status('A법', '1', ['10', '11']); // upcoming 2026-11-09, 2026-12-09
  const [line] = formatLawLines([s], '2026-11-20');
  assert.match(line.formatted, /시행예정 개정 1건/);
  assert.match(line.formatted, /2026-12-09/);
  assert.ok(!line.formatted.includes('2026-11-09'));
  assert.equal(recentPromulgations([s], '2026-09-20', 14)[0]?.ageDays, 12);
});

// ─── KOSIS ──────────────────────────────────────────────────────────────────

test('KOSIS client: no key, error object, and row arrays', async () => {
  await withEnv({ KOSIS_API_KEY: undefined }, async () => {
    assert.equal((await callKosis('x')).error, 'KOSIS_API_KEY is not set');
  });
  await withEnv({ KOSIS_API_KEY: KEY }, async () => {
    let restore = mockFetch(() => json({ err: '11', errMsg: '유효하지 않은 인증KEY입니다.' }));
    try {
      const res = await callKosis('Param/statisticsParameterData.do');
      assert.equal(res.ok, false);
      assert.match(res.error, /^KOSIS 11/);
    } finally { restore(); }
    restore = mockFetch(() => json([{ PRD_DE: '202609' }]));
    try { assert.equal((await callKosis('x')).rows.length, 1); } finally { restore(); }
    restore = mockFetch((url) => { throw new Error(`down ${url}`); });
    try { assert.ok(!(await callKosis('x')).error.includes(KEY)); } finally { restore(); }
  });
});

test('KOSIS indicators stay OFF until verified, and population needs its table id first', async () => {
  assert.equal(INDICATORS.cpi.verified, false);
  await withEnv({ KOSIS_API_KEY: KEY, KOSIS_UNVERIFIED: undefined }, async () => {
    assert.match((await fetchKosisIndicator('cpi')).error, /not verified/);
    assert.match((await fetchKosisIndicator('population')).error, /table id not confirmed/);
    assert.match((await fetchKosisIndicator('nope')).error, /unknown/);
  });
});

test('KOSIS CPI is read from labels when explicitly enabled', async () => {
  await withEnv({ KOSIS_API_KEY: KEY, KOSIS_UNVERIFIED: '1' }, async () => {
    const rows = [
      { PRD_DE: '202608', DT: '119.5', UNIT_NM: '2020=100', ITM_NM: '소비자물가지수', C1_NM: '총지수' },
      { PRD_DE: '202609', DT: '119.77', UNIT_NM: '2020=100', ITM_NM: '소비자물가지수', C1_NM: '총지수' },
      { PRD_DE: '202609', DT: '2.1', UNIT_NM: '%', ITM_NM: '전년동월대비증감률', C1_NM: '총지수' },
      { PRD_DE: '202609', DT: '99', UNIT_NM: '2020=100', ITM_NM: '소비자물가지수', C1_NM: '식료품' },
    ];
    const restore = mockFetch(() => json(rows));
    try {
      const res = await fetchKosisIndicator('cpi');
      assert.equal(res.ok, true);
      assert.equal(res.num, 119.77);
      assert.equal(res.asOf, '2026년 9월');
      assert.match(res.formatted, /소비자물가지수\(총지수\) 119\.77 2020=100 \(2026년 9월 기준\)/);
    } finally { restore(); }
  });
  assert.equal(formatPeriod('2026'), '2026년');
});

// ─── index.js ───────────────────────────────────────────────────────────────

test('STATS_IN_BRIEFS is off unless exactly "1"', async () => {
  await withEnv({ STATS_IN_BRIEFS: undefined }, async () => assert.equal(statsInBriefsEnabled(), false));
  await withEnv({ STATS_IN_BRIEFS: 'true' }, async () => assert.equal(statsInBriefsEnabled(), false));
  await withEnv({ STATS_IN_BRIEFS: '1' }, async () => assert.equal(statsInBriefsEnabled(), true));
});

test('fetchOfficialStats skips unconfigured providers silently and isolates failures', async () => {
  await withEnv({ DART_API_KEY: undefined, OPENLAW_OC: undefined }, async () => {
    assert.deepEqual(await fetchOfficialStats(), { disclosure: [], law: [], errors: [] });
  });
  await withEnv({ DART_API_KEY: KEY, OPENLAW_OC: 'myocid' }, async () => {
    const restore = mockFetch((url) => {
      if (url.includes('opendart')) return json(dartList([dartRow()]));
      throw new Error('law.go.kr unreachable');
    });
    try {
      const res = await fetchOfficialStats({ now: new Date('2026-10-21T08:00:00Z') });
      assert.equal(res.disclosure.length, 1);
      assert.equal(res.law.length, 0);
      assert.ok(res.errors.some((e) => e.startsWith('openlaw:')));
      assert.ok(res.errors.every((e) => !e.includes(KEY) && !e.includes('myocid')));
    } finally { restore(); }
  });
});

test('crossCheck compares only the same period and flags disagreement', () => {
  const ecos = { num: 119.77, asOf: '2026년 9월' };
  const ok = { ok: true, num: 119.77, asOf: '2026년 9월' };
  assert.equal(crossCheck(ecos, ok).status, '일치');
  assert.equal(crossCheck(ecos, { ...ok, num: 120.5 }).status, '불일치');
  assert.equal(crossCheck(ecos, { ...ok, asOf: '2026년 8월' }).status, '비교 불가');
  assert.equal(crossCheck(ecos, { ok: false }).status, '비교 불가');
  assert.equal(crossCheck(null, ok).status, '비교 불가');
});

test('the card lists what is missing instead of hiding it, and never prints a key', async () => {
  await withEnv({ ECOS_API_KEY: undefined, DART_API_KEY: undefined, OPENLAW_OC: undefined, KOSIS_API_KEY: undefined }, async () => {
    const card = await gatherCardEntries({ now: new Date('2026-10-21T08:00:00Z') });
    const md = renderCard(card);
    assert.match(md, /^## 수치 카드 \(조회 2026-10-21 /);
    assert.match(md, /### 확인 필요/);
    assert.match(md, /DART_API_KEY is not set/);
    assert.match(md, /OPENLAW_OC is not set/);
    assert.match(md, /통계표 ID 또는 응답 형식이 아직 실제 응답으로 확인되지 않았습니다/);
    assert.ok(!/\|---/.test(md), 'no tables: the lounge renderer does not support them');
  });
});

// ─── law-watch ──────────────────────────────────────────────────────────────

function watchHarness({ prev = null, statuses, notifyResult = { ok: true }, configured = true, watchResult } = {}) {
  const calls = { notify: [], writes: [] };
  return {
    calls,
    opts: {
      stateFile: '/tmp/x/law-watch.json',
      configured: () => configured,
      fetchWatch: async () => watchResult ?? { ok: true, statuses, errors: [] },
      notify: async (t) => { calls.notify.push(t); return notifyResult; },
      readState: async () => prev,
      writeState: async (f, v) => { calls.writes.push(v); },
    },
  };
}

test('law watch: the first run records a baseline and sends nothing', async () => {
  const h = watchHarness({ statuses: [status('A법', '1', ['10'])] });
  const res = await runLawWatch(h.opts);
  assert.equal(res.ok, true);
  assert.equal(res.baseline, true);
  assert.equal(h.calls.notify.length, 0);
  assert.equal(h.calls.writes.length, 1);
});

test('law watch: a new scheduled amendment alerts once and then saves state', async () => {
  const base = diffLawState(null, [status('A법', '1', ['10'])]).next;
  const h = watchHarness({ prev: base, statuses: [status('A법', '1', ['10', '11'])] });
  const res = await runLawWatch(h.opts);
  assert.equal(res.ok, true);
  assert.equal(res.alerted, true);
  assert.equal(h.calls.notify.length, 1);
  assert.match(h.calls.notify[0], /법령 변경 감지/);
  assert.equal(h.calls.writes.length, 1);
});

test('law watch: if the alert cannot be sent the state is NOT saved, so the next run retries', async () => {
  const base = diffLawState(null, [status('A법', '1', ['10'])]).next;
  const h = watchHarness({ prev: base, statuses: [status('A법', '1', ['10', '11'])], notifyResult: { ok: false, error: 'telegram down' } });
  const res = await runLawWatch(h.opts);
  assert.equal(res.ok, false);
  assert.match(res.error, /알림을 보내지 못했습니다/);
  assert.equal(h.calls.writes.length, 0);
});

test('law watch: a missing key or failed read is a loud failure, never a quiet skip', async () => {
  let h = watchHarness({ configured: false, statuses: [] });
  let res = await runLawWatch(h.opts);
  assert.equal(res.ok, false);
  assert.equal(h.calls.notify.length, 1);
  assert.match(h.calls.notify[0], /법령 감시 실패/);

  h = watchHarness({ watchResult: { ok: false, statuses: [], errors: [], error: 'HTTP 503' }, statuses: [] });
  res = await runLawWatch(h.opts);
  assert.equal(res.ok, false);
  assert.equal(h.calls.writes.length, 0);
});

test('law watch --dry sends nothing and writes nothing', async () => {
  const base = diffLawState(null, [status('A법', '1', ['10'])]).next;
  const h = watchHarness({ prev: base, statuses: [status('A법', '1', ['10', '11'])] });
  const res = await runLawWatch({ ...h.opts, dry: true });
  assert.equal(res.ok, true);
  assert.equal(res.changes.length, 1);
  assert.equal(h.calls.notify.length, 0);
  assert.equal(h.calls.writes.length, 0);
});

test('a partial read keeps the previous state of the law that could not be read', async () => {
  const prev = diffLawState(null, [status('A법', '1', ['10']), status('B법', '5', [])]).next;
  const h = watchHarness({ prev, watchResult: { ok: true, statuses: [status('A법', '1', ['10'])], errors: ['B법: HTTP 500'] } });
  const res = await runLawWatch(h.opts);
  assert.equal(res.ok, true);
  assert.equal(h.calls.writes[0]['B법'].currentMst, '5');
  assert.ok(h.calls.notify.some((t) => /일부 실패/.test(t)));
});

// ─── wiring ─────────────────────────────────────────────────────────────────

test('the briefs image ships lib/stats and the env keys the stats layer reads', async () => {
  const dockerfile = await readFile(path.join(ROOT, 'ops/briefs/Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY lib\/stats \/app\/lib\/stats/);
  assert.match(dockerfile, /ops\/briefs\/law-watch\.mjs/);
  const saveEnv = await readFile(path.join(ROOT, 'ops/briefs/save-env.mjs'), 'utf8');
  for (const key of ['DART_API_KEY', 'OPENLAW_OC', 'KOSIS_API_KEY', 'STATS_IN_BRIEFS']) {
    assert.match(saveEnv, new RegExp(`'${key}'`), key);
  }
  const envExample = await readFile(path.join(ROOT, 'ops/briefs/env.example'), 'utf8');
  assert.match(envExample, /STATS_IN_BRIEFS/);
});

test('the 17:30 brief asks for official stats only behind the flag, and tells the model no company names exist', async () => {
  const src = await readFile(path.join(ROOT, 'lib/briefs/korea-close.js'), 'utf8');
  assert.match(src, /statsInBriefsEnabled\(\)/);
  assert.match(src, /개별 기업 이름은 여기 없다/);
  assert.match(src, /맞물리지 않으면 쓰지 않는다/);
  // The global (07:00) brief is untouched: official stats are a Korea-close input.
  const global = await readFile(path.join(ROOT, 'lib/briefs/global.js'), 'utf8');
  assert.doesNotMatch(global, /stats\/index\.js/);
});

test('no secret-looking literal is committed in lib/stats', async () => {
  for (const f of ['http.js', 'dart.js', 'openlaw.js', 'kosis.js', 'index.js', 'law-watch.js']) {
    const text = await readFile(path.join(ROOT, 'lib/stats', f), 'utf8');
    assert.doesNotMatch(text, /[A-Za-z0-9]{32,}/, f);
  }
});
