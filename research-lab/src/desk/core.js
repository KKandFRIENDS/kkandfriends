import { createHash } from 'node:crypto';

export const DESKS = [
  ['weekly', 'KK WEEKLY', 'Global'], ['macro', 'MACRO MONDAY', 'Macro'],
  ['markets', 'MARKETS TUESDAY', 'Equity'], ['bitcoin', 'BITCOIN WEDNESDAY', 'Digital Assets'],
  ['ai', 'AI THURSDAY', 'Global'], ['signals', 'SIGNAL FRIDAY', 'Global'],
  ['korea', 'KOREA SATURDAY', 'Korea'],
];
export const DAILY_SECTIONS = ['핵심 판단', '확인된 사실', '시장의 해석', '검토할 관점', '반론', '관찰 지표'];
export const WEEKLY_SECTIONS = ['이번 주 핵심', '거시경제', '금융시장', 'Bitcoin', 'AI', '주요 논쟁', '한국', '종합 판단', '다음 주 관찰 항목'];
export function dateKey(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function deskFor(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Invalid date');
  const [id, label, topic] = DESKS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return { id, label, topic, series: id === 'weekly' ? 'KK WEEKLY' : 'DAILY DESK' };
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export function hashContent(content) { return createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex'); }
const text = (value, max = 10000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function rankCandidates(candidates, sources, recent = []) {
  if (!Array.isArray(candidates)) throw new Error('Candidates must be an array');
  const ids = new Set();
  const known = new Map(sources.map(s => [s.id, s]));
  const titles = new Set(recent.map(a => a.title?.trim().toLowerCase()));
  return candidates.map(c => {
    if (!text(c.id, 80) || ids.has(c.id) || !text(c.title, 160) || !text(c.reason, 1200)) throw new Error('Invalid candidate');
    ids.add(c.id);
    const weights = { impact: 0.35, structural: 0.3, surprise: 0.15, relevance: 0.2 };
    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      if (!Number.isFinite(c.scores?.[key]) || c.scores[key] < 0 || c.scores[key] > 10) throw new Error('Invalid score');
      score += c.scores[key] * weight * 10;
    }
    if (!Array.isArray(c.sourceIds) || c.sourceIds.length < 2 || c.sourceIds.some(id => !known.has(id))) throw new Error('Unknown sources');
    const reasons = [];
    if (!c.sourceIds.some(id => known.get(id).type === 'primary')) reasons.push('원자료 없음');
    if (new Set(c.sourceIds.map(id => new URL(known.get(id).url).hostname.replace(/^www\./, ''))).size < 2) reasons.push('독립 출처 부족');
    if (c.duplicateOf !== null || titles.has(c.title.trim().toLowerCase())) reasons.push('기존 글과 중복 또는 중복검사 누락');
    if (c.conflict !== 'clear') reasons.push('이해상충 검토 필요');
    if (score < 70) reasons.push('평가 기준 미달');
    return { ...c, score: Math.round(score * 10) / 10, reasons };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 5);
}
export function validateEvidence(claims, sources) {
  if (!Array.isArray(claims) || claims.length < 2 || claims.length > 15) throw new Error('2–15 evidence records required');
  const lookup = new Map(sources.map(s => [s.id, s]));
  for (const claim of claims) {
    const source = lookup.get(claim.sourceId);
    if (!source || !text(claim.statement, 1200) || !text(claim.quote, 300) || claim.quote.length < 15 || !source.excerpt.includes(claim.quote)) throw new Error('Evidence quote is not in retrieved source');
    if (!text(claim.asOf, 100) || !text(claim.unit, 100)) throw new Error('Evidence date and unit required');
  }
  if (!claims.some(c => lookup.get(c.sourceId).type === 'primary')) throw new Error('Primary evidence required');
  return claims;
}
export function validateContent(content, { sources, date, related = [] }) {
  const desk = deskFor(date);
  if (!text(content?.title, 160) || !text(content?.summary, 400)) throw new Error('Title and summary required');
  const headings = desk.id === 'weekly' ? WEEKLY_SECTIONS : DAILY_SECTIONS;
  if (!Array.isArray(content.sections) || content.sections.length !== headings.length) throw new Error('Section structure invalid');
  const sourceIds = new Set(sources.map(s => s.id));
  content.sections.forEach((s, i) => {
    if (s.heading !== headings[i] || !text(s.text) || !Array.isArray(s.sourceIds) || !s.sourceIds.length || s.sourceIds.some(id => !sourceIds.has(id))) throw new Error('Every section requires known sources');
  });
  const chars = [...content.sections.map(s => s.text).join('\n\n')].length;
  const [min, max] = desk.id === 'weekly' ? [1600, 4000] : [800, 1200];
  if (chars < min || chars > max) throw new Error(`Body length ${chars}; expected ${min}–${max} including spaces`);
  if (!Array.isArray(content.relatedUrls) || content.relatedUrls.some(url => !related.some(r => r.url === url))) throw new Error('Unknown related article');
  const joined = JSON.stringify(content);
  if (/<\/?[a-z]|\[확인 필요\]|https?:\/\//i.test(content.sections.map(s => s.text).join(' '))) throw new Error('Use source IDs, plain text and resolved facts');
  if (/내가 .*근무|나는 .*경험|제가 .*경험|내 경험상/.test(joined)) throw new Error('Unapproved personal experience');
  return { characters: chars, checks: ['출처 ID', '인용문 대조', '문단 구조', '글자 수', '관련 글 URL'], humanReviewRequired: true };
}
export function publicArticle(row) {
  const p = row.payload;
  return { slug: row.id, date: row.edition_date, desk: p.desk, content: p.content,
    sources: p.sources.map(({ id, title, url, publishedAt }) => ({ id, title, url, publishedAt })),
    related: p.related.filter(r => p.content.relatedUrls.includes(r.url)), publishedAt: row.published_at };
}
