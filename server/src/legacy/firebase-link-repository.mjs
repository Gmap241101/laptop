const mapRow = (row) => {
  if (!row) return null;
  return Object.freeze({
    appUserId: String(row.app_user_id),
    firebaseUid: row.firebase_uid,
    firebaseEmail: row.firebase_email,
    firebaseEmailVerified: Boolean(row.firebase_email_verified),
    firebaseSignInProvider: row.firebase_sign_in_provider,
    linkedAt: row.linked_at,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
};

const selectColumns = `app_user_id, firebase_uid, firebase_email, firebase_email_verified,
                       firebase_sign_in_provider, linked_at, last_verified_at,
                       created_at, updated_at`;

const conflictError = (code, message) => {
  const error = new Error(message);
  error.name = 'LegacyIdentityConflictError';
  error.code = code;
  return error;
};

export const createFirebaseLinkRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool with query() is required.');
  }

  return Object.freeze({
    async findByAppUserId(appUserId) {
      const result = await pool.query(
        `SELECT ${selectColumns}
           FROM app_user_firebase_links
          WHERE app_user_id = $1`,
        [appUserId],
      );
      return mapRow(result.rows[0]);
    },

    async findByFirebaseUid(firebaseUid) {
      const result = await pool.query(
        `SELECT ${selectColumns}
           FROM app_user_firebase_links
          WHERE firebase_uid = $1`,
        [firebaseUid],
      );
      return mapRow(result.rows[0]);
    },

    async link(appUserId, firebaseIdentity) {
      const existingForUser = await pool.query(
        `SELECT ${selectColumns}
           FROM app_user_firebase_links
          WHERE app_user_id = $1`,
        [appUserId],
      );
      const current = mapRow(existingForUser.rows[0]);
      if (current && current.firebaseUid !== firebaseIdentity.uid) {
        throw conflictError('firebase_link_user_conflict', 'This application user is already linked to a different Firebase account.');
      }

      const existingForFirebase = await pool.query(
        `SELECT ${selectColumns}
           FROM app_user_firebase_links
          WHERE firebase_uid = $1`,
        [firebaseIdentity.uid],
      );
      const firebaseCurrent = mapRow(existingForFirebase.rows[0]);
      if (firebaseCurrent && firebaseCurrent.appUserId !== String(appUserId)) {
        throw conflictError('firebase_link_uid_conflict', 'This Firebase account is already linked to a different application user.');
      }

      try {
        const result = await pool.query(
          `INSERT INTO app_user_firebase_links (
             app_user_id, firebase_uid, firebase_email, firebase_email_verified,
             firebase_sign_in_provider, linked_at, last_verified_at
           ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (app_user_id) DO UPDATE SET
             firebase_email = EXCLUDED.firebase_email,
             firebase_email_verified = EXCLUDED.firebase_email_verified,
             firebase_sign_in_provider = EXCLUDED.firebase_sign_in_provider,
             last_verified_at = NOW(),
             updated_at = NOW()
           WHERE app_user_firebase_links.firebase_uid = EXCLUDED.firebase_uid
           RETURNING ${selectColumns}`,
          [
            appUserId,
            firebaseIdentity.uid,
            firebaseIdentity.email,
            firebaseIdentity.emailVerified,
            firebaseIdentity.signInProvider,
          ],
        );
        if (!result.rows[0]) {
          throw conflictError('firebase_link_user_conflict', 'Firebase link could not replace an existing account link.');
        }
        return mapRow(result.rows[0]);
      } catch (error) {
        if (error?.code === '23505') {
          throw conflictError('firebase_link_uid_conflict', 'This Firebase account is already linked to a different application user.');
        }
        throw error;
      }
    },
  });
};
