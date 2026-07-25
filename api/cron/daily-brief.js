// GET /api/cron/daily-brief — daily global-market brief → lounge + opt-in alerts.
//
// Runs on a Vercel cron (see vercel.json) every weekday at 07:00 KST. It:
//   1. locks the day in `daily_briefs` (so it can never publish twice),
//   2. pulls free market data + headlines (lib/market-sources.js),
//   3. has Claude write a short brief in KK's voice,
//   4. inserts it into `member_posts` as KK (service_role, admin UID),
//   5. notifies opted-in approved members on-site, and posts a teaser to the
//      KK & Friends Telegram channel.
//
// Manual testing (browser, replace <secret> with CRON_SECRET):
//   …/api/cron/daily-brief?key=<secret>&dry=1   → generate + show, publish nothing
//   …/api/cron/daily-brief?key=<secret>&force=1 → publish now, even on a weekend
//                                                  or if today already ran
//
// Env (Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY           required — console.anthropic.com
//   SUPABASE_SERVICE_ROLE_KEY   required — server only, bypasses RLS
//   CRON_SECRET                 required — already set for the weekly digest
//   TELEGRAM_BOT_TOKEN          optional — reuses the existing bot
//   TELEGRAM_CHANNEL_ID         optional — @channel or -100…; falls back to
//                                          TELEGRAM_CHAT_ID (KK's own chat)
//   ANTHROPIC_MODEL, SUPABASE_URL, SITE_URL, ADMIN_UID — optional overrides
//
// Requires migration db/migrations/012_daily_brief.sql.

import Anthropic from '@anthropic-ai/sdk';
import { fetchQuotes, fetchHeadlines, kstParts } from '../../lib/market-sources.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pahdwduqxxiugqjkbhvq.supabase.co';
const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';
const ADMIN_UID = process.env.ADMIN_UID || '6ac6cf72-1c88-4626-9124-27a6a2792e1e';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
// Thinking depth / spend. Lower this (or switch MODEL to claude-sonnet-5) if the
// call ever bumps the function's 60s ceiling.
const EFFORT = process.env.ANTHROPIC_EFFORT || 'medium';
const CATEGORY = '시장/매크로';

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
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!serviceKey || !anthropicKey) {
    return res.status(200).json({
      ok: true,
      skipped: 'not configured',
      missing: [!anthropicKey && 'ANTHROPIC_API_KEY', !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean),
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
      const lock = await db.insert('daily_briefs', { brief_date: kst.date, status: 'running' });
      if (lock.status === 409) {
        if (!force) {
          return res.status(200).json({ ok: true, skipped: 'already ran today', date: kst.date });
        }
        await db.patch(`daily_briefs?brief_date=eq.${kst.date}`, { status: 'running' });
      } else if (!lock.ok) {
        throw new Error(`daily_briefs lock failed (${lock.status}): ${lock.text}`);
      }
      locked = true;
    }

    // ── 2. Inputs. Both are best-effort; neither can throw.
    const [quotes, headlines] = await Promise.all([fetchQuotes(), fetchHeadlines()]);
    if (!quotes.length && headlines.length < 4) {
      throw new Error('no usable market data or headlines (both sources unreachable)');
    }

    // ── 3. Write it.
    const { title, body } = await writeBrief({ apiKey: anthropicKey, kst, quotes, headlines });

    if (dry) {
      return res.status(200).json({
        ok: true, dry: true, date: kst.date, model: MODEL,
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

    await db.patch(`daily_briefs?brief_date=eq.${kst.date}`, {
      status: 'published', post_id: post.id, notified,
    });

    return res.status(200).json({
      ok: true, date: kst.date, postId: post.id, title,
      quotes: quotes.length, headlines: headlines.length, notified, telegram,
      url: `${SITE_URL}/voices?id=${post.id}`,
    });
  } catch (err) {
    console.error('daily-brief error:', err);
    // Release the lock so a plain retry (or KK's manual run) works today.
    if (locked) await db.del(`daily_briefs?brief_date=eq.${kst.date}`).catch(() => {});
    await alertAdmin(`⚠️ 데일리 브리핑 실패 (${kst.date})\n${String(err.message || err).slice(0, 400)}`);
    return res.status(500).json({ ok: false, date: kst.date, error: String(err.message || err) });
  }
}

// ─── Claude ─────────────────────────────────────────────────────────────────

async function writeBrief({ apiKey, kst, quotes, headlines }) {
  // Client-side timeout kept under the function's 60s budget so we fail with a
  // real error (and a Telegram alert) instead of being killed mid-request.
  const client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });

  const dataBlock = quotes.length
    ? quotes.map((q) => `- ${q.formatted}`).join('\n')
    : '(시장 데이터를 가져오지 못했다. "숫자" 섹션은 생략하고 헤드라인만으로 쓸 것.)';
  const headlineBlock = headlines.length
    ? headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
    : '(헤드라인을 가져오지 못했다.)';

  const user = `오늘(KST): ${kst.date} (${kst.weekday})

## 직전 거래일 마감 기준 시장 데이터
숫자를 쓸 때는 아래 문자열을 **그대로 복사**해서 쓴다. 직접 계산하거나 바꾸지 말 것.
${dataBlock}

## 최근 24시간 글로벌 마켓 헤드라인 (제목만, 본문 없음)
${headlineBlock}`;

  const msg = await create(client, {
    model: MODEL,
    max_tokens: 6000,
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: user }],
  });

  if (msg.stop_reason === 'refusal') {
    throw new Error(`model refused (${msg.stop_details?.category || 'unknown'})`);
  }

  const text = (msg.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error('model returned empty text');

  const m = text.match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/);
  const title = (m ? m[1] : `글로벌 마켓 브리핑 — ${kst.label} (${kst.weekday})`).trim().slice(0, 200);
  // Drop a stray H1 if the model added one on top of the TITLE line.
  const body = (m ? m[2] : text).replace(/^\s*#\s+.*\n+/, '').trim();
  if (body.length < 120) throw new Error('model returned a suspiciously short body');

  return { title, body };
}

// Ask for the server-side refusal fallback (Claude API only, beta). If this
// deployment's account doesn't have the beta, fall back to the plain endpoint
// rather than letting the daily job break.
async function create(client, params) {
  try {
    return await client.beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (err) {
    if (err?.status !== 400) throw err;
    console.warn('daily-brief: fallbacks unavailable, retrying plain:', err.message);
    return await client.messages.create(params);
  }
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

💡 **[한 줄 실전 팁]**

_이건 내 해석이지, 공식 전망이 아니다._

## 절대 금지
- **표 문법(| --- |) 금지.** 렌더러가 지원하지 않는다. 숫자는 반드시 불릿으로 쓴다.
- 제공되지 않은 수치를 쓰거나 추정치를 단정하는 것. 숫자는 주어진 문자열을 그대로 복사한다.
- 헤드라인 제목에 없는 사실을 추론해 단정하는 것. 헤드라인은 제목만 주어진다 — 기사 본문을 읽은 척하지 말 것. 불확실하면 "확인 필요"라고 쓴다.
- 이미 쓴 메타포 재사용: 녹아내림 · 마진콜 · 진화의 흉터/면역 체계 · 트로이 목마/파놉티콘 · 갇힌 호수 · 봉건 영지 · 동인도회사 2.0 · 베를린 장벽 2.0 · 시간이 새는 모래시계 · 맨해튼 프로젝트 2.0
- 메타포를 매일 억지로 넣는 것. 1초 안에 그려지지 않으면 그냥 쓰지 않는다. 평범한 비유("양날의 검")는 금지.
- 개별 종목 매수/매도 추천, 투자 권유, 목표가 제시.
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
    type: 'daily_brief',
    actor_id: ADMIN_UID,
    actor_name: 'KK',
    member_post_id: postId,
  }));
  const ins = await db.insert('notifications', payload);
  if (!ins.ok) {
    console.error('daily-brief: notification insert failed', ins.status, ins.text);
    return 0;
  }
  return recipients.length;
}

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
