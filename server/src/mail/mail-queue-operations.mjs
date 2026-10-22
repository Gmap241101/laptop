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
        pool.query(`SELECT id,event_key,state,recipient_email,attempt_count,last_error_code,
           created_at,updated_at,sent_at FROM app_mail_outbox
           ORDER BY created_at DESC,id DESC LIMIT $1`,[limit]),
        pool.query(`SELECT state,count(*)::integer AS total FROM app_mail_outbox GROUP BY state`),
      ]);
      return Object.freeze({authority:'postgresql',rows:records.rows.map(row=>({
        id:String(row.id),eventKey:row.event_key,eventTitle:MAIL_EVENT_BY_KEY[row.event_key]?.title||row.event_key,
        state:row.state,recipientMasked:mask(row.recipient_email),attemptCount:Number(row.attempt_count||0),
        errorCode:row.last_error_code||'',createdAt:row.created_at,updatedAt:row.updated_at,sentAt:row.sent_at,
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
  });
}
