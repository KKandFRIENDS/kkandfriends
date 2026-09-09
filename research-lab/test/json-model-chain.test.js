import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../src/json.js';
import { callModelChain, ModelChainError } from '../src/model-chain.js';

test('extractJson handles raw, fenced, and surrounding prose', () => {
  assert.deepEqual(extractJson('{"ok":true}'), { ok: true });
  assert.deepEqual(extractJson('```json\n{"ok":true}\n```'), { ok: true });
  assert.deepEqual(extractJson('prefix {"text":"brace } inside", "ok":true} suffix'), {
    text: 'brace } inside',
    ok: true,
  });
});

test('model chain falls back after invalid JSON', async () => {
  const calls = [];
  const result = await callModelChain({
    models: ['model-a', 'model-b'],
    prompt: 'prompt',
    invoke: async ({ model }) => {
      calls.push(model);
      return model === 'model-a' ? 'not json' : '{"ok":true}';
    },
  });
  assert.equal(result.model, 'model-b');
  assert.deepEqual(calls, ['model-a', 'model-b']);
  assert.equal(result.attempts.length, 1);
});

test('model chain reports every failed attempt without leaking response bodies', async () => {
  await assert.rejects(
    callModelChain({
      models: ['a', 'b'],
      prompt: 'prompt',
      invoke: async () => {
        throw new Error('provider unavailable');
      },
    }),
    (error) => error instanceof ModelChainError && error.attempts.length === 2,
  );
});
