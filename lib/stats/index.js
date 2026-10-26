// ============================================================================
//  stats/index.js — the official-statistics layer, assembled.
//
//  Providers (each its own file, each BEST EFFORT and never throwing):
//    ../ecos.js    한국은행 ECOS      물가, 가계신용, 금리 (already in the briefs)
//    kosis.js      통계청 KOSIS       물가(교차 확인용), 인구
//    dart.js       금감원 OpenDART    공시
//    openlaw.js    법제처 OpenLaw     자본시장법 계열 개정·시행예정
//
//  Two consumers:
//    fetchOfficialStats()  → AGGREGATE lines for the 17:30 brief. No company
//                            names: 종목을 찍지 않는다 is a standing rule.
//    gatherCardEntries()   → company-level lines + cross-checks for KK's drafts,
//                            rendered by renderCard() (scripts/stats-card.mjs).
// ============================================================================

import { fetchEcosKeyStats } from '../ecos.js';
import { dartConfigured, fetchDisclosureSnapshot, fetchMajorReports, fetchFilingDetail, summarizeReports, formatSummaryLines } from './dart.js';
import { openlawConfigured, fetchLawWatch, formatLawLines, recentPromulgations } from './openlaw.js';
import { kosisConfigured, fetchKosisIndicator, INDICATORS } from './kosis.js';
import { kstYmd, isoFromYmd } from './http.js';

export const STATS_FLAG = 'STATS_IN_BRIEFS';

// The brief only asks for official stats when this is "1". Default OFF so the
// code can ship and the VPS can be switched on separately, and back off, with
// one line in .env.
export function statsInBriefsEnabled() {
  return process.env[STATS_FLAG] === '1';
}

function kstClock(now) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
}

function kstStamp(now) {
  return `${isoFromYmd(kstYmd(now))} ${kstClock(now)} KST`;
}

// ─── For the brief ──────────────────────────────────────────────────────────

// Never throws. Returns { disclosure: [lines], law: [lines], errors: [strings] }.
// A provider that is not configured is skipped silently; one that is configured
// and fails is reported in `errors` so the caller can log it. Lines are the
// same shape lib/ecos.js uses: { name, value, unit, asOf, source, formatted }.
export async function fetchOfficialStats({ now = new Date() } = {}) {
  const out = { disclosure: [], law: [], errors: [] };
  const today = isoFromYmd(kstYmd(now));

  const jobs = [];
  if (dartConfigured()) {
    jobs.push(
      fetchDisclosureSnapshot({ days: 1, now, asOf: kstClock(now) }).then((r) => {
        if (r.ok) out.disclosure = r.lines;
        else out.errors.push(`dart: ${r.error}`);
      }),
    );
  }
  if (openlawConfigured()) {
    jobs.push(
      fetchLawWatch().then((r) => {
        if (r.ok) {
          out.law = formatLawLines(r.statuses, today);
          const recent = recentPromulgations(r.statuses, today, 14);
          for (const v of recent) {
            out.law.push({
              name: v.name,
              value: '1',
              unit: '건',
              asOf: v.promulgated,
              source: '국가법령정보센터',
              formatted: `${v.name} ${v.kind} 공포 ${v.promulgated} (시행 ${v.effective}, 최근 14일 이내 공포)`,
            });
          }
        }
        if (r.errors?.length) out.errors.push(...r.errors.map((e) => `openlaw: ${e}`));
        if (!r.ok && !r.errors?.length && r.error) out.errors.push(`openlaw: ${r.error}`);
      }),
    );
  }
  await Promise.allSettled(jobs);
  return out;
}

// ─── Cross-check (the 교차 확인 rule) ───────────────────────────────────────

// Compare the ECOS and KOSIS print of the same series. Different publishers,
// same underlying number: agreement is evidence, disagreement is a 확인 필요.
export function crossCheck(ecosStat, kosisItem, { tolerance = 0.05 } = {}) {
  if (!ecosStat || !kosisItem || !kosisItem.ok) {
    return { status: '비교 불가', text: '한쪽 값을 가져오지 못했습니다' };
  }
  if (ecosStat.asOf !== kosisItem.asOf) {
    return {
      status: '비교 불가',
      text: `기준 시점이 다릅니다 (ECOS ${ecosStat.asOf}, KOSIS ${kosisItem.asOf})`,
    };
  }
  const diff = Math.abs(ecosStat.num - kosisItem.num);
  if (diff <= tolerance) return { status: '일치', text: `차이 ${diff.toFixed(3)}` };
  return {
    status: '불일치',
    text: `ECOS ${ecosStat.num} 대 KOSIS ${kosisItem.num} (차이 ${diff.toFixed(3)}), 확인 필요`,
  };
}

// ─── For KK's drafts ────────────────────────────────────────────────────────

const ECOS_CARD_NAMES = ['소비자물가지수', '생산자물가지수', '가계신용', '가계대출연체율', '실업률'];
const DETAIL_LIMIT = 8;

// Collects everything the 수치 카드 prints. Never throws. Each section is
// { title, entries: [{ formatted, source, url, note }] } so the renderer has
// no provider-specific logic.
export async function gatherCardEntries({ now = new Date(), days = 3, details = true } = {}) {
  const sections = [];
  const missing = [];
  const today = isoFromYmd(kstYmd(now));

  // 물가·가계부채: ECOS levels, with KOSIS as the cross-check for 물가.
  const [ecosRows, kosisCpi] = await Promise.all([
    fetchEcosKeyStats().catch(() => []),
    kosisConfigured() ? fetchKosisIndicator('cpi') : Promise.resolve({ ok: false, error: 'KOSIS_API_KEY is not set' }),
  ]);
  const ecosPicks = ecosRows.filter((r) => ECOS_CARD_NAMES.includes(r.name));
  if (ecosPicks.length) {
    sections.push({
      title: '물가·가계부채 (한국은행 ECOS)',
      entries: ecosPicks.map((r) => ({
        formatted: r.formatted,
        source: '한국은행 ECOS 100대 통계지표',
        url: 'https://ecos.bok.or.kr',
      })),
    });
  } else {
    missing.push('ECOS 지표를 가져오지 못했습니다 (ECOS_API_KEY 또는 연결 확인)');
  }

  if (kosisCpi.ok) {
    const ecosCpi = ecosPicks.find((r) => r.name === '소비자물가지수');
    const check = crossCheck(ecosCpi, kosisCpi);
    sections.push({
      title: '물가 (통계청 KOSIS)',
      entries: [{
        formatted: kosisCpi.formatted,
        source: kosisCpi.source,
        url: kosisCpi.url,
        note: `ECOS와 교차 확인: ${check.status} (${check.text})`,
      }],
    });
  } else {
    missing.push(`KOSIS 물가: ${kosisCpi.error}`);
  }
  const pop = kosisConfigured() ? await fetchKosisIndicator('population') : { ok: false, error: 'KOSIS_API_KEY is not set' };
  if (pop.ok) {
    sections.push({ title: '인구 (통계청 KOSIS)', entries: [{ formatted: pop.formatted, source: pop.source, url: pop.url }] });
  } else {
    missing.push(`KOSIS 인구: ${pop.error}`);
  }

  // 공시: company-level, with detail lines where an endpoint exists.
  if (dartConfigured()) {
    const res = await fetchMajorReports({ days, now });
    if (res.ok) {
      const summary = formatSummaryLines(summarizeReports(res.items), { from: res.from, to: res.to, asOf: kstClock(now) });
      const entries = summary.map((s) => ({ formatted: s.formatted, source: 'DART', url: 'https://dart.fss.or.kr' }));
      const fresh = res.items.filter((i) => !i.amended && (i.kind === 'rights' || i.kind === 'cb')).slice(0, DETAIL_LIMIT);
      if (details) {
        for (const item of fresh) {
          const d = await fetchFilingDetail(item);
          entries.push({
            formatted: d.ok ? `${d.formatted} [${item.market}]` : `${item.corpName} ${item.label} [${item.market}] (상세 조회 실패: ${d.error})`,
            source: `DART ${item.rceptDt.slice(0, 4)}-${item.rceptDt.slice(4, 6)}-${item.rceptDt.slice(6, 8)} 접수`,
            url: item.url,
          });
        }
      }
      if (res.truncated) missing.push('DART 목록이 조회 한도에서 잘렸습니다 (건수가 실제보다 적을 수 있습니다)');
      sections.push({ title: `공시 (DART, ${isoFromYmd(res.from)}~${isoFromYmd(res.to)})`, entries });
    } else {
      missing.push(`DART: ${res.error}`);
    }
  } else {
    missing.push('DART: DART_API_KEY is not set');
  }

  // 법령
  if (openlawConfigured()) {
    const res = await fetchLawWatch();
    if (res.ok) {
      const entries = formatLawLines(res.statuses, today).map((l) => ({
        formatted: l.formatted, source: l.source, url: 'https://www.law.go.kr',
      }));
      for (const v of recentPromulgations(res.statuses, today, 14)) {
        entries.push({
          formatted: `${v.name} ${v.kind} 공포 ${v.promulgated} (시행 ${v.effective})`,
          source: '국가법령정보센터', url: 'https://www.law.go.kr',
        });
      }
      sections.push({ title: '법령 (국가법령정보센터)', entries });
      for (const e of res.errors ?? []) missing.push(`OpenLaw: ${e}`);
    } else {
      missing.push(`OpenLaw: ${res.error}`);
    }
  } else {
    missing.push('OpenLaw: OPENLAW_OC is not set');
  }

  return { at: now, sections, missing, unverified: Object.values(INDICATORS).filter((i) => !i.verified).map((i) => i.label) };
}

// Markdown for the bottom of a draft, outside the body (the 숫자 규칙: 출처
// 링크와 정정 표는 본문 밖). No tables: the lounge renderer does not support them.
export function renderCard({ at = new Date(), sections, missing = [], unverified = [] }) {
  const lines = [`## 수치 카드 (조회 ${kstStamp(at)})`, ''];
  for (const s of sections) {
    lines.push(`### ${s.title}`);
    for (const e of s.entries) {
      lines.push(`- ${e.formatted}`);
      lines.push(`  - 출처: ${e.source}${e.url ? ` (${e.url})` : ''}`);
      if (e.note) lines.push(`  - ${e.note}`);
    }
    lines.push('');
  }
  if (missing.length || unverified.length) {
    lines.push('### 확인 필요');
    for (const m of missing) lines.push(`- ${m}`);
    for (const u of unverified) lines.push(`- ${u}: 통계표 ID 또는 응답 형식이 아직 실제 응답으로 확인되지 않았습니다`);
    lines.push('');
  }
  return lines.join('\n');
}
