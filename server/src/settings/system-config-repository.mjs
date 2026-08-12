const normalize = (row) => row ? Object.freeze({
  key: row.config_key,
  payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
  updatedByClerkUserId: row.updated_by_clerk_user_id || '',
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
}) : null;

export const createSystemConfigRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('PostgreSQL pool.query() is required.');
  return Object.freeze({
    async get(key) {
      const result = await pool.query(
        `SELECT config_key, payload, updated_by_clerk_user_id, created_at, updated_at
           FROM app_system_configuration
          WHERE config_key = $1
          LIMIT 1`,
        [String(key || '').trim()],
      );
      return normalize(result.rows[0]);
    },
    async put({ key, payload, actorClerkUserId = '' }) {
      const result = await pool.query(
        `INSERT INTO app_system_configuration
           (config_key, payload, updated_by_clerk_user_id, created_at, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW(), NOW())
         ON CONFLICT (config_key) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_by_clerk_user_id = EXCLUDED.updated_by_clerk_user_id,
           updated_at = NOW()
         RETURNING config_key, payload, updated_by_clerk_user_id, created_at, updated_at`,
        [String(key || '').trim(), JSON.stringify(payload && typeof payload === 'object' ? payload : {}), String(actorClerkUserId || '').trim()],
      );
      return normalize(result.rows[0]);
    },
  });
};
