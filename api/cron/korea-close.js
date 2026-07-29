// GET /api/cron/korea-close — Korea market close brief → lounge + opt-in alerts.
//
// The 17:30 KST sibling of daily-brief.js: same voice, same plumbing, but it
// looks back at the session that just closed in Seoul rather than forward at
// the overnight global tape. Runs weekdays only.
//
// Runs on a Vercel cron (see vercel.json) every weekday at 17:30 KST. It:
//   1. locks the day in `daily_briefs` (so it can never publish twice),
//   2. pulls free market data + headlines (lib/market-sources.js),
//   3. has Claude write a short brief in KK's voice,
//   4. inserts it into `member_posts` as KK (service_role, admin UID),
//   5. notifies opted-in approved members on-site, and posts a teaser to the
//      KK & Friends Telegram channel.
//
// Manual testing (browser, replace <secret> with CRON_SECRET):
//   …/api/cron/korea-close?key=<secret>&dry=1   → generate + show, publish nothing
//   …/api/cron/korea-close?key=<secret>&force=1 → publish now, even on a weekend
//                                                  or if today already ran
//
// Env (Vercel → Settings → Environment Variables):
//   ONE of these two is required for the writing step:
//     AI_GATEWAY_API_KEY        Vercel AI Gateway key (no Anthropic account or
//                               credit card needed; free tier = $5 / 30 days).
//                               Takes precedence when both are set.
//     ANTHROPIC_API_KEY         direct Anthropic API key (console.anthropic.com)
//   SUPABASE_SERVICE_ROLE_KEY   required — server only, bypasses RLS
//   CRON_SECRET                 required — already set for the weekly digest
//   TELEGRAM_BOT_TOKEN          optional — reuses the existing bot
//   TELEGRAM_CHANNEL_ID         optional — @channel or -100…; falls back to
//                                          TELEGRAM_CHAT_ID (KK's own chat)
//   ANTHROPIC_MODEL, SUPABASE_URL, SITE_URL, ADMIN_UID — optional overrides
//
// Requires migrations db/migrations/012_daily_brief.sql and 014_korea_close_brief.sql.

import Anthropic from '@anthropic-ai/sdk';
import { fetchKoreaQuotes, fetchKoreaHeadlines, kstParts } from '../../lib/market-sources.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pahdwduqxxiugqjkbhvq.supabase.co';
const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';
const ADMIN_UID = process.env.ADMIN_UID || '6ac6cf72-1c88-4626-9124-27a6a2792e1e';
// Three possible writing routes, in priority order. Whichever key is present
// wins — no code change needed to switch:
//   1. GEMINI_API_KEY      Google Gemini. Free tier, no credit card required.
//   2. AI_GATEWAY_API_KEY  Vercel AI Gateway (Claude, needs gateway credit).
//   3. ANTHROPIC_API_KEY   Anthropic direct (needs an Anthropic billing account).
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY;
const DIRECT_KEY = process.env.ANTHROPIC_API_KEY;
const USE_GEMINI = Boolean(GEMINI_KEY);
const USE_GATEWAY = !USE_GEMINI && Boolean(GATEWAY_KEY);
const LLM_KEY = GEMINI_KEY || GATEWAY_KEY || DIRECT_KEY;
const GATEWAY_URL = 'https://ai-gateway.vercel.sh';
// Gemini free-tier flash models, newest first — tried in order so a model that
// is retired or not yet enabled on this account can't break the daily job.
const GEMINI_MODELS = (process.env.GEMINI_MODEL || 'gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Gateway model IDs are provider-prefixed; the direct API takes the bare id.
const CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL || (USE_GATEWAY ? 'anthropic/claude-opus-5' : 'claude-opus-5');
const MODEL = USE_GEMINI ? GEMINI_MODELS[0] : CLAUDE_MODEL;
const VIA = USE_GEMINI ? 'gemini' : USE_GATEWAY ? 'vercel-ai-gateway' : 'anthropic';
// Thinking depth / spend, direct API only. Lower this (or switch MODEL to
// claude-sonnet-5) if the call ever bumps the function's 60s ceiling.
const EFFORT = process.env.ANTHROPIC_EFFORT || 'medium';
const CATEGORY = '시장/매크로';
// Lock key for `daily_briefs` — see db/migrations/014 (one row per date+kind).
// Without this the Korea brief would insert with the column default ('global'),
// collide with the morning brief's row, and skip as "already ran today".
const KIND = 'korea_close';

export default async function handler(req, res) {
  // ── Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; a manual
  //    browser test may pass `?key=<secret>` instead.
  const secret = process.env.CRON_SECRET;
  let qs = new URLSearchParams();
  try { qs = new URL(req.url, 'http://x').searchParams; } catch {}
  if (secret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${secret}` && qs.get('key') !== secret) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  const dry = qs.get('dry') === '1';
  const force = qs.get('force') === '1';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !LLM_KEY) {
    return res.status(200).json({
      ok: true,
      skipped: 'not configured',
      missing: [
        !LLM_KEY && 'GEMINI_API_KEY (or AI_GATEWAY_API_KEY / ANTHROPIC_API_KEY)',
        !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
      ].filter(Boolean),
    });
  }

  const kst = kstParts();

  // Weekdays only (Mon–Fri, Korean time). `force=1` overrides for testing.
  if (kst.isWeekend && !force) {
    return res.status(200).json({ ok: true, skipped: 'weekend', date: kst.date, weekday: kst.weekday });
  }

  const db = supabase(serviceKey);
  let locked = false;

  try {
    // ── 1. Lock today BEFORE spending money on the model. The primary key on
    //    brief_date makes a second run today fail here instead of publishing a
    //    duplicate post or re-notifying everyone.
    if (!dry) {
      const lock = await db.insert('daily_briefs', { brief_date: kst.date, kind: KIND, status: 'running' });
      if (lock.status === 409) {
        if (!force) {
          return res.status(200).json({ ok: true, skipped: 'already ran today', date: kst.date });
        }
        await db.patch(`daily_briefs?brief_date=eq.${kst.date}&kind=eq.${KIND}`, { status: 'running' });
      } else if (!lock.ok) {
        throw new Error(`daily_briefs lock failed (${lock.status}): ${lock.text}`);
      }
      locked = true;
    }

    // ── 2. Inputs. Both are best-effort; neither can throw.
    const [quotes, headlines] = await Promise.all([fetchKoreaQuotes(), fetchKoreaHeadlines()]);
    if (!quotes.length && headlines.length < 4) {
      throw new Error('no usable market data or headlines (both sources unreachable)');
    }

    // ── 3. Write it.
    const { title, body } = await writeBrief({ kst, quotes, headlines });

    if (dry) {
      return res.status(200).json({
        ok: true, dry: true, date: kst.date, model: MODEL, via: VIA,
        quotes: quotes.map((q) => q.formatted), headlines: headlines.length,
        title, body,
      });
    }

    // ── 4. Publish into the lounge as KK. service_role bypasses the
    //    members-only INSERT policy on member_posts; author_id is the admin UID
    //    so it renders with KK's byline.
    const now = new Date().toISOString();
    const created = await db.insert(
      'member_posts',
      {
        author_id: ADMIN_UID, title, body, category: CATEGORY,
        status: 'published', published_at: now,
      },
      { return: 'representation' }
    );
    if (!created.ok || !created.json?.[0]?.id) {
      throw new Error(`post insert failed (${created.status}): ${created.text}`);
    }
    const post = created.json[0];

    // ── 5. Fan out. On-site notification for every approved member who opted
    //    in (KK included, which doubles as a delivery check), then Telegram.
    const notified = await notifyOnSite(db, post.id);
    const telegram = await notifyTelegram({ title, body, postId: post.id });

    await db.patch(`daily_briefs?brief_date=eq.${kst.date}&kind=eq.${KIND}`, {
      status: 'published', post_id: post.id, notified,
    });

    return res.status(200).json({
      ok: true, date: kst.date, postId: post.id, title,
      quotes: quotes.length, headlines: headlines.length, notified, telegram,
      url: `${SITE_URL}/voices?id=${post.id}`,
    });
  } catch (err) {
    console.error('korea-close error:', err);
    // Release the lock so a plain retry (or KK's manual run) works today.
    if (locked) await db.del(`daily_briefs?brief_date=eq.${kst.date}&kind=eq.${KIND}`).catch(() => {});
    await alertAdmin(`⚠️ 한국 마감 브리핑 실패 (${kst.date})\n${String(err.message || err).slice(0, 400)}`);
    return res.status(500).json({ ok: false, date: kst.date, error: String(err.message || err) });
  }
}

// ─── Claude ─────────────────────────────────────────────────────────────────

async function writeBrief({ kst, quotes, headlines }) {
  const dataBlock = quotes.length
    ? quotes.map((q) => `- ${q.formatted}`).join('\n')
    : '(시장 데이터를 가져오지 못했다. "숫자" 섹션은 생략하고 헤드라인만으로 쓸 것.)';
  const headlineBlock = headlines.length
    ? headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
    : '(헤드라인을 가져오지 못했다.)';

  const user = `오늘(KST): ${kst.date} (${kst.weekday}) — 한국 시장 마감 직후(17:30)다.

## 오늘 한국 마감 및 참고 지표
숫자를 쓸 때는 아래 문자열을 **그대로 복사**해서 쓴다. 직접 계산하거나 바꾸지 말 것.
코스피·코스닥·원/달러·삼성전자·SK하이닉스는 오늘 한국 마감 기준이다.
닛케이·상하이는 아시아 동시장, S&P 500·미 10년물·달러인덱스는 직전 미국 마감(어젯밤) 기준이다.
${dataBlock}

## 최근 24시간 한국 시장 헤드라인 (제목만, 본문 없음)
${headlineBlock}`;

  const text = USE_GEMINI ? await callGemini(user) : await callClaude(user);
  if (!text) throw new Error('model returned empty text');

  const m = text.match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/);
  const title = (m ? m[1] : `한국 금융시장 종합 — ${kst.label} (${kst.weekday})`).trim().slice(0, 200);
  // Drop a stray H1 if the model added one on top of the TITLE line.
  const raw = (m ? m[2] : text).replace(/^\s*#\s+.*\n+/, '').trim();
  if (raw.length < 120) throw new Error('model returned a suspiciously short body');

  return { title, body: withDisclaimer(raw) };
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
async function callGemini(user) {
  let lastErr;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': LLM_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
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
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(`daily-brief: gemini model ${model} failed:`, err.message);
    }
  }
  throw new Error(`Gemini 호출 실패 — ${String(lastErr?.message || lastErr)}`);
}

// ── Anthropic (direct or via Vercel AI Gateway) ─────────────────────────────
// Try the richest request first and shed unsupported parameters on a 400. This
// is an unattended daily job, so a param the route doesn't recognise must
// degrade instead of silently killing the brief:
//   1. direct API only — server-side refusal fallback (beta) + effort control
//   2. adaptive thinking, no extras            (documented on both routes)
//   3. nothing but model/system/messages       (last resort; Opus 5 thinks anyway)
async function callClaude(user) {
  // Client-side timeout kept under the function's 60s budget so we fail with a
  // real error (and a Telegram alert) instead of being killed mid-request.
  // Pointing baseURL at the gateway is the only difference between the two
  // Anthropic routes — the gateway speaks the same Messages API.
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
    system: SYSTEM_PROMPT,
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

KK & Friends는 초대로만 들어오는 한국 금융시장 전문가 멤버 전용 커뮤니티다. 당신은 그 라운지에 **한국 시장 마감 직후(17:30)** 올리는 짧은 종합 브리핑을 쓴다. 아침의 글로벌 브리핑과 짝을 이루는 글이다 — 이건 오늘 서울에서 끝난 장을 되짚는 글이다. 독자는 전부 현업 프로다. 기초 설명, 용어 풀이는 필요 없다.

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

## 이 브리핑의 관점 (아침 글로벌 브리핑과 다른 점)
- **지수의 방향보다 그 방향을 만든 구조**를 본다. 무엇이 올랐나보다 무엇이 그것을 밀었나.
- 오늘 한국 장의 움직임을 어젯밤 미국·오늘 아시아 지표와 **연결**한다. 한국 시장은 혼자 움직이지 않는다.
- 코스피와 코스닥의 방향/폭이 갈리면 그 자체가 이야기다. 대형주와 중소형주의 자금이 다르게 움직였다는 뜻이다.
- 지수가 크게 움직인 날 원화가 함께 움직였는지 아닌지는 항상 확인할 항목이다.
- 마지막은 오늘의 감상이 아니라 **내일 확인할 것**으로 끝낸다.

## 출력 형식 (반드시 지킬 것)
첫 줄은 정확히 이 형태:
TITLE: 한국 금융시장 종합 — {M/D} ({요일}) · {핵심을 찌르는 3~8단어}

그 다음 빈 줄, 그 다음부터 본문 마크다운:

[헤더 없이 한 줄 결론 1~2문장]

## 숫자
- **코스피** 6,023.66 (−10.84%) → 반 줄 해석
(제공된 데이터 중 그날 의미 있는 4~6개만 고른다. 전부 나열하지 말 것. 한국 지표를 우선하고, 해외 지표는 오늘 한국 장을 설명하는 데 필요한 것만 고른다.)

## 이면
[2~5문장. 숫자와 헤드라인이 어긋나는 지점, 시장이 놓치고 있는 균열. 오늘 움직임의 원인으로 지목되는 것이 헤드라인에 있으면 그것을 다루되, 확정되지 않은 해석은 "확인이 더 필요하다"고 명시한다.]

## 내일 볼 것
- 짧은 불릿 2~3개 (→ 화살표 사용)

💡 **지수의 방향보다 그 방향을 누가 만들었는지가 다음 주를 결정한다**
　（이런 식으로 — 라벨이나 대괄호 없이, 실제 팁 문장만 굵게 한 줄. "[한 줄 실전 팁]" 같은
　 양식 문구를 그대로 출력하면 안 된다.）

（본문은 여기서 끝. **맨 아래 면책 문구는 시스템이 자동으로 붙으므로 절대 직접 쓰지 말 것.**
　"이건 내 해석이지…" 같은 마무리 문장도 쓰지 않는다.）

## 절대 금지
- **표 문법(| --- |) 금지.** 렌더러가 지원하지 않는다. 숫자는 반드시 불릿으로 쓴다.
- 제공되지 않은 수치를 쓰거나 추정치를 단정하는 것. 숫자는 주어진 문자열을 그대로 복사한다.
- **투자자별 수급(외국인/기관/개인 순매수·순매도 금액)은 데이터로 제공되지 않는다.** 헤드라인에 그 수치가 명시적으로 있을 때만 인용하고, 없으면 쓰지 않는다. 절대 지어내지 말 것.
- 헤드라인 제목에 없는 사실을 추론해 단정하는 것. 헤드라인은 제목만 주어진다 — 기사 본문을 읽은 척하지 말 것. 불확실하면 "확인 필요"라고 쓴다.
- 이미 쓴 메타포 재사용: 녹아내림 · 마진콜 · 진화의 흉터/면역 체계 · 트로이 목마/파놉티콘 · 갇힌 호수 · 봉건 영지 · 동인도회사 2.0 · 베를린 장벽 2.0 · 시간이 새는 모래시계 · 맨해튼 프로젝트 2.0 · 길모퉁이
- 메타포를 매일 억지로 넣는 것. 1초 안에 그려지지 않으면 그냥 쓰지 않는다. 평범한 비유("양날의 검")는 금지.
- 개별 종목 매수/매도 추천, 투자 권유, 목표가 제시. (삼성전자·SK하이닉스는 지수를 설명하는 맥락에서만 언급한다.)
- 마크다운 헤더는 ## 와 ### 만 쓴다 (# 은 쓰지 않는다 — 제목은 TITLE 줄에서 처리된다).
- JB Financial Group과 부산시 관련 주제는 중립 분석가 시점만. 영향력 행사 뉘앙스 금지.

## 길이
본문 600~1,100자 (공백 제외). 브리핑이다. 칼럼이 아니다.`;

// ─── Fan-out ────────────────────────────────────────────────────────────────

async function notifyOnSite(db, postId) {
  const rows = await db.get(
    'profiles?select=id&status=eq.approved&daily_brief_optin=eq.true'
  );
  const recipients = Array.isArray(rows) ? rows : [];
  if (!recipients.length) return 0;

  // One bulk insert — a per-member request loop would risk the function timeout.
  const payload = recipients.map((r) => ({
    user_id: r.id,
    type: 'korea_close',
    actor_id: ADMIN_UID,
    actor_name: 'KK',
    member_post_id: postId,
  }));
  const ins = await db.insert('notifications', payload);
  if (!ins.ok) {
    console.error('korea-close: notification insert failed', ins.status, ins.text);
    return 0;
  }
  return recipients.length;
}

async function notifyTelegram({ title, body, postId }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;

  const text = [
    `🇰🇷 ${title}`,
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

// ─── Supabase REST (service_role) ───────────────────────────────────────────

function supabase(serviceKey) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  const url = (path) => `${SUPABASE_URL}/rest/v1/${path}`;

  const send = async (method, path, body, prefer) => {
    const res = await fetch(url(path), {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { ok: res.ok, status: res.status, text, json };
  };

  return {
    get: (path) => send('GET', path).then((r) => (r.ok ? r.json : null)),
    insert: (table, body, { return: ret } = {}) =>
      send('POST', table, body, ret === 'representation' ? 'return=representation' : 'return=minimal'),
    patch: (path, body) => send('PATCH', path, body, 'return=minimal'),
    del: (path) => send('DELETE', path, undefined, 'return=minimal'),
  };
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
