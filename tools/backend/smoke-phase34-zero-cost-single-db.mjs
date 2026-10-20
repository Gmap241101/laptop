import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectSingleDatabase, createSingleDbVerificationJobs} from '../../server/src/settings/backup-verification-single-db.mjs';
const files={
  restore:readFileSync(new URL('../../server/src/settings/system-data-restore.mjs',import.meta.url),'utf8'),
  app:readFileSync(new URL('../../server/src/app.mjs',import.meta.url),'utf8'),
  reset:readFileSync(new URL('../../server/src/settings/system-data-repository.mjs',import.meta.url),'utf8'),
  migration:readFileSync(new URL('../../server/migrations/041_phase34_p0_single_db_scoped_restore_safety.sql',import.meta.url),'utf8'),
};
assert.match(files.restore,/captureScopedPreimages\(client,request\)/);
assert.match(files.restore,/INSERT INTO app_system_data_restore_preimages/);
assert.match(files.restore,/BEGIN ISOLATION LEVEL SERIALIZABLE/);
assert.match(files.restore,/system_restore_preview_stale/);
assert.match(files.restore,/singleDb = scopedSingleDbMode/);
assert.match(files.restore,/if \(!singleDb\) await client.query\('DELETE FROM app_runtime_metadata/);
assert.match(files.app,/process\.env\.BACKUP_VERIFY_MODE !== 'single-db'/);
assert.match(files.reset,/system_data_verified_restore_required/);
assert.match(files.migration,/app_system_data_restore_preimages/);
const logs=[];
const client={
  async query(sql, params) {
    logs.push({sql, params});
    if (sql.startsWith('SELECT current_database()')) return {rows:[{name:'staging',version:180004}]};
    if (sql.includes('pg_catalog.pg_tables')) return {rows:[{tablename:'app_a'},{tablename:'schema_migrations'}]};
    if (sql.includes('count(*)::bigint')) return {rows:[{n:'5'}]};
    if (sql.includes('pg_catalog.pg_constraint') || sql.includes('pg_catalog.pg_index')) return {rows:[{n:0}]};
    if (sql.startsWith('SELECT name, checksum FROM schema_migrations')) return {rows:[{name:'039_test.sql',checksum:'a'.repeat(64)}]};
    return {rows:[]};
  },release(){}
};
const pool={connect:async()=>client};
const result=await inspectSingleDatabase(pool);
assert.equal(result.tableCount,2);
assert.equal(result.independentRestoreVerified,false);
assert.match(result.snapshotSha256,/^[a-f0-9]{64}$/);
assert(logs.some(x=>x.sql.includes('REPEATABLE READ READ ONLY')));
assert(!logs.some(x=>/\b(DELETE|INSERT|DROP|UPDATE)\b/i.test(x.sql)));
const jobService=createSingleDbVerificationJobs(pool,{env:{APP_ENV:'staging',BACKUP_VERIFY_MODE:'single-db'}});
assert.equal((await jobService.status()).enabled,true);
await assert.rejects(jobService.assertDurableProof(),err=>err.code==='backup_verification_independent_restore_required');
const disabled=createSingleDbVerificationJobs(pool,{env:{APP_ENV:'staging',BACKUP_VERIFY_MODE:'off'}});
await assert.rejects(disabled.start({auth:{},actorClerkUserId:'user'}),err=>err.status===503);
console.log('[phase34-zero-cost] PASS: readonly snapshot, never issues whole-DB proof, atomic scoped preimage, fail-closed disabled mode');

// End-to-end repository mock for the narrow JSON overwrite path; no verified
// full-restore proof exists. Confirm the scoped preimage is atomic with writes.
const {createScopedJsonRestore}=await import('../../server/src/settings/system-data-restore.mjs');
const previousMode=process.env.BACKUP_VERIFY_MODE;
process.env.BACKUP_VERIFY_MODE='single-db';
try {
  const fixture={format:'mk-rental-postgresql-backup-v1',authority:'postgresql',exportedAt:new Date().toISOString(),
    schemaMigrations:[{name:'038_phase34_footer_reset_recovery_inquiry_reset.sql',checksum:'1'.repeat(64)}],
    content:{site:[{domain:'home',document_key:'homePage/config',payload:{title:'after'},enabled:true}],boardConfigs:[],faqCategories:[],boardPosts:[]}};
  const prepare=({injectFailure=false}={})=>{
    let current={domain:'home',document_key:'homePage/config',payload:{title:'before'},enabled:true};
    let audit=[]; let images=[]; let transactional;
    const calls=[];
    const db={async query(statement,params=[]){
      const sql=String(statement).trim(); calls.push(sql);
      if (sql.startsWith('BEGIN')) { transactional={row:structuredClone(current),images:[...images]};return {rows:[]}; }
      if (sql==='COMMIT') {transactional=undefined;return {rows:[]};}
      if (sql==='ROLLBACK') {if(transactional){current=transactional.row;images=transactional.images;}transactional=undefined;return {rows:[]};}
      if(sql==='SELECT name, checksum FROM schema_migrations ORDER BY name') return {rows:[
        fixture.schemaMigrations[0],{name:'039_phase34_p0_scoped_json_restore_audit.sql',checksum:'2'.repeat(64)}]};
      if(sql==='SELECT 1 FROM schema_migrations WHERE name=$1') return {rows:[{one:1}]};
      if(sql.includes('FROM information_schema.columns'))return {rows:['domain','document_key','payload','enabled'].map(column_name=>({column_name,
        udt_name:column_name==='payload'?'jsonb':'text',is_generated:'NEVER'}))};
      if(sql.includes('FROM "app_site_content_documents" t') && sql.includes('AS restore_row'))return {rows:[{domain:current.domain,document_key:current.document_key,restore_row:JSON.stringify(current)}]};
      if(sql.includes('FROM "app_site_content_documents" t') && sql.includes('AS original'))return {rows:[{original:structuredClone(current)}]};
      if(sql.includes('FROM app_runtime_metadata'))return {rows:[]};
      if(sql.includes('pg_advisory_xact_lock'))return {rows:[{}]};
      if(sql.startsWith('INSERT INTO app_system_data_restore_preimages')) {images.push(JSON.parse(params[5]));return {rowCount:1,rows:[]};}
      if(sql.startsWith('INSERT INTO "app_site_content_documents"')) {if(injectFailure)throw Object.assign(new Error('injected'),{code:'TEST_FAIL'});
        current={domain:params[0],document_key:params[1],payload:JSON.parse(params[2]),enabled:params[3]};return {rowCount:1,rows:[]};}
      if(sql.startsWith('INSERT INTO app_system_data_restore_audit')){audit.push(params);return {rows:[],rowCount:1};}
      throw new Error('Unexpected SQL in single-db scoped mock: '+sql.slice(0,100));
    },release(){}};
    return {pool:{connect:async()=>db},calls,getState:()=>current,images:()=>images,audit:()=>audit};
  };
  const req={snapshot:fixture,scopes:['site'],mode:'overwrite'};
  const good=prepare(); const repo=createScopedJsonRestore(good.pool);
  const preview=await repo.preview(req);
  assert.equal(preview.restoreProof.valid,false);
  assert.equal(preview.scopedSafety,'transactional-preimage-v1');
  const outcome=await repo.execute({...req,actorClerkUserId:'admin',previewSha256:preview.previewSha256,
    confirmText:'백업 데이터 복원'});
  assert.equal(outcome.changedRows,1);
  assert.equal(outcome.independentRestoreVerified,false);
  assert.equal(outcome.recoveryRecord,'same-database-scoped-preimage');
  assert.equal(good.getState().payload.title,'after');
  assert.equal(good.images().length,1);
  assert.equal(good.images()[0][0].existing[0].payload.title,'before');
  const broken=prepare({injectFailure:true}); const repoBroken=createScopedJsonRestore(broken.pool);
  const before=await repoBroken.preview(req);
  await assert.rejects(repoBroken.execute({...req,actorClerkUserId:'admin',previewSha256:before.previewSha256,
    confirmText:'백업 데이터 복원'}), e=>e.code==='TEST_FAIL');
  assert.equal(broken.getState().payload.title,'before');
  assert.equal(broken.images().length,0,'preimage insert must roll back along with the failed write');
  assert(broken.calls.includes('ROLLBACK'));
  assert.equal(broken.audit().length,1,'failed restore must write a separate failure audit entry after rollback');
  assert.match(String(broken.audit()[0][0]),/^[0-9a-f-]{36}$/,'failed audit must carry a unique restore ID');
} finally { if(previousMode===undefined)delete process.env.BACKUP_VERIFY_MODE; else process.env.BACKUP_VERIFY_MODE=previousMode; }
console.log('[phase34-zero-cost-scoped-restore] PASS: scoped overwrite, same-transaction preimage, failed upsert rollback');
