import { API_URL } from '/config.js';

export class ApiError extends Error {
  constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status; }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  let body = options.body;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || (body === undefined ? 'GET' : 'POST'),
    headers, body, credentials: 'include', cache: 'no-store',
  });
  if (!response.ok) {
    let detail = null;
    try { detail = await response.json(); } catch { /* no body */ }
    throw new ApiError(detail?.error || `Request failed (${response.status})`, response.status);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const communityApi = {
  unsubscribe: (token) => api('/api/v1/unsubscribe', { method: 'POST', body: { token } }),
  profile: () => api('/api/v1/profile'),
  updateProfile: (body) => api('/api/v1/profile', { method: 'PATCH', body }),
  members: (ids = []) => api(`/api/v1/members${ids.length ? `?ids=${encodeURIComponent(ids.join(','))}` : ''}`),
  posts: ({ mine = false, authorId = '' } = {}) => api(`/api/v1/posts?${new URLSearchParams({
    ...(mine ? { mine: 'true' } : {}), ...(authorId ? { authorId } : {}),
  })}`),
  post: (id) => api(`/api/v1/posts/${encodeURIComponent(id)}`),
  createPost: (body) => api('/api/v1/posts', { method: 'POST', body }),
  updatePost: (id, body) => api(`/api/v1/posts/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  removePost: (id) => api(`/api/v1/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  moderatePost: (id, isHidden) => api(`/api/v1/admin/posts/${encodeURIComponent(id)}/moderation`, { method: 'PATCH', body: { isHidden } }),
  adminMembers: (status = '') => api(`/api/v1/admin/members${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateMember: (id, body) => api(`/api/v1/admin/members/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  adminReports: () => api('/api/v1/admin/reports'),
  updateReport: (id, status) => api(`/api/v1/admin/reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } }),
  adminNominations: () => api('/api/v1/admin/nominations'),
  updateNomination: (id, body) => api(`/api/v1/admin/nominations/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  removeNomination: (id) => api(`/api/v1/admin/nominations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminAnalytics: () => api('/api/v1/admin/analytics'),
  report: (targetType, targetId, reason) => api('/api/v1/reports', { method: 'POST', body: { targetType, targetId, reason } }),
  notifications: () => api('/api/v1/notifications'),
  readNotifications: (ids) => api('/api/v1/notifications/read', { method: 'PATCH', body: { ids } }),
  events: () => api('/api/v1/events'),
  createEvent: (body) => api('/api/v1/events', { method: 'POST', body }),
  updateEvent: (id, body) => api(`/api/v1/events/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  removeEvent: (id) => api(`/api/v1/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  rsvp: (id, going) => api(`/api/v1/events/${encodeURIComponent(id)}/rsvp`, { method: going ? 'PUT' : 'DELETE' }),
  nominations: () => api('/api/v1/nominations'),
  nominate: (body) => api('/api/v1/nominations', { method: 'POST', body }),
  discussion: (slug) => api(`/api/v1/discussions/${encodeURIComponent(slug)}`),
  addComment: (slug, body, parentId = null) => api(`/api/v1/discussions/${encodeURIComponent(slug)}/comments`, { method: 'POST', body: { body, parentId } }),
  removeComment: (id) => api(`/api/v1/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  moderateComment: (id, isHidden) => api(`/api/v1/admin/comments/${encodeURIComponent(id)}/moderation`, { method: 'PATCH', body: { isHidden } }),
  likePost: (slug, liked) => api(`/api/v1/discussions/${encodeURIComponent(slug)}/like`, { method: liked ? 'PUT' : 'DELETE' }),
  likeComment: (id, liked) => api(`/api/v1/comments/${encodeURIComponent(id)}/like`, { method: liked ? 'PUT' : 'DELETE' }),
  originalPosts: () => api('/api/v1/original?includeDrafts=true'),
  createOriginal: (body) => api('/api/v1/original', { method: 'POST', body }),
  updateOriginal: (id, body) => api(`/api/v1/original/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  upload: async (file) => api('/api/v1/uploads', {
    method: 'POST', headers: { 'Content-Type': file.type }, body: file,
  }),
};
