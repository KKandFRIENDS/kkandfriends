import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dateKey } from '../src/desk/core.js';
import { weeklyReadiness } from '../src/desk/weekly-readiness.js';
import { createWorkerStore } from '../src/desk/worker-store.js';
import { sendTelegramNotification } from '../src/desk/notify.js';

Object.assign(process.env, JSON.parse(await readFile('/run/desk-env.json', 'utf8')));
const date = dateKey();
const stateRoot = resolve(process.env.DESK_STATE_DIR || '/state', date);
const statePath = resolve(stateRoot, 'weekly-readiness.json');
let prior = null;
try { prior = JSON.parse(await readFile(statePath, 'utf8')); } catch {}
if (prior?.notified === true) {
  console.log(JSON.stringify({ date, stage: 'weekly-readiness', status: 'already_notified' }));
  process.exit(0);
}
const rows = await createWorkerStore().request();
const readiness = weeklyReadiness(date, rows);
let notification = { ok: true, reason: 'ready' };
if (!readiness.ready) {
  notification = await sendTelegramNotification({
    title: '[KK EDITORIAL DESK] KK WEEKLY 사전 점검',
    text: `이번 주 발행 글은 ${readiness.count}개입니다. 일요일 KK WEEKLY에는 최소 ${readiness.minimum}개가 필요합니다. 토요일 안에 ${readiness.missing}개를 추가로 검토·발행해 주세요.\n\n관리 화면: https://www.kkandfriends.com/admin-editorial`,
  });
}
await mkdir(stateRoot, { recursive: true, mode: 0o700 });
const temporary = `${statePath}.${randomUUID()}`;
await writeFile(temporary, JSON.stringify({ ...readiness, published: readiness.published.map(row => row.id), notified: !readiness.ready && notification.ok, notification, checkedAt: new Date().toISOString() }), { mode: 0o600 });
await rename(temporary, statePath);
console.log(JSON.stringify({ date, stage: 'weekly-readiness', status: readiness.ready ? 'ready' : 'warning', count: readiness.count, notified: notification.ok }));
if (!readiness.ready && !notification.ok) process.exitCode = 1;
