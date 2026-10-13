// Shared file attachment helpers for every writing screen (/write, /write-desk,
// /write-original). Images go inline; documents become a 📎 download link.
// The VPS API (server/src/routes/uploads.js) re-checks type and size.
import { communityApi } from '/js/vps-api.js';

const IMAGES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const DOCUMENTS = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  hwp: 'application/x-hwp', hwpx: 'application/hwp+zip',
};
export const IMAGE_LIMIT = 5 * 1024 * 1024;
export const FILE_LIMIT = 20 * 1024 * 1024;
export const ATTACH_ACCEPT = [...Object.keys(DOCUMENTS), ...Object.keys(IMAGES)].map((ext) => `.${ext}`).join(',');
export const ATTACH_HELP = 'PDF·워드·엑셀·파워포인트·한글(HWP) 20MB, 이미지 5MB까지';

// Windows often reports Office/HWP files with an empty or vendor-specific
// type, so the extension decides; pasted screenshots fall back to file.type.
export function attachmentType(file) {
  const ext = String(file?.name || '').toLowerCase().split('.').pop();
  if (DOCUMENTS[ext]) return { kind: 'file', contentType: DOCUMENTS[ext] };
  if (IMAGES[ext]) return { kind: 'image', contentType: IMAGES[ext] };
  if (Object.values(IMAGES).includes(file?.type)) return { kind: 'image', contentType: file.type };
  return null;
}

export function formatSize(bytes) {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** Upload one file. Resolves to { kind, url, name, size } or throws a Korean message. */
export async function uploadAttachment(file) {
  const type = attachmentType(file);
  if (!type) throw new Error(`지원하지 않는 파일입니다. ${ATTACH_HELP}.`);
  const limit = type.kind === 'image' ? IMAGE_LIMIT : FILE_LIMIT;
  if (file.size > limit) throw new Error(`${type.kind === 'image' ? '이미지는 5MB' : '파일은 20MB'} 이하만 올릴 수 있습니다.`);
  const data = await communityApi.upload(file, { contentType: type.contentType, name: file.name });
  return { kind: data.kind || type.kind, url: data.url, name: data.name || file.name || '첨부 파일', size: data.size || file.size };
}

/** Markdown for the body: an inline image, or a 📎 link with name and size. */
export function attachmentMarkdown(item) {
  if (item.kind === 'image') return `![이미지](${item.url})`;
  const label = String(item.name).replace(/[[\]]/g, '');
  return `[📎 ${label}${item.size ? ` (${formatSize(item.size)})` : ''}](${item.url})`;
}
