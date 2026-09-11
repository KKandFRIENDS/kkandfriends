import { timingSafeEqual } from 'node:crypto';
import { createEditorialStore } from '../lib/editorial-store.js';
import { dateKey, hashContent, validateContent, deskFor } from '../research-lab/src/desk/core.js';
function same(a,b) { return typeof a === 'string' && typeof b === 'string' && a.length >= 32 && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b)); }
export function workerFailure(error) {
  return {
    error:'Run validation or database operation failed',
    code:String(error?.code||error?.name||'Error').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)||'Error',
    detail:String(error?.message||'Unknown worker failure').replace(/https?:\/\/\S+/g,'[URL]').replace(/[\r\n\t]+/g,' ').slice(0,240)
  };
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if(!same((req.headers.authorization||'').replace(/^Bearer\s+/i,''),process.env.EDITORIAL_WORKER_TOKEN)) return res.status(403).json({error:'Forbidden'});
  try {
    const b=typeof req.body === 'string'?JSON.parse(req.body):req.body;
    const store=createEditorialStore();
    if(b.action==='memory') {
      const since = new Date(); since.setUTCDate(since.getUTCDate()-56);
      const rows=await store.request(`editorial_drafts?status=eq.published&edition_date=gte.${dateKey(since)}&select=id,edition_date,payload&order=edition_date.desc&limit=56`);
      return res.status(200).json(rows.map(r=>({id:r.id,edition_date:r.edition_date,payload:{desk:r.payload.desk,content:r.payload.content}})));
    }
    if(b.date!==dateKey() || !/^[a-f0-9-]{36}$/.test(b.attempt||'')) return res.status(400).json({error:'Invalid run'});
    if(b.action==='claim') return res.status(200).json(await store.rpc('editorial_claim',{p_date:b.date,p_attempt:b.attempt}));
    if(b.action==='finish') {
      if(b.payload) {
        validateContent(b.payload.content,{date:b.date,sources:b.payload.sources,related:b.payload.related});
        if(JSON.stringify(b.payload).length>500000 || b.payload.qa?.modelReview?.passed!==true || !Array.isArray(b.payload.evidence) || b.payload.evidence.length<2) throw new Error('Invalid payload');
        b.payload.desk=deskFor(b.date);
      }
      return res.status(200).json(await store.rpc('editorial_finish',{p_date:b.date,p_attempt:b.attempt,p_payload:b.payload||null,p_hash:b.payload?hashContent(b.payload.content):null,p_detail:b.detail||{}}));
    }
    return res.status(400).json({error:'Invalid action'});
  }catch(error){
    const failure=workerFailure(error);
    console.error(JSON.stringify({route:'editorial-worker',action:req.body?.action||null,code:failure.code,detail:failure.detail}));
    return res.status(409).json(failure);
  }
}
