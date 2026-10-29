import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIL_EVENTS } from '../../server/src/mail/mail-event-catalog.mjs';
import { DEFAULT_MAIL_DESIGN,validateMailDesign,renderDesignedMail,formatMailKoreanDateTime,createMailPreviewValues } from '../../server/src/mail/mail-template-design.mjs';
import { getMailPublicSiteUrl } from '../../server/src/mail/mail-public-site-url.mjs';
import {createMailNotificationSettingsService} from '../../server/src/mail/mail-notification-settings-service.mjs';
import {startP106ScheduledLoop} from '../../server/src/mail/mail-scheduled-enqueue.mjs';
import { nextMailQueueChipFilter } from '../../src/admin/mailQueueFilter.js';
let n=0; const ok=(v,msg)=>{assert.ok(v,msg);n++};const equal=(a,b,msg)=>{assert.deepEqual(a,b,msg);n++};
const code=(p)=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
equal(formatMailKoreanDateTime('2026-10-29T06:56:32.635Z'),'2026년 10월 29일 오후 3시 56분','actual UTC to KST');
equal(formatMailKoreanDateTime('2026-10-22 15:00'),'2026년 10월 22일 오후 3시 00분','sample local KST');
equal(formatMailKoreanDateTime('2026-10-30'),'2026년 10월 30일','calendar due date');
equal(getMailPublicSiteUrl({APP_ENV:'production'}),'https://notebook.recruit.kro.kr/','official production site');
equal(getMailPublicSiteUrl({APP_ENV:'staging'}),'https://mkrental.vercel.app/','staging explicit URL');
equal(getMailPublicSiteUrl({APP_ENV:'production',MAIL_PUBLIC_SITE_URL:'https://example.com/'}),'https://example.com/','configured public site');
assert.throws(()=>validateMailDesign({...DEFAULT_MAIL_DESIGN,headerBackground:'javascript:alert(1)'}),{code:'mail_design_invalid'});n++;
assert.throws(()=>validateMailDesign({...DEFAULT_MAIL_DESIGN,headerPadding:-1}),{code:'mail_design_invalid'});n++;
assert.throws(()=>validateMailDesign({...DEFAULT_MAIL_DESIGN,highlightText:'<script>bad</script>'}),{code:'mail_design_invalid'});n++;
assert.throws(()=>validateMailDesign({...DEFAULT_MAIL_DESIGN,buttonText:'클릭',buttonUrl:'javascript:alert(1)'}),{code:'mail_design_invalid'});n++;
const styling=validateMailDesign({...DEFAULT_MAIL_DESIGN,outerBackground:'#112233',headerBackground:'#445566',headerAlign:'center',bodyPadding:30,highlightText:'안내',buttonText:'사이트 열기',buttonUrl:'https://notebook.recruit.kro.kr/'});
for(const event of MAIL_EVENTS){
 const values=createMailPreviewValues(event.variables);
 const result=renderDesignedMail({template:{subject:event.defaultSubject,body:event.defaultBody,bodyFormat:'text'},values,variables:event.variables,design:styling});
 ok(result.html.includes('#112233')&&result.html.includes('#445566'),'all event styles '+event.key);
 ok(!result.html.includes('mkrental.vercel.app'),'no stale prod sample URL '+event.key);
 ok(!result.html.includes('2026-10-22 15:00'),'sample datetime normalized '+event.key);
 ok(result.html.includes('안내'),'optional notice block '+event.key);
 ok(result.html.includes('사이트 열기')&&result.html.includes('https://notebook.recruit.kro.kr/'),'safe link button '+event.key);
}
let payload={revision:0,events:{},audit:[]},commits=0;
const db={async query(sql){if(sql.includes('SELECT payload FROM app_system_configuration'))return {rows:[{payload}]};throw Error('unexpected read SQL');},
 async connect(){return {async query(sql,args=[]){
  if(['BEGIN','ROLLBACK','COMMIT'].includes(sql)){if(sql==='COMMIT')commits++;return {rows:[]};}
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('SELECT payload FROM app_system_configuration'))return {rows:[{payload}]};
  if(sql.includes('INSERT INTO app_system_configuration')){payload=JSON.parse(args[1]);return {rowCount:1};}
  throw Error('unexpected transaction SQL '+sql.slice(0,60));},release(){}};}};
const service=createMailNotificationSettingsService(db);
let view=await service.list();ok(view.design.senderName&&view.designDraft.senderName,'backwards compatible defaults');
const edit=validateMailDesign({...DEFAULT_MAIL_DESIGN,headerBackground:'#225588',bodyPadding:34});
view=await service.saveDraft({input:{...edit,expectedRevision:0},actorClerkUserId:'test-owner'});
equal(view.revision,1,'draft increments revision');equal(view.design.headerBackground,'#FF6B00','draft does not impact running emails');equal(view.designDraft.headerBackground,'#225588','draft persisted separately');
await assert.rejects(service.saveDraft({input:{...edit,expectedRevision:0},actorClerkUserId:'test-owner'}),{code:'mail_settings_revision_conflict'});n++;
view=await service.publishDesign({expectedRevision:1,actorClerkUserId:'test-owner'});
equal(view.revision,2,'publish increments revision');equal(view.design.headerBackground,'#225588','publish impacts subsequent messages');
equal(view.designVersions[0].revision,0,'original style retained');
const changed=validateMailDesign({...edit,footerBackground:'#002244'});
view=await service.saveDraft({input:{...changed,expectedRevision:2},actorClerkUserId:'test-owner'});
view=await service.publishDesign({expectedRevision:3,actorClerkUserId:'test-owner'});
equal(view.design.footerBackground,'#002244','new publication');
view=await service.publishDesign({expectedRevision:4,restoreRevision:2,actorClerkUserId:'test-owner'});
equal(view.design.headerBackground,'#225588','restore previous published design');equal(view.design.footerBackground,DEFAULT_MAIL_DESIGN.footerBackground,'restore original footer');
equal(view.designVersions.length,3,'bounded design history preserved');equal(commits,5,'all designs committed atomically');
for(const state of ['queued','retry','processing','sent','failed','cancelled','uncertain']){
  const first=nextMailQueueChipFilter('all',state,'문의 답변');
  equal(first,{status:state,page:1,search:'문의 답변'},'status filter retains search '+state);
  const again=nextMailQueueChipFilter(state,state,'문의 답변');
  equal(again,{status:'all',page:1,search:'문의 답변'},'repeat status returns all '+state);
}
const admin=code('src/admin/AdminMailNotificationsPanel.jsx');
for(const marker of ['nextMailQueueChipFilter','setQueuePage(1)','queueSearchSettled','OwnerSettingsBadge',"manageAdminMailDesign('draft'",'운영 적용','색상 확정','필수 본문 블록'])ok(admin.includes(marker),'UI '+marker);
ok(!admin.includes('실제 이메일 발송은 아직 시작되지 않았습니다.'),'stale no-live-send banner removed');
ok(!admin.includes('실메일 발송은 비활성 상태입니다.'),'stale status removed');
const shared=code('src/components/CommonUI.jsx'),sec=code('src/admin/AdminAccountSecurityPanel.jsx');
ok(shared.includes('export function OwnerSettingsBadge')&&sec.includes('<OwnerSettingsBadge'),'owner header style single shared component');
const app=code('server/src/app.mjs');
for(const route of ['/api/admin/mail-design/draft','/api/admin/mail-design/publish','/api/admin/mail-design/restore'])ok(app.includes(route),'server design auth route '+route);
const scheduled=code('server/src/mail/mail-user-event-bridge.mjs');
ok(scheduled.includes('prior.source_due_date=r.due_date'),'legacy overdue dedup');
ok(scheduled.includes("?'overdue':'pre'"),'new static overdue event key');
let task=null,checks=0;const job=startP106ScheduledLoop({enabled:true,runner:{async tick(){checks++;return {state:'complete'};}},now:()=>new Date('2026-10-29T00:00:00Z'),schedule:cb=>(task=cb),cancel:()=>{task=null}});
ok(job.start(),'existing web dyno schedule starts'); task();await new Promise(setImmediate);equal(checks,1,'9 AM KST scan allowed');ok(job.stop(),'schedule can stop');
let pre9=null;const noScan=startP106ScheduledLoop({enabled:true,runner:{async tick(){throw Error('must not run before 9AM');}},now:()=>new Date('2026-10-28T23:59:00Z'),schedule:cb=>(pre9=cb)});noScan.start();pre9();noScan.stop();n++;
console.log(`[P1-10] PASS (${n} checks, event sample 19, draft/publish/restore, no external delivery)`);
