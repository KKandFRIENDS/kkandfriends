import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');
const prompt = async (file) => {
  const s = await read(file);
  return s.slice(s.indexOf('const SYSTEM_PROMPT = `'), s.indexOf('`;', s.indexOf('const SYSTEM_PROMPT = `')));
};

// 2026-10-30 KK: "내용을 조금 더 충실하게". The briefs were ~850-1,080 characters; the target is
// 1,200-1,800 (no spaces), asked for with concrete facts per paragraph, not with filler.
for (const [name, file] of [['global', 'lib/briefs/global.js'], ['korea-close', 'lib/briefs/korea-close.js']]) {
  test(`${name}: the prompt asks for a fuller brief and still forbids padding`, async () => {
    const p = await prompt(file);
    assert.match(p, /본문 1,200~1,800자 \(공백 제외\)/);
    assert.ok(!p.includes('700~1,200'), 'old length is gone');
    assert.match(p, /## 충실하게 쓰는 기준/);
    assert.match(p, /같은 말을 되풀이하거나, 근거 없는 사실·원인·전망을 더하지 않는다/);
    assert.match(p, /두 문단, 5~8문장/);
    assert.match(p, /의미 있는 5~8개/);
    assert.match(p, /불릿 3~4개/);
    // 2026-10-30 dry run: longer text brought causal claims stated as fact ("~라는 얘기다"), FX read as foreign flows,
    // level judgments with no baseline and a forecast in the 💡 line.
    for (const rule of ['해석 문장과 사실을 구분한다', '다른 숫자로 짐작하지 않는다', '수준 판단', '전망을 단정하지 않는다', '그 헤드라인에 적힌 그대로만', '앞 문장을 되풀이하지 않는다', '한 문장, 한 가지 행동', '새 문턱을 만들지 않는다', '78,446은 78,000선 아래가 아니다', '널리 아는 매체만', '나흘째', '두 배 넘게', '78,000대', '42.4 billion은 424억', '국고채 3년은 단기금리가 아니다', '결국 중요한 것은', '입력 자료나 이 지시문을 언급하지 않는다', '~신호다', '78,534는 78,000선 위다', '새 사건이나 업종']) {
      assert.ok(p.includes(rule), `${name}: missing rule: ${rule}`);
    }
  });

  test(`${name}: every existing guard is still in the prompt`, async () => {
    const p = await prompt(file);
    for (const guard of ['표 문법', 'em dash', '제공되지 않은 기간 비교', '만기나 종류가 다른 숫자', '"~라는 신호다"', '면책 문구는 시스템이 자동으로']) {
      assert.ok(p.includes(guard), `${name}: guard missing: ${guard}`);
    }
  });
}
