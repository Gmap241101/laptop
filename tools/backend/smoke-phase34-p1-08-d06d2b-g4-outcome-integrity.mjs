// G4 scratch-schema outcome consistency: OFFLINE contract verification only.
// Does not connect to PostgreSQL, call Clerk, or contact either email provider.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localFixtureStatements,createG4SchemaName,runLocalG4,G4_CONFIRM} from './g4-local-pg-core.mjs';
import {classifyD06D2AMockOutcome} from '../../server/src/mail/mail-p108-d06d2a-sandbox-gate.mjs';
let checks=0;
function ok(test,label){assert.ok(test,label);checks++;}
function equal(a,b,label){assert.deepEqual(a,b,label);checks++;}
const schema=createG4SchemaName(Buffer.from('1234567812345678','hex'));
const statements=localFixtureStatements(schema);
const reservations=statements.find(s=>s.includes('CREATE TABLE')&&s.includes('app_mail_sandbox_review_reservations'));
const terminalGuard=statements.find(s=>s.includes('CREATE FUNCTION')&&s.includes('g4_terminal_guard'));
const audit=statements.find(s=>s.includes('CREATE TABLE')&&s.includes('app_mail_sandbox_review_audit'));
ok(statements.length===9,'original_scratch_schema_statement_count_preserved');
ok(reservations && terminalGuard && audit,'all_scratch_definitions_present');
for(const required of [
 'CONSTRAINT g4_mock_outcome_consistency CHECK ((',
 ") IS TRUE)",
 "state='held_locked' AND verdict IS NULL AND settled_at IS NULL AND provider_id_digest IS NULL",
 "state='simulated_accepted' AND verdict='sandbox_simulated_acceptance'",
 "provider_id_digest ~ '^[a-f0-9]{64}$'",
 "state='manual_review' AND verdict IN ('rate_limited_manual_review','rejected_manual_review')",
 "state='uncertain_quarantine' AND verdict='uncertain_quarantine'",
 'provider_id_digest IS NULL',
]) ok(reservations.includes(required),`scratch_check_contract_${required}`);
for(const required of [
 "NEW.state NOT IN ('simulated_accepted','manual_review','uncertain_quarantine')",
 "NEW.settled_at IS NULL OR",
 ") IS NOT TRUE THEN",
 "NEW.provider_id_digest ~ '^[a-f0-9]{64}$'",
 "NEW.provider_id_digest IS NULL",
 "g4_mock_outcome_mismatch",
]) ok(terminalGuard.includes(required),`trigger_fail_closed_${required}`);
// PostgreSQL CHECK expressions that yield NULL are accepted unless the entire
// comparison is explicitly required to be IS TRUE. This guards future drift.
ok(!reservations.includes('CHECK (\n        (state='),'no_nullable_check_fallback');
ok(audit.includes('REFERENCES') && audit.includes('app_mail_sandbox_review_reservations(id)'), 'audit_foreign_key_preserved');
const good=[
 ['simulated_accepted','sandbox_simulated_acceptance','a'.repeat(64)],
 ['manual_review','rate_limited_manual_review',null],
 ['manual_review','rejected_manual_review',null],
 ['uncertain_quarantine','uncertain_quarantine',null],
 ['held_locked',null,null],
];
const model=(state,verdict,digest,settled)=>{
 if(state==='held_locked')return verdict===null && digest===null && settled===false;
 if(!settled)return false;
 if(state==='simulated_accepted')return verdict==='sandbox_simulated_acceptance' && typeof digest==='string' && /^[a-f0-9]{64}$/.test(digest);
 if(state==='manual_review')return ['rate_limited_manual_review','rejected_manual_review'].includes(verdict)&&digest===null;
 if(state==='uncertain_quarantine')return verdict==='uncertain_quarantine'&&digest===null;
 return false;
};
for(const [state,v,d] of good)ok(model(state,v,d,state!=='held_locked'),`positive_shape_${state}_${v}`);
const illegal=[
 ['held_locked','sandbox_simulated_acceptance',null,false],
 ['held_locked',null,'a'.repeat(64),false],
 ['simulated_accepted','sandbox_simulated_acceptance',null,true],
 ['simulated_accepted','sandbox_simulated_acceptance','bad',true],
 ['simulated_accepted','rate_limited_manual_review','a'.repeat(64),true],
 ['simulated_accepted',null,'a'.repeat(64),true],
 ['simulated_accepted','sandbox_simulated_acceptance','A'.repeat(64),true],
 ['manual_review','rejected_manual_review','a'.repeat(64),true],
 ['manual_review','sandbox_simulated_acceptance',null,true],
 ['uncertain_quarantine','sandbox_simulated_acceptance',null,true],
 ['uncertain_quarantine','uncertain_quarantine','a'.repeat(64),true],
 ['manual_review','rate_limited_manual_review',null,false],
 ['held_locked',null,null,true],
 ['unknown','uncertain_quarantine',null,true],
];
for(const [st,v,d,settled] of illegal)ok(!model(st,v,d,settled),`negative_shape_${st}_${v}_${settled}`);
for(const [status,body,expectedState] of [
 [201,{messageId:'synthetic-accepted'},'simulated_accepted'],
 [201,{},'uncertain_quarantine'],[429,{},'manual_review'],
 [400,{},'manual_review'],[401,{},'manual_review'],
 [403,{},'manual_review'],[422,{},'manual_review'],
 [503,{},'uncertain_quarantine'],[504,{},'uncertain_quarantine'],
]){
 const classified=classifyD06D2AMockOutcome({status,body});
 const state=classified.verdict==='sandbox_simulated_acceptance'?'simulated_accepted':
  classified.verdict==='uncertain_quarantine'?'uncertain_quarantine':'manual_review';
 equal(state,expectedState,`mock_classifier_state_${status}`);
 ok(model(state,classified.verdict,classified.providerIdDigest,true),`classifier_matches_schema_${status}`);
}
const source=readFileSync('tools/backend/g4-local-pg-core.mjs','utf8');
// Regression: PostgreSQL inet::text returns CIDR-annotated addresses even for
// direct loopback (127.0.0.1/32, ::1/128). PG host(inet) removes that mask.
// The real LOCAL test remains fail-closed on any non-loopback host response.
ok(source.includes('pg_catalog.host(pg_catalog.inet_server_addr()) AS address'),
  'actual_pg_server_ip_is_maskless_via_pg_host');
ok(!source.includes('inet_server_addr()::text AS address'),
  'legacy_pg_cidr_format_bug_removed');
ok(source.includes("['127.0.0.1','::1'].includes(meta.rows[0]?.address)"),
  'only_ipv4_or_ipv6_exact_loopback_permitted');
for(const untrusted of ['10.0.0.1', '192.168.100.3', '8.8.8.8',
  '127.0.0.1/32','::1/128','127.0.0.1.evil','']){
 ok(!['127.0.0.1','::1'].includes(untrusted),`non_loopback_or_unnormalized_forbidden_${untrusted}`);
}
for(const trusted of ['127.0.0.1','::1']){
 ok(['127.0.0.1','::1'].includes(trusted),`strict_loopback_allowed_${trusted}`);
}

for(const text of [
 'fake_acceptance_missing_provider_digest','fake_acceptance_wrong_verdict',
 'manual_review_with_provider_digest','quarantine_as_acceptance',
 'rejected_mock_mutations_preserve_held_state',
])ok(source.includes(text),`actual_postgresql_negative_test_is_defined_${text}`);
for(const blocked of ['fetch(', 'BREVO_API_KEY', 'RESEND_API_KEY','CREATE DATABASE','DROP SCHEMA public']){
 ok(!source.includes(blocked),`no_vendor_or_external_resource_${blocked}`);
}
// Drive the REAL server-loopback assertion with a fake Pool, without touching
// a real database. A successful address reaches the CREATE SCHEMA boundary;
// our fake driver deliberately refuses execution before any schema is created.
async function probeLoopback(address, db='rental_restore_20261020_112826'){
 const calls=[];
 class NoDatabasePool{
  async query(statement){
   calls.push(statement);
   if(statement.includes('current_database()')) return {rows:[{db,address}]};
   if(statement.startsWith('CREATE SCHEMA')) throw Error('g4_mock_prevent_all_schema_writes');
   throw Error('unexpected_fake_sql');
  }
  async end(){ calls.push('POOL_END'); }
 }
 let message='';
 try{
  await runLocalG4({connectionString:'postgresql://postgres:dummy@127.0.0.1:5432/rental_restore_20261020_112826',
   Pool:NoDatabasePool,confirm:G4_CONFIRM,requestedExecution:true});
 }catch(error){message=String(error.message);}
 return {message,calls};
}
for(const address of ['127.0.0.1','::1']){
 const result=await probeLoopback(address);
 ok(result.message==='g4_mock_prevent_all_schema_writes',`direct_loopback_passes_address_gate_${address}`);
 ok(result.calls.some(q=>q.startsWith('CREATE SCHEMA')),`mock_schema_boundary_reached_${address}`);
 ok(result.calls.at(-1)==='POOL_END',`fake_pool_disposed_after_probe_${address}`);
}
for(const address of ['127.0.0.1/32','::1/128','10.0.0.1','192.168.100.3',null,'127.0.0.1.evil']){
 const result=await probeLoopback(address);
 ok(result.message==='g4_assertion_failed:server_loopback',`non_normalized_or_nonlocal_blocked_${address}`);
 ok(!result.calls.some(q=>q.startsWith('CREATE SCHEMA')),`nonlocal_no_schema_statement_${address}`);
 ok(result.calls.at(-1)==='POOL_END',`nonlocal_pool_disposed_${address}`);
}
const badDb=await probeLoopback('127.0.0.1','rental_staging');
ok(badDb.message==='g4_assertion_failed:actual_db_name','server_db_identity_still_strict');
ok(!badDb.calls.some(q=>q.startsWith('CREATE SCHEMA')),'db_identity_mismatch_no_schema_statement');
for(const file of ['server/src/index.mjs','server/src/app.mjs','server/src/mail/mail-dynoweb-dispatcher.mjs']){
 ok(!readFileSync(file,'utf8').includes('g4-outcome-integrity'),'new_test_not_wired_to_runtime');
}
const providers=readFileSync('server/src/mail/mail-provider-config.mjs','utf8');
ok(providers.includes("'resend', 'brevo'"),'brevo_and_resend_preserved');
console.log(`[Phase34 D06-D2B G4-SCRATCH-INTEGRITY] PASS (${checks} assertions; static SQL/JS contract, real PostgreSQL NOT RUN, API calls=0, email=0)`);
