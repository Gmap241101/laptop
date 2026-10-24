import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {G4_CONFIRM,G4_LOCAL_ONLY,G4_LIVE_VENDOR_CALL_LOCKED,
  validateLocalConnection,createG4SchemaName,localFixtureStatements,
  createG4WrappedPool,createG4Repository,runLocalG4} from './g4-local-pg-core.mjs';
let checks=0;
const ok=(x,label)=>{assert.ok(x,label);checks++;};
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const throws=(fn,error)=>{assert.throws(fn,error);checks++;};
const denied=[
 'postgresql://admin:secret@heroku.com/rental_restore_20261020_112826',
 'postgresql://admin:secret@notebook-rental-api-staging-01.herokuapp.com/rental_restore_20261020_112826',
 'postgres://admin:secret@10.0.0.1/rental_restore_20261020_112826',
 'postgres://admin:secret@192.168.100.3/rental_restore_20261020_112826',
 'postgres://admin:secret@8.8.8.8/rental_restore_20261020_112826',
 'postgres://admin:secret@localhost/postgres',
 'postgres://admin:secret@localhost/template1',
 'postgres://admin:secret@localhost/notebook_rental_staging',
 'postgres://admin:secret@localhost/rental_restore_20261020_112826?host=evil.net',
 'postgres://admin:secret@localhost/rental_restore_20261020_112826?hostaddr=8.8.8.8',
 'postgres://admin:secret@localhost/rental_restore_20261020_112826?service=prod',
 'https://admin:secret@localhost/rental_restore_20261020_112826',
 'postgres://admin:secret@localhost/rental_restore_20261020_112826;DROP%20DATABASE',
 'not-a-url','',undefined,null
];
for(const raw of denied) throws(()=>validateLocalConnection(raw),Error);
for(const raw of [
 'postgresql://operator:fake@localhost/rental_restore_20261020_112826',
 'postgresql://operator:fake@127.0.0.1:5432/rental_staging_restore_20261019',
 'postgresql://operator:fake@[::1]/rental_restore_20261020_112826'
]){
 const plan=validateLocalConnection(raw);ok(!plan.canConnect,'plan_no_connection');
 const live=validateLocalConnection(raw,{mode:'execute-local',confirm:G4_CONFIRM,requestedExecution:true});
 ok(live.canConnect,'explicit_local_only');ok(live.createsDatabase===false,'no_new_database');
 throws(()=>validateLocalConnection(raw,{mode:'execute-local',confirm:'',requestedExecution:true}),/g4_explicit_local_consent_required/);
 throws(()=>validateLocalConnection(raw,{mode:'execute-local',confirm:G4_CONFIRM,requestedExecution:false}),/g4_explicit_local_consent_required/);
}
throws(()=>validateLocalConnection('postgres://x:y@localhost/rental_restore_20261020_112826',{mode:'unexpected'}),/g4_unknown_mode/);
const schema=createG4SchemaName(Buffer.from('0102030405060708','hex'));
eq(schema,'p34g4_0102030405060708');
const stmts=localFixtureStatements(schema);
ok(stmts.length===9,'nine_fixture_ddl_statements');
ok(stmts[0]===`CREATE SCHEMA "${schema}"`,'isolated_schema');
for(const s of stmts){
 ok(!s.includes('public.')&&!s.includes('app_mail_outbox'),'no_public_or_outbox');
 ok(!s.includes('CREATE OR REPLACE')&&!s.includes('IF NOT EXISTS'),'no_unsafe_ddl_drift');
}
for(const s of ['public','p34g4_bad-name','p34g4_aaa','p34g4_'.concat('a'.repeat(18))])throws(()=>localFixtureStatements(s),/g4_schema_name_invalid/);
ok(stmts.some(s=>s.includes('UNIQUE')),'unique_approval_reauth');
ok(stmts.some(s=>s.includes('BEFORE UPDATE OR DELETE')),'audit_immutability');
ok(stmts.some(s=>s.includes('BEFORE UPDATE ON')),'reservation_state_guard');
ok(stmts.some(s=>s.includes('BEFORE DELETE ON')),'delete_guard');
ok(stmts.some(s=>s.includes('CREATE FUNCTION')),'safe_new_scratch_functions');
// Synthetic adapter verifies set_search_path operation before all G2 queries.
const log=[];
const mockPool={async connect(){return {async query(q){log.push(q);return {rows:[]}},release(){log.push('released')}}}};
const db=await createG4WrappedPool(mockPool,schema).connect();
await db.query('BEGIN');
ok(log[0]==='BEGIN' && log[1]===`SET LOCAL search_path TO "${schema}", pg_catalog`,'transaction_local_schema_scoping');
await db.query('ROLLBACK');db.release();
ok(log.at(-1)==='released','client_release');
let attempts=0;const mustNotConnect={connect:async()=>{attempts++;throw Error('must_not_connect')}};
throws(()=>localFixtureStatements('; DROP SCHEMA public CASCADE'),/g4_schema_name_invalid/);
const main=readFileSync('tools/backend/run-phase34-p1-08-d06d2b-g4-local.mjs','utf8');
const code=readFileSync('tools/backend/g4-local-pg-core.mjs','utf8');
for(const prohibited of ['fetch(', 'RESEND_API_KEY','BREVO_API_KEY','mailQueue.claim(', 'mailDispatcher.send(', 'heroku pg:psql']){
 ok(!main.includes(prohibited)&&!code.includes(prohibited),'no_mail_vendor_or_heroku_'+prohibited);
}
ok(G4_LOCAL_ONLY&&G4_LIVE_VENDOR_CALL_LOCKED,'hard_lock');
ok(main.includes('validateLocalConnection(secret') && main.indexOf('validateLocalConnection(secret')<main.indexOf("require('pg')"),'guards_before_driver_load');
ok(code.includes('DROP SCHEMA ${ident} CASCADE'),'always_local_scratch_cleanup');
ok(!code.includes('CREATE DATABASE'),'no_database_creation');
ok(!code.includes('DROP TABLE public'),'no_existing_business_mutations');
const runtimeFiles=['server/src/index.mjs','server/src/mail/resend-provider.mjs','server/src/mail/brevo-provider.mjs'];
for(const p of runtimeFiles)ok(!readFileSync(p,'utf8').includes('g4-local-pg-core'),'not_runtime_wired');
ok(readFileSync('server/src/mail/resend-provider.mjs','utf8').includes('Idempotency-Key'),'resend_maintained');
ok(readFileSync('server/src/mail/mail-provider-config.mjs','utf8').includes("'resend', 'brevo'"),'both_providers');
ok(!readdirSync('server/migrations').some(s=>/^05\d_/.test(s)),'no_new_deployed_migration');
const cli=spawnSync(process.execPath,['tools/backend/run-phase34-p1-08-d06d2b-g4-local.mjs','--plan'],{encoding:'utf8'});
eq(cli.status,0);const plan=JSON.parse(cli.stdout);ok(!plan.actuallyTestedPostgres&&!plan.liveMailSendingReady,'plan_only');
const forbiddenCli=spawnSync(process.execPath,['tools/backend/run-phase34-p1-08-d06d2b-g4-local.mjs','--execute-local','--allow-temporary-schema'],{
 encoding:'utf8',env:{...process.env,G4_LOCAL_RESTORE_DATABASE_URL:'postgres://a:b@remote.invalid/rental_restore_20261020_112826',G4_CONFIRM_LOCAL_SCHEMA:G4_CONFIRM}});
ok(forbiddenCli.status!==0 && forbiddenCli.stderr.includes('g4_remote_host_forbidden'),'forbid_live_target');
ok(!forbiddenCli.stderr.includes('a:b@'),'redact_url');
const noConsent=spawnSync(process.execPath,['tools/backend/run-phase34-p1-08-d06d2b-g4-local.mjs','--execute-local','--allow-temporary-schema'],{
 encoding:'utf8',env:{...process.env,G4_LOCAL_RESTORE_DATABASE_URL:'postgres://a:b@localhost/rental_restore_20261020_112826',G4_CONFIRM_LOCAL_SCHEMA:'WRONG'}});
ok(noConsent.status!==0 && noConsent.stderr.includes('g4_explicit_local_consent_required'),'no_consent_no_connection');
const json=JSON.parse(readFileSync('package.json','utf8'));
ok(json.scripts['server:phase34:p1-08-d06d2b-g4-local:smoke']?.includes('g4-local.mjs'),'new_smoke_script');
ok(json.scripts['mail:p108:g4:local:plan']?.includes('--plan'),'plan_script');
console.log(`[phase34-p1-08-d06d2b-g4-local] PASS (${checks} assertions; mock-only; real Postgres NOT RUN; new DB=0; mail=0; Brevo+Resend retained)`);
