// Chief-only "관리자" link in the site navigation.
//
// Every page's menu is static HTML, so the link is added here, and only for the
// owner. The rest of the site pays nothing: without a remembered hint nothing
// is fetched. The hint (js/admin-hint.js) is set when auth-vps.js sees the owner
// (isAdmin) and cleared when they sign out or turn out not to be the owner. The real
// permission check stays on the API; this is only a shortcut to /admin-home.
import { hasAdminHint, setAdminHint } from '/js/admin-hint.js';

export const ADMIN_HOME = '/admin-home';

function link() {
  const a = document.createElement('a');
  a.href = ADMIN_HOME;
  a.textContent = '관리자';
  a.setAttribute('data-admin-link', '');
  return a;
}

function inject() {
  if (document.querySelector('[data-admin-link]')) return;
  if (!document.getElementById('admin-link-style')) {
    const style = document.createElement('style');
    style.id = 'admin-link-style';
    style.textContent = '[data-admin-link]{color:#7AB8F5 !important;font-weight:600}';
    document.head.appendChild(style);
  }
  // Public pages: <ul class="nav-links"> or <ul class="site-nav-links">.
  document.querySelectorAll('ul.nav-links, ul.site-nav-links').forEach((ul) => {
    const li = document.createElement('li');
    li.appendChild(link());
    ul.appendChild(li);
  });
  // Member pages: <div class="nav-right">.
  document.querySelectorAll('.nav-right').forEach((box) => box.insertBefore(link(), box.firstChild));
  // Phone menus: before the join button when there is one.
  document.querySelectorAll('#nav-mobile-menu, .nav-mobile-menu, .site-nav-mobile').forEach((menu) => {
    const join = menu.querySelector('.site-nav-cta, a[href="/join"]');
    menu.insertBefore(link(), join || null);
  });
}

function remove() {
  document.querySelectorAll('[data-admin-link]').forEach((a) => {
    const li = a.parentElement;
    if (li && li.tagName === 'LI' && li.children.length === 1) li.remove(); else a.remove();
  });
}

async function verify() {
  try {
    const { currentUser, isAdmin } = await import('/js/auth-vps.js');
    const user = await currentUser();
    if (!user) return remove();             // signed out or a failed check: hide it, keep the hint
    if (!isAdmin(user)) { setAdminHint(false); remove(); }
  } catch { /* leave the link as it is */ }
}

export function mountAdminLink() {
  if (!hasAdminHint()) return;
  inject();
  verify();
}

mountAdminLink();
