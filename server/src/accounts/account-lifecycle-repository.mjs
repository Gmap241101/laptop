import { randomUUID } from 'node:crypto';

const mapState = (row) => row ? Object.freeze({
  termId: row.term_id || '',
  termVersion: Number(row.term_version || 0),
  termVersionId: row.term_version_id || '',
  policyRevision: Number(row.policy_revision || 0),
  decision: row.decision || '',
  requiredSnapshot: Boolean(row.required_snapshot),
  titleSnapshot: row.title_snapshot || '',
  contentHash: row.content_hash || '',
  viewedAtMs: Number(row.viewed_at_ms || 0),
  decidedAt: row.decided_at || null,
  source: row.source || '',
  updatedAt: row.updated_at || null,
}) : null;

const mapLog = (row) => row ? Object.freeze({
  id: row.id || '',
  termId: row.term_id || '',
  termVersion: Number(row.term_version || 0),
  termVersionId: row.term_version_id || '',
  policyRevision: Number(row.policy_revision || 0),
  decision: row.decision || '',
  previousDecision: row.previous_decision || '',
  requiredSnapshot: Boolean(row.required_snapshot),
  titleSnapshot: row.title_snapshot || '',
  contentHash: row.content_hash || '',
  viewedAtMs: Number(row.viewed_at_ms || 0),
  source: row.source || '',
  createdAt: row.created_at || null,
}) : null;

const toIsoOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const createAccountLifecycleRepository = (pool) => {
  if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function') {
    throw new TypeError('PostgreSQL pool is required for account lifecycle authority.');
  }

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
    } finally {
      client.release();
    }
  };

  const readConsentSnapshot = async (queryable, firebaseUid) => {
    const [states, logs, account] = await Promise.all([
      queryable.query(
        `SELECT term_id, term_version, term_version_id, policy_revision, decision, required_snapshot,
                title_snapshot, content_hash, viewed_at_ms, decided_at, source, updated_at
           FROM app_user_term_consent_states
          WHERE firebase_uid=$1
          ORDER BY term_id`,
        [firebaseUid],
      ),
      queryable.query(
        `SELECT id, term_id, term_version, term_version_id, policy_revision, decision, previous_decision,
                required_snapshot, title_snapshot, content_hash, viewed_at_ms, source, created_at
           FROM app_user_term_consent_logs
          WHERE firebase_uid=$1
          ORDER BY created_at DESC
          LIMIT 500`,
        [firebaseUid],
      ),
      queryable.query(
        `SELECT terms_consent_revision, terms_consent_policy_version, terms_consent_bootstrap_completed_at
           FROM app_member_accounts
          WHERE firebase_uid=$1
          LIMIT 1`,
        [firebaseUid],
      ),
    ]);
    return Object.freeze({
      states: Object.fromEntries(states.rows.map((row) => [row.term_id, mapState(row)])),
      logs: logs.rows.map(mapLog),
      termsConsentRevision: Math.max(0, Number(account.rows[0]?.terms_consent_revision || 0)),
      termsConsentPolicyVersion: Math.max(0, Number(account.rows[0]?.terms_consent_policy_version || 0)),
      bootstrapCompleted: Boolean(account.rows[0]?.terms_consent_bootstrap_completed_at),
    });
  };

  const upsertConsentState = async (client, firebaseUid, decision, { decidedAt = null, createdAt = null, updatedAt = null } = {}) => {
    const decided = toIsoOrNull(decidedAt) || new Date().toISOString();
    const created = toIsoOrNull(createdAt) || decided;
    const updated = toIsoOrNull(updatedAt) || decided;
    await client.query(
      `INSERT INTO app_user_term_consent_states
         (firebase_uid, term_id, term_version, term_version_id, policy_revision, decision,
          required_snapshot, title_snapshot, content_hash, viewed_at_ms, decided_at, source, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12,$13::timestamptz,$14::timestamptz)
       ON CONFLICT (firebase_uid, term_id) DO UPDATE SET
         term_version=EXCLUDED.term_version,
         term_version_id=EXCLUDED.term_version_id,
         policy_revision=EXCLUDED.policy_revision,
         decision=EXCLUDED.decision,
         required_snapshot=EXCLUDED.required_snapshot,
         title_snapshot=EXCLUDED.title_snapshot,
         content_hash=EXCLUDED.content_hash,
         viewed_at_ms=EXCLUDED.viewed_at_ms,
         decided_at=EXCLUDED.decided_at,
         source=EXCLUDED.source,
         updated_at=EXCLUDED.updated_at`,
      [firebaseUid, decision.termId, decision.termVersion, decision.termVersionId, decision.policyRevision,
        decision.decision, decision.requiredSnapshot, decision.titleSnapshot, decision.contentHash,
        decision.viewedAtMs, decided, decision.source, created, updated],
    );
  };

  const insertConsentLog = async (client, firebaseUid, decision, previousDecision = '', { id = '', createdAt = null } = {}) => {
    await client.query(
      `INSERT INTO app_user_term_consent_logs
         (id, firebase_uid, term_id, term_version, term_version_id, policy_revision, decision,
          previous_decision, required_snapshot, title_snapshot, content_hash, viewed_at_ms, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [id || randomUUID(), firebaseUid, decision.termId, decision.termVersion, decision.termVersionId,
        decision.policyRevision, decision.decision, previousDecision, decision.requiredSnapshot,
        decision.titleSnapshot, decision.contentHash, decision.viewedAtMs, decision.source,
        toIsoOrNull(createdAt) || new Date().toISOString()],
    );
  };

  const insertConsent = async (client, firebaseUid, decision, previousDecision = '') => {
    const now = new Date().toISOString();
    await upsertConsentState(client, firebaseUid, decision, { decidedAt: now, createdAt: now, updatedAt: now });
    await insertConsentLog(client, firebaseUid, decision, previousDecision, { createdAt: now });
  };

  return Object.freeze({
    async getDirectoryEntry(identityKey) {
      const result = await pool.query(
        `SELECT identity_key, directory_member_id, name, team, sort_order, enabled, source_updated_at, synced_at
           FROM app_member_directory_entries
          WHERE identity_key=$1
          LIMIT 1`,
        [identityKey],
      );
      return result.rows[0] || null;
    },

    async findIdentityAccounts(identityKey) {
      const result = await pool.query(
        `SELECT firebase_uid, status, previous_account_uids, identity_key, directory_member_id
           FROM app_member_accounts
          WHERE identity_key=$1
          ORDER BY authoritative_updated_at DESC NULLS LAST, updated_at DESC`,
        [identityKey],
      );
      return result.rows;
    },

    async createSignupAccount({ firebaseUid, email, maskedEmail, name, team, phone, status, identityKey, recoveryKey,
      directoryMemberId = '', directoryVerifiedVersion = 0, previousAccountUids = [], rejoinedAccount = false,
      termsConsentRevision = 0, termsConsentPolicyVersion = 0, decisions = [] }) {
      return withTransaction(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`phase32-signup:${identityKey}`]);
        const duplicate = await client.query(
          `SELECT firebase_uid, status FROM app_member_accounts
            WHERE identity_key=$1 AND status <> 'retired' AND firebase_uid <> $2
            LIMIT 1`,
          [identityKey, firebaseUid],
        );
        if (duplicate.rowCount > 0) {
          const error = new Error('Another active member owns the requested identity.');
          error.code = 'member_identity_already_claimed';
          error.status = 409;
          throw error;
        }
        const emailDuplicate = await client.query(
          `SELECT firebase_uid FROM app_member_accounts
            WHERE lower(email)=lower($1) AND status <> 'retired' AND firebase_uid <> $2
            LIMIT 1`,
          [email, firebaseUid],
        );
        if (emailDuplicate.rowCount > 0) {
          const error = new Error('Email address is already registered.');
          error.code = 'member_email_already_registered';
          error.status = 409;
          throw error;
        }
        await client.query(
          `INSERT INTO app_member_accounts
             (firebase_uid, app_user_id, email, masked_email, name, team, phone, status,
              directory_member_id, directory_verified_version, profile_required_reason,
              rejoined_account, terms_consent_revision, terms_consent_policy_version,
              terms_consent_completed_at, terms_consent_bootstrap_completed_at,
              identity_key, recovery_key, previous_account_uids,
              source_hash, authority_mode, mirror_state, last_mutation_id,
              auth_authority_mode, lifecycle_authority_mode, clerk_account_state,
              authoritative_updated_at, synced_at, created_at, updated_at)
           VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,'',$10,$11,$12,
                   CASE WHEN $11::bigint > 0 THEN NOW() ELSE NULL END,NOW(),
                   $13,$14,$15::jsonb,'','postgresql-authoritative','retired',$16,
                   'firebase-compatibility','postgresql-authoritative','active',NOW(),NOW(),NOW(),NOW())
           ON CONFLICT (firebase_uid) DO UPDATE SET
             email=EXCLUDED.email, masked_email=EXCLUDED.masked_email, name=EXCLUDED.name,
             team=EXCLUDED.team, phone=EXCLUDED.phone, status=EXCLUDED.status,
             directory_member_id=EXCLUDED.directory_member_id,
             directory_verified_version=EXCLUDED.directory_verified_version,
             rejoined_account=EXCLUDED.rejoined_account,
             terms_consent_revision=EXCLUDED.terms_consent_revision,
             terms_consent_policy_version=EXCLUDED.terms_consent_policy_version,
             terms_consent_completed_at=EXCLUDED.terms_consent_completed_at,
             terms_consent_bootstrap_completed_at=NOW(),
             identity_key=EXCLUDED.identity_key, recovery_key=EXCLUDED.recovery_key,
             previous_account_uids=EXCLUDED.previous_account_uids,
             authority_mode='postgresql-authoritative', mirror_state='retired',
             lifecycle_authority_mode='postgresql-authoritative', clerk_account_state='active',
             last_mutation_id=EXCLUDED.last_mutation_id,
             authoritative_updated_at=NOW(), synced_at=NOW(), updated_at=NOW()`,
          [firebaseUid, email, maskedEmail, name, team, phone, status, directoryMemberId,
            directoryVerifiedVersion, rejoinedAccount, termsConsentRevision, termsConsentPolicyVersion,
            identityKey, recoveryKey, JSON.stringify(previousAccountUids), randomUUID()],
        );
        if (rejoinedAccount && Array.isArray(previousAccountUids) && previousAccountUids.length > 0) {
          const inheritedRestrictionResult = await client.query(
            `SELECT firebase_uid, restriction_payload
               FROM app_user_rental_restriction_shadows
              WHERE firebase_uid = ANY($1::text[])
                AND restriction_exists = TRUE
              ORDER BY authoritative_updated_at DESC NULLS LAST, updated_at DESC
              LIMIT 1`,
            [previousAccountUids],
          );
          const inheritedRow = inheritedRestrictionResult.rows[0];
          if (inheritedRow) {
            const inheritedRestriction = {
              ...(inheritedRow.restriction_payload || {}),
              uid: firebaseUid,
              inheritedFromPreviousAccount: true,
              inheritedFromFirebaseUid: inheritedRow.firebase_uid,
            };
            await client.query(
              `INSERT INTO app_user_rental_restriction_shadows (
                 firebase_uid, app_user_id, restriction_exists, restriction_payload,
                 source_document_path, source_updated_at, source_hash, synced_at,
                 authority_mode, mirror_state, last_mutation_id, authoritative_updated_at
               ) VALUES ($1,NULL,true,$2::jsonb,$3,NOW(),$4,NOW(),
                         'postgresql-authoritative','retired','',NOW())
               ON CONFLICT (firebase_uid) DO UPDATE SET
                 restriction_exists=TRUE, restriction_payload=EXCLUDED.restriction_payload,
                 source_document_path=EXCLUDED.source_document_path, source_updated_at=NOW(),
                 source_hash=EXCLUDED.source_hash, synced_at=NOW(),
                 authority_mode='postgresql-authoritative', mirror_state='retired',
                 authoritative_updated_at=NOW(), updated_at=NOW()`,
              [
                firebaseUid,
                JSON.stringify(inheritedRestriction),
                `postgresql/app_user_rental_restriction_shadows/${inheritedRow.firebase_uid}/rejoin-inheritance`,
                `postgresql-authoritative:inherited:${inheritedRow.firebase_uid}:${firebaseUid}`,
              ],
            );
          }
        }
        for (const decision of decisions) await insertConsent(client, firebaseUid, decision, '');
        const result = await client.query(
          `SELECT firebase_uid, email, masked_email, name, team, phone, status, identity_key, recovery_key,
                  directory_member_id, directory_verified_version, rejoined_account,
                  previous_account_uids, terms_consent_revision, terms_consent_policy_version,
                  authority_mode, mirror_state
             FROM app_member_accounts WHERE firebase_uid=$1`,
          [firebaseUid],
        );
        return result.rows[0] || null;
      });
    },

    async getConsentSnapshot(firebaseUid) {
      return readConsentSnapshot(pool, firebaseUid);
    },

    async importConsents({ firebaseUid, states = [], logs = [] }) {
      await withTransaction(async (client) => {
        const account = await client.query(
          `SELECT firebase_uid, terms_consent_bootstrap_completed_at
             FROM app_member_accounts
            WHERE firebase_uid=$1
            FOR UPDATE`,
          [firebaseUid],
        );
        if (!account.rows[0]) {
          const error = new Error('Member account was not found.');
          error.code = 'terms_account_not_found';
          error.status = 404;
          throw error;
        }
        if (account.rows[0].terms_consent_bootstrap_completed_at) return;

        for (const state of states) {
          await upsertConsentState(client, firebaseUid, state, {
            decidedAt: state.decidedAt,
            createdAt: state.createdAt || state.decidedAt,
            updatedAt: state.updatedAt || state.decidedAt,
          });
        }
        for (const log of logs) {
          await insertConsentLog(client, firebaseUid, log, log.previousDecision || '', {
            id: log.id,
            createdAt: log.createdAt || log.decidedAt,
          });
        }
        const importedRevision = Math.max(0, ...states.map((state) => Number(state?.policyRevision || 0)));
        await client.query(
          `UPDATE app_member_accounts
              SET terms_consent_revision=GREATEST(terms_consent_revision, $2),
                  terms_consent_policy_version=GREATEST(terms_consent_policy_version, $2),
                  terms_consent_completed_at=CASE WHEN $2 > 0 THEN COALESCE(terms_consent_completed_at, NOW()) ELSE terms_consent_completed_at END,
                  terms_consent_bootstrap_completed_at=NOW(),
                  updated_at=NOW()
            WHERE firebase_uid=$1`,
          [firebaseUid, importedRevision],
        );
      });
      return readConsentSnapshot(pool, firebaseUid);
    },

    async saveConsents({ firebaseUid, policyRevision, decisions }) {
      await withTransaction(async (client) => {
        const account = await client.query(
          `SELECT firebase_uid, terms_consent_revision FROM app_member_accounts WHERE firebase_uid=$1 FOR UPDATE`,
          [firebaseUid],
        );
        if (!account.rows[0]) {
          const error = new Error('Member account was not found.');
          error.code = 'terms_account_not_found';
          error.status = 404;
          throw error;
        }
        for (const decision of decisions) {
          const previous = await client.query(
            `SELECT decision FROM app_user_term_consent_states WHERE firebase_uid=$1 AND term_id=$2`,
            [firebaseUid, decision.termId],
          );
          await insertConsent(client, firebaseUid, decision, previous.rows[0]?.decision || '');
        }
        await client.query(
          `UPDATE app_member_accounts
              SET terms_consent_revision=$2,
                  terms_consent_policy_version=$2,
                  terms_consent_completed_at=NOW(),
                  terms_consent_bootstrap_completed_at=NOW(),
                  authoritative_updated_at=NOW(), updated_at=NOW()
            WHERE firebase_uid=$1`,
          [firebaseUid, policyRevision],
        );
      });
      return readConsentSnapshot(pool, firebaseUid);
    },
  });
};
