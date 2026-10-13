import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(ROOT, file), 'utf8');

// 2026-10-13: the owner gets a "관리자" way into the admin pages from the site
// itself. The link is a shortcut only; the API checks the owner on every call.
test('the admin hub links every admin screen and the writing screens', async () => {
  const hub = await read('admin-home.html');
  assert.match(hub, /<meta name="robots" content="noindex, nofollow">/);
  for (const href of ['/admin-members', '/admin-reports', '/admin-nominations', '/admin-analytics',
    '/write-original', '/write-desk?series=daily', '/write-desk?series=weekly', '/write', '/me', '/notifications', '/events', '/admin']) {
    assert.ok(hub.includes(`tile("${href}"`), `hub should link ${href}`);
  }
  assert.match(hub, /isAdmin\(user\)/, 'the hub must gate on the owner');
});

test('every admin screen leads back to the hub', async () => {
  for (const file of ['admin-members.html', 'admin-nominations.html', 'admin-reports.html', 'admin-analytics.html']) {
    assert.match(await read(file), /<a href="\/admin-home">관리자 홈<\/a>/, file);
  }
  assert.match(await read('me.html'), /href="\/admin-home">관리자 페이지</);
});

test('the nav link costs other visitors nothing: it only looks when an owner hint exists', async () => {
  const link = await read('js/admin-link.js');
  assert.match(link, /if \(!hasAdminHint\(\)\) return;/);
  assert.match(link, /await import\('\/js\/auth-vps\.js'\)/, 'auth is loaded lazily, and only with the hint');
  const auth = await read('js/auth-vps.js');
  assert.match(auth, /if \(owner\) setAdminHint\(true\)/);
  assert.match(auth, /setAdminHint\(false\); return client\.signOut\(\)/);
  // Reached from every public page: the shared nav script and the pages with their own menus.
  assert.match(await read('js/site-nav.js'), /import '\/js\/admin-link\.js'/);
  for (const page of ['index.html', 'thoughts.html', 'community.html', 'membership.html', 'voices.html', 'write.html']) {
    assert.match(await read(page), /<script type="module" src="\/js\/admin-link\.js"><\/script>/, page);
  }
});
