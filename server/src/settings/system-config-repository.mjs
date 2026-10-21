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
    async withDeviceTrustLock(work) {
      if (typeof pool.connect !== 'function') throw new TypeError('PostgreSQL pool.connect() is required.');
      const client = await pool.connect();
      let acquired = false;
      try {
        const result = await client.query("SELECT pg_try_advisory_lock(hashtext('phase34-device-trust-policy')) AS acquired");
        acquired = result.rows[0]?.acquired === true;
        if (!acquired) {
          throw Object.assign(new Error('Device Trust policy change is already in progress.'), {
            code: 'clerk_device_trust_change_in_progress', status: 409,
          });
        }
        return await work();
      } finally {
        if (acquired) {
          try { await client.query("SELECT pg_advisory_unlock(hashtext('phase34-device-trust-policy'))"); }
          catch (error) { client.release(error); throw error; }
        }
        client.release();
      }
    },
    async listDeviceTrustAudit({ limit = 50 } = {}) {
      const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
      const result = await pool.query(`SELECT event_id, operation_id, actor_clerk_user_id, event_type,
          policy_revision, previous_enabled, requested_enabled, final_enabled,
          result_status, account_count, failed_account_count,
          skipped_account_count, error_code, created_at
        FROM app_device_trust_audit_events ORDER BY created_at DESC LIMIT $1`, [safeLimit]);
      return result.rows.map(row => ({
        eventId: row.event_id, operationId: row.operation_id, actorClerkUserId: row.actor_clerk_user_id,
        eventType: row.event_type, policyRevision: Number(row.policy_revision),
        previousEnabled: row.previous_enabled, requestedEnabled: row.requested_enabled,
        finalEnabled: row.final_enabled, status: row.result_status,
        accountCount: Number(row.account_count), failedAccountCount: Number(row.failed_account_count),
        skippedAccountCount: Number(row.skipped_account_count), errorCode: row.error_code,
        createdAt: row.created_at,
      }));
    },
    async appendDeviceTrustAudit({ eventType, operationId = '', actorClerkUserId = '', policyRevision = 0,
      previousEnabled = null, requestedEnabled = null, finalEnabled = null, status = 'pending',
      accountCount = 0, failedAccountCount = 0, skippedAccountCount = 0, errorCode = '' } = {}) {
      const event = String(eventType || '').trim();
      if (!/^[a-z][a-z0-9_]{1,79}$/.test(event)) throw new TypeError('Invalid security audit event.');
      const result = await pool.query(`INSERT INTO app_device_trust_audit_events
          (event_type, operation_id, actor_clerk_user_id, policy_revision,
           previous_enabled, requested_enabled, final_enabled, result_status,
           account_count, failed_account_count, skipped_account_count, error_code)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING event_id, created_at`, [event, String(operationId || ''), String(actorClerkUserId || ''),
          Number(policyRevision || 0), previousEnabled, requestedEnabled, finalEnabled,
          String(status || ''), Number(accountCount || 0), Number(failedAccountCount || 0),
          Number(skippedAccountCount || 0), String(errorCode || '').slice(0,120)]);
      return result.rows[0];
    },
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
