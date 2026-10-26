import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { checkComplete, GLOBAL_SECTIONS, KOREA_SECTIONS } from '../lib/briefs/complete.js';

const root = path.resolve(import.meta.dirname, '..');
const source = (file) => readFile(path.join(root, file), 'utf8');

// The body that actually went out on 2026-10-26 (188 chars, cut mid-word after
// the first bullet). The gate has to reject exactly this, because every other
// check in the pipeline (== 120 chars, publish API 1..100000) let it through.
const FRAGMENT_2026_10_26 = `TITLE: 오늘의 시작 (10/26 월)

간밤 뉴욕 3대 지수는 모두 내렸다. 다우가 가장 크게 빠졌다. 코스피는 반대로 올라 5,550.30에서 마감했다.

## 간밤에 있었던 일
- **S&P 500** 7,623.68 (-0.52%) → 미국 대형주가 전`;

const COMPLETE_GLOBAL = `TITLE: 오늘의 시작 (10/26 월)

간밤 미국 증시는 세 지수가 모두 내렸다. 다우가 -1.23%로 가장 많이 밀렸고, S&P 500은 -0.52%, 나스닥은 -0.21%였다.

## 간밤에 있었던 일
- **S&P 500** 7,623.68 (-0.52%) → 미국 대표 기업 묶음이 반 걸음 물러섰다.
- **다우** 52,215.16 (-1.23%) → 전통 산업·금융 쪽 낙폭이 더 컸다.
- **미 10년물** 4.988% (+3.5bp) → 미국이 10년 돈을 빌릴 때 주는 이자가 5% 문턱에 닿았다.

## 숫자 뒤에 있는 것
이번 주 FOMC를 앞두고 시장은 연준이 금리를 동결할 것으로 본다. 문제는 물가다. 물가가 뜨거운데도 동결하되 인상 카드를 완전히 접지는 않았다는 신호를 줄 것이라는 관측이 나온다. 그래서 채권 금리와 금값이 먼저 반응했다.

## 오늘 한국 시장에서 볼 것
- 국고채 3년 3.803%(10/23 기준)와 기준금리 3%(10/23 기준): 미국 장기 금리가 5%를 향해 갈 때 국내 금리도 같이 밀리는지 본다.
- 신용스프레드 68.9bp(10/23 기준): 이 숫자가 벌어지면 위험한 자산을 피하려는 움직임이 커진 신호다.

💡 **미 10년물이 5.00%를 넘어서 마감하는지, 4.99%에서 막히는지만 본다.**`;

test('rejects the truncated 2026-10-26 fragment', () => {
  const reason = checkComplete(FRAGMENT_2026_10_26, GLOBAL_SECTIONS);
  assert.match(reason, /missing sections/);
});

test('accepts a finished global brief', () => {
  assert.equal(checkComplete(COMPLETE_GLOBAL, GLOBAL_SECTIONS), null);
});

test('rejects a body missing only the closing tip line', () => {
  const body = COMPLETE_GLOBAL.split('\n💡')[0];
  const reason = checkComplete(body, GLOBAL_SECTIONS);
  assert.match(reason, /missing sections: 💡/);
});

test('rejects a body whose last line stops mid-sentence', () => {
  const body = COMPLETE_GLOBAL.replace(/지만 본다\.\*\*$/, '지만 보');
  const reason = checkComplete(body, GLOBAL_SECTIONS);
  assert.match(reason, /does not end a sentence/);
});

test('rejects a body that is too short even with every heading', () => {
  const body = GLOBAL_SECTIONS.join('\n징검다리 본문 한 줄.\n');
  const reason = checkComplete(body, GLOBAL_SECTIONS);
  assert.match(reason, /too short/);
});

test('korea close has its own section list', () => {
  const body = `TITLE: 오늘의 마감 (10/26 월)

## 오늘 있었던 일
- 코스피는 5,550.30으로 마감하며 0.8% 올랐다. 코스닥은 1.2% 올랐고 원/달러는 1,323.4원이었다. 삼성전자는 보합이었고 SK하이닉스는 2% 올랐다. 외국인은 코스피 현물을 3거래일 만에 순매수로 돌아섰다.

## 숫자 뒤에 있는 것
외국인이 사흘 만에 돌아왔다. 반도체가 지수를 끌었고 2차전지는 쉬었다. 닛케이와 상하이는 방향이 갈렸다. 미국 10년물이 4.988%로 5% 문턱에 닿아 있는데도 국내 금리는 따라 오르지 않았다. 신용스프레드가 68.9bp로 벌어지지 않은 점도 같이 봐야 한다.

## 내일 볼 것
- 미국 10년물 5% 돌파 여부와 원/달러 1,320원대 지지 여부를 같이 본다. 둘이 같이 움직이면 외국인 수급이 흔들린다.
- 반도체 수출 지표와 외국인 선물 포지션을 함께 확인한다. 지수가 올라도 선물이 팔리면 오후에 되돌림이 나온다.

💡 **장 마감 후 나오는 외국인 현물 수급 숫자 하나만 확인한다.**`;
  assert.equal(checkComplete(body, KOREA_SECTIONS), null);
});

test('both briefs reject a cut answer and check finish reasons before publishing', async () => {
  for (const file of ['lib/briefs/global.js', 'lib/briefs/korea-close.js']) {
    const src = await source(file);
    assert.match(src, /import \{ checkComplete, \w+_SECTIONS \} from '\.\/complete\.js';/, file);
    assert.match(src, /finish !== 'stop'/, `${file} must reject a non-stop OpenRouter finish_reason`);
    assert.match(src, /finish === 'MAX_TOKENS'/, `${file} must reject a MAX_TOKENS Gemini answer`);
    assert.match(src, /stop_reason === 'max_tokens'/, `${file} must reject a max_tokens Anthropic answer`);
    assert.match(src, /발행 전 완결성 검사 실패/, `${file} must gate the text it publishes`);
  }
});
