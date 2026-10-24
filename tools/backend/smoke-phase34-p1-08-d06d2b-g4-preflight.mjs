// G4-PREP fail-closed verification. No database/network side effects.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,cpSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {FIXED_FILES,inspectG4Offline,readonlySqlViolations,digest} from '../ops/check-phase34-p1-08-g4-preflight.mjs';
const root=resolve('.');let tests=0;
const yes=(x)=>{assert.ok(x);tests++;};
const same=(a,b)=>{assert.deepEqual(a,b);tests++;};
const base=inspectG4Offline(root);
yes(base.offlineSafetyPass);same(base.livePostgresVerified,false);same(base.readyToDeploy,false);
same(base.realMailAllowed,false);same(base.postgresCommandsExecuted,0);same(base.emailsSent,0);
same(base.provider,'brevo');same(base.retainedProviders,['brevo','resend']);same(base.errors,[]);
yes(base.blockingFindings.includes('postgresql_constraints_trigger_and_concurrency_not_tested'));
yes(base.blockingFindings.includes('ddl_if_not_exists_cannot_detect_shape_drift'));
yes(base.blockingFindings.includes('draft_replaces_existing_triggers'));
yes(base.blockingFindings.includes('draft_replaces_existing_functions'));
yes(/^[a-f0-9]{64}$/.test(base.catalogSqlSha256));yes(/^[a-f0-9]{64}$/.test(base.schemaDraftSha256));
const sql=readFileSync(join(root,FIXED_FILES.sql),'utf8');
same(readonlySqlViolations(sql),[]);same(digest(sql),base.catalogSqlSha256);
for(const injected of [
 sql.replace('COMMIT;','DELETE FROM app_mail_sandbox_review_audit; COMMIT;'),
 sql.replace('COMMIT;','SELECT pg_sleep(10); COMMIT;'),
 sql.replace('COMMIT;','GRANT ALL ON public.app_mail_sandbox_review_audit TO PUBLIC; COMMIT;'),
 sql.replace('COMMIT;','SELECT * FROM foo; UPDATE foo SET x=1; COMMIT;'),
 sql.replace('READ ONLY;','READ WRITE;'),
 sql.replace('COMMIT;',''),
 sql.replace('SELECT current_database()', 'SELECT pg_sleep(1), current_database()'),
 sql.replace('SELECT current_database()', 'DO $$BEGIN NULL; END$$; SELECT current_database()'),
 sql.replace('pg_catalog.pg_trigger','pg_catalog.other_catalog'),
 ]){yes(readonlySqlViolations(injected).length>0);}
const tmp=mkdtempSync(join(tmpdir(),'d06d2b-g4-prep-'));
try {
 for(const rel of Object.values(FIXED_FILES)){
  const dest=join(tmp,rel);mkdirSync(dirname(dest),{recursive:true});cpSync(join(root,rel),dest);
 }
 const good=inspectG4Offline(tmp);same(good.offlineSafetyPass,true);
 const badContent=[
 ['sql',s=>s.replace('READ ONLY','READ WRITE')],
 ['gate2',s=>s.replace('GATE2_VENDOR_AND_LIVE_DELIVERY_LOCKED = true','GATE2_VENDOR_AND_LIVE_DELIVERY_LOCKED = false')],
 ['gate2',s=>s.replace("gate2_vendor_dispatch_permanently_locked","gate2_danger")],
 ['gate2',s=>s.replace('gate2_automatic_retry_forbidden','gate2_retry_enabled')],
 ['preserve',s=>s.replace(/resend/g,'deleted')],
 ['brevo',s=>s.replace(/brevo/g,'deleted')],
 ];
 for(const [k,change] of badContent){
  const target=join(tmp,FIXED_FILES[k]),before=readFileSync(target,'utf8');
  writeFileSync(target,change(before));same(inspectG4Offline(tmp).offlineSafetyPass,false);
  writeFileSync(target,before);
 }
 for(const [k,rel] of Object.entries(FIXED_FILES)){
  const dest=join(tmp,rel),before=readFileSync(dest,'utf8');
  rmSync(dest);const r=inspectG4Offline(tmp);
  same(r.offlineSafetyPass,false);yes(r.errors.includes('missing_source:'+k));
  writeFileSync(dest,before);
 }
}finally{rmSync(tmp,{recursive:true,force:true});}
console.log(`D06-D2B-G4-PREP offline smoke: ${tests}/${tests} PASS; live DB not tested; Brevo and Resend preserved`);
