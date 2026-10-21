/**
 * Phase 34 W03 non-destructive safety regression.
 * Mock / contract tests only. No network, actual PostgreSQL or Clerk API calls.
 * Original AC-S04 isolated full-DB restore is intentionally NOT claimed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeResetBackupProof } from '../../server/src/settings/system-reset-backup-proof.mjs';
import {
  RESTORE_SCOPES, RESTORE_MODES, RESTORE_MAX_ROWS, RESTORE_PREVIEW_MAX_AGE_MS,
  normalizeRestoreRequest, createScopedJsonRestore,
} from '../../server/src/settings/system-data-restore.mjs';
import { inspectSingleDatabase, createSingleDbVerificationJobs } from '../../server/src/settings/backup-verification-single-db.mjs';

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const err = async (promise, code, status) => {
  await assert.rejects(promise, e => e?.code === code && (status === undefined || e.status === status));
  checks += 1;
};
const source = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const mockSnapshot = () => ({
  format: 'mk-rental-postgresql-backup-v1', authority: 'postgresql', exportedAt: new Date().toISOString(),
  schemaMigrations: [{name:'038_phase34_footer_reset_recovery_inquiry_reset.sql',checksum:'a'.repeat(64)}],
  content: {site: [{domain:'home',document_key:'home/config',payload:{title:'update'}}],
    boardConfigs:[],faqCategories:[],boardPosts:[]},
  assets: {categories:[],items:[]},
  members: {personalDataIncluded: true, directory:[]},
});
const parameters = {snapshot:mockSnapshot(),scopes:['site'],mode:'overwrite'};

// Z03: A data-quality snapshot is read-only, not a recovered independent DB.
const calls=[];
const client = {async query(text) {
  const sql=String(text); calls.push(sql);
  if (sql.startsWith('SELECT current_database()')) return {rows:[{name:'staging',version:180003}]};
  if (sql.includes('FROM pg_catalog.pg_tables')) return {rows:[{tablename:'app_home'},{tablename:'schema_migrations'}]};
  if (sql.includes('count(*)::bigint')) return {rows:[{n:'5'}]};
  if (sql.includes('pg_catalog.pg_constraint') || sql.includes('pg_catalog.pg_index')) return {rows:[{n:0}]};
  if (sql.includes('FROM schema_migrations')) return {rows:[{name:'043_test.sql',checksum:'d'.repeat(64)}]};
  return {rows:[]};
}, release() {calls.push('RELEASE');}};
const pool = {connect:async()=>client};
const snapshot=await inspectSingleDatabase(pool);
check(snapshot.verificationType,'logical-read-only');
check(snapshot.independentRestoreVerified,false);
check(snapshot.tableCount,2);
check(/^\p{ASCII_Hex_Digit}{64}$/u.test(snapshot.snapshotSha256),true);
check(calls.some(s => s.includes('REPEATABLE READ READ ONLY')),true);
check(calls.some(s => /^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i.test(s)),false);
const jobs=createSingleDbVerificationJobs(pool,{env:{APP_ENV:'staging',BACKUP_VERIFY_MODE:'single-db'}});
await err(jobs.assertDurableProof(),'backup_verification_independent_restore_required',409);
check((await jobs.status()).independentRestoreVerified,false);

// Z04: No proof, no reset. Expired/foreign proof does not authorize a reset.
const validProof={type:'full-pg-dump-isolated-restore-v1',databaseName:'staging',
  verifiedAt:new Date().toISOString(),dumpSha256:'a'.repeat(64),
  tableCountsSha256:'b'.repeat(64),verifiedTableCount:32};
check(describeResetBackupProof(undefined,'staging').valid,false);
check(describeResetBackupProof({...validProof, databaseName:'production'},'staging').valid,false);
check(describeResetBackupProof({...validProof, verifiedAt:'2020-01-01T00:00:00Z'},'staging').valid,false);
check(describeResetBackupProof({...validProof, dumpSha256:'bad'},'staging').valid,false);
check(describeResetBackupProof(validProof,'staging').valid,true);
const resetSource=source('../../server/src/settings/system-data-repository.mjs');
const apiSource=source('../../server/src/app.mjs');
check(resetSource.includes('system_data_verified_restore_required'),true);
check(apiSource.includes('await backupVerificationJobs.assertDurableProof();'),true);
check(apiSource.includes("process.env.BACKUP_VERIFY_MODE !== 'single-db'"),true);

// Z05 and Z06: strict scope/row/migration/preview contracts.
check(RESTORE_SCOPES,['site','boards','assets','organization']);
check(RESTORE_MODES,['addMissing','overwrite']);
check(RESTORE_MAX_ROWS,2500);
check(RESTORE_PREVIEW_MAX_AGE_MS,600000);
check(normalizeRestoreRequest(parameters).totalRows,1);
check(normalizeRestoreRequest({...parameters,scopes:['site','assets']}).totalRows,1);
assert.throws(()=>normalizeRestoreRequest({...parameters,scopes:['site','site']}),e=>e.code==='system_restore_scopes_invalid');checks++;
assert.throws(()=>normalizeRestoreRequest({...parameters,scopes:['users']}),e=>e.code==='system_restore_scopes_invalid');checks++;
assert.throws(()=>normalizeRestoreRequest({...parameters,mode:'deleteAll'}),e=>e.code==='system_restore_mode_invalid');checks++;
assert.throws(()=>normalizeRestoreRequest({...parameters,snapshot:{...mockSnapshot(),schemaMigrations:[]}}),e=>e.code==='system_restore_migration_baseline_missing');checks++;
assert.throws(()=>normalizeRestoreRequest({...parameters,snapshot:{...mockSnapshot(),content:{...parameters.snapshot.content,
  site:[{domain:'home',document_key:'home/config',payload:{p:'[redacted]'}}]}}}),e=>e.code==='system_restore_redacted_or_invalid_row');checks++;
assert.throws(()=>normalizeRestoreRequest({...parameters,snapshot:{...mockSnapshot(),content:{...parameters.snapshot.content,
  site:Array.from({length:2501},(_,i)=>({domain:'home',document_key:`p${i}`,payload:{}}))}}}),e=>e.code==='system_restore_too_many_rows'&&e.status===413);checks++;

// Minimal preview fixture: preview is always READ ONLY and cannot directly write.
const events=[];
const mockClient={async query(sql,params=[]) {
  const q=String(sql);events.push(q);
  if(q.startsWith('SELECT name, checksum FROM schema_migrations')) return {rows:[
    parameters.snapshot.schemaMigrations[0],{name:'039_phase34_p0_scoped_json_restore_audit.sql',checksum:'b'.repeat(64)}]};
  if(q.includes('FROM information_schema.columns')) return {rows:['domain','document_key','payload'].map(column_name=>({column_name,is_generated:'NEVER',udt_name:column_name==='payload'?'jsonb':'text'}))};
  if(q.includes('AS restore_row FROM')) return {rows:[]};
  if(q.includes('FROM app_runtime_metadata')) return {rows:[]};
  if(q.includes('pg_advisory_xact_lock')) return {rows:[]};
  if(q==='COMMIT'||q==='ROLLBACK'||q.startsWith('BEGIN')) return {rows:[]};
  throw Error('Unexpected query: '+q.slice(0,90));
},release(){}};
const restorer=createScopedJsonRestore({connect:async()=>mockClient});
const plan=await restorer.preview(parameters);
check(plan.deletesRows,false);
check(plan.willInsert,1);
check(plan.independentRestoreVerified,false);
check(plan.previewExpiresAt,new Date(Date.parse(plan.previewIssuedAt)+600000).toISOString());
check(events.some(s=>s.includes('REPEATABLE READ READ ONLY')),true);
check(events.some(s=>/^(DELETE|UPDATE|INSERT)/.test(s)),false);
await err(restorer.execute({...parameters,actorClerkUserId:'owner',confirmText:'백업 데이터 복원',previewSha256:plan.previewSha256}),
  'system_restore_preview_required',409);
await err(restorer.execute({...parameters,actorClerkUserId:'owner',confirmText:'백업 데이터 복원',previewSha256:plan.previewSha256,
  previewIssuedAt:new Date(Date.now()-600001).toISOString()}),'system_restore_preview_expired',409);
await err(restorer.execute({...parameters,actorClerkUserId:'owner',confirmText:'백업 데이터 복원',previewSha256:plan.previewSha256,
  previewIssuedAt:new Date(Date.now()+3600000).toISOString()}),'system_restore_preview_expired',409);
check(events.some(s => s.startsWith('BEGIN ISOLATION LEVEL SERIALIZABLE')),false);

// Z07/Z08/Z09: preserve real transaction and owner auth pathways (existing full fixture tests run separately).
const restoreSource=source('../../server/src/settings/system-data-restore.mjs');
check(restoreSource.includes('BEGIN ISOLATION LEVEL SERIALIZABLE'),true);
check(restoreSource.includes('captureScopedPreimages(client,request)'),true);
check(restoreSource.includes("await client.query('ROLLBACK')"),true);
check(restoreSource.includes('system_restore_preview_stale'),true);
check(apiSource.includes("(authority.adminAuth?.admin?.adminRole || 'admin') !== 'owner'"),true);
check(resetSource.includes("'device-trust-policy','device-trust-sync-state','system-settings-audit'"),true);
check(resetSource.includes("SELECT pg_advisory_xact_lock(hashtext('phase34-system-data-reset'))"),true);
check(resetSource.includes('DELETE FROM app_runtime_metadata WHERE key=$1'),true);
check(restoreSource.includes('system_restore_preimage_too_large'),true);
check(restoreSource.includes('system_restore_migration_mismatch'),true);

console.log(`[phase34-w03-safety] PASS (${checks} assertions): READ ONLY logical inspection, fail-closed full reset, 4 scopes, 2 modes, 10-minute preview TTL, preimage/rollback/owner contracts; isolated restore NOT tested`);
