// P1-06: read-only operational history, owner-confirmed cancellation; no send/retry API.
import { MAIL_EVENT_BY_KEY } from './mail-event-catalog.mjs';
const bad=(code,status=400)=>Object.assign(new Error(code),{code,status});
const mask=(value)=>{const [local,domain]=String(value||'').split('@');
  if(!local||!domain)return '***';return `${local.slice(0,1)}***@${domain}`;};
export function createMailQueueOperations(pool) {
  if (typeof pool?.query !== 'function' || typeof pool?.connect !== 'function') throw new TypeError('mail_queue_pool_required');
  return Object.freeze({
    async list({limit=30}={}) {
      if(!Number.isInteger(limit)||limit<1||limit>100)throw bad('mail_queue_limit_invalid');
      const [records,summary]=await Promise.all([
        pool.query(`SELECT o.id,o.event_key,o.state,o.recipient_email,o.attempt_count,o.last_error_code,
           o.created_at,o.updated_at,o.sent_at,
           (o.state='failed' AND o.last_error_code IN ('provider_rate_limited','mail_attempts_exhausted')
             AND o.source_request_id IS NULL AND o.provider_message_id IS NULL
             AND EXISTS(SELECT 1 FROM app_mail_delivery_attempts a
               WHERE a.mail_outbox_id=o.id AND a.outcome='retry')
             AND NOT EXISTS(SELECT 1 FROM app_mail_delivery_attempts a
               WHERE a.mail_outbox_id=o.id AND a.outcome<>'retry')
             AND EXISTS (SELECT 1 FROM app_system_configuration config
               WHERE config.config_key='mail-notification-settings'
                 AND config.payload->'events'->o.event_key->>'enabled'='true')
             AND (o.event_key NOT IN ('admin_signup_pending','admin_rental_pending')
               OR EXISTS(SELECT 1 FROM app_admin_identity_registry admin
                 WHERE lower(admin.auth_email)=lower(o.recipient_email)
                   AND admin.status='active' AND admin.admin_role IN ('owner','admin') AND admin.mail_notifications_enabled=TRUE
                   AND admin.clerk_link_state='linked'
                   AND NULLIF(admin.clerk_user_id,'') IS NOT NULL
                   AND (admin.lock_until IS NULL OR admin.lock_until<=NOW())))) AS safe_retry_candidate
           FROM app_mail_outbox o ORDER BY o.created_at DESC,o.id DESC LIMIT $1`,[limit]),
        pool.query(`SELECT state,count(*)::integer AS total FROM app_mail_outbox GROUP BY state`),
      ]);
      return Object.freeze({authority:'postgresql',rows:records.rows.map(row=>({
        id:String(row.id),eventKey:row.event_key,eventTitle:MAIL_EVENT_BY_KEY[row.event_key]?.title||row.event_key,
        state:row.state,recipientMasked:mask(row.recipient_email),attemptCount:Number(row.attempt_count||0),
        errorCode:row.last_error_code||'',retryEligible:row.safe_retry_candidate===true,createdAt:row.created_at,updatedAt:row.updated_at,sentAt:row.sent_at,
      })),counts:Object.fromEntries(summary.rows.map(r=>[r.state,Number(r.total)]))});
    },
    async cancel({id,actorClerkUserId}) {
      const key=String(id||'');
      if(!/^[1-9]\d{0,18}$/.test(key))throw bad('mail_queue_id_invalid');
      if(typeof actorClerkUserId!=='string'||!/^user_[a-zA-Z0-9]{8,}$/.test(actorClerkUserId))throw bad('mail_actor_invalid');
      const result=await pool.query(`WITH target AS (
        SELECT id,state AS previous_state FROM app_mail_outbox
        WHERE id=$1::bigint AND state IN ('queued','retry') FOR UPDATE
      ), changed AS (
        UPDATE app_mail_outbox o SET state='cancelled',last_error_code='mail_owner_cancelled',updated_at=NOW()
        FROM target t WHERE o.id=t.id
        RETURNING o.id,t.previous_state,o.state
      ), audit AS (
        INSERT INTO app_mail_queue_actions(mail_outbox_id,action,actor_clerk_user_id,previous_state,new_state)
        SELECT id,'cancel',$2,previous_state,state FROM changed RETURNING id
      ) SELECT id FROM changed`,[key,actorClerkUserId]);
      if(!result.rows.length)throw bad('mail_queue_not_cancellable',409);
      return Object.freeze({cancelled:true,id:key});
    },
    // Only definitive provider rate limits are eligible for an owner-authorized retry.
    // Any uncertain/accepted/reserved attempt permanently blocks manual requeue.
    // Existing quota reservations are NOT cleared or refunded.
    async retry({id,actorClerkUserId}) {
      const key=String(id||'');
      if(!/^[1-9]\d{0,18}$/.test(key))throw bad('mail_queue_id_invalid');
      if(typeof actorClerkUserId!=='string'||!/^user_[a-zA-Z0-9]{8,}$/.test(actorClerkUserId))throw bad('mail_actor_invalid');
      const result=await pool.query(`WITH target AS (
        SELECT o.id,o.state AS previous_state FROM app_mail_outbox o
        WHERE o.id=$1::bigint AND o.state='failed'
          AND o.last_error_code IN ('provider_rate_limited','mail_attempts_exhausted')
          AND o.source_request_id IS NULL AND o.provider_message_id IS NULL
          AND EXISTS (SELECT 1 FROM app_mail_delivery_attempts a
             WHERE a.mail_outbox_id=o.id AND a.outcome='retry')
          AND NOT EXISTS (SELECT 1 FROM app_mail_delivery_attempts a
             WHERE a.mail_outbox_id=o.id AND a.outcome<>'retry')
          AND EXISTS (SELECT 1 FROM app_system_configuration config
             WHERE config.config_key='mail-notification-settings'
               AND config.payload->'events'->o.event_key->>'enabled'='true')
          AND (o.event_key NOT IN ('admin_signup_pending','admin_rental_pending')
            OR EXISTS(SELECT 1 FROM app_admin_identity_registry admin
               WHERE lower(admin.auth_email)=lower(o.recipient_email)
                 AND admin.status='active' AND admin.admin_role IN ('owner','admin') AND admin.mail_notifications_enabled=TRUE
                 AND admin.clerk_link_state='linked'
                 AND NULLIF(admin.clerk_user_id,'') IS NOT NULL
                 AND (admin.lock_until IS NULL OR admin.lock_until<=NOW())))
        FOR UPDATE OF o
      ), changed AS (
        UPDATE app_mail_outbox o SET state='queued',attempt_count=0,
          last_error_code='mail_owner_requeued',available_at=NOW(),
          claim_token=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=NOW()
        FROM target t WHERE o.id=t.id RETURNING o.id,t.previous_state,o.state
      ), audit AS (
        INSERT INTO app_mail_queue_actions(mail_outbox_id,action,actor_clerk_user_id,previous_state,new_state)
        SELECT id,'retry',$2,previous_state,state FROM changed RETURNING id
      ) SELECT id FROM changed`,[key,actorClerkUserId]);
      if(!result.rows.length)throw bad('mail_queue_not_safely_retryable',409);
      return Object.freeze({requeued:true,id:key});
    },
  });
}
