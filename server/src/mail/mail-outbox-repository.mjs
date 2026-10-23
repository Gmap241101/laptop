// P1-02: ONLY called inside the same caller-owned business PostgreSQL transaction.
// Intentionally no dispatcher, POST to providers, worker, periodic timer, or public API.
import { createHash } from 'node:crypto';
import { MAIL_EVENT_BY_KEY } from './mail-event-catalog.mjs';
import { renderDesignedMail } from './mail-template-design.mjs';
import { parseMailAddress } from './mail-provider-config.mjs';
const failure = (code) => Object.assign(new Error(code), { code });
const validKey = (value) => typeof value === 'string' && value.length >= 8 && value.length <= 256 && !/[\u0000-\u001f]/.test(value);
const sha = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
export const createMailOutboxRepository = () => Object.freeze({
  async enqueueInTransaction({ client, eventKey, recipientEmail, eventId, values }) {
    if (typeof client?.query !== 'function') throw failure('mail_transaction_client_required');
    const definition = MAIL_EVENT_BY_KEY[eventKey];
    if (!definition) throw failure('mail_event_unknown');
    const recipient = parseMailAddress(recipientEmail);
    if (!recipient) throw failure('mail_recipient_invalid');
    if (!validKey(eventId)) throw failure('mail_event_id_invalid');
    // Read policy with the same client, so the row is consistent with business mutation.
    const settings = await client.query("SELECT payload FROM app_system_configuration WHERE config_key='mail-notification-settings'");
    const chosen = settings.rows[0]?.payload?.events?.[eventKey];
    if (!chosen?.enabled) return Object.freeze({ queued:false, reason:'disabled' });
    const template = {
      subject: typeof chosen.subject === 'string' ? chosen.subject : definition.defaultSubject,
      body: typeof chosen.body === 'string' ? chosen.body : definition.defaultBody,
      bodyFormat: chosen.bodyFormat === 'html' ? 'html' : 'text',
    };
    const rendered = renderDesignedMail({template, values, variables:definition.variables, design:settings.rows[0]?.payload?.design});
    const dedupeKey = sha(`${eventKey}\0${eventId}\0${recipient}`);
    const result = await client.query(`INSERT INTO app_mail_outbox
      (dedupe_key,event_key,recipient_email,subject,body_text,body_html,sender_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,
      [dedupeKey,eventKey,recipient,rendered.subject,rendered.text,rendered.html,rendered.senderName]);
    return Object.freeze({ queued:result.rows.length > 0, duplicate:result.rows.length === 0,
      id:result.rows[0]?.id || null });
  },
});
