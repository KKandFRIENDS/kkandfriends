// Shows a "수정" link on a published KK ORIGINAL page, for the Chief only.
// Readers never see it. The API server still enforces admin on every write;
// this link is a convenience, not a permission.
import { currentUser, isAdmin } from '/js/auth-vps.js';

const slot = document.querySelector('[data-original-edit]');
if (slot) {
  currentUser().then(user => {
    if (!isAdmin(user)) return;
    const link = document.createElement('a');
    link.className = 'edit-link';
    link.href = `/write-original?slug=${encodeURIComponent(slot.dataset.originalEdit)}`;
    link.textContent = '✏️ 이 글 수정';
    slot.append(link);
  }).catch(() => {});
}
