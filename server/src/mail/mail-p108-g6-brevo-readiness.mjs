// Phase 34 P1-08 G6: default-OFF, owner-only, signed-Clerk read-only Brevo
// sandbox readiness. No transport, credential exposure, DB/Outbox write,
// sender activation, webhook, delivery dispatch, or approval endpoint.
import {createD06D2BG5TrustedClerkAuthority} from './mail-p108-d06d2b-g5-clerk-binding.mjs';
import {inspectD06D2AOfflinePolicy, buildD06D2AOfflinePlan,
  validateD06D2ASandboxPayload, classifyD06D2AMockOutcome,
  D06D2A_ENDPOINT} from './mail-p108-d06d2a-sandbox-gate.mjs';
import {D06D_BREVO_SENDER} from './mail-p108-d06d1-brevo-sandbox.mjs';
import {P103_REAL_DELIVERY_LOCKED} from './mail-dynoweb-dispatcher.mjs';
import {P108_REAL_DELIVERY_LOCKED} from './mail-p108-protected-bridge.mjs';
import {P108_D06_LIVE_DELIVERY_LOCKED} from './mail-p108-preflight-control.mjs';

export const G6_SANDBOX_READINESS_PATH='/api/admin/mail-delivery/g6-sandbox-readiness';
export const G6_VENDOR_NETWORK_LOCKED=true;
export const G6_LIVE_MAIL_LOCKED=true;
const refuse=(code)=>Object.assign(new Error(code),{code,status:403});
const unique=values=>Object.freeze([...new Set(values)].sort());

// Caller may provide ONLY server-owned configuration. Never feed client JSON
// into the allowlist, sender, sender verification or provider selection.
export function inspectG6SandboxReadiness(mailConfig) {
  const blockers=[];
  if(!mailConfig || typeof mailConfig!=='object')blockers.push('mail_config_unavailable');
  if(mailConfig?.environment!=='staging')blockers.push('g6_staging_required');
  if(mailConfig?.provider!=='brevo')blockers.push('g6_brevo_provider_required');
  if(mailConfig?.enabled!==true)blockers.push('g6_mail_config_disabled');
  if(mailConfig?.sender!==D06D_BREVO_SENDER)blockers.push('g6_sender_not_configured');
  if(mailConfig?.domainVerified!==true)blockers.push('g6_domain_verification_claim_missing');
  if(typeof mailConfig?.apiKey!=='string'||!mailConfig.apiKey.trim())blockers.push('g6_api_key_missing');
  if(mailConfig?.liveSendingReady!==false)blockers.push('g6_live_send_config_must_be_off');
  if(mailConfig?.allowlist?.size<1||mailConfig?.allowlist?.size>5||!(mailConfig?.allowlist instanceof Set))
    blockers.push('g6_allowlist_1_to_5_required');
  // Existing D06-D2A policy is authoritative for synthetic payloads.
  const allowlist = mailConfig?.allowlist instanceof Set ? [...mailConfig.allowlist] : [];
  for(const recipient of allowlist){
    // Explicitly exclude API key from the offline-only policy config.
    const {apiKey: _ignored, ...withoutSecrets}=mailConfig||{};
    // G6 trial caps are local synthetic-plan ceilings, never changes to the
    // existing production/staging mail quota configuration.
    const offlineConfig={...withoutSecrets,
      dailyLimit:Number.isSafeInteger(mailConfig?.dailyLimit) && mailConfig.dailyLimit>0
        ? Math.min(mailConfig.dailyLimit,30) : mailConfig?.dailyLimit,
      monthlyLimit:Number.isSafeInteger(mailConfig?.monthlyLimit) && mailConfig.monthlyLimit>0
        ? Math.min(mailConfig.monthlyLimit,900) : mailConfig?.monthlyLimit};
    const policy=inspectD06D2AOfflinePolicy({config:offlineConfig,recipient});
    blockers.push(...policy.blockers.map(code=>`offline_${code}`));
    if(policy.canBuildSynthetic){
      const plan=buildD06D2AOfflinePlan({config:offlineConfig,recipient});
      validateD06D2ASandboxPayload(plan.body,recipient);
      if(plan.endpoint!==D06D2A_ENDPOINT||plan.canExecuteVendorRequest!==false)
        blockers.push('g6_unsafe_synthetic_plan');
    }
  }
  if([G6_VENDOR_NETWORK_LOCKED,G6_LIVE_MAIL_LOCKED,P103_REAL_DELIVERY_LOCKED,
    P108_REAL_DELIVERY_LOCKED,P108_D06_LIVE_DELIVERY_LOCKED].some(v=>v!==true))
    blockers.push('g6_source_delivery_locks_invalid');
  // A mail domain flag is NOT independent Brevo account verification.
  // Even if blockers=[] this never grants vendor network access.
  return Object.freeze({mode:'G6_STAGING_OWNER_READONLY_REVIEW',
    provider:'brevo',endpoint:D06D2A_ENDPOINT,senderDomain:'mail.notebook.recruit.kro.kr',
    senderConfigured:mailConfig?.sender===D06D_BREVO_SENDER,
    operatorClaimedDomainVerified:mailConfig?.domainVerified===true,
    independentBrevoSenderVerified:false,
    credentialPresent:typeof mailConfig?.apiKey==='string'&&Boolean(mailConfig.apiKey.trim()),
    allowlistCount:allowlist.length,
    syntheticPlanReady:blockers.length===0,blockers:unique(blockers),
    requiresIndependentBrevoControlPlaneReview:true,
    requiresExplicitOneTimeNetworkApproval:true,
    requiresServerSideOneShotAuditAndIdempotency:true,
    realVendorRequests:0,realEmailsSent:0,dbWrites:0,outboxMutations:0,
    canInvokeBrevo:false,canSendMail:false,canApproveSandbox:false,canAutoRetry:false,
    sandboxHeaderPlacement:'JSON_BODY_HEADERS',sandboxHeaderValue:'drop'});
}

export function createG6SandboxReadiness({config,adminClerkAuthService,getServerMailConfig}={}){
  if(config?.appEnv!=='staging'||typeof getServerMailConfig!=='function')
    throw new TypeError('g6_staging_owner_and_server_config_required');
  const authority=createD06D2BG5TrustedClerkAuthority({clerkJwtConfig:config,adminClerkAuthService});
  return Object.freeze({
    async check(request){
      if(request?.method!=='GET')throw refuse('g6_get_only');
      await authority.verifyServerAuthority({httpRequest:request});
      let serverConfig;
      try{serverConfig=getServerMailConfig();}catch{serverConfig=null;}
      return inspectG6SandboxReadiness(serverConfig);
    },
    async dispatch(){throw refuse('g6_vendor_network_locked');},
    async approve(){throw refuse('g6_sandbox_approval_not_implemented');},
    async retry(){throw refuse('g6_automatic_retry_forbidden');},
  });
}

// Pure offline fixture harness: accepts only an injected declared mock function.
// Does not import fetch, the Brevo provider, database, or environment secrets.
export async function simulateG6BrevoFixture({config,recipient,mockTransport}={}){
  if(typeof mockTransport!=='function'||mockTransport.isMock!==true)
    throw refuse('g6_explicit_mock_transport_required');
  const {apiKey:_secret,...safeConfig}=config||{};
  const plan=buildD06D2AOfflinePlan({config:safeConfig,recipient});
  validateD06D2ASandboxPayload(plan.body,recipient);
  let outcome;
  try{
    const answer=await mockTransport(Object.freeze({method:'POST',endpoint:plan.endpoint,
      body:plan.body,bodyDigest:plan.bodyDigest}));
    outcome=classifyD06D2AMockOutcome({status:answer?.status,body:answer?.body});
  }catch{outcome=classifyD06D2AMockOutcome({status:0,body:null});}
  return Object.freeze({mode:'G6_OFFLINE_MOCK',verdict:outcome.verdict,
    syntheticAccepted:outcome.sandboxAccepted,providerIdDigest:outcome.providerIdDigest,
    vendorRequestsExecuted:0,realEmailsSent:0,outboxMutations:0,
    automaticRetryAllowed:false,liveSendingReady:false});
}
