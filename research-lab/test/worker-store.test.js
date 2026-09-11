import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorkerStore } from '../src/desk/worker-store.js';
import { workerFailure } from '../../api/editorial-worker.js';

const token='a'.repeat(32);

test('cron environment snapshot preserves Telegram delivery configuration',async()=>{
  const source=await readFile(new URL('../deploy/save-env.mjs',import.meta.url),'utf8');
  assert.match(source,/TELEGRAM_BOT_TOKEN/);
  assert.match(source,/TELEGRAM_CHANNEL_ID/);
  assert.match(source,/TELEGRAM_CHAT_ID/);
});

test('worker client reports bounded authenticated API detail without leaking credentials',async()=>{
  const store=createWorkerStore({EDITORIAL_WORKER_TOKEN:token},async()=>({
    ok:false,status:409,json:async()=>({error:'Run failed',detail:`Lost run lease ${token} at https://private.test/path`})
  }));
  await assert.rejects(store.rpc('editorial_claim',{p_date:'2026-09-12',p_attempt:'11111111-1111-4111-8111-111111111111'}),error=>{
    assert.match(error.message,/Worker API HTTP 409: Lost run lease/);
    assert.doesNotMatch(error.message,new RegExp(token));
    assert.doesNotMatch(error.message,/private\.test/);
    return true;
  });
});

test('worker API failure detail is bounded and removes URLs',()=>{
  const failure=workerFailure(Object.assign(new Error(`Database failed at https://private.test/${'x'.repeat(400)}`),{code:'P0001'}));
  assert.equal(failure.code,'P0001');
  assert.ok(failure.detail.length<=240);
  assert.doesNotMatch(failure.detail,/private\.test/);
});
