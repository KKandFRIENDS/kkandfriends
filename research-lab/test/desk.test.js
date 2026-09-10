import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, deskFor, rankCandidates, validateEvidence, validateContent, hashContent, DAILY_SECTIONS, publicArticle } from '../src/desk/core.js';
import { generateDesk } from '../src/desk/pipeline.js';
import { editorialFocus } from '../src/desk/stages.js';
import { readSource } from '../src/desk/collector.js';
import { notifyTelegram } from '../src/desk/notify.js';
import { collectXSignals } from '../src/desk/x-signals.js';
import { collectGoogleNewsSignals } from '../src/desk/google-news-signals.js';
import { makeHandler } from '../../api/editorial.js';

const sources = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, title: `Source ${i}`, url: `https://source${i}.test/article`, type: i === 0 ? 'primary' : 'secondary', excerpt: 'Verified original evidence with a reporting date and a unit. '.repeat(5), publishedAt: '2026-09-07T00:00:00Z' }));
const candidate = { id: 'c1', title: '금리와 자금조달 비용', reason: '가격과 실물의 차이를 확인한다.', scores: { impact: 8, structural: 8, surprise: 8, relevance: 8 }, sourceIds: ['s0','s1'], duplicateOf: null, conflict: 'clear' };
const claims = [0,1].map(i => ({ statement: '합성 검증 문장', sourceId: `s${i}`, quote: 'Verified original evidence with a reporting date and a unit.', asOf: '2026-09-07', unit: 'not applicable' }));
const content = { title: '합성 테스트: 금리와 자금조달 비용', summary: '실제 시장 분석이 아닌 검증용 데이터', sections: DAILY_SECTIONS.map(heading => ({ heading, text: '검증용 합성 문장입니다. 실제 투자 판단이나 시장 수치를 포함하지 않습니다. '.repeat(4), sourceIds: ['s0'] })), relatedUrls: [] };
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
});
test('content enforces length, provenance, sections, related URLs and hash changes', () => {
  assert.ok(validateContent(content, { sources, date:'2026-09-07' }).characters >= 800);
  assert.throws(()=>validateContent({...content, relatedUrls:['https://invented.test']},{sources,date:'2026-09-07'}));
  assert.throws(()=>validateContent({...content, sections:[]},{sources,date:'2026-09-07'}));
  assert.notEqual(hashContent(content), hashContent({...content,title:'수정'}));
  assert.equal(hashContent(content), hashContent(Object.fromEntries(Object.entries(content).reverse())));
});
test('daily generation follows all stages and fails on model audit', async () => {
  const stages=[];
  const invoke=async ({stage}) => { stages.push(stage); return JSON.stringify({ discovery:{candidates:[candidate]}, research:{claims,counterargument:'반론',watchItem:'관찰'}, writer:content, editor:{passed:true,issues:[]} }[stage]); };
  const result=await generateDesk({date:'2026-09-07',sources,invoke,models:{}});
  assert.deepEqual(stages,['discovery','research','writer','editor']);
  assert.equal(result.qa.humanReviewRequired,true);
  assert.equal(result.sources[0].excerpt,undefined);
  await assert.rejects(generateDesk({date:'2026-09-07',sources,models:{},invoke:async args => args.stage==='editor'?JSON.stringify({passed:false,issues:['Unsupported fact']}):invoke(args)}), /review failed/);
});
test('Friday without observable news momentum and Sunday without published memory stop', async()=>{
  await assert.rejects(generateDesk({date:'2026-09-11',sources,models:{},invoke:async()=>JSON.stringify({candidates:[candidate]})}),/Friday/);
  await assert.rejects(generateDesk({date:'2026-09-13',sources,memory:[],models:{}}),/published editions/);
});
test('Friday accepts observed Google News momentum only alongside primary evidence', async()=>{
  const fridaySources=sources.map((source,index)=>index===1?{...source,signalKind:'news-momentum'}:source);
  const invoke=async({stage})=>JSON.stringify({discovery:{candidates:[candidate]},research:{claims,counterargument:'반론',watchItem:'관찰'},writer:content,editor:{passed:true,issues:[]}}[stage]);
  const result=await generateDesk({date:'2026-09-11',sources:fridaySources,invoke,models:{}});
  assert.equal(result.desk.id,'signals');
  assert.ok(result.sources.some(source=>source.signalKind==='news-momentum'));
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
