import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recoveryPlan, completedEdit } from '../src/desk/recovery.js';

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
