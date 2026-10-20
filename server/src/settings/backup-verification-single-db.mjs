/**
 * Phase 34 P0 zero-additional-resource integrity audit.
 * This is NOT pg_restore, a full backup, or a disaster-recovery proof.
 * PostgreSQL repeatable-read read-only snapshot; never creates a reset proof.
 */
import { randomUUID, createHash } from 'node:crypto';
import { requireRecentReverification } from './backup-verification-jobs.mjs';

const failure = (code, status = 409) => Object.assign(new Error(code), { code, status });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nameSafe = value => /^app_[a-z0-9_]+$|^schema_migrations$/.test(value);
const clean = row => row && ({ id: row.id, status: row.status, phase: row.phase,
  errorCode: row.error_code || null, createdAt: row.created_at, startedAt: row.started_at,
  finishedAt: row.finished_at, updatedAt: row.updated_at, tableCount: row.table_count,
  verificationType: 'logical-read-only', proofActive: false, verifiedUntil: null,
  cancelRequested: row.cancel_requested === true });

export const inspectSingleDatabase = async (pool, options = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    const db = (await client.query(`SELECT current_database() AS name, current_setting('server_version_num')::int AS version`)).rows[0];
    const tableRows = (await client.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows;
    if (!tableRows.length || tableRows.length > 4000) throw failure('logical_verification_invalid_table_set');
    const counts = [];
    for (const {tablename} of tableRows) {
      if (!nameSafe(tablename)) throw failure('logical_verification_unexpected_table_name');
      const result = await client.query(`SELECT count(*)::bigint AS n FROM public."${tablename}"`);
      counts.push([tablename, String(result.rows[0].n)]);
    }
    const constraint = await client.query(`SELECT count(*)::int AS n FROM pg_catalog.pg_constraint
      WHERE connamespace='public'::regnamespace AND NOT convalidated`);
    const indexes = await client.query(`SELECT count(*)::int AS n FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid=t.relnamespace
      WHERE ns.nspname='public' AND NOT i.indisvalid`);
    const migrations = await client.query('SELECT name, checksum FROM schema_migrations ORDER BY name');
    if (Number(constraint.rows[0].n) || Number(indexes.rows[0].n) || !migrations.rows.length) {
      throw failure('logical_verification_schema_inconsistent');
    }
    await client.query('COMMIT');
    return Object.freeze({database: db.name, tableCount: counts.length,
      snapshotSha256: hash({version:db.version, counts, migrations:migrations.rows}),
      checkedAt:new Date().toISOString(), verificationType:'logical-read-only',
      independentRestoreVerified:false});
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
};

export const createSingleDbVerificationJobs = (pool, {env=process.env, inspector=inspectSingleDatabase} = {}) => {
  const environment = env.APP_ENV;
  const running = new Map();
  const ensureMode = () => { if (env.BACKUP_VERIFY_MODE !== 'single-db' || !['staging','production'].includes(environment)) {
    throw failure('backup_verification_single_db_disabled', 503);
  }};
  const row = async id => (await pool.query('SELECT * FROM app_backup_verification_jobs WHERE id=$1 AND environment=$2',
    [id,environment])).rows[0];
  const execute = async id => {
    try {
      const acquired = await pool.query(`UPDATE app_backup_verification_jobs SET status='running',phase='read_only_snapshot',
        started_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='queued' AND cancel_requested=FALSE RETURNING id`,[id]);
      if (!acquired.rows.length) return;
      const result = await inspector(pool);
      // Record an opaque digest, never a backup or restore proof.
      const updated = await pool.query(`UPDATE app_backup_verification_jobs SET status='verified',phase='logical_completed',
        table_count=$2,archive_sha256=$3,finished_at=NOW(),updated_at=NOW(),expires_at=NULL
        WHERE id=$1 AND status='running' AND cancel_requested=FALSE RETURNING id`,
        [id,result.tableCount,result.snapshotSha256]);
      if (!updated.rows.length) throw failure('logical_verification_cancelled');
    } catch(error) {
      await pool.query(`UPDATE app_backup_verification_jobs SET status=CASE WHEN cancel_requested THEN 'cancelled' ELSE 'failed' END,
        phase='finished',error_code=$2,finished_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND status IN ('queued','running')`, [id,String(error.code || 'logical_verification_failed').slice(0,100)]).catch(()=>{});
    } finally { running.delete(id); }
  };
  const recoverStale = async () => {
    // An interrupted web dyno cannot resume an in-flight snapshot. Mark old jobs failed.
    await pool.query(`UPDATE app_backup_verification_jobs SET status='interrupted',phase='interrupted',
      error_code='logical_verification_process_interrupted',finished_at=NOW(),updated_at=NOW()
      WHERE environment=$1 AND status IN ('queued','running') AND created_at < NOW() - INTERVAL '2 minutes'`,[environment]);
  };
  return Object.freeze({
    async status(){return {enabled:env.BACKUP_VERIFY_MODE === 'single-db', mode:'single-db',
      verificationType:'logical-read-only', independentRestoreVerified:false,
      reason:env.BACKUP_VERIFY_MODE === 'single-db'?null:'backup_verification_single_db_disabled'};},
    async latest(){ await recoverStale(); const q=await pool.query(`SELECT * FROM app_backup_verification_jobs
      WHERE environment=$1 AND phase IN ('queued','read_only_snapshot','logical_completed','finished','interrupted')
      ORDER BY created_at DESC LIMIT 1`,[environment]); return clean(q.rows[0]);},
    async get(id){ if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw failure('backup_verification_job_invalid',400);
      await recoverStale(); const found=await row(id); if (!found) throw failure('backup_verification_job_not_found',404);
      return clean(found); },
    async start({auth,actorClerkUserId}) {
      ensureMode();
      const reverifyId=requireRecentReverification(auth,5);
      if (!actorClerkUserId) throw failure('backup_verification_owner_required',403);
      await recoverStale();
      const id=randomUUID();
      try {
        const q=await pool.query(`INSERT INTO app_backup_verification_jobs
          (id,environment,actor_clerk_user_id,actor_session_id,reverification_id,status,phase)
          VALUES($1,$2,$3,$4,$5,'queued','queued') RETURNING *`,
          [id,environment,actorClerkUserId,auth.sessionId,reverifyId]);
        // Intentionally run on current web dyno, without allocating other resources.
        // Lost process => stale-job detection, never false success.
        const work = execute(id); running.set(id,work);
        void work;
        return clean(q.rows[0]);
      } catch(e){ if(e.code==='23505') throw failure('backup_verification_already_running'); throw e; }
    },
    async cancel(id){ ensureMode(); const q=await pool.query(`UPDATE app_backup_verification_jobs
      SET cancel_requested=TRUE,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
      finished_at=CASE WHEN status='queued' THEN NOW() ELSE finished_at END,updated_at=NOW()
      WHERE id=$1 AND environment=$2 AND status IN ('queued','running') RETURNING *`,[id,environment]);
      if (!q.rows.length) throw failure('backup_verification_not_cancellable'); return clean(q.rows[0]); },
    async assertDurableProof() { // Never equate logical checks with isolated restore proof.
      throw failure('backup_verification_independent_restore_required',409);
    }
  });
};
