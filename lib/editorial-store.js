export function createEditorialStore(env = process.env, fetchImpl = fetch) {
  const base = env.SUPABASE_URL || 'https://pahdwduqxxiugqjkbhvq.supabase.co';
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(base)) throw new Error('Editorial database configuration missing');
  async function request(path, method = 'GET', body) {
    const r = await fetchImpl(`${base}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!r.ok) { const e = new Error(`Editorial database HTTP ${r.status}`); e.status = r.status; throw e; }
    return r.status === 204 ? null : r.json();
  }
  return {
    request,
    rpc: (name, args) => request(`rpc/${name}`, 'POST', args),
    async admin(token) {
      if (!token) return false;
      const r = await fetchImpl(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return false;
      const user = await r.json();
      return user.id === (env.ADMIN_UID || '6ac6cf72-1c88-4626-9124-27a6a2792e1e');
    },
  };
}
