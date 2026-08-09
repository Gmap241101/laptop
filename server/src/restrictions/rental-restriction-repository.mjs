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
    authorityMode: row.authority_mode || 'firestore-shadow',
    mirrorState: row.mirror_state || 'synced',
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
        `SELECT ${SELECT_COLUMNS} FROM app_user_rental_restriction_shadows WHERE firebase_uid = $1`,
        [firebaseUid],
      );
      return mapRow(result.rows[0]);
    },

    async upsert({ firebaseUid, appUserId = null, exists, restriction, sourceDocumentPath = '', sourceUpdatedAt = null, sourceHash }) {
      const result = await pool.query(
        `INSERT INTO app_user_rental_restriction_shadows (
           firebase_uid, app_user_id, restriction_exists, restriction_payload,
           source_document_path, source_updated_at, source_hash, synced_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
         ON CONFLICT (firebase_uid) DO UPDATE SET
           app_user_id = COALESCE(EXCLUDED.app_user_id, app_user_rental_restriction_shadows.app_user_id),
           restriction_exists = EXCLUDED.restriction_exists,
           restriction_payload = EXCLUDED.restriction_payload,
           source_document_path = EXCLUDED.source_document_path,
           source_updated_at = EXCLUDED.source_updated_at,
           source_hash = EXCLUDED.source_hash,
           synced_at = NOW(),
           updated_at = NOW()
         RETURNING ${SELECT_COLUMNS}`,
        [firebaseUid, appUserId, Boolean(exists), JSON.stringify(restriction || {}), sourceDocumentPath, sourceUpdatedAt, sourceHash],
      );
      return mapRow(result.rows[0]);
    },
  });
};
