import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recoveryPlan, completedEdit } from '../src/desk/recovery.js';
import { candidateQueue, candidateFailure, boundedFailure } from '../src/desk/fallback.js';

test('recovery resumes at the first missing checkpoint',()=>{
  assert.deepEqual(recoveryPlan([]),['scan','rank','research','write','edit']);
  assert.deepEqual(recoveryPlan(['scan','rank']),['research','write','edit']);
  assert.deepEqual(recoveryPlan(['scan','rank','research','write','edit']),[]);
});

test('final completion requires both editor approval and Telegram delivery',()=>{
  assert.equal(completedEdit({review:{passed:true},notified:true}),true);
  assert.equal(completedEdit({review:{passed:true},notified:false}),false);
  assert.equal(completedEdit({review:{passed:false},notified:true}),false);
});

test('production cron defers stage alerts and schedules one recovery pass',async()=>{
  const cron=await readFile(new URL('../deploy/desk.cron',import.meta.url),'utf8');
  const stageLines=cron.split('\n').filter(line=>/launch\.mjs (scan|rank|research|write|edit)/.test(line));
  assert.equal(stageLines.length,5);
  assert.ok(stageLines.every(line=>line.includes('DESK_NOTIFY_FAILURE=false')));
  assert.match(cron,/^10 23 \* \* \* root .*recover\.mjs/m);
});

test('editorial fallback tries the selected candidate followed by eligible alternatives',()=>{
  const ranked={desk:{id:'macro'},selected:{id:'c1'},top5:[
    {id:'c2',reasons:[],sourceIds:['s2']},
    {id:'c1',reasons:[],sourceIds:['s1']},
    {id:'blocked',reasons:['원자료 없음'],sourceIds:['s3']},
    {id:'c3',reasons:[],sourceIds:['s3']},
    {id:'c4',reasons:[],sourceIds:['s4']},
  ]};
  assert.deepEqual(candidateQueue({ranked,sources:[]}).map(candidate=>candidate.id),['c1','c2','c3']);
});

test('Friday fallback keeps only candidates backed by observed news momentum',()=>{
  const ranked={desk:{id:'signals'},selected:{id:'c1'},top5:[
    {id:'c1',reasons:[],sourceIds:['primary']},
    {id:'c2',reasons:[],sourceIds:['primary','signal']},
  ]};
  const sources=[{id:'primary'},{id:'signal',signalKind:'news-momentum'}];
  assert.deepEqual(candidateQueue({ranked,sources}).map(candidate=>candidate.id),['c2']);
});

test('fallback accepts editorial defects but stops on infrastructure failures',()=>{
  assert.equal(candidateFailure(Object.assign(new Error('review failed'),{issues:['typo']})),true);
  assert.equal(candidateFailure(new Error('Body length 700; expected 800')),true);
  assert.equal(candidateFailure(new Error('Worker API HTTP 504')),false);
  const failure=boundedFailure({id:'candidate'},new Error(`Bad source https://private.test/${'x'.repeat(500)}`));
  assert.equal(failure.candidateId,'candidate');
  assert.ok(failure.reason.length<=300);
  assert.doesNotMatch(failure.reason,/private\.test/);
});
