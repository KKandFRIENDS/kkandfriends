import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorkerStore } from '../src/desk/worker-store.js';
import { workerFailure } from '../../api/editorial-worker.js';
import { createEditorialStore } from '../../lib/editorial-store.js';

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

test('memory request retries a nested transient database 504 and then succeeds',async()=>{
  let calls=0; const delays=[];
  const store=createWorkerStore({EDITORIAL_WORKER_TOKEN:token},async()=>{
    calls++;
    if(calls<3) return {ok:false,status:409,json:async()=>({detail:'Editorial database HTTP 504: Gateway Timeout'})};
    return {ok:true,status:200,json:async()=>([{id:'ok'}])};
  },{sleep:async ms=>delays.push(ms)});
  assert.deepEqual(await store.request(),[{id:'ok'}]);
  assert.equal(calls,3);
  assert.deepEqual(delays,[2000,10000]);
});

test('memory request retries a temporary network failure',async()=>{
  let calls=0; const delays=[];
  const store=createWorkerStore({EDITORIAL_WORKER_TOKEN:token},async()=>{
    calls++;
    if(calls===1) throw Object.assign(new Error('socket timeout'),{name:'TimeoutError'});
    return {ok:true,status:200,json:async()=>([{id:'ok'}])};
  },{sleep:async ms=>delays.push(ms)});
  assert.deepEqual(await store.request(),[{id:'ok'}]);
  assert.equal(calls,2);
  assert.deepEqual(delays,[2000]);
});

test('mutating worker action does not retry a non-transient conflict',async()=>{
  let calls=0;
  const store=createWorkerStore({EDITORIAL_WORKER_TOKEN:token},async()=>{calls++;return {ok:false,status:409,json:async()=>({detail:'Lost run lease'})};},{sleep:async()=>{throw new Error('must not sleep')}});
  await assert.rejects(store.rpc('editorial_claim',{p_date:'2026-09-12',p_attempt:'11111111-1111-4111-8111-111111111111'}),/Lost run lease/);
  assert.equal(calls,1);
});

test('worker API failure detail is bounded and removes URLs',()=>{
  const failure=workerFailure(Object.assign(new Error(`Database failed at https://private.test/${'x'.repeat(400)}`),{code:'P0001'}));
  assert.equal(failure.code,'P0001');
  assert.ok(failure.detail.length<=240);
  assert.doesNotMatch(failure.detail,/private\.test/);
});

test('database client preserves safe Supabase diagnostics without leaking its key',async()=>{
  const key='service-secret';
  const store=createEditorialStore({SUPABASE_SERVICE_ROLE_KEY:key},async()=>({
    ok:false,status:400,json:async()=>({message:`Function mismatch for ${key} at https://database.internal/rpc`})
  }));
  await assert.rejects(store.rpc('editorial_claim',{}),error=>{
    assert.match(error.message,/Editorial database HTTP 400: Function mismatch/);
    assert.doesNotMatch(error.message,/service-secret|database\.internal/);
    return true;
  });
});
