import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('core lounge screens no longer call Supabase directly', async () => {
  for (const file of ['join.html','voices.html','write.html','members.html','me.html','events.html','notifications.html','nominate.html',
    'admin-members.html','admin-reports.html','admin-nominations.html','admin-analytics.html','unsubscribe.html','index.html',
    'blog/discussion.js','js/original-editor.js','js/editorial-admin.js']) {
    const text = await source(file);
    assert.doesNotMatch(text, /supabase|getClient\(|\.from\(|\.storage\./i, file);
    assert.match(text, /vps-api|auth-vps/, file);
  }
});

test('VPS backend includes auth and application schemas plus guarded migration tools', async () => {
  const [auth, app, exporter, importer] = await Promise.all([
    source('server/db/000_auth_schema.sql'), source('server/db/001_app_schema.sql'),
    source('server/scripts/export-supabase.mjs'), source('server/scripts/import-to-vps.mjs'),
  ]);
  assert.match(auth, /create table if not exists "user"/);
  assert.match(app, /create table if not exists profiles/);
  assert.match(exporter, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(importer, /begin[\s\S]*Reconciliation failed[\s\S]*commit[\s\S]*rollback/);
  assert.match(importer, /COPYFILE_EXCL/);
  assert.doesNotMatch(exporter + importer, /eyJ[a-zA-Z0-9_-]+\./, 'no credential may be embedded');
});

test('social sign-in uses an explicit browser redirect', async () => {
  const [authClient, serverAuth, join] = await Promise.all([
    source('js/auth-vps.js'), source('server/src/auth.js'), source('join.html'),
  ]);
  assert.match(authClient, /disableRedirect:\s*true/);
  assert.match(authClient, /errorCallbackURL/);
  assert.match(authClient, /location\.assign\(result\.data\.url\)/);
  assert.match(authClient, /new URL\(redirectTo .* location\.origin\)\.href/);
  assert.match(serverAuth, /storeStateStrategy:\s*'cookie'/);
  assert.doesNotMatch(serverAuth, /skipStateCookieCheck:\s*true/);
  assert.match(join, /로그인 시간이 만료되었거나 이미 사용된 요청입니다/);
});

test('production cron jobs use only the VPS internal API for community storage', async () => {
  for (const file of ['api/cron/digest.js', 'api/cron/daily-brief.js', 'api/cron/korea-close.js']) {
    const text = await source(file);
    assert.match(text, /communityInternal/);
    assert.doesNotMatch(text, /SUPABASE|supabase\(|\/rest\/v1\//i, file);
  }
});

test('legacy Vercel notification endpoints no longer depend on Supabase', async () => {
  for (const file of ['api/notify-application.js', 'api/notify-approval.js']) {
    const text = await source(file);
    assert.match(text, /status\(410\)/, `${file} must fail safely for old callers`);
    assert.doesNotMatch(text, /supabase|service_role|\/rest\/v1|\/auth\/v1/i, file);
  }
});

test('member and owner writing entry points stay visible in their intended screens', async () => {
  const [profile, lounge] = await Promise.all([source('me.html'), source('voices.html')]);
  assert.match(profile, /isAdmin\(user\)[\s\S]*href="\/write-original"/);
  assert.match(profile, /status === "approved"[\s\S]*href="\/write"/);
  assert.match(lounge, /href="\/write">＋ 글쓰기<\/a>/);
});
