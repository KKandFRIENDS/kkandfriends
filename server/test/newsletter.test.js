import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { addSubscriber, removeSubscriber, stibeeConfigured } from '../src/stibee.js';

const baseConfig = {
  production: false,
  publicOrigin: 'https://www.kkandfriends.com',
  apiOrigin: 'https://api.kkandfriends.com',
  adminUserId: 'admin-id',
};

const authFor = (user) => ({
  handler: async () => new Response('{}'),
  api: { getSession: async () => user ? { user, session: { id: 'session-id' } } : null },
});

function fakeStibee(respond = () => ({ Ok: true, Value: { success: [] } })) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    const body = respond(calls.at(-1));
    return new Response(JSON.stringify(body), { status: body.__status || 200 });
  };
  return { calls, fetch };
}

function profilePool(profile) {
  const updates = [];
  return {
    updates,
    query: async (sql, params) => {
      if (/^select \* from profiles/.test(sql.trim())) return { rows: [profile] };
      if (/^update profiles/.test(sql.trim())) {
        updates.push({ sql, params });
        return { rows: [{ ...profile, newsletter_opt_in: params.at(-1) }] };
      }
      return { rows: [] };
    },
  };
}

const MEMBER = { id: 'm1', status: 'approved', contact_email: 'member@example.com', newsletter_opt_in: false };

test('stibee is dormant until both key and list id are set', () => {
  assert.equal(stibeeConfigured({}), false);
  assert.equal(stibeeConfigured({ stibeeApiKey: 'k' }), false);
  assert.equal(stibeeConfigured({ stibeeApiKey: 'k', stibeeListId: '1' }), true);
});

test('addSubscriber sends only the email with the AccessToken header', async () => {
  const stibee = fakeStibee();
  await addSubscriber({ stibeeApiKey: 'key', stibeeListId: '123', fetch: stibee.fetch }, 'a@b.com');
  const [call] = stibee.calls;
  assert.equal(call.url, 'https://api.stibee.com/v1/lists/123/subscribers');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.AccessToken, 'key');
  assert.deepEqual(call.body, { eventOccurredBy: 'SUBSCRIBER', confirmEmailYN: 'N', subscribers: [{ email: 'a@b.com' }] });
});

test('addSubscriber treats an existing address as success and a refusal as failure', async () => {
  const exists = fakeStibee(() => ({ Ok: true, Value: { failExistEmail: [{ email: 'a@b.com' }] } }));
  await addSubscriber({ stibeeApiKey: 'k', stibeeListId: '1', fetch: exists.fetch }, 'a@b.com');

  const denied = fakeStibee(() => ({ Ok: true, Value: { failDeny: [{ email: 'A@b.com' }] } }));
  await assert.rejects(addSubscriber({ stibeeApiKey: 'k', stibeeListId: '1', fetch: denied.fetch }, 'a@b.com'), /failDeny/);

  const bad = fakeStibee(() => ({ Ok: false, Error: { code: 'INVALID_TOKEN' } }));
  await assert.rejects(addSubscriber({ stibeeApiKey: 'k', stibeeListId: '1', fetch: bad.fetch }, 'a@b.com'), /INVALID_TOKEN/);
});

test('removeSubscriber deletes the address from the list', async () => {
  const stibee = fakeStibee();
  await removeSubscriber({ stibeeApiKey: 'k', stibeeListId: '9', fetch: stibee.fetch }, 'a@b.com');
  assert.equal(stibee.calls[0].method, 'DELETE');
  assert.deepEqual(stibee.calls[0].body, ['a@b.com']);
});

test('profile hides the newsletter option while Stibee is not configured', async () => {
  const pool = profilePool(MEMBER);
  const app = await buildApp({ config: baseConfig, pool, auth: authFor({ id: 'm1' }), databaseHealth: async () => true });
  const response = await app.inject({ method: 'GET', url: '/api/v1/profile' });
  assert.equal(response.statusCode, 200);
  assert.equal('newsletter_opt_in' in response.json().profile, false);
  await app.close();
});

test('opting in subscribes on Stibee before saving the flag', async () => {
  const stibee = fakeStibee();
  const config = { ...baseConfig, stibeeApiKey: 'k', stibeeListId: '1', fetch: stibee.fetch };
  const pool = profilePool(MEMBER);
  const app = await buildApp({ config, pool, auth: authFor({ id: 'm1', email: 'login@example.com' }), databaseHealth: async () => true });

  const shown = await app.inject({ method: 'GET', url: '/api/v1/profile' });
  assert.equal(shown.json().profile.newsletter_opt_in, false);

  const response = await app.inject({ method: 'PATCH', url: '/api/v1/profile', payload: { newsletterOptIn: true } });
  assert.equal(response.statusCode, 200);
  assert.equal(stibee.calls.length, 1);
  assert.equal(stibee.calls[0].method, 'POST');
  assert.deepEqual(stibee.calls[0].body.subscribers, [{ email: 'member@example.com' }]);
  assert.equal(pool.updates.length, 1);
  assert.match(pool.updates[0].sql, /newsletter_opt_in = \$2/);
  assert.equal(response.json().profile.newsletter_opt_in, true);
  await app.close();
});

test('a Stibee failure leaves the profile unchanged', async () => {
  const stibee = fakeStibee(() => ({ __status: 500, Ok: false }));
  const config = { ...baseConfig, stibeeApiKey: 'k', stibeeListId: '1', fetch: stibee.fetch };
  const pool = profilePool(MEMBER);
  const app = await buildApp({ config, pool, auth: authFor({ id: 'm1' }), databaseHealth: async () => true });
  const response = await app.inject({ method: 'PATCH', url: '/api/v1/profile', payload: { newsletterOptIn: true, displayName: 'X' } });
  assert.equal(response.statusCode, 502);
  assert.equal(pool.updates.length, 0);
  await app.close();
});

test('unchanged or unconfigured newsletter values never call Stibee', async () => {
  const stibee = fakeStibee();
  const configured = { ...baseConfig, stibeeApiKey: 'k', stibeeListId: '1', fetch: stibee.fetch };
  let app = await buildApp({ config: configured, pool: profilePool(MEMBER), auth: authFor({ id: 'm1' }), databaseHealth: async () => true });
  let response = await app.inject({ method: 'PATCH', url: '/api/v1/profile', payload: { newsletterOptIn: false, displayName: 'X' } });
  assert.equal(response.statusCode, 200);
  await app.close();

  const pool = profilePool(MEMBER);
  app = await buildApp({ config: { ...baseConfig, fetch: stibee.fetch }, pool, auth: authFor({ id: 'm1' }), databaseHealth: async () => true });
  response = await app.inject({ method: 'PATCH', url: '/api/v1/profile', payload: { newsletterOptIn: true, displayName: 'X' } });
  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(pool.updates[0].sql, /newsletter_opt_in/);
  await app.close();

  assert.equal(stibee.calls.length, 0);
});

test('newsletterOptIn must be a boolean', async () => {
  const config = { ...baseConfig, stibeeApiKey: 'k', stibeeListId: '1', fetch: fakeStibee().fetch };
  const app = await buildApp({ config, pool: profilePool(MEMBER), auth: authFor({ id: 'm1' }), databaseHealth: async () => true });
  const response = await app.inject({ method: 'PATCH', url: '/api/v1/profile', payload: { newsletterOptIn: 'yes' } });
  assert.equal(response.statusCode, 400);
  await app.close();
});
