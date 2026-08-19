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
    email: trim(row.member_email).toLowerCase(),
    maskedEmail: trim(row.masked_email),
    name: trim(row.member_name),
    team: trim(row.member_team),
    phone: trim(row.member_phone),
    status: trim(row.member_status),
    directoryMemberId: trim(row.directory_member_id),
    directoryVerifiedVersion: Number(row.directory_verified_version || 0),
    directoryOverrideByAdmin: Boolean(row.directory_override_by_admin),
    profileRequiredReason: trim(row.profile_required_reason),
    rejoinedAccount: Boolean(row.rejoined_account),
    termsConsentRevision: Number(row.terms_consent_revision || 0),
    termsConsentPolicyVersion: Number(row.terms_consent_policy_version || 0),
    identityKey: trim(row.identity_key),
    recoveryKey: trim(row.recovery_key),
    previousAccountUids: Array.isArray(row.previous_account_uids) ? row.previous_account_uids.map(trim).filter(Boolean) : [],
    createdAt: row.member_created_at || null,
    updatedAt: row.member_updated_at || null,
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
    `INSERT INTO app_rental_restrictions (
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
       app_user_id=EXCLUDED.app_user_id,
       updated_at=NOW()
     WHERE app_rental_restrictions.authority_mode='postgresql-authoritative'
       AND app_rental_restrictions.app_user_id IS DISTINCT FROM EXCLUDED.app_user_id`,
    [uid, appUserId],
  );
};

const SELECT_CONTEXT = `
  SELECT u.id AS app_user_id, u.clerk_user_id, u.primary_email,
         l.firebase_uid, l.firebase_email,
         m.status AS member_status, m.email AS member_email, m.masked_email,
         m.name AS member_name, m.team AS member_team, m.phone AS member_phone,
         m.directory_member_id, m.directory_verified_version, m.directory_override_by_admin,
         m.profile_required_reason, m.rejoined_account, m.terms_consent_revision,
         m.terms_consent_policy_version, m.identity_key, m.recovery_key, m.previous_account_uids,
         m.created_at AS member_created_at, m.updated_at AS member_updated_at,
         m.auth_authority_mode, m.lifecycle_authority_mode,
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
        `UPDATE app_member_accounts m
            SET auth_authority_mode='clerk-authoritative', clerk_last_verified_at=NOW(),
                clerk_account_state='active', updated_at=NOW()
           FROM app_user_firebase_links l
           JOIN app_user_identities u ON u.id=l.app_user_id
          WHERE m.firebase_uid=$1
            AND l.firebase_uid=m.firebase_uid
          RETURNING u.id AS app_user_id, u.clerk_user_id, u.primary_email,
                    l.firebase_uid, l.firebase_email,
                    m.status AS member_status, m.email AS member_email, m.masked_email,
                    m.name AS member_name, m.team AS member_team, m.phone AS member_phone,
                    m.directory_member_id, m.directory_verified_version, m.directory_override_by_admin,
                    m.profile_required_reason, m.rejoined_account, m.terms_consent_revision,
                    m.terms_consent_policy_version, m.identity_key, m.recovery_key, m.previous_account_uids,
                    m.created_at AS member_created_at, m.updated_at AS member_updated_at,
                    m.auth_authority_mode, m.lifecycle_authority_mode,
                    m.clerk_account_state, m.clerk_linked_at, m.clerk_last_verified_at,
                    m.password_authority_updated_at, m.withdrawn_at`,
        [uid],
      );
      if (result.rows[0]?.app_user_id) {
        await ensurePostgresqlRentalRestrictionReadModel(pool, {
          appUserId: result.rows[0].app_user_id,
          firebaseUid: result.rows[0].firebase_uid,
        });
      }
      return mapRow(result.rows[0]);
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

    async finalizePostgresqlWithdrawal({ firebaseUid, allowBlockingRestriction = false }) {
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
             FROM app_rental_restrictions
            WHERE firebase_uid=$1
            FOR UPDATE`,
          [uid],
        );
        const restrictionRow = restrictionResult.rows[0];
        const restriction = restrictionRow?.restriction_exists ? (restrictionRow.restriction_payload || {}) : {};
        if (!allowBlockingRestriction && isBlockingRestriction(restriction)) {
          throw repositoryError('user_withdrawal_restriction_blocked', 'Active rental restriction blocks membership withdrawal.', 409);
        }

        await client.query(
          `UPDATE app_member_accounts
              SET status='retired',
                  lifecycle_authority_mode='postgresql-authoritative', mirror_state='retired',
                  withdrawn_at=COALESCE(withdrawn_at,NOW()), authoritative_updated_at=NOW(),
                  source_updated_at=NOW(), synced_at=NOW(), updated_at=NOW()
            WHERE firebase_uid=$1`,
          [uid],
        );
        await client.query(
          `UPDATE app_rental_restrictions
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
      const uid = trim(firebaseUid);
      await pool.query(
        `UPDATE app_member_accounts
            SET status='retired', lifecycle_authority_mode='postgresql-authoritative',
                mirror_state='retired', withdrawn_at=COALESCE(withdrawn_at,NOW()),
                authoritative_updated_at=NOW(), source_updated_at=NOW(), updated_at=NOW()
          WHERE firebase_uid=$1`,
        [uid],
      );
      return this.findByFirebaseUid(uid);
    },

    async purgeMemberAccount({ firebaseUid, requiredStatus, operation = 'member-purge' }) {
      const uid = trim(firebaseUid);
      const statusRequired = trim(requiredStatus);
      if (!uid || !statusRequired) throw repositoryError('member_purge_target_invalid', 'Member purge target is invalid.', 400);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`member-purge:${uid}`]);
        const memberResult = await client.query(
          `SELECT firebase_uid, app_user_id, status
             FROM app_member_accounts
            WHERE firebase_uid=$1
            FOR UPDATE`,
          [uid],
        );
        const member = memberResult.rows[0];
        if (!member) throw repositoryError('member_account_not_found', 'Member account was not found.', 404);
        if (trim(member.status) !== statusRequired) {
          throw repositoryError(statusRequired === 'retired' ? 'admin_member_purge_retired_only' : 'admin_member_reject_pending_only', 'Member status does not allow this deletion.', 409);
        }
        if (statusRequired === 'retired') {
          const pendingRejoin = await client.query(
            `SELECT firebase_uid
               FROM app_member_accounts
              WHERE status='pending'
                AND previous_account_uids ? $1
              LIMIT 1`,
            [uid],
          );
          if (pendingRejoin.rowCount > 0) {
            throw repositoryError('member_purge_pending_rejoin_blocked', 'A pending re-registration is still linked to this retired member.', 409);
          }
        }
        const blockerResult = await client.query(
          `SELECT COUNT(*) FILTER (WHERE status IN ('신청중','보류','대여중'))::bigint AS active_count,
                  COUNT(*) FILTER (WHERE user_action_request->>'status'='pending')::bigint AS pending_action_count,
                  COUNT(*) FILTER (WHERE overdue_penalty_pending=TRUE)::bigint AS overdue_penalty_pending_count
             FROM app_rental_requests
            WHERE firebase_uid=$1 OR ($2::bigint IS NOT NULL AND app_user_id=$2::bigint)`,
          [uid, member.app_user_id],
        );
        const blockers = blockerResult.rows[0] || {};
        if (Number(blockers.active_count || 0) > 0 || Number(blockers.pending_action_count || 0) > 0 || Number(blockers.overdue_penalty_pending_count || 0) > 0) {
          throw repositoryError('member_purge_active_business_blocked', 'Unfinished rental business blocks permanent member deletion.', 409);
        }

        const requestResult = await client.query(
          `SELECT id FROM app_rental_requests WHERE firebase_uid=$1 OR ($2::bigint IS NOT NULL AND app_user_id=$2::bigint)`,
          [uid, member.app_user_id],
        );
        const requestIds = requestResult.rows.map((row) => row.id);
        const deletedCounts = {};
        if (requestIds.length) {
          const guards = await client.query(`DELETE FROM app_rental_asset_reservation_guards WHERE rental_request_id=ANY($1::bigint[])`, [requestIds]);
          deletedCounts.reservationGuards = guards.rowCount;
          const events = await client.query(`DELETE FROM app_rental_request_events WHERE rental_request_id=ANY($1::bigint[])`, [requestIds]);
          deletedCounts.rentalEvents = events.rowCount;
          const items = await client.query(`DELETE FROM app_rental_request_items WHERE rental_request_id=ANY($1::bigint[])`, [requestIds]);
          deletedCounts.rentalItems = items.rowCount;
        }
        const crossEvents = await client.query(`DELETE FROM app_rental_request_events WHERE actor_firebase_uid=$1 OR ($2::bigint IS NOT NULL AND actor_app_user_id=$2::bigint)`, [uid, member.app_user_id]);
        deletedCounts.actorRentalEvents = crossEvents.rowCount;
        const requests = await client.query(`DELETE FROM app_rental_requests WHERE firebase_uid=$1 OR ($2::bigint IS NOT NULL AND app_user_id=$2::bigint)`, [uid, member.app_user_id]);
        deletedCounts.rentalRequests = requests.rowCount;
        const restrictions = await client.query(`DELETE FROM app_rental_restrictions WHERE firebase_uid=$1 OR ($2::bigint IS NOT NULL AND app_user_id=$2::bigint)`, [uid, member.app_user_id]);
        deletedCounts.restrictions = restrictions.rowCount;
        const termLogs = await client.query(`DELETE FROM app_user_term_consent_logs WHERE firebase_uid=$1`, [uid]);
        deletedCounts.termLogs = termLogs.rowCount;
        const termStates = await client.query(`DELETE FROM app_user_term_consent_states WHERE firebase_uid=$1`, [uid]);
        deletedCounts.termStates = termStates.rowCount;
        const profileEvents = await client.query(`DELETE FROM app_member_profile_events WHERE firebase_uid=$1 OR actor_firebase_uid=$1 OR ($2::bigint IS NOT NULL AND app_user_id=$2::bigint)`, [uid, member.app_user_id]);
        deletedCounts.profileEvents = profileEvents.rowCount;

        await client.query(
          `UPDATE app_member_accounts current
              SET previous_account_uids=COALESCE((
                    SELECT jsonb_agg(value)
                      FROM jsonb_array_elements_text(current.previous_account_uids) AS value
                     WHERE value <> $1
                  ), '[]'::jsonb),
                  rejoined_account=EXISTS(
                    SELECT 1 FROM jsonb_array_elements_text(current.previous_account_uids) AS value WHERE value <> $1
                  ),
                  updated_at=NOW(), authoritative_updated_at=NOW()
            WHERE current.firebase_uid <> $1
              AND current.previous_account_uids ? $1`,
          [uid],
        );
        await client.query(
          `UPDATE app_rental_restrictions
              SET restriction_exists=FALSE, restriction_payload='{}'::jsonb,
                  source_document_path='postgresql/member-purge/cleared-inherited-restriction',
                  source_hash='', updated_at=NOW(), authoritative_updated_at=NOW()
            WHERE restriction_payload->>'inheritedFromPreviousAccount'='true'
              AND restriction_payload->>'inheritedFromFirebaseUid'=$1`,
          [uid],
        );

        const memberDelete = await client.query(`DELETE FROM app_member_accounts WHERE firebase_uid=$1 RETURNING app_user_id`, [uid]);
        deletedCounts.memberAccounts = memberDelete.rowCount;
        if (member.app_user_id) {
          const identityDelete = await client.query(`DELETE FROM app_user_identities WHERE id=$1`, [member.app_user_id]);
          deletedCounts.userIdentities = identityDelete.rowCount;
        } else {
          deletedCounts.userIdentities = 0;
          const linkDelete = await client.query(`DELETE FROM app_user_firebase_links WHERE firebase_uid=$1`, [uid]);
          deletedCounts.identityLinks = linkDelete.rowCount;
        }

        const orphanChecks = await client.query(
          `SELECT
             (SELECT COUNT(*) FROM app_member_accounts WHERE firebase_uid=$1)::bigint AS members,
             (SELECT COUNT(*) FROM app_user_firebase_links WHERE firebase_uid=$1)::bigint AS links,
             (SELECT COUNT(*) FROM app_user_identities WHERE $2::bigint IS NOT NULL AND id=$2::bigint)::bigint AS identities,
             (SELECT COUNT(*) FROM app_rental_requests WHERE firebase_uid=$1 OR ($2::bigint IS NOT NULL AND app_user_id=$2::bigint))::bigint AS requests,
             (SELECT COUNT(*) FROM app_rental_request_events WHERE actor_firebase_uid=$1 OR ($2::bigint IS NOT NULL AND actor_app_user_id=$2::bigint))::bigint AS rental_event_actor_refs,
             (SELECT COUNT(*) FROM app_rental_restrictions WHERE firebase_uid=$1 OR ($2::bigint IS NOT NULL AND app_user_id=$2::bigint))::bigint AS restrictions,
             (SELECT COUNT(*) FROM app_user_term_consent_states WHERE firebase_uid=$1)::bigint AS term_states,
             (SELECT COUNT(*) FROM app_user_term_consent_logs WHERE firebase_uid=$1)::bigint AS term_logs,
             (SELECT COUNT(*) FROM app_member_profile_events WHERE firebase_uid=$1 OR actor_firebase_uid=$1 OR ($2::bigint IS NOT NULL AND app_user_id=$2::bigint))::bigint AS profile_events,
             (SELECT COUNT(*) FROM app_member_accounts WHERE previous_account_uids ? $1)::bigint AS lineage_refs`,
          [uid, member.app_user_id],
        );
        const orphan = orphanChecks.rows[0] || {};
        if (Object.values(orphan).some((value) => Number(value || 0) > 0)) {
          throw repositoryError('member_purge_orphan_reference', `Permanent member deletion left orphan references after ${operation}.`, 500);
        }
        await client.query('COMMIT');
        return Object.freeze({ deleted: true, deletedCounts: Object.freeze(deletedCounts) });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
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
