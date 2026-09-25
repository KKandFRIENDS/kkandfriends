import { createEditorialStore } from '../lib/editorial-store.js';
import { hashContent, validateContent, validateEvidence, deskFor } from '../research-lab/src/desk/core.js';

function validateManualDraft(body) {
  if (!body || body.action !== 'create' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new Error('Invalid manual draft');
  const desk = deskFor(body.date);
  if (!['DAILY DESK', 'KK WEEKLY'].includes(body.series) || desk.series !== body.series) throw new Error('Series and date do not match');
  if (!Array.isArray(body.sources) || body.sources.length < 2 || body.sources.length > 12) throw new Error('At least two sources are required');
  const sources = body.sources.map((source, index) => {
    if (!source || typeof source.title !== 'string' || !source.title.trim() || !['primary', 'secondary'].includes(source.type) || typeof source.quote !== 'string' || source.quote.trim().length < 30) throw new Error('Invalid source');
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid source URL');
    return { id: `M${index + 1}`, title: source.title.trim(), url: url.href, type: source.type, excerpt: source.quote.trim(), publishedAt: body.date };
  });
  const sourceIds = sources.map(source => source.id);
  const content = {
    title: String(body.content?.title || '').trim(),
    summary: String(body.content?.summary || '').trim(),
    sections: Array.isArray(body.content?.sections) ? body.content.sections.map(section => ({
      heading: String(section.heading || '').trim(), text: String(section.text || '').trim(), sourceIds,
    })) : [],
    relatedUrls: [],
  };
  const evidence = sources.map(source => ({
    statement: `${source.title}에서 확인한 수동 작성 근거`, quote: source.excerpt,
    asOf: body.date, unit: '원문', sourceId: source.id,
  }));
  const qa = validateContent(content, { date: body.date, sources, related: [] });
  validateEvidence(evidence, sources);
  return {
    schemaVersion: 1, desk, content, sources, evidence,
    counterargument: content.sections.find(section => section.heading === '반론' || section.heading === '주요 논쟁')?.text || '',
    watchItem: content.sections.at(-1)?.text || '',
    top5: [{ id: 'manual-chief-draft', title: content.title, score: 100, reason: 'Chief가 고정 포맷으로 직접 작성', reasons: [] }],
    selectedId: 'manual-chief-draft', related: [],
    qa: { ...qa, modelReview: null, manualDraft: true, humanReviewRequired: true },
    models: { writer: 'manual' }, memoryIds: [], collection: { manual: true },
  };
}

function validateReplacementPayload(payload, draft) {
  if (!payload || typeof payload !== 'object' || JSON.stringify(payload).length > 500000) throw new Error('Invalid replacement payload');
  if (!Array.isArray(payload.sources) || payload.sources.length < 2 || payload.sources.length > 20) throw new Error('Replacement sources required');
  const sourceIds = new Set();
  for (const source of payload.sources) {
    if (!source || typeof source.id !== 'string' || sourceIds.has(source.id) || !source.id.trim() || typeof source.title !== 'string' || !source.title.trim() || !['primary', 'secondary'].includes(source.type) || typeof source.excerpt !== 'string' || source.excerpt.length < 30 || source.excerpt.length > 20000) throw new Error('Invalid replacement source');
    sourceIds.add(source.id);
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid replacement source URL');
  }
  if (!Array.isArray(payload.related) || !Array.isArray(payload.top5) || !payload.top5.length || typeof payload.selectedId !== 'string') throw new Error('Incomplete replacement payload');
  if (!payload.qa || payload.qa.modelReview?.passed !== true || !Array.isArray(payload.qa.modelReview?.issues) || payload.qa.modelReview.issues.length) throw new Error('Model review required');
  validateEvidence(payload.evidence, payload.sources);
  const normalized = { ...payload, desk: deskFor(draft.edition_date) };
  normalized.qa = { ...payload.qa, ...validateContent(payload.content, { date: draft.edition_date, sources: payload.sources, related: payload.related }), modelReview: payload.qa.modelReview, replacedByAdmin: true };
  return normalized;
}

export function makeHandler({ storeFactory = createEditorialStore, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    try {
      const store = storeFactory(env);
      if (!await store.admin(req.headers.cookie || '')) return res.status(403).json({ error: '관리자 로그인이 필요합니다.' });
      if (req.method === 'GET') {
        const [drafts, runs] = await Promise.all([store.request('editorial_drafts?select=*&order=edition_date.desc&limit=40'), store.request('editorial_runs?select=*&order=edition_date.desc&limit=14')]);
        return res.status(200).json({ drafts, runs });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body?.action === 'create') {
        let payload;
        try { payload = validateManualDraft(body); }
        catch (error) { return res.status(400).json({ error: error.message || '수동 초안 형식을 확인하세요.' }); }
        const draft = await store.rpc('editorial_manual_create', {
          p_date: body.date, p_payload: payload, p_hash: hashContent(payload.content),
        });
        return res.status(201).json({ draft });
      }
      if (!body || !/^\d{4}-\d{2}-\d{2}-(macro|markets|bitcoin|ai|signals|korea|weekly)$/.test(body.id) || !Number.isSafeInteger(body.version) || !['revise', 'replace', 'approve', 'reject', 'publish'].includes(body.action)) return res.status(400).json({ error: 'Invalid request' });
      const [draft] = await store.request(`editorial_drafts?id=eq.${body.id}&select=*`);
      if (!draft) return res.status(404).json({ error: 'Not found' });
      if (draft.version !== body.version) return res.status(409).json({ error: '다른 변경이 있습니다. 새로고침하세요.' });
      let payload = draft.payload;
      if (body.action === 'revise') {
        validateContent(body.content, { date: draft.edition_date, sources: payload.sources, related: payload.related });
        payload = { ...payload, content: body.content, desk: deskFor(draft.edition_date), qa: { ...payload.qa, modelReview: null, revisedByAdmin: true } };
      }
      if (body.action === 'replace') {
        if (draft.status !== 'rejected') return res.status(409).json({ error: '보류된 초안만 근거 묶음을 교체할 수 있습니다.' });
        payload = validateReplacementPayload(body.payload, draft);
      }
      if (body.action === 'approve' && body.reviewed !== true) return res.status(400).json({ error: '출처·숫자·견해 검토 확인이 필요합니다.' });
      if (body.action === 'publish' && env.EDITORIAL_PUBLISH_ENABLED !== 'true') return res.status(503).json({ error: '발행 연결이 아직 활성화되지 않았습니다.' });
      const result = await store.rpc('editorial_transition', { p_id: body.id, p_version: body.version, p_action: body.action === 'replace' ? 'revise' : body.action, p_payload: payload, p_hash: hashContent(payload.content), p_reviewed: body.reviewed === true });
      return res.status(200).json({ draft: result });
    } catch (e) {
      return res.status(e.status === 400 || e.status === 409 ? 409 : e instanceof SyntaxError ? 400 : 503).json({ error: '요청을 완료하지 못했습니다. 입력과 현재 상태를 확인한 뒤 다시 시도하세요.' });
    }
  };
}
export default makeHandler();
