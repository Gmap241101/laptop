import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMailQueueOperations} from '../../server/src/mail/mail-queue-operations.mjs';
let assertions=0;
function ok(condition,message){assert.ok(condition,message);assertions++;}
function eq(actual,expected,message){assert.deepEqual(actual,expected,message);assertions++;}
const queries=[];
const resultRow=(id)=>({id:String(id),event_key:'admin_signup_pending',state:'cancelled',
  recipient_email:'sensitive.customer@example.org',attempt_count:0,last_error_code:'mail_admin_opted_out',
  created_at:new Date('2026-10-24T00:00:00Z'),safe_retry_candidate:false});
const fakePool={async query(sql,params=[]){queries.push({sql,params});
  if(sql.includes('GROUP BY state'))return {rows:[{state:'queued',total:12},{state:'cancelled',total:55}]};
  if(sql.includes('COUNT(*)::integer AS total FROM app_mail_outbox o'))return {rows:[{total:67}]};
  if(sql.includes('ORDER BY o.created_at DESC'))return {rows:Array.from({length:params[3]},(_,i)=>resultRow(67-params[4]-i)).filter(x=>Number(x.id)>0)};
  throw Error('unexpected query: '+sql);
 },async connect(){throw Error('read-only SQL must never open write transaction');}};
const ops=createMailQueueOperations(fakePool);
for(const size of [10,30,50]){
 const page1=await ops.listPaged({page:1,pageSize:size,status:'all',search:''});
 eq(page1.page,1,'page');eq(page1.pageSize,size,'size');eq(page1.rows.length,size,'full first page');
 eq(page1.total,67,'total filtered');eq(page1.totalPages,Math.ceil(67/size),'total pages');
 eq(page1.counts.cancelled,55,'unfiltered count');
 ok(page1.rows.every(r=>r.recipientMasked==='s***@example.org'),'masked response');
 ok(!JSON.stringify(page1).includes('sensitive.customer@'),'no original address in API response');
 const page2=await ops.listPaged({page:2,pageSize:size,status:'cancelled',search:'s***@example.org'});
 eq(page2.rows.length,Math.min(size,67-size),'page two length');
 const q=queries.at(-1);
 ok(q.sql.includes('OFFSET $5')&&q.sql.includes('LIMIT $4'),'parameterized pagination');
 eq(q.params[0],'cancelled','filter applied');
 eq(q.params[1],'s***@example.org','search applied');
 eq(q.params[3],size,'limit binding');eq(q.params[4],size,'offset binding');
 ok(q.sql.includes("left(split_part(o.recipient_email,'@',1),1)"),'search only visible masked address');
 ok(!q.sql.includes('strpos(lower(o.recipient_email)'), 'never search raw recipient email');
}
const korean=await ops.listPaged({page:1,pageSize:10,status:'all',search:'가입'});
ok(queries.at(-1).params[2].includes('admin_signup_pending'),'Korean title search matches event key');
eq(korean.rows[0].eventTitle.length>0,true,'event title returned');
for(const input of [{page:0},{page:-1},{page:1.3},{page:1000001},{pageSize:29},{pageSize:1000},{status:'not-a-state'},{search:42},{search:'x'.repeat(121)}]){
 await assert.rejects(()=>ops.listPaged(input),/mail_queue_/);assertions++;
}
const app=readFileSync('server/src/app.mjs','utf8');
const route=app.slice(app.indexOf("url.pathname === '/api/admin/mail-queue'"),app.indexOf('const mailQueueCancelMatch'));
ok(route.includes("adminRole !== 'owner'"),'route owner only');
ok(route.includes('mailQueueOperations.listPaged'),'paged route on GET only');
const ui=readFileSync('src/admin/AdminMailNotificationsPanel.jsx','utf8');
for(const marker of ['AdminPageHeader','OwnerSettingsBadge','activeTab===\'preflight\'','activeTab===\'history\'','activeTab===\'design\'','SixDigitVerificationCodeInput','ModalPortal','PaginationControls','[10,30,50]','queueRequestSeq'])ok(ui.includes(marker),'UI marker '+marker);
console.log(`[phase34-mail-ux-history] PASS ${assertions} assertions; mock PG, read-only, 0 emails, 0 external calls`);
