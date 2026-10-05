import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, deskFor, rankCandidates, validateEvidence, validateContent, hashContent, DAILY_SECTIONS, publicArticle } from '../src/desk/core.js';
import { generateDesk } from '../src/desk/pipeline.js';
import { editorialFocus, rankDesk, repairDesk, validateDeskFocus, writeDesk, humanizeDesk, factTokens, loadHumanizerSkill } from '../src/desk/stages.js';
import { readSource } from '../src/desk/collector.js';
import { notifyTelegram, sendTelegramNotification, draftReadyMessage } from '../src/desk/notify.js';
import { collectXSignals } from '../src/desk/x-signals.js';
import { collectGoogleNewsSignals } from '../src/desk/google-news-signals.js';
import { collectRedditSignals } from '../src/desk/reddit-signals.js';
import { parseFscList } from '../src/desk/official-page-signals.js';
import { makeHandler } from '../../api/editorial.js';

const sources = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, title: `Source ${i}`, url: `https://source${i}.test/article`, type: i === 0 ? 'primary' : 'secondary', excerpt: 'Verified original evidence with a reporting date and a unit. '.repeat(5), publishedAt: '2026-09-07T00:00:00Z' }));
const candidate = { id: 'c1', title: '금리와 자금조달 비용', reason: '가격과 실물의 차이를 확인한다.', scores: { impact: 8, structural: 8, surprise: 8, relevance: 8 }, sourceIds: ['s0','s1'], sourceSupport: [{ sourceId: 's0', support: '원자료가 논제를 직접 뒷받침한다' }, { sourceId: 's1', support: '독립 보도가 같은 논제를 확인한다' }], duplicateOf: null, conflict: 'clear' };
const claims = [0,1].map(i => ({ statement: '합성 검증 문장', sourceId: `s${i}`, quote: 'Verified original evidence with a reporting date and a unit.', asOf: '2026-09-07', unit: 'not applicable' }));
const content = { title: '합성 테스트: 금리와 자금조달 비용', summary: '실제 시장 분석이 아닌 검증용 데이터', sections: DAILY_SECTIONS.map(heading => ({ heading, text: '검증용 합성 문장입니다. 실제 투자 판단이나 시장 수치를 포함하지 않습니다. '.repeat(4), sourceIds: ['s0'] })), relatedUrls: [] };
const sentence = '검증용 합성 문장입니다. 실제 투자 판단이나 시장 수치를 포함하지 않습니다. ';
const draft = { title: content.title, summary: content.summary, body: sentence.repeat(18).trim(), sourceIds: ['s0'], relatedUrls: [] };
const polished = { title: draft.title, summary: draft.summary, body: draft.body };
const freeContent = { format: 'free', title: draft.title, summary: draft.summary, sections: [{ heading: '', text: draft.body, sourceIds: ['s0'] }], relatedUrls: [] };
test('KST date switches at UTC 15:00 and all seven desks map correctly', () => {
  assert.equal(dateKey(new Date('2026-09-06T15:00:00Z')), '2026-09-07');
  assert.equal(dateKey(new Date('2026-09-06T14:59:59Z')), '2026-09-06');
  assert.deepEqual(Array.from({length:7},(_,i)=>deskFor(`2026-09-${String(7+i).padStart(2,'0')}`).id), ['macro','markets','bitcoin','ai','signals','korea','weekly']);
  assert.throws(()=>deskFor('2026-02-30'));
});
test('AI Thursday is judged on AI merit without a manufactured finance angle', () => {
  const focus = editorialFocus(deskFor('2026-09-10'));
  assert.match(focus, /Financial-market relevance is NOT required/);
  assert.match(focus, /Do not manufacture a link to finance/);
  assert.match(focus, /same thesis/);
});
test('ranking rejects invented citations and fails closed on duplicates, conflicts and missing independent evidence', () => {
  assert.equal(rankCandidates([candidate], sources)[0].score, 80);
  assert.throws(()=>rankCandidates([{...candidate, sourceIds:['s0','fake']}], sources));
  assert.ok(rankCandidates([{...candidate, duplicateOf:'/posts/a'}], sources)[0].reasons.length);
  assert.ok(rankCandidates([{...candidate, conflict:'review'}], sources)[0].reasons.length);
  assert.ok(rankCandidates([{...candidate, sourceIds:['s0','s0']}], sources)[0].reasons.length);
});
test('evidence quotes must occur in downloaded source, not model output', () => {
  assert.equal(validateEvidence(claims, sources).length, 2);
  assert.throws(()=>validateEvidence([{...claims[0], quote:'This claim was never retrieved.'}, claims[1]], sources));
  const momentum = { ...sources[1], signalKind: 'news-momentum' };
  assert.throws(()=>validateEvidence([claims[0], {...claims[1], sourceId:momentum.id}], [sources[0], momentum]), /Discovery signal/);
});
test('content enforces length, provenance, sections, related URLs and hash changes', () => {
  assert.ok(validateContent(content, { sources, date:'2026-09-07' }).characters >= 800);
  assert.throws(()=>validateContent({...content, relatedUrls:['https://invented.test']},{sources,date:'2026-09-07'}));
  assert.throws(()=>validateContent({...content, sections:[]},{sources,date:'2026-09-07'}));
  assert.notEqual(hashContent(content), hashContent({...content,title:'수정'}));
  assert.equal(hashContent(content), hashContent(Object.fromEntries(Object.entries(content).reverse())));
});
test('writer gets a second bounded length repair before the stage fails',async()=>{
  const overlong={...draft,body:'길이 보정이 필요한 검증 문장입니다. '.repeat(60).trim()};
  const writerCalls=[];
  const result=await writeDesk({
    date:'2026-09-07',desk:deskFor('2026-09-07'),selected:candidate,
    selectedSources:sources.slice(0,2),dossier:{claims,counterargument:'반론',watchItem:'관찰'},
    invoke:async({stage,prompt})=>{ if(stage==='writer'){writerCalls.push(prompt);return JSON.stringify(overlong);} return JSON.stringify(polished); },model:'test',
  });
  assert.equal(writerCalls.length,3);
  assert.equal(result.content.format,'free');
  assert.ok(result.qa.characters<=1000);
  assert.match(result.content.sections[0].text.trim(),/[.!?]$/);
});
test('free drafts use the /write-desk length band and one untitled body',()=>{
  assert.equal(validateContent(freeContent,{sources,date:'2026-09-07'}).characters,[...draft.body].length);
  assert.throws(()=>validateContent({...freeContent,sections:[{...freeContent.sections[0],text:'짧다.'}]},{sources,date:'2026-09-07'}),/Body length/);
  assert.throws(()=>validateContent({...freeContent,sections:[{...freeContent.sections[0],heading:'핵심 판단'}]},{sources,date:'2026-09-07'}),/Section structure/);
  assert.throws(()=>validateContent({...freeContent,sections:[{...freeContent.sections[0],text:`${draft.body} https://x.test`}]},{sources,date:'2026-09-07'}),/plain text/);
});
test('daily generation follows all stages and fails on model audit', async () => {
  const stages=[];
  const invoke=async ({stage}) => { stages.push(stage); return JSON.stringify({ discovery:{candidates:[candidate]}, research:{claims,counterargument:'반론',watchItem:'관찰'}, writer:draft, humanizer:polished, editor:{passed:true,issues:[]} }[stage]); };
  const result=await generateDesk({date:'2026-09-07',sources,invoke,models:{}});
  assert.deepEqual(stages,['discovery','research','writer','humanizer','editor']);
  assert.equal(result.qa.humanizer.applied,true);
  assert.equal(result.qa.humanReviewRequired,true);
  assert.equal(result.sources[0].excerpt,undefined);
  await assert.rejects(generateDesk({date:'2026-09-07',sources,models:{},invoke:async args => args.stage==='editor'?JSON.stringify({passed:false,issues:['Unsupported fact']}):invoke(args)}), /review failed/);
});
test('Friday without observable news momentum and Sunday without published memory stop', async()=>{
  await assert.rejects(generateDesk({date:'2026-09-11',sources,models:{},invoke:async()=>JSON.stringify({candidates:[candidate]})}),/Friday/);
  await assert.rejects(generateDesk({date:'2026-09-13',sources,memory:[],models:{}}),/published editions/);
});
test('Friday accepts observed Google News momentum only alongside primary evidence', async()=>{
  const fridaySources=sources.map((source,index)=>index===1?{...source,signalKind:'news-momentum',excerpt:'MOMENTUM_ONLY discovery indicator that must not enter the factual quote bank.'}:source);
  const fridayCandidate={...candidate,title:'비트코인 뉴스 보도 모멘텀',reason:'Google News 헤드라인 보도량과 언론 확산을 측정한다.',sourceIds:['s0','s1','s2'],sourceSupport:['s0','s1','s2'].map(sourceId=>({sourceId,support:'같은 논제를 직접 뒷받침한다'}))};
  const fridayClaims=[claims[0],{...claims[1],sourceId:'s2'}];
  const invoke=async({stage,prompt})=>{
    if(stage==='research') assert.doesNotMatch(prompt,/MOMENTUM_ONLY/);
    return JSON.stringify({discovery:{candidates:[fridayCandidate]},research:{claims:fridayClaims,counterargument:'반론',watchItem:'관찰'},writer:draft,humanizer:fridayContent,editor:{passed:true,issues:[]}}[stage]);
  };
  const fridayContent={...draft,title:'비트코인 뉴스 보도 모멘텀의 확산',summary:'Google News 헤드라인과 언론 보도량을 확인하는 검증용 데이터'};
  const result=await generateDesk({date:'2026-09-11',sources:fridaySources,invoke:async args=>args.stage==='writer'?JSON.stringify(fridayContent):invoke(args),models:{}});
  assert.equal(result.desk.id,'signals');
  assert.ok(result.sources.some(source=>source.signalKind==='news-momentum'));
});
test('Friday title and summary must explicitly frame media coverage momentum',()=>{
  const desk=deskFor('2026-09-11');
  assert.equal(validateDeskFocus(desk,{title:'AI 뉴스 보도 모멘텀',summary:'언론 헤드라인의 확산을 측정한다'}),true);
  assert.throws(()=>validateDeskFocus(desk,{title:'AI 인프라 확장',summary:'데이터센터 투자를 분석한다'}),/Friday draft/);
});
test('Google News collector ranks observed coverage and labels it as discovery evidence', async()=>{
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Bitcoin liquidity shifts after policy update - Reuters</title><link>https://news.google.com/rss/articles/a</link><pubDate>Thu, 10 Sep 2026 00:00:00 GMT</pubDate><description>One</description></item>
    <item><title>Bitcoin liquidity shifts as policy changes - Financial Times</title><link>https://news.google.com/rss/articles/b</link><pubDate>Thu, 10 Sep 2026 01:00:00 GMT</pubDate><description>Two</description></item>
  </channel></rss>`;
  const result = await collectGoogleNewsSignals({now:new Date('2026-09-10T02:00:00Z'),fetchImpl:async()=>({ok:true,text:async()=>xml})});
  assert.equal(result.status,'ready');
  assert.equal(result.report.queries,4);
  assert.equal(result.signals[0].signalKind,'news-momentum');
  assert.match(result.signals[0].excerpt,/media-attention indicator/);
  assert.match(result.signals[0].source.url,/^https:\/\/news\.google\.com\//);
  assert.equal(result.trustedExcerpts.get(result.signals[0].id).signalKind,'news-momentum');
});
test('AI and Korea Google News scans are discovery-only and use desk locales',async()=>{
  const urls=[];
  const xml = `<?xml version="1.0"?><rss><channel><item><title>AI model update - Publisher</title><link>https://news.google.com/rss/articles/a</link><pubDate>Thu, 17 Sep 2026 00:00:00 GMT</pubDate><description>One</description></item></channel></rss>`;
  const fetchImpl=async url=>{urls.push(String(url));return {ok:true,text:async()=>xml};};
  const ai=await collectGoogleNewsSignals({deskId:'ai',now:new Date('2026-09-17T02:00:00Z'),fetchImpl});
  const korea=await collectGoogleNewsSignals({deskId:'korea',now:new Date('2026-09-17T02:00:00Z'),fetchImpl});
  assert.equal(ai.report.queries,3);
  assert.equal(ai.signals[0].signalKind,'news-discovery');
  assert.equal(korea.signals[0].signalKind,'news-discovery');
  assert.ok(urls.some(url=>url.includes('ceid=KR:ko')));
});
test('weekly Google News scan covers the full week across five topic groups',async()=>{
  const urls=[];
  const xml = `<?xml version="1.0"?><rss><channel><item><title>Tokenized stocks draw attention - Publisher</title><link>https://news.google.com/rss/articles/w</link><pubDate>Thu, 17 Sep 2026 00:00:00 GMT</pubDate><description>One</description></item></channel></rss>`;
  const result=await collectGoogleNewsSignals({deskId:'weekly',now:new Date('2026-09-20T02:00:00Z'),fetchImpl:async url=>{urls.push(String(url));return {ok:true,text:async()=>xml};}});
  assert.equal(result.report.queries,5);
  assert.equal(result.signals[0].signalKind,'news-discovery');
  assert.ok(urls.every(url=>url.includes('when%3A7d')));
});
test('Reddit collector labels ranked public engagement as social interest only',async()=>{
  const result=await collectRedditSignals({fetchImpl:async()=>({ok:true,json:async()=>({data:{children:[{data:{id:'abc',title:'Tokenized stocks debate',permalink:'/r/stocks/comments/abc/topic/',created_utc:1789862400,score:120,num_comments:40,subreddit:'stocks',over_18:false}}]}})})});
  assert.equal(result.status,'ready');
  assert.equal(result.report.queries,4);
  assert.equal(result.signals[0].signalKind,'social-interest');
  assert.match(result.signals[0].excerpt,/120 points and 40 comments/);
  assert.equal(result.trustedExcerpts.get('reddit-abc').signalKind,'social-interest');
});
test('FSC official list parser returns dated primary article signals',()=>{
  const html='<a href="/no010101/87745?curPage=" title="금융시장 점검">금융시장 점검</a><div class="day">2026-09-18</div>';
  const [signal]=parseFscList(html);
  assert.equal(signal.title,'금융시장 점검');
  assert.equal(signal.publishedAt,'2026-09-18T00:00:00+09:00');
  assert.match(signal.source.url,/^https:\/\/www\.fsc\.go\.kr\/no010101\/87745/);
});
test('source retrieval rejects private or unapproved destinations before network and forbids redirect', async()=>{
  let count=0; const fetchImpl=async(url,options)=>{count++;assert.equal(options.redirect,'error');return new Response('<p>safe text</p>',{headers:{'content-type':'text/html'}});};
  const policy={primaryDomains:['example.org']};
  await assert.rejects(readSource('https://127.0.0.1/',policy,fetchImpl)); assert.equal(count,0);
  assert.equal(await readSource('https://example.org/article',policy,fetchImpl),'safe text');
});
function response(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(v){this.body=v;return this;}};}
test('admin API rejects unauthenticated access, stale versions, unchecked approval and disabled publishing',async()=>{
  let allowed=false,calls=0;
  const store={admin:async()=>allowed,request:async()=>[{id:'2026-09-07-macro',edition_date:'2026-09-07',version:1,payload:{content,sources,related:[]}}],rpc:async()=>{calls++;}};
  const handler=makeHandler({storeFactory:()=>store,env:{}});
  const req={method:'POST',headers:{authorization:'Bearer test'},body:{id:'2026-09-07-macro',version:1,action:'approve'}};
  let res=response();await handler(req,res);assert.equal(res.code,403);
  allowed=true;res=response();await handler({...req,body:{...req.body,version:2}},res);assert.equal(res.code,409);
  res=response();await handler(req,res);assert.equal(res.code,400);
  res=response();await handler({...req,body:{...req.body,action:'publish'}},res);assert.equal(res.code,503);assert.equal(calls,0);
});
test('Chief can create a manual DAILY draft only through the fixed evidence-backed format',async()=>{
  let rpcName, rpcArgs;
  const store={admin:async()=>true,request:async()=>[],rpc:async(name,args)=>{rpcName=name;rpcArgs=args;return {id:'2026-09-07-macro',status:'awaiting_approval',payload:args.p_payload};}};
  const handler=makeHandler({storeFactory:()=>store,env:{}});
  const manualSources=sources.slice(0,2).map(source=>({type:source.type,title:source.title,url:source.url,quote:claims.find(claim=>claim.sourceId===source.id).quote}));
  const body={action:'create',date:'2026-09-07',series:'DAILY DESK',content:{title:content.title,summary:content.summary,sections:content.sections.map(({heading,text})=>({heading,text}))},sources:manualSources};
  let res=response();await handler({method:'POST',headers:{cookie:'session=test'},body},res);
  assert.equal(res.code,201);assert.equal(rpcName,'editorial_manual_create');assert.equal(rpcArgs.p_payload.desk.label,'MACRO MONDAY');assert.equal(rpcArgs.p_payload.content.sections.length,6);assert.equal(rpcArgs.p_payload.qa.manualDraft,true);
  res=response();await handler({method:'POST',headers:{cookie:'session=test'},body:{...body,series:'KK WEEKLY'}},res);
  assert.equal(res.code,400);
});
test('admin can replace a rejected draft only with a fully evidenced and model-reviewed payload',async()=>{
  const replacement={schemaVersion:1,desk:deskFor('2026-09-07'),content,sources,evidence:claims,counterargument:'반론',watchItem:'관찰',top5:[candidate],selectedId:candidate.id,related:[],qa:{checks:['기존 검사'],modelReview:{passed:true,issues:[]}},models:{editor:'test'},memoryIds:[],collection:{manual:true}};
  let rpcArgs;
  const draft={id:'2026-09-07-macro',edition_date:'2026-09-07',version:1,status:'rejected',payload:replacement};
  const store={admin:async()=>true,request:async()=>[draft],rpc:async(_name,args)=>{rpcArgs=args;return {...draft,status:'awaiting_approval',version:2,payload:args.p_payload};}};
  const handler=makeHandler({storeFactory:()=>store,env:{}});
  let res=response();
  await handler({method:'POST',headers:{authorization:'Bearer test'},body:{id:draft.id,version:1,action:'replace',payload:replacement}},res);
  assert.equal(res.code,200);assert.equal(rpcArgs.p_action,'revise');assert.equal(rpcArgs.p_payload.qa.replacedByAdmin,true);
  res=response();
  await handler({method:'POST',headers:{authorization:'Bearer test'},body:{id:draft.id,version:1,action:'replace',payload:{...replacement,qa:{...replacement.qa,modelReview:{passed:false,issues:['unsupported']}}}}},res);
  assert.equal(res.code,503);
});
test('public article removes internal audit and unselected related articles',()=>{
  const result=publicArticle({id:'a',edition_date:'2026-09-07',payload:{desk:deskFor('2026-09-07'),content,sources,related:[{url:'/private-review',title:'review'}],evidence:claims,top5:[candidate]},published_at:'now'});
  assert.equal(result.evidence,undefined);assert.equal(result.sources[0].excerpt,undefined);assert.equal(result.related.length,0);
});
test('Telegram delivery is optional and never exposes credentials in the message',async()=>{
  assert.equal(await notifyTelegram({title:'t',text:'x',env:{},fetchImpl:async()=>{throw new Error('must not call');}}),false);
  let request;
  assert.equal(await notifyTelegram({title:'Desk',text:'Review',env:{TELEGRAM_BOT_TOKEN:'secret-token',TELEGRAM_CHAT_ID:'123'},fetchImpl:async(url,options)=>{request={url,options};return {ok:true};}}),true);
  assert.match(request.url,/secret-token/);
  const body=JSON.parse(request.options.body);
  assert.equal(body.chat_id,'123');
  assert.equal(body.text,'Desk\n\nReview');
  assert.doesNotMatch(body.text,/secret-token/);
});
test('editor feedback repair removes flagged text and revalidates the complete draft',async()=>{
  const fixed={...draft,title:'가계대출 증가폭과 상환부담'};
  let prompt='';
  const result=await repairDesk({date:'2026-09-07',desk:deskFor('2026-09-07'),content:{...freeContent,title:'경고등'},issues:['경고등은 승인되지 않은 은유'],selectedSources:sources.slice(0,2),dossier:{claims,counterargument:'반론',watchItem:'관찰'},invoke:async args=>{if(args.stage==='writer'){prompt=args.prompt;return JSON.stringify(fixed);}return JSON.stringify({...polished,title:fixed.title});},model:'writer'});
  assert.equal(result.content.title,fixed.title);
  assert.match(prompt,/경고등은 승인되지 않은 은유/);
  assert.ok(result.qa.humanReviewRequired);
  assert.equal(result.qa.humanizer.applied,true);
});
test('editor feedback repair recompresses an overlong corrected draft before rejecting it',async()=>{
  const overlong={...draft,body:'편집 지적을 반영한 검증 문장입니다. 사실관계는 그대로 유지합니다. '.repeat(30).trim()};
  let calls=0;
  const result=await repairDesk({
    date:'2026-09-07',desk:deskFor('2026-09-07'),content:freeContent,issues:['문장 수정'],
    selectedSources:sources.slice(0,2),dossier:{claims,counterargument:'반론',watchItem:'관찰'},
    invoke:async({stage})=>{if(stage==='writer'){calls++;return JSON.stringify(overlong);}return JSON.stringify(polished);},model:'writer',
  });
  assert.equal(calls,3);
  assert.ok(result.qa.characters>=300);
  assert.ok(result.qa.characters<=1000);
  assert.equal(result.content.sections.length,1);
});
test('a malformed model JSON response is retried once without weakening validation',async()=>{
  let calls=0;
  const result=await repairDesk({date:'2026-09-07',desk:deskFor('2026-09-07'),content:freeContent,issues:['문장 수정'],selectedSources:sources.slice(0,2),dossier:{claims,counterargument:'반론',watchItem:'관찰'},invoke:async({stage})=>stage==='writer'?(++calls===1?'not json':JSON.stringify(draft)):JSON.stringify(polished),model:'writer'});
  assert.equal(calls,2);
  assert.ok(result.qa.humanReviewRequired);
});
test('humanizer pass is loaded from the repo skill and keeps the draft when facts move',async()=>{
  assert.match(loadHumanizerSkill(),/Not X but Y/);
  const numbered={...freeContent,sections:[{...freeContent.sections[0],text:`${draft.body} 대출은 1,200억 원 늘었습니다.`}]};
  const args={date:'2026-09-07',desk:deskFor('2026-09-07'),selectedSources:sources.slice(0,2),model:'w',skill:'SKILL'};
  let prompt='';
  const changed=await humanizeDesk({...args,content:numbered,invoke:async a=>{prompt=a.prompt;return JSON.stringify({...polished,body:`${draft.body} 대출은 1,300억 원 늘었습니다.`});}});
  assert.match(prompt,/HUMANIZER SKILL:\nSKILL/);
  assert.equal(changed.humanizer.applied,false);
  assert.equal(changed.humanizer.reason,'numbers_changed');
  assert.equal(changed.content,numbered);
  const dashed=await humanizeDesk({...args,content:freeContent,invoke:async()=>JSON.stringify({...polished,body:`${draft.body} 그리고 — 끝.`})});
  assert.equal(dashed.humanizer.reason,'dash_remaining');
  const failed=await humanizeDesk({...args,content:freeContent,invoke:async()=>{throw new Error('gateway down');}});
  assert.match(failed.humanizer.reason,/^model_failed/);
  const kept=await humanizeDesk({...args,content:numbered,invoke:async()=>JSON.stringify({...polished,body:`${draft.body} 대출은 1200억 원 늘었습니다.`})});
  assert.equal(kept.humanizer.applied,true);
  assert.deepEqual(factTokens({title:'“인용”',summary:'',sections:[{text:'"인용" 3.5%.'}]}).quotes,['인용','인용']);
});
test('weekly free draft links the week\'s published Daily editions',async()=>{
  const memory=[{id:'2026-09-07-macro'},{id:'2026-09-08-markets'}];
  const recent=[{title:'a',url:'/desk/2026-09-07-macro'},{title:'b',url:'/desk/2026-09-08-markets'},{title:'c',url:'/posts/x'}];
  const weeklyDraft={...draft,body:sentence.repeat(30).trim()};
  const result=await writeDesk({date:'2026-09-13',desk:deskFor('2026-09-13'),selected:candidate,selectedSources:sources.slice(0,2),dossier:{claims,counterargument:'반론',watchItem:'관찰'},recent,memory,invoke:async({stage})=>JSON.stringify(stage==='writer'?weeklyDraft:{...polished,body:weeklyDraft.body}),model:'w'});
  assert.deepEqual(result.content.relatedUrls,['/desk/2026-09-07-macro','/desk/2026-09-08-markets']);
});
test('ready message links straight to the draft and reports the humanizer pass',()=>{
  const desk=deskFor('2026-09-07');
  const ok=draftReadyMessage({date:'2026-09-07',desk,content:{title:'제목'},qa:{characters:720,humanizer:{applied:true}}});
  assert.equal(ok.title,'[KK Daily 자동 초안] MACRO MONDAY');
  assert.match(ok.text,/admin-editorial\?id=2026-09-07-macro/);
  assert.match(ok.text,/humanizer\) 적용/);
  const kept=draftReadyMessage({date:'2026-09-13',desk:deskFor('2026-09-13'),content:{title:'주간'},qa:{humanizer:{applied:false,reason:'numbers_changed'}}});
  assert.equal(kept.title,'[KK Weekly 자동 초안] KK WEEKLY');
  assert.match(kept.text,/숫자가 바뀌어 원문 유지/);
});
test('Telegram failure diagnostics are actionable and redact credentials',async()=>{
  const rejected=await sendTelegramNotification({title:'Desk',text:'Review',env:{TELEGRAM_BOT_TOKEN:'secret-token',TELEGRAM_CHAT_ID:'123'},fetchImpl:async()=>({ok:false,status:400,statusText:'Bad Request',json:async()=>({ok:false,error_code:400,description:'Bad token secret-token at https://api.telegram.org/private'})})});
  assert.deepEqual(rejected,{ok:false,reason:'telegram_rejected',status:400,errorCode:400,description:'Bad token [REDACTED] at [URL]',retryAfter:null});
  const network=await sendTelegramNotification({title:'Desk',text:'Review',env:{TELEGRAM_BOT_TOKEN:'secret-token',TELEGRAM_CHAT_ID:'123'},fetchImpl:async()=>{throw new TypeError('fetch failed for secret-token');}});
  assert.equal(network.ok,false);
  assert.equal(network.reason,'network_error');
  assert.doesNotMatch(JSON.stringify(network),/secret-token/);
});
test('X collector stays disabled without a token and ranks authenticated public metrics',async()=>{
  assert.deepEqual(await collectXSignals({token:''}),{signals:[],status:'not_configured'});
  const result=await collectXSignals({token:'secret',fetchImpl:async(url,options)=>{
    assert.match(url,/api\.x\.com\/2\/tweets\/search\/recent/);
    assert.equal(options.headers.authorization,'Bearer secret');
    return {ok:true,json:async()=>({data:[
      {id:'1',text:'Lower engagement post with enough factual context for the editorial signal collector to retain it safely.',created_at:'2026-09-08T00:00:00Z',public_metrics:{like_count:2}},
      {id:'2',text:'Higher engagement post with enough factual context for the editorial signal collector to retain it safely.',created_at:'2026-09-08T01:00:00Z',public_metrics:{like_count:100,retweet_count:20}},
    ]})};
  }});
  assert.equal(result.status,'ready');
  assert.equal(result.signals[0].id,'x-2');
  assert.match(result.signals[0].source.url,/^https:\/\/x\.com\//);
  assert.match(result.signals[0].excerpt,/100 likes/);
});

test('discovery requires per-source support and accepts an honest empty answer',async()=>{
  const rank=args=>rankDesk({date:'2026-09-07',sources,invoke:async()=>JSON.stringify(args),model:'d'});
  await assert.rejects(rank({status:'ready',candidates:[{...candidate,sourceSupport:[candidate.sourceSupport[0]]}]}),/cover every selected source/);
  await assert.rejects(rank({status:'no_supported_candidate',candidates:[]}),/No supported candidate/);
  const ranked=await rank({status:'ready',candidates:[candidate]});
  assert.equal(ranked.selected.sourceSupport.length,2);
});
test('research falls through to the next candidate on a source-topic mismatch',async()=>{
  const { selectResearchCandidate } = await import('../src/desk/fallback.js');
  const second={...candidate,id:'c2',title:'두 번째 후보'};
  const ranked={desk:deskFor('2026-09-07'),top5:[{...candidate,score:80,reasons:[]},{...second,score:75,reasons:[]}],selected:{...candidate,score:80,reasons:[]}};
  const seen=[];
  const result=await selectResearchCandidate({ranked,sources,rerank:async()=>{throw new Error('not needed');},onRejected:f=>seen.push(f),research:async c=>{if(c.id==='c1')throw new Error('Editorial hold: Source-topic mismatch: adjacent only');return {ok:c.id};}});
  assert.equal(result.ranked.selected.id,'c2');
  assert.equal(seen.length,1);
});
test('a failed run is recorded through the fenced RPCs only',async()=>{
  const { recordRunFailure } = await import('../src/desk/run-failure.js');
  const calls=[];
  const store={rpc:async(name,args)=>{calls.push(name);return name==='editorial_claim'?false:true;}};
  assert.equal(await recordRunFailure(store,{date:'2026-09-07',attempt:null,claimed:false}),false);
  assert.equal(await recordRunFailure(store,{date:'2026-09-07',attempt:'a',claimed:false,stage:'rank',reason:'x',error:'Error'}),false);
  assert.deepEqual(calls,['editorial_claim']);
  assert.equal(await recordRunFailure(store,{date:'2026-09-07',attempt:'a',claimed:true,stage:'edit',reason:'x',error:'Error'}),true);
  assert.deepEqual(calls,['editorial_claim','editorial_finish']);
});
test('source text prefers the article body over page chrome',async()=>{
  const { sourceText } = await import('../src/desk/collector.js');
  assert.equal(sourceText('<nav>메뉴</nav><article><p>본문 &#8212; 사실</p></article><footer>꼬리</footer>'),'본문 — 사실');
});

test('rank failure names why each candidate was rejected',async()=>{
  const sameHost=sources.map(source=>({...source,url:'https://same.test/'+source.id}));
  await assert.rejects(rankDesk({date:'2026-09-07',sources:sameHost,invoke:async({prompt})=>{assert.match(prompt,/two different hostnames/);return JSON.stringify({status:'ready',candidates:[candidate]});},model:'d'}),/No eligible candidate \(1\) 금리와 자금조달 비용: 독립 출처 부족/);
});

test('discovery sees recent summaries and treats the same thesis as a duplicate',async()=>{
  let prompt='';
  const recent=[{title:'AI 투자 붐이 인플레이션 서사를 흔든다',summary:'AI 데이터센터 투자가 물가 압력으로 번지는지 본다',url:'/desk/2026-10-04-weekly'}];
  await rankDesk({date:'2026-09-07',sources,recent,invoke:async args=>{prompt=args.prompt;return JSON.stringify({status:'ready',candidates:[candidate]});},model:'d'});
  assert.match(prompt,/same subject and the same claimed mechanism/);
  assert.match(prompt,/AI 데이터센터 투자가 물가 압력으로 번지는지 본다/);
});
test('writer and editor are told to explain jargon and not repeat the counterargument',async()=>{
  const prompts={};
  await writeDesk({date:'2026-09-07',desk:deskFor('2026-09-07'),selected:candidate,selectedSources:sources.slice(0,2),dossier:{claims,counterargument:'반론',watchItem:'관찰'},invoke:async({stage,prompt})=>{prompts[stage]=prompt;return JSON.stringify(stage==='writer'?draft:polished);},model:'w'});
  assert.match(prompts.writer,/코어\/근원 물가/);
  assert.match(prompts.writer,/never restate an earlier sentence as the counterargument/);
  const { editDesk } = await import('../src/desk/stages.js');
  let editorPrompt='';
  await editDesk({content:freeContent,dossier:{claims},selectedSources:sources.slice(0,2),invoke:async({prompt})=>{editorPrompt=prompt;return JSON.stringify({passed:true,issues:[]});},model:'e'});
  assert.match(editorPrompt,/only restates an earlier sentence/);
});
test('fresh wire news cannot crowd official releases out of the fetch list',async()=>{
  const { collectDeskSources } = await import('../src/desk/collector.js');
  const policy={primaryDomains:['federalreserve.gov'],signalOnlyDomains:['cnbc.com'],maxAgeDays:14};
  const now=new Date('2026-10-05T00:00:00Z');
  const rss=(host,hours,tag='a')=>`<rss><channel>${Array.from({length:15},(_,i)=>`<item><title>${host} ${tag} item ${i}</title><link>https://www.${host}/${tag}/${i}</link><pubDate>${new Date(now-((hours+i)*3600e3)).toUTCString()}</pubDate><description>d</description></item>`).join('')}</channel></rss>`;
  const fetchImpl=async url=>{
    const href=String(url);
    if(href==='https://www.federalreserve.gov/feed.xml') return new Response(rss('federalreserve.gov',72));
    const news=href.match(/^https:\/\/www\.cnbc\.com\/(n\d)\.xml$/);
    if(news) return new Response(rss('cnbc.com',1,news[1]));
    return new Response(`<html><body><article><p>${'Official or reported text with enough words to keep. '.repeat(20)}</p></article></body></html>`,{headers:{'content-type':'text/html'}});
  };
  // Four news feeds give 60 items newer than every official release.
  const feeds=[{id:'fed',name:'Fed',url:'https://www.federalreserve.gov/feed.xml'},...[1,2,3,4].map(n=>({id:`cnbc${n}`,name:'CNBC',url:`https://www.cnbc.com/n${n}.xml`}))];
  const { sources } = await collectDeskSources({feeds,policy,now,fetchImpl});
  const primary=sources.filter(s=>s.type==='primary').length;
  const secondary=sources.filter(s=>s.type==='secondary').length;
  assert.equal(primary,15,`primary=${primary}`);
  assert.equal(secondary,15,`secondary=${secondary}`);
});
test('news outlets in the feed list are allowlisted as secondary, official bodies as primary',async()=>{
  const { classifySourceUrl } = await import('../src/signals.js');
  const { readFile } = await import('node:fs/promises');
  const policy=JSON.parse(await readFile(new URL('../config/desk-source-policy.json',import.meta.url),'utf8'));
  const feeds=JSON.parse(await readFile(new URL('../config/desk-feeds.json',import.meta.url),'utf8')).filter(f=>!f.disabled);
  for(const feed of feeds) classifySourceUrl(feed.url,policy);
  assert.equal(classifySourceUrl('https://www.cnbc.com/2026/10/02/x.html',policy),'secondary');
  assert.equal(classifySourceUrl('https://www.yna.co.kr/view/AKR1',policy),'secondary');
  assert.equal(classifySourceUrl('https://www.bea.gov/news/2026/x',policy),'primary');
  assert.equal(classifySourceUrl('https://www.ecb.europa.eu/press/x.html',policy),'primary');
});

test('a weak first discovery round gets one retry that excludes the rejected pick',async()=>{
  const weak={...candidate,id:'weak',title:'약한 후보',scores:{impact:3,structural:3,surprise:3,relevance:3}};
  const prompts=[];
  const ranked=await rankDesk({date:'2026-09-07',sources,model:'d',invoke:async({prompt})=>{prompts.push(prompt);return JSON.stringify({status:'ready',candidates:[prompts.length===1?weak:candidate]});}});
  assert.equal(prompts.length,2);
  assert.match(prompts[1],/약한 후보/);
  assert.equal(ranked.selected.id,'c1');
  await assert.rejects(rankDesk({date:'2026-09-07',sources,model:'d',invoke:async()=>JSON.stringify({status:'ready',candidates:[weak]})}),/No eligible candidate .*first round: No eligible candidate/);
});

test('the editor verdict decides; notes on an approved draft are kept for KK',async()=>{
  const { editDesk } = await import('../src/desk/stages.js');
  const run=review=>editDesk({content:freeContent,dossier:{claims},selectedSources:sources.slice(0,2),model:'e',invoke:async()=>JSON.stringify(review)});
  const ok=await run({passed:true,issues:['숫자는 원문과 일치합니다.']});
  assert.deepEqual(ok,{passed:true,issues:[],notes:['숫자는 원문과 일치합니다.']});
  await assert.rejects(run({passed:false,issues:['제목이 원문보다 단정적입니다.']}),error=>error.issues[0]==='제목이 원문보다 단정적입니다.');
  await assert.rejects(run({passed:false,issues:[]}),error=>error.issues.length===1);
  const message=draftReadyMessage({date:'2026-09-07',desk:deskFor('2026-09-07'),content:{title:'t'},qa:{humanizer:{applied:true},modelReview:ok}});
  assert.match(message.text,/편집 검수 메모 1건/);
});
test('writer is told to mark interpretation in-sentence and not to invent who disagrees',async()=>{
  let prompt='';
  await writeDesk({date:'2026-09-07',desk:deskFor('2026-09-07'),selected:candidate,selectedSources:sources.slice(0,2),dossier:{claims,counterargument:'반론',watchItem:'관찰'},invoke:async(a)=>{if(a.stage==='writer')prompt=a.prompt;return JSON.stringify(a.stage==='writer'?draft:polished);},model:'w'});
  assert.match(prompt,/never add a standalone label sentence/);
  assert.match(prompt,/Never invent who agrees or disagrees/);
});
