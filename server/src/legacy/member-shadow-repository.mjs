const mapRow = (row) => {
  if (!row) return null;
  return Object.freeze({
    appUserId: String(row.app_user_id),
    firebaseUid: row.firebase_uid,
    sourceCollection: row.source_collection,
    sourceDocumentPath: row.source_document_path,
    uid: row.uid,
    email: row.email,
    maskedEmail: row.masked_email,
    name: row.name,
    team: row.team,
    phone: row.phone,
    status: row.status,
    directoryMemberId: row.directory_member_id,
    directoryVerifiedVersion: Number(row.directory_verified_version || 0),
    profileRequiredReason: row.profile_required_reason,
    rejoinedAccount: Boolean(row.rejoined_account),
    termsConsentRevision: Number(row.terms_consent_revision || 0),
    termsConsentPolicyVersion: Number(row.terms_consent_policy_version || 0),
    identityKey: row.identity_key || '',
    recoveryKey: row.recovery_key || '',
    previousAccountUids: Array.isArray(row.previous_account_uids) ? row.previous_account_uids : [],
    authorityMode: row.authority_mode || 'firestore-shadow',
    mirrorState: row.mirror_state || 'synced',
    lastMutationId: row.last_mutation_id || '',
    authoritativeUpdatedAt: row.authoritative_updated_at || null,
    sourceCreatedAt: row.source_created_at,
    sourceUpdatedAt: row.source_updated_at,
    sourceHash: row.source_hash,
    syncedAt: row.synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
};

const selectColumns = `app_user_id, firebase_uid, source_collection, source_document_path,
                       uid, email, masked_email, name, team, phone, status,
                       directory_member_id, directory_verified_version,
                       profile_required_reason, rejoined_account,
                       terms_consent_revision, terms_consent_policy_version,
                       identity_key, recovery_key, previous_account_uids,
                       authority_mode, mirror_state, last_mutation_id, authoritative_updated_at,
                       source_created_at, source_updated_at, source_hash,
                       synced_at, created_at, updated_at`;

export const createMemberShadowRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool with query() is required.');
  }

  return Object.freeze({
    async findByAppUserId(appUserId) {
      const result = await pool.query(
        `SELECT ${selectColumns}
           FROM app_user_member_shadows
          WHERE app_user_id = $1`,
        [appUserId],
      );
      return mapRow(result.rows[0]);
    },

    async upsert(appUserId, firebaseUid, shadow) {
      const result = await pool.query(
        `INSERT INTO app_user_member_shadows (
           app_user_id, firebase_uid, source_collection, source_document_path,
           uid, email, masked_email, name, team, phone, status,
           directory_member_id, directory_verified_version,
           profile_required_reason, rejoined_account,
           terms_consent_revision, terms_consent_policy_version,
           identity_key, recovery_key, previous_account_uids,
           source_created_at, source_updated_at, source_hash, synced_at
         ) VALUES (
           $1, $2, 'userAccounts', $3,
           $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14,
           $15, $16, $17, $18, $19::jsonb, $20, $21, $22, NOW()
         )
         ON CONFLICT (app_user_id) DO UPDATE SET
           source_document_path = EXCLUDED.source_document_path,
           uid = EXCLUDED.uid,
           email = EXCLUDED.email,
           masked_email = EXCLUDED.masked_email,
           name = EXCLUDED.name,
           team = EXCLUDED.team,
           phone = EXCLUDED.phone,
           status = EXCLUDED.status,
           directory_member_id = EXCLUDED.directory_member_id,
           directory_verified_version = EXCLUDED.directory_verified_version,
           profile_required_reason = EXCLUDED.profile_required_reason,
           rejoined_account = EXCLUDED.rejoined_account,
           terms_consent_revision = EXCLUDED.terms_consent_revision,
           terms_consent_policy_version = EXCLUDED.terms_consent_policy_version,
           identity_key = EXCLUDED.identity_key,
           recovery_key = EXCLUDED.recovery_key,
           previous_account_uids = EXCLUDED.previous_account_uids,
           source_created_at = EXCLUDED.source_created_at,
           source_updated_at = EXCLUDED.source_updated_at,
           source_hash = EXCLUDED.source_hash,
           synced_at = NOW(),
           updated_at = NOW()
         WHERE app_user_member_shadows.firebase_uid = EXCLUDED.firebase_uid
         RETURNING ${selectColumns}`,
        [
          appUserId,
          firebaseUid,
          shadow.sourceDocumentPath,
          shadow.uid,
          shadow.email,
          shadow.maskedEmail,
          shadow.name,
          shadow.team,
          shadow.phone,
          shadow.status,
          shadow.directoryMemberId,
          shadow.directoryVerifiedVersion,
          shadow.profileRequiredReason,
          shadow.rejoinedAccount,
          shadow.termsConsentRevision,
          shadow.termsConsentPolicyVersion,
          shadow.identityKey,
          shadow.recoveryKey,
          JSON.stringify(shadow.previousAccountUids || []),
          shadow.sourceCreatedAt,
          shadow.sourceUpdatedAt,
          shadow.sourceHash,
        ],
      );

      if (!result.rows[0]) {
        const error = new Error('Member shadow cannot replace a different Firebase identity.');
        error.name = 'MemberShadowConflictError';
        error.code = 'member_shadow_uid_conflict';
        throw error;
      }
      return mapRow(result.rows[0]);
    },
  });
};
