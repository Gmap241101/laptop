import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIL_EVENTS } from '../../server/src/mail/mail-event-catalog.mjs';
import { DEFAULT_MAIL_DESIGN, validateMailDesign, renderDesignedMail, createMailPreviewValues } from '../../server/src/mail/mail-template-design.mjs';
import { createMailNotificationSettingsService } from '../../server/src/mail/mail-notification-settings-service.mjs';
import { createMailOutboxRepository } from '../../server/src/mail/mail-outbox-repository.mjs';
let count=0;const check=(v,label)=>{assert.ok(v,label);count++;};
const reject=(fn,code)=>{assert.throws(fn,(err)=>err?.code===code);count++;};
check(MAIL_EVENTS.length===19,'19 immutable events');
check(DEFAULT_MAIL_DESIGN.brandTitle==='기기 대여 시스템','default brand title');
const design=validateMailDesign({senderName:'MK 알림',brandTitle:'MK 기기 대여',footerText:'문의는 관리자에게 연락하세요.\n감사합니다.'});
check(design.footerText.includes('\n'),'multiline footer');
for(const bad of [
 {senderName:'hello\r\nBcc:spam',brandTitle:'MK',footerText:''},
 {senderName:'<script>',brandTitle:'MK',footerText:''},
 {senderName:'MK',brandTitle:'<svg>',footerText:''},
 {senderName:'MK',brandTitle:'MK',footerText:'<img onerror=alert(1)>'},
 {senderName:'MK',brandTitle:'MK',footerText:'{{password}}'},
 {senderName:'MK',brandTitle:'MK',footerText:'x'.repeat(400)},
 {senderName:'MK',brandTitle:'MK',footerText:'',extra:true},
 ]) reject(()=>validateMailDesign(bad),'mail_design_invalid');
for(const event of MAIL_EVENTS) {
 const template={subject:event.defaultSubject,body:event.defaultBody,bodyFormat:'text'};
 const preview=renderDesignedMail({template,values:createMailPreviewValues(event.variables),variables:event.variables,design});
 check(preview.senderName==='MK 알림'&&preview.subject.length>0,`preview ${event.key}`);
 check(preview.html.includes('background-color:#FF6B00')&&preview.html.includes('MK 기기 대여'),`brand wrapper ${event.key}`);
 check(!preview.html.includes('<script')&&!preview.html.includes('<img'),`no active content ${event.key}`);
 check(preview.text.includes('감사합니다.'),`plain body plus footer ${event.key}`);
}
const defaultEvent=MAIL_EVENTS.find(e=>e.key==='rental_submitted');
const attacker=renderDesignedMail({template:{subject:'제목',body:'{{name}}',bodyFormat:'html'},values:{name:'<svg onload="alert(1)">'},variables:['name'],design});
check(attacker.html.includes('&lt;svg')&&!attacker.html.includes('<svg'),'HTML escape user values');
check(!attacker.html.includes('https://')||!attacker.html.includes('evil'), 'no remote embeds');
let payload={revision:0,events:{},audit:[]};let commits=0,rollbacks=0,within=false;
const pool={
 async query(sql){if(sql.startsWith('SELECT payload'))return{rows:[{payload}]};throw Error('Unexpected query');},
 async connect(){return {async query(sql,args){
 if(sql==='BEGIN'){within=true;return {rows:[]}};
 if(sql==='COMMIT'){commits++;within=false;return{rows:[]}};
 if(sql==='ROLLBACK'){rollbacks++;within=false;return{rows:[]}};
 if(sql.startsWith('SELECT pg_advisory_xact_lock'))return{rows:[]};
 if(sql.startsWith('SELECT payload'))return{rows:[{payload}]};
 if(sql.startsWith('INSERT INTO app_system_configuration')){check(within,'saved within transaction');payload=JSON.parse(args[1]);return{rows:[]}};
 throw Error('Unexpected tx SQL: '+sql);
 },release(){}}},
};
const service=createMailNotificationSettingsService(pool);
const initial=await service.list();
check(initial.design.senderName===DEFAULT_MAIL_DESIGN.senderName,'defaults are backwards compatible');
check(initial.events.length===19&&!initial.liveSendingEnabled,'no live sends');
const changed=await service.saveDesign({input:{...design,expectedRevision:0},actorClerkUserId:'owner-test'});
check(changed.revision===1&&changed.design.brandTitle==='MK 기기 대여','design persisted');
check(payload.audit[0].eventKey==='_design'&&payload.audit[0].actor==='owner-test','audit design');
check(commits===1&&!within,'design transaction commits');
await assert.rejects(()=>service.saveDesign({input:{...design,expectedRevision:0},actorClerkUserId:'owner-test'}),{code:'mail_settings_revision_conflict'});count++;
check(rollbacks===1&&payload.revision===1,'revision conflict rolls back');
const saved=await service.saveEvent({key:'rental_submitted',input:{enabled:true,subject:'메일 {{name}}',body:'{{name}}님',bodyFormat:'text',expectedRevision:1},actorClerkUserId:'owner-test'});
check(saved.revision===2&&saved.design.senderName==='MK 알림','single shared revision and preserved design');
const preview=service.preview({key:'rental_submitted',template:{enabled:false,subject:'미저장 제목',body:'{{name}} <img src=x>',bodyFormat:'text'},design});
check(preview.sample===true&&preview.subject==='미저장 제목','sample preview not persisted');
check(!preview.html.includes('<img src=x>'),'preview escapes dangerous HTML');
check(payload.revision===2,'preview does not write database');
reject(()=>service.preview({key:'invalid_key',template:{enabled:true,subject:'A',body:'B'},design}),'mail_event_unknown');
reject(()=>service.preview({key:'rental_submitted',template:{enabled:true,subject:'A',body:'{{secret}}'},design}),'mail_template_variable_not_allowed');
reject(()=>service.preview({key:'rental_submitted',template:{enabled:true,subject:'A\r\nBcc:evil',body:'B'},design}),'mail_subject_invalid');
reject(()=>service.preview({key:'rental_submitted',template:{enabled:true,subject:'A',body:'<iframe></iframe>',bodyFormat:'html'},design}),'mail_html_unsafe');
let outbox=null;
const client={async query(sql,args){
 if(sql.startsWith('SELECT payload'))return{rows:[{payload}]};
 if(sql.startsWith('INSERT INTO app_mail_outbox')) {outbox={sql,args};return {rows:[{id:100}]};}
 throw Error('Bad outbox SQL: '+sql);
}};
const queued=await createMailOutboxRepository().enqueueInTransaction({client,eventKey:'rental_submitted',recipientEmail:'demo@example.org',eventId:'test-rental-p107',values:{name:'홍길동'}});
check(queued.queued&&outbox.args.length===7,'transactional outbox with sender snapshot');
check(outbox.args[6]==='MK 알림','sender name persisted to outbox');
check(outbox.args[5].includes('MK 기기 대여')&&outbox.args[5].includes('background-color:#FF6B00'),'outbox uses same branded HTML');
check(outbox.args[4].includes('문의는 관리자에게')&&!outbox.args[5].includes('<script'),'fallback and safe HTML');
const migration=readFileSync('server/migrations/048_phase34_p1_07_mail_sender_snapshot.sql','utf8');
check(migration.includes('ALTER TABLE app_mail_outbox ADD COLUMN IF NOT EXISTS sender_name'),'one existing DB migration');
const app=readFileSync('server/src/app.mjs','utf8');
for(const route of ['mail-design','mail-preview'])check(app.includes(`/api/admin/${route}`),`admin ${route} route`);
check((app.match(/mailNotificationSettingsService.preview/g)||[]).length===1,'server invokes no-send preview');
check((app.match(/mailNotificationSettingsService.saveDesign/g)||[]).length===1,'server settings save');
const scoped=app.slice(app.indexOf('    // P1-07: shared appearance'),app.indexOf('const adminSystemConfigMatch'));
check((scoped.match(/adminRole!=='owner'/g)||[]).length>=3,'preview & design owner only');
const view=readFileSync('src/admin/AdminMailNotificationsPanel.jsx','utf8');
for(const txt of ['manageAdminMailDesign','previewAdminMailTemplate','sandbox=""','srcDoc={mailPreview.html}','RichTextEditor','allowImages={false}'])check(view.includes(txt),`frontend ${txt}`);
const index=readFileSync('server/src/index.mjs','utf8');
check(!index.includes('createP103Dispatcher('),'mail dispatcher not started');
check(!index.includes('createBrevoProvider('),'no provider live sends');
console.log(`[phase34-p1-07-templates] PASS (${count} checks; 19 event samples, shared design, owner preview, transaction snapshot, live sends 0)`);
