// A VPS worker can create drafts and read published memory. It cannot approve,
// publish or query member data. The Supabase service key stays on Vercel.
export function createWorkerStore(env=process.env,fetchImpl=fetch) {
  const token=env.EDITORIAL_WORKER_TOKEN;
  const base=env.EDITORIAL_SITE_URL || 'https://www.kkandfriends.com';
  const url=new URL(base);
  if(!token || token.length<32 || url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || !(url.hostname==='www.kkandfriends.com' || url.hostname==='kkandfriends.com' || url.hostname.endsWith('.vercel.app'))) throw new Error('Worker configuration missing or invalid');
  async function call(body) {
    const r=await fetchImpl(`${url.origin}/api/editorial-worker`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(!r.ok) throw new Error(`Worker API HTTP ${r.status}`); return r.json();
  }
  return { rpc(name,args) {
    if(name==='editorial_claim') return call({action:'claim',date:args.p_date,attempt:args.p_attempt});
    if(name==='editorial_finish') return call({action:'finish',date:args.p_date,attempt:args.p_attempt,payload:args.p_payload,detail:args.p_detail});
    throw new Error('Worker action denied');
  }, request() { return call({action:'memory'}); } };
}
