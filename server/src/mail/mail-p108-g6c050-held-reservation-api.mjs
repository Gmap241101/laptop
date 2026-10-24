// Phase34 G6-C: STAGING-only, default-OFF, authenticated held_locked write.
// A reservation is NOT authorization to send. No Brevo/Resend HTTP, Outbox
// mutation, worker, or live delivery entry point is imported or reachable.
import {createHash} from 'node:crypto';
import {createD06D2BG5TrustedClerkAuthority} from './mail-p108-d06d2b-g5-clerk-binding.mjs';
import {requireMailPreflightReverification,P108_D06_LIVE_DELIVERY_LOCKED}
  from './mail-p108-preflight-control.mjs';
import {inspectG6SandboxReadiness,G6_VENDOR_NETWORK_LOCKED,G6_LIVE_MAIL_LOCKED}
  from './mail-p108-g6-brevo-readiness.mjs';
import {buildD06D2AOfflinePlan,validateD06D2ASandboxPayload}
  from './mail-p108-d06d2a-sandbox-gate.mjs';
import {P103_REAL_DELIVERY_LOCKED} from './mail-dynoweb-dispatcher.mjs';
import {P108_REAL_DELIVERY_LOCKED} from './mail-p108-protected-bridge.mjs';
import {G6C_050_CHECKSUM,G6C_POSTMIGRATION_NETWORK_LOCKED}
  from './mail-p108-g6c-postmigration-readonly.mjs';

export const G6C050_HELD_PATH='/api/admin/mail-delivery/g6c-held-reservations';
export const G6C050_HELD_PROVIDER_NETWORK_LOCKED=true;
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checksum=value=>createHash('sha256').update(value).digest('hex');
const deny=(code,status=403)=>Object.assign(new Error(code),{code,status});
const EXPECTED_MIGRATION='050_phase34_p1_08_mail_sandbox_review_ledger.sql';
const lockedFlags=()=>[P103_REAL_DELIVERY_LOCKED,P108_REAL_DELIVERY_LOCKED,
 P108_D06_LIVE_DELIVERY_LOCKED,G6_VENDOR_NETWORK_LOCKED,G6_LIVE_MAIL_LOCKED,
 G6C_POSTMIGRATION_NETWORK_LOCKED,G6C050_HELD_PROVIDER_NETWORK_LOCKED].every(x=>x===true);

export function createG6C050HeldReservationApi({config,adminClerkAuthService,pool,getServerMailConfig,now=()=>Date.now()}={}){
 if(config?.appEnv!=='staging'||!config?.clerkJwtKey||
    typeof adminClerkAuthService?.authorizeCurrent!=='function'||
    typeof pool?.connect!=='function'||typeof getServerMailConfig!=='function')
   throw new TypeError('g6c050_staging_trusted_server_dependencies_required');
 const owner=createD06D2BG5TrustedClerkAuthority({clerkJwtConfig:config,adminClerkAuthService,now});
 return Object.freeze({
  async reserve({httpRequest,body}={}){
   if(httpRequest?.method!=='POST')throw deny('g6c050_post_required',405);
   // Browser writes must originate from the same allowlisted origin signed into
   // the verified Clerk token. The CORS wildcard/Origin header is not authority.
   const origin=httpRequest?.headers?.origin;
   if(typeof origin!=='string'||!config.clerkAuthorizedParties.includes(origin))
     throw deny('g6c050_origin_not_authorized');
   if(!/^application\/json(?:\s*;|$)/i.test(String(httpRequest.headers['content-type']||'')))
     throw deny('g6c050_json_content_type_required',415);
   if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).sort().join(',')!=='approvalId,confirmHeldOnly'||
     body.confirmHeldOnly!==true||typeof body.approvalId!=='string'||
     !UUID_V4.test(body.approvalId))throw deny('g6c050_held_confirmation_invalid',400);
   // The request supplies only an idempotency UUID and an acknowledgment;
   // never a recipient, administrator identity, provider, release, or evidence.
   const verified=await owner.verifyServerAuthority({httpRequest});
   const proof=requireMailPreflightReverification(verified);
   if(verified.auth?.authorizedParty!==origin)throw deny('g6c050_signed_origin_mismatch');
   if(!lockedFlags())throw deny('g6c050_delivery_lock_integrity_invalid');
   let mail;
   try{mail=getServerMailConfig();}catch{throw deny('g6c050_mail_configuration_unavailable');}
   if(mail?.environment!=='staging'||mail?.enabled!==false||
      mail?.liveSendingReady!==false||mail?.provider!=='brevo'||
      mail?.configured!==true||mail?.domainVerified!==true||
      !(mail.allowlist instanceof Set)||mail.allowlist.size!==1||
      inspectG6SandboxReadiness(mail).syntheticPlanReady!==true)
     throw deny('g6c050_staging_mail_safety_blocked');
   const recipient=[...mail.allowlist][0];
   const {apiKey:_omitted,...safeMail}=mail;
   const syntheticConfig={...safeMail,enabled:true,
     dailyLimit:Math.min(mail.dailyLimit,30),monthlyLimit:Math.min(mail.monthlyLimit,900)};
   let bodyDigest;
   try{
     const plan=buildD06D2AOfflinePlan({config:syntheticConfig,recipient});
     validateD06D2ASandboxPayload(plan.body,recipient);
     if(plan.canExecuteVendorRequest!==false||plan.canDeliverEmail!==false)
       throw Error('unsafe synthetic plan');
     bodyDigest=plan.bodyDigest;
   }catch{throw deny('g6c050_synthetic_plan_not_ready');}
   if(!/^[a-f0-9]{64}$/.test(String(bodyDigest||'')))throw deny('g6c050_body_digest_invalid');
   const approvalDigest=checksum('phase34.g6c.held_review.v1:'+body.approvalId);
   let db,started=false;
   try{
     db=await pool.connect();
     await db.query('BEGIN');started=true;
     await db.query('SET LOCAL statement_timeout = 5000');
     await db.query('SET LOCAL lock_timeout = 2000');
     await db.query("SELECT pg_advisory_xact_lock(hashtext('phase34-p108-g6c-review-held-lock'))");
     // No access to unverified or modified schema. Same hash as applied 050.
     const migration=await db.query(`SELECT COUNT(*)::integer AS total FROM public.schema_migrations
       WHERE name=$1 AND BTRIM(checksum)=$2`,[EXPECTED_MIGRATION,G6C_050_CHECKSUM]);
     if(Number(migration.rows[0]?.total)!==1)throw deny('g6c050_schema_checksum_not_verified',503);
     // Ensure the 050 audit immutability guards were not disabled after approval.
     const guard=await db.query(`SELECT COUNT(*)::integer AS total FROM pg_trigger
       WHERE tgrelid IN ('public.app_mail_sandbox_review_reservations'::regclass,
        'public.app_mail_sandbox_review_audit'::regclass)
       AND NOT tgisinternal AND tgenabled='O' AND tgname = ANY($1::text[])`,[
       ['app_mail_sandbox_review_audit_immutable_trigger','app_mail_sandbox_review_audit_no_truncate',
        'app_mail_sandbox_review_terminal_trigger','app_mail_sandbox_review_no_delete_trigger',
        'app_mail_sandbox_review_reservation_no_truncate']]);
     if(Number(guard.rows[0]?.total)!==5)throw deny('g6c050_ledger_immutability_guards_invalid',503);
     const outbox=await db.query(`SELECT id,state,attempt_count,lease_owner,lease_expires_at,
       provider_message_id FROM public.app_mail_outbox WHERE id=5 FOR SHARE`);
     const held=outbox.rows[0];
     if(outbox.rows.length!==1||String(held.id)!=='5'||held.state!=='queued'||
       Number(held.attempt_count)!==0||held.lease_owner!=null||
       held.lease_expires_at!=null||held.provider_message_id!=null)
       throw deny('g6c050_outbox5_not_locked');
     const attempts=await db.query(`SELECT COUNT(*)::integer AS total FROM public.app_mail_delivery_attempts
       WHERE mail_outbox_id=5`);
     if(Number(attempts.rows[0]?.total)!==0)throw deny('g6c050_outbox5_attempts_present');
     const latest=await db.query(`SELECT review_result FROM public.app_mail_preflight_reviews
       ORDER BY id DESC LIMIT 1`);
     if(latest.rows.length!==1||latest.rows[0].review_result!=='reviewed_locked')
       throw deny('g6c050_preflight_not_reviewed_locked');
     // Owner JWT is time-limited and must still be live after taking the DB lock.
     if(verified.auth.expiresAt <= now()/1000)
       throw deny('g6c050_session_expired_while_waiting');
     const inserted=await db.query(`INSERT INTO public.app_mail_sandbox_review_reservations
       (approval_digest,actor_clerk_user_id,reauth_digest,session_digest,body_digest,provider,state)
       VALUES ($1,$2,$3,$4,$5,'brevo','held_locked')
       ON CONFLICT DO NOTHING RETURNING id`,[
       approvalDigest,proof.actorId,proof.verificationDigest,proof.sessionDigest,bodyDigest]);
     if(inserted.rows.length!==1)throw deny('g6c050_duplicate_or_reauthentication_reused',409);
     await db.query(`INSERT INTO public.app_mail_sandbox_review_audit
       (reservation_id,event,actor_clerk_user_id,payload_digest)
       VALUES ($1,'review_held',$2,$3)`,[inserted.rows[0].id,proof.actorId,bodyDigest]);
     await db.query('COMMIT');started=false;
     return Object.freeze({state:'held_locked',reservationId:String(inserted.rows[0].id),
       reviewOnly:true,schema050Verified:true,approvedForNetwork:false,
       canReserveAgain:false,canApprove:false,canInvokeBrevo:false,canSendMail:false,
       canRetry:false,canUseResendFallback:false,canModifyOutbox:false,
       dbWrites:2,networkRequests:0,realEmailsSent:0});
   }catch(error){
     if(started)await db.query('ROLLBACK').catch(()=>{});
     if(error?.code==='23505')throw deny('g6c050_duplicate_or_reauthentication_reused',409);
     if(error?.status)throw error;
     throw deny('g6c050_held_transaction_failed',503);
   }finally{db?.release();}
  },
  async dispatch(){throw deny('g6c050_vendor_dispatch_locked');},
  async approveNetwork(){throw deny('g6c050_network_approval_not_implemented');},
  async retry(){throw deny('g6c050_retry_forbidden');},
 });
}
