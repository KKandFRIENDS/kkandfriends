import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { kstParts } from '../lib/market-sources.js';

const root = path.resolve(import.meta.dirname, '..');
const source = (file) => readFile(path.join(root, file), 'utf8');
const TOKEN = 'x'.repeat(40);
const API = 'https://api.test.invalid';

// Loads a brief module with a fresh env snapshot (the modules read process.env
// at import time) and a stubbed fetch that plays the internal API, the model,
// the news feeds and Telegram. Returns the calls so tests can assert on them.
async function loadBrief(file, exportName, { env, gemini }) {
  const saved = { ...process.env };
  const savedFetch = globalThis.fetch;
  for (const key of ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'AI_GATEWAY_API_KEY', 'ANTHROPIC_API_KEY', 'EDITORIAL_INTERNAL_TOKEN',
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_CHANNEL_ID', 'ECOS_API_KEY', 'COMMUNITY_API_URL']) delete process.env[key];
  Object.assign(process.env, env);

  const calls = { automation: [], telegram: [], gemini: 0, openrouter: [] };
  let feed = 0;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith(`${API}/api/internal/automation`)) {
      const body = JSON.parse(init.body);
      calls.automation.push({ auth: init.headers.Authorization, ...body });
      const data = body.action === 'briefClaim' ? { claimed: true }
        : body.action === 'briefPublish' ? { postId: 'post-1', notified: 3 } : { released: true };
      return Response.json({ data });
    }
    if (href.includes('generativelanguage.googleapis.com')) {
      calls.gemini++;
      return gemini();
    }
    if (href === 'https://openrouter.ai/api/v1/chat/completions') {
      const body = JSON.parse(init.body);
      calls.openrouter.push({ auth: init.headers.Authorization, model: body.model, roles: body.messages.map((m) => m.role), reasoning: body.reasoning });
      if (body.model === 'thinks-too-long') return Response.json({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });
      return Response.json({ choices: [{ message: { content: briefText } }] });
    }
    if (href.startsWith('https://api.telegram.org/')) {
      calls.telegram.push(JSON.parse(init.body));
      return Response.json({ ok: true });
    }
    if (href.includes('finance.yahoo.com')) return new Response('', { status: 503 });
    // Any RSS feed: six unique headlines each, so the brief has enough input.
    const n = ++feed;
    const items = Array.from({ length: 6 }, (_, i) => `<item><title>Headline number ${n}-${i} about markets</title></item>`);
    return new Response(`<rss><channel>${items.join('')}</channel></rss>`);
  };

  try {
    const mod = await import(`../${file}?t=${Date.now()}-${Math.random()}`);
    return { run: mod[exportName], calls, restore };
  } catch (error) {
    restore();
    throw error;
  }
  function restore() {
    globalThis.fetch = savedFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

const configured = {
  GEMINI_API_KEY: 'gemini-test', GEMINI_MODEL: 'gemini-test-model', EDITORIAL_INTERNAL_TOKEN: TOKEN,
  COMMUNITY_API_URL: API, TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_CHAT_ID: 'kk-chat', TELEGRAM_CHANNEL_ID: '@channel',
};
const expectedTitle = (kind) => {
  const kst = kstParts();
  return `${kind === 'global' ? '오늘의 시작' : '오늘의 마감'} (${kst.label} ${kst.weekday})`;
};
const briefText = `TITLE: 글로벌 마켓 브리핑 — 9/28 (월) · 테스트\n## 숫자\n${'- 시장은 조용했지만 금리는 움직였다 → 테스트 문장\n'.repeat(8)}`;
const geminiOk = () => Response.json({ candidates: [{ content: { parts: [{ text: briefText }] } }] });

for (const [file, exportName, notificationType, kind] of [
  ['lib/briefs/global.js', 'runGlobalBrief', 'daily_brief', 'global'],
  ['lib/briefs/korea-close.js', 'runKoreaCloseBrief', 'korea_close', 'korea_close'],
]) {
  test(`${file} publishes through the VPS internal API as one brief`, async () => {
    const { run, calls, restore } = await loadBrief(file, exportName, { env: configured, gemini: geminiOk });
    try {
      const result = await run({ force: true });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.postId, 'post-1');
      assert.deepEqual(calls.automation.map((c) => c.action), ['briefClaim', 'briefPublish']);
      assert.ok(calls.automation.every((c) => c.auth === `Bearer ${TOKEN}`));
      const publish = calls.automation[1];
      assert.equal(publish.kind, kind);
      assert.equal(publish.notificationType, notificationType);
      assert.equal(publish.category, '시장/매크로');
      // Fixed in code, whatever the model wrote on its TITLE line.
      assert.equal(publish.title, expectedTitle(kind));
      assert.match(publish.body, /> 본 자료는 정보 제공 목적이며/);
      assert.equal(calls.telegram.length, 1);
      assert.equal(calls.telegram[0].chat_id, '@channel');
      assert.ok(calls.telegram[0].text.includes(`/markets/${kstParts().date}-${kind === 'global' ? 'start' : 'close'}`));
      assert.doesNotMatch(calls.telegram[0].text, /멤버 전용/);
    } finally {
      restore();
    }
  });

  test(`${file} releases the lock and alerts KK when writing fails`, async () => {
    const { run, calls, restore } = await loadBrief(file, exportName, {
      env: configured, gemini: () => new Response('quota exceeded', { status: 429 }),
    });
    try {
      const result = await run({ force: true });
      assert.equal(result.ok, false);
      assert.match(result.error, /Gemini/);
      assert.deepEqual(calls.automation.map((c) => c.action), ['briefClaim', 'briefRelease']);
      assert.equal(calls.telegram.length, 1);
      assert.equal(calls.telegram[0].chat_id, 'kk-chat');
      assert.match(calls.telegram[0].text, /실패/);
    } finally {
      restore();
    }
  });

  test(`${file} writes through OpenRouter when that is the only key`, async () => {
    const { GEMINI_API_KEY, GEMINI_MODEL, ...rest } = configured;
    const env = { ...rest, OPENROUTER_API_KEY: 'or-key', OPENROUTER_MODEL: 'z-ai/glm-5.3-flash' };
    const { run, calls, restore } = await loadBrief(file, exportName, { env, gemini: geminiOk });
    try {
      const result = await run({ dry: true });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.via, 'openrouter');
      assert.equal(result.model, 'z-ai/glm-5.3-flash');
      assert.equal(calls.gemini, 0);
      // The writer call, then the humanizer pass on the same route.
      const call = { auth: 'Bearer or-key', model: 'z-ai/glm-5.3-flash', roles: ['system', 'user'], reasoning: { effort: 'low' } };
      assert.deepEqual(calls.openrouter, [call, call]);
      assert.equal(result.humanizer.applied, true);
      assert.equal(calls.automation.length, 0, 'a dry run never touches the lounge');
      assert.equal(result.title, expectedTitle(kind));
    } finally {
      restore();
    }
  });

  test(`${file} falls back to the next OpenRouter model when one returns nothing`, async () => {
    const { GEMINI_API_KEY, GEMINI_MODEL, ...rest } = configured;
    const env = { ...rest, OPENROUTER_API_KEY: 'or-key', OPENROUTER_MODEL: 'thinks-too-long,backup-model' };
    const { run, calls, restore } = await loadBrief(file, exportName, { env, gemini: geminiOk });
    try {
      const result = await run({ dry: true });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.deepEqual(calls.openrouter.map((c) => c.model), ['thinks-too-long', 'backup-model', 'thinks-too-long', 'backup-model']);
      assert.equal(result.model, 'backup-model', 'the result names the model that actually wrote it');
    } finally {
      restore();
    }
  });

  test(`${file} publishes the original and tells KK when the humanizer pass moves a number`, async () => {
    let n = 0;
    const gemini = () => {
      n++;
      const text = n === 1 ? briefText : briefText.replace('## 숫자', '## 숫자\n- 지수 1,234 상승');
      return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    };
    const { run, calls, restore } = await loadBrief(file, exportName, { env: configured, gemini });
    try {
      const result = await run({ force: true });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(calls.gemini, 2);
      assert.deepEqual(result.humanizer, { applied: false, reason: 'numbers_changed' });
      assert.doesNotMatch(calls.automation[1].body, /1,234/);
      assert.equal(calls.telegram.length, 2);
      assert.equal(calls.telegram[1].chat_id, 'kk-chat');
      assert.match(calls.telegram[1].text, /humanizer 미적용/);
    } finally {
      restore();
    }
  });

  test(`${file} treats missing configuration as a failure, not a quiet skip`, async () => {
    const { EDITORIAL_INTERNAL_TOKEN, ...partial } = configured;
    const { run, calls, restore } = await loadBrief(file, exportName, { env: partial, gemini: geminiOk });
    try {
      const result = await run();
      assert.equal(result.ok, false);
      assert.deepEqual(result.missing, ['EDITORIAL_INTERNAL_TOKEN']);
      assert.equal(calls.automation.length, 0);
      assert.equal(calls.gemini, 0);
      assert.equal(calls.telegram.length, 1);
      assert.equal(calls.telegram[0].chat_id, 'kk-chat');
      assert.match(calls.telegram[0].text, /설정 누락/);
    } finally {
      restore();
    }
  });
}

test('lounge briefs are scheduled on the VPS, not by Vercel', async () => {
  const [vercel, cron] = await Promise.all([source('vercel.json'), source('ops/briefs/briefs.cron')]);
  const paths = (JSON.parse(vercel).crons || []).map((c) => c.path);
  assert.ok(!paths.includes('/api/cron/daily-brief'));
  assert.ok(!paths.includes('/api/cron/korea-close'));
  // 07:00 KST Mon–Fri = 22:00 UTC Sun–Thu; 17:30 KST Mon–Fri = 08:30 UTC Mon–Fri.
  assert.match(cron, /^0 22 \* \* 0-4 root .*run\.mjs global /m);
  assert.match(cron, /^20 22 \* \* 0-4 root .*run\.mjs global /m);
  assert.match(cron, /^30 8 \* \* 1-5 root .*run\.mjs korea-close /m);
  assert.match(cron, /^50 8 \* \* 1-5 root .*run\.mjs korea-close /m);
});

test('the briefs image ships every module the briefs import, and no Supabase', async () => {
  const dockerfile = await source('ops/briefs/Dockerfile');
  for (const file of ['lib/briefs/global.js', 'lib/briefs/korea-close.js', 'lib/briefs/digest.js']) {
    const text = await source(file);
    assert.doesNotMatch(text, /SUPABASE|supabase\(|\/rest\/v1\//i, file);
    for (const [, rel] of text.matchAll(/from '\.\.\/([\w-]+\.js)'/g)) {
      assert.match(dockerfile, new RegExp(`lib/${rel.replace('.', '\\.')}`), `${rel} must be copied into the image`);
    }
  }
  const saveEnv = await source('ops/briefs/save-env.mjs');
  for (const key of ['EDITORIAL_INTERNAL_TOKEN', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'TELEGRAM_CHAT_ID', 'ECOS_API_KEY']) {
    assert.match(saveEnv, new RegExp(`'${key}'`));
  }
});

// ── Weekly digest ────────────────────────────────────────────────────────────
import { mkdtempSync, readdirSync } from 'node:fs';
import os from 'node:os';

async function loadDigest({ env, resend = () => Response.json({ id: 'e' }) }) {
  const saved = { ...process.env };
  const savedFetch = globalThis.fetch;
  for (const key of ['EDITORIAL_INTERNAL_TOKEN', 'RESEND_API_KEY', 'RESEND_FROM', 'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID', 'COMMUNITY_API_URL', 'BRIEFS_STATE_DIR']) delete process.env[key];
  Object.assign(process.env, env);
  const calls = { automation: [], emails: [], telegram: [] };
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith(`${API}/api/internal/automation`)) {
      calls.automation.push(JSON.parse(init.body).action);
      return Response.json({ data: {
        posts: [{ id: 'p1', title: '이번 주 글', body: '본문', category: '자유', author_name: '멤버' }],
        editions: [{ id: '2026-10-06-markets', title: '제목: 두 가지 리스크', summary: '요약: 짧게', series: 'DAILY DESK', label: 'MARKETS TUESDAY' }],
        events: [],
        recipients: [
          { contact_email: 'a@x.test', display_name: 'A', unsub_token: 't-a' },
          { contact_email: 'b@x.test', display_name: 'B', unsub_token: 't-b' },
        ],
      } });
    }
    if (href === 'https://api.resend.com/emails') {
      const body = JSON.parse(init.body);
      calls.emails.push(body.to);
      calls.html = body.html;
      return resend(body);
    }
    if (href.startsWith('https://api.telegram.org/')) {
      calls.telegram.push(JSON.parse(init.body));
      return Response.json({ ok: true });
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  const mod = await import(`../lib/briefs/digest.js?t=${Date.now()}-${Math.random()}`);
  return {
    run: mod.runDigest, calls,
    restore() {
      globalThis.fetch = savedFetch;
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    },
  };
}
const digestEnv = () => ({
  EDITORIAL_INTERNAL_TOKEN: TOKEN, COMMUNITY_API_URL: API, RESEND_API_KEY: 're', RESEND_FROM: 'KK <kk@x.test>',
  TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_CHAT_ID: 'kk-chat', BRIEFS_STATE_DIR: mkdtempSync(path.join(os.tmpdir(), 'digest-')),
});

test('digest emails every opted-in member once, and a re-run the same day sends nothing', async () => {
  const env = digestEnv();
  const { run, calls, restore } = await loadDigest({ env });
  try {
    const first = await run();
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.sent, 2);
    assert.deepEqual(calls.emails, ['a@x.test', 'b@x.test']);
    // KK Daily / Weekly live in the lounge since 2026-10-06 and lead the email.
    assert.match(calls.html, /KK Daily · KK Weekly/);
    assert.match(calls.html, /\/desk\/2026-10-06-markets/);
    assert.match(calls.html, />두 가지 리스크</, 'the 제목: label is stripped');
    assert.ok(calls.html.indexOf('/desk/2026-10-06-markets') < calls.html.indexOf('/voices?id=p1'));
    assert.equal(readdirSync(env.BRIEFS_STATE_DIR).filter((f) => f.startsWith('digest-')).length, 1);
    const second = await run();
    assert.equal(second.skipped, 'already sent today');
    assert.equal(calls.emails.length, 2, 'no second round of emails');
    assert.equal(calls.telegram.length, 0);
  } finally {
    restore();
  }
});

test('digest --dry sends nothing and --to sends a single preview copy', async () => {
  const env = digestEnv();
  const { run, calls, restore } = await loadDigest({ env });
  try {
    const dry = await run({ dry: true });
    assert.equal(dry.ok, true);
    assert.equal(dry.recipients, 2);
    assert.equal(calls.emails.length, 0);
    const preview = await run({ to: 'kk@x.test' });
    assert.equal(preview.sent, 1);
    assert.deepEqual(calls.emails, ['kk@x.test']);
    assert.equal(readdirSync(env.BRIEFS_STATE_DIR).length, 0, 'a preview must not mark the week as sent');
  } finally {
    restore();
  }
});

test('digest alerts KK when some emails fail or configuration is missing', async () => {
  const env = digestEnv();
  let n = 0;
  const { run, calls, restore } = await loadDigest({
    env, resend: () => (++n === 2 ? new Response('rate limited', { status: 429 }) : Response.json({ id: 'e' })),
  });
  try {
    const result = await run();
    assert.equal(result.ok, false);
    assert.equal(result.sent, 1);
    assert.equal(result.failed, 1);
    assert.equal(calls.telegram.length, 1);
    assert.match(calls.telegram[0].text, /1\/2명 발송/);
  } finally {
    restore();
  }

  const { RESEND_API_KEY, ...partial } = digestEnv();
  const missing = await loadDigest({ env: partial });
  try {
    const result = await missing.run();
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ['RESEND_API_KEY']);
    assert.equal(missing.calls.automation.length, 0);
    assert.match(missing.calls.telegram[0].text, /설정 누락/);
  } finally {
    missing.restore();
  }
});

test('the weekly digest is scheduled on the VPS and no longer by Vercel', async () => {
  const [vercel, cron] = await Promise.all([source('vercel.json'), source('ops/briefs/briefs.cron')]);
  assert.equal(JSON.parse(vercel).crons, undefined);
  // Mon 09:00 KST = Mon 00:00 UTC.
  assert.match(cron, /^0 0 \* \* 1 root .*run\.mjs digest /m);
});

test('both brief prompts forbid unsupported comparisons, superlatives and causes', async () => {
  for (const file of ['lib/briefs/global.js', 'lib/briefs/korea-close.js']) {
    const text = await source(file);
    assert.match(text, /만기나 종류가 다른 숫자끼리 차이·금리차를 매기는 것/, file);
    assert.match(text, /전칭·최상급 표현을 데이터가 보여주지 않는데 쓰는 것/, file);
    assert.match(text, /움직임의 원인이나 주체를 근거 없이 단정하는 것/, file);
  }
});

test('humanizer guard keeps the brief format and every number', async () => {
  const { checkHumanized, humanizeBrief, loadHumanizerSkill } = await import('../lib/briefs/humanize.js');
  assert.match(loadHumanizerSkill(), /Not X but Y/);
  const before = { title: '글로벌 마켓 브리핑 — 9/28 (월) · 금리', body: '결론이다.\n\n## 숫자\n- **S&P 500** 6,234.11 (+0.82%) → 조용했다\n\n💡 **팁 문장**' };
  assert.equal(checkHumanized(before, before), null);
  assert.equal(checkHumanized(before, { ...before, body: before.body.replace('0.82', '0.8') }), 'numbers_changed');
  assert.equal(checkHumanized(before, { ...before, body: before.body.replace('## 숫자', '## 수치') }), 'headings_changed');
  assert.equal(checkHumanized(before, { ...before, body: before.body.replace('💡 ', '') }), 'tip_changed');
  assert.equal(checkHumanized(before, { ...before, body: before.body.replace('→', '-') }), 'arrows_removed');
  assert.equal(checkHumanized(before, { ...before, body: `${before.body}\n| a | b |` }), 'table_added');
  let prompt = '';
  const ok = await humanizeBrief({ ...before, skill: 'SKILL', call: async (system) => { prompt = system; return `TITLE: ${before.title}\n\n${before.body}`; } });
  assert.match(prompt, /HUMANIZER SKILL:\nSKILL/);
  assert.equal(ok.humanizer.applied, true);
  const failed = await humanizeBrief({ ...before, skill: 'SKILL', call: async () => { throw new Error('down'); } });
  assert.deepEqual(failed, { ...before, humanizer: { applied: false, reason: 'model_failed: down' } });
  const noTitle = await humanizeBrief({ ...before, skill: 'SKILL', call: async () => before.body });
  assert.equal(noTitle.humanizer.reason, 'format_changed');
});

test('the briefs image ships the humanizer skill', async () => {
  assert.match(await source('ops/briefs/Dockerfile'), /COPY \.claude\/skills\/humanizer\/SKILL\.md /);
  assert.match(await source('ops/briefs/Dockerfile'), /lib\/briefs/);
});

// ── Claim guard (2026-10-05: "사상 첫 7,000대 진입" went out although KOSPI had
//    closed at 7,080.92 on 9/23). ────────────────────────────────────────────
test('claim guard finds history-wide superlatives but allows 52-week wording', async () => {
  const { findUnsupportedClaims } = await import('../lib/briefs/claims.js');
  assert.deepEqual(
    findUnsupportedClaims('코스피 7,003.74 → 사상 첫 7,000대 진입. 역대 최대. 유일하게 올랐다.'),
    ['사상 첫', '역대 최대', '유일하게', '첫 7,000대 진입'],
  );
  assert.deepEqual(findUnsupportedClaims('코스피가 52주 신고가를 경신했다. 모두 올랐다.'), []);
  assert.deepEqual(findUnsupportedClaims('신고가를 경신했다'), ['신고가']);
});

test('claim guard rewrites once, then fails closed if the claim survives', async () => {
  const { enforceClaims } = await import('../lib/briefs/claims.js');
  const title = '한국 금융시장 종합 — 10/5 (월) · 사상 첫 7,000';
  const body = '## 숫자\n- 코스피 7,003.74 (+0.46%) → 사상 첫 7,000대 진입\n- 코스닥 893.29 (-0.11%) → 대형주만 올랐다';
  const fixed = `TITLE: 한국 금융시장 종합 — 10/5 (월) · 7,000 위의 하루\n\n## 숫자\n- 코스피 7,003.74 (+0.46%) → 7,000선 위에서 마감\n- 코스닥 893.29 (-0.11%) → 대형주만 올랐다`;

  const ok = await enforceClaims({ title, body, call: async () => fixed });
  assert.deepEqual(ok.claims.fixed, ['사상 첫', '첫 7,000대 진입']);
  assert.doesNotMatch(`${ok.title}${ok.body}`, /사상/);

  await assert.rejects(enforceClaims({ title, body, call: async () => `TITLE: ${title}\n\n${body}` }), /수정 후에도 남음/);
  // A rewrite may not invent numbers.
  await assert.rejects(
    enforceClaims({ title, body, call: async () => fixed.replace('893.29', '900.00') }),
    /numbers_changed/,
  );
  const clean = await enforceClaims({ title: '제목', body: '## 숫자\n- 코스피 7,003.74', call: async () => { throw new Error('must not be called'); } });
  assert.deepEqual(clean.claims.fixed, []);
});

test('Korea close does not publish a brief whose superlative survives the fix', async () => {
  const bad = `TITLE: 한국 금융시장 종합 — 10/5 (월) · 테스트\n## 숫자\n- 코스피 7,003.74 (+0.46%) → 사상 첫 7,000대 진입\n${'- 시장은 조용했지만 금리는 움직였다 → 테스트 문장\n'.repeat(8)}`;
  const { run, calls, restore } = await loadBrief('lib/briefs/korea-close.js', 'runKoreaCloseBrief', {
    env: configured,
    gemini: () => Response.json({ candidates: [{ content: { parts: [{ text: bad }] } }] }),
  });
  try {
    const result = await run({ force: true });
    assert.equal(result.ok, false);
    assert.match(result.error, /단정 표현/);
    assert.deepEqual(calls.automation.map((c) => c.action), ['briefClaim', 'briefRelease'], 'nothing is published');
    assert.match(calls.telegram.at(-1).text, /실패/);
  } finally {
    restore();
  }
});

test('52-week record line comes from closing data and never says all-time', async () => {
  const { yearRecord } = await import('../lib/market-sources.js');
  const day = 86400;
  const start = Date.UTC(2025, 9, 6) / 1000;
  const closes = Array.from({ length: 200 }, (_, i) => 6000 + i);
  closes[185] = 7080.92; // the 9/23-style high
  const result = {
    meta: { gmtoffset: 32400 },
    timestamp: closes.map((_, i) => start + i * day),
    indicators: { quote: [{ close: closes }] },
  };
  const s = { name: '코스피', kind: 'pct', digits: 2 };
  const line = yearRecord(result, s, 7003.74);
  assert.match(line, /^코스피 — 52주 종가 최고 7,080\.92 \(\d{4}-\d{2}-\d{2}\) · 52주 종가 최저 6,000\.00/);
  assert.doesNotMatch(line, /사상|역대/);
  assert.match(yearRecord(result, s, 7100), /오늘 종가가 52주 종가 최고\(52주 신고가\)/);
  assert.equal(yearRecord({ ...result, timestamp: result.timestamp.slice(0, 50) }, s, 7000), undefined, 'too little history → no claim');
});
