import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInfographicSvg, missingNumbers, renderPng, MAX_HEIGHT, MIN_HEIGHT, DISCLOSURE,
} from '../scripts/desk-infographic.mjs';

const spec = {
  eyebrow: 'KK DAILY · MACRO',
  title: '금리는 멈췄는데 대출 금리는 안 내려온다',
  subtitle: '기준금리와 주택담보대출 금리 사이가 벌어진 이유',
  sections: [
    { type: 'stats', heading: '숫자 세 개', items: [
      { value: '2.50%', label: '기준금리', note: '한국은행, 10월 동결' },
      { value: '4.12%', label: '주담대 평균', note: '9월 신규 취급' },
      { value: '1.62%p', label: '차이', note: '두 금리의 간격' },
    ] },
    { type: 'list', heading: '흐름', items: [
      { tag: '2026.08', text: '기준금리 2.50% 유지' },
      { tag: '2026.10.16', text: '다시 동결', status: '동결' },
    ] },
    { type: 'bars', heading: '비교', unit: '%', items: [
      { label: '기준금리', value: 2.5, display: '2.50%' },
      { label: '주담대', value: 4.12, display: '4.12%' },
    ] },
  ],
  sources: '출처: 한국은행, 은행연합회.',
  asOf: '2026-10-19',
};
const body = '한국은행은 기준금리를 2.50%로 묶었고, 9월 신규 주담대 평균은 4.12%였다. 둘의 차이는 1.62%p다. 2026년 8월에도 같았다.';

test('a three-section card fits the size the routine sends', async () => {
  const { svg, height } = buildInfographicSvg(spec);
  assert.ok(height >= MIN_HEIGHT && height <= MAX_HEIGHT, `height ${height}`);
  assert.match(svg, /font-family="Pretendard"/);
  assert.match(svg, /정보 제공 목적이며 투자 권유가 아닙니다/);
  assert.doesNotMatch(svg, new RegExp(DISCLOSURE));
  const png = await renderPng(svg);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('digital asset cards carry the disclosure line', () => {
  assert.match(buildInfographicSvg({ ...spec, digitalAsset: true }).svg, new RegExp(DISCLOSURE));
});

test('the card may only repeat numbers the body already has', () => {
  assert.deepEqual(missingNumbers(spec, body), []);
  const invented = structuredClone(spec);
  invented.sections[0].items[0].value = '3.75%';
  assert.deepEqual(missingNumbers(invented, body), ['3.75']);
  // bar lengths are layout, not shown text
  const bar = structuredClone(spec);
  bar.sections[2].items[1].value = 999;
  assert.deepEqual(missingNumbers(bar, body), []);
});

test('too much content is refused instead of cut off', () => {
  const crowded = structuredClone(spec);
  const long = '아주 긴 설명 문장이 두 줄을 꽉 채우도록 계속 이어지고 또 이어지는 항목입니다 '.repeat(2);
  crowded.sections[1].items = Array.from({ length: 6 }, (_, i) => ({ tag: `2026.0${i + 1}`, text: long, status: '확인' }));
  assert.throws(() => buildInfographicSvg(crowded), /too tall/);
});

test('a spec without a title or sections is refused', () => {
  assert.throws(() => buildInfographicSvg({ sections: spec.sections }), /title/);
  assert.throws(() => buildInfographicSvg({ title: 'x', sections: [] }), /section/);
});
