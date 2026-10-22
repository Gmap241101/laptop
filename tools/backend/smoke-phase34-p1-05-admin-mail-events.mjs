import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIL_EVENTS, MAIL_EVENT_BY_KEY } from '../../server/src/mail/mail-event-catalog.mjs';
import { P103_REAL_DELIVERY_LOCKED } from '../../server/src/mail/mail-dynoweb-dispatcher.mjs';
import { createAccountLifecycleRepository } from '../../server/src/accounts/account-lifecycle-repository.mjs';
import { createRentalRequestWriteRepository } from '../../server/src/rentals/rental-request-write-repository.mjs';
import { ADMIN_PENDING_EVENT_KEYS, listEligibleAdminMailRecipients, enqueueAdminPendingMail,
  adminSignupMailValues,adminRentalMailValues,cancelQueuedAdminSignupMail } from '../../server/src/mail/mail-admin-event-bridge.mjs';
import { createHash } from 'node:crypto';
let count=0;
const ok=(condition,message)=>{assert.ok(condition,message);count++};
const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);count++};
const isAdmin=MAIL_EVENTS.filter(item=>item.recipient==='admin').map(item=>item.key);
eq(isAdmin,[...ADMIN_PENDING_EVENT_KEYS],'only 2 admin events');
ok(P103_REAL_DELIVERY_LOCKED===true,'real sends hard disabled');
ok(MAIL_EVENT_BY_KEY.admin_signup_pending.defaultEnabled===false,'signup default OFF');
ok(MAIL_EVENT_BY_KEY.admin_rental_pending.defaultEnabled===false,'rental default OFF');
for(const key of isAdmin){ok(MAIL_EVENT_BY_KEY[key].variables.includes('name'),'name variable '+key);ok(MAIL_EVENT_BY_KEY[key].variables.includes('siteUrl'),'siteUrl '+key)}
const rv={id:'request-0001', requesterName:'신청자',requesterTeam:'기획팀',requestedAt:'2026-10-22 16:00',startDate:'2026-10-25',dueDate:'2026-10-30',assetCategory:'노트북',assetNo:'MK-01'};
const signupValues=adminSignupMailValues({name:'신청자',team:'기획팀'},'2026-10-22T07:00:00Z');
const rentalValues=adminRentalMailValues(rv);
ok(MAIL_EVENT_BY_KEY.admin_signup_pending.variables.every(k=>typeof signupValues[k]==='string'),'signup placeholders complete');
ok(MAIL_EVENT_BY_KEY.admin_rental_pending.variables.every(k=>typeof rentalValues[k]==='string'),'rental placeholders complete');
eq(signupValues.signupRequestedAt,'2026-10-22T07:00:00Z','signup timestamp');
eq(rentalValues.rentalDueAt,'2026-10-30','rental due date');
eq(rentalValues.assetCode,'MK-01','asset number');
await assert.rejects(()=>enqueueAdminPendingMail({client:{query:async()=>({rows:[]})},eventKey:'rental_submitted',eventId:'request:123456',values:rentalValues}),/admin_mail_event_required/);count++;
await assert.rejects(()=>enqueueAdminPendingMail({client:{query:async()=>({rows:[]})},eventKey:'admin_signup_pending',eventId:'tiny',values:signupValues}),/mail_event_id_invalid/);count++;
await assert.rejects(()=>enqueueAdminPendingMail({client:{query:async()=>({rows:[]})},eventKey:'admin_signup_pending',eventId:'x'.repeat(257),values:signupValues}),/mail_event_id_invalid/);count++;
let enabled=false;let recipients=[{auth_email:' OWNER@Example.com '},{auth_email:'owner@example.com'},{auth_email:'admin@example.com'},{auth_email:'bad-address'},{auth_email:'DISABLED@invalid'}];let readCount=0;let insertCount=0;let adminQueryCount=0;const seen=new Set();let inserts=[];
const mock={async query(sql,args=[]){readCount++;
  if(sql.includes("config_key='mail-notification-settings'")) return {rows:[{payload:{events:{admin_signup_pending:{enabled,subject:'관리자 가입 {{name}}',body:'{{signupRequestedAt}}',bodyFormat:'text'}}}}]};
  if(sql.includes('FROM app_admin_identity_registry')){adminQueryCount++;return {rows:recipients}};
  if(sql.includes('INSERT INTO app_mail_outbox')){insertCount++;inserts.push(args);if(seen.has(args[0]))return {rows:[],rowCount:0};seen.add(args[0]);return {rows:[{id:insertCount}],rowCount:1}};
  return {rows:[],rowCount:0};}};
let p={client:mock,eventKey:'admin_signup_pending',eventId:'signup:test12345',values:signupValues};
const off=await enqueueAdminPendingMail(p);
eq(off.reason,'disabled','policy OFF');
eq(adminQueryCount,0,'OFF does not read admin registry');
eq(insertCount,0,'OFF queues nothing');
enabled=true;
let on=await enqueueAdminPendingMail(p);
eq(on.queued,2,'two valid distinct recipients');
eq(on.recipients,2,'deduped recipients');
eq(adminQueryCount,1,'registry queried exactly once');
eq(inserts.map(x=>x[2]),['owner@example.com','admin@example.com'],'normalizes recipient');
let retry=await enqueueAdminPendingMail(p);
eq(retry.queued,0,'duplicate retry queues zero');
eq(retry.duplicates,2,'dedupe per recipient');
eq(seen.size,2,'same exact unique dedupe hash');
ok(inserts.every(i=>i[1]==='admin_signup_pending'),'only admin key stored');
ok(inserts.every(i=>i[3]==='관리자 가입 신청자'),'template rendered safely');
recipients=[];
eq((await enqueueAdminPendingMail({...p,eventId:'signup:another123'})).reason,'no_eligible_admin','no recipient tolerated');
recipients=Array.from({length:101},(_,i)=>({auth_email:`a${i}@example.com`}));
await assert.rejects(()=>enqueueAdminPendingMail({...p,eventId:'signup:next1234'}),/mail_admin_recipient_limit_exceeded/);count++;
const eligQueries=[];
await listEligibleAdminMailRecipients({async query(sql){eligQueries.push(sql);return {rows:[]}}});
ok(eligQueries[0].includes("status='active'"),'exclude inactive/retired');
ok(eligQueries[0].includes("clerk_link_state='linked'"),'require Clerk link');
ok(eligQueries[0].includes('clerk_user_id'),'require Clerk id');
ok(eligQueries[0].includes('lock_until'),'filter locked accounts');
ok(eligQueries[0].includes("admin_role IN ('owner','admin')"),'only admin roles');
ok(eligQueries[0].includes('LIMIT 101'),'bound admin recipients');
const key=(email,id)=>createHash('sha256').update(`admin_signup_pending\0${id}\0${email}`,'utf8').digest('hex');
const keepKey=key('owner@example.com','signup:otheruid');
const ownKey=key('owner@example.com','signup:correctuid');
let deletedKeys=[];const cancelled=await cancelQueuedAdminSignupMail({client:{async query(sql,args){
  if(sql.includes('SELECT dedupe_key'))return {rows:[{dedupe_key:ownKey,recipient_email:'owner@example.com'},{dedupe_key:keepKey,recipient_email:'owner@example.com'},{dedupe_key:'X'.repeat(64),recipient_email:'bad'}]};
  if(sql.includes('DELETE FROM app_mail_outbox')){deletedKeys=args[0];return {rowCount:1,rows:[]}};
  return {rows:[]};}},firebaseUid:'correctuid'});
eq(cancelled,1,'compensation removes matched pending mail');
eq(deletedKeys,[ownKey],'preserves unrelated event');

// Exercise the actual rental create transaction with the admin notification
// enabled and user notification disabled, then with an artificial Outbox error.
const requestInput={appUserId:5,firebaseUid:'test-uid',requesterEmail:'person@example.com',requesterName:'Test',requesterTeam:'IT',requestId:'rental-test-001',idempotencyKey:'unique-rental-001',laptopId:'asset-001',assetCategory:'Laptop',assetNo:'001',startDate:'2026-10-22',dueDate:'2026-10-25',purpose:'work',requestedAtText:'2026-10-22 09:00',referenceDate:'2026-10-22'};
function rentalPool(fail=false){const operations=[],stored=[];
  const client={async query(sql,args=[]){operations.push(sql.trim().split(/\s+/).slice(0,5).join(' '));
    if(sql.includes('INSERT INTO app_mail_outbox')){if(fail)throw new Error('mail_outbox_test_error');stored.push(args);return {rows:[{id:101}],rowCount:1}};
    if(sql.includes("config_key='mail-notification-settings'"))return {rows:[{payload:{events:{rental_submitted:{enabled:false},admin_rental_pending:{enabled:true}}}}]};
    if(sql.includes('FROM app_admin_identity_registry'))return {rows:[{auth_email:'owner@example.com'},{auth_email:'admin@example.com'}]};
    if(sql.includes('FROM app_rental_requests') && sql.includes('idempotency_key'))return {rows:[],rowCount:0};
    if(sql.includes('overdue_count'))return {rows:[{overdue_count:0}],rowCount:1};
    if(sql.includes('FROM app_rental_asset_reservation_guards'))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO app_rental_requests'))return {rows:[{id:42}],rowCount:1};
    if(sql.includes('FROM app_rental_requests'))return {rows:[{...requestInput,id:42,request_id:requestInput.requestId,app_user_id:5,firebase_uid:requestInput.firebaseUid,requester_email:requestInput.requesterEmail,requester_name:requestInput.requesterName,requester_team:requestInput.requesterTeam,laptop_id:requestInput.laptopId,asset_category:requestInput.assetCategory,asset_no:requestInput.assetNo,start_date:requestInput.startDate,due_date:requestInput.dueDate,status:'신청중',requested_at_text:requestInput.requestedAtText}],rowCount:1};
    return {rows:[],rowCount:1};},release(){operations.push('RELEASE')}};
  return {operations,stored,async connect(){return client},async query(){return {rows:[]}}};
}
const rp=rentalPool();const rental=await createRentalRequestWriteRepository(rp).createAuthoritative(requestInput);
ok(rental.reused===false,'real rental new, not reused');
eq(rp.stored.length,2,'two administrators get notifications');
ok(rp.stored.every(x=>x[1]==='admin_rental_pending'),'correct admin rental type');
ok(rp.operations.indexOf('COMMIT')>rp.operations.findIndex(x=>x.startsWith('INSERT INTO app_mail_outbox')),'mail queued before business commit');
const fp=rentalPool(true);
await assert.rejects(()=>createRentalRequestWriteRepository(fp).createAuthoritative(requestInput),/mail_outbox_test_error/);count++;
ok(fp.operations.includes('ROLLBACK')&&!fp.operations.includes('COMMIT'),'mail failures rollback rental transaction');

// The signup repository must use the same PostgreSQL transaction. Test both
// pending approval and auto-approved variants without creating real Clerk users.
function signupPool(status='pending',fail=false){const operations=[],stored=[];const client={async query(sql,args=[]){
 operations.push(sql.trim().split(/\s+/).slice(0,5).join(' '));
 if(sql.includes('INSERT INTO app_mail_outbox')){if(fail)throw new Error('mail_outbox_test_error');stored.push(args);return {rows:[{id:200}],rowCount:1}};
 if(sql.includes("config_key='mail-notification-settings'"))return {rows:[{payload:{events:{signup_submitted:{enabled:false},signup_approved:{enabled:false},admin_signup_pending:{enabled:true}}}}]};
 if(sql.includes('FROM app_admin_identity_registry'))return {rows:[{auth_email:'owner@example.com'}]};
 if((sql.includes('FROM app_member_accounts') && sql.includes('WHERE lower(email)')) || sql.includes('SELECT firebase_uid, status FROM app_member_accounts') || sql.includes('SELECT status FROM app_member_accounts'))return {rows:[],rowCount:0};
 if(sql.includes('SELECT firebase_uid, email, masked_email, name, team, phone, status, identity_key'))return {rows:[{firebase_uid:'test-uid',status}],rowCount:1};
 return {rows:[],rowCount:1};},release(){operations.push('RELEASE')}};
 return {operations,stored,async connect(){return client},async query(){return {rows:[]}}};}
const signupInput={firebaseUid:'clerk-user-00001',email:'person@example.com',maskedEmail:'p***@example.com',name:'Test',team:'IT',phone:'01012345678',status:'pending',identityKey:'team:test',recoveryKey:'team:test:010',decisions:[],signupOrigin:'user'};
const sp=signupPool();const created=await createAccountLifecycleRepository(sp).createSignupAccount(signupInput);
ok(created.status==='pending','pending signup created');
eq(sp.stored.length,1,'pending signup alerts eligible owner');
eq(sp.stored[0][1],'admin_signup_pending','admin signup key');
ok(sp.operations.indexOf('COMMIT')>sp.operations.findIndex(x=>x.startsWith('INSERT INTO app_mail_outbox')),'signup queued before commit');
const sap=signupPool('active');await createAccountLifecycleRepository(sap).createSignupAccount({...signupInput,status:'active'});
eq(sap.stored.length,0,'auto approval does not request admin review');
const sad=signupPool('pending');await createAccountLifecycleRepository(sad).createSignupAccount({...signupInput,signupOrigin:'admin'});
eq(sad.stored.length,0,'admin-created account no review notification');
const sf=signupPool('pending',true);
await assert.rejects(()=>createAccountLifecycleRepository(sf).createSignupAccount(signupInput),/mail_outbox_test_error/);count++;
ok(sf.operations.includes('ROLLBACK')&&!sf.operations.includes('COMMIT'),'signup mail failure rolls back entire transaction');
// Real compensation repository path: Clerk provisioning failure must not
// leave a false pending administrator approval mail in the shared outbox.
const rollbackOps=[]; const pendingDedupe=key('owner@example.com','signup:clerk-user-00001');
const rollbackClient={async query(sql,args=[]){rollbackOps.push({sql,args});
  if(sql.includes('SELECT firebase_uid, app_user_id, lifecycle_authority_mode, email')) return {rows:[{firebase_uid:'clerk-user-00001',app_user_id:null,lifecycle_authority_mode:'postgresql-authoritative',email:'person@example.com'}],rowCount:1};
  if(sql.includes('SELECT dedupe_key, recipient_email')) return {rows:[{dedupe_key:pendingDedupe,recipient_email:'owner@example.com'}],rowCount:1};
  if(sql.includes('DELETE FROM app_mail_outbox'))return {rowCount:1,rows:[]};
  return {rows:[],rowCount:1};},release(){}};
const rolled=await createAccountLifecycleRepository({async connect(){return rollbackClient},async query(){return {rows:[]}}}).rollbackUnlinkedSignup({firebaseUid:'clerk-user-00001'});
ok(rolled,'account cleanup succeeds');
ok(rollbackOps.some(op=>op.sql.includes('DELETE FROM app_mail_outbox')&&op.args[0]?.includes?.(pendingDedupe)),'queued admin notification removed during compensation');
ok(rollbackOps.some(op=>op.sql==='COMMIT'),'compensating transaction committed');
for(const file of ['server/src/app.mjs','server/src/index.mjs']){
 const source=readFileSync(file,'utf8');ok(!source.includes('createP103Dispatcher('),'no live sender '+file);ok(!source.includes('createP103WebDynoLoop('),'no cron/sender '+file);}
const signupSource=readFileSync('server/src/accounts/account-lifecycle-repository.mjs','utf8');
ok(signupSource.includes('cancelQueuedAdminSignupMail({client,firebaseUid:uid})'),'signup rollback cleans queued admin notice');
console.log(`[phase34-p1-05-admin-mail-events] PASS (${count} checks, 2 admin events, transaction & dedup mocks, no real sends)`);
