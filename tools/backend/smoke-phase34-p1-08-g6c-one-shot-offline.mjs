// Offline G6-C safety acceptance: no network, database, secrets, or filesystem writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectG6COfflineApprovalReview,dispatchG6CNetwork,approveG6CNetwork,
  G6C_NETWORK_AND_LIVE_DELIVERY_LOCKED} from '../../server/src/mail/mail-p108-g6c-one-shot-review.mjs';
const now=Date.parse('2026-10-24T10:00:00.000Z');
const email='approved@example.test';
const apiKey='SECRET-CANARY-SHOULD-NOT-LEAK';
const config={environment:'staging',provider:'brevo',enabled:false,
  liveSendingReady:false,sender:'noreply@mail.notebook.recruit.kro.kr',
  domainVerified:true,apiKey,allowlist:new Set([email]),dailyLimit:30,monthlyLimit:900};
const approvalId='123e4567-e89b-42d3-a456-426614174000';
const evidence={gitCommit:'a'.repeat(40),releaseVersion:'v320',
  deploymentMatchesServer:true,backupsAndOutboxReviewed:true,
  brevoSenderReviewedInConsole:true,brevoTransactionalApiReviewedInConsole:true,
  sandboxOnlyHumanApproval:true,observedAt:'2026-10-24T09:50:00.000Z'};
let count=0;
function eq(a,b){assert.deepEqual(a,b);count++;}
function yes(value){assert.ok(value);count++;}
function no(value){assert.ok(!value);count++;}
function denied(code,patch={}){
 const {mailConfig=config,recipient=email,proposedApprovalId=approvalId,...rest}=patch;
 const result=inspectG6COfflineApprovalReview({mailConfig,recipient,proposedApprovalId,
   evidence:{...evidence,...rest},nowMs:now});
 yes(result.blockers.includes(code));eq(result.approvedForNetwork,false);
 return result;
}
const success=inspectG6COfflineApprovalReview({mailConfig:config,recipient:email,
 proposedApprovalId:approvalId,evidence,nowMs:now});
eq(success.mode,'G6C_OFFLINE_NON_AUTHORIZING_REVIEW');
eq(success.reviewChecklistComplete,true);
eq(success.operatorClaimsIndependentlyVerified,false);
eq(success.canCreateDurableApproval,false);
eq(success.canReserveNetworkAttempt,false);
eq(success.durableIdempotencyImplemented,false);
eq(success.approvalSchemaDeployed,false);
eq(success.approvedForNetwork,false);
eq(success.canInvokeBrevo,false);
eq(success.canSendRealMail,false);
eq(success.canAutoRetry,false);
eq(success.canUseResendFallback,false);
eq(success.canModifyOutbox,false);
eq(success.realProviderCalls,0);
eq(success.realEmailsSent,0);
eq(success.dbWrites,0);
eq(success.blockers.length,0);
yes(/^[0-9a-f]{64}$/.test(success.reviewDigest));
yes(/^[0-9a-f]{64}$/.test(success.proposedApprovalDigest));
eq(success.prerequisites.networkExecutorNotImplemented,true);
eq(G6C_NETWORK_AND_LIVE_DELIVERY_LOCKED,true);
const exposed=JSON.stringify(success);
for(const secret of [apiKey,email,approvalId,evidence.gitCommit,'Bearer ','user_'])no(exposed.includes(secret));
denied('g6c_live_delivery_must_be_off',{mailConfig:{...config,enabled:true}});
denied('g6c_staging_only',{mailConfig:{...config,environment:'production'}});
denied('g6c_readiness_blocked',{mailConfig:{...config,apiKey:''}});
denied('g6c_exactly_one_allowlisted_recipient',{mailConfig:{...config,allowlist:new Set()}});
denied('g6c_exactly_one_allowlisted_recipient',{mailConfig:{...config,allowlist:new Set([email,'other@example.test'])}});
denied('g6c_recipient_not_in_allowlist',{recipient:'unauthorized@example.test'});
denied('g6c_approval_uuid_required',{proposedApprovalId:'wrong'});
denied('g6c_git_commit_invalid',{gitCommit:'v311'});
denied('g6c_release_version_invalid',{releaseVersion:'311'});
denied('g6c_independent_deployment_confirmation_needed',{deploymentMatchesServer:false});
denied('g6c_independent_backup_outbox_review_needed',{backupsAndOutboxReviewed:false});
denied('g6c_independent_brevo_console_review_needed',{brevoSenderReviewedInConsole:false});
denied('g6c_independent_brevo_console_review_needed',{brevoTransactionalApiReviewedInConsole:false});
denied('g6c_explicit_one_time_sandbox_approval_needed',{sandboxOnlyHumanApproval:false});
denied('g6c_evidence_not_current',{observedAt:'2026-10-22T09:50:00.000Z'});
denied('g6c_evidence_not_current',{observedAt:'2026-10-24T10:10:00.000Z'});
await assert.rejects(dispatchG6CNetwork(),{code:'g6c_network_execution_not_implemented'});count++;
await assert.rejects(approveG6CNetwork(),{code:'g6c_approval_not_available'});count++;
// Read-only source contract: no route/import, new migration, direct transport or external IO.
const runtime=readFileSync('server/src/app.mjs','utf8')+
 readFileSync('server/src/index.mjs','utf8')+
 readFileSync('server/src/mail/mail-dynoweb-dispatcher.mjs','utf8');
no(runtime.includes('mail-p108-g6c-one-shot-review.mjs'));
const file=readFileSync('server/src/mail/mail-p108-g6c-one-shot-review.mjs','utf8');
no(/\bfetch\s*\(/.test(file));no(/\bhttps?\.request\s*\(/.test(file));
no(/\bprocess\.env\b/.test(file));no(/\bpool\.query\s*\(/.test(file));
const schema=readFileSync('docs/phase34/050_mail_sandbox_review_schema_DRAFT_NOT_DEPLOY.sql','utf8');
yes(schema.includes('NOT AN APPLIED MIGRATION'));
console.log(`[G6-C OFFLINE APPROVAL REVIEW] PASS ${count} assertions; vendor=0 mail=0 db=0 live network=0; schema NOT DEPLOYED`);
