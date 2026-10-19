import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

// 2026-10-19 (KK): visitors may not know the lounge exists. The home reading hub gets a third
// card for it; members go straight in, applicants see their status, everyone else reads about it.
test('home reading hub has a lounge card that follows the member state', async () => {
  const home = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(home, /<a class="ih-series-card ih-lounge" id="home-lounge-card" href="\/community">/);
  assert.match(home, /라운지 · 멤버 전용/);
  assert.match(home, /\.insights-hub \.ih-series \{ display:grid; grid-template-columns:repeat\(3,1fr\)/);
  assert.match(home, /if \(state === "approved"\) lounge\("\/voices", "라운지 들어가기 →"\)/);
  assert.match(home, /else if \(state === "pending"\) lounge\("\/me", "심사 상태 보기 →"\)/);
  assert.match(home, /else lounge\("\/community", "라운지 알아보기 →"\)/);
  // The phone layout stays one column.
  assert.match(home, /@media\(max-width:820px\)[\s\S]*\.insights-hub \.ih-series \{ grid-template-columns:1fr; \}/);
});
