import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner writing surfaces expose Lounge, THOUGHTS, DAILY and WEEKLY consistently', async () => {
  const [thoughts, lounge, original, review] = await Promise.all([
    read('thoughts.html'), read('write.html'), read('write-original.html'), read('admin-editorial.html'),
  ]);
  for (const html of [lounge, original]) {
    assert.match(html, /\/write-desk\?series=daily/);
    assert.match(html, /\/write-desk\?series=weekly/);
  }
  assert.match(thoughts, /id="owner-write-actions"/);
  assert.match(review, /DAILY 글쓰기/);
  assert.match(review, /WEEKLY 글쓰기/);
});

test('manual desk editor uses the same fixed DAILY and WEEKLY structures as the pipeline', async () => {
  const [editor, core] = await Promise.all([read('js/desk-editor.js'), read('research-lab/src/desk/core.js')]);
  const daily = ['핵심 판단', '확인된 사실', '시장의 해석', '검토할 관점', '반론', '관찰 지표'];
  const weekly = ['이번 주 핵심', '거시경제', '금융시장', 'Bitcoin', 'AI', '주요 논쟁', '한국', '종합 판단', '다음 주 관찰 항목'];
  for (const heading of [...daily, ...weekly]) {
    assert.match(editor, new RegExp(heading));
    assert.match(core, new RegExp(heading));
  }
  assert.match(editor, /800, 1200/);
  assert.match(editor, /1600, 4000/);
  assert.match(editor, /primary/);
});
