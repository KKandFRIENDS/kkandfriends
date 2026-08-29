import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

async function source(file) {
  return readFile(path.join(ROOT, file), 'utf8');
}

test('public biography copy consistently uses the since-1997 timeline', async () => {
  const [home, community, thoughts] = await Promise.all([
    source('index.html'),
    source('community.html'),
    source('thoughts.html'),
  ]);
  const combined = `${home}\n${community}\n${thoughts}`;
  const retiredClaims = [
    '30Y+',
    '30년 글로벌 금융 커리어의 경험과 네트워크',
    '현장에서 쌓은 30년의 경험이 담긴 KK의 시장 인사이트',
    '20 years of real experience',
    '20년 글로벌 금융 경력에서 나오는 생각들',
    '30년 글로벌 금융 경력에서 나오는 생각들',
    '20년 글로벌 금융 경력에서 나온 생각들',
  ];

  for (const claim of retiredClaims) {
    assert.equal(combined.includes(claim), false, `retired biography claim remains: ${claim}`);
  }

  assert.match(home, /Since 1997/);
  assert.match(home, /1997년부터/);
  assert.match(community, /since 1997/i);
  assert.match(thoughts, /1997년부터/);
});

test('public article totals use the canonical count of 33', async () => {
  const [home, thoughts] = await Promise.all([source('index.html'), source('thoughts.html')]);

  assert.match(home, /전체 33편 보기/);
  assert.match(thoughts, />33 posts</);
  assert.doesNotMatch(`${home}\n${thoughts}`, /(?:32 posts|전체 32편 보기)/);
});
