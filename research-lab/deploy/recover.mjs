import { readFile, readdir, rename, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dateKey } from '../src/desk/core.js';
import { DESK_STAGES, recoveryPlan, completedEdit } from '../src/desk/recovery.js';
import { sendTelegramNotification } from '../src/desk/notify.js';

Object.assign(process.env, JSON.parse(await readFile('/run/desk-env.json', 'utf8')));
const date = dateKey();
const root = resolve(process.env.DESK_STATE_DIR || '/state', date);
const file = name => resolve(root, `${name}.json`);
const read = async name => JSON.parse(await readFile(file(name), 'utf8'));
async function save(name, value) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = file(`${name}.${randomUUID()}`);
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, file(name));
}
async function run(stage) {
  return new Promise(resolveRun => {
    const child = spawn(process.execPath, ['/app/research-lab/deploy/launch.mjs', stage], {
      env: { ...process.env, DESK_NOTIFY_FAILURE: 'false' }, stdio: 'inherit',
    });
    child.on('exit', code => resolveRun(code ?? 1));
    child.on('error', () => resolveRun(1));
  });
}
async function retryDelivery() {
  let edit;
  try { edit = await read('edit'); } catch { return false; }
  if (completedEdit(edit)) return true;
  if (edit?.review?.passed !== true) return false;
  const [ranked, written] = await Promise.all([read('rank'), read('write')]);
  const notification = await sendTelegramNotification({ title: `[KK EDITORIAL DESK] ${ranked.desk.label}`, text: `${written.content.title}\n\n후보 선정과 초안 검수가 끝났습니다.\nhttps://www.kkandfriends.com/admin-editorial` });
  await save('edit', { ...edit, notified: notification.ok, notification, deliveryRetriedAt: new Date().toISOString() });
  return notification.ok;
}

let existing = [];
try { existing = (await readdir(root)).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)); } catch {}
for (const stage of recoveryPlan(existing)) {
  if (await run(stage) !== 0) break;
}
const ok = await retryDelivery();
let missing = [];
try { const names = new Set((await readdir(root)).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5))); missing = DESK_STAGES.filter(stage => !names.has(stage)); } catch { missing = [...DESK_STAGES]; }
if (ok && missing.length === 0) {
  await save('final', { status: 'ready', checkedAt: new Date().toISOString() });
  console.log(JSON.stringify({ date, stage: 'recovery', status: 'ready' }));
} else {
  let prior = null;
  try { prior = await read('final'); } catch {}
  const detail = `완료되지 않은 단계: ${missing.length ? missing.join(', ') : 'telegram'}\n\n관리 화면: https://www.kkandfriends.com/admin-editorial`;
  const notification = prior?.status === 'failed' && prior?.notified === true
    ? { ok: true, reason: 'already_notified' }
    : await sendTelegramNotification({ title: '[KK EDITORIAL DESK] 자동 복구 실패', text: detail });
  await save('final', { status: 'failed', missing, notified: notification.ok, notification, checkedAt: new Date().toISOString() });
  console.error(JSON.stringify({ date, stage: 'recovery', status: 'failed', missing, notified: notification.ok }));
  process.exitCode = 1;
}
