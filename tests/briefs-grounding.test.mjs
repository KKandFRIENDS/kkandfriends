import assert from 'node:assert/strict';
import test from 'node:test';

import { enforceGrounding, findInventedNumbers, findStylePatterns, providedNumbers } from '../lib/briefs/grounding.js';

// 2026-10-30: the longer prompt made the model invent thresholds and read FX as fund flows.
const SOURCE = `S&P 500 7,720.39 (-0.30%) 나스닥 26,184.73 (-1.38%) VIX 17.20 (+1.71%) 미 10년물 4.989% (-5.6bp)
원/달러 1,335.0 (-0.40%) WTI 103.38 (+1.35%) 비트코인 78,446 (-3.47%) 코스피 5,672.39 (-4.47%) 코스닥 720.45 (-4.35%)
삼성전자 222,250 (-4.20%) SK하이닉스 1,409,000 (-7.67%) 신용스프레드 68.3bp 국고채(3년) 3.766% 외국인 증권투자(순유입) -48.5 억달러
bp(0.01%p) 알파벳 12% 급락 코스피 2.99% 낮게 6,000선 아래 자유현금흐름 -424억 달러`;

test('provided numbers are accepted as written and as plain roundings', () => {
  const ok = '코스피 5,672.39(-4.47%)는 4% 넘게 빠졌다. SK하이닉스 1,409,000은 141만 원대다. 5,600선까지 내려왔다. 4.989%는 5% 문턱. 알파벳 12% 급락. 10/30 3분기 52주.';
  assert.deepEqual(findInventedNumbers(ok, SOURCE), []);
  assert.ok(providedNumbers(SOURCE).has(5600));
});

test('numbers the inputs do not contain are found', () => {
  const bad = '신용스프레드가 70bp를 넘는지 본다. 원/달러가 1,340 위로 올라서면 달라진다. 코스피는 0.54%p 더 빠졌다.';
  assert.deepEqual(findInventedNumbers(bad, SOURCE).sort(), ['0.54%p', '1,340', '70bp'].sort());
});

test('interpretation patterns and FX read as foreign flows are found', () => {
  assert.ok(findStylePatterns('신용 경색이 아니라 주식 되돌림 쪽에 가깝다.').length);
  assert.ok(findStylePatterns('반도체 비중이 큰 지수 구조가 증폭기가 된 셈이다.').length);
  assert.ok(findStylePatterns('외국인 자금이 이탈하는 그림이라면 환율이 더 튀었어야 자연스럽다.').length);
  assert.ok(findStylePatterns('시장이 겁을 먹은 게 아니라 기술주 하나를 골라서 파는 장면이다.').length);
  assert.deepEqual(findStylePatterns('코스피가 4.47% 빠졌다. 원/달러는 0.40% 내렸다. 외국인 증권투자는 8월 기준 -48.5억 달러다.'), []);
});

const BODY = `## 간밤에 있었던 일\n- **코스피** 5,672.39 (-4.47%) → 하루에 4% 넘게 빠졌다.\n\n## 내일 볼 것\n- → 스프레드 68.3bp가 70bp를 넘는지 본다. 원/달러 1,340 위로 올라서면 달라진다.\n\n💡 **하이닉스 반등부터 본다.**`;
const fixedBody = BODY.replace('가 70bp를 넘는지 본다. 원/달러 1,340 위로 올라서면 달라진다.', '가 벌어지는지 본다. 원/달러가 오르는지도 본다.');

test('a rewrite that removes the invented numbers is published', async () => {
  let seen = '';
  const out = await enforceGrounding({
    title: 'T', body: BODY, source: SOURCE, fixedTitle: true,
    call: async (system) => { seen = system; return `TITLE: T\n\n${fixedBody}`; },
  });
  assert.match(seen, /"70bp"/);
  assert.match(seen, /"1,340"/);
  assert.equal(out.body, fixedBody);
  assert.deepEqual(out.grounding.remaining, []);
});

test('invented numbers that survive the rewrite fail the run', async () => {
  await assert.rejects(
    enforceGrounding({ title: 'T', body: BODY, source: SOURCE, fixedTitle: true, call: async () => `TITLE: T\n\n${BODY}` }),
    /데이터에 없는 숫자가 수정 후에도 남음/,
  );
});

test('a rewrite that adds a number is refused', async () => {
  const worse = fixedBody.replace('벌어지는지', '75bp 이상 벌어지는지');
  await assert.rejects(
    enforceGrounding({ title: 'T', body: BODY, source: SOURCE, fixedTitle: true, call: async () => `TITLE: T\n\n${worse}` }),
    /numbers_changed/,
  );
});

test('style patterns that stay are reported, not blocked', async () => {
  const styled = BODY.replace('하이닉스 반등부터 본다.', '하이닉스 반등부터 본다.') + '\n\n신용 경색이 아니라 주식 되돌림 쪽에 가깝다.';
  const base = styled.replace('가 70bp를 넘는지 본다. 원/달러 1,340 위로 올라서면 달라진다.', '가 벌어지는지 본다.');
  const out = await enforceGrounding({ title: 'T', body: base, source: SOURCE, fixedTitle: true, call: async () => `TITLE: T\n\n${base}` });
  assert.equal(out.body, base);
  assert.ok(out.grounding.remaining.length >= 1);
});

test('a failed rewrite call blocks only when numbers are invented', async () => {
  await assert.rejects(enforceGrounding({ title: 'T', body: BODY, source: SOURCE, call: async () => { throw new Error('down'); } }), /수정 호출 실패/);
  const styled = '## 간밤에 있었던 일\n- → 쪽에 가깝다.\n\n💡 **본다.**';
  const out = await enforceGrounding({ title: 'T', body: styled, source: SOURCE, call: async () => { throw new Error('down'); } });
  assert.equal(out.body, styled);
});

test('clean text passes without calling the model', async () => {
  const clean = '## 오늘 있었던 일\n- **코스피** 5,672.39 (-4.47%) → 하루 만에 빠졌다.\n\n💡 **본다.**';
  const out = await enforceGrounding({ title: 'T', body: clean, source: SOURCE, call: async () => { throw new Error('must not be called'); } });
  assert.equal(out.body, clean);
  assert.deepEqual(out.grounding, { fixed: [], remaining: [] });
});

test('rule examples in the prompt do not count as provided data, and English magnitudes convert', () => {
  // The prompt names "70bp" and "1,340" as things not to write; they must still be caught.
  assert.deepEqual(findInventedNumbers('스프레드가 70bp를 넘는지, 환율이 1,340을 넘는지 본다.', 'S&P 500 7,720.39 (-0.30%) 신용스프레드 68.3bp 원/달러 1,335.0').sort(), ['1,340', '70bp']);
  const src = 'Amazon free cash flow of -$42.4 billion; Binance hack of $6.3 billion; Intel $630 million';
  assert.deepEqual(findInventedNumbers('아마존 잉여현금흐름은 -424억 달러, 해킹은 63억 달러, 인텔은 6.3억 달러다.', src), []);
  assert.deepEqual(findInventedNumbers('아마존 잉여현금흐름은 -42.4억 달러다.', src), []); // 42.4 is in the source: the unit slip itself is not detectable here
  assert.deepEqual(findInventedNumbers('bp는 0.01%p다.', 'S&P 500 7,720.39'), []);
});

test('duration and ordinal counts are flagged for a rewrite', () => {
  assert.ok(findStylePatterns('원유가 나흘째 강세다.').length);
  assert.ok(findStylePatterns('이번 달 네 번째 월간 상승이다.').length);
  assert.ok(findStylePatterns('유가가 넉 달째 오르는 중이다.').length);
  assert.deepEqual(findStylePatterns('3분기 GDP는 좋았다. 4일 뒤 발표다.'), []);
});

test('wrong-side line claims, loose closers and leaked instructions are flagged (2026-10-30 5th pass)', () => {
  const src = '비트코인 78,534 (-3.36%) 코스피 5,673.30 (-4.45%)';
  assert.deepEqual(findStylePatterns('비트코인은 78,000달러 아래로 내려갔다.', src), ['78,000 아래']);
  assert.deepEqual(findStylePatterns('코스피는 5,600 아래로 내려갔다.', src), ['5,600 아래']); // 5,673 is above 5,600: also the wrong side
  assert.deepEqual(findStylePatterns('코스피는 5,700선 아래에서 끝났다.', src), []);   // nothing at or above 5,700 inside one step
  assert.ok(findStylePatterns('하이닉스가 지수를 혼자서 끌어내린 셈이다.').length);
  assert.ok(findStylePatterns('시장이 성장보다 다른 걸 본다는 신호다.').length);
  assert.ok(findStylePatterns('작은 회사 쪽에서 자금이 더 급하게 빠져나갔다는 뜻이다.').length);
  assert.ok(findStylePatterns('환율로 외국인 자금 방향을 읽는 건 이 데이터로 할 수 있는 일이 아니니 같이 안 움직였다까지만 본다.').length);
  assert.deepEqual(findStylePatterns('신호등이 켜졌다. 신호가 약하다.'), []);
});

test('6th pass: equal values, 순유입 statistics and decimal points no longer trigger false alarms', () => {
  const src = 'SK하이닉스 1,412,000 (-7.47%) 코스피 5,712.58 (-3.79%) 코스피 6,000선 아래 출발 헤드라인';
  assert.deepEqual(findStylePatterns('하이닉스가 1,412,000 아래로 더 밀리는지 본다.', src), []);
  assert.deepEqual(findStylePatterns('코스피는 6,000 아래로 내려앉았다.', src), []);
  const stat = '원/달러가 1,335.0으로 내려 원화는 강세였고, 외국인 증권투자 순유입은 8월 기준 -48.5억달러였다.';
  assert.deepEqual(findStylePatterns(stat), []);
  // the real inference is still caught, including across a decimal point
  assert.ok(findStylePatterns('원/달러가 1,335.0으로 내렸으니 외국인 자금이 이탈하는 그림은 아니다.').length);
});
