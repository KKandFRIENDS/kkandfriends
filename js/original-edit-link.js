// Shows a "수정" link on a published KK ORIGINAL or KK Daily/Weekly page, for
// the Chief only. Readers never see it. The API server still enforces admin on
// every write; this link is a convenience, not a permission.
import { currentUser, isAdmin } from '/js/auth-vps.js';

const slots = [
  ...[...document.querySelectorAll('[data-original-edit]')].map(slot => [slot, `/write-original?slug=${encodeURIComponent(slot.dataset.originalEdit)}`]),
  ...[...document.querySelectorAll('[data-desk-edit]')].map(slot => [slot, `/write-desk?id=${encodeURIComponent(slot.dataset.deskEdit)}`]),
];
if (slots.length) {
  currentUser().then(user => {
    if (!isAdmin(user)) return;
    for (const [slot, href] of slots) {
      const link = document.createElement('a');
      link.className = 'edit-link';
      link.href = href;
      link.textContent = '✏️ 이 글 수정';
      slot.append(link);
    }
  }).catch(() => {});
}
