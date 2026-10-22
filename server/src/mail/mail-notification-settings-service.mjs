import { MAIL_EVENTS, MAIL_EVENT_BY_KEY, validateMailEventUpdate } from './mail-event-catalog.mjs';

const POLICY_KEY = 'mail-notification-settings';
const error = (code, status) => Object.assign(new Error(code), { code, status });
const emptyPayload = () => ({ revision: 0, events: {}, audit: [] });
const eventView = (event, patch = {}) => ({
  key: event.key, category: event.category, title: event.title, recipient: event.recipient,
  enabled: patch.enabled === true,
  subject: typeof patch.subject === 'string' ? patch.subject : event.defaultSubject,
  body: typeof patch.body === 'string' ? patch.body : event.defaultBody,
  variables: [...event.variables],
});
const present = (payload) => ({
  authority: 'postgresql', revision: Number(payload.revision || 0),
  // No Outbox/dispatcher or live delivery is wired at this stage.
  liveSendingEnabled: false, provider: 'undecided',
  events: MAIL_EVENTS.map((event) => eventView(event, payload.events?.[event.key])),
});

export const createMailNotificationSettingsService = (pool) => {
  if (typeof pool?.query !== 'function' || typeof pool?.connect !== 'function') throw new TypeError('PostgreSQL pool required.');
  return Object.freeze({
    async list() {
      const result = await pool.query('SELECT payload FROM app_system_configuration WHERE config_key=$1', [POLICY_KEY]);
      return present(result.rows[0]?.payload || emptyPayload());
    },
    async saveEvent({ key, input, actorClerkUserId }) {
      const patch = validateMailEventUpdate(key, input);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [POLICY_KEY]);
        const existing = await client.query('SELECT payload FROM app_system_configuration WHERE config_key=$1 FOR UPDATE', [POLICY_KEY]);
        const current = existing.rows[0]?.payload || emptyPayload();
        const revision = Number(current.revision || 0);
        if (patch.expectedRevision !== revision) throw error('mail_settings_revision_conflict', 409);
        const event = MAIL_EVENT_BY_KEY[key];
        const before = eventView(event, current.events?.[key]);
        const next = {
          ...current,
          revision: revision + 1,
          events: { ...current.events, [key]: { enabled: patch.enabled, subject: patch.subject, body: patch.body } },
          audit: [{ revision: revision + 1, eventKey: key, actor: String(actorClerkUserId || '').slice(0, 120),
            changedAt: new Date().toISOString(), enabledBefore: before.enabled, enabledAfter: patch.enabled,
            templateChanged: before.subject !== patch.subject || before.body !== patch.body },
            ...(Array.isArray(current.audit) ? current.audit : [])].slice(0, 200),
        };
        await client.query(`INSERT INTO app_system_configuration
          (config_key,payload,updated_by_clerk_user_id,created_at,updated_at)
          VALUES ($1,$2::jsonb,$3,NOW(),NOW())
          ON CONFLICT(config_key) DO UPDATE SET payload=EXCLUDED.payload,
            updated_by_clerk_user_id=EXCLUDED.updated_by_clerk_user_id, updated_at=NOW()`,
          [POLICY_KEY, JSON.stringify(next), String(actorClerkUserId || '')]);
        await client.query('COMMIT');
        return present(next);
      } catch (failure) {
        await client.query('ROLLBACK').catch(() => {});
        throw failure;
      } finally { client.release(); }
    },
  });
};
