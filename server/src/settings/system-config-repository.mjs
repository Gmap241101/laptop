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
    async listAudit({ key = 'system-settings-audit', limit = 50 } = {}) {
      const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
      const result = await pool.query(
        `SELECT payload
           FROM app_system_configuration
          WHERE config_key=$1
          LIMIT 1`,
        [String(key || '').trim()],
      );
      const payload = result.rows[0]?.payload && typeof result.rows[0].payload === 'object'
        ? result.rows[0].payload
        : {};
      return (Array.isArray(payload.logs) ? payload.logs : []).slice(0, safeLimit);
    },
    async appendAudit({ key = 'system-settings-audit', entry, actorClerkUserId = '', maxEntries = 200 }) {
      if (!pool.connect || typeof pool.connect !== 'function') {
        throw new TypeError('PostgreSQL pool.connect() is required for audit writes.');
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`system-config:${key}`]);
        const currentResult = await client.query(
          `SELECT payload
             FROM app_system_configuration
            WHERE config_key=$1
            FOR UPDATE`,
          [String(key || '').trim()],
        );
        const currentPayload = currentResult.rows[0]?.payload && typeof currentResult.rows[0].payload === 'object'
          ? currentResult.rows[0].payload
          : {};
        const currentLogs = Array.isArray(currentPayload.logs) ? currentPayload.logs : [];
        const safeMaxEntries = Math.max(1, Math.min(500, Math.trunc(Number(maxEntries) || 200)));
        const nextLogs = [entry, ...currentLogs].slice(0, safeMaxEntries);
        const result = await client.query(
          `INSERT INTO app_system_configuration
             (config_key, payload, updated_by_clerk_user_id, created_at, updated_at)
           VALUES ($1, $2::jsonb, $3, NOW(), NOW())
           ON CONFLICT (config_key) DO UPDATE SET
             payload=EXCLUDED.payload,
             updated_by_clerk_user_id=EXCLUDED.updated_by_clerk_user_id,
             updated_at=NOW()
           RETURNING config_key, payload, updated_by_clerk_user_id, created_at, updated_at`,
          [String(key || '').trim(), JSON.stringify({ ...currentPayload, logs: nextLogs }), String(actorClerkUserId || '').trim()],
        );
        await client.query('COMMIT');
        return normalize(result.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  });
};
