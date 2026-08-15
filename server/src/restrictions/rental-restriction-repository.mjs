const mapRow = (row) => {
  if (!row) return null;
  return Object.freeze({
    firebaseUid: row.firebase_uid,
    appUserId: row.app_user_id == null ? null : String(row.app_user_id),
    exists: Boolean(row.restriction_exists),
    restriction: row.restriction_exists ? (row.restriction_payload || {}) : null,
    sourceDocumentPath: row.source_document_path || '',
    sourceUpdatedAt: row.source_updated_at,
    sourceHash: row.source_hash,
    authorityMode: row.authority_mode || 'postgresql-authoritative',
    mirrorState: row.mirror_state || 'retired',
    lastMutationId: row.last_mutation_id || '',
    authoritativeUpdatedAt: row.authoritative_updated_at || null,
    syncedAt: row.synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
};

const SELECT_COLUMNS = `firebase_uid, app_user_id, restriction_exists, restriction_payload,
  source_document_path, source_updated_at, source_hash, authority_mode, mirror_state,
  last_mutation_id, authoritative_updated_at, synced_at, created_at, updated_at`;

export const createRentalRestrictionRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool with query() is required.');

  return Object.freeze({
    async findByFirebaseUid(firebaseUid) {
      const result = await pool.query(
        `SELECT ${SELECT_COLUMNS} FROM app_rental_restrictions WHERE firebase_uid = $1`,
        [firebaseUid],
      );
      return mapRow(result.rows[0]);
    },

    async findByAppUserId(appUserId) {
      const result = await pool.query(
        `SELECT ${SELECT_COLUMNS} FROM app_rental_restrictions WHERE app_user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [appUserId],
      );
      return mapRow(result.rows[0]);
    },

  });
};
