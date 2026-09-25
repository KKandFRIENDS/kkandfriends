export function createEditorialStore(env = process.env, fetchImpl = fetch) {
  const base = env.COMMUNITY_API_URL || 'https://api.kkandfriends.com';
  const key = env.EDITORIAL_INTERNAL_TOKEN;
  if (!key || key.length < 32 || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(base)) throw new Error('Editorial database configuration missing');
  async function call(requestBody) {
    const r = await fetchImpl(`${base}/api/internal/editorial`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(20000) });
    let payload=null;
    if(r.status!==204) { try { payload=await r.json(); } catch {} }
    if (!r.ok) {
      const detail=String(payload?.message||payload?.error||payload?.hint||'')
        .replaceAll(key,'[REDACTED]').replace(/https?:\/\/\S+/g,'[URL]').replace(/[\r\n\t]+/g,' ').slice(0,240);
      const e = new Error(`Editorial database HTTP ${r.status}${detail?`: ${detail}`:''}`); e.status = r.status; throw e;
    }
    return payload?.data;
  }
  return {
    request: (path) => call({ action: 'request', path }),
    rpc: (name, args) => call({ action: 'rpc', name, args }),
    async admin(cookie) {
      if (!cookie) return false;
      const api = env.COMMUNITY_API_URL || 'https://api.kkandfriends.com';
      if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(api)) return false;
      const r = await fetchImpl(`${api}/api/v1/session`, { headers: { cookie }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return false;
      const session = await r.json();
      return session.user?.id === (env.ADMIN_UID || '6ac6cf72-1c88-4626-9124-27a6a2792e1e');
    },
  };
}
