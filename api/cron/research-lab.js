// GET /api/cron/research-lab — twice-weekly research topic selection.
//
// Runs Tue/Fri 08:00 KST (Vercel cron fires Mon/Thu 23:00 UTC — see vercel.json;
// KST is UTC+9, so the weekday shifts back a day). It:
//   1. locks the day in `research_runs` so it can never run twice,
//   2. scans the tape with a web-search-enabled model,
//   3. generates three candidate topics and scores them,
//   4. ranks them IN CODE (lib/research-config.js) — the model never does the
//      arithmetic — and checks the 6.0 publish threshold,
//   5. writes the research brief for the winner,
//   6. archives the full report, then asks KK to approve before anything sends.
//
// Nothing reaches Telegram's summary send without KK pressing a button. If he
// never answers, the report is still archived — that is deliberate.
//
// The rules the model follows are read from RESEARCH_PROMPT.md at runtime (up
// to its `=== PROMPT END ===` marker), so editing that document changes the
// bot's behaviour without a code change. The knobs live in
// research-config.json.
//
// Manual testing (browser, replace <secret> with CRON_SECRET):
//   …/api/cron/research-lab?key=<secret>&dry=1   → run it, write and send nothing
//   …/api/cron/research-lab?key=<secret>&force=1 → run now even on a weekend or
//                                                   if today already ran
//
// Env (Vercel → Settings → Environment Variables):
//   ONE of these, matching the model chain in research-config.json:
//     ANTHROPIC_API_KEY    direct Anthropic API key
//     AI_GATEWAY_API_KEY   Vercel AI Gateway
//     GEMINI_API_KEY       only if the chain is overridden to gemini-* ids
//   SUPABASE_SERVICE_ROLE_KEY   required — server only, bypasses RLS
//   CRON_SECRET                 required — shared with the other crons
//   TELEGRAM_BOT_TOKEN          required to reach KK
//   TELEGRAM_CHAT_ID            KK's own chat (approval requests land here)
//   RESEARCH_TELEGRAM_CHAT_ID   optional — separate archive chat
//   RESEARCH_MODEL,
//   RESEARCH_SCAN_MODEL         optional — override the config's model chains
//   SITE_URL                    optional — used to build the approval links
//
// Requires migration db/migrations/015_research_lab.sql.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { kstParts } from '../../lib/market-sources.js';
import { loadResearchConfig, scoreAndRank, shouldHold } from '../../lib/research-config.js';
import { callChain, extractJson } from '../../lib/research-llm.js';
import { buildReport, buildTelegramSummary, buildHoldSummary, reportFilename } from '../../lib/research-report.js';
import { sendMessage, sendDocument, alertAdmin, researchChatId, telegramConfigured } from '../../lib/telegram.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pahdwduqxxiugqjkbhvq.supabase.co';
const SITE_URL = process.env.SITE_URL || 'https://www.kkandfriends.com';
const KIND = 'topic_selection';

// Per-call ceilings, chosen to fit three calls inside the 300s function budget
// with room to write to the database afterwards.
const SCAN_TIMEOUT = 70_000;
const SCORE_TIMEOUT = 90_000;
const GUIDE_TIMEOUT = 70_000;

export default async function handler(req, res) {
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
  if (!serviceKey) {
    return res.status(200).json({ ok: true, skipped: 'not configured', missing: ['SUPABASE_SERVICE_ROLE_KEY'] });
  }

  let cfg;
  try {
    cfg = loadResearchConfig({ reload: true });
  } catch (err) {
    // A malformed config means the conflict filter cannot be trusted. Refuse.
    await alertAdmin(`⚠️ 리서치랩 설정 오류 — 실행하지 않음\n${String(err.message || err).slice(0, 600)}`);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }

  const kst = kstParts();
  if (kst.isWeekend && !force) {
    return res.status(200).json({ ok: true, skipped: 'weekend', date: kst.date });
  }

  const db = supabase(serviceKey);
  let locked = false;

  try {
    // ── 1. Lock the day before spending anything on the model.
    if (!dry) {
      const lock = await db.insert('research_runs', { run_date: kst.date, kind: KIND, status: 'running' });
      if (lock.status === 409) {
        if (!force) {
          return res.status(200).json({ ok: true, skipped: 'already ran today', date: kst.date });
        }
        await db.patch(`research_runs?run_date=eq.${kst.date}&kind=eq.${KIND}`, {
          status: 'running', error: null, decided_at: null, reminded_at: null,
        });
      } else if (!lock.ok) {
        throw new Error(`research_runs lock failed (${lock.status}): ${lock.text}`);
      }
      locked = true;
    }

    const basePrompt = loadBasePrompt();
    const recent = await recentTitles(db, cfg, kst);

    // ── 2. Scan. The only step with web search attached; everything after
    //    this works from its output, per the prompt's tool-use rule.
    const scanRun = await callChain(cfg.models.scan, {
      system: `${basePrompt}\n\n${STAGE_A_SYSTEM}`,
      user: stageAUser({ cfg, kst, recent }),
      search: true,
      maxTokens: 6000,
      timeoutMs: SCAN_TIMEOUT,
    });

    // ── 3. Candidates + judgement. JSON, because step 4 is arithmetic and
    //    arithmetic needs fields, not prose.
    const scoreRun = await callChain(cfg.models.reason, {
      system: `${basePrompt}\n\n${STAGE_B_SYSTEM}`,
      user: stageBUser({ cfg, kst, recent, scan: scanRun.text }),
      maxTokens: 10_000,
      timeoutMs: SCORE_TIMEOUT,
    });

    const parsed = extractJson(scoreRun.text);
    const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    if (rawCandidates.length < 2) {
      throw new Error(`model returned ${rawCandidates.length} candidate(s), expected 3`);
    }

    // ── 4. Rank in code. Same scores in, same winner out, every time.
    const ranked = scoreAndRank(rawCandidates, { cfg });
    const held = shouldHold(ranked, cfg);

    // ── 5. Writing guide, or a rescan recommendation when nothing cleared.
    const guideRun = held
      ? null
      : await callChain(cfg.models.reason, {
          system: `${basePrompt}\n\n${STAGE_C_SYSTEM}`,
          user: stageCUser({ cfg, kst, winner: ranked[0], others: ranked.slice(1), scan: scanRun.text }),
          maxTokens: 8000,
          timeoutMs: GUIDE_TIMEOUT,
        });

    const guideText = held
      ? holdDiagnosis(ranked, cfg, parsed.rescan_advice)
      : guideRun.text;

    const model = scoreRun.model;
    const fellBack = scanRun.fellBack || scoreRun.fellBack || Boolean(guideRun?.fellBack);

    const report = buildReport({
      kst, scan: scanRun.text, ranked, guide: guideText, cfg, model, fellBack, held,
    });

    // Prefer the model's own summary block; fall back to one built from the
    // structured data when the markers are missing or the block is oversized.
    const summary = held
      ? buildHoldSummary({ kst, ranked, cfg, reason: parsed.rescan_advice })
      : pickSummary({ guide: guideText, kst, ranked, cfg });

    if (dry) {
      return res.status(200).json({
        ok: true, dry: true, date: kst.date, held,
        model, fellBack, scanModel: scanRun.model,
        schedule: cfg.schedule, threshold: cfg.threshold,
        recentTitles: recent,
        ranked: ranked.map((c) => ({
          rank: c.rank, title: c.title, total: c.total,
          scores: c.scores, adjustments: c.adjustments, conflict_check: c.conflict_check,
        })),
        summaryChars: summary.length,
        summary, report,
      });
    }

    const filename = reportFilename(kst.date, ranked[0]?.slug);
    const chat = researchChatId();

    // ── 6a. Below threshold: nothing is being published, so there is nothing
    //     to approve. Tell KK and stop.
    if (held) {
      await db.patch(`research_runs?run_date=eq.${kst.date}&kind=eq.${KIND}`, {
        status: 'held',
        candidates: ranked,
        report_md: report,
        telegram_summary: summary,
        model_used: model,
        fell_back: fellBack,
      });
      const sent = chat ? await sendMessage({ chatId: chat, text: summary, ...splitOpts(cfg) }) : { ok: false, error: 'no chat id' };
      return res.status(200).json({ ok: true, date: kst.date, held: true, telegram: sent.ok, scores: ranked.map((c) => c.total) });
    }

    // ── 6b. Archive first, then ask. If the send fails or KK never answers,
    //     the report is already safe in the ledger.
    const token = randomBytes(16).toString('hex');
    const saved = await db.patch(`research_runs?run_date=eq.${kst.date}&kind=eq.${KIND}`, {
      status: 'awaiting_approval',
      candidates: ranked,
      winner_title: ranked[0].title,
      winner_score: ranked[0].total,
      report_md: report,
      telegram_summary: summary,
      approval_token: token,
      model_used: model,
      fell_back: fellBack,
    });
    if (!saved.ok) throw new Error(`archiving the report failed (${saved.status}): ${saved.text}`);

    if (!telegramConfigured()) {
      return res.status(200).json({
        ok: true, date: kst.date, archived: true, awaitingApproval: false,
        warning: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — report archived, no approval request sent',
        title: ranked[0].title, score: ranked[0].total,
      });
    }

    const asked = await sendApprovalRequest({ chat, kst, ranked, cfg, token, fellBack, model, filename, report });

    return res.status(200).json({
      ok: true, date: kst.date, held: false,
      title: ranked[0].title, score: ranked[0].total,
      model, fellBack, awaitingApproval: true,
      telegram: asked.ok, telegramError: asked.error || null,
    });
  } catch (err) {
    console.error('research-lab error:', err);
    if (locked) {
      // Keep the row — a failed run is worth seeing — but record why and free
      // the date so a retry can take it.
      await db.patch(`research_runs?run_date=eq.${kst.date}&kind=eq.${KIND}`, {
        status: 'failed', error: String(err.message || err).slice(0, 2000),
      }).catch(() => {});
    }
    await alertAdmin(`⚠️ 리서치랩 실패 (${kst.date})\n${String(err.message || err).slice(0, 400)}`);
    return res.status(500).json({ ok: false, date: kst.date, error: String(err.message || err) });
  }
}

// ─── The approval gate ──────────────────────────────────────────────────────

// Buttons are plain URLs rather than callback queries: a URL button needs no
// registered Telegram webhook, which is one less thing to configure and one
// less thing to silently stop working. The token in the link is the authority,
// it is single-use, and the link only ever appears in KK's private chat.
async function sendApprovalRequest({ chat, kst, ranked, cfg, token, fellBack, model, filename, report }) {
  const winner = ranked[0];
  const base = `${SITE_URL}/api/research-decide?token=${token}`;

  const text = [
    `🔬 리서치랩 승인 요청 · ${kst.date} (${kst.weekday})`,
    '',
    `선정: ${winner.title}`,
    winner.thesis ? `→ ${winner.thesis}` : '',
    '',
    `가중합 ${winner.total.toFixed(2)} / 임계값 ${cfg.threshold.toFixed(1)}`,
    `나머지: ${ranked.slice(1).map((c) => `${c.title} ${c.total.toFixed(2)}`).join(' · ')}`,
    fellBack ? `\n⚠️ 모델 폴백 발생 — 실제 사용: ${model}` : '',
    '',
    `승인하면 요약과 전문(.md)을 보냅니다. ${cfg.approval.timeout_after_hours}시간 무응답이면 보내지 않고 보관만 합니다.`,
  ].filter((l) => l !== '').join('\n');

  const sent = await sendMessage({
    chatId: chat,
    text,
    buttons: [[
      { text: '✅ 승인', url: `${base}&action=approve` },
      { text: '✖️ 반려', url: `${base}&action=reject` },
    ]],
    ...splitOpts(cfg),
  });

  // The report goes with the request, not after approval. KK should be able to
  // read the thing he is approving.
  if (sent.ok) {
    await sendDocument({ chatId: chat, filename, content: report, caption: `${kst.date} 리서치 전문 (승인 전 미리보기)` });
  }
  return sent;
}

function splitOpts(cfg) {
  return { chunkChars: cfg.telegram?.split_chunk_chars, delayMs: cfg.telegram?.split_delay_ms };
}

// ─── Prompt assembly ────────────────────────────────────────────────────────

// The editorial rules are the document, not a copy of the document. Reading it
// at runtime is what keeps the two from drifting apart.
let cachedPrompt = null;
function loadBasePrompt() {
  if (cachedPrompt) return cachedPrompt;

  let raw = null;
  for (const path of [
    fileURLToPath(new URL('../../RESEARCH_PROMPT.md', import.meta.url)),
    `${process.cwd()}/RESEARCH_PROMPT.md`,
  ]) {
    try { raw = readFileSync(path, 'utf8'); break; } catch {}
  }
  if (!raw) throw new Error('RESEARCH_PROMPT.md not found — check vercel.json includeFiles');

  // Everything up to the marker is the prompt; below it is the appendix,
  // operating notes and build spec, which the model does not need.
  const end = raw.indexOf('=== PROMPT END ===');
  let body = end === -1 ? raw : raw.slice(0, end);

  body = body
    .replace(/^---\n[\s\S]*?\n---\n/, '')      // Obsidian frontmatter
    .replace(/^\[\[.*?\]\].*\n/m, '')          // the vault's index links
    .replace(/\[v7[^\]]*\]/g, '')              // revision markers
    .replace(/`\s*`/g, '')
    .trim();

  if (body.length < 500) throw new Error('RESEARCH_PROMPT.md parsed to almost nothing — marker or format changed');

  cachedPrompt = body;
  return body;
}

const STAGE_A_SYSTEM = `--- 실행 지시 ---
지금은 **1단계(트렌드 스캔)만** 수행한다. 후보 생성·채점·집필 가이드는 하지 않는다.
웹검색으로 최신 뉴스를 확인하고, 아래 형식의 마크다운만 출력한다.

- 불릿 5~8개. 각 불릿은 \`- [매체 · YYYY-MM-DD] 헤드라인 — 한 줄 요약 (URL)\` 형식.
- 발행일을 반드시 확인해서 적는다. 날짜를 모르면 그 건은 버린다.
- 이해상충 배제 목록에 걸리는 뉴스는 스캔 단계에서부터 제외한다.
- 마지막에 \`## 스캔 관찰\` 로 2~3줄, 이 뉴스들을 관통하는 구조적 흐름을 적는다.
- 가격 전망·홍보성 기사·익명 블로그는 넣지 않는다.`;

const STAGE_B_SYSTEM = `--- 실행 지시 ---
지금은 **2단계(후보 3개 생성)와 3단계(채점 판단)**를 수행한다. 집필 가이드는 쓰지 않는다.

**출력은 JSON 객체 하나뿐이다.** 설명 문장, 인사말, 마크다운 헤더를 앞뒤에 붙이지 않는다.

중요 — 네가 채점하지 않는 항목이 있다:
- **최신성(recency)은 채점하지 않는다.** 대신 \`trigger_date\`에 가장 최근 트리거 뉴스의 발행일(YYYY-MM-DD)을 적는다. 점수는 코드가 계산한다.
- **리스크는 역가점으로 변환하지 않는다.** \`risk_level\`에 위험도 자체를 1~10(높을수록 위험)으로 적는다. 변환은 코드가 한다.
- **근거 가용성 상한도 직접 적용하지 않는다.** \`evidence_flags\`에 사실만 표시하면 코드가 상한을 적용한다.

JSON 스키마:
{
  "candidates": [
    {
      "title": "후보 제목",
      "slug": "english-slug",
      "thesis": "한 줄 논지",
      "triggers": [{ "outlet": "매체", "date": "YYYY-MM-DD", "headline": "헤드라인", "url": "..." }],
      "trigger_date": "YYYY-MM-DD",
      "industry_angle": "왜 이 주제가 금융시장 담론에서 중요한가 (회사명 없이)",
      "series_position": "거시환경 | 시장/자산 | 산업적 역할",
      "balance_slot": "macro | asset | free",
      "conflict_check": "통과 — 사유 한 줄 (부분 겹침이면 어디가 겹치는지)",
      "required_evidence": ["확보해야 할 1차 자료·지표 (정의·기간·출처 포함)", "..."],
      "scores": {
        "timeliness": 1-10,
        "finance_relevance": 1-10,
        "differentiation": 1-10,
        "evidence": 1-10,
        "reader_value": 1-10
      },
      "risk_level": 1-10,
      "evidence_flags": {
        "whitelist_external_only": true/false,
        "no_primary_source": true/false,
        "incomplete_onchain_metric": true/false
      },
      "rationale": {
        "timeliness": "근거 한 줄", "finance_relevance": "...", "differentiation": "...",
        "evidence": "...", "reader_value": "...", "risk": "..."
      }
    }
  ],
  "rescan_advice": "세 후보가 모두 약할 경우에만: 어떻게 다시 스캔할지 2~3줄. 아니면 빈 문자열."
}

후보는 정확히 3개. 균형 요건(macro 1 · asset 1 · free 1)을 \`balance_slot\`으로 표시한다.`;

const STAGE_C_SYSTEM = `--- 실행 지시 ---
지금은 **4단계(선정 주제 집필 가이드라인)만** 수행한다. 후보를 다시 고르거나 재채점하지 않는다.
선정은 이미 끝났다. 아래 주제에 대한 집필 가이드를 마크다운으로 쓴다.

프롬프트의 4단계 항목을 모두 채운다: 제목 후보 2~3개 · 한 줄 핵심 메시지 · 타깃 독자와 톤 ·
목차(역피라미드 4~6섹션) · 반드시 확보할 데이터와 출처 유형(정의·기간·출처까지) ·
산업적 함의 · 반론과 이견 박스 · 검증·반증 포인트 · 후속 주제 2개 · 집필 인계 메모.

마지막에 텔레그램 발송용 요약 블록을 반드시 붙인다. 규칙:
- \`<<<TELEGRAM_START>>>\` 줄로 시작하고 \`<<<TELEGRAM_END>>>\` 줄로 끝낸다.
- 표 금지. 굵게 최소화. 일반 텍스트 위주.
- 구성: 제목 한 줄 → 선정 주제와 한 줄 thesis → 가중합과 1순위 이유 → 트리거 뉴스 1~2건 →
  확보할 핵심 데이터 2~3개 → 나머지 후보 2개(제목 — 점수) → 면책 한 줄.`;

function stageAUser({ cfg, kst, recent }) {
  return [
    `오늘(KST): ${kst.date} (${kst.weekday})`,
    '기간: 최근 1개월 · 지역/시장: 미국·한국',
    '',
    conflictBlock(cfg),
    '',
    recentBlock(recent),
  ].join('\n');
}

function stageBUser({ cfg, kst, recent, scan }) {
  return [
    `오늘(KST): ${kst.date} (${kst.weekday})`,
    '',
    '## 1단계 스캔 결과',
    scan,
    '',
    conflictBlock(cfg),
    '',
    recentBlock(recent),
    '',
    '## 온체인 데이터 화이트리스트 (근거 가용성 판단 기준)',
    ...cfg.whitelist.map((w) => `- ${w.provider} — ${w.scope}${w.note ? ` (${w.note})` : ''}`),
    '',
    '`evidence_flags` 판단 기준:',
    '- `whitelist_external_only`: 핵심 주장이 위 목록 밖 소스로만 뒷받침되면 true',
    '- `no_primary_source`: 공시·규제기관·중앙은행 등 1차 자료가 하나도 없으면 true',
    '- `incomplete_onchain_metric`: 온체인 지표를 쓰면서 정의·기간·체인 중 하나라도 빠지면 true',
  ].join('\n');
}

function stageCUser({ cfg, kst, winner, others = [], scan }) {
  return [
    `오늘(KST): ${kst.date} (${kst.weekday})`,
    '',
    '## 선정된 주제',
    `제목: ${winner.title}`,
    `논지: ${winner.thesis || ''}`,
    `가중합: ${winner.total.toFixed(2)} (임계값 ${cfg.threshold.toFixed(1)})`,
    winner.industry_angle ? `산업적 각도: ${winner.industry_angle}` : '',
    winner.triggers?.length
      ? `트리거 뉴스:\n${winner.triggers.map((t) => `- ${[t.outlet, t.date].filter(Boolean).join(' · ')} — ${t.headline || ''}`).join('\n')}`
      : '',
    winner.required_evidence?.length
      ? `2단계에서 지목한 필요 근거:\n${winner.required_evidence.map((e) => `- ${e}`).join('\n')}`
      : '',
    '',
    '## 나머지 후보 (요약 블록에 넣을 것)',
    ...others.map((c) => `- ${c.title} — ${c.total.toFixed(2)}`),
    '',
    '## 1단계 스캔 결과 (참고)',
    scan,
    '',
    conflictBlock(cfg),
  ].filter(Boolean).join('\n');
}

function conflictBlock(cfg) {
  return [
    '## 이해상충 원천 배제 필터 (후보 생성 전에 적용)',
    `발행 주체의 현재 역할: ${cfg.kk_roles.join(' · ')}`,
    '아래에 해당하는 주제는 후보로 올리지 않는다. 회사명을 적지 않아도 업계 독자가 특정 소속을 연상할 수 있으면 배제한다.',
    ...cfg.conflict_filter.map((f) => `- ${f.rule}`),
    '부분적으로만 겹치는 경우는 배제하지 않되, risk_level을 보수적으로(높게) 매긴다.',
  ].join('\n');
}

function recentBlock(recent) {
  if (!recent.length) return '## 최근 발행분\n(없음)';
  return [
    `## 최근 발행분 — 주제·각도가 겹치면 후보에서 제외한다`,
    ...recent.map((t) => `- ${t}`),
    '같은 소재라도 각도가 분명히 다르면 허용된다.',
  ].join('\n');
}

function holdDiagnosis(ranked, cfg, advice) {
  const lines = [
    `세 후보 모두 가중합이 임계값 ${cfg.threshold.toFixed(1)}에 미치지 못했다.`,
    '',
    '### 지표별 진단',
  ];
  for (const c of ranked) {
    const weak = Object.entries(c.scores)
      .filter(([, v]) => v <= 5)
      .map(([k]) => k);
    lines.push(`- **${c.title}** (${c.total.toFixed(2)}) — 취약: ${weak.length ? weak.join(', ') : '전반적으로 평이'}`);
  }
  lines.push('');
  lines.push('### 재스캔 권고');
  lines.push(advice || '기간을 최근 1개월 → 2개월로 넓히거나, 지역·영역을 조정해 다시 스캔할 것.');
  return lines.join('\n');
}

// Take the model's marker block when it is present and within budget; otherwise
// build one from the structured data. A missing marker should cost a slightly
// plainer message, not the notification.
function pickSummary({ guide, kst, ranked, cfg }) {
  const max = cfg.telegram?.hard_limit_chars || 4096;
  const m = guide.match(/<<<TELEGRAM_START>>>\s*([\s\S]*?)\s*<<<TELEGRAM_END>>>/);
  const block = m?.[1]?.trim();
  if (block && block.length <= max && !block.includes('|---')) return block;
  return buildTelegramSummary({ kst, ranked, cfg, maxChars: cfg.telegram?.summary_max_chars || 2800 });
}

// ─── Recent publications, for the no-repeat rule ────────────────────────────

async function recentTitles(db, cfg, kst) {
  const weeks = cfg.recent_posts_weeks || 4;
  const cutoff = new Date(Date.now() - weeks * 7 * 86_400_000);
  const cutoffIso = cutoff.toISOString();
  const cutoffCompact = cutoffIso.slice(0, 10).replace(/-/g, '');

  const titles = [];

  // The lounge.
  const posts = await db.get(
    `member_posts?select=title,published_at&status=eq.published&published_at=gte.${cutoffIso}&order=published_at.desc&limit=60`
  ).catch(() => null);
  for (const p of posts || []) if (p.title) titles.push(`(라운지) ${p.title}`);

  // Previous research winners — the run must not keep re-picking its own idea.
  const runs = await db.get(
    `research_runs?select=winner_title,run_date&run_date=gte.${cutoffIso.slice(0, 10)}&winner_title=not.is.null&order=run_date.desc&limit=20`
  ).catch(() => null);
  for (const r of runs || []) titles.push(`(리서치랩 ${r.run_date}) ${r.winner_title}`);

  // The blog. Static files, bundled via vercel.json includeFiles — best effort,
  // since a missing bundle must not take the run down with it.
  try {
    const { readdirSync } = await import('node:fs');
    for (const dir of [fileURLToPath(new URL('../../posts', import.meta.url)), `${process.cwd()}/posts`]) {
      let files;
      try { files = readdirSync(dir); } catch { continue; }
      for (const f of files) {
        const m = f.match(/^(\d{8})_.*\.html$/);
        if (!m || m[1] < cutoffCompact) continue;
        try {
          const html = readFileSync(`${dir}/${f}`, 'utf8');
          const t = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title>([\s\S]*?)(?:\s*\|.*)?<\/title>/i)?.[1];
          if (t) titles.push(`(블로그) ${decodeEntities(t.replace(/<[^>]+>/g, '').trim())}`);
        } catch {}
      }
      break;
    }
  } catch {}

  return titles.slice(0, 40);
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
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
      signal: AbortSignal.timeout(15_000),
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
