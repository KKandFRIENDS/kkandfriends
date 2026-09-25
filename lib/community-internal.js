const API_URL = process.env.COMMUNITY_API_URL || 'https://api.kkandfriends.com';

export function communityInternal(action, payload = {}) {
  const token = process.env.EDITORIAL_INTERNAL_TOKEN;
  if (!token) throw new Error('EDITORIAL_INTERNAL_TOKEN is not configured');
  return fetch(`${API_URL}/api/internal/automation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(15_000),
  }).then(async (response) => {
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Community API ${action} failed (${response.status})`);
    return json.data;
  });
}
