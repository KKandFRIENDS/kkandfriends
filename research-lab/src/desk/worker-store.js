// A VPS worker can create drafts and read published memory. It cannot approve,
// publish or query member data. The Supabase service key stays on Vercel.
export function createWorkerStore(env=process.env,fetchImpl=fetch,{sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),maxAttempts=3}={}) {
  const token=env.EDITORIAL_WORKER_TOKEN;
  const base=env.EDITORIAL_SITE_URL || 'https://www.kkandfriends.com';
  const url=new URL(base);
  if(!token || token.length<32 || url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || !(url.hostname==='www.kkandfriends.com' || url.hostname==='kkandfriends.com' || url.hostname.endsWith('.vercel.app'))) throw new Error('Worker configuration missing or invalid');
  const clean=value=>String(value||'').replaceAll(token,'[REDACTED]').replace(/https?:\/\/\S+/g,'[URL]').replace(/[\r\n\t]+/g,' ').slice(0,240);
  const transient=(status,detail)=>[429,502,503,504].includes(status)||/\b(?:HTTP\s*)?(?:429|502|503|504)\b|Gateway Timeout|temporar(?:y|ily unavailable)/i.test(detail);
  async function call(body,{retryTransient=false}={}) {
    for(let attempt=1;attempt<=maxAttempts;attempt++) {
      try {
        const r=await fetchImpl(`${url.origin}/api/editorial-worker`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
        let payload=null;
        try { payload=await r.json(); } catch {}
        if(r.ok) return payload;
        const detail=clean(payload?.detail||payload?.error||'');
        if(retryTransient&&attempt<maxAttempts&&transient(r.status,detail)) { await sleep(attempt===1?2000:10000); continue; }
        throw new Error(`Worker API HTTP ${r.status}${detail?`: ${detail}`:''}`);
      } catch(error) {
        if(/^Worker API HTTP /.test(error.message)) throw error;
        if(retryTransient&&attempt<maxAttempts) { await sleep(attempt===1?2000:10000); continue; }
        throw new Error(`Worker API network failure: ${clean(error?.name||'Error')}`);
      }
    }
    throw new Error('Worker API retry limit reached');
  }
  return { rpc(name,args) {
    if(name==='editorial_claim') return call({action:'claim',date:args.p_date,attempt:args.p_attempt});
    if(name==='editorial_finish') return call({action:'finish',date:args.p_date,attempt:args.p_attempt,payload:args.p_payload,detail:args.p_detail});
    throw new Error('Worker action denied');
  }, request() { return call({action:'memory'},{retryTransient:true}); } };
}
