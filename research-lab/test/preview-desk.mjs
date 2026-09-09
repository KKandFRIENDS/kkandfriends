// Local-only UI verification against the real migration in ephemeral PostgreSQL.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeHandler } from '../../api/editorial.js';
import { makePublicHandler } from '../../api/desk.js';
import { DAILY_SECTIONS, deskFor, hashContent } from '../src/desk/core.js';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db=new PGlite();
const root=resolve(import.meta.dirname,'../..');
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec(await readFile(resolve(root,'db/migrations/015_editorial_desk.sql'),'utf8'));
const content={title:'[테스트] 금리 변화와 기업의 자금조달 비용',summary:'화면 검증용 합성 데이터입니다. 실제 시장 분석이 아닙니다.',sections:DAILY_SECTIONS.map(heading=>({heading,text:'화면과 승인 흐름을 검증하기 위한 합성 문장입니다. 실제 시장의 수치나 투자 판단을 제시하지 않습니다. '.repeat(3),sourceIds:['s1']})),relatedUrls:[]};
const payload={desk:deskFor('2026-09-07'),content,sources:[{id:'s1',title:'검증용 출처',url:'https://example.org/',publishedAt:'2026-09-07'}],evidence:[{statement:'승인 검증용 문장',quote:'합성 데이터이며 실제 금융 사실을 나타내지 않습니다.',asOf:'2026-09-07',unit:'해당 없음',sourceId:'s1'}],top5:[{id:'c1',title:'테스트 후보',score:80,reason:'화면 검증',reasons:[]}],selectedId:'c1',related:[],qa:{checks:['형식'],modelReview:{passed:true},humanReviewRequired:true}};
await db.query('select editorial_claim($1,$2)',['2026-09-07','11111111-1111-4111-8111-111111111111']);
await db.query('select editorial_finish($1,$2,$3,$4,$5)',['2026-09-07','11111111-1111-4111-8111-111111111111',payload,hashContent(content),{retrieved:34}]);
const store={admin:async token=>token==='local-preview',async request(path){
 const u=new URL(path,'https://local.test/'); const table=u.pathname.slice(1);
 if(!['editorial_drafts','editorial_runs'].includes(table)) throw new Error('Unexpected table');
 const clauses=[],args=[];
 for(const key of ['status','id'])if(u.searchParams.has(key)){args.push(u.searchParams.get(key).slice(3));clauses.push(`${key}=$${args.length}`);}
 return (await db.query(`select * from ${table}${clauses.length?' where '+clauses.join(' and '):''} order by edition_date desc`,args)).rows.map(r=>({...r,edition_date:new Date(r.edition_date).toISOString().slice(0,10)}));
},async rpc(name,args){if(name!=='editorial_transition')throw new Error('Unexpected RPC');return (await db.query('select editorial_transition($1,$2,$3,$4,$5,$6) as result',Object.values(args))).rows[0].result;}};
const admin=makeHandler({storeFactory:()=>store,env:{EDITORIAL_PUBLISH_ENABLED:'true'}}),pub=makePublicHandler({storeFactory:()=>store});
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  req.query=Object.fromEntries(url.searchParams);
  if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;req.body=JSON.parse(raw);}
  if(url.pathname==='/api/editorial')return await admin(req,res);
  if(url.pathname==='/api/desk')return await pub(req,res);
  if(url.pathname==='/js/auth.js'){res.setHeader('Content-Type','application/javascript');return res.end('export const getClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:"local-preview"}}})}});export const signInWithGoogle=()=>{};');}
  if(!/^\/(admin-editorial|desk|thoughts)(\.html)?$|^\/editorial\.css$|^\/js\/(editorial-admin|desk)\.js$/.test(url.pathname)){res.statusCode=404;return res.end();}
  const path=resolve(root,'.'+url.pathname+(extname(url.pathname)?'':'.html'));
  res.setHeader('Content-Type',extname(path)==='.css'?'text/css':extname(path)==='.js'?'application/javascript':'text/html;charset=utf-8');
  res.end(await readFile(path));
 }catch{res.statusCode=500;res.end('Preview error');}
}).listen(8765,'127.0.0.1',()=>console.log('LOCAL SYNTHETIC PREVIEW http://127.0.0.1:8765/admin-editorial'));
