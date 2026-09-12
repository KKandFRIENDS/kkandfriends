import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnthropicInvoker,
  createOpenAiCompatibleInvoker,
  createVercelAiGatewayInvoker,
  resolveVercelOidcToken,
} from '../src/model-adapters.js';

function headers(values = {}) {
  return { get: (key) => values[key.toLowerCase()] ?? null };
}

test('Anthropic adapter sends the Messages API contract and extracts text blocks', async () => {
  let request;
  const invoke = createAnthropicInvoker({
    apiKey: 'test-secret-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        headers: headers(),
        json: async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }),
      };
    },
  });
  const text = await invoke({ model: 'test-model', prompt: 'hello', stage: 'research' });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.options.headers['anthropic-version'], '2023-06-01');
  assert.equal(request.options.headers['x-api-key'], 'test-secret-key');
  assert.equal(body.max_tokens, 6000);
  assert.equal(text, '{"ok":true}');
});

test('provider errors expose status and request ID but not server messages or keys', async () => {
  const invoke = createAnthropicInvoker({
    apiKey: 'never-leak-this-key',
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: headers({ 'request-id': 'req-123' }),
      json: async () => ({ error: { type: 'rate_limit_error', message: 'sensitive provider detail' } }),
    }),
  });
  await assert.rejects(invoke({ model: 'test', prompt: 'x', stage: 'writer' }), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.requestId, 'req-123');
    assert.doesNotMatch(error.message, /never-leak|sensitive provider detail/);
    return true;
  });
});

test('OpenAI-compatible adapter supports an injected HTTPS gateway', async () => {
  const invoke = createOpenAiCompatibleInvoker({
    apiKey: 'gateway-key',
    endpoint: 'https://gateway.example/v1/chat/completions',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: headers(),
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    }),
  });
  assert.equal(await invoke({ model: 'model', prompt: 'x', stage: 'discovery' }), '{"ok":true}');
});

test('Vercel OIDC token prefers the function request header over local env', () => {
  const request = { headers: headers({ 'x-vercel-oidc-token': 'request-token' }) };
  assert.equal(resolveVercelOidcToken({ request, env: { VERCEL_OIDC_TOKEN: 'env-token' } }), 'request-token');
  assert.equal(resolveVercelOidcToken({ env: { VERCEL_OIDC_TOKEN: 'env-token' } }), 'env-token');
});

test('Vercel OIDC token resolution fails closed when no credential exists', () => {
  assert.throws(() => resolveVercelOidcToken({ env: {} }), /token is unavailable/);
});

test('Vercel AI Gateway adapter uses bearer OIDC and the provider/model identifier', async () => {
  let request;
  const invoke = createVercelAiGatewayInvoker({
    env: { VERCEL_OIDC_TOKEN: 'short-lived-token' },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        headers: headers(),
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      };
    },
  });
  const text = await invoke({ model: 'anthropic/example-model', prompt: 'hello', stage: 'research' });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer short-lived-token');
  assert.equal(request.options.headers['x-api-key'], undefined);
  assert.equal(body.model, 'anthropic/example-model');
  assert.equal(body.max_tokens, 6000);
  assert.equal(text, '{"ok":true}');
});

test('Vercel OIDC adapter refuses to send credentials to another host', () => {
  assert.throws(
    () => createVercelAiGatewayInvoker({ endpoint: 'https://attacker.example/v1/chat/completions' }),
    /only be sent to Vercel AI Gateway/,
  );
});

test('Vercel AI Gateway errors never expose the OIDC token or provider detail', async () => {
  const invoke = createVercelAiGatewayInvoker({
    env: { VERCEL_OIDC_TOKEN: 'never-leak-oidc' },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      headers: headers({ 'x-request-id': 'gateway-request-1' }),
      json: async () => ({ error: { type: 'unauthorized', message: 'sensitive gateway detail' } }),
    }),
  });
  await assert.rejects(invoke({ model: 'test/model', prompt: 'x', stage: 'writer' }), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.requestId, 'gateway-request-1');
    assert.doesNotMatch(error.message, /never-leak-oidc|sensitive gateway detail/);
    return true;
  });
});


test('OpenAI-compatible adapter preserves reasoning budget and diagnoses empty output safely', async () => {
  let body;
  const invoke = createOpenAiCompatibleInvoker({
    apiKey: 'secret-test-value', endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    reasoning: { effort: 'low' }, maxTokensByStage: { discovery: 16000 },
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: null, reasoning: 'PRIVATE REASONING' } }], usage: { completion_tokens: 16000, completion_tokens_details: { reasoning_tokens: 16000 } } }) };
    },
  });
  const responseFormat = { type: 'json_schema', json_schema: { name: 'test', strict: true, schema: { type: 'object' } } };
  await assert.rejects(invoke({ model: 'model', prompt: 'PRIVATE PROMPT', stage: 'discovery', responseFormat }), error => {
    assert.match(error.message, /stage=discovery, finish=length, completion=16000, reasoning=16000/);
    assert.doesNotMatch(error.message, /PRIVATE|secret-test/);
    return true;
  });
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.deepEqual(body.response_format, responseFormat);
  assert.equal(body.max_tokens, 16000);
});

test('OpenAI-compatible adapter applies stage-specific reasoning controls', async () => {
  const bodies = [];
  const invoke = createOpenAiCompatibleInvoker({
    apiKey: 'gateway-key', endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    reasoning: { effort: 'low' },
    reasoningByStage: { writer: { effort: 'none' }, editor: { effort: 'none' } },
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
    },
  });
  await invoke({ model: 'model', prompt: 'x', stage: 'research' });
  await invoke({ model: 'model', prompt: 'x', stage: 'writer' });
  await invoke({ model: 'model', prompt: 'x', stage: 'editor' });
  assert.deepEqual(bodies.map(body => body.reasoning), [
    { effort: 'low' },
    { effort: 'none' },
    { effort: 'none' },
  ]);
});
