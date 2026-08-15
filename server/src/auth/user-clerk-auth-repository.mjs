const trim = (value) => String(value ?? '').trim();
const repositoryError = (code, message, status = 409) => {
  const error = new Error(message);
  error.name = 'UserClerkAuthRepositoryError';
  error.code = code;
  error.status = status;
  return error;
};
const koreaToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const isBlockingRestriction = (restriction = {}) => {
  const incidentStatus = trim(restriction.incidentStatus).toLowerCase();
  const eligibleFromDate = trim(restriction.eligibleFromDate);
  return Boolean(
    restriction.manualBlock === true ||
    restriction.indefinite === true ||
    trim(restriction.restrictionStatus).toLowerCase() === 'active' ||
    restriction.lossDamagePending === true ||
    ['pending', 'open', 'unresolved'].includes(incidentStatus) ||
    Number(restriction.pendingTotalOverdueDays || 0) > 0 ||
    (restriction.activePenalty === true && eligibleFromDate && koreaToday() < eligibleFromDate)
  );
};

const mapRow = (row) => {
  if (!row) return null;
  return Object.freeze({
    appUserId: String(row.app_user_id || ''),
    clerkUserId: trim(row.clerk_user_id),
    primaryEmail: trim(row.primary_email).toLowerCase(),
    firebaseUid: trim(row.firebase_uid),
    firebaseEmail: trim(row.firebase_email).toLowerCase(),
    memberStatus: trim(row.member_status),
    authAuthorityMode: trim(row.auth_authority_mode) || 'firebase-compatibility',
    lifecycleAuthorityMode: trim(row.lifecycle_authority_mode) || 'firestore-compatibility',
    clerkAccountState: trim(row.clerk_account_state) || 'active',
    clerkLinkedAt: row.clerk_linked_at || null,
    clerkLastVerifiedAt: row.clerk_last_verified_at || null,
    passwordAuthorityUpdatedAt: row.password_authority_updated_at || null,
    withdrawnAt: row.withdrawn_at || null,
  });
};



const ensurePostgresqlRentalRestrictionReadModel = async (pool, { appUserId, firebaseUid }) => {
  const uid = trim(firebaseUid);
  if (!uid || !appUserId) return;

  await pool.query(
    `INSERT INTO app_user_rental_restriction_shadows (
       firebase_uid, app_user_id, restriction_exists, restriction_payload,
       source_document_path, source_updated_at, source_hash, synced_at,
       authority_mode, mirror_state, last_mutation_id, authoritative_updated_at
     )
     SELECT m.firebase_uid, m.app_user_id, false, '{}'::jsonb,
            'postgresql/app_member_accounts/' || m.firebase_uid || '/rental-restriction-default',
            COALESCE(m.authoritative_updated_at,m.updated_at,NOW()),
            'postgresql-authoritative:none:' || m.firebase_uid, NOW(),
            'postgresql-authoritative', 'retired', '', COALESCE(m.authoritative_updated_at,NOW())
       FROM app_member_accounts m
      WHERE m.firebase_uid=$1 AND m.app_user_id=$2
        AND m.lifecycle_authority_mode='postgresql-authoritative'
        AND m.terms_consent_bootstrap_completed_at IS NOT NULL
     ON CONFLICT (firebase_uid) DO UPDATE SET
       app_user_id=COALESCE(app_user_rental_restriction_shadows.app_user_id,EXCLUDED.app_user_id),
       updated_at=NOW()
     WHERE app_user_rental_restriction_shadows.authority_mode='postgresql-authoritative'`,
    [uid, appUserId],
  );
};

const SELECT_CONTEXT = `
  SELECT u.id AS app_user_id, u.clerk_user_id, u.primary_email,
         l.firebase_uid, l.firebase_email,
         m.status AS member_status, m.auth_authority_mode, m.lifecycle_authority_mode,
         m.clerk_account_state, m.clerk_linked_at, m.clerk_last_verified_at,
         m.password_authority_updated_at, m.withdrawn_at
    FROM app_user_identities u
    JOIN app_user_firebase_links l ON l.app_user_id = u.id
    JOIN app_member_accounts m ON m.firebase_uid = l.firebase_uid
`;

export const createUserClerkAuthRepository = (pool) => {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required.');

  return Object.freeze({
    async findByClerkUserId(clerkUserId) {
      const result = await pool.query(`${SELECT_CONTEXT} WHERE u.clerk_user_id = $1 LIMIT 1`, [trim(clerkUserId)]);
      return mapRow(result.rows[0]);
    },

    async findByFirebaseUid(firebaseUid) {
      const result = await pool.query(`${SELECT_CONTEXT} WHERE l.firebase_uid = $1 LIMIT 1`, [trim(firebaseUid)]);
      return mapRow(result.rows[0]);
    },

    async syncMemberFromCompatibility({ appUserId, firebaseUid, profile = {} }) {
      const previousAccountUids = Array.isArray(profile.previousAccountUids) ? profile.previousAccountUids : [];
      await pool.query(
        `INSERT INTO app_member_accounts (
           firebase_uid, app_user_id, email, masked_email, name, team, phone, status,
           directory_member_id, directory_verified_version, profile_required_reason,
           rejoined_account, terms_consent_revision, terms_consent_policy_version,
           identity_key, recovery_key, previous_account_uids, authority_mode, mirror_state,
           source_updated_at, synced_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,
                   'firestore-compatibility','synced',NOW(),NOW(),NOW())
         ON CONFLICT (firebase_uid) DO UPDATE SET
           app_user_id=COALESCE(EXCLUDED.app_user_id,app_member_accounts.app_user_id),
           email=EXCLUDED.email, masked_email=EXCLUDED.masked_email, name=EXCLUDED.name,
           team=EXCLUDED.team, phone=EXCLUDED.phone, status=EXCLUDED.status,
           directory_member_id=EXCLUDED.directory_member_id,
           directory_verified_version=EXCLUDED.directory_verified_version,
           profile_required_reason=EXCLUDED.profile_required_reason,
           rejoined_account=EXCLUDED.rejoined_account,
           terms_consent_revision=EXCLUDED.terms_consent_revision,
           terms_consent_policy_version=EXCLUDED.terms_consent_policy_version,
           identity_key=EXCLUDED.identity_key, recovery_key=EXCLUDED.recovery_key,
           previous_account_uids=EXCLUDED.previous_account_uids,
           source_updated_at=NOW(), synced_at=NOW(), updated_at=NOW()`,
        [
          trim(firebaseUid), appUserId, trim(profile.email).toLowerCase(), trim(profile.maskedEmail),
          trim(profile.name), trim(profile.team), trim(profile.phone), trim(profile.status),
          trim(profile.directoryMemberId), Number(profile.directoryVerifiedVersion || 0), trim(profile.profileRequiredReason),
          Boolean(profile.rejoinedAccount), Number(profile.termsConsentRevision || 0), Number(profile.termsConsentPolicyVersion || 0),
          trim(profile.identityKey), trim(profile.recoveryKey), JSON.stringify(previousAccountUids),
        ],
      );
      return this.findByFirebaseUid(firebaseUid);
    },

    async linkAuthority({ appUserId, firebaseUid }) {
      const uid = trim(firebaseUid);
      const result = await pool.query(
        `UPDATE app_member_accounts
            SET app_user_id=$1,
                auth_authority_mode='clerk-authoritative',
                lifecycle_authority_mode=CASE WHEN lifecycle_authority_mode='postgresql-authoritative' THEN lifecycle_authority_mode ELSE 'clerk-auth-firestore-profile-compatibility' END,
                clerk_linked_at=COALESCE(clerk_linked_at,NOW()),
                clerk_account_state='active', updated_at=NOW()
          WHERE firebase_uid=$2
          RETURNING firebase_uid`,
        [appUserId, uid],
      );
      if (result.rows[0]) {
        await ensurePostgresqlRentalRestrictionReadModel(pool, { appUserId, firebaseUid: uid });
      }
      return Boolean(result.rows[0]);
    },

    async markVerifiedLogin({ firebaseUid }) {
      const uid = trim(firebaseUid);
      const result = await pool.query(
        `UPDATE app_member_accounts
            SET auth_authority_mode='clerk-authoritative', clerk_last_verified_at=NOW(),
                clerk_account_state='active', updated_at=NOW()
          WHERE firebase_uid=$1
          RETURNING app_user_id, firebase_uid`,
        [uid],
      );
      if (result.rows[0]?.app_user_id) {
        await ensurePostgresqlRentalRestrictionReadModel(pool, {
          appUserId: result.rows[0].app_user_id,
          firebaseUid: result.rows[0].firebase_uid,
        });
      }
      return this.findByFirebaseUid(uid);
    },

    async markPasswordAuthority({ firebaseUid }) {
      await pool.query(
        `UPDATE app_member_accounts
            SET auth_authority_mode='clerk-authoritative', password_authority_updated_at=NOW(),
                clerk_account_state='active', updated_at=NOW()
          WHERE firebase_uid=$1`,
        [trim(firebaseUid)],
      );
      return this.findByFirebaseUid(firebaseUid);
    },

    async finalizePostgresqlWithdrawal({ firebaseUid }) {
      const uid = trim(firebaseUid);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const memberResult = await client.query(
          `SELECT firebase_uid, app_user_id, status, identity_key, previous_account_uids
             FROM app_member_accounts
            WHERE firebase_uid=$1
            FOR UPDATE`,
          [uid],
        );
        const member = memberResult.rows[0];
        if (!member) throw repositoryError('user_withdrawal_member_not_found', 'PostgreSQL member account was not found.', 404);
        if (member.status === 'retired') {
          await client.query('COMMIT');
          return this.findByFirebaseUid(uid);
        }
        if (!member.app_user_id) throw repositoryError('user_withdrawal_identity_not_linked', 'PostgreSQL member identity is not linked.', 409);

        const blockingResult = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE status IN ('신청중','보류','대여중'))::bigint AS active_count,
             COUNT(*) FILTER (WHERE user_action_request->>'status' = 'pending')::bigint AS pending_action_count,
             COUNT(*) FILTER (WHERE overdue_penalty_pending = TRUE)::bigint AS overdue_penalty_pending_count
             FROM app_rental_requests
            WHERE app_user_id=$1`,
          [member.app_user_id],
        );
        const blockers = blockingResult.rows[0] || {};
        if (Number(blockers.active_count || 0) > 0) {
          throw repositoryError('user_withdrawal_active_rental_blocked', 'Active rental requests block membership withdrawal.', 409);
        }
        if (Number(blockers.pending_action_count || 0) > 0) {
          throw repositoryError('user_withdrawal_pending_action_blocked', 'Pending rental user actions block membership withdrawal.', 409);
        }
        if (Number(blockers.overdue_penalty_pending_count || 0) > 0) {
          throw repositoryError('user_withdrawal_overdue_penalty_pending', 'Pending overdue penalty processing blocks membership withdrawal.', 409);
        }

        const restrictionResult = await client.query(
          `SELECT restriction_exists, restriction_payload
             FROM app_user_rental_restriction_shadows
            WHERE firebase_uid=$1
            FOR UPDATE`,
          [uid],
        );
        const restrictionRow = restrictionResult.rows[0];
        const restriction = restrictionRow?.restriction_exists ? (restrictionRow.restriction_payload || {}) : {};
        if (isBlockingRestriction(restriction)) {
          throw repositoryError('user_withdrawal_restriction_blocked', 'Active rental restriction blocks membership withdrawal.', 409);
        }

        const previousAccountUids = Array.isArray(member.previous_account_uids)
          ? member.previous_account_uids.map(trim).filter(Boolean)
          : [];
        const nextPreviousAccountUids = Array.from(new Set([...previousAccountUids, uid]));

        await client.query(
          `UPDATE app_member_accounts
              SET email='', masked_email='', name='탈퇴회원', team='', phone='', status='retired',
                  directory_member_id='', directory_verified_version=0, profile_required_reason='',
                  recovery_key='', previous_account_uids=$2::jsonb,
                  lifecycle_authority_mode='postgresql-authoritative', mirror_state='retired',
                  withdrawn_at=COALESCE(withdrawn_at,NOW()), authoritative_updated_at=NOW(),
                  source_updated_at=NOW(), synced_at=NOW(), updated_at=NOW()
            WHERE firebase_uid=$1`,
          [uid, JSON.stringify(nextPreviousAccountUids)],
        );
        await client.query(
          `UPDATE app_user_rental_restriction_shadows
              SET authority_mode='postgresql-authoritative', mirror_state='retired', updated_at=NOW()
            WHERE firebase_uid=$1`,
          [uid],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return this.findByFirebaseUid(uid);
    },

    async syncRetiredMember({ firebaseUid, account = {} }) {
      const previousAccountUids = Array.isArray(account.previousAccountUids) ? account.previousAccountUids : [];
      await pool.query(
        `UPDATE app_member_accounts
            SET email='', masked_email='', name='탈퇴회원', team='', phone='', status='retired',
                directory_member_id='', directory_verified_version=0, profile_required_reason='',
                identity_key='', recovery_key='', previous_account_uids=$2::jsonb,
                lifecycle_authority_mode='postgresql-authoritative', withdrawn_at=COALESCE(withdrawn_at,NOW()),
                authoritative_updated_at=NOW(), source_updated_at=NOW(), updated_at=NOW()
          WHERE firebase_uid=$1`,
        [trim(firebaseUid), JSON.stringify(previousAccountUids)],
      );
      return this.findByFirebaseUid(firebaseUid);
    },

    async markClerkRetired({ firebaseUid, deleted = true }) {
      await pool.query(
        `UPDATE app_member_accounts
            SET auth_authority_mode='clerk-retired', lifecycle_authority_mode='postgresql-authoritative',
                clerk_account_state=$2, withdrawn_at=COALESCE(withdrawn_at,NOW()), updated_at=NOW()
          WHERE firebase_uid=$1`,
        [trim(firebaseUid), deleted ? 'deleted' : 'delete-pending'],
      );
      return this.findByFirebaseUid(firebaseUid);
    },
  });
};
