// ============================================================================
//  law-watch.js — tell KK when a watched statute changes.
//
//  This is a NEW automation, so it follows the lesson in CLAUDE.md (2026-09-28):
//  a missing key or a failed read is a FAILURE with an alert, never a quiet
//  "skipped". The first run only records a baseline; after that, a changed
//  현행 version or a newly scheduled 시행예정 version sends one Telegram
//  message. State is written only after the alert went out, so a failed alert
//  is retried on the next run instead of lost.
//
//  Dependencies are injectable so the whole flow is testable without a network
//  or a filesystem.
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { redact } from './http.js';
import { fetchLawWatch, diffLawState, openlawConfigured } from './openlaw.js';

export async function sendTelegram(text, env = process.env) {
  const token = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const chat = (env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chat) return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: String(text).slice(0, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: `Telegram HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: redact(`Telegram request failed: ${String(err?.message || err)}`, [token]) };
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// { ok, baseline, changes, alerted, error? }
export async function runLawWatch({
  stateFile,
  dry = false,
  fetchWatch = fetchLawWatch,
  notify = sendTelegram,
  readState = readJson,
  writeState = writeJson,
  configured = openlawConfigured,
} = {}) {
  const fail = async (error) => {
    if (!dry) await notify(`⚠️ 법령 감시 실패\n${error}`);
    return { ok: false, error };
  };

  if (!configured()) return fail('OPENLAW_OC 환경변수가 없습니다');

  const res = await fetchWatch();
  if (!res.ok) return fail(`법령 정보를 읽지 못했습니다: ${res.error}`);

  const prev = await readState(stateFile);
  const diff = diffLawState(prev, res.statuses);
  // A law that could not be read this time keeps its previous state, so a
  // temporary outage cannot make its next successful read look like a change.
  const next = { ...(prev ?? {}), ...diff.next };

  let alerted = false;
  if (diff.changes.length && !dry) {
    const text = `📜 법령 변경 감지 (${diff.changes.length}건)\n${diff.changes.map((c) => `- ${c.text}`).join('\n')}\n확인: https://www.law.go.kr`;
    const sent = await notify(text);
    if (!sent.ok) return { ok: false, error: `변경은 감지했지만 알림을 보내지 못했습니다: ${sent.error}`, changes: diff.changes };
    alerted = true;
  }

  if (res.errors?.length && !dry) {
    await notify(`⚠️ 법령 감시 일부 실패\n${res.errors.join('\n')}`);
  }
  if (!dry) await writeState(stateFile, next);
  return { ok: true, baseline: diff.baseline, changes: diff.changes, alerted, partialErrors: res.errors ?? [] };
}
