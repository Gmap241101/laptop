// D06-A/B: real Clerk owner + recent-verification audit and a read-only
// PostgreSQL/SMTP readiness preflight. NOT an authorization to send mail.
import { createHash } from 'node:crypto';
import { P103_REAL_DELIVERY_LOCKED } from './mail-dynoweb-dispatcher.mjs';
import { P108_REAL_DELIVERY_LOCKED } from './mail-p108-protected-bridge.mjs';
import { loadP101MailConfig } from './mail-provider-config.mjs';

export const P108_D06_LIVE_DELIVERY_LOCKED = true;
const problem=(code,status=403)=>Object.assign(new Error(code),{code,status});
const digest=(value)=>createHash('sha256').update(value).digest('hex');
const role=(value)=>value?.adminAuth?.admin?.adminRole;
const identity=(value)=>value?.auth;
const VALID_ID=/^user_[A-Za-z0-9]{8,}$/;
const VALID_REVERIFY=/^[a-zA-Z0-9_-]{10,180}$/;

export function requireMailPreflightOwner(authority) {
  if(role(authority)!=='owner' || !VALID_ID.test(String(identity(authority)?.userId||'')))
    throw problem('mail_preflight_owner_required');
  return identity(authority);
}
export function requireMailPreflightReverification(authority,maxMinutes=5) {
  const auth=requireMailPreflightOwner(authority);
  const age=auth.factorVerificationAge?.[0];
  if(!Number.isSafeInteger(age)||age<0||age>=maxMinutes)
    throw problem('mail_preflight_recent_reauthentication_required');
  if(!VALID_REVERIFY.test(String(auth.reverificationId||'')) ||
    typeof auth.sessionId!=='string'||!auth.sessionId.trim() ||
    !Number.isSafeInteger(auth.issuedAt)|| !Number.isSafeInteger(auth.expiresAt))
    throw problem('mail_preflight_signed_reverification_required');
  return Object.freeze({actorId:auth.userId,
    sessionDigest:digest(`p108.session.v1:${auth.sessionId}`),
    verificationDigest:digest(`p108.reverify.v1:${auth.userId}:${auth.sessionId}:${auth.reverificationId}`)});
}

const stableBlockers=(values)=>Object.freeze([...new Set(values)].sort());
export function evaluateMailPreflightPolicy({environment,mailConfig,counts={},agedCount=0}={}) {
  const blockers=[];
  // The hard lock is intentionally a permanent blocker in this phase.
  if(P103_REAL_DELIVERY_LOCKED!==true||P108_REAL_DELIVERY_LOCKED!==true||P108_D06_LIVE_DELIVERY_LOCKED!==true)
    blockers.push('mail_delivery_lock_integrity_invalid');
  blockers.push('mail_real_delivery_not_authorized');
  if(environment!=='staging')blockers.push('mail_staging_environment_required');
  if(!mailConfig?.enabled || !['brevo','resend'].includes(mailConfig?.provider))blockers.push('mail_provider_not_enabled');
  if(!mailConfig?.domainVerified || !mailConfig?.sender || !mailConfig?.apiKey)
    blockers.push('mail_provider_not_verified');
  if(!(mailConfig?.allowlist instanceof Set) || mailConfig.allowlist.size===0)
    blockers.push('mail_staging_allowlist_missing');
  if(mailConfig?.liveSendingReady!==false)blockers.push('mail_config_live_override_invalid');
  if(Number(counts.queued||0)+Number(counts.retry||0)+Number(counts.processing||0)>0)
    blockers.push('mail_existing_outbox_requires_review');
  if(agedCount>0)blockers.push('mail_aged_outbox_requires_review');
  return Object.freeze({liveSendingReady:false,canSend:false,blockers:stableBlockers(blockers)});
}

export function createMailPreflightControl(pool,{environment='staging',getMailConfig=()=>loadP101MailConfig(process.env), now=()=>new Date()}={}) {
  if(typeof pool?.query!=='function'||typeof pool?.connect!=='function')throw new TypeError('mail_preflight_pool_required');
  const querySnapshot=async(db)=>{
    const [counts,age,rows,previous]=await Promise.all([
      db.query(`SELECT state,COUNT(*)::integer AS total FROM app_mail_outbox GROUP BY state`),
      db.query(`SELECT COUNT(*)::integer AS total FROM app_mail_outbox
        WHERE state IN ('queued','retry') AND created_at < $1::timestamptz - INTERVAL '24 hours'`,[now().toISOString()]),
      db.query(`SELECT id,event_key,state,created_at FROM app_mail_outbox
        WHERE state IN ('queued','retry','processing') ORDER BY created_at ASC,id ASC LIMIT 20`),
      db.query(`SELECT id,created_at,review_result FROM app_mail_preflight_reviews ORDER BY id DESC LIMIT 1`),
    ]);
    const tally=Object.fromEntries(counts.rows.map(row=>[row.state,Number(row.total)]));
    let mailConfig;
    try{mailConfig=getMailConfig();}catch{mailConfig=null;}
    const policy=evaluateMailPreflightPolicy({environment,mailConfig,counts:tally,agedCount:Number(age.rows[0]?.total||0)});
    return Object.freeze({authority:'postgresql',readOnly:true,canSend:false,liveSendingReady:false,
      counts:tally,agedCount:Number(age.rows[0]?.total||0),
      samples:rows.rows.map(r=>Object.freeze({id:String(r.id),eventKey:r.event_key,state:r.state,createdAt:r.created_at})),
      providerConfigured:Boolean(mailConfig?.configured),stagingAllowlistPresent:Boolean(mailConfig?.allowlist?.size),
      ...policy,latestReview:previous.rows[0]?{id:String(previous.rows[0].id),createdAt:previous.rows[0].created_at,result:previous.rows[0].review_result}:null});
  };
  return Object.freeze({
    async preview({authority}){requireMailPreflightOwner(authority);return querySnapshot(pool);},
    async acknowledge({authority,acknowledge=false}={}){
      const proof=requireMailPreflightReverification(authority);
      if(acknowledge!==true)throw problem('mail_preflight_confirmation_required',400);
      if(!['staging','production'].includes(environment))throw problem('mail_preflight_environment_unsupported');
      const db=await pool.connect();let started=false;
      try {
        await db.query('BEGIN');started=true;
        await db.query('SET LOCAL statement_timeout = 5000');
        await db.query("SELECT pg_advisory_xact_lock(hashtext('p108-d06-preflight-review'))");
        const snapshot=await querySnapshot(db);
        const hashedSnapshot=digest(JSON.stringify({counts:snapshot.counts,samples:snapshot.samples,
          agedCount:snapshot.agedCount,blockers:snapshot.blockers,providerConfigured:snapshot.providerConfigured}));
        const inserted=await db.query(`INSERT INTO app_mail_preflight_reviews
          (actor_clerk_user_id,session_digest,reverification_digest,snapshot_digest,blocker_codes)
          VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id,created_at,review_result`,
          [proof.actorId,proof.sessionDigest,proof.verificationDigest,hashedSnapshot,JSON.stringify(snapshot.blockers)]);
        await db.query('COMMIT');started=false;
        return Object.freeze({recorded:true,reviewId:String(inserted.rows[0].id),reviewedAt:inserted.rows[0].created_at,
          result:'reviewed_locked',canSend:false,liveSendingReady:false,blockers:snapshot.blockers});
      } catch(err){
        if(started)await db.query('ROLLBACK').catch(()=>{});
        if(err?.code==='23505')throw problem('mail_preflight_reverification_already_used',409);
        throw err;
      } finally { db.release(); }
    },
    // No grant, token, credential, scheduler registration, destructive cleanup, or HTTP send.
    async dispatch(){throw problem('mail_p108_real_delivery_locked');},
  });
}
