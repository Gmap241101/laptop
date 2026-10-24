// Offline G4-PREP only. No database, HTTP, credentials, migrations, dispatch or e-mails.
import {readFileSync, existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
export const FIXED_FILES=Object.freeze({
  sql:'docs/phase34/p1-08-d06d2b-g4-catalog-readonly-20261024.sql',
  draft:'docs/phase34/050_mail_sandbox_review_schema_DRAFT_NOT_DEPLOY.sql',
  gate2:'server/src/mail/mail-p108-d06d2b-gate2-locked-reservation.mjs',
  preserve:'server/src/mail/mail-p108-d06d2b-provider-preservation.mjs',
  resend:'server/src/mail/resend-provider.mjs',
  brevo:'server/src/mail/brevo-provider.mjs'
});
export function digest(b){return createHash('sha256').update(b).digest('hex');}
export function readonlySqlViolations(sql){
  const s=String(sql||'').replace(/^\s*--[^\n]*$/gm,'').trim();
  const chunks=s.split(';').map(x=>x.trim()).filter(Boolean);
  const violations=[];
  if(!/^BEGIN\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY$/i.test(chunks[0]||'')) violations.push('missing_explicit_read_only_begin');
  if(!/^COMMIT$/i.test(chunks.at(-1)||'')) violations.push('missing_transaction_commit');
  if(chunks.filter(x=>/^BEGIN\b/i.test(x)).length!==1 || chunks.filter(x=>/^COMMIT\b/i.test(x)).length!==1)
    violations.push('unexpected_transaction_boundary');
  for(const [i,ch] of chunks.entries()){
    if(i===0||i===chunks.length-1)continue;
    if(/^SET\s+LOCAL\s+(statement_timeout|lock_timeout)\s*=\s*'[0-9]+ms'$/i.test(ch))continue;
    if(!/^SELECT\s/i.test(ch)) {violations.push(`non_select_statement_${i}`);continue;}
    const clean=ch.replace(/'(?:''|[^'])*'/g,"''");
    if(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|MERGE|CALL|COPY|PERFORM|DO|EXECUTE|pg_sleep|dblink|lo_export)\b/i.test(clean)) violations.push(`unsafe_select_statement_${i}`);
  }
  if(chunks.length<6) violations.push('missing_catalog_checks');
  if(!s.includes('pg_catalog.pg_constraint')||!s.includes('pg_catalog.pg_trigger')||!s.includes('pg_catalog.pg_index')||!s.includes('has_table_privilege'))violations.push('missing_catalog_coverage');
  return [...new Set(violations)];
}
export function inspectG4Offline(root=ROOT){
  const errors=[];
  const content={};
  for(const [key,path] of Object.entries(FIXED_FILES)){
    const full=join(root,path);
    if(!existsSync(full)){errors.push('missing_source:'+key);continue;}
    content[key]=readFileSync(full,'utf8');
  }
  if(errors.length)return {stage:'D06-D2B-G4-PREP',offlineSafetyPass:false,livePostgresVerified:false,readyToDeploy:false,errors};
  errors.push(...readonlySqlViolations(content.sql));
  if(!content.gate2.includes('P108_D06D2B_GATE2_VENDOR_AND_LIVE_DELIVERY_LOCKED = true'))errors.push('gate2_lock_missing');
  if(!content.gate2.includes("async dispatch(){throw err('gate2_vendor_dispatch_permanently_locked')"))errors.push('dispatch_hard_lock_missing');
  if(!content.gate2.includes("async retry(){throw err('gate2_automatic_retry_forbidden')"))errors.push('retry_hard_lock_missing');
  if(!content.preserve.includes('resend')||!content.brevo.includes('brevo'))errors.push('dual_provider_source_missing');
  if(!content.draft.includes('DRAFT')||!content.draft.includes('NOT AN APPLIED MIGRATION'))errors.push('schema_draft_marker_missing');
  const blockers=[];
  if(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(content.draft))blockers.push('ddl_if_not_exists_cannot_detect_shape_drift');
  if(/DROP\s+TRIGGER\s+IF\s+EXISTS/i.test(content.draft))blockers.push('draft_replaces_existing_triggers');
  if(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(content.draft))blockers.push('draft_replaces_existing_functions');
  blockers.push('postgresql_constraints_trigger_and_concurrency_not_tested','runtime_db_role_grants_not_approved',
    'live_clerk_binding_not_tested','staging_eight_area_regression_not_independently_verified',
    'outbox_id_5_not_independently_reviewed','brevo_sandbox_network_not_approved');
  return {
    stage:'D06-D2B-G4-PREP',offlineSafetyPass:errors.length===0,livePostgresVerified:false,
    readyToDeploy:false,realMailAllowed:false,provider:'brevo',retainedProviders:['brevo','resend'],
    allowedActions:['review_offline','separately_approved_readonly_catalog_inspection'],
    schemaDraftSha256:digest(content.draft),catalogSqlSha256:digest(content.sql),
    errors,blockingFindings:blockers,postgresCommandsExecuted:0,emailsSent:0,
  };
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const args=process.argv.slice(2);
 if(args.length) {process.stderr.write('G4-PREP forbids arguments and connections.\n');process.exitCode=2;}
 else {const r=inspectG4Offline();process.stdout.write(JSON.stringify(r,null,2)+'\n');if(!r.offlineSafetyPass)process.exitCode=1;}
}
