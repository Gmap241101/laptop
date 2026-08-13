import { randomUUID } from 'node:crypto';

const ALLOWED_KEYS = new Set(['admin-security', 'user-session-policy']);
const AUDIT_KEY = 'system-settings-audit';
const serviceError = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const normalizeKey = (value) => String(value || '').trim().toLowerCase();
const trim = (value) => String(value ?? '').trim();

export const createSystemConfigService = ({ repository }) => {
  if (!repository || typeof repository.get !== 'function' || typeof repository.put !== 'function' || typeof repository.listAudit !== 'function' || typeof repository.appendAudit !== 'function') {
    throw new TypeError('System configuration repository is required.');
  }
  const ensureKey = (value) => {
    const key = normalizeKey(value);
    if (!ALLOWED_KEYS.has(key)) throw serviceError('system_config_key_invalid', 'Unsupported system configuration key.', 400);
    return key;
  };
  return Object.freeze({
    async get(keyValue) {
      const key = ensureKey(keyValue);
      const entry = await repository.get(key);
      return Object.freeze({ key, source: 'postgresql', payload: entry?.payload || {}, updatedAt: entry?.updatedAt || null });
    },
    async put({ key: keyValue, payload, actorClerkUserId }) {
      const key = ensureKey(keyValue);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw serviceError('system_config_payload_invalid', 'System configuration payload must be an object.', 400);
      }
      const entry = await repository.put({ key, payload, actorClerkUserId });
      return Object.freeze({ key, source: 'postgresql', payload: entry.payload, updatedAt: entry.updatedAt });
    },
    async listAudit({ limit = 50 } = {}) {
      const logs = await repository.listAudit({ key: AUDIT_KEY, limit });
      return Object.freeze({ source: 'postgresql', logs });
    },
    async appendAudit({ input = {}, actorClerkUserId = '', admin = null } = {}) {
      const action = trim(input?.action);
      const section = trim(input?.section);
      const summary = trim(input?.summary);
      if (!action || !section) {
        throw serviceError('system_settings_audit_fields_required', 'System settings audit action and section are required.', 400);
      }
      const entry = Object.freeze({
        id: randomUUID(),
        action,
        section,
        summary,
        beforeValues: input?.beforeValues && typeof input.beforeValues === 'object' && !Array.isArray(input.beforeValues) ? input.beforeValues : {},
        afterValues: input?.afterValues && typeof input.afterValues === 'object' && !Array.isArray(input.afterValues) ? input.afterValues : {},
        adminUid: trim(actorClerkUserId),
        adminName: trim(admin?.userName || admin?.adminLoginId || admin?.authEmail || actorClerkUserId || '관리자'),
        createdAt: new Date().toISOString(),
      });
      await repository.appendAudit({ key: AUDIT_KEY, entry, actorClerkUserId, maxEntries: 200 });
      return Object.freeze({ source: 'postgresql', entry });
    },
  });
};
