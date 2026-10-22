// 이번 주 체크 포인트: the pure parts (week window, item validation, view
// assembly) plus the renderers and the /week handler. Spec:
// docs/superpowers/specs/2026-10-22-week-calendar-design.md
import assert from 'node:assert/strict';
import test from 'node:test';

import { weekWindow, validateItem } from '../lib/week-calendar.js';

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
