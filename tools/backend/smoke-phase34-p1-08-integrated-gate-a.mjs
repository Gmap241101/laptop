// P1-08 Gate A deterministic integration; intentionally no network, no real database, no mail.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIL_EVENTS } from '../../server/src/mail/mail-event-catalog.mjs';
import { createP106ScheduledEnqueue, startP106ScheduledLoop, getSeoulBusinessDate } from '../../server/src/mail/mail-scheduled-enqueue.mjs';
import { cancelStaleScheduledMailInTransaction } from '../../server/src/mail/mail-scheduled-safety.mjs';
import { P103_REAL_DELIVERY_LOCKED, createP103Dispatcher } from '../../server/src/mail/mail-dynoweb-dispatcher.mjs';
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const source=(path)=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
eq(MAIL_EVENTS.length,19,'catalog holds 19 events');
eq(MAIL_EVENTS.filter(e=>e.recipient==='admin').length,2,'two admin events');
ok(MAIL_EVENTS.some(e=>e.key==='admin_signup_pending'),'signup pending preserved');
ok(MAIL_EVENTS.some(e=>e.key==='admin_rental_pending'),'rental pending preserved');
ok(MAIL_EVENTS.some(e=>e.key==='rental_due_reminder'),'due reminder preserved');
ok(MAIL_EVENTS.some(e=>e.key==='rental_overdue'),'overdue preserved');
eq(P103_REAL_DELIVERY_LOCKED,true,'real provider sender hard-locked');
const startup=source('server/src/index.mjs');
ok(startup.includes("check.rows[0]?.payload?.delivery?.enabled!==true") && startup.includes("process.env.P109_OPERATOR_CONTROL_ENABLED==='true'"),'scheduled scan requires operator-approved master control');
ok(!startup.includes('createP103Dispatcher'),'live sender never started');
const changes=[
 ['server/src/rentals/admin-rental-request-repository.mjs',3],
 ['server/src/rentals/rental-request-user-action-repository.mjs',3],
];
for(const [path,count] of changes) {
 const text=source(path);
 eq((text.match(/await cancelStaleScheduledMailInTransaction\(\{client,requestId\}\)/g)||[]).length,count,`mutation integration ${path}`);
 ok(text.includes("await client.query('COMMIT')"),'business mutation commit preserved');
}
const calls=[];
const client={query:async(sql,args)=>{calls.push({sql,args});return {rowCount:2,rows:[]};}};
eq((await cancelStaleScheduledMailInTransaction({client,requestId:'req-20261023-0001'})).cancelled,2,'cancelled stale rows');
eq(calls.length,1,'one parameterized cancellation');
eq(calls[0].args,['req-20261023-0001'],'source request id parameter');
for(const str of ['state IN (\'queued\',\'retry\')','r.status=\'대여중\'','o.source_due_date=r.due_date','Asia/Seoul','mail_scheduled_rental_changed','NOT EXISTS']) {
 ok(calls[0].sql.includes(str),`stale-only SQL ${str}`);
}
for(const invalid of ['',null,17,' '.repeat(4),'x'.repeat(257)]) {
 await assert.rejects(()=>cancelStaleScheduledMailInTransaction({client,requestId:invalid}),/mail_schedule_request_id_invalid/);checks++;
}
const date='2026-10-22';
const fakeRentals=Array.from({length:205},(_,i)=>({
 rental_row_id:i+1,request_id:`request-20261022-${String(i+1).padStart(4,'0')}`,
 requester_email:`user${i+1}@example.com`,requester_name:'홍길동',requester_team:'운영',
 requested_at_text:'2026-10-21',start_date:'2026-10-21',due_date:'2026-10-23',asset_category:'노트북',asset_no:`MK-${i+1}`,
}));
const keys=new Set();let pages=[];let inserted=0,updated=0,commits=0,rollbacks=0,releases=0;
const tx={query:async(sql,args=[])=>{
 if(sql==='BEGIN'||sql==='ROLLBACK'||sql==='COMMIT'){
  if(sql==='COMMIT') commits++;
  if(sql==='ROLLBACK') rollbacks++;
  return {rows:[]};
 }
 if(sql.includes('pg_try_advisory_xact_lock'))return {rows:[{locked:true}]};
 if(sql.includes("config_key='mail-notification-settings'"))return {rows:[{payload:{events:{
  rental_due_reminder:{enabled:true,subject:'반납 예정 {{name}}',body:'{{rentalDueAt}}',bodyFormat:'text'},
  rental_overdue:{enabled:false},
 }}}]};
 if(sql.includes('FROM app_rental_requests r')){
  eq(sql.includes('r.id > $3::bigint'),true,'cursor query parameterized');
  eq(sql.includes('FOR SHARE OF r'),true,'rental lock during enqueue');
  const [ref,limit,afterId]=args;eq(ref,date,'schedule KST reference date');
  pages.push(afterId);
  return {rows:fakeRentals.filter(r=>r.rental_row_id>afterId).slice(0,limit)};
 }
 if(sql.includes('INSERT INTO app_mail_outbox')){
  const dedupe=args[0]; if(keys.has(dedupe))return {rows:[]};
  keys.add(dedupe);inserted++;return {rows:[{id:inserted}]};
 }
 if(sql.includes('UPDATE app_mail_outbox SET source_request_id')){
  updated++; eq(args[3],date,'record scheduled execution day');return {rows:[],rowCount:1};
 }
 return {rows:[]};
},release(){releases++;}};
const runner=createP106ScheduledEnqueue({connect:async()=>tx});
const first=await runner.tick({referenceDate:date,limit:100});
eq(first.state,'complete','full 205-rental scan');
eq(first.queued,205,'more than 100 candidates queued');
eq(first.candidates,205,'all candidates visited');
eq(pages,[0,100,200],'cursor prevents first-page starvation');
eq(updated,205,'stamped all outbox rows');
eq(commits,1,'atomic committed batch');
const second=await runner.tick({referenceDate:date,limit:100});
eq(second.queued,0,'second run no new messages');
eq(second.duplicates,205,'dedupe covers every page');
eq(keys.size,205,'one mail per rental/due event');
eq(commits,2,'duplicate rerun committed');
eq(releases,2,'pool client released');
await assert.rejects(()=>runner.tick({referenceDate:'2026-02-30'}),/mail_schedule_arguments_invalid/);checks++;
await assert.rejects(()=>runner.tick({referenceDate:'2026-13-01'}),/mail_schedule_arguments_invalid/);checks++;
await assert.rejects(()=>runner.tick({referenceDate:date,limit:0}),/mail_schedule_arguments_invalid/);checks++;
eq(getSeoulBusinessDate(new Date('2026-10-22T15:01:00Z')),'2026-10-23','Seoul midnight rollover');
const loop=startP106ScheduledLoop({runner,enabled:false,schedule:()=>{throw Error('schedule must remain OFF');}});
eq(loop.start(),false,'Gate A no automatic schedule startup');
let senderCalls=0;
const mockRepo={quarantineExpired:async()=>({}),claim:async()=>({state:'claimed',token:'test-token',mail:{attempt:1,maxAttempts:5}}),conclude:async({outcome})=>({state:outcome})};
const sender={isMock:true,send:async()=>{senderCalls++;throw {status:429};}};
const dispatcher=createP103Dispatcher({repository:mockRepo,mockSender:sender});
eq((await dispatcher.tick()).code,'provider_rate_limited','429 safely retryable');
eq(senderCalls,1,'mock only');
assert.throws(()=>createP103Dispatcher({repository:mockRepo,mockSender:{send(){}}}),/p103_mock_sender_required/);checks++;
console.log(`[phase34-p1-08-integrated-gate-a] PASS (${checks} checks; 19 events, 205-candidate paging, repeat dedupe, transactional stale cancellation, 429 and hard send locks)`);
