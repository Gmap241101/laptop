// P1-05: administrator approval-request notifications, transactional enqueue only.
// No sender, timer, extra service or separate database. Must share the business pg client.
import { createHash } from 'node:crypto';
import { MAIL_EVENT_BY_KEY } from './mail-event-catalog.mjs';
import { parseMailAddress } from './mail-provider-config.mjs';
import { createMailOutboxRepository } from './mail-outbox-repository.mjs';
import { memberMailValues, rentalMailValues } from './mail-user-event-bridge.mjs';

const outbox = createMailOutboxRepository();
export const ADMIN_PENDING_EVENT_KEYS = Object.freeze(['admin_signup_pending','admin_rental_pending']);

// In one consistent transaction, use only currently active/linked/unlocked
// administrator accounts. No raw environment-variable or requester-controlled
// address list. Accounts with retired, unlinked or locked identities cannot receive.
export async function listEligibleAdminMailRecipients(client) {
  if (typeof client?.query !== 'function') throw new TypeError('mail_client_required');
  const result = await client.query(`SELECT auth_email FROM app_admin_identity_registry
    WHERE status='active' AND mail_notifications_enabled=TRUE AND admin_role IN ('owner','admin')
      AND clerk_link_state='linked' AND NULLIF(clerk_user_id,'') IS NOT NULL
      AND (lock_until IS NULL OR lock_until <= NOW())
    ORDER BY CASE WHEN admin_role='owner' THEN 0 ELSE 1 END, lower(auth_email)
    LIMIT 101`);
  if (result.rows.length > 100) throw new Error('mail_admin_recipient_limit_exceeded');
  return Object.freeze([...new Set(result.rows.map(r => parseMailAddress(r.auth_email)).filter(Boolean))]);
}

export async function enqueueAdminPendingMail({ client, eventKey, eventId, values }) {
  if (!ADMIN_PENDING_EVENT_KEYS.includes(eventKey) || MAIL_EVENT_BY_KEY[eventKey]?.recipient !== 'admin') {
    throw new TypeError('admin_mail_event_required');
  }
  if (typeof client?.query !== 'function') throw new TypeError('mail_client_required');
  if (typeof eventId !== 'string' || eventId.length < 8 || eventId.length > 256) throw new TypeError('mail_event_id_invalid');
  // Fail closed on missing settings. OFF must cause zero registry reads/inserts.
  const policy = await client.query("SELECT payload FROM app_system_configuration WHERE config_key='mail-notification-settings'");
  if (policy.rows[0]?.payload?.events?.[eventKey]?.enabled !== true) {
    return Object.freeze({queued:0,duplicates:0,recipients:0,reason:'disabled'});
  }
  const recipients = await listEligibleAdminMailRecipients(client);
  let queued=0, duplicates=0;
  for (const recipientEmail of recipients) {
    const result = await outbox.enqueueInTransaction({client,eventKey,eventId,recipientEmail,values});
    if (result.queued) queued++;
    if (result.duplicate) duplicates++;
  }
  return Object.freeze({queued,duplicates,recipients:recipients.length,reason:recipients.length ? 'processed' : 'no_eligible_admin'});
}

export function adminSignupMailValues(account, requestedAt) {
  return memberMailValues('admin_signup_pending', account, { signupRequestedAt:String(requestedAt || '') });
}
export function adminRentalMailValues(request) {
  return rentalMailValues('admin_rental_pending', request);
}

// If account creation was committed before external Clerk provisioning failed,
// the compensating business rollback must remove only this user's queued
// administrator notices. Do not alter unrelated events or attempted sends.
export async function cancelQueuedAdminSignupMail({client,firebaseUid}) {
  if (typeof client?.query !== 'function') throw new TypeError('mail_client_required');
  if (typeof firebaseUid !== 'string' || firebaseUid.length < 1) throw new TypeError('mail_signup_uid_required');
  const eventKey='admin_signup_pending';
  const eventId=`signup:${firebaseUid}`;
  const queued = await client.query(`SELECT dedupe_key, recipient_email FROM app_mail_outbox
    WHERE event_key='admin_signup_pending' AND state='queued'`);
  const keys=queued.rows.filter(row => {
    const email=parseMailAddress(row.recipient_email);
    if (!email) return false;
    const expected=createHash('sha256').update(`${eventKey}\0${eventId}\0${email}`,'utf8').digest('hex');
    return String(row.dedupe_key).trim() === expected;
  }).map(row => String(row.dedupe_key).trim());
  if (!keys.length) return 0;
  const removed=await client.query(`DELETE FROM app_mail_outbox
    WHERE event_key='admin_signup_pending' AND state='queued' AND dedupe_key = ANY($1::char(64)[])`,[keys]);
  return removed.rowCount || 0;
}
