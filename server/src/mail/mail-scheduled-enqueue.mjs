// P1-06: one PostgreSQL and existing web dyno. No mail provider or external sends.
import { listScheduledUserMailCandidates, enqueueUserMail } from './mail-user-event-bridge.mjs';
export const getSeoulBusinessDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);
const KEYS = Object.freeze(['rental_due_reminder','rental_overdue']);
const MAX_PAGES_PER_EVENT = 200; // bounded: 20,000 requests/event/run at limit 100
export function createP106ScheduledEnqueue(pool, {now=()=>new Date()}={}) {
  if(typeof pool?.connect !== 'function') throw new TypeError('mail_schedule_postgres_pool_required');
  return Object.freeze({
    async tick({referenceDate=getSeoulBusinessDate(now()),limit=100}={}) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || (Number.isNaN(Date.parse(`${referenceDate}T00:00:00.000Z`)) || new Date(`${referenceDate}T00:00:00.000Z`).toISOString().slice(0,10)!==referenceDate) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError('mail_schedule_arguments_invalid');
      }
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        // Only one scheduled scan runs per database at any time (multiple dyno safety).
        const lock=await client.query("SELECT pg_try_advisory_xact_lock(hashtext('phase34-p1-06-scheduled-mail')) AS locked");
        if (lock.rows[0]?.locked!==true) {await client.query('ROLLBACK');return {state:'busy',queued:0,duplicates:0};}
        const policy=await client.query("SELECT payload FROM app_system_configuration WHERE config_key='mail-notification-settings'");
        let queued=0,duplicates=0,candidates=0,disabled=0,pages=0,truncated=false;
        for(const eventKey of KEYS) {
          if(policy.rows[0]?.payload?.events?.[eventKey]?.enabled!==true) {disabled++;continue;}
          let afterId=0;
          for(let page=0; page<MAX_PAGES_PER_EVENT; page++) {
            const entries=await listScheduledUserMailCandidates({client,eventKey,referenceDate,limit,afterId});
            pages++;
            candidates+=entries.length;
            for(const entry of entries) {
              const result=await enqueueUserMail({client,eventKey,eventId:entry.eventId,
                recipientEmail:entry.recipientEmail,values:entry.values});
              if(result.queued && result.id) {
                await client.query(`UPDATE app_mail_outbox SET source_request_id=$2,
                  source_due_date=$3::date,scheduled_for_date=$4::date WHERE id=$1 AND state='queued'`,
                [result.id,entry.sourceRequestId,entry.sourceDueDate,referenceDate]);
                queued++;
              } else if(result.duplicate) duplicates++;
            }
            if(entries.length < limit) break;
            const nextId=Number(entries.at(-1)?.rentalRowId || 0);
            if(!Number.isSafeInteger(nextId) || nextId<=afterId) {
              throw new Error('mail_schedule_cursor_invalid');
            }
            afterId=nextId;
            if(page===MAX_PAGES_PER_EVENT-1) truncated=true;
          }
        }
        await client.query('COMMIT');
        return Object.freeze({state:truncated?'partial':'complete',queued,duplicates,candidates,disabled,pages,truncated,referenceDate});
      } catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
      finally {client.release();}
    },
  });
}
// Feature gate is FALSE by default in every environment. Enabling it later does
// NOT unlock actual sending. Runtime starts only if explicitly configured.

// Read-only, privacy-preserving operator preview. Does not register a single email.
export function createP106ScheduledPreview(pool,{now=()=>new Date()}={}) {
  if(typeof pool?.query!=='function')throw new TypeError('mail_schedule_postgres_pool_required');
  return Object.freeze({async preview() {
    const referenceDate=getSeoulBusinessDate(now());
    const [candidates,settings]=await Promise.all([
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE r.due_date=($1::date+INTERVAL '1 day')::date)::integer AS due_tomorrow,
        COUNT(*) FILTER (WHERE r.due_date<$1::date)::integer AS overdue
        FROM app_rental_requests r WHERE r.status='대여중'`,[referenceDate]),
      pool.query("SELECT payload FROM app_system_configuration WHERE config_key='mail-notification-settings'"),
    ]);
    const events=settings.rows[0]?.payload?.events || {};
    return Object.freeze({authority:'postgresql',readOnly:true,referenceDate,
      dueTomorrow:Number(candidates.rows[0]?.due_tomorrow||0),
      overdue:Number(candidates.rows[0]?.overdue||0),
      dueEnabled:events.rental_due_reminder?.enabled===true,
      overdueEnabled:events.rental_overdue?.enabled===true});
  }});
}

export function startP106ScheduledLoop({runner,enabled=false,intervalMs=3600000,schedule=setInterval,cancel=clearInterval}={}) {
  if(typeof runner?.tick!=='function')throw new TypeError('mail_schedule_runner_required');
  if(!Number.isInteger(intervalMs)||intervalMs<60000)throw new RangeError('mail_schedule_interval_invalid');
  let timer=null;
  return Object.freeze({start(){if(!enabled||timer!==null)return false;
    timer=schedule(()=>{void runner.tick().catch((error)=>console.warn('[mail-schedule] scan failed',{code:error?.code||'scan_error'}));},intervalMs);
    return true;},stop(){if(timer===null)return false;cancel(timer);timer=null;return true;}});
}
