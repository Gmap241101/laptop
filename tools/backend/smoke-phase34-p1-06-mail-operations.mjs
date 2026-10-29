import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMailQueueOperations } from '../../server/src/mail/mail-queue-operations.mjs';
import { createP106ScheduledEnqueue, getSeoulBusinessDate, startP106ScheduledLoop } from '../../server/src/mail/mail-scheduled-enqueue.mjs';
import { createAdminIdentityRepository } from '../../server/src/auth/admin-identity-repository.mjs';
import { listEligibleAdminMailRecipients } from '../../server/src/mail/mail-admin-event-bridge.mjs';
import { P103_REAL_DELIVERY_LOCKED } from '../../server/src/mail/mail-dynoweb-dispatcher.mjs';
let checks=0;
const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
const ok=(v,msg)=>{assert.ok(v,msg);checks++;};
const sf=(name)=>readFileSync(new URL(`../../${name}`,import.meta.url),'utf8');
const migration=sf('server/migrations/046_phase34_p1_06_admin_mail_preference.sql');
for(const text of ['mail_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE','app_mail_queue_actions','source_request_id','source_due_date','scheduled_for_date','app_admin_mail_preference_audit'])ok(migration.includes(text),'migration '+text);
ok(!/CREATE DATABASE|CREATE EXTENSION|\bBEGIN\s*;|\bCOMMIT\s*;/i.test(migration),'same PG migration');
ok(P103_REAL_DELIVERY_LOCKED === true,'sender still hard locked');
const ui=sf('src/admin/AdminAccountEditDialog.jsx');
for(const text of ['이메일 알림 수신','role="switch"','aria-checked={form.mailNotificationsEnabled === true}','adminRole','owner'])ok(ui.includes(text),'owner setting UI '+text);
for(const path of ['src/features/auth/useAdminIdentityPolicyController.js','src/features/auth/useAuthIdentityPolicySubscriptionController.js']){ok(sf(path).includes('mailNotificationsEnabled: account.mailNotificationsEnabled !== false'),'admin list retains preference: '+path);}
const controller=sf('src/features/auth/useAdminAccountManagementController.js');
for(const text of ['startEditAdminAccount','mailNotificationsEnabled: account.mailNotificationsEnabled !== false','mailNotificationsEnabled: adminAccountEditForm.mailNotificationsEnabled === true'])ok(controller.includes(text),'editable controller '+text);
const backend=sf('server/src/auth/admin-clerk-auth-service.mjs');
ok(backend.includes("assertOwner(actor);"),'server owner guard');
ok(backend.includes('admin_mail_preference_invalid'),'backend strict boolean');
ok(backend.includes('adminLoginId !== target.adminLoginId || nextRole !== target.adminRole'),'pure preference edit does not mutate Clerk identity');
const adminSql=sf('server/src/mail/mail-admin-event-bridge.mjs');
ok(adminSql.includes('mail_notifications_enabled=TRUE'),'new recipients preference filter');
const deliverySql=sf('server/src/mail/mail-delivery-repository.mjs');
ok(deliverySql.includes('mail_admin_recipient_disabled'),'previously queued recipient guard');
ok(deliverySql.includes('mail_scheduled_rental_changed'),'stale rental guard');
ok(deliverySql.includes('FOR SHARE'),'serialization before claim');
const routes=sf('server/src/app.mjs');
for(const text of ["'/api/admin/mail-queue'",'/cancel','mailQueueOperations.cancel','admin_owner_required'])ok(routes.includes(text),'owner queue API '+text);
const startup=sf('server/src/index.mjs');
ok(startup.includes("check.rows[0]?.payload?.delivery?.enabled!==true") && startup.includes("config.appEnv==='production'&&process.env.P109_OPERATOR_CONTROL_ENABLED==='true'&&process.env.MAIL_ENABLED==='true'"),'scheduled enqueue requires production gate and PostgreSQL approval');
ok(!startup.includes('createP103Dispatcher'),'sender not started');
const mockedAdmins={query:async(sql)=>({rows:[{auth_email:'OWNER@example.com'},{auth_email:'admin@example.com'}]})};
eq(await listEligibleAdminMailRecipients(mockedAdmins),Object.freeze(['owner@example.com','admin@example.com']),'admin distinct email');
const adminRepo=createAdminIdentityRepository({query:async(sql,args)=>{
  if(sql.includes('), changed AS')){
    eq(args[6],false,'opt out boolean persistence');
    ok(sql.includes("state='cancelled'"),'cancel unsent');
    ok(sql.includes("state IN ('queued','retry')"),'not cancel sent/processing');
    ok(sql.includes('mail_admin_opted_out'),'reason');
    ok(sql.includes('app_admin_mail_preference_audit'),'audit preference');
    return {rows:[{firebase_uid:'owner-id',auth_email:'owner@example.com',admin_role:'owner',status:'active',mail_notifications_enabled:false}]};
  }
  return {rows:[]};
}});
const changed=await adminRepo.update({legacyAdminKey:'owner-id',adminLoginId:'owner',organizationName:'team',userName:'name',phone:'',adminRole:'owner',mailNotificationsEnabled:false,actorClerkUserId:'user_abcdefghijklmn'});
eq(changed.mailNotificationsEnabled,false,'registry returns false');
await assert.rejects(()=>adminRepo.update({legacyAdminKey:'x',mailNotificationsEnabled:'false'}),/mail_admin_preference_boolean_required/);checks++;
let queueCalls=[];
const pool={async query(sql,args){queueCalls.push({sql,args});
  if(sql.includes('ORDER BY o.created_at'))return {rows:[{id:'1',event_key:'admin_rental_pending',recipient_email:'owner@example.com',state:'queued',attempt_count:0,created_at:'2026-10-22T00:00:00Z'}]};
  if(sql.includes('GROUP BY state'))return {rows:[{state:'queued',total:1}]};
  if(sql.includes('WITH target AS'))return {rows:[{id:'1'}]};
  return {rows:[]};
},async connect(){throw Error('unused');}};
const ops=createMailQueueOperations(pool);
const list=await ops.list();
eq(list.authority,'postgresql','list authority');
eq(list.rows.length,1,'list one');
eq(list.rows[0].recipientMasked,'o***@example.com','mask personal email');
ok(!JSON.stringify(list).includes('owner@example.com'),'no full email');
eq(list.counts.queued,1,'summary count');
await assert.rejects(()=>ops.list({limit:1000}),/mail_queue_limit_invalid/);checks++;
await assert.rejects(()=>ops.cancel({id:'1 OR 1=1',actorClerkUserId:'user_abcdefghijklmn'}),/mail_queue_id_invalid/);checks++;
await assert.rejects(()=>ops.cancel({id:'1',actorClerkUserId:'x'}),/mail_actor_invalid/);checks++;
const cancelled=await ops.cancel({id:'1',actorClerkUserId:'user_abcdefghijklmn'});
eq(cancelled.cancelled,true,'cancel acknowledged');
ok(queueCalls.at(-1).sql.includes('app_mail_queue_actions'),'audit captured');
ok(queueCalls.at(-1).sql.includes('previous_state'),'audit real previous state');
ok(queueCalls.at(-1).sql.includes("state IN ('queued','retry')"),'cancel only not claimed');
const simulatedRows=[{request_id:'request-12345678',requester_email:'user@example.com',requester_name:'홍길동',requester_team:'기획',requested_at_text:'2026-10-20',start_date:'2026-10-20',due_date:'2026-10-23',asset_category:'노트북',asset_no:'MK-A'}];
let begin=0,commit=0,rollbacks=0,inserts=0,updates=0,activeKeys=['rental_due_reminder','rental_overdue'],failOnInsert=false;
let insertedKeys=new Set();
const fakeClient={async query(sql,args=[]){
  if(sql==='BEGIN'){begin++;return {rows:[]};}
  if(sql==='COMMIT'){commit++;return {rows:[]};}
  if(sql==='ROLLBACK'){rollbacks++;return {rows:[]};}
  if(sql.includes('pg_try_advisory_xact_lock'))return {rows:[{locked:true}]};
  if(sql.includes('FROM app_system_configuration'))return {rows:[{payload:{events:Object.fromEntries(activeKeys.map(k=>[k,{enabled:true,subject:'알림 {{name}}',body:'날짜 {{rentalDueAt}}',bodyFormat:'text'}]))}}]};
  if(sql.includes('FROM app_rental_requests r'))return {rows:sql.includes("r.due_date <")?[]:simulatedRows};
  if(sql.includes('INSERT INTO app_mail_outbox')) { if(failOnInsert)throw Error('mock_insert_failed');inserts++;if(insertedKeys.has(args[0]))return {rows:[]};insertedKeys.add(args[0]);return {rows:[{id:inserts}]}; }
  if(sql.includes('UPDATE app_mail_outbox SET source_request_id')){updates++;eq(args[1],'request-12345678','scheduled source id');eq(args[2],'2026-10-23','scheduled due date');return {rowCount:1,rows:[]};}
  return {rows:[]};
},release(){}};
const sched=createP106ScheduledEnqueue({connect:async()=>fakeClient});
const first=await sched.tick({referenceDate:'2026-10-22'});
eq(first.state,'complete','job complete');
eq(first.queued,1,'queue due reminder');
eq(first.disabled,0,'both toggles on');
eq(updates,1,'source persisted');
eq(commit,1,'same transaction commit');
const second=await sched.tick({referenceDate:'2026-10-22'});
eq(second.queued,0,'idempotent rerun');
eq(second.duplicates,1,'duplicate detected');
activeKeys=[];
const third=await sched.tick({referenceDate:'2026-10-22'});
eq(third.disabled,2,'both toggles off');
eq(third.queued,0,'off no queued');
activeKeys=['rental_due_reminder'];failOnInsert=true;
await assert.rejects(()=>sched.tick({referenceDate:'2026-10-24'}),/mock_insert_failed/);checks++;
ok(rollbacks>=1,'queue failure rolls back');
await assert.rejects(()=>sched.tick({referenceDate:'not-a-date'}),/mail_schedule_arguments_invalid/);checks++;
const loop=startP106ScheduledLoop({runner:sched,enabled:false,schedule:()=>{throw Error('must not schedule');}});
eq(loop.start(),false,'disabled scheduler never starts');
eq(getSeoulBusinessDate(new Date('2026-10-22T15:30:00Z')),'2026-10-23','KST midnight boundary');
console.log(`[phase34-p1-06-mail-operations] PASS (${checks} assertions; manual schedule gated, no sends)`);
