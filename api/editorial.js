import { createEditorialStore } from '../lib/editorial-store.js';
import { hashContent, validateContent, deskFor } from '../research-lab/src/desk/core.js';

export function makeHandler({ storeFactory = createEditorialStore, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    try {
      const store = storeFactory(env);
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!await store.admin(token)) return res.status(403).json({ error: '관리자 로그인이 필요합니다.' });
      if (req.method === 'GET') {
        const [drafts, runs] = await Promise.all([store.request('editorial_drafts?select=*&order=edition_date.desc&limit=40'), store.request('editorial_runs?select=*&order=edition_date.desc&limit=14')]);
        return res.status(200).json({ drafts, runs });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || !/^\d{4}-\d{2}-\d{2}-(macro|markets|bitcoin|ai|signals|korea|weekly)$/.test(body.id) || !Number.isSafeInteger(body.version) || !['revise', 'approve', 'reject', 'publish'].includes(body.action)) return res.status(400).json({ error: 'Invalid request' });
      const [draft] = await store.request(`editorial_drafts?id=eq.${body.id}&select=*`);
      if (!draft) return res.status(404).json({ error: 'Not found' });
      if (draft.version !== body.version) return res.status(409).json({ error: '다른 변경이 있습니다. 새로고침하세요.' });
      let payload = draft.payload;
      if (body.action === 'revise') {
        validateContent(body.content, { date: draft.edition_date, sources: payload.sources, related: payload.related });
        payload = { ...payload, content: body.content, desk: deskFor(draft.edition_date), qa: { ...payload.qa, modelReview: null, revisedByAdmin: true } };
      }
      if (body.action === 'approve' && body.reviewed !== true) return res.status(400).json({ error: '출처·숫자·견해 검토 확인이 필요합니다.' });
      if (body.action === 'publish' && env.EDITORIAL_PUBLISH_ENABLED !== 'true') return res.status(503).json({ error: '발행 연결이 아직 활성화되지 않았습니다.' });
      const result = await store.rpc('editorial_transition', { p_id: body.id, p_version: body.version, p_action: body.action, p_payload: payload, p_hash: hashContent(payload.content), p_reviewed: body.reviewed === true });
      return res.status(200).json({ draft: result });
    } catch (e) {
      return res.status(e.status === 400 || e.status === 409 ? 409 : e instanceof SyntaxError ? 400 : 503).json({ error: '요청을 완료하지 못했습니다. 입력과 현재 상태를 확인한 뒤 다시 시도하세요.' });
    }
  };
}
export default makeHandler();
