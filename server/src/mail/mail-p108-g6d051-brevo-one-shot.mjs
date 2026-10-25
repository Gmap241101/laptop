// Phase 34 P1-08 G6-D: one and only one externally authorized Brevo SANDBOX
// request per existing STAGING database (GLOBAL singleton). NOT a mail sender.
// No worker, retry, live mail, fallback, queue write or user-supplied recipient.
import {createHash} from 'node:crypto';
import {createD06D2BG5TrustedClerkAuthority} from './mail-p108-d06d2b-g5-clerk-binding.mjs';
import {requireMailPreflightReverification} from './mail-p108-preflight-control.mjs';
import {inspectG6SandboxReadiness} from './mail-p108-g6-brevo-readiness.mjs';
import {buildD06D2AOfflinePlan,validateD06D2ASandboxPayload,D06D2A_ENDPOINT}
 from './mail-p108-d06d2a-sandbox-gate.mjs';
import {G6C_050_CHECKSUM} from './mail-p108-g6c-postmigration-readonly.mjs';
import {P103_REAL_DELIVERY_LOCKED} from './mail-dynoweb-dispatcher.mjs';
import {P108_REAL_DELIVERY_LOCKED} from './mail-p108-protected-bridge.mjs';
import {P108_D06_LIVE_DELIVERY_LOCKED} from './mail-p108-preflight-control.mjs';
import {G6_VENDOR_NETWORK_LOCKED,G6_LIVE_MAIL_LOCKED} from './mail-p108-g6-brevo-readiness.mjs';

export const G6D051_PATH='/api/admin/mail-delivery/g6d-brevo-sandbox-one-shot';
export const G6D051_LIVE_DELIVERY_LOCKED=true;
export const G6D051_NO_AUTO_RETRY=true;
export const G6D051_CHECKSUM='2a610fa4c2ae74ca920d9eb0b334d1ae61b40e3a69fc3127ff1a90a21fef2f10';
const MIGRATION_050='050_phase34_p1_08_mail_sandbox_review_ledger.sql';
const MIGRATION_051='051_phase34_p1_08_brevo_sandbox_one_shot_claim.sql';
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const SHA=x=>createHash('sha256').update(x).digest('hex');
const deny=(code,status=403)=>Object.assign(new Error(code),{code,status});
const sourceLocks=()=>[P103_REAL_DELIVERY_LOCKED,P108_REAL_DELIVERY_LOCKED,
 P108_D06_LIVE_DELIVERY_LOCKED,G6_VENDOR_NETWORK_LOCKED,G6_LIVE_MAIL_LOCKED,
 G6D051_LIVE_DELIVERY_LOCKED,G6D051_NO_AUTO_RETRY].every(x=>x===true);
const integerValue=result=>Number(result?.rows?.[0]?.total);

export function createG6D051BrevoOneShot({config,adminClerkAuthService,pool,
 getServerMailConfig,approvalDigest,approvalExpiresAt,fetchImpl=globalThis.fetch,
 now=()=>Date.now()}={}){
 if(config?.appEnv!=='staging'||!config?.clerkJwtKey||
    typeof adminClerkAuthService?.authorizeCurrent!=='function'||
    typeof pool?.connect!=='function'||typeof getServerMailConfig!=='function'||
    typeof fetchImpl!=='function'||!HEX.test(String(approvalDigest||''))||
    !Number.isSafeInteger(approvalExpiresAt)||typeof now!=='function')
   throw new TypeError('g6d051_explicit_staging_one_shot_dependencies_required');
 const authority=createD06D2BG5TrustedClerkAuthority({clerkJwtConfig:config,adminClerkAuthService,now});
 const checkApprovalWindow=()=>{
   const ms=now();
   if(ms/1000>=approvalExpiresAt || approvalExpiresAt-ms/1000>600)
     throw deny('g6d051_explicit_approval_not_current');
 };
 async function checkSafety(db,mail,bodyDigest){
   const result=await db.query(`SELECT COUNT(*)::integer AS total FROM public.schema_migrations
      WHERE (name=$1 AND BTRIM(checksum)=$2) OR (name=$3 AND BTRIM(checksum)=$4)`,
      [MIGRATION_050,G6C_050_CHECKSUM,MIGRATION_051,G6D051_CHECKSUM]);
   if(integerValue(result)!==2)throw deny('g6d051_migrations_not_verified',503);
   const triggers=await db.query(`SELECT COUNT(*)::integer AS total FROM pg_trigger
     WHERE NOT tgisinternal AND tgenabled='O' AND (
      (tgrelid='public.app_mail_sandbox_one_shot_claim'::regclass AND
       tgname=ANY($1::text[])) OR
      (tgrelid=ANY(ARRAY['public.app_mail_sandbox_review_reservations'::regclass,
        'public.app_mail_sandbox_review_audit'::regclass]) AND
       tgname=ANY($2::text[])))`,[
        ['app_mail_sandbox_one_shot_claim_immutable_trigger','app_mail_sandbox_one_shot_claim_no_truncate'],
        ['app_mail_sandbox_review_audit_immutable_trigger','app_mail_sandbox_review_audit_no_truncate',
         'app_mail_sandbox_review_terminal_trigger','app_mail_sandbox_review_no_delete_trigger',
         'app_mail_sandbox_review_reservation_no_truncate']]);
   if(integerValue(triggers)!==7)throw deny('g6d051_immutability_missing',503);
   const outbox=await db.query(`SELECT id,state,attempt_count,lease_owner,
     lease_expires_at,provider_message_id FROM public.app_mail_outbox WHERE id=5 FOR SHARE`);
   const x=outbox.rows[0];
   if(outbox.rows.length!==1||Number(x.id)!==5||x.state!=='queued'||
      Number(x.attempt_count)!==0||x.lease_owner!=null||x.lease_expires_at!=null||
      x.provider_message_id!=null)throw deny('g6d051_outbox5_not_locked');
   const attempts=await db.query(`SELECT COUNT(*)::integer AS total FROM public.app_mail_delivery_attempts
      WHERE mail_outbox_id=5`);
   if(integerValue(attempts)!==0)throw deny('g6d051_outbox5_attempts_present');
   const latest=await db.query(`SELECT review_result FROM public.app_mail_preflight_reviews
      ORDER BY id DESC LIMIT 1`);
   if(latest.rows.length!==1||latest.rows[0].review_result!=='reviewed_locked')
     throw deny('g6d051_preflight_not_reviewed_locked');
   const held=await db.query(`SELECT id,state,provider,actor_clerk_user_id,reauth_digest,body_digest,
      verdict,settled_at,provider_id_digest
      FROM public.app_mail_sandbox_review_reservations WHERE id=1 FOR UPDATE`);
   const r=held.rows[0];
   if(held.rows.length!==1||Number(r.id)!==1||r.state!=='held_locked'||r.provider!=='brevo'||
      r.verdict!=null||r.settled_at!=null||r.provider_id_digest!=null||
      r.body_digest?.trim()!==bodyDigest)throw deny('g6d051_held_record_invalid');
   return r;
 }
 async function queryTransaction(work){
   let db,started=false;
   try{
     db=await pool.connect();await db.query('BEGIN');started=true;
     await db.query('SET LOCAL statement_timeout = 5000');
     await db.query('SET LOCAL lock_timeout = 2000');
     const result=await work(db);
     await db.query('COMMIT');started=false;
     return result;
   }catch(e){
     if(started)await db?.query('ROLLBACK').catch(()=>{});
     if(e?.code==='23505')throw deny('g6d051_one_shot_already_consumed',409);
     if(e?.status)throw e;
     throw deny('g6d051_db_operation_unavailable',503);
   }finally{db?.release();}
 }
 return Object.freeze({
  async execute({httpRequest,body}={}){
   if(httpRequest?.method!=='POST')throw deny('g6d051_post_only',405);
   const origin=httpRequest?.headers?.origin;
   if(!config.clerkAuthorizedParties.includes(origin))throw deny('g6d051_origin_not_allowed');
   if(!/^application\/json(?:\s*;|$)/i.test(String(httpRequest?.headers?.['content-type']||'')))
     throw deny('g6d051_json_required',415);
   if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).sort().join(',')!=='approvalTicket,confirmSandboxDrop,operatorAttestsBrevoControlPlaneReviewed,reservationId'||
      body.reservationId!==1||!UUID_V4.test(String(body.approvalTicket||''))||
      body.confirmSandboxDrop!==true||body.operatorAttestsBrevoControlPlaneReviewed!==true)
     throw deny('g6d051_request_invalid',400);
   checkApprovalWindow();
   if(SHA('phase34.g6d.sandbox.one_shot.v1:'+body.approvalTicket)!==approvalDigest)
     throw deny('g6d051_approval_ticket_invalid');
   const verified=await authority.verifyServerAuthority({httpRequest});
   const proof=requireMailPreflightReverification(verified);
   if(verified.auth.authorizedParty!==origin)throw deny('g6d051_signed_origin_mismatch');
   if(!sourceLocks())throw deny('g6d051_live_delivery_lock_invalid');
   let mail;
   try{mail=getServerMailConfig();}catch{throw deny('g6d051_mail_config_unavailable');}
   if(mail?.environment!=='staging'||mail.enabled!==false||mail.liveSendingReady!==false||
      mail.provider!=='brevo'||mail.configured!==true||mail.domainVerified!==true||
      !(mail.allowlist instanceof Set)||mail.allowlist.size!==1||
      typeof mail.apiKey!=='string'||!mail.apiKey.trim()||
      inspectG6SandboxReadiness(mail).syntheticPlanReady!==true)
     throw deny('g6d051_mail_safety_not_ready');
   const recipient=[...mail.allowlist][0];
   const {apiKey:_remove,...offline}=mail;
   const syntheticConfig={...offline,enabled:true,
      dailyLimit:Math.min(mail.dailyLimit,30),monthlyLimit:Math.min(mail.monthlyLimit,900)};
   let plan;
   try{
     plan=buildD06D2AOfflinePlan({config:syntheticConfig,recipient});
     validateD06D2ASandboxPayload(plan.body,recipient);
     if(plan.endpoint!==D06D2A_ENDPOINT||plan.body?.headers?.['X-Sib-Sandbox']!=='drop'||
        plan.canExecuteVendorRequest!==false||plan.canDeliverEmail!==false)throw Error('unsafe');
   }catch{throw deny('g6d051_sandbox_payload_invalid');}
   // Commit the global singleton BEFORE the external request. Even a timeout,
   // crash or reverse-proxy 502 CANNOT obtain a second network permit.
   await queryTransaction(async db=>{
     const claimed=await db.query('SELECT singleton_id FROM public.app_mail_sandbox_one_shot_claim WHERE singleton_id=1');
     if(claimed.rows.length)throw deny('g6d051_one_shot_already_consumed',409);
     const held=await checkSafety(db,mail,plan.bodyDigest);
     if(held.actor_clerk_user_id!==proof.actorId||held.reauth_digest?.trim()===proof.verificationDigest)
       throw deny('g6d051_owner_or_reauth_mismatch');
     if(verified.auth.expiresAt<=now()/1000)throw deny('g6d051_token_expired_during_lock');
     checkApprovalWindow();
     const insert=await db.query(`INSERT INTO public.app_mail_sandbox_one_shot_claim
       (singleton_id,reservation_id,actor_clerk_user_id,approval_digest,body_digest)
       VALUES (1,1,$1,$2,$3) ON CONFLICT DO NOTHING RETURNING singleton_id`,
       [proof.actorId,approvalDigest,plan.bodyDigest]);
     if(insert.rows.length!==1)throw deny('g6d051_one_shot_already_consumed',409);
   });
   // This is the SINGLE external HTTP request. No retry on ANY status or error.
   // X-Sib-Sandbox is *only* in the Brevo JSON headers object, not the HTTP headers.
   let verdict='uncertain_quarantine',providerDigest=null,httpStatus=null;
   try{
     const response=await fetchImpl(D06D2A_ENDPOINT,{
       method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),
       headers:{'accept':'application/json','content-type':'application/json','api-key':mail.apiKey},
       body:JSON.stringify(plan.body),
     });
     httpStatus=Number(response?.status);
     const raw=await response.text();
     if(raw.length>8192)throw Error('untrusted response too large');
     let responseBody;
     try{responseBody=JSON.parse(raw);}catch{responseBody=null;}
     if(httpStatus===201&&responseBody&&typeof responseBody.messageId==='string'&&
        responseBody.messageId.length>=3&&responseBody.messageId.length<=255&&
        !/[\u0000-\u001f\u007f]/.test(responseBody.messageId)){
       verdict='sandbox_simulated_acceptance';providerDigest=SHA(responseBody.messageId);
     }else if(httpStatus===429){verdict='rate_limited_manual_review';}
     else if([400,401,403,404,422].includes(httpStatus)){verdict='rejected_manual_review';}
   }catch{
     // The request may have reached Brevo even if the response never arrived.
     // It is therefore irrevocably consumed and NOT safe to retry.
     verdict='uncertain_quarantine';
   }
   const state=verdict==='sandbox_simulated_acceptance'?'simulated_accepted':
     verdict==='uncertain_quarantine'?'uncertain_quarantine':'manual_review';
   // Settlement may fail after the request. Claim remains committed even then.
   // Manual investigation is mandatory; NEVER repeat the provider request.
   await queryTransaction(async db=>{
     const updated=await db.query(`UPDATE public.app_mail_sandbox_review_reservations
       SET state=$1,verdict=$2,provider_id_digest=$3,settled_at=NOW()
       WHERE id=1 AND state='held_locked' RETURNING id`,
       [state,verdict,providerDigest]);
     if(updated.rows.length!==1)throw deny('g6d051_settlement_inconsistent',503);
     await db.query(`INSERT INTO public.app_mail_sandbox_review_audit
       (reservation_id,event,actor_clerk_user_id,payload_digest) VALUES (1,$1,$2,$3)`,
       [state,proof.actorId,plan.bodyDigest]);
   });
   return Object.freeze({mode:'G6D_STAGING_BREVO_SANDBOX_ONE_SHOT',
     reservationId:'1',claimConsumed:true,provider:'brevo',state,verdict,
     providerHttpStatus:Number.isSafeInteger(httpStatus)?httpStatus:null,
     providerIdDigest:providerDigest,providerCallsAttempted:1,
     sandboxOnly:true,sandboxHeader:'drop',realEmailsSent:0,
     delivered:false,canRetry:false,canUseResendFallback:false,
     canSendMail:false,canModifyOutbox:false});
  },
  async retry(){throw deny('g6d051_retry_never_allowed');},
  async sendLive(){throw deny('g6d051_live_delivery_never_allowed');},
 });
}
