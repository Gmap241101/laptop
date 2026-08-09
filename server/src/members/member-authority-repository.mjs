import { createHash, randomUUID } from 'node:crypto';

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
export const hashPayload = (value) => createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');

const memberProjection = (profile = {}) => ({
  uid: profile.uid || profile.firebaseUid || '',
  email: profile.email || '',
  maskedEmail: profile.maskedEmail || '',
  name: profile.name || '',
  team: profile.team || '',
  phone: profile.phone || '',
  status: profile.status || '',
  directoryMemberId: profile.directoryMemberId || '',
  directoryVerifiedVersion: Number(profile.directoryVerifiedVersion || 0),
  profileRequiredReason: profile.profileRequiredReason || '',
  rejoinedAccount: Boolean(profile.rejoinedAccount),
  termsConsentRevision: Number(profile.termsConsentRevision || 0),
  termsConsentPolicyVersion: Number(profile.termsConsentPolicyVersion || 0),
  identityKey: profile.identityKey || '',
  recoveryKey: profile.recoveryKey || '',
  previousAccountUids: Array.isArray(profile.previousAccountUids) ? profile.previousAccountUids : [],
});

export const createMemberAuthorityRepository = (pool) => {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('PostgreSQL pool.connect() is required.');

  const withTransaction = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  };

  return Object.freeze({
    async findByFirebaseUid(firebaseUid) {
      const result = await pool.query(
        `SELECT app_user_id, firebase_uid, firebase_uid AS uid, email, masked_email, name, team, phone, status,
                directory_member_id, directory_verified_version, profile_required_reason,
                rejoined_account, terms_consent_revision, terms_consent_policy_version,
                identity_key, recovery_key, previous_account_uids, source_hash,
                authority_mode, mirror_state, last_mutation_id, synced_at, updated_at
           FROM app_member_accounts WHERE firebase_uid = $1`,
        [firebaseUid],
      );
      return result.rows[0] || null;
    },

    async mutateProfile({ appUserId, firebaseUid, actorFirebaseUid, actorType, action, beforeProfile, nextProfile, beforeMirror }) {
      return withTransaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`member:${firebaseUid}`]);
        const mutationId = randomUUID();
        const sourceHash = hashPayload(memberProjection(nextProfile));
        await client.query(
          `INSERT INTO app_member_profile_events (
             id, app_user_id, firebase_uid, actor_firebase_uid, actor_type, action,
             before_payload, after_payload, firestore_mirror_state
           ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'pending')`,
          [mutationId, appUserId, firebaseUid, actorFirebaseUid || '', actorType || 'user', action, JSON.stringify(beforeProfile || {}), JSON.stringify(nextProfile || {})],
        );
        const updated = await client.query(
          `INSERT INTO app_member_accounts (
             firebase_uid, app_user_id, email, masked_email, name, team, phone, status,
             directory_member_id, directory_verified_version, profile_required_reason,
             rejoined_account, terms_consent_revision, terms_consent_policy_version,
             identity_key, recovery_key, previous_account_uids, source_hash,
             authority_mode, mirror_state, last_mutation_id, source_updated_at,
             authoritative_updated_at, synced_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,
                     'postgresql-authoritative','pending',$19,NOW(),NOW(),NOW())
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
             previous_account_uids=EXCLUDED.previous_account_uids, source_hash=EXCLUDED.source_hash,
             authority_mode='postgresql-authoritative', mirror_state='pending',
             last_mutation_id=EXCLUDED.last_mutation_id, source_updated_at=NOW(),
             authoritative_updated_at=NOW(), synced_at=NOW(), updated_at=NOW()
           RETURNING *`,
          [firebaseUid, appUserId, nextProfile.email || '', nextProfile.maskedEmail || '', nextProfile.name || '', nextProfile.team || '', nextProfile.phone || '', nextProfile.status || '', nextProfile.directoryMemberId || '', Number(nextProfile.directoryVerifiedVersion || 0), nextProfile.profileRequiredReason || '', Boolean(nextProfile.rejoinedAccount), Number(nextProfile.termsConsentRevision || 0), Number(nextProfile.termsConsentPolicyVersion || 0), nextProfile.identityKey || '', nextProfile.recoveryKey || '', JSON.stringify(nextProfile.previousAccountUids || []), sourceHash, mutationId],
        );
        if (appUserId) {
          await client.query(
            `UPDATE app_user_member_shadows SET
               uid=$3, email=$4, masked_email=$5, name=$6, team=$7, phone=$8, status=$9,
               directory_member_id=$10, directory_verified_version=$11, profile_required_reason=$12,
               rejoined_account=$13, terms_consent_revision=$14, terms_consent_policy_version=$15,
               identity_key=$16, recovery_key=$17, previous_account_uids=$18::jsonb,
               source_updated_at=NOW(), source_hash=$19, synced_at=NOW(),
               authority_mode='postgresql-authoritative', mirror_state='pending', last_mutation_id=$20,
               authoritative_updated_at=NOW(), updated_at=NOW()
             WHERE app_user_id=$1 AND firebase_uid=$2`,
            [appUserId, firebaseUid, firebaseUid, nextProfile.email || '', nextProfile.maskedEmail || '', nextProfile.name || '', nextProfile.team || '', nextProfile.phone || '', nextProfile.status || '', nextProfile.directoryMemberId || '', Number(nextProfile.directoryVerifiedVersion || 0), nextProfile.profileRequiredReason || '', Boolean(nextProfile.rejoinedAccount), Number(nextProfile.termsConsentRevision || 0), Number(nextProfile.termsConsentPolicyVersion || 0), nextProfile.identityKey || '', nextProfile.recoveryKey || '', JSON.stringify(nextProfile.previousAccountUids || []), sourceHash, mutationId],
          );
        }
        await beforeMirror({ client, mutationId, canonical: updated.rows[0] });
        await client.query(`UPDATE app_member_accounts SET mirror_state='synced', synced_at=NOW(), updated_at=NOW() WHERE firebase_uid=$1 AND last_mutation_id=$2`, [firebaseUid, mutationId]);
        if (appUserId) await client.query(
          `UPDATE app_user_member_shadows SET mirror_state='synced', synced_at=NOW(), updated_at=NOW()
            WHERE app_user_id=$1 AND last_mutation_id=$2`,
          [appUserId, mutationId],
        );
        await client.query(
          `UPDATE app_member_profile_events SET firestore_mirror_state='synced', completed_at=NOW() WHERE id=$1::uuid`,
          [mutationId],
        );
        return { mutationId, sourceHash };
      });
    },

    async mutateStatus({ appUserId, firebaseUid, actorFirebaseUid, nextStatus, beforeProfile, nextProfile, nextRestriction = null, beforeMirror }) {
      return withTransaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`member:${firebaseUid}`]);
        const mutationId = randomUUID();
        const sourceHash = hashPayload(memberProjection(nextProfile));
        await client.query(
          `INSERT INTO app_member_profile_events (id, app_user_id, firebase_uid, actor_firebase_uid, actor_type, action, before_payload, after_payload, firestore_mirror_state)
           VALUES ($1::uuid,$2,$3,$4,'admin','status-change',$5::jsonb,$6::jsonb,'pending')`,
          [mutationId, appUserId, firebaseUid, actorFirebaseUid || '', JSON.stringify(beforeProfile || {}), JSON.stringify(nextProfile || {})],
        );
        await client.query(
          `INSERT INTO app_member_accounts (firebase_uid,app_user_id,email,masked_email,name,team,phone,status,directory_member_id,directory_verified_version,profile_required_reason,rejoined_account,terms_consent_revision,terms_consent_policy_version,identity_key,recovery_key,previous_account_uids,source_hash,authority_mode,mirror_state,last_mutation_id,source_updated_at,authoritative_updated_at,synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,'postgresql-authoritative','pending',$19,NOW(),NOW(),NOW())
           ON CONFLICT (firebase_uid) DO UPDATE SET status=EXCLUDED.status, app_user_id=COALESCE(EXCLUDED.app_user_id,app_member_accounts.app_user_id), source_hash=EXCLUDED.source_hash, authority_mode='postgresql-authoritative', mirror_state='pending', last_mutation_id=EXCLUDED.last_mutation_id, source_updated_at=NOW(), authoritative_updated_at=NOW(), synced_at=NOW(), updated_at=NOW()`,
          [firebaseUid, appUserId, nextProfile.email || '', nextProfile.maskedEmail || '', nextProfile.name || '', nextProfile.team || '', nextProfile.phone || '', nextStatus, nextProfile.directoryMemberId || '', Number(nextProfile.directoryVerifiedVersion || 0), nextProfile.profileRequiredReason || '', Boolean(nextProfile.rejoinedAccount), Number(nextProfile.termsConsentRevision || 0), Number(nextProfile.termsConsentPolicyVersion || 0), nextProfile.identityKey || '', nextProfile.recoveryKey || '', JSON.stringify(nextProfile.previousAccountUids || []), sourceHash, mutationId],
        );
        if (appUserId) await client.query(
          `UPDATE app_user_member_shadows SET status=$3, source_hash=$4, source_updated_at=NOW(), synced_at=NOW(),
             authority_mode='postgresql-authoritative', mirror_state='pending', last_mutation_id=$5,
             authoritative_updated_at=NOW(), updated_at=NOW()
           WHERE app_user_id=$1 AND firebase_uid=$2`,
          [appUserId, firebaseUid, nextStatus, sourceHash, mutationId],
        );
        if (nextRestriction) {
          await client.query(
            `INSERT INTO app_user_rental_restriction_shadows (
               firebase_uid, app_user_id, restriction_exists, restriction_payload, source_document_path,
               source_updated_at, source_hash, synced_at, authority_mode, mirror_state, last_mutation_id, authoritative_updated_at
             ) VALUES ($1,$2,true,$3::jsonb,$4,NOW(),$5,NOW(),'postgresql-authoritative','pending',$6,NOW())
             ON CONFLICT (firebase_uid) DO UPDATE SET
               app_user_id=COALESCE(EXCLUDED.app_user_id,app_user_rental_restriction_shadows.app_user_id),
               restriction_exists=true, restriction_payload=EXCLUDED.restriction_payload,
               source_document_path=EXCLUDED.source_document_path, source_updated_at=NOW(), source_hash=EXCLUDED.source_hash,
               synced_at=NOW(), authority_mode='postgresql-authoritative', mirror_state='pending',
               last_mutation_id=EXCLUDED.last_mutation_id, authoritative_updated_at=NOW(), updated_at=NOW()`,
            [firebaseUid, appUserId, JSON.stringify(nextRestriction), `rentalRestrictions/${firebaseUid}`, hashPayload(nextRestriction), mutationId],
          );
        }
        await beforeMirror({ client, mutationId });
        await client.query(`UPDATE app_member_accounts SET mirror_state='synced', synced_at=NOW(), updated_at=NOW() WHERE firebase_uid=$1 AND last_mutation_id=$2`, [firebaseUid, mutationId]);
        if (appUserId) await client.query(
          `UPDATE app_user_member_shadows SET mirror_state='synced', synced_at=NOW(), updated_at=NOW() WHERE app_user_id=$1 AND last_mutation_id=$2`,
          [appUserId, mutationId],
        );
        if (nextRestriction) {
          await client.query(
            `UPDATE app_user_rental_restriction_shadows SET mirror_state='synced', synced_at=NOW(), updated_at=NOW() WHERE firebase_uid=$1 AND last_mutation_id=$2`,
            [firebaseUid, mutationId],
          );
        }
        await client.query(`UPDATE app_member_profile_events SET firestore_mirror_state='synced', completed_at=NOW() WHERE id=$1::uuid`, [mutationId]);
        return { mutationId, sourceHash };
      });
    },

    async upsertRestrictionAuthoritative({ firebaseUid, appUserId = null, restriction, mutationId = '' }) {
      const payload = restriction || {};
      const result = await pool.query(
        `INSERT INTO app_user_rental_restriction_shadows (
           firebase_uid, app_user_id, restriction_exists, restriction_payload, source_document_path,
           source_updated_at, source_hash, synced_at, authority_mode, mirror_state, last_mutation_id, authoritative_updated_at
         ) VALUES ($1,$2,true,$3::jsonb,$4,NOW(),$5,NOW(),'postgresql-authoritative','synced',$6,NOW())
         ON CONFLICT (firebase_uid) DO UPDATE SET
           app_user_id=COALESCE(EXCLUDED.app_user_id,app_user_rental_restriction_shadows.app_user_id),
           restriction_exists=true, restriction_payload=EXCLUDED.restriction_payload,
           source_document_path=EXCLUDED.source_document_path, source_updated_at=NOW(), source_hash=EXCLUDED.source_hash,
           synced_at=NOW(), authority_mode='postgresql-authoritative', mirror_state='synced',
           last_mutation_id=EXCLUDED.last_mutation_id, authoritative_updated_at=NOW(), updated_at=NOW()
         RETURNING firebase_uid, app_user_id, restriction_payload, authority_mode, mirror_state, synced_at`,
        [firebaseUid, appUserId, JSON.stringify(payload), `rentalRestrictions/${firebaseUid}`, hashPayload(payload), mutationId || randomUUID()],
      );
      return result.rows[0];
    },

    async syncAdminRegistry(admins = []) {
      return withTransaction(async (client) => {
        for (const admin of admins) {
          await client.query(
            `INSERT INTO app_admin_identity_registry (
               firebase_uid, admin_login_id, auth_email, organization_name, user_name, phone, admin_role,
               status, clerk_link_state, source_hash, source_updated_at, synced_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active','unlinked',$8,$9,NOW())
             ON CONFLICT (firebase_uid) DO UPDATE SET
               admin_login_id=EXCLUDED.admin_login_id, auth_email=EXCLUDED.auth_email,
               organization_name=EXCLUDED.organization_name, user_name=EXCLUDED.user_name, phone=EXCLUDED.phone,
               admin_role=EXCLUDED.admin_role, status='active', source_hash=EXCLUDED.source_hash,
               source_updated_at=EXCLUDED.source_updated_at, synced_at=NOW(), updated_at=NOW()`,
            [admin.firebaseUid, admin.adminLoginId, admin.authEmail, admin.organizationName, admin.userName, admin.phone, admin.adminRole, hashPayload(admin), admin.sourceUpdatedAt || null],
          );
        }
        const keep = admins.map((item) => item.firebaseUid).filter(Boolean);
        if (keep.length) {
          await client.query(`UPDATE app_admin_identity_registry SET status='retired', updated_at=NOW() WHERE NOT (firebase_uid = ANY($1::text[])) AND status <> 'retired'`, [keep]);
        }
        const result = await client.query(`SELECT firebase_uid, admin_login_id, auth_email, organization_name, user_name, phone, admin_role, status, clerk_user_id, clerk_link_state, synced_at, updated_at FROM app_admin_identity_registry ORDER BY lower(admin_login_id), firebase_uid`);
        return result.rows;
      });
    },
  });
};
