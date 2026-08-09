const normalizeRow = (row) => row ? Object.freeze({
  firebaseUid: row.firebase_uid,
  email: row.email || '',
  maskedEmail: row.masked_email || '',
  name: row.name || '',
  team: row.team || '',
  phone: row.phone || '',
  status: row.status || '',
  recoveryKey: row.recovery_key || '',
  authorityMode: row.authority_mode || '',
  updatedAt: row.updated_at || null,
}) : null;

export const createAccountRecoveryRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('PostgreSQL pool.query() is required.');
  }

  return Object.freeze({
    async findActiveByRecoveryKey(recoveryKey) {
      const result = await pool.query(
        `SELECT firebase_uid, email, masked_email, name, team, phone, status,
                recovery_key, authority_mode, updated_at
           FROM app_member_accounts
          WHERE recovery_key = $1
            AND recovery_key <> ''
            AND status <> 'retired'
          ORDER BY authoritative_updated_at DESC NULLS LAST, updated_at DESC
          LIMIT 1`,
        [recoveryKey],
      );
      return normalizeRow(result.rows[0]);
    },
  });
};
