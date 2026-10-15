import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

// 2026-10-15 (KK): 오늘의 시작 is public now. The prompt reads for first-time readers
// (what happened -> why -> what to watch) and the 💡 line may not be a fixed sentence the
// model copies every morning.
test('오늘의 시작 prompt: friendly order and no copyable tip', async () => {
  const src = await readFile(path.join(ROOT, 'lib/briefs/global.js'), 'utf8');
  const order = ['## 간밤에 있었던 일', '## 숫자 뒤에 있는 것', '## 오늘 한국 시장에서 볼 것'].map((heading) => src.indexOf(`\n${heading}\n`));
  assert.ok(order.every((index) => index > 0), 'all three sections are in the output format');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'sections are in reading order');
  assert.doesNotMatch(src, /채권 시장이 반영하는 진짜 금리 상단/, 'the example tip must not be a real sentence');
  assert.match(src, /매일 달라야 한다/);
  assert.match(src, /이건 내 해석이지/, 'the forbidden-sentence rule stays in the prompt');
  assert.match(src, /\/내 해석이지\|공식 전망이 아니/, 'and in the output filter');
});

test('오늘의 마감 prompt: same friendly order, ending on tomorrow', async () => {
  const src = await readFile(path.join(ROOT, 'lib/briefs/korea-close.js'), 'utf8');
  const order = ['## 오늘 있었던 일', '## 숫자 뒤에 있는 것', '## 내일 볼 것'].map((heading) => src.indexOf(`\n${heading}\n`));
  assert.ok(order.every((index) => index > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.doesNotMatch(src, /지수의 방향보다 그 방향을 누가 만들었는지가 다음 주를 결정한다/);
  assert.match(src, /매일 달라야 한다/);
  assert.match(src, /\/내 해석이지\|공식 전망이 아니/, 'the forbidden-sentence filter stays');
});
