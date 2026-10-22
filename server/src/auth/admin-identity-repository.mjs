const normalize = (row) => row ? Object.freeze({
  legacyAdminKey: row.firebase_uid,
  firebaseUid: row.firebase_uid,
  adminLoginId: row.admin_login_id || '',
  authEmail: row.auth_email || '',
  organizationName: row.organization_name || '',
  userName: row.user_name || '',
  phone: row.phone || '',
  adminRole: row.admin_role || 'admin',
  mailNotificationsEnabled: row.mail_notifications_enabled !== false,
  status: row.status || '',
  clerkUserId: row.clerk_user_id || '',
  clerkLinkState: row.clerk_link_state || 'unlinked',
  authAuthorityMode: row.auth_authority_mode || 'clerk-postgresql',
  clerkLinkedAt: row.clerk_linked_at || null,
  clerkLastVerifiedAt: row.clerk_last_verified_at || null,
  lastLoginAt: row.last_login_at || null,
  lockUntil: row.lock_until || null,
  lockReason: row.lock_reason || '',
  retiredAt: row.retired_at || null,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
}) : null;

const SELECT = `SELECT firebase_uid, admin_login_id, auth_email, organization_name, user_name,
                       phone, admin_role, mail_notifications_enabled, status, clerk_user_id, clerk_link_state,
                       auth_authority_mode, clerk_linked_at, clerk_last_verified_at,
                       last_login_at, lock_until, lock_reason, retired_at, created_at, updated_at
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
    async findByAdminLoginId(adminLoginId) {
      const result = await pool.query(`${SELECT} WHERE status <> 'retired' AND lower(admin_login_id) = lower($1) LIMIT 1`, [adminLoginId]);
      return normalize(result.rows[0]);
    },
    async listActive() {
      const result = await pool.query(`${SELECT} WHERE status <> 'retired' ORDER BY CASE WHEN admin_role='owner' THEN 0 ELSE 1 END, lower(admin_login_id), created_at`);
      return result.rows.map(normalize);
    },
    async create({ legacyAdminKey, adminLoginId, authEmail, organizationName, userName, phone, adminRole, clerkUserId }) {
      const result = await pool.query(
        `INSERT INTO app_admin_identity_registry
           (firebase_uid, admin_login_id, auth_email, organization_name, user_name, phone, admin_role,
            status, clerk_user_id, clerk_link_state, auth_authority_mode, clerk_linked_at,
            clerk_last_verified_at, source_hash, synced_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,'linked','clerk-postgresql-authoritative',NOW(),NOW(),'phase34-native',NOW(),NOW(),NOW())
         RETURNING firebase_uid, admin_login_id, auth_email, organization_name, user_name, phone, admin_role, mail_notifications_enabled,
                   status, clerk_user_id, clerk_link_state, auth_authority_mode, clerk_linked_at,
                   clerk_last_verified_at, last_login_at, lock_until, lock_reason, retired_at, created_at, updated_at`,
        [legacyAdminKey, adminLoginId, authEmail, organizationName, userName, phone, adminRole, clerkUserId],
      );
      return normalize(result.rows[0]);
    },
    async update({ legacyAdminKey, adminLoginId, organizationName, userName, phone, adminRole, mailNotificationsEnabled, actorClerkUserId }) {
      if (typeof mailNotificationsEnabled !== 'boolean') throw new TypeError('mail_admin_preference_boolean_required');
      if (typeof actorClerkUserId !== 'string' || actorClerkUserId.length < 8) throw new TypeError('mail_admin_preference_actor_required');
      // One PostgreSQL statement: persist opt-out AND cancel only unsent administrator
      // notices addressed to the account. Never remove the audit trail or sent mail.
      const result = await pool.query(
        `WITH previous AS MATERIALIZED (
           SELECT firebase_uid,mail_notifications_enabled AS previous_enabled
           FROM app_admin_identity_registry WHERE firebase_uid=$1 AND status<>'retired' FOR UPDATE
         ), changed AS (
           UPDATE app_admin_identity_registry
              SET admin_login_id=$2, organization_name=$3, user_name=$4, phone=$5,
                  admin_role=$6, mail_notifications_enabled=$7::boolean,
                  auth_authority_mode='clerk-postgresql-authoritative', updated_at=NOW()
            FROM previous p WHERE app_admin_identity_registry.firebase_uid=p.firebase_uid
            RETURNING app_admin_identity_registry.firebase_uid, admin_login_id, auth_email, organization_name,
                      user_name, phone, admin_role, mail_notifications_enabled,
                      status, clerk_user_id, clerk_link_state, auth_authority_mode,
                      clerk_linked_at, clerk_last_verified_at, last_login_at,
                      lock_until, lock_reason, retired_at, created_at, updated_at
         ), cancelled AS (
           UPDATE app_mail_outbox o
              SET state='cancelled',last_error_code='mail_admin_opted_out',updated_at=NOW()
             FROM changed c
            WHERE $7::boolean=FALSE AND lower(o.recipient_email)=lower(c.auth_email)
              AND o.event_key IN ('admin_signup_pending','admin_rental_pending')
              AND o.state IN ('queued','retry')
            RETURNING o.id
         ), audited AS (
           INSERT INTO app_admin_mail_preference_audit
            (target_admin_key,changed_by_clerk_user_id,previous_enabled,new_enabled)
           SELECT c.firebase_uid,$8,p.previous_enabled,$7::boolean
           FROM changed c JOIN previous p ON p.firebase_uid=c.firebase_uid
           WHERE p.previous_enabled IS DISTINCT FROM $7::boolean RETURNING id
         )
         SELECT * FROM changed`,
        [legacyAdminKey, adminLoginId, organizationName, userName, phone, adminRole, mailNotificationsEnabled, actorClerkUserId],
      );
      return normalize(result.rows[0]);
    },
    async setLock({ legacyAdminKey, locked, reason = '' }) {
      const result = await pool.query(
        `UPDATE app_admin_identity_registry
            SET lock_until=CASE WHEN $2::boolean THEN TIMESTAMPTZ '2100-01-01 00:00:00+00' ELSE NULL END,
                lock_reason=CASE WHEN $2::boolean THEN $3 ELSE '' END,
                updated_at=NOW()
          WHERE firebase_uid=$1 AND status <> 'retired'
          RETURNING firebase_uid, admin_login_id, auth_email, organization_name, user_name, phone, admin_role, mail_notifications_enabled,
                    status, clerk_user_id, clerk_link_state, auth_authority_mode, clerk_linked_at,
                    clerk_last_verified_at, last_login_at, lock_until, lock_reason, retired_at, created_at, updated_at`,
        [legacyAdminKey, Boolean(locked), reason],
      );
      return normalize(result.rows[0]);
    },
    async retire(legacyAdminKey) {
      const result = await pool.query(
        `UPDATE app_admin_identity_registry
            SET status='retired', retired_at=NOW(), lock_until=NULL, lock_reason='', updated_at=NOW()
          WHERE firebase_uid=$1 AND status <> 'retired'
          RETURNING firebase_uid, admin_login_id, auth_email, organization_name, user_name, phone, admin_role, mail_notifications_enabled,
                    status, clerk_user_id, clerk_link_state, auth_authority_mode, clerk_linked_at,
                    clerk_last_verified_at, last_login_at, lock_until, lock_reason, retired_at, created_at, updated_at`,
        [legacyAdminKey],
      );
      return normalize(result.rows[0]);
    },
    async linkClerkIdentity({ firebaseUid, clerkUserId }) {
      const result = await pool.query(
        `UPDATE app_admin_identity_registry
            SET clerk_user_id=$2, clerk_link_state='linked', auth_authority_mode='clerk-postgresql-authoritative',
                clerk_linked_at=COALESCE(clerk_linked_at,NOW()), clerk_last_verified_at=NOW(), updated_at=NOW()
          WHERE firebase_uid=$1 AND status='active'
          RETURNING firebase_uid, admin_login_id, auth_email, organization_name, user_name, phone, admin_role, mail_notifications_enabled,
                    status, clerk_user_id, clerk_link_state, auth_authority_mode, clerk_linked_at,
                    clerk_last_verified_at, last_login_at, lock_until, lock_reason, retired_at, created_at, updated_at`,
        [firebaseUid, clerkUserId],
      );
      return normalize(result.rows[0]);
    },
    async markVerifiedLogin({ firebaseUid, clerkUserId }) {
      const result = await pool.query(
        `UPDATE app_admin_identity_registry
            SET clerk_last_verified_at=NOW(), last_login_at=NOW(), updated_at=NOW()
          WHERE firebase_uid=$1 AND clerk_user_id=$2 AND status='active'
          RETURNING firebase_uid, admin_login_id, auth_email, organization_name, user_name, phone, admin_role, mail_notifications_enabled,
                    status, clerk_user_id, clerk_link_state, auth_authority_mode, clerk_linked_at,
                    clerk_last_verified_at, last_login_at, lock_until, lock_reason, retired_at, created_at, updated_at`,
        [firebaseUid, clerkUserId],
      );
      return normalize(result.rows[0]);
    },
  });
};
