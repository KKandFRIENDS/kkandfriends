import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';

const token = 'e'.repeat(32);
const config = {
  production: false,
  publicOrigin: 'https://www.kkandfriends.com',
  apiOrigin: 'https://api.kkandfriends.com',
  adminUserId: 'admin-id',
  editorialInternalToken: token,
  editorialPublishEnabled: true,
};

const auth = {
  handler: async () => new Response('{}'),
  api: { getSession: async () => null },
};

test('editorial endpoint rejects missing credentials before querying', async () => {
  let queries = 0;
  const pool = { query: async () => { queries += 1; return { rows: [] }; } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'POST', url: '/api/internal/editorial', payload: { action: 'request', path: 'editorial_drafts?select=*' } });
  assert.equal(response.statusCode, 401);
  assert.equal(queries, 0);
  await app.close();
});

test('editorial endpoint converts an allowed query into parameterized SQL', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: '2026-09-25-ai' }] };
  } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({
    method: 'POST',
    url: '/api/internal/editorial',
    headers: { authorization: `Bearer ${token}` },
    payload: { action: 'request', path: 'editorial_drafts?status=eq.published&select=id,edition_date,payload&order=edition_date.desc&limit=56' },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: [{ id: '2026-09-25-ai' }] });
  assert.deepEqual(calls[0].params, ['published']);
  assert.match(calls[0].sql, /where "status" = \$1 order by "edition_date" desc limit 56$/);
  await app.close();
});

test('editorial endpoint rejects tables outside its allowlist', async () => {
  let queries = 0;
  const pool = { query: async () => { queries += 1; return { rows: [] }; } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const response = await app.inject({
    method: 'POST',
    url: '/api/internal/editorial',
    headers: { authorization: `Bearer ${token}` },
    payload: { action: 'request', path: 'profiles?select=*' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(queries, 0);
  await app.close();
});

test('editorial bridge allows only the manual-create RPC with parameterized values', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ result: { id: '2026-09-27-weekly' } }] }; } };
  const app = await buildApp({ config, pool, auth, databaseHealth: async () => true });
  const payload = { desk: { id: 'weekly' }, content: { title: 'Weekly' } };
  const response = await app.inject({ method: 'POST', url: '/api/internal/editorial', headers: { authorization: `Bearer ${token}` }, payload: { action: 'rpc', name: 'editorial_manual_create', args: { p_date: '2026-09-27', p_payload: payload, p_hash: 'a'.repeat(64) } } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: { id: '2026-09-27-weekly' } });
  assert.match(calls[0].sql, /editorial_manual_create/);
  assert.deepEqual(calls[0].params, ['2026-09-27', payload, 'a'.repeat(64)]);
  await app.close();
});

test('browser editorial endpoint requires an authenticated admin session', async () => {
  const calls = [];
  const adminAuth = { handler: async () => new Response('{}'), api: { getSession: async () => ({ user: { id: 'admin-id' }, session: { id: 'session-id' } }) } };
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/from profiles/.test(sql)) return { rows: [{ id: 'admin-id', status: 'approved' }] };
    return { rows: [] };
  } };
  const app = await buildApp({ config, pool, auth: adminAuth, databaseHealth: async () => true });
  const response = await app.inject({ method: 'GET', url: '/api/v1/editorial' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { drafts: [], runs: [] });
  assert.equal(calls.filter(({ sql }) => /editorial_(drafts|runs)/.test(sql)).length, 2);
  await app.close();
});

test('personal-experience guard checks each field within one sentence', async () => {
  const { hasPersonalExperience } = await import('../src/routes/editorial.js');
  const draft = (text, extra = '평범한 문장입니다.') => ({ title: '제목', summary: '요약', sections: [{ heading: '핵심 판단', text }, { heading: '반론', text: extra }] });
  // Previously rejected: "드러나는 " in one place and "경험" anywhere later.
  assert.equal(hasPersonalExperience(draft('시장에서 드러나는 신호가 있다.', '과거 경험과 다르다.')), false);
  assert.equal(hasPersonalExperience(draft('시장에서 드러나는 신호는\n과거 경험과 다르다.')), false);
  assert.equal(hasPersonalExperience(draft('나는 딜링룸에서 이런 장면을 경험했다.')), true);
  assert.equal(hasPersonalExperience(draft('그때 내가 근무하던 은행은 달랐다.')), true);
  assert.equal(hasPersonalExperience(draft('제가 직접 경험한 일입니다.')), true);
  assert.equal(hasPersonalExperience(draft('내 경험상 이런 장세는 짧다.')), true);
  assert.equal(hasPersonalExperience({ ...draft('평범'), title: '나는 그 시절을 경험했다' }), true);
});

test('free-format manual drafts: daily and weekly', async () => {
  const { validateManualDraft } = await import('../src/routes/editorial.js');
  const text = (n) => '가'.repeat(n);
  const base = (over = {}) => ({ action: 'create', format: 'free', date: '2026-10-02', series: 'DAILY DESK',
    content: { title: '오늘의 업데이트', summary: '요약 한 줄', body: text(400) },
    sources: [{ title: '연준 성명', url: 'https://www.federalreserve.gov/x' }], ...over });

  const daily = validateManualDraft(base());
  assert.equal(daily.content.format, 'free');
  assert.deepEqual(daily.content.sections.map((s) => [s.heading, s.text.length, s.sourceIds]), [['', 400, ['M1']]]);
  assert.equal(daily.desk.id, 'signals');
  assert.deepEqual(daily.evidence, []);

  assert.throws(() => validateManualDraft(base({ content: { title: 't', summary: 's', body: text(200) } })), /Body length 200; expected 300–10000/);
  assert.ok(validateManualDraft(base({ content: { title: 't', summary: 's', body: text(10000) } })), 'a 10,000-character Daily is allowed (KK, 2026-10-07)');
  assert.throws(() => validateManualDraft(base({ content: { title: 't', summary: 's', body: text(10001) } })), /Body length 10001; expected 300–10000/);
  assert.ok(validateManualDraft(base({ date: '2026-10-04', series: 'KK WEEKLY', content: { title: '주간', summary: '요약', body: text(10000) } })), 'a 10,000-character Weekly is allowed');

  // Attachments: only files stored by this API, kept on the content.
  const file = { name: '3분기 리포트.pdf', url: 'https://api.kkandfriends.com/uploads/2026/10/0b6f2c1e-1a2b-4c3d-8e9f-0123456789ab/3%EB%B6%84%EA%B8%B0.pdf', size: 1234 };
  const withFile = validateManualDraft(base({ attachments: [file] }));
  assert.deepEqual(withFile.content.attachments, [file]);
  assert.equal(daily.content.attachments, undefined, 'no attachments key unless something is attached');
  for (const url of ['https://evil.example/uploads/2026/10/0b6f2c1e-1a2b-4c3d-8e9f-0123456789ab/x.pdf',
    'http://api.kkandfriends.com/uploads/2026/10/0b6f2c1e-1a2b-4c3d-8e9f-0123456789ab/x.pdf',
    'https://api.kkandfriends.com/uploads/2026/10/0b6f2c1e-1a2b-4c3d-8e9f-0123456789ab/x.html',
    'https://api.kkandfriends.com/api/v1/profile']) {
    assert.throws(() => validateManualDraft(base({ attachments: [{ ...file, url }] })), /Invalid attachment/, url);
  }
  assert.throws(() => validateManualDraft(base({ attachments: Array(11).fill(file) })), /Up to 10 attachments/);
  assert.throws(() => validateManualDraft(base({ content: { title: 't', summary: 's', body: `${text(400)} https://x.com` } })), /Use source IDs/);
  assert.throws(() => validateManualDraft(base({ sources: [] })), /At least one source/);
  assert.throws(() => validateManualDraft(base({ sources: [{ title: 'x', url: 'http://insecure.example' }] })), /Invalid source URL/);
  assert.throws(() => validateManualDraft(base({ related: [{ title: 'x', url: '/desk/2026-09-28-macro' }] })), /Unknown related article/);

  const weekly = validateManualDraft(base({ date: '2026-10-04', series: 'KK WEEKLY', content: { title: '주간', summary: '요약', body: text(700) },
    related: [{ title: 'MACRO MONDAY · 제목', url: '/desk/2026-09-28-macro' }] }));
  assert.deepEqual(weekly.content.relatedUrls, ['/desk/2026-09-28-macro']);
  assert.equal(weekly.related.length, 1);
  assert.throws(() => validateManualDraft(base({ date: '2026-10-04', series: 'KK WEEKLY', content: { title: '주간', summary: '요약', body: text(700) },
    related: [{ title: 'x', url: 'https://evil.example/desk/2026-09-28-macro' }] })), /Unknown related article/);

  // The fixed-heading path for automated drafts is unchanged.
  assert.throws(() => validateManualDraft({ ...base(), format: undefined, sources: [] }), /At least two sources/);
});

test('saved drafts can be edited in full, published ones in place', async () => {
  const { editionDay, revisedFreePayload } = await import('../src/routes/editorial.js');
  // node-postgres returns DATE columns as a local-midnight Date.
  assert.equal(editionDay(new Date(2026, 9, 5)), '2026-10-05');
  assert.equal(editionDay('2026-10-05'), '2026-10-05');

  const old = { desk: { id: 'macro' }, content: { title: '옛', summary: '옛', sections: [{ heading: '핵심 판단', text: 'x', sourceIds: ['S1'] }] },
    sources: [{ id: 'S1', title: 'Fed', url: 'https://fed.gov/a', type: 'primary', excerpt: 'q'.repeat(40) }],
    evidence: [{ sourceId: 'S1' }], related: [], top5: [{ id: 'a' }], qa: { modelReview: { passed: true, notes: ['메모'] } } };
  const body = { content: { title: '새 제목', summary: '새 요약', body: '가'.repeat(400) }, sources: [{ title: '새 출처', url: 'https://www.bok.or.kr/x' }] };
  const next = revisedFreePayload(old, body, new Date(2026, 9, 5));
  assert.equal(next.content.format, 'free');
  assert.equal(next.content.title, '새 제목');
  assert.deepEqual(next.sources.map((s) => s.title), ['새 출처']);
  assert.deepEqual(next.evidence, []);
  assert.deepEqual(next.qa.modelReview.notes, ['메모']);
  assert.throws(() => revisedFreePayload(old, { ...body, sources: [] }, '2026-10-05'), /At least one source/);

  const calls = [];
  const adminAuth = { handler: async () => new Response('{}'), api: { getSession: async () => ({ user: { id: 'admin-id' }, session: { id: 'session-id' } }) } };
  const draft = (status) => ({ id: '2026-10-05-macro', edition_date: new Date(2026, 9, 5), status, version: 7, payload: old });
  let current = draft('published');
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/from profiles/.test(sql)) return { rows: [{ id: 'admin-id', status: 'approved' }] };
    if (/select \* from editorial_drafts where id/.test(sql)) return { rows: [current] };
    if (/update editorial_drafts/.test(sql)) return { rows: [{ snapshot: { ...current, version: 8, payload: params[0] } }] };
    if (/editorial_transition/.test(sql)) return { rows: [{ result: { ...current, version: 8, status: 'awaiting_approval', payload: params[3] } }] };
    return { rows: [] };
  } };
  const app = await buildApp({ config, pool, auth: adminAuth, databaseHealth: async () => true });

  const updated = await app.inject({ method: 'POST', url: '/api/v1/editorial', payload: { id: current.id, version: 7, action: 'update', ...body } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().draft.payload.content.title, '새 제목');
  const sql = calls.find((c) => /update editorial_drafts/.test(c.sql));
  assert.match(sql.sql, /status='published'/);
  assert.match(sql.sql, /insert into editorial_events/);

  current = draft('awaiting_approval');
  const notPublished = await app.inject({ method: 'POST', url: '/api/v1/editorial', payload: { id: current.id, version: 7, action: 'update', ...body } });
  assert.equal(notPublished.statusCode, 409);

  const revised = await app.inject({ method: 'POST', url: '/api/v1/editorial', payload: { id: current.id, version: 7, action: 'revise', format: 'free', ...body } });
  assert.equal(revised.statusCode, 200, revised.body);
  assert.deepEqual(revised.json().draft.payload.sources.map((s) => s.title), ['새 출처']);
  await app.close();
});
