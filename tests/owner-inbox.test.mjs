import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { setupOwnerInbox } from '../owner.mjs';
import { PAGE_SIZE, inboxPath, inboxCursor, readInboxPage, reviewInquiry } from '../owner-inbox-data.mjs';
const html=readFileSync(new URL('../owner.html',import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const row=(n,extra={})=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-'+n.toString(16).padStart(12,'0'),created_at:'2026-10-28T12:00:00.123456+00:00',customer_name:'Synthetic '+n,customer_email:'test'+n+'@example.invalid',customer_phone:'555-0100',project_type:'Custom Cabinetry',project_description:'Keep the trim.',status:'new',measurements:{customer_supplied:'144 x 120 in',verified:false},design_options:{location:'Philadelphia',contact_consent:true,design:{wood:'Maple',notes:'Customer layout concept (unverified): room 144 × 120 in'}},...extra});
const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
const session=(id=user,token='synthetic-token')=>({access_token:token,expires_in:3600,user:{id}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function page(t,handler,{clock=()=>Date.now()}={}){
 const window=new Window({url:'https://example.invalid/owner.html'});t.after(()=>window.happyDOM.close());
 const document=window.document;document.write(html);const calls=[];
 setupOwnerInbox({document,window,clock,request:async(url,options)=>{const call={url,options,path:new URL(url).pathname,params:new URL(url).searchParams};calls.push(call);return handler(call,calls);}});
 const get=id=>document.getElementById(id);
 const login=async(email='owner@example.invalid')=>{get('login').elements.namedItem('email').value=email;get('login').elements.namedItem('password').value='synthetic-password';get('login').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();};
 return{window,document,get,calls,login,search:async text=>{get('inbox-search').value=text;get('inbox-search').dispatchEvent(new window.Event('input'));await tick();}};
}
function server(data=[row(1)]){return async call=>{
 if(call.path.endsWith('/token'))return response(session());
 if(call.path.endsWith('/owner_accounts'))return response([{user_id:user}]);
 if(call.path.endsWith('/logout'))return response(null,204);
 if(call.path.endsWith('/quote_requests')){
  const cursor=call.params.get('or');const id=cursor?.match(/id\.lt\.([^)]*)/)[1];
  return response(data.filter(r=>!id||r.id<id).slice(0,PAGE_SIZE+1));
 }
 throw Error('Unexpected path');
};}
test('keyset queries preserve microseconds and UUID ties and reject filter injection',()=>{
 const c=inboxCursor(row(1));assert.equal(c.created_at,row(1).created_at);
 const query=new URL(inboxPath(c),'https://example.invalid');assert.equal(query.searchParams.get('order'),'created_at.desc,id.desc');assert.equal(query.searchParams.get('limit'),'26');
 assert.equal(query.searchParams.get('or'),`(created_at.lt.${c.created_at},and(created_at.eq.${c.created_at},id.lt.${c.id}))`);
 for(const change of [{id:'x),or=(id.gt.0'},{created_at:'2026-10-28,evil'},{created_at:'invalid'}])assert.throws(()=>inboxPath({...row(1),...change}));
 const rows=Array.from({length:26},(_,i)=>row(100-i)),p=readInboxPage(rows);assert.equal(p.rows.length,25);assert.equal(p.next.id,rows[24].id);assert.notEqual(p.next.id,rows[25].id);
 assert.equal(readInboxPage(rows.slice(0,25)).next,null);
});
test('unreadable records are counted without suppressing safe records; bad cursor disables paging',()=>{
 const a=readInboxPage([row(1),row(2,{customer_name:'x'.repeat(121)}),row(3)]);assert.equal(a.rows.length,2);assert.equal(a.rejected,1);
 const many=Array.from({length:26},(_,i)=>row(i+1));many[24]={...many[24],created_at:'bad'};assert.equal(readInboxPage(many).pagingUnavailable,true);
 assert.throws(()=>readInboxPage({}));assert.throws(()=>readInboxPage(Array(27).fill(row(1))));
 const source=row(4,{design_options:{design:{notes:'"'.repeat(2000),dimensions:'D'.repeat(200)},contact_consent:false}});assert.equal(reviewInquiry(source).design.notes,source.design_options.design.notes);
});
test('owner page renders bounded design context as text, confirms consent and stores no session data',async t=>{
 const data=row(1,{customer_name:'<img src=x onerror=alert(1)>',design_options:{location:'Magee',contact_consent:true,design:{wood:'Maple',notes:'<script>alert(1)</script>\nExact layout notes.'}}});
 const p=page(t,server([data]));await p.login();
 assert.equal(p.get('inbox').hidden,false);assert.match(p.get('requests').textContent,/<script>/);assert.equal(p.get('requests').querySelectorAll('img,script').length,0);
 assert.match(p.get('requests').textContent,/Submitted design context — unverified/);assert.match(p.get('requests').textContent,/Contact consent: Recorded/);assert.match(p.get('requests').textContent,/Maple/);
 assert.equal(p.window.localStorage.length,0);assert.equal(p.window.sessionStorage.length,0);assert.equal(p.get('login').elements.namedItem('password').value,'');
 assert.ok(p.calls.every(c=>c.options.cache==='no-store'));assert.ok(p.calls.filter(c=>c.path.endsWith('/quote_requests')).every(c=>c.options.headers.Authorization==='Bearer synthetic-token'));
});
test('paging covers tied timestamps without skipping lookahead; Newer and Refresh reload the right boundaries',async t=>{
 const data=Array.from({length:55},(_,i)=>row(100-i));const p=page(t,server(data));await p.login();
 const first=[...p.get('requests').querySelectorAll('h2')].map(e=>e.textContent);assert.equal(first.length,25);assert.equal(p.get('newer').disabled,true);
 p.get('older').click();await tick();const second=[...p.get('requests').querySelectorAll('h2')].map(e=>e.textContent);assert.equal(second.length,25);assert.ok(!first.some(name=>second.includes(name)));assert.match(p.get('inbox-page').textContent,/Page 2/);
 p.get('older').click();await tick();assert.equal(p.get('requests').querySelectorAll('article').length,5);assert.equal(p.get('older').disabled,true);
 p.get('newer').click();await tick();assert.deepEqual([...p.get('requests').querySelectorAll('h2')].map(e=>e.textContent),second);
 p.get('refresh').click();await tick();assert.deepEqual([...p.get('requests').querySelectorAll('h2')].map(e=>e.textContent),first);assert.match(p.get('inbox-page').textContent,/Page 1/);
});
test('search is page-local, persists through paging, and clears on signout',async t=>{
 const p=page(t,server(Array.from({length:30},(_,i)=>row(100-i))));await p.login();const count=p.calls.length;
 await p.search('synthetic 100');assert.equal(p.get('requests').querySelectorAll('article').length,1);assert.equal(p.calls.length,count);assert.match(p.get('inbox-matches').textContent,/1 of 25/);
 p.get('older').click();await tick();assert.equal(p.get('inbox-search').value,'synthetic 100');assert.equal(p.get('requests').querySelectorAll('article').length,0);assert.match(p.get('inbox-matches').textContent,/0 of 5/);
 p.get('clear-search').click();assert.equal(p.get('requests').querySelectorAll('article').length,5);p.get('logout').click();assert.equal(p.get('inbox-search').value,'');assert.equal(p.get('requests').children.length,0);assert.equal(p.get('inbox').hidden,true);
});
test('owner membership must match authenticated identity and is checked again for each page',async t=>{
 for(const owners of [[],[{user_id:other}],{}]){
  const p=page(t,async c=>c.path.endsWith('/token')?response(session()):response(owners));await p.login();assert.equal(p.get('inbox').hidden,true);assert.equal(p.calls.some(c=>c.path.endsWith('/quote_requests')),false);
 }
 let membership=true;const normal=server(Array.from({length:30},(_,i)=>row(100-i)));
 const p=page(t,async c=>c.path.endsWith('/owner_accounts')?response(membership?[{user_id:user}]:[]):normal(c));await p.login();membership=false;p.get('older').click();await tick();assert.equal(p.get('inbox').hidden,true);assert.equal(p.get('requests').children.length,0);
});
test('duplicate sign-in and paging taps produce one request per operation',async t=>{
 const pending=deferred(),normal=server(Array.from({length:30},(_,i)=>row(100-i)));let blocked=true;
 const p=page(t,c=>c.path.endsWith('/token')&&blocked?pending.promise:normal(c));await p.login();await p.login();assert.equal(p.calls.filter(c=>c.path.endsWith('/token')).length,1);
 blocked=false;pending.resolve(response(session()));await tick();
 const fetchPage=deferred();let hold=true;const q=page(t,c=>c.path.endsWith('/quote_requests')&&hold?fetchPage.promise:normal(c));await q.login();q.get('refresh').dispatchEvent(new q.window.Event('click'));assert.equal(q.calls.filter(c=>c.path.endsWith('/quote_requests')).length,1);hold=false;fetchPage.resolve(response([]));await tick();
});
test('pageleave aborts pending login and late token responses cannot reopen private UI',async t=>{
 const late=deferred();const p=page(t,()=>late.promise);await p.login();const signal=p.calls[0].options.signal;p.window.dispatchEvent(new p.window.Event('pagehide'));assert.equal(signal.aborted,true);late.resolve(response(session()));await tick();assert.equal(p.get('inbox').hidden,true);assert.equal(p.calls.length,1);
});
test('a previous owner-check failure cannot clear a newer sign-in or request its records',async t=>{
 const late=deferred(),normal=server([row(99)]);let checks=0;
 const p=page(t,c=>c.path.endsWith('/owner_accounts')&&++checks===1?late.promise:normal(c));await p.login();p.get('logout').click();await p.login();assert.match(p.get('requests').textContent,/Synthetic 99/);
 late.resolve(response({},401));await tick();assert.equal(p.get('inbox').hidden,false);assert.match(p.get('requests').textContent,/Synthetic 99/);assert.equal(p.calls.filter(c=>c.path.endsWith('/quote_requests')).length,1);
});
test('late records and logout errors cannot overwrite a new session even when transport ignores abort',async t=>{
 const records=deferred(),logout=deferred(),normal=server([row(99)]);let loads=0;
 const p=page(t,c=>c.path.endsWith('/quote_requests')&&++loads===1?records.promise:c.path.endsWith('/logout')?logout.promise:normal(c));await p.login();p.get('logout').click();await p.login();const status=p.get('status').textContent;
 records.resolve(response([row(1)]));logout.resolve(response({},401));await tick();assert.match(p.get('requests').textContent,/Synthetic 99/);assert.doesNotMatch(p.get('requests').textContent,/Synthetic 1\b/);assert.equal(p.get('status').textContent,status);
});
test('expired sessions clear private content before actions, and expiry during JSON parsing refuses data',async t=>{
 let now=1000;const p=page(t,server(),{clock:()=>now});await p.login();now+=3600001;await p.search('Synthetic');assert.equal(p.get('requests').children.length,0);assert.equal(p.get('inbox').hidden,true);assert.match(p.get('status').textContent,/expired/);
 now=1000;const body=deferred(),normal=server();const q=page(t,c=>c.path.endsWith('/quote_requests')?{ok:true,status:200,json:()=>body.promise}:normal(c),{clock:()=>now});await q.login();now+=3600001;body.resolve([row(5)]);await tick();assert.equal(q.get('requests').children.length,0);assert.equal(q.get('inbox').hidden,true);
});
test('filtered and previous-session reference buttons are inert; late copy completion cannot alter status',async t=>{
 const p=page(t,server());await p.login();let copies=0;const late=deferred();p.window.navigator.clipboard.writeText=()=>{copies++;return late.promise;};
 const stale=p.get('requests').querySelector('button');await p.search('absent');stale.dispatchEvent(new p.window.Event('click'));assert.equal(copies,0);
 p.get('clear-search').click();const active=p.get('requests').querySelector('button');active.click();assert.equal(copies,1);p.get('logout').click();const status=p.get('status').textContent;late.resolve();await tick();assert.equal(p.get('status').textContent,status);active.dispatchEvent(new p.window.Event('click'));assert.equal(copies,1);
});
test('network failures retain session controls for refresh; authorization failures clear private state',async t=>{
 const normal=server();let failure=0;const p=page(t,c=>c.path.endsWith('/quote_requests')&&failure?failure===401?response({},401):Promise.reject(Error('private diagnostic')):normal(c));await p.login();failure=500;p.get('refresh').click();await tick();assert.equal(p.get('inbox').hidden,false);assert.equal(p.get('refresh').disabled,false);assert.doesNotMatch(p.get('status').textContent,/private diagnostic/);assert.equal(p.get('requests').children.length,0);
 failure=0;p.get('refresh').click();await tick();assert.match(p.get('requests').textContent,/Synthetic/);failure=401;p.get('refresh').click();await tick();assert.equal(p.get('inbox').hidden,true);assert.equal(p.get('requests').children.length,0);
});

test('pending reloads hide old records even if a disabled search input dispatches events',async t=>{
 const normal=server();let block=false;const late=deferred();const p=page(t,c=>c.path.endsWith('/quote_requests')&&block?late.promise:normal(c));await p.login();block=true;p.get('refresh').click();await tick();assert.equal(p.get('inbox').getAttribute('aria-busy'),'true');await p.search('Synthetic');assert.equal(p.get('requests').querySelectorAll('article').length,0);late.resolve(response([row(2)]));await tick();assert.equal(p.get('inbox').hasAttribute('aria-busy'),false);assert.match(p.get('requests').textContent,/Synthetic 2/);
});
test('returning to the page after expiry clears records without waiting for another action',async t=>{
 let now=0;const p=page(t,server(),{clock:()=>now});await p.login();now=3600001;p.document.dispatchEvent(new p.window.Event('visibilitychange'));assert.equal(p.get('requests').children.length,0);assert.equal(p.get('inbox').hidden,true);
});
