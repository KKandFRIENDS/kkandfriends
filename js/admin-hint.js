// Remembers, per browser, that the signed-in person is the site owner, so the
// "관리자" navigation link (js/admin-link.js) can show without asking the API on
// every page. A hint only: the API checks the owner on every admin request.
const KEY = 'kkf-admin-hint';

export function hasAdminHint() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setAdminHint(on) {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}
