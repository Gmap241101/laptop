const ALLOWED_KEYS = new Set(['admin-security', 'user-session-policy']);
const serviceError = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const normalizeKey = (value) => String(value || '').trim().toLowerCase();

export const createSystemConfigService = ({ repository }) => {
  if (!repository || typeof repository.get !== 'function' || typeof repository.put !== 'function') {
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
  });
};
