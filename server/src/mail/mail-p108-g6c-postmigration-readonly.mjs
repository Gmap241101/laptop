// G6-C post-Migration-050, signed-Clerk owner read-only inspection.
// Only available in STAGING behind an explicit default-OFF flag.
// Never writes to Outbox, reservations, audit, config or provider.
import {createD06D2BG5TrustedClerkAuthority} from './mail-p108-d06d2b-g5-clerk-binding.mjs';

export const G6C_050_CHECKSUM='88d4ee347bbba133f7a0df6e3a88d93ece332bff774b2e8650f8b962bfb28826';
export const G6C_POSTMIGRATION_REVIEW_PATH='/api/admin/mail-delivery/g6c-ledger-status';
export const G6C_POSTMIGRATION_NETWORK_LOCKED=true;

const refuse=(code,status=403)=>Object.assign(new Error(code),{code,status});
const integerCount=value=>Number.isSafeInteger(Number(value)) && Number(value)>=0 ? Number(value) : null;

// Data-only pure helper. Caller MUST start a PostgreSQL READ ONLY transaction.
// This does NOT accept any client-provided body or user identity.
export async function readG6C050LedgerStatusInReadOnlyTransaction(db){
  const migration=await db.query(`SELECT COUNT(*)::integer AS total FROM public.schema_migrations
    WHERE name=$1 AND BTRIM(checksum)=$2`,
    ['050_phase34_p1_08_mail_sandbox_review_ledger.sql',G6C_050_CHECKSUM]);
  if(Number(migration.rows[0]?.total)!==1)throw refuse('g6c050_migration_checksum_unverified',503);
  const tables=await db.query(`SELECT
    to_regclass('public.app_mail_sandbox_review_reservations') IS NOT NULL AS reservations,
    to_regclass('public.app_mail_sandbox_review_audit') IS NOT NULL AS audit`);
  if(tables.rows[0]?.reservations!==true || tables.rows[0]?.audit!==true)
    throw refuse('g6c050_schema_not_ready',503);
  const reservations=await db.query(`SELECT COUNT(*)::integer AS total
    FROM public.app_mail_sandbox_review_reservations`);
  const audit=await db.query(`SELECT COUNT(*)::integer AS total
    FROM public.app_mail_sandbox_review_audit`);
  const reservationCount=integerCount(reservations.rows[0]?.total);
  const auditCount=integerCount(audit.rows[0]?.total);
  if(reservationCount===null || auditCount===null)throw refuse('g6c050_ledger_count_invalid',503);
  const outbox=await db.query(`SELECT COUNT(*)::integer AS total FROM public.app_mail_outbox
    WHERE id=5 AND state='queued' AND attempt_count=0 AND lease_owner IS NULL
    AND lease_expires_at IS NULL AND provider_message_id IS NULL`);
  const attempts=await db.query(`SELECT COUNT(*)::integer AS total
    FROM public.app_mail_delivery_attempts WHERE mail_outbox_id=5`);
  const preflight=await db.query(`SELECT review_result FROM public.app_mail_preflight_reviews
    ORDER BY id DESC LIMIT 1`);
  return Object.freeze({mode:'G6C_STAGING_OWNER_POSTMIGRATION_READONLY',
    schema050Verified:true,existingSinglePostgreSQL:true,
    reservationCount,auditCount,
    outbox5Locked:Number(outbox.rows[0]?.total)===1 && Number(attempts.rows[0]?.total)===0,
    preflightReviewedLocked:preflight.rows[0]?.review_result==='reviewed_locked',
    readOnly:true,dbWrites:0,networkRequests:0,realEmailsSent:0,
    canReserve:false,canApprove:false,canInvokeBrevo:false,canSendMail:false,
    canRetry:false,canUseResendFallback:false});
}

export function createG6C050OwnerReadOnlyStatus({config,adminClerkAuthService,pool,getServerMailConfig}={}){
  if(config?.appEnv!=='staging' || typeof adminClerkAuthService?.authorizeCurrent!=='function' ||
     typeof pool?.connect!=='function' || typeof getServerMailConfig!=='function')
    throw new TypeError('g6c050_staging_server_dependencies_required');
  const owner=createD06D2BG5TrustedClerkAuthority({clerkJwtConfig:config,adminClerkAuthService});
  return Object.freeze({
    async check(request){
      if(request?.method!=='GET')throw refuse('g6c050_get_only',405);
      // Verify trusted signed JWT, live PostgreSQL owner authority and 5-min reauth
      // before obtaining any ledger count.
      await owner.verifyServerAuthority({httpRequest:request});
      let mail;
      try{mail=getServerMailConfig();}catch{throw refuse('g6c050_mail_config_unavailable');}
      if(mail?.environment!=='staging' || mail?.enabled!==false ||
         mail?.liveSendingReady!==false)throw refuse('g6c050_mail_lock_required');
      let db;
      try{db=await pool.connect();}catch{throw refuse('g6c050_database_unavailable',503);}
      try{
        await db.query('BEGIN READ ONLY');
        await db.query('SET LOCAL statement_timeout = 5000');
        await db.query('SET LOCAL lock_timeout = 2000');
        const result=await readG6C050LedgerStatusInReadOnlyTransaction(db);
        await db.query('ROLLBACK'); // End READ ONLY transaction. No commits.
        return result;
      }catch{
        await db.query('ROLLBACK').catch(()=>{});
        throw refuse('g6c050_readonly_status_failed',503);
      }finally{db.release();}
    },
    async reserve(){throw refuse('g6c050_approval_reservation_not_exposed');},
    async dispatch(){throw refuse('g6c050_vendor_transport_locked');},
    async retry(){throw refuse('g6c050_retry_forbidden');},
  });
}
