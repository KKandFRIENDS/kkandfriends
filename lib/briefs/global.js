// Daily global-market brief → lounge + opt-in alerts.
//
// Scheduled on the VPS by ops/briefs (cron, 07:00 KST Mon–Fri) — not by Vercel.
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
//   node ops/briefs/run.mjs global --dry    → generate + show, publish nothing
//   node ops/briefs/run.mjs global --force  → publish now, even on a weekend
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
// Requires migration db/migrations/012_daily_brief.sql.

import { fetchQuotes, fetchHeadlines, kstParts } from '../market-sources.js';
import { fetchEcosKeyStats } from '../ecos.js';
import { communityInternal } from '../community-internal.js';
import { humanizeBrief } from './humanize.js';

const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';
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
const KIND = 'global';

export async function runGlobalBrief({ dry = false, force = false } = {}) {
  const internalToken = process.env.EDITORIAL_INTERNAL_TOKEN;
  if (!internalToken || !LLM_KEY) {
    const missing = [
      !LLM_KEY && 'GEMINI_API_KEY (or OPENROUTER_API_KEY / AI_GATEWAY_API_KEY / ANTHROPIC_API_KEY)',
      !internalToken && 'EDITORIAL_INTERNAL_TOKEN',
    ].filter(Boolean);
    await alertAdmin(`⚠️ 데일리 브리핑 설정 누락 — ${missing.join(', ')}`);
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
      fetchQuotes(),
      fetchHeadlines(),
      fetchEcosKeyStats(),
    ]);
    if (!quotes.length && headlines.length < 4) {
      throw new Error('no usable market data or headlines (both sources unreachable)');
    }

    // ── 3. Write it.
    const { title, body, humanizer } = await writeBrief({ kst, quotes, headlines, macro });

    if (dry) {
      return {
        ok: true, dry: true, date: kst.date, model: usedModel, via: VIA, humanizer,
        quotes: quotes.map((q) => q.formatted), headlines: headlines.length,
        macro: macro.map((m) => m.formatted),
        title, body,
      };
    }

    // ── 4–5. The VPS commits the post, member notifications, and lock update
    //    together so a partial run cannot leave split state.
    const published = await communityInternal('briefPublish', {
      date: kst.date, kind: KIND, title, body, category: CATEGORY,
      notificationType: 'daily_brief',
    });
    const telegram = await notifyTelegram({ title, body, postId: published.postId });
    // A discarded humanizer pass still publishes the original, but KK hears
    // about it instead of the run counting as a clean success.
    if (!humanizer.applied) await alertAdmin(`ℹ️ 데일리 브리핑 humanizer 미적용 (${kst.date}) — ${humanizer.reason}. 원문으로 발행했습니다.`);

    return {
      ok: true, date: kst.date, postId: published.postId, title, model: usedModel, humanizer,
      quotes: quotes.length, headlines: headlines.length, macro: macro.length, notified: published.notified, telegram,
      url: `${SITE_URL}/voices?id=${published.postId}`,
    };
  } catch (err) {
    console.error('daily-brief error:', err);
    // Release the lock so a plain retry (or KK's manual run) works today.
    if (locked) await communityInternal('briefRelease', { date: kst.date, kind: KIND }).catch(() => {});
    await alertAdmin(`⚠️ 데일리 브리핑 실패 (${kst.date})\n${String(err.message || err).slice(0, 400)}`);
    return { ok: false, date: kst.date, error: String(err.message || err) };
  }
}

// ─── Claude ─────────────────────────────────────────────────────────────────

async function writeBrief({ kst, quotes, headlines, macro = [] }) {
  const dataBlock = quotes.length
    ? quotes.map((q) => `- ${q.formatted}`).join('\n')
    : '(시장 데이터를 가져오지 못했다. "숫자" 섹션은 생략하고 헤드라인만으로 쓸 것.)';
  const headlineBlock = headlines.length
    ? headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
    : '(헤드라인을 가져오지 못했다.)';

  // Omitted entirely when ECOS gave us nothing. Telling the model a section is
  // missing invites it to write ABOUT the gap; saying nothing just leaves the
  // brief as it was before ECOS existed.
  //
  // Phrased as an instruction, not an offer. The first version of this block
  // was all permissions ("억지로 넣지 않는다") while SYSTEM_PROMPT fixes an output
  // format with no macro slot in it — so the obedient move was to drop the data
  // entirely, which is what the model did. Naming the target section and
  // setting a floor is what actually gets the numbers through.
  const macroBlock = macro.length
    ? `

## 한국 매크로 배경 (한국은행 ECOS 공식 통계, 최신 발표치)
이 글은 글로벌 브리핑이지만 독자는 서울에서 읽는다. 아래는 오늘의 등락이 아니라 **최신 발표 수준(level)** 이고, 괄호 안이 그 수치의 기준 시점이다.

**\`## 오늘 한국 시장에서 볼 것\` 에서 이 중 최소 1개를 반드시 활용한다.** 간밤 글로벌 움직임이 한국 금리·물가에 어떻게 넘어오는지가 그 섹션의 핵심이다.
- 인용할 때 **기준 시점을 반드시 함께 밝힌다** (예: "국고채 3년 2.845%, 8/5 기준"). 월별·분기별 지표를 오늘 수치처럼 쓰면 안 된다.
- 여기 없는 수치는 만들지 않는다.
${macro.map((m) => `- ${m.formatted}`).join('\n')}`
    : '';

  const user = `오늘(KST): ${kst.date} (${kst.weekday})

## 직전 거래일 마감 기준 시장 데이터
숫자를 쓸 때는 아래 문자열을 **그대로 복사**해서 쓴다. 직접 계산하거나 바꾸지 말 것.
${dataBlock}${macroBlock}

## 최근 24시간 글로벌 마켓 헤드라인 (제목만, 본문 없음)
${headlineBlock}`;

  const text = USE_GEMINI ? await callGemini(user)
    : USE_OPENROUTER ? await callOpenRouter(user)
    : await callClaude(user);
  if (!text) throw new Error('model returned empty text');

  const m = text.match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/);
  const title = (m ? m[1] : `글로벌 마켓 브리핑 — ${kst.label} (${kst.weekday})`).trim().slice(0, 200);
  // Drop a stray H1 if the model added one on top of the TITLE line.
  const raw = (m ? m[2] : text).replace(/^\s*#\s+.*\n+/, '').trim();
  if (raw.length < 120) throw new Error('model returned a suspiciously short body');

  // Humanizer pass on the same writing route. It must not change which model
  // the result reports as the writer.
  const writer = usedModel;
  const polished = await humanizeBrief({
    title, body: raw,
    call: (system, prompt) => (USE_GEMINI ? callGemini(prompt, system)
      : USE_OPENROUTER ? callOpenRouter(prompt, system)
      : callClaude(prompt, system)),
  });
  usedModel = writer;
  return { title: polished.title, body: withDisclaimer(polished.body), humanizer: polished.humanizer };
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
async function callGemini(user, system = SYSTEM_PROMPT) {
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
async function callOpenRouter(user, system = SYSTEM_PROMPT) {
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
      if (!text) {
        throw new Error(`empty response (finish_reason: ${json.choices?.[0]?.finish_reason || 'none'})`);
      }
      usedModel = model;
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(`daily-brief: openrouter model ${model} failed:`, err.message);
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
async function callClaude(user, system = SYSTEM_PROMPT) {
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
  return (msg.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
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

KK & Friends는 초대로만 들어오는 한국 금융시장 전문가 멤버 전용 커뮤니티다. 당신은 그 라운지에 매일 아침 올리는 짧은 글로벌 마켓 브리핑을 쓴다. 독자는 전부 현업 프로다 — 기초 설명, 용어 풀이는 필요 없다.

## 톤 (Three Pillars: Witty · 따뜻한 냉소 · Financially Proficient)
- 첫 문장부터 결론. 서론·상투어 금지.
- 3박자 리듬: 결론 → 반전/냉소 → 찌르기. 한 문장 = 메시지 하나. 짧게 끊어 친다.
- "~입니다"와 "~다"를 호흡에 따라 혼용하되 "~다" 위주. 강사가 아니라 대화하는 동료의 톤.
- 냉소의 타깃은 "Trust me bro" 하이프, up-only 사고, 게으른 자본시장 관행. 사람을 향하지 않는다.
- 부드러운 카리스마. 자신감 있고 여유 있게, 절대 오만하지 않게.
- 한영 자연 혼용 (Fed, risk-off, curve, dovish, carry 등은 번역하지 않는다).
- 데이터와 리스크 앞에서는 서늘할 정도로 객관적. 감정 호소 배제.
- Up-only 낙관 금지 — 균열과 리스크를 항상 같이 놓는다.
- "~해야 한다" 식 훈계 금지. 사실을 놓고 판단은 독자 몫으로 남긴다.

## 출력 형식 (반드시 지킬 것)
첫 줄은 정확히 이 형태:
TITLE: 글로벌 마켓 브리핑 — {M/D} ({요일}) · {핵심을 찌르는 3~8단어}

그 다음 빈 줄, 그 다음부터 본문 마크다운:

[헤더 없이 한 줄 결론 1~2문장]

## 숫자
- **S&P 500** 6,234.11 (+0.82%) → 반 줄 해석
(제공된 데이터 중 그날 의미 있는 4~6개만 고른다. 전부 나열하지 말 것.)

## 이면
[2~5문장. 숫자와 헤드라인이 어긋나는 지점, 시장이 놓치고 있는 균열.]

## 오늘 한국 시장에서 볼 것
- 짧은 불릿 2~3개 (→ 화살표 사용)

💡 **채권 시장이 반영하는 진짜 금리 상단에만 집착하자**
　（이런 식으로 — 라벨이나 대괄호 없이, 실제 팁 문장만 굵게 한 줄. "[한 줄 실전 팁]" 같은
　 양식 문구를 그대로 출력하면 안 된다.）

（본문은 여기서 끝. **맨 아래 면책 문구는 시스템이 자동으로 붙이므로 절대 직접 쓰지 말 것.**
　"이건 내 해석이지…" 같은 마무리 문장도 쓰지 않는다.）

## 절대 금지
- **표 문법(| --- |) 금지.** 렌더러가 지원하지 않는다. 숫자는 반드시 불릿으로 쓴다.
- 제공되지 않은 수치를 쓰거나 추정치를 단정하는 것. 숫자는 주어진 문자열을 그대로 복사한다.
- 헤드라인 제목에 없는 사실을 추론해 단정하는 것. 헤드라인은 제목만 주어진다 — 기사 본문을 읽은 척하지 말 것. 불확실하면 "확인 필요"라고 쓴다.
- **만기나 종류가 다른 숫자끼리 차이·금리차를 매기는 것.** 예: 미 10년물과 국고채 3년을 나란히 "금리차"로 읽지 않는다. 비교는 같은 만기·같은 종류끼리만 한다.
- **"유일하게", "모두", "사상 최대", "처음으로" 같은 전칭·최상급 표현을 데이터가 보여주지 않는데 쓰는 것.** 예: 아시아 지수가 하나만 주어졌으면 "아시아에서 유일하게 빠졌다"고 쓸 수 없다.
- **움직임의 원인이나 주체를 근거 없이 단정하는 것** ("주말 전 매도가 밀었다", "외국인이 던졌다" 등). 원인은 주어진 헤드라인에 있을 때만 쓰고, 그때도 "~로 보인다"로 쓴다. 근거가 없으면 원인을 쓰지 않는다.
- 이미 쓴 메타포 재사용: 녹아내림 · 마진콜 · 진화의 흉터/면역 체계 · 트로이 목마/파놉티콘 · 갇힌 호수 · 봉건 영지 · 동인도회사 2.0 · 베를린 장벽 2.0 · 시간이 새는 모래시계 · 맨해튼 프로젝트 2.0
- 메타포를 매일 억지로 넣는 것. 1초 안에 그려지지 않으면 그냥 쓰지 않는다. 평범한 비유("양날의 검")는 금지.
- 개별 종목 매수/매도 추천, 투자 권유, 목표가 제시.
- 마크다운 헤더는 ## 와 ### 만 쓴다 (# 은 쓰지 않는다 — 제목은 TITLE 줄에서 처리된다).
- JB Financial Group과 부산시 관련 주제는 중립 분석가 시점만. 영향력 행사 뉘앙스 금지.

## 길이
본문 600~1,100자 (공백 제외). 브리핑이다. 칼럼이 아니다.`;

async function notifyTelegram({ title, body, postId }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;

  const text = [
    `📈 ${title}`,
    '',
    plain(body, 320),
    '',
    `전문 (멤버 전용): ${SITE_URL}/voices?id=${postId}`,
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
