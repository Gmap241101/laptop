import { randomUUID } from 'node:crypto';
import { getWebBackupConfiguration } from './backup-verification-runtime.mjs';
import { createEncryptedS3ArchiveStore } from './backup-verification-object-store.mjs';
import { RESET_BACKUP_PROOF_KEY,describeResetBackupProof } from './system-reset-backup-proof.mjs';

const makeError = (code, status = 409) => Object.assign(new Error(code), { code, status });
const sanitize = (row) => row ? Object.freeze({
  id: row.id, status: row.status, phase: row.phase, errorCode: row.error_code || null,
  cancelRequested: row.cancel_requested === true, createdAt: row.created_at, startedAt: row.started_at,
  finishedAt: row.finished_at, updatedAt: row.updated_at, verifiedUntil: row.expires_at,
  tableCount: row.table_count,
}) : null;

// Clerk's fva describes minutes since last verification. Require a fresh first factor,
// plus a distinct, signed reverification_id configured in the Clerk session template.
export const requireRecentReverification = (auth, maxMinutes = 5) => {
  const age = auth?.factorVerificationAge?.[0];
  const id = String(auth?.reverificationId || '');
  if (!Number.isInteger(age) || age < 0 || age >= maxMinutes || !/^[a-zA-Z0-9_-]{10,180}$/.test(id)) {
    throw makeError('backup_verification_reauthentication_required', 403);
  }
  if (!String(auth?.sessionId || '').trim()) throw makeError('backup_verification_session_invalid', 403);
  return id;
};

export const createBackupVerificationJobs = (pool, options = {}) => {
  const runtime = options.runtime || getWebBackupConfiguration;
  const config = () => runtime(process.env);
  const ensureReady = async () => {
    if (!config().ready) throw makeError('backup_verification_infrastructure_not_ready',503);
    if (!(await workerAlive())) throw makeError('backup_verification_worker_unavailable',503);
  };
  const workerAlive = async () => {
    const r = await pool.query('SELECT value FROM app_runtime_metadata WHERE key=$1', ['phase34_backup_verification_worker_heartbeat']);
    const value = r.rows[0]?.value || {};
    const checked = Date.parse(value.updatedAt || '');
    return value.environment === config().environment && Number.isFinite(checked) &&
      checked <= Date.now() + 10000 && Date.now() - checked < 30000;
  };
  return Object.freeze({
    async assertDurableProof() {
      // Existing operator-produced v1 records are honored only before the
      // website verifier is enabled; a v2 proof must point at durable storage.
      const c = config();
      const result = await pool.query(`SELECT value,current_database() AS database_name FROM app_runtime_metadata WHERE key=$1`, [RESET_BACKUP_PROOF_KEY]);
      const proof = result.rows[0]?.value || {};
      if (!c.ready) {
        // Disabling the feature must not bypass the durability guard of an
        // already-issued v2 proof. Legacy v1 is accepted only in legacy mode.
        if (process.env.BACKUP_VERIFY_ENABLED === 'true' || proof.type === 'full-pg-dump-isolated-restore-v2') {
          throw makeError('backup_verification_infrastructure_not_ready',503);
        }
        return;
      }
      if (!describeResetBackupProof(proof,result.rows[0]?.database_name || '').valid ||
          proof.type !== 'full-pg-dump-isolated-restore-v2' || proof.environment !== c.environment) {
        throw makeError('backup_verification_valid_proof_required',409);
      }
      if (!/^[0-9a-f-]{36}$/i.test(proof.jobId)) throw makeError('backup_verification_proof_invalid',409);
      try {
        await createEncryptedS3ArchiveStore(c).verifyPresence(proof.objectKey,proof.objectSha256);
      } catch {
        throw makeError('backup_verification_archive_unavailable',409);
      }
    },
    async status() {
      const c = config();
      const enabled = c.ready && await workerAlive();
      return { enabled, reason: enabled ? null : 'backup_verification_infrastructure_not_ready' };
    },
    async latest() {
      const r = await pool.query('SELECT * FROM app_backup_verification_jobs WHERE environment=$1 ORDER BY created_at DESC LIMIT 1', [config().environment]);
      const job = sanitize(r.rows[0]);
      if (!job || job.status !== 'verified') return job;
      const latestProof = await pool.query('SELECT value,current_database() AS database_name FROM app_runtime_metadata WHERE key=$1', [RESET_BACKUP_PROOF_KEY]);
      const p = latestProof.rows[0]?.value || {};
      return {...job, proofActive: p.jobId === job.id &&
        describeResetBackupProof(p,latestProof.rows[0]?.database_name||'').valid};
    },
    async get(jobId) {
      if (!/^[0-9a-f-]{36}$/i.test(String(jobId))) throw makeError('backup_verification_job_invalid', 400);
      const r = await pool.query('SELECT * FROM app_backup_verification_jobs WHERE id=$1 AND environment=$2', [jobId, config().environment]);
      if (!r.rows[0]) throw makeError('backup_verification_job_not_found', 404);
      return sanitize(r.rows[0]);
    },
    async start({ auth, actorClerkUserId }) {
      await ensureReady();
      const reverifyId = requireRecentReverification(auth, config().freshnessMinutes);
      const id = randomUUID();
      try {
        const created = await pool.query(`INSERT INTO app_backup_verification_jobs
          (id,environment,actor_clerk_user_id,actor_session_id,reverification_id,status,phase)
          VALUES ($1,$2,$3,$4,$5,'queued','queued') RETURNING *`,
          [id, config().environment, actorClerkUserId, auth.sessionId, reverifyId]);
        return sanitize(created.rows[0]);
      } catch (e) {
        if (e.code === '23505') throw makeError('backup_verification_already_running', 409);
        throw e;
      }
    },
    async cancel(id) {
      const result = await pool.query(`UPDATE app_backup_verification_jobs SET cancel_requested=TRUE,updated_at=NOW(),
        status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
        finished_at=CASE WHEN status='queued' THEN NOW() ELSE finished_at END
        WHERE id=$1 AND environment=$2 AND status IN ('queued','running') RETURNING *`, [id, config().environment]);
      if (!result.rows[0]) throw makeError('backup_verification_not_cancellable', 409);
      return sanitize(result.rows[0]);
    },
  });
};
