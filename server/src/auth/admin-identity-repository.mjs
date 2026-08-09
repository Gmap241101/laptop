const normalize = (row) => row ? Object.freeze({
  firebaseUid: row.firebase_uid,
  adminLoginId: row.admin_login_id || '',
  authEmail: row.auth_email || '',
  organizationName: row.organization_name || '',
  userName: row.user_name || '',
  phone: row.phone || '',
  adminRole: row.admin_role || 'admin',
  status: row.status || '',
  clerkUserId: row.clerk_user_id || '',
  clerkLinkState: row.clerk_link_state || 'unlinked',
  authAuthorityMode: row.auth_authority_mode || 'firebase-compatibility',
  clerkLinkedAt: row.clerk_linked_at || null,
  clerkLastVerifiedAt: row.clerk_last_verified_at || null,
  lastLoginAt: row.last_login_at || null,
  updatedAt: row.updated_at || null,
}) : null;

const SELECT = `SELECT firebase_uid, admin_login_id, auth_email, organization_name, user_name,
                       phone, admin_role, status, clerk_user_id, clerk_link_state,
                       auth_authority_mode, clerk_linked_at, clerk_last_verified_at,
                       last_login_at, updated_at
                  FROM app_admin_identity_registry`;

export const createAdminIdentityRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('PostgreSQL pool.query() is required.');

  return Object.freeze({
    async findByFirebaseUid(firebaseUid) {
      const result = await pool.query(`${SELECT} WHERE firebase_uid = $1 LIMIT 1`, [firebaseUid]);
      return normalize(result.rows[0]);
    },
    async findByClerkUserId(clerkUserId) {
      const result = await pool.query(`${SELECT} WHERE clerk_user_id = $1 LIMIT 1`, [clerkUserId]);
      return normalize(result.rows[0]);
    },
    async findByAuthEmail(email) {
      const result = await pool.query(`${SELECT} WHERE lower(auth_email) = lower($1) LIMIT 1`, [email]);
      return normalize(result.rows[0]);
    },
    async linkClerkIdentity({ firebaseUid, clerkUserId }) {
      const result = await pool.query(
        `UPDATE app_admin_identity_registry
            SET clerk_user_id = $2,
                clerk_link_state = 'linked',
                auth_authority_mode = 'clerk-authoritative-firebase-compatibility',
                clerk_linked_at = COALESCE(clerk_linked_at, NOW()),
                clerk_last_verified_at = NOW(),
                updated_at = NOW()
          WHERE firebase_uid = $1 AND status = 'active'
          RETURNING firebase_uid, admin_login_id, auth_email, organization_name, user_name,
                    phone, admin_role, status, clerk_user_id, clerk_link_state,
                    auth_authority_mode, clerk_linked_at, clerk_last_verified_at,
                    last_login_at, updated_at`,
        [firebaseUid, clerkUserId],
      );
      return normalize(result.rows[0]);
    },
    async markVerifiedLogin({ firebaseUid, clerkUserId }) {
      const result = await pool.query(
        `UPDATE app_admin_identity_registry
            SET clerk_last_verified_at = NOW(), last_login_at = NOW(), updated_at = NOW()
          WHERE firebase_uid = $1 AND clerk_user_id = $2 AND status = 'active'
          RETURNING firebase_uid, admin_login_id, auth_email, organization_name, user_name,
                    phone, admin_role, status, clerk_user_id, clerk_link_state,
                    auth_authority_mode, clerk_linked_at, clerk_last_verified_at,
                    last_login_at, updated_at`,
        [firebaseUid, clerkUserId],
      );
      return normalize(result.rows[0]);
    },
  });
};
