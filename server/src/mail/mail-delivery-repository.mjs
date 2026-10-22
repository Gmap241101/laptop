// P1-03: PostgreSQL-backed claim/quota/recovery. Not connected to live delivery.
import { randomUUID } from 'node:crypto';
const fail = (code) => Object.assign(new Error(code), { code });
const validProvider = (value) => value === 'brevo' || value === 'resend';
const number = (v) => Number(v || 0);
const safeInt = (v, max) => Number.isSafeInteger(v) && v > 0 && v <= max;

export const createMailDeliveryRepository = (pool) => {
  if (typeof pool?.connect !== 'function') throw new TypeError('PostgreSQL pool required');
  const transaction = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  };
  return Object.freeze({
    async quarantineExpired({ limit = 100 } = {}) {
      if (!safeInt(limit, 100)) throw fail('mail_recovery_limit_invalid');
      return transaction(async (client) => {
        const result = await client.query(`WITH expired AS (
          SELECT id, claim_token FROM app_mail_outbox
          WHERE state='processing' AND lease_expires_at < NOW()
          ORDER BY lease_expires_at, id FOR UPDATE SKIP LOCKED LIMIT $1
        ), changed AS (
          UPDATE app_mail_outbox o
          SET state='uncertain', last_error_code='mail_lease_expired_uncertain',
              lease_owner=NULL, lease_expires_at=NULL, updated_at=NOW()
          FROM expired e WHERE o.id=e.id
          RETURNING e.claim_token
        )
        UPDATE app_mail_delivery_attempts a
        SET outcome='uncertain', completed_at=NOW(), safe_error_code='mail_lease_expired_uncertain'
        FROM changed c WHERE a.claim_token=c.claim_token AND a.outcome='reserved'
        RETURNING a.claim_token`, [limit]);
        return Object.freeze({ quarantined: result.rowCount || 0 });
      });
    },
    async claim({ provider, dailyLimit, monthlyLimit, leaseSeconds = 120, owner = 'web-dyno' }) {
      if (!validProvider(provider)) throw fail('mail_provider_invalid');
      if (!safeInt(dailyLimit, 300) || !safeInt(monthlyLimit, 9300) ||
          !safeInt(leaseSeconds, 300) || leaseSeconds < 30 ||
          typeof owner !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(owner)) {
        throw fail('mail_claim_config_invalid');
      }
      return transaction(async (client) => {
        // One global transactional lock serializes quota reservations across all web dynos.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('phase34-mail-quota-global-v1'))");
        const ready = await client.query(`SELECT id,event_key,recipient_email,subject,body_text,body_html,
            attempt_count,max_attempts FROM app_mail_outbox
          WHERE state IN ('queued','retry') AND available_at<=NOW()
          ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1`);
        const mail = ready.rows[0];
        if (!mail) return Object.freeze({ state:'empty' });
        // Administrator OFF must also cancel messages queued BEFORE the policy change.
        // FOR SHARE serializes the check against a concurrent settings edit transaction.
        const policy = await client.query(`SELECT payload FROM app_system_configuration
          WHERE config_key='mail-notification-settings' FOR SHARE`);
        if (policy.rows[0]?.payload?.events?.[mail.event_key]?.enabled !== true) {
          await client.query(`UPDATE app_mail_outbox
            SET state='cancelled',last_error_code='mail_event_disabled',updated_at=NOW()
            WHERE id=$1`, [mail.id]);
          return Object.freeze({ state:'event_disabled' });
        }
        if (number(mail.attempt_count) >= number(mail.max_attempts)) {
          await client.query(`UPDATE app_mail_outbox SET state='failed',last_error_code='mail_attempts_exhausted',updated_at=NOW()
            WHERE id=$1`, [mail.id]);
          return Object.freeze({ state:'attempts_exhausted' });
        }
        const quota = await client.query(`SELECT
          COUNT(*) FILTER (WHERE reserved_at > NOW() - INTERVAL '24 hours')::integer AS day_count,
          COUNT(*) FILTER (WHERE reserved_at > NOW() - INTERVAL '30 days')::integer AS month_count
          FROM app_mail_delivery_attempts`);
        const used = quota.rows[0] || {};
        if (number(used.day_count) >= dailyLimit || number(used.month_count) >= monthlyLimit) {
          return Object.freeze({ state:'quota_exhausted' });
        }
        const token = randomUUID();
        await client.query(`INSERT INTO app_mail_delivery_attempts(mail_outbox_id,claim_token,provider_name)
          VALUES($1,$2,$3)`, [mail.id,token,provider]);
        await client.query(`INSERT INTO app_mail_delivery_quota(quota_day,reserved_count,updated_at)
          VALUES((NOW() AT TIME ZONE 'UTC')::date,1,NOW())
          ON CONFLICT(quota_day) DO UPDATE SET reserved_count=app_mail_delivery_quota.reserved_count+1,updated_at=NOW()`);
        await client.query(`UPDATE app_mail_outbox SET state='processing',attempt_count=attempt_count+1,
          lease_owner=$2,claim_token=$3,lease_expires_at=NOW()+($4::integer * INTERVAL '1 second'),updated_at=NOW()
          WHERE id=$1`,[mail.id,owner,token,leaseSeconds]);
        return Object.freeze({ state:'claimed', token, provider, mail:Object.freeze({
          id: mail.id, eventKey:mail.event_key, to:mail.recipient_email, subject:mail.subject,
          text:mail.body_text, html:mail.body_html, attempt:number(mail.attempt_count)+1,
          maxAttempts:number(mail.max_attempts),
        }) });
      });
    },
    async conclude({ claim, outcome, providerMessageId = null, errorCode = null, backoffSeconds = 60 }) {
      if (!claim || claim.state !== 'claimed' || !/^[a-f0-9-]{36}$/.test(claim.token)) throw fail('mail_claim_invalid');
      if (!['accepted','retry','rejected','uncertain'].includes(outcome)) throw fail('mail_outcome_invalid');
      if (!safeInt(backoffSeconds,86400)) throw fail('mail_backoff_invalid');
      if (outcome === 'accepted' && (typeof providerMessageId !== 'string' || providerMessageId.length < 3 || providerMessageId.length > 255)) {
        throw fail('mail_provider_message_id_invalid');
      }
      // Never store untrusted provider error bodies. Codes are fixed, bounded ASCII identifiers.
      if (errorCode !== null && (typeof errorCode !== 'string' || !/^[a-z0-9_]{1,80}$/.test(errorCode))) throw fail('mail_error_code_invalid');
      const next = outcome === 'accepted' ? 'sent' : outcome === 'retry' && claim.mail.attempt < claim.mail.maxAttempts ? 'retry' : outcome === 'retry' ? 'failed' : outcome === 'rejected' ? 'failed' : 'uncertain';
      return transaction(async (client) => {
        const changed = await client.query(`UPDATE app_mail_outbox SET state=$3,
            provider_message_id=CASE WHEN $3='sent' THEN $4 ELSE provider_message_id END,
            last_error_code=$5,
            available_at=CASE WHEN $3='retry' THEN NOW()+($6::integer*INTERVAL '1 second') ELSE available_at END,
            sent_at=CASE WHEN $3='sent' THEN NOW() ELSE sent_at END,
            lease_owner=NULL,lease_expires_at=NULL,updated_at=NOW()
          WHERE id=$1 AND claim_token=$2 AND state='processing'
          RETURNING id`,[claim.mail.id,claim.token,next,providerMessageId,errorCode,backoffSeconds]);
        if (changed.rowCount !== 1) throw fail('mail_claim_lost_or_stale');
        await client.query(`UPDATE app_mail_delivery_attempts SET outcome=$2,completed_at=NOW(),
          provider_message_id=$3,safe_error_code=$4 WHERE claim_token=$1 AND outcome='reserved'`,
          [claim.token,outcome,providerMessageId,errorCode]);
        if (next==='sent') await client.query(`UPDATE app_mail_delivery_quota SET sent_count=sent_count+1,
          updated_at=NOW() WHERE quota_day=(SELECT (reserved_at AT TIME ZONE 'UTC')::date
            FROM app_mail_delivery_attempts WHERE claim_token=$1)`,[claim.token]);
        return Object.freeze({ state:next, accepted:next==='sent' });
      });
    },
  });
};
