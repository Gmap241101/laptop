import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIL_EVENTS, MAIL_EVENT_BY_KEY } from '../../server/src/mail/mail-event-catalog.mjs';
import { enqueueUserMail, rentalMailValues, memberMailValues, inquiryMailValues, listScheduledUserMailCandidates, getMailPublicSiteUrl } from '../../server/src/mail/mail-user-event-bridge.mjs';
import { P103_REAL_DELIVERY_LOCKED } from '../../server/src/mail/mail-dynoweb-dispatcher.mjs';
import { createRentalRequestUserActionRepository } from '../../server/src/rentals/rental-request-user-action-repository.mjs';
import { createRentalRequestWriteRepository } from '../../server/src/rentals/rental-request-write-repository.mjs';
let checks=0;const verify=(v,why)=>{assert.ok(v,why);checks++;};
const names=MAIL_EVENTS.filter(e=>e.recipient==='user').map(e=>e.key);
const covered=['signup_submitted','signup_approved','signup_rejected','rental_submitted','rental_approved','rental_rejected','rental_returned','rental_overdue','membership_withdrawn','rental_due_reminder','extension_approved','extension_rejected','inquiry_first_answer','inquiry_followup_answer','account_restricted','account_unrestricted','rental_cancelled'];
verify(names.length===17 && names.every(n=>covered.includes(n)),'17 exact user events');
verify(P103_REAL_DELIVERY_LOCKED===true,'no real email');
const rental={id:'request-abc1234',requesterName:'테스터',requesterTeam:'IT',requesterEmail:'person@example.com',assetCategory:'노트북',assetNo:'MK-007',startDate:'2026-10-20',dueDate:'2026-10-28',requestedAt:'2026-10-19 09:30'};
for(const event of covered){
  const values=['signup_submitted','signup_approved','signup_rejected','membership_withdrawn','account_restricted','account_unrestricted'].includes(event)
    ? memberMailValues(event,{name:'테스터',team:'IT'},{signupRequestedAt:'2026-10-20',signupReviewedAt:'2026-10-22',signupDecisionAt:'2026-10-22',withdrawnAt:'2026-10-22',restrictedAt:'2026-10-22',unrestrictedAt:'2026-10-22'})
    : event.startsWith('inquiry_') ? inquiryMailValues(event,{author_name:'테스터',author_team:'IT',created_at:new Date('2026-10-20T00:00:00Z'),title:'문의',public_id:'Q-152'}, {answerCreatedAt:'2026-10-22'})
    : rentalMailValues(event,rental,{extensionRequestedAt:'2026-10-20',extensionDecisionAt:'2026-10-22',previousRentalDueAt:'2026-10-27',newRentalDueAt:'2026-10-28',rentalCancelledAt:'2026-10-22',rentalReturnedAt:'2026-10-22'});
  verify(MAIL_EVENT_BY_KEY[event].variables.every(k=>typeof values[k]==='string'),'all placeholders populated '+event);
}
verify(getMailPublicSiteUrl({APP_ENV:'staging'})==='https://mkrental.vercel.app/','staging link');
verify(getMailPublicSiteUrl({MAIL_PUBLIC_SITE_URL:'javascript:bad'})==='https://notebook.recruit.kro.kr/', 'script URL not injected');
let policy=true;const seen=new Set();let requests=[];
const client={async query(sql,args=[]){requests.push({sql,args});
  if(sql.includes("config_key='mail-notification-settings'")) return {rows:[{payload:{events:{rental_submitted:{enabled:policy,subject:'{{name}} 신청',body:'{{rentalDueAt}}',bodyFormat:'text'}}}}]};
  if(sql.includes('INSERT INTO app_mail_outbox')) {if(seen.has(args[0]))return {rows:[]};seen.add(args[0]);return {rows:[{id:1}]}};
  return {rows:[]};}};
const payload={client,eventKey:'rental_submitted',eventId:'test-rental-1234567',recipientEmail:'PERSON@example.com',values:rentalMailValues('rental_submitted',rental)};
const inserted=await enqueueUserMail(payload); verify(inserted.queued && seen.size===1,'policy on enqueues');
verify(requests.at(-1).args[2]==='person@example.com','normalized email');
const duplicate=await enqueueUserMail(payload);verify(!duplicate.queued && duplicate.duplicate && seen.size===1,'duplicate ignored');
policy=false;const disabled=await enqueueUserMail({...payload,eventId:'test-rental-7654321'});verify(disabled.reason==='disabled' && seen.size===1,'policy OFF');
requests=[];
const skipped=await enqueueUserMail({...payload,recipientEmail:''});verify(skipped.reason==='recipient_unavailable' && requests.length===0,'invalid recipient skip');
await assert.rejects(()=>enqueueUserMail({...payload,eventKey:'admin_signup_pending'}),/user_mail_event_required/);checks++;
await assert.rejects(()=>enqueueUserMail({...payload,eventId:'x'}),/mail_event_id_invalid/);checks++;
const scheduleQueries=[];
const scheduledClient={async query(sql,args){scheduleQueries.push({sql,args});return {rows:[{request_id:'ABC-12345678',requester_email:'person@example.com',requester_name:'Kim',requester_team:'IT',requested_at_text:'2026-10-20 12:00',start_date:'2026-10-20',due_date:'2026-10-24',asset_category:'Laptop',asset_no:'N-1'}]};}};
const upcoming=await listScheduledUserMailCandidates({client:scheduledClient,eventKey:'rental_due_reminder',referenceDate:'2026-10-23'});
const overdue=await listScheduledUserMailCandidates({client:scheduledClient,eventKey:'rental_overdue',referenceDate:'2026-10-25'});
verify(upcoming.length===1 && overdue.length===1,'scheduled candidates');
verify(upcoming[0].eventId!==overdue[0].eventId && upcoming[0].values.rentalDueAt==='2026-10-24','scheduled distinct keys');
verify(scheduleQueries[0].sql.includes("status='대여중'") && scheduleQueries[0].sql.includes('INTERVAL') && scheduleQueries[1].sql.includes('< $1::date'),'scheduled status/date constraints');
await assert.rejects(()=>listScheduledUserMailCandidates({client:scheduledClient,eventKey:'admin_rental_pending',referenceDate:'2026-10-23'}),/scheduled_user_event_required/);checks++;
await assert.rejects(()=>listScheduledUserMailCandidates({client:scheduledClient,eventKey:'rental_overdue',referenceDate:'2026-99-99',limit:1001}),/mail_batch_limit_invalid/);checks++;
const hooks={
 'signup_submitted':'server/src/accounts/account-lifecycle-repository.mjs',
 'signup_approved':'server/src/members/member-authority-repository.mjs',
 'signup_rejected':'server/src/auth/user-clerk-auth-repository.mjs',
 'rental_submitted':'server/src/rentals/rental-request-write-repository.mjs',
 'rental_approved':'server/src/rentals/admin-rental-request-repository.mjs',
 'rental_rejected':'server/src/rentals/admin-rental-request-repository.mjs',
 'rental_returned':'server/src/rentals/admin-rental-request-repository.mjs',
 'membership_withdrawn':'server/src/auth/user-clerk-auth-repository.mjs',
 'extension_approved':'server/src/rentals/rental-request-user-action-repository.mjs',
 'extension_rejected':'server/src/rentals/admin-rental-request-repository.mjs',
 'inquiry_first_answer':'server/src/inquiries/inquiry-repository.mjs',
 'inquiry_followup_answer':'server/src/inquiries/inquiry-repository.mjs',
 'account_restricted':'server/src/members/member-authority-repository.mjs',
 'account_unrestricted':'server/src/members/member-authority-repository.mjs',
 'rental_cancelled':'server/src/rentals/rental-request-user-action-repository.mjs',
};
for(const [event,path] of Object.entries(hooks)) verify(readFileSync(path,'utf8').includes(`'${event}'`),'direct transaction hook '+event);
for(const [name,path] of Object.entries({web:'server/src/index.mjs',app:'server/src/app.mjs'})){
  const content=readFileSync(path,'utf8');verify(!content.includes('createP103WebDynoLoop(') && !content.includes('createP103Dispatcher('),`${name} live sending remains locked`);
}
// Transactional integration: the business SQL and Outbox insert must share the
// SAME client and a failed enqueue must cause rollback before business commit.
const requestRow={id:42,request_id:'rental-test-001',app_user_id:5,firebase_uid:'test-uid',
 requester_email:'person@example.com',requester_name:'Tester',requester_team:'IT',
 laptop_id:'asset-001',asset_category:'Laptop',asset_no:'001',start_date:'2026-10-22',
 due_date:'2026-10-25',status:'신청중',requested_at_text:'2026-10-22 09:00'};
function transactionalPool({failEnqueue=false}={}) {
  const operations=[];
  const client={async query(sql,args=[]){
    operations.push(sql.trim().split(/\s+/).slice(0,5).join(' '));
    if(sql.includes('INSERT INTO app_mail_outbox')) {
      if(failEnqueue) throw new Error('simulated_mail_outbox_unavailable');
      return {rows:[{id:88}],rowCount:1};
    }
    if(sql.includes('SELECT payload FROM app_system_configuration')) return {rows:[{payload:{events:{rental_cancelled:{enabled:true},rental_submitted:{enabled:true}}}}]};
    if(sql.includes('SELECT') && sql.includes('FROM app_rental_requests') && sql.includes('FOR UPDATE OF request')) return {rows:[requestRow],rowCount:1};
    if(sql.includes('SELECT') && sql.includes('FROM app_rental_requests') && sql.includes('idempotency_key')) return {rows:[],rowCount:0};
    if(sql.includes('overdue_count'))return {rows:[{overdue_count:0}]};
    if(sql.includes('FROM app_rental_asset_reservation_guards'))return {rows:[],rowCount:0};
    if(sql.includes('SELECT') && sql.includes('FROM app_rental_requests'))return {rows:[requestRow],rowCount:1};
    if(sql.includes('INSERT INTO app_rental_requests'))return {rows:[{id:42}],rowCount:1};
    return {rows:[],rowCount:1};
  },release(){operations.push('RELEASE')}};
  return {operations,async connect(){return client},async query(){return {rows:[]}}};
}
const cancelPool=transactionalPool();
const cancelled=await createRentalRequestUserActionRepository(cancelPool).cancelAuthoritative({appUserId:5,firebaseUid:'test-uid',requestId:'rental-test-001'});
verify(cancelled.deleted,'real cancellation repository succeeds');
verify(cancelPool.operations.some(x=>x.startsWith('INSERT INTO app_mail_outbox')),'real cancel inserts mail');
verify(cancelPool.operations.indexOf('COMMIT')>cancelPool.operations.findIndex(x=>x.startsWith('INSERT INTO app_mail_outbox')),'mail queued BEFORE COMMIT');
const failPool=transactionalPool({failEnqueue:true});
await assert.rejects(()=>createRentalRequestUserActionRepository(failPool).cancelAuthoritative({appUserId:5,firebaseUid:'test-uid',requestId:'rental-test-001'}),/simulated_mail_outbox_unavailable/);checks++;
verify(failPool.operations.includes('ROLLBACK') && !failPool.operations.includes('COMMIT'),'mail failure rolls back business transaction');
const writePool=transactionalPool();
const requestResult=await createRentalRequestWriteRepository(writePool).createAuthoritative({appUserId:5,firebaseUid:'test-uid',requesterEmail:'person@example.com',requesterName:'Tester',requesterTeam:'IT',requestId:'rental-test-001',idempotencyKey:'unique-request-001',laptopId:'asset-001',assetCategory:'Laptop',assetNo:'001',startDate:'2026-10-22',dueDate:'2026-10-25',purpose:'work',requestedAtText:'2026-10-22 09:00',referenceDate:'2026-10-22'});
verify(requestResult.reused===false,'new rental created');
verify(writePool.operations.some(x=>x.startsWith('INSERT INTO app_mail_outbox')),'new rental queues notification');
verify(writePool.operations.indexOf('COMMIT')>writePool.operations.findIndex(x=>x.startsWith('INSERT INTO app_mail_outbox')),'rental notification before COMMIT');
const failWritePool=transactionalPool({failEnqueue:true});
await assert.rejects(()=>createRentalRequestWriteRepository(failWritePool).createAuthoritative({appUserId:5,firebaseUid:'test-uid',requesterEmail:'person@example.com',requesterName:'Tester',requesterTeam:'IT',requestId:'rental-test-001',idempotencyKey:'unique-request-001',laptopId:'asset-001',assetCategory:'Laptop',assetNo:'001',startDate:'2026-10-22',dueDate:'2026-10-25',purpose:'work',requestedAtText:'2026-10-22 09:00',referenceDate:'2026-10-22'}),/simulated_mail_outbox_unavailable/);checks++;
verify(failWritePool.operations.includes('ROLLBACK') && !failWritePool.operations.includes('COMMIT'),'rental enqueue failure rolls back transaction');
console.log(`[phase34-p1-04-user-mail-events] PASS (${checks} checks; 15 direct paths + 2 scheduled candidates; no live sends)`);
