import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

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
      calls.openrouter.push({ auth: init.headers.Authorization, model: body.model, roles: body.messages.map((m) => m.role) });
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
      assert.equal(publish.title, '글로벌 마켓 브리핑 — 9/28 (월) · 테스트');
      assert.match(publish.body, /> 본 자료는 정보 제공 목적이며/);
      assert.equal(calls.telegram.length, 1);
      assert.equal(calls.telegram[0].chat_id, '@channel');
      assert.match(calls.telegram[0].text, /voices\?id=post-1/);
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
      assert.deepEqual(calls.openrouter, [{ auth: 'Bearer or-key', model: 'z-ai/glm-5.3-flash', roles: ['system', 'user'] }]);
      assert.equal(calls.automation.length, 0, 'a dry run never touches the lounge');
      assert.equal(result.title, '글로벌 마켓 브리핑 — 9/28 (월) · 테스트');
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
  const paths = JSON.parse(vercel).crons.map((c) => c.path);
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
  for (const file of ['lib/briefs/global.js', 'lib/briefs/korea-close.js']) {
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
