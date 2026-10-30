// Korea market close brief → lounge + opt-in alerts.
//
// The 17:30 KST sibling of global.js: same voice, same plumbing, but it
// looks back at the session that just closed in Seoul rather than forward at
// the overnight global tape.
//
// Scheduled on the VPS by ops/briefs (cron, 17:30 KST Mon–Fri) — not by Vercel.
// Storage goes only through the VPS internal automation API. It:
//   1. locks the day in `daily_briefs` (so it can never publish twice),
//   2. pulls free market data + headlines (lib/market-sources.js),
//   3. has the model write a short brief in KK's voice,
//   4. asks the VPS API to publish it as KK in one transaction,
//   5. notifies opted-in approved members on-site, and posts a teaser to the
//      KK & Friends Telegram channel.
// Any failure — including missing configuration — sends KK a Telegram alert
// and returns ok:false, so a broken setup can never pass as a quiet success.
//
// Manual run on the VPS (see ops/briefs/README.md):
//   node ops/briefs/run.mjs korea-close --dry    → generate + show, publish nothing
//   node ops/briefs/run.mjs korea-close --force  → publish now, even on a weekend
//                                                  or if today already ran
//
// Env (ops/briefs/.env on the VPS):
//   ONE writing key is required; the first present wins:
//     GEMINI_API_KEY            Google Gemini (free tier, no credit card)
//     OPENROUTER_API_KEY        OpenRouter (model: OPENROUTER_MODEL)
//     AI_GATEWAY_API_KEY        Vercel AI Gateway (Claude)
//     ANTHROPIC_API_KEY         direct Anthropic API key (console.anthropic.com)
//   EDITORIAL_INTERNAL_TOKEN   required — must equal the API server's value
//   TELEGRAM_BOT_TOKEN          optional — reuses the existing bot
//   TELEGRAM_CHAT_ID            optional — KK's own chat; failure alerts go here
//   TELEGRAM_CHANNEL_ID         optional — @channel or -100…; falls back to
//                                          TELEGRAM_CHAT_ID
//   ECOS_API_KEY                optional — Bank of Korea open API (macro backdrop)
//   GEMINI_MODEL, OPENROUTER_MODEL, ANTHROPIC_MODEL, ANTHROPIC_EFFORT, COMMUNITY_API_URL,
//   SITE_URL — optional overrides
//
// Requires migrations db/migrations/012_daily_brief.sql and 014_korea_close_brief.sql.

import { fetchKoreaQuotes, fetchKoreaHeadlines, kstParts } from '../market-sources.js';
import { fetchEcosKeyStats } from '../ecos.js';
import { fetchOfficialStats, statsInBriefsEnabled } from '../stats/index.js';
import { communityInternal } from '../community-internal.js';
import { humanizeBrief } from './humanize.js';
import { enforceClaims } from './claims.js';
import { enforceGrounding } from './grounding.js';
import { stripDashes } from './dashes.js';
import { checkComplete, KOREA_SECTIONS } from './complete.js';

const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';
// Public Daily Markets address (server/src/routes/markets.js).
const MARKET_SLUG = (date) => `${date}-close`;
// Four possible writing routes, in priority order. Whichever key is present
// wins — no code change needed to switch:
//   1. GEMINI_API_KEY      Google Gemini. Free tier, no credit card required.
//   2. OPENROUTER_API_KEY  OpenRouter (the key the VPS Editorial Desk already uses).
//   3. AI_GATEWAY_API_KEY  Vercel AI Gateway (Claude, needs gateway credit).
//   4. ANTHROPIC_API_KEY   Anthropic direct (needs an Anthropic billing account).
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY;
const DIRECT_KEY = process.env.ANTHROPIC_API_KEY;
const USE_GEMINI = Boolean(GEMINI_KEY);
const USE_OPENROUTER = !USE_GEMINI && Boolean(OPENROUTER_KEY);
const USE_GATEWAY = !USE_GEMINI && !USE_OPENROUTER && Boolean(GATEWAY_KEY);
const LLM_KEY = GEMINI_KEY || OPENROUTER_KEY || GATEWAY_KEY || DIRECT_KEY;
const GATEWAY_URL = 'https://ai-gateway.vercel.sh';
// Gemini free-tier flash models, newest first — tried in order so a model that
// is retired or not yet enabled on this account can't break the daily job.
const GEMINI_MODELS = (process.env.GEMINI_MODEL || 'gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// OpenRouter model IDs, tried in order like the Gemini list: the newest DeepSeek
// flash, then the one the VPS Editorial Desk writer already runs on, then GLM
// (which returned empty answers on the Korea-close prompt on 2026-09-28).
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4.1-flash,deepseek/deepseek-v4-flash-0731:nitro,z-ai/glm-5.3-flash')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Reasoning models (GLM) otherwise spend the whole token budget thinking and
// return an empty answer (finish_reason: length) — seen live on 2026-09-28.
// Same fix as the Editorial Desk: keep thinking short. "none" disables it.
const OPENROUTER_REASONING = process.env.OPENROUTER_REASONING_EFFORT || 'low';
// Gateway model IDs are provider-prefixed; the direct API takes the bare id.
const CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL || (USE_GATEWAY ? 'anthropic/claude-opus-5' : 'claude-opus-5');
const MODEL = USE_GEMINI ? GEMINI_MODELS[0] : USE_OPENROUTER ? OPENROUTER_MODELS[0] : CLAUDE_MODEL;
const VIA = USE_GEMINI ? 'gemini' : USE_OPENROUTER ? 'openrouter' : USE_GATEWAY ? 'vercel-ai-gateway' : 'anthropic';
// The model that actually wrote the text — a fallback may have taken over.
let usedModel = MODEL;
// Thinking depth / spend, direct API only. Lower this (or switch MODEL to
// claude-sonnet-5) if the call gets slow or expensive.
const EFFORT = process.env.ANTHROPIC_EFFORT || 'medium';
const CATEGORY = '시장/매크로';
// Lock key for `daily_briefs` — see db/migrations/014 (one row per date+kind).
// Without this the Korea brief would insert with the column default ('global'),
// collide with the morning brief's row, and skip as "already ran today".
const KIND = 'korea_close';

export async function runKoreaCloseBrief({ dry = false, force = false } = {}) {
  const internalToken = process.env.EDITORIAL_INTERNAL_TOKEN;
  if (!internalToken || !LLM_KEY) {
    const missing = [
      !LLM_KEY && 'GEMINI_API_KEY (or OPENROUTER_API_KEY / AI_GATEWAY_API_KEY / ANTHROPIC_API_KEY)',
      !internalToken && 'EDITORIAL_INTERNAL_TOKEN',
    ].filter(Boolean);
    await alertAdmin(`⚠️ 한국 마감 브리핑 설정 누락 — ${missing.join(', ')}`);
    return { ok: false, error: 'not configured', missing };
  }

  const kst = kstParts();

  // Weekdays only (Mon–Fri, Korean time). `force=1` overrides for testing.
  if (kst.isWeekend && !force) {
    return { ok: true, skipped: 'weekend', date: kst.date, weekday: kst.weekday };
  }

  let locked = false;

  try {
    // ── 1. Lock today BEFORE spending money on the model. The primary key on
    //    brief_date makes a second run today fail here instead of publishing a
    //    duplicate post or re-notifying everyone.
    if (!dry) {
      const lock = await communityInternal('briefClaim', { date: kst.date, kind: KIND, force });
      if (!lock.claimed) return { ok: true, skipped: 'already ran today', date: kst.date };
      locked = true;
    }

    // ── 2. Inputs. All three are best-effort; none can throw. `macro` is the
    //    only optional one — it is empty whenever ECOS_API_KEY is unset, and
    //    an empty macro block simply drops that section from the prompt.
    const [quotes, headlines, macro] = await Promise.all([
      fetchKoreaQuotes(),
      fetchKoreaHeadlines(),
      fetchEcosKeyStats(),
    ]);
    if (!quotes.length && headlines.length < 4) {
      throw new Error('no usable market data or headlines (both sources unreachable)');
    }

    // Korean market holiday: KOSPI's latest session is an earlier day. On
    // 2026-10-09 (한글날) the close went out anyway with 10/8's numbers
    // presented as "today". Release the lock and publish nothing; the 17:50
    // retry reaches the same answer. Unknown session date → carry on.
    const kospi = quotes.find((q) => q.sym === '^KS11');
    if (!force && kospi?.sessionDate && kospi.sessionDate !== kst.date) {
      if (locked) {
        await communityInternal('briefRelease', { date: kst.date, kind: KIND }).catch(() => {});
        locked = false;
      }
      return { ok: true, skipped: 'market closed', date: kst.date, lastSession: kospi.sessionDate };
    }

    // Official statistics (공시 counts, 법령 개정): aggregates only, no company
    // names. Off unless STATS_IN_BRIEFS=1, and best-effort when on: a provider
    // that fails drops its lines and KK gets one info alert, the brief still goes.
    const official = statsInBriefsEnabled()
      ? await fetchOfficialStats()
      : { disclosure: [], law: [], errors: [] };
    if (official.errors.length) {
      console.warn('stats:', official.errors.join(' | '));
      await alertAdmin(`ℹ️ 한국 마감 브리핑 공식 통계 일부 미반영 (${kst.date}) ${official.errors.join(' | ').slice(0, 300)}`);
    }

    // ── 3. Write it.
    const { title, body, humanizer, claims, grounding } = await writeBrief({ kst, quotes, headlines, macro, official });

    if (dry) {
      return {
        ok: true, dry: true, date: kst.date, model: usedModel, via: VIA, humanizer,
        quotes: quotes.map((q) => q.formatted), headlines: headlines.length,
        macro: macro.map((m) => m.formatted),
        official: [...official.disclosure, ...official.law].map((l) => l.formatted),
        title, body, claims, grounding,
      };
    }

    // ── 4–5. The VPS commits the post, member notifications, and lock update
    //    together so a partial run cannot leave split state.
    const published = await communityInternal('briefPublish', {
      date: kst.date, kind: KIND, title, body, category: CATEGORY,
      notificationType: 'korea_close',
    });
    const telegram = await notifyTelegram({ title, body, marketSlug: MARKET_SLUG(kst.date) });
    // A discarded humanizer pass still publishes the original, but KK hears
    // about it instead of the run counting as a clean success.
    if (!humanizer.applied) await alertAdmin(`ℹ️ 한국 마감 브리핑 humanizer 미적용 (${kst.date}) — ${humanizer.reason}. 원문으로 발행했습니다.`);
    if (grounding.remaining.length) await alertAdmin(`ℹ️ 한국 마감 브리핑 해석 표현 남음 (${kst.date}) — ${grounding.remaining.join(' / ')}. 한 번 고쳐 보았으나 남아 그대로 발행했습니다. 글을 읽어 보세요.`);
    if (claims.fixed.length) await alertAdmin(`ℹ️ 한국 마감 브리핑 단정 표현 자동 수정 (${kst.date}) — ${claims.fixed.join(', ')}. 데이터로 확인할 수 없어 고쳐서 발행했습니다.`);

    return {
      ok: true, date: kst.date, postId: published.postId, title, model: usedModel, humanizer,
      quotes: quotes.length, headlines: headlines.length, macro: macro.length,
      official: official.disclosure.length + official.law.length,
      notified: published.notified, telegram,
      url: `${SITE_URL}/markets/${MARKET_SLUG(kst.date)}`,
    };
  } catch (err) {
    console.error('korea-close error:', err);
    // Release the lock so a plain retry (or KK's manual run) works today.
    if (locked) await communityInternal('briefRelease', { date: kst.date, kind: KIND }).catch(() => {});
    await alertAdmin(`⚠️ 한국 마감 브리핑 실패 (${kst.date})\n${String(err.message || err).slice(0, 400)}`);
    return { ok: false, date: kst.date, error: String(err.message || err) };
  }
}

// The model answer must be a finished brief, not a fragment cut at the token
// limit. Shared by the three writing routes: a failing answer is thrown away so
// the route's model list can try the next model.
const validateBrief = (text) => checkComplete(text, KOREA_SECTIONS);

// ─── Claude ─────────────────────────────────────────────────────────────────

async function writeBrief({ kst, quotes, headlines, macro = [], official = { disclosure: [], law: [] } }) {
  const records = quotes.filter((q) => q.record).map((q) => `- ${q.record}`);
  const recordBlock = records.length
    ? `

## 52주 기록 (종가 기준, 시스템 계산)
신고가·최고치·최저치를 말할 수 있는 근거는 이 줄뿐이다. "오늘 종가가 52주 종가 최고"라고 적힌 지수만 "52주 신고가"라고 쓸 수 있고, 반드시 "52주"를 붙인다.
"사상", "역대", "처음", "첫 ○○선 돌파" 같은 표현은 이 데이터로 확인할 수 없으므로 쓰지 않는다. 시스템이 발행 전에 검사해 걸러낸다.
${records.join('\n')}`
    : '';
  const dataBlock = quotes.length
    ? quotes.map((q) => `- ${q.formatted}`).join('\n')
    : '(시장 데이터를 가져오지 못했다. "오늘 있었던 일" 섹션은 생략하고 헤드라인만으로 쓸 것.)';
  const headlineBlock = headlines.length
    ? headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
    : '(헤드라인을 가져오지 못했다.)';

  // Omitted entirely when ECOS gave us nothing. Telling the model a section is
  // missing invites it to write ABOUT the gap; saying nothing just leaves the
  // brief as it was before ECOS existed.
  //
  // Phrased as an instruction, not an offer. The first version of this block
  // was all permissions ("배경으로만", "인용하지 않아도 된다") while SYSTEM_PROMPT
  // fixes an output format with no macro slot in it — so the obedient move was
  // to drop the data entirely, which is what the model did. Naming the target
  // section and setting a floor is what actually gets the numbers through.
  const macroBlock = macro.length
    ? `

## 한국 매크로 배경 (한국은행 ECOS 공식 통계, 최신 발표치)
아래는 **오늘의 등락이 아니라 최신 발표 수준(level)** 이다. 괄호 안이 그 수치의 기준 시점이다.

**이 중 오늘 이야기와 맞물리는 것을 최소 1개, 최대 3개 골라 반드시 인용한다.** 대개 금리(기준금리·국고채·CD·회사채)가 오늘 장과 가장 잘 맞물린다.
- 쓰는 자리: \`## 오늘 있었던 일\` 불릿에 한 줄로 섞거나, \`## 숫자 뒤에 있는 것\` 문장 안에 녹인다. 둘 중 어디든 좋다.
- 인용할 때 **기준 시점을 반드시 함께 밝힌다** (예: "국고채 3년 2.845%, 8/5 기준"). 월별·분기별 지표를 오늘 수치처럼 쓰면 안 된다.
- 오늘 움직임의 원인으로 단정하지 않는다. 어디까지나 배경이다.
- 여기 없는 수치는 만들지 않는다.
${macro.map((m) => `- ${m.formatted}`).join('\n')}`
    : '';

  // Aggregates only, by design: no company names, so the brief cannot read as a
  // stock call (매니페스토: 종목을 찍지 않는다). Optional on purpose. Unlike the
  // macro block it is background for ONE line, and most days nothing in it
  // touches the tape, so it asks for a line only when it connects.
  const officialLines = [...official.disclosure, ...official.law];
  const officialBlock = officialLines.length
    ? `

## 한국 공시·법령 배경 (금융감독원 DART, 국가법령정보센터)
아래는 오늘 장의 원인이 아니라 **자금조달 흐름과 제도 일정의 배경**이다. 공시 건수는 조회 시각까지 접수된 신규 주요사항보고서만 센 것이며 하루 전체가 아니다.

**오늘 이야기와 맞물리는 것이 있을 때만 \`## 내일 볼 것\` 이나 \`## 숫자 뒤에 있는 것\` 에 한 줄로 쓴다. 맞물리지 않으면 쓰지 않는다.**
- 건수나 시행일을 쓸 때 **기준 시점을 함께 밝힌다** (예: "10/21 17:30까지 접수 기준").
- 개별 기업 이름은 여기 없다. 만들어 쓰지 않는다.
- 공시나 개정을 호재, 악재, 주가 영향으로 단정하지 않는다.
- 법령은 시행예정일이 있는 것만 시행일과 함께 쓴다.
- 여기 없는 수치는 만들지 않는다.
${officialLines.map((l) => `- ${l.formatted}`).join('\n')}`
    : '';

  const user = `오늘(KST): ${kst.date} (${kst.weekday}), 한국 시장 마감 직후(17:30)다.

## 오늘 한국 마감 및 참고 지표
숫자를 쓸 때는 아래 문자열을 **그대로 복사**해서 쓴다. 직접 계산하거나 바꾸지 말 것.
코스피·코스닥·원/달러·삼성전자·SK하이닉스는 오늘 한국 마감 기준이다.
닛케이·상하이는 아시아 동시장, S&P 500·미 10년물·달러인덱스는 직전 미국 마감(어젯밤) 기준이다.
${dataBlock}${recordBlock}${macroBlock}${officialBlock}

## 최근 24시간 한국 시장 헤드라인 (제목만, 본문 없음)
${headlineBlock}`;

  const text = USE_GEMINI ? await callGemini(user, SYSTEM_PROMPT, validateBrief)
    : USE_OPENROUTER ? await callOpenRouter(user, SYSTEM_PROMPT, validateBrief)
    : await callClaude(user, SYSTEM_PROMPT, validateBrief);
  if (!text) throw new Error('model returned empty text');

  const m = text.match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/);
  // The title is fixed in code (2026-10-06 KK decision): "오늘의 마감 (10/6 화)".
  // Whatever the model put on its TITLE line is ignored, so neither the
  // humanizer nor the claim guard can change it either.
  const title = `오늘의 마감 (${kst.label} ${kst.weekday})`;
  // Drop a stray H1 if the model added one on top of the TITLE line.
  const raw = (m ? m[2] : text).replace(/^\s*#\s+.*\n+/, '').trim();
  if (raw.length < 120) throw new Error('model returned a suspiciously short body');

  // Humanizer pass on the same writing route. It must not change which model
  // the result reports as the writer.
  const writer = usedModel;
  const polished = await humanizeBrief({
    title, body: raw, fixedTitle: true,
    call: (system, prompt) => (USE_GEMINI ? callGemini(prompt, system)
      : USE_OPENROUTER ? callOpenRouter(prompt, system)
      : callClaude(prompt, system)),
  });
  // Claim guard: superlatives the inputs cannot back are rewritten once on the
  // same route, or the run fails and nothing is published (lib/briefs/claims.js).
  const checked = await enforceClaims({
    title, body: polished.body, fixedTitle: true,
    call: (system, prompt) => (USE_GEMINI ? callGemini(prompt, system)
      : USE_OPENROUTER ? callOpenRouter(prompt, system)
      : callClaude(prompt, system)),
  });
  // Grounding guard (2026-10-30): numbers the inputs do not contain fail the run;
  // interpretation patterns get one rewrite and are reported to KK if they stay.
  const grounded = await enforceGrounding({
    title, body: checked.body, fixedTitle: true, source: user,
    call: (system, prompt) => (USE_GEMINI ? callGemini(prompt, system)
      : USE_OPENROUTER ? callOpenRouter(prompt, system)
      : callClaude(prompt, system)),
  });
  usedModel = writer;
  // The humanizer and the claim rewrite both call the model, and either can cut
  // the body. Check the text that is actually about to be published; a bad one
  // fails the run (lock released, KK alerted) instead of going out.
  const incomplete = checkComplete(grounded.body, KOREA_SECTIONS);
  if (incomplete) throw new Error(`발행 전 완결성 검사 실패: ${incomplete}`);
  return { title, body: withDisclaimer(stripDashes(grounded.body)), humanizer: polished.humanizer, claims: checked.claims, grounding: grounded.grounding };
}

// The compliance line is appended in code, never written by the model — it must
// be byte-identical in every post, and a paraphrased disclaimer is worse than
// none. Any closing note the model wrote anyway is stripped first.
const DISCLAIMER =
  '본 자료는 정보 제공 목적이며 특정 자산의 매수·매도 권유가 아닙니다. 해석은 필자 개인의 견해입니다.';

function withDisclaimer(body) {
  const cleaned = body
    .split('\n')
    .filter((line) => !/내 해석이지|공식 전망이 아니|^\s*>?\s*_?\s*본 자료는/.test(line))
    .join('\n')
    .replace(/(?:\s*(?:---|\*\*\*|___)\s*)+$/, '')  // trailing rule the note sat under
    .trim();
  return `${cleaned}\n\n---\n\n> ${DISCLAIMER}`;
}

// ── Google Gemini (free tier, no credit card) ───────────────────────────────
// Plain REST — no SDK, so nothing new to install and nothing to break at build
// time. Model IDs are tried in order: if the newest flash model isn't enabled
// on this account, the next one takes over instead of the job failing.
async function callGemini(user, system = SYSTEM_PROMPT, validate) {
  let lastErr;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': LLM_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: 8000, temperature: 0.9 },
          }),
          signal: AbortSignal.timeout(45_000),
        }
      );

      const raw = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 300)}`);

      const json = JSON.parse(raw);
      if (json.promptFeedback?.blockReason) {
        throw new Error(`blocked by safety filter (${json.promptFeedback.blockReason})`);
      }
      const text = (json.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();
      if (!text) {
        throw new Error(`empty response (finishReason: ${json.candidates?.[0]?.finishReason || 'none'})`);
      }
      // A cut-off answer is not an answer: fall through to the next model.
      const finish = json.candidates?.[0]?.finishReason;
      if (finish === 'MAX_TOKENS') throw new Error('truncated response (finishReason: MAX_TOKENS)');
      if (validate) {
        const bad = validate(text);
        if (bad) throw new Error(`incomplete response: ${bad}`);
      }
      usedModel = model;
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(`daily-brief: gemini model ${model} failed:`, err.message);
    }
  }
  throw new Error(`Gemini 호출 실패 — ${String(lastErr?.message || lastErr)}`);
}

// ── OpenRouter (OpenAI-compatible chat completions) ─────────────────────────
// Plain REST like Gemini. Same model-list fallback.
async function callOpenRouter(user, system = SYSTEM_PROMPT, validate) {
  let lastErr;
  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LLM_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': SITE_URL,
          'X-Title': 'KK & Friends lounge brief',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_tokens: 8000,
          temperature: 0.9,
          reasoning: { effort: OPENROUTER_REASONING },
        }),
        signal: AbortSignal.timeout(120_000),
      });

      const raw = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 300)}`);

      const json = JSON.parse(raw);
      if (json.error) throw new Error(String(json.error.message || json.error).slice(0, 300));
      const text = String(json.choices?.[0]?.message?.content || '').trim();
      const finish = json.choices?.[0]?.finish_reason;
      if (!text) {
        throw new Error(`empty response (finish_reason: ${finish || 'none'})`);
      }
      // 2026-10-26: a text cut at max_tokens arrived non-empty and was published
      // as a 188-character fragment. Anything but a clean stop is thrown away.
      if (finish && finish !== 'stop') throw new Error(`truncated response (finish_reason: ${finish})`);
      if (validate) {
        const bad = validate(text);
        if (bad) throw new Error(`incomplete response: ${bad}`);
      }
      usedModel = model;
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(`korea-close: openrouter model ${model} failed:`, err.message);
    }
  }
  throw new Error(`OpenRouter 호출 실패 — ${String(lastErr?.message || lastErr)}`);
}

// ── Anthropic (direct or via Vercel AI Gateway) ─────────────────────────────
// Try the richest request first and shed unsupported parameters on a 400. This
// is an unattended daily job, so a param the route doesn't recognise must
// degrade instead of silently killing the brief:
//   1. direct API only — server-side refusal fallback (beta) + effort control
//   2. adaptive thinking, no extras            (documented on both routes)
//   3. nothing but model/system/messages       (last resort; Opus 5 thinks anyway)
async function callClaude(user, system = SYSTEM_PROMPT, validate) {
  // Client-side timeout so a hung request fails with a real error (and a
  // Telegram alert) instead of blocking the scheduled run.
  // Pointing baseURL at the gateway is the only difference between the two
  // Anthropic routes — the gateway speaks the same Messages API.
  // Loaded lazily: only this route needs the SDK, so a Gemini-only setup
  // never depends on it being installed.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: LLM_KEY,
    ...(USE_GATEWAY ? { baseURL: GATEWAY_URL } : {}),
    timeout: 45_000,
    maxRetries: 1,
  });
  const params = {
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
  };

  const msg = await create(client, params);
  if (msg.stop_reason === 'refusal') {
    throw new Error(`model refused (${msg.stop_details?.category || 'unknown'})`);
  }
  const text = (msg.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (msg.stop_reason === 'max_tokens') throw new Error('truncated response (stop_reason: max_tokens)');
  if (validate) {
    const bad = validate(text);
    if (bad) throw new Error(`incomplete response: ${bad}`);
  }
  return text;
}

async function create(client, params) {
  const attempts = [];
  if (!USE_GATEWAY) {
    attempts.push(() =>
      client.beta.messages.create({
        ...params,
        output_config: { effort: EFFORT },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
    );
    attempts.push(() =>
      client.messages.create({ ...params, output_config: { effort: EFFORT } })
    );
  }
  attempts.push(() => client.messages.create(params));
  const { thinking, ...minimal } = params;
  attempts.push(() => client.messages.create(minimal));

  let lastErr;
  for (const [i, attempt] of attempts.entries()) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      // Only a rejected-parameter error is worth retrying with less.
      if (err?.status !== 400 || i === attempts.length - 1) throw err;
      console.warn(`daily-brief: request rejected (attempt ${i + 1}), retrying simpler:`, err.message);
    }
  }
  throw lastErr;
}

const SYSTEM_PROMPT = `당신은 KK다. 30년 자본시장 현장 베테랑(JP모건 → BofA 메릴린치 → ANZ → CROWDY → Bitplanet → JB Financial), NewFi 개척자. 이론가가 아니라 "판을 읽는 사람"이다.

당신은 KK & Friends 사이트에 **한국 시장 마감 직후(17:30)** 올리는 짧은 종합 브리핑 「오늘의 마감」을 쓴다. 아침의 「오늘의 시작」과 짝을 이루는 글이다. 이건 오늘 서울에서 끝난 장을 되짚는 글이다.

독자는 현업 프로와 일반 독자 둘 다다 (2026-10-06부터 누구나 읽는 공개 Daily Markets). 프로가 지루하지 않게, 일반 독자가 놓치지 않게 쓴다:
- 약자와 업계 용어는 **글에서 처음 나올 때만** 괄호나 짧은 구절로 뜻을 한 번 푼다. 예: "ERP(주식이 채권보다 더 벌어야 하는 몫)", "듀레이션(금리가 움직일 때 채권값이 흔들리는 정도)". 두 번째부터는 풀지 않는다.
- 철자만 풀지 말고 무슨 뜻인지를 푼다. 풀이는 한 구절로 끝낸다. 문단 설명이나 일상 예시는 넣지 않는다.
- 풀이에는 시장 데이터 숫자를 넣지 않는다 (bp 같은 단위 뜻풀이만 예외).
- 아래 용어는 글에 나오면 **반드시** 처음 한 번 푼다 (자주 설명 없이 새는 것들):
  bp(0.01%p), 스프레드·신용스프레드(회사가 나라보다 돈을 빌릴 때 더 내는 이자), 순환매(오른 쪽을 팔고 덜 오른 쪽으로 돈이 옮겨 가는 것), 듀레이션, 멀티플, 밸류에이션, ERP, 실질금리, 디레이팅, 차익 실현.
  괄호 안 풀이는 예시다. 같은 뜻이면 표현은 바꿔도 된다.
- Fed, risk-off, curve, dovish, carry처럼 호흡을 만드는 영어는 풀지 않는다.
- 한 번 읽으면 알아듣게 쓴다. 한 문장에 숫자는 하나, 문장은 짧게. 처음 읽는 사람이 위에서 아래로 읽으면 "오늘 무슨 일이 있었나 → 왜 그런가 → 내일 뭘 보면 되나"가 이어져야 한다.
- 분량과 형식은 아래 규칙 그대로다. 풀이 때문에 길어지면 다른 문장을 줄인다.

## 톤 (Three Pillars: Witty · 따뜻한 냉소 · Financially Proficient)
- 첫 문장부터 결론. 서론·상투어 금지.
- 3박자 리듬: 결론 → 반전/냉소 → 찌르기. 한 문장 = 메시지 하나. 짧게 끊어 친다.
- "~입니다"와 "~다"를 호흡에 따라 혼용하되 "~다" 위주. 강사가 아니라 대화하는 동료의 톤.
- 냉소의 타깃은 "Trust me bro" 하이프, up-only 사고, 게으른 자본시장 관행. 사람을 향하지 않는다.
- 부드러운 카리스마. 자신감 있고 여유 있게, 절대 오만하지 않게.
- 한영 자연 혼용 (Fed, risk-off, curve, dovish, carry 등은 번역하지 않는다).
- 데이터와 리스크 앞에서는 서늘할 정도로 객관적. 감정 호소 배제.
- Up-only 낙관 금지. 균열과 리스크를 항상 같이 놓는다.
- "~해야 한다" 식 훈계 금지. 사실을 놓고 판단은 독자 몫으로 남긴다.

## 이 브리핑의 관점 (아침 글로벌 브리핑과 다른 점)
- **지수의 방향보다 그 방향을 만든 구조**를 본다. 무엇이 올랐나보다 무엇이 그것을 밀었나.
- 오늘 한국 장의 움직임을 어젯밤 미국·오늘 아시아 지표와 **연결**한다. 한국 시장은 혼자 움직이지 않는다.
- 코스피와 코스닥의 방향/폭이 갈리면 그 자체가 이야기다. 대형주와 중소형주의 자금이 다르게 움직였다는 뜻이다.
- 지수가 크게 움직인 날 원화가 함께 움직였는지 아닌지는 항상 확인할 항목이다.
- 마지막은 오늘의 감상이 아니라 **내일 확인할 것**으로 끝낸다.

## 출력 형식 (반드시 지킬 것)
첫 줄은 정확히 이 형태:
TITLE: 오늘의 마감 ({M/D} {요일})

그 다음 빈 줄, 그 다음부터 본문 마크다운. 이 순서를 지킨다 (섹션 이름도 그대로):

[헤더 없이 한 줄 결론 1~2문장. 시장을 모르는 사람도 알아듣는 쉬운 말로, 오늘 한국 장이 어떻게 끝났는지 먼저 말한다. **결론 한 줄도 숫자로 확인되는 사실만 쓴다.** 어느 지수가 얼마나 올랐고 내렸는지를 말하고, 이유나 매도 주체는 이 줄에 쓰지 않는다 (그건 "## 숫자 뒤에 있는 것"에서 근거와 함께 다룬다).]

## 오늘 있었던 일
- **코스피** 6,023.66 (−10.84%) → 이게 무슨 뜻인지 쉬운 말 반 줄
(제공된 데이터 중 그날 의미 있는 5~8개를 고른다. 전부 나열하지 말 것. 코스피·코스닥 말고도 환율·금리·업종 대표 종목 가운데 그날 움직임을 설명하는 것을 섞는다. 한국 지표를 우선하고, 해외 지표는 오늘 한국 장을 설명하는 데 필요한 것만 고른다. "→" 뒤는 전문용어 없이, 처음 읽는 사람이 "그래서 뭔데?"라고 묻지 않게 한두 문장으로 쓴다.)

## 숫자 뒤에 있는 것
[두 문단, 5~8문장. 첫 문단은 오늘 움직임을 만든 가장 큰 사건이나 종목을 주어진 헤드라인의 사실(누가, 무엇을, 얼마나)로 풀어 쓴다. 둘째 문단은 코스피·코스닥·환율·금리를 이어서 읽고, 숫자와 헤드라인이 어긋나는 지점이나 시장이 놓치고 있는 균열 하나를 쓴다. 오늘 움직임의 원인으로 지목되는 것이 헤드라인에 있으면 그것을 다루되, 확정되지 않은 해석은 "확인이 더 필요하다"고 명시한다.]

## 내일 볼 것
- 불릿 3~4개 (→ 화살표 사용). 각 불릿에 "무엇을 보는지", "왜 보는지", 그리고 의미가 달라지는 기준(주어진 숫자 중 하나)이 한 줄에 같이 보이게 쓴다.

💡 **그날 데이터에서 나온, 내일 하루 눈여겨볼 한 가지**
　（마지막 줄은 💡로 시작하고 실제 문장만 굵게 한 줄 쓴다. 라벨이나 대괄호, 위 설명문을 그대로 출력하면 안 된다.
　 **매일 달라야 한다.** 그날 숫자나 헤드라인에서 나온 구체적인 행동 하나(무엇을 보고, 무엇을 조심할지)로 쓴다.
　 일반적인 투자 격언이나 어제 쓴 문장을 되풀이하지 않는다. 형식만 참고: "○○가 △△를 넘는지만 본다".）

（본문은 여기서 끝. **맨 아래 면책 문구는 시스템이 자동으로 붙으므로 절대 직접 쓰지 말 것.**
　"이건 내 해석이지…" 같은 마무리 문장도 쓰지 않는다.）

## 절대 금지
- **표 문법(| --- |) 금지.** 렌더러가 지원하지 않는다. 숫자는 반드시 불릿으로 쓴다.
- 제공되지 않은 수치를 쓰거나 추정치를 단정하는 것. 숫자는 주어진 문자열을 그대로 복사한다.
- **투자자별 수급(외국인/기관/개인 순매수·순매도 금액)은 데이터로 제공되지 않는다.** 헤드라인에 그 수치가 명시적으로 있을 때만 인용하고, 없으면 쓰지 않는다. 절대 지어내지 말 것.
- 헤드라인 제목에 없는 사실을 추론해 단정하는 것. 헤드라인은 제목만 주어진다. 기사 본문을 읽은 척하지 말 것. 불확실하면 "확인 필요"라고 쓴다.
- **만기나 종류가 다른 숫자끼리 차이·금리차를 매기는 것.** 예: 미 10년물과 국고채 3년을 나란히 "금리차"로 읽지 않는다. 비교는 같은 만기·같은 종류끼리만 한다.
- **"유일하게", "모두", "사상 최대", "처음으로" 같은 전칭·최상급 표현을 데이터가 보여주지 않는데 쓰는 것.** 예: 아시아 지수가 하나만 주어졌으면 "아시아에서 유일하게 빠졌다"고 쓸 수 없다.
- **움직임의 원인이나 주체를 근거 없이 단정하는 것** ("주말 전 매도가 밀었다", "외국인이 던졌다" 등). 원인은 주어진 헤드라인에 있을 때만 쓰고, 그때도 "~로 보인다"로 쓴다. "~라는 신호다", "~했다는 뜻이다"처럼 해석을 사실처럼 끝맺는 문장도 같은 규칙이다. 근거가 없으면 원인을 쓰지 않는다.
- 이미 쓴 메타포 재사용: 녹아내림 · 마진콜 · 진화의 흉터/면역 체계 · 트로이 목마/파놉티콘 · 갇힌 호수 · 봉건 영지 · 동인도회사 2.0 · 베를린 장벽 2.0 · 시간이 새는 모래시계 · 맨해튼 프로젝트 2.0 · 길모퉁이
- 메타포를 매일 억지로 넣는 것. 1초 안에 그려지지 않으면 그냥 쓰지 않는다. 평범한 비유("양날의 검")는 금지.
- 개별 종목 매수/매도 추천, 투자 권유, 목표가 제시. (삼성전자·SK하이닉스는 지수를 설명하는 맥락에서만 언급한다.)
- **em dash(—)와 en dash(–) 금지.** 쉼표, 마침표, 콜론, 괄호 중 하나로 쓰거나 문장을 다시 쓴다. 범위는 "3.75–4.00%"처럼 주어진 숫자 문자열 안에서만 허용된다. 대시를 쓰지 않는다고 덧붙이지 않는다.
- **맨 앞 결론 줄과 화살표(→) 뒤 풀이로 원인이나 돈의 이동을 단정하는 것.** 풀이는 그 숫자가 무엇을 뜻하는지만 쓴다. "돈이 채권으로 갔다", "AI 기대가 식었다", "아시아 전체가 흔들렸다" 같은 원인·주체·범위는 주어진 헤드라인이나 데이터에 근거가 있을 때만 쓰고, 그때도 "~로 보인다"로 쓴다.
- **제공되지 않은 기간 비교.** "6개월 만의 최저", "어제까지의 상승분을 반납" 같은 표현은 52주 기록 줄이나 주어진 데이터에 있을 때만 쓴다. 오늘 하루의 등락률 말고는 비교 기준이 없다고 보고 쓴다.
- 마크다운 헤더는 ## 와 ### 만 쓴다 (# 은 쓰지 않는다. 제목은 TITLE 줄에서 처리된다).
- JB Financial Group과 부산시 관련 주제는 중립 분석가 시점만. 영향력 행사 뉘앙스 금지.

## 충실하게 쓰는 기준
- 모든 문단에 구체적인 사실을 하나 이상 넣는다. 주어진 숫자, 또는 주어진 헤드라인 속 사건(누가, 무엇을, 얼마나)이다. "불확실성이 커졌다", "변동성에 유의해야 한다" 같은 내용 없는 문장은 쓰지 않는다.
- 지수 숫자만 줄 세우지 않는다. 주어진 헤드라인과 거시 지표를 함께 읽는다. 헤드라인에 구체적인 사건이 있으면 그 사건을 한 번은 풀어서 쓴다. 헤드라인은 제목만 주어지므로, 제목에 없는 내용은 만들지 않는다.
- 숫자마다 "그래서 무엇이 달라지나"를 쉬운 말로 붙인다.
- 서로 이어지는 숫자는 이어서 읽는다 (예: 금리와 주가, 환율과 외국인 자금). 원인은 근거가 있을 때만 "~로 보인다"로 쓴다. 같은 만기·같은 종류끼리만 비교한다는 규칙은 그대로다.
- 해석 문장과 사실을 구분한다. 원인, 의도, 자금의 방향을 "~라는 뜻이다", "~라는 얘기다", "~한 셈이다", "~가 더 정확하다"로 단정하지 않는다. 의미나 원인을 쓰려면 주어진 헤드라인에 근거가 있을 때만 "~로 보인다"로 쓴다.
- 주어진 데이터에 없는 것을 다른 숫자로 짐작하지 않는다. 환율로 외국인 자금의 방향을, 금리로 주가 하락의 원인을, 한 지수의 낙폭으로 시장 전체의 위험 선호를 단정하지 않는다.
- "낮은 수준", "아직 여유가 있다", "얼어붙지 않았다" 같은 수준 판단은 비교 기준이 주어졌을 때만 쓴다. 기준이 없으면 숫자만 쓴다.
- 전망을 단정하지 않는다. "다음 주 방향을 가른다", "~로 이어질 것이다"는 쓰지 않는다. 볼 것은 무엇을 보고 어느 숫자를 넘으면 의미가 달라지는지까지만 쓴다.
- 헤드라인에서 가져온 숫자(낙폭, 규모, 시각)는 그 헤드라인에 적힌 그대로만 쓴다. 헤드라인끼리 숫자가 다르면 쓰지 않는다. "사상 최대", "역대 최대" 같은 최상급은 헤드라인에 있어도 옮기지 않는다.
- "→" 뒤 풀이는 앞 문장을 되풀이하지 않는다("많이 빠졌다는 뜻"). 독자가 몰랐을 정보나 비교를 한 가지 준다.
- 💡 줄은 한 문장, 한 가지 행동이다. 두 가지를 쉼표로 이어 붙이지 않는다.
- 볼 것의 기준 숫자는 주어진 숫자 그대로만 쓴다(지금 값, 52주 기록, 헤드라인에 적힌 선). "70bp", "1,340"처럼 새 문턱을 만들지 않는다. 코드가 데이터에 없는 숫자를 잡아내고, 남으면 그날 브리핑이 발행되지 않는다.
- "~선 위", "~선 아래", "넘는다", "밑돈다"는 주어진 숫자와 크기를 맞춰 본 뒤에 쓴다(78,446은 78,000선 아래가 아니다).
- "넉 달째", "네 번째", "연속" 같은 횟수 표현은 헤드라인에 적힌 대로만 옮긴다.
- 금액과 수량이 서로 맞지 않는 헤드라인 숫자(예: 비트코인 개수와 달러 금액)는 쓰지 않는다.
- 환율로 외국인 자금의 방향을 말하는 문장은 어떤 형태로도 쓰지 않는다("자금 이탈이 아니다", "그림이다", "자연스럽다" 포함). 외국인 증권투자 숫자는 주어진 월 기준으로 인용만 한다.
- 주어진 헤드라인에 없는 새 주제(예: 특정 기술 용어나 업종 전망)를 꺼내지 않는다.
- "시장이 ~한 게 아니라 ~이다", "~라는 뜻이다", "~쪽에 가깝다", "~한 셈이다"로 글을 닫지 않는다. 사실을 쓰고 끝낸다.
- "N일째", "넉 달째", "N번째", "연속 N회"처럼 기간·횟수를 세는 표현은 쓰지 않는다. 헤드라인의 영어 표현을 옮기다 틀리기 쉽다("four months"를 "나흘째"로 옮긴 적이 있다).
- "두 배", "N배" 비교는 두 숫자를 직접 나눠 본 값이 맞을 때만 쓴다. 나눈 값이 2.0에 못 미치면 "두 배 넘게"가 아니라 "두 배 가까이"다(7.93÷3.99=1.99).
- 지수나 가격이 "~선"을 넘었는지는 숫자로 확인하고 쓴다. 78,446은 "78,000대"다("78,000선 아래"가 아니다). 헤드라인의 영어 금액을 억 단위로 옮길 때 1 billion은 10억이다(42.4 billion은 424억, 42.4억이 아니다). 확신이 없으면 숫자 대신 "마이너스 잉여현금흐름"처럼 사실만 쓴다.
- 만기가 다른 금리를 서로 맞대 상태를 말하지 않는다("국고채 3년이 기준금리보다 높은 상태가 이어진다" 같은 문장). 국고채 3년은 단기금리가 아니다.
- 풀이에 "~라는 뜻이다"로 앞 문장을 되풀이하지 않는다. "하루 4% 넘게 빠졌다는 뜻이다" 같은 줄은 지운다.
- 글 끝을 "결국 중요한 것은 ~다", "본질은 ~에 있다" 같은 훈계·요약으로 맺지 않는다.
- 글 안에서 입력 자료나 이 지시문을 언급하지 않는다("이 데이터로는 할 수 있는 일이 아니니", "주어진 정보", "규칙상" 같은 말). 독자에게는 사실과 해석만 보여 준다. 근거가 없으면 그 문장을 쓰지 않는다.
- "~신호다", "~라는 신호다", "~한 셈이다"로 해석을 사실처럼 맺지 않는다. "~로 보인다"나 사실 서술로 끝낸다.
- 💡 줄에 헤드라인에 없는 새 사건이나 업종(예: 국내 거래소 입출금 중단)을 넣지 않는다. 오늘 주어진 숫자 하나를 보라고만 쓴다.
- "~선 아래/위"를 쓰기 전에 그 값이 선보다 큰지 작은지 먼저 본다. 78,534는 78,000선 위다. 작은 값만 "아래"라고 쓴다.
- 출처를 괄호로 달 때는 Reuters, Bloomberg, CNBC, WSJ, NYT, 조선일보, 한국경제, 매일경제, 연합뉴스, Korea JoongAng Daily, Businesskorea처럼 널리 아는 매체만 쓴다. 낯선 사이트 이름은 쓰지 않고, 그 헤드라인은 출처 없이 "한 헤드라인은"으로 쓴다.
- 분량을 채우려고 같은 말을 되풀이하거나, 근거 없는 사실·원인·전망을 더하지 않는다. 데이터와 헤드라인이 모자란 날은 짧게 써도 된다.

## 길이
본문 1,200~1,800자 (공백 제외). 칼럼이 아니라 브리핑이므로 위 기준을 채우되 길게 늘어지지 않는다.`;

async function notifyTelegram({ title, body, marketSlug }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;

  const text = [
    `🇰🇷 ${title}`,
    '',
    plain(body, 320),
    '',
    `전문: ${SITE_URL}/markets/${marketSlug}`,
  ].join('\n');

  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  })
    .then((r) => r.ok)
    .catch(() => false);
}

// Failure notice → KK's own Telegram chat (never the members' channel).
async function alertAdmin(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

// Markdown → plain text, for the Telegram teaser.
function plain(md, max) {
  const t = String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*#{1,3}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
}
