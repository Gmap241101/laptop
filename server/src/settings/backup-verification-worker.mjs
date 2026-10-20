import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { RESET_BACKUP_PROOF_KEY } from './system-reset-backup-proof.mjs';
import { getWebBackupConfiguration } from './backup-verification-runtime.mjs';
import { assertDisposableTarget } from './backup-verification-guard.mjs';
import { createEncryptedS3ArchiveStore, sha256File, encryptArchive, decryptArchive } from './backup-verification-object-store.mjs';

const quote = (name) => '"' + String(name).replaceAll('"', '""') + '"';
const databaseEnv = (value) => {
  const url = new URL(value);
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: url.searchParams.get('sslmode') || 'require',
    PGCONNECT_TIMEOUT: '15' };
};
const newClient = (connectionString) => new pg.Client({ connectionString,
  ssl: new URL(connectionString).searchParams.get('sslmode') === 'disable' ? false : { rejectUnauthorized: false } });
const counts = async (client) => {
  const names = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map(x => x.tablename);
  if (!names.length) throw new Error('backup_verification_source_empty');
  const entries = {};
  for (const name of names) entries[name] = (await client.query(`SELECT count(*)::text AS n FROM public.${quote(name)}`)).rows[0].n;
  return entries;
};
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const createVerificationWorker = (pool, { env = process.env, objectStoreFactory = createEncryptedS3ArchiveStore, runner } = {}) => {
  const config = getWebBackupConfiguration(env);
  if (!config.ready) throw new Error('backup_verification_infrastructure_not_ready');
  const store = objectStoreFactory(config);
  const checkCancel = async (id) => {
    const r = await pool.query('SELECT cancel_requested FROM app_backup_verification_jobs WHERE id=$1', [id]);
    if (r.rows[0]?.cancel_requested) throw new Error('backup_verification_cancelled');
  };
  const phase = async (id, value) => {
    await checkCancel(id);
    await pool.query(`UPDATE app_backup_verification_jobs SET phase=$2,updated_at=NOW(),heartbeat_at=NOW(),lease_until=NOW()+INTERVAL '3 minutes' WHERE id=$1 AND status='running'`, [id,value]);
  };
  const runCommand = runner || (async (cmd, args, connectionString, id) => {
    const abort = new AbortController();
    let running = true;
    const watcher = setInterval(() => { if (running) {
      void checkCancel(id).catch((e) => { if (e.message === 'backup_verification_cancelled') abort.abort(); });
      void pool.query(`UPDATE app_backup_verification_jobs SET heartbeat_at=NOW(),lease_until=NOW()+INTERVAL '3 minutes' WHERE id=$1 AND status='running'`, [id]).catch(() => abort.abort());
    } }, 2000);
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(cmd,args,{env:databaseEnv(connectionString),stdio:['ignore','ignore','pipe'],signal:abort.signal});
        let stderr = '';
        child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-1024); });
        child.once('error', () => reject(new Error('backup_verification_pg_command_failed')));
        child.once('close', code => code === 0 ? resolve() : reject(new Error('backup_verification_pg_command_failed')));
      });
    } catch (error) {
      if (abort.signal.aborted) throw new Error('backup_verification_cancelled');
      throw error;
    } finally { running = false; clearInterval(watcher); }
  });
  const runJob = async (job) => {
    const dir = await mkdtemp(join(tmpdir(), 'rental-backup-'));
    const raw = join(dir,'source.dump'); const cipher = join(dir,'encrypted.bin');
    const encryptedRead = join(dir,'readback.bin'); const verified = join(dir,'verified.dump');
    const source = newClient(config.source), target = newClient(config.target);
    // Maintain job lease during encryption and network transfers too, not just
    // pg_dump/pg_restore subprocesses. A stale lease must never be mistaken
    // for a crashed worker while a large archive is uploading.
    const leasePulse = setInterval(() => {
      void pool.query(`UPDATE app_backup_verification_jobs SET heartbeat_at=NOW(),lease_until=NOW()+INTERVAL '3 minutes'
        WHERE id=$1 AND status='running'`, [job.id]).catch(() => {});
    }, 10000);
    let sourceTransaction = false;
    try {
      await source.connect(); await target.connect();
      await phase(job.id,'target_check');
      const { sourceName, targetName } = await assertDisposableTarget(source,target,config);
      await phase(job.id,'snapshot');
      await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'); sourceTransaction = true;
      const expected = await counts(source);
      const snapshotId = (await source.query('SELECT pg_export_snapshot() AS snap')).rows[0].snap;
      await phase(job.id,'backup');
      await runCommand(env.PG_DUMP_BIN || 'pg_dump', ['--no-password','--format=custom','--snapshot',snapshotId,'--file',raw], config.source,job.id);
      await source.query('COMMIT'); sourceTransaction = false;
      if ((await stat(raw)).size <= 0 || (await stat(raw)).size > config.maximumBytes) throw new Error('backup_archive_size_invalid');
      const plainSha256 = await sha256File(raw);
      await phase(job.id,'encrypt');
      const encrypted = await encryptArchive(raw,cipher,config.key);
      const key = `phase34/${config.environment}/${job.id}.pgdump.aesgcm`;
      await phase(job.id,'store');
      await store.upload(key,cipher,plainSha256);
      await store.verifyPresence(key,encrypted.sha256);
      // Readback is essential: a successful upload response does not mean a
      // disaster-recovery archive can actually be retrieved and decrypted.
      await phase(job.id,'readback');
      await store.download(key,encryptedRead,encrypted.sha256);
      if (await decryptArchive(encryptedRead,verified,config.key) !== plainSha256) throw new Error('backup_archive_plain_integrity_failed');
      await phase(job.id,'isolate');
      await assertDisposableTarget(source,target,config);
      // Target marker lives outside public, is never dropped, and target role
      // is deliberately not authorized to create/drop backup_guard objects.
      await target.query('DROP SCHEMA IF EXISTS public CASCADE');
      await target.query('CREATE SCHEMA public');
      await phase(job.id,'restore');
      await runCommand(env.PG_RESTORE_BIN || 'pg_restore', ['--no-password','--no-owner','--no-privileges',
        '--exit-on-error','--single-transaction','--clean','--if-exists','--dbname',targetName,verified],config.target,job.id);
      await phase(job.id,'integrity');
      const actual = await counts(target);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('backup_verification_snapshot_mismatch');
      await store.verifyPresence(key,encrypted.sha256);
      await phase(job.id,'proof');
      // Serialized evidence is intentionally compatible with the existing
      // full DB reset + JSON selective restore gate, with stronger v2 metadata.
      const evidence = {
        type: 'full-pg-dump-isolated-restore-v2',databaseName:sourceName,
        verifiedAt:new Date().toISOString(), dumpSha256:plainSha256,
        tableCountsSha256:digest(actual),verifiedTableCount:Object.keys(actual).length,
        environment:config.environment,jobId:job.id,objectKey:key,objectSha256:encrypted.sha256,
      };
      const txn = await pool.connect();
      try {
        await txn.query('BEGIN');
        await txn.query('SELECT id FROM app_backup_verification_jobs WHERE id=$1 FOR UPDATE',[job.id]);
        await checkCancel(job.id);
        await txn.query(`INSERT INTO app_runtime_metadata (key,value,updated_at) VALUES($1,$2::jsonb,NOW())
          ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[RESET_BACKUP_PROOF_KEY,JSON.stringify(evidence)]);
        await txn.query(`UPDATE app_backup_verification_jobs SET status='verified',phase='completed',archive_key=$2,
          archive_sha256=$3,encrypted_sha256=$4,table_count=$5,expires_at=NOW()+INTERVAL '60 minutes',
          finished_at=NOW(),updated_at=NOW(),heartbeat_at=NOW(),lease_until=NULL WHERE id=$1`,
          [job.id,key,plainSha256,encrypted.sha256,Object.keys(actual).length]);
        await txn.query('COMMIT');
      } catch(e) { await txn.query('ROLLBACK'); throw e; } finally { txn.release(); }
      return true;
    } catch(e) {
      const cancelled = e.message === 'backup_verification_cancelled';
      await pool.query(`UPDATE app_backup_verification_jobs SET status=$2,phase=$2,
        error_code=$3,finished_at=NOW(),updated_at=NOW(),lease_until=NULL WHERE id=$1 AND status='running'`,
        [job.id,cancelled?'cancelled':'failed',cancelled?'backup_verification_cancelled':
          /^[a-z_]+$/.test(e.message) ? e.message.slice(0,90) : 'backup_verification_failed']).catch(() => {});
      console.error('[backup-verify] job failed',{jobId:job.id,code:cancelled?'cancelled':'verification_failed'});
      return false;
    } finally {
      clearInterval(leasePulse);
      if (sourceTransaction) await source.query('ROLLBACK').catch(() => {});
      await Promise.allSettled([source.end(),target.end()]);
      await rm(dir,{recursive:true,force:true}).catch(() => {});
    }
  };
  const tick = async () => {
    await pool.query(`UPDATE app_backup_verification_jobs SET status='interrupted',phase='interrupted',
      error_code='backup_verification_worker_lost',finished_at=NOW(),lease_until=NULL,updated_at=NOW()
      WHERE environment=$1 AND status='running' AND lease_until < NOW()`,[config.environment]);
    const picked = await pool.query(`UPDATE app_backup_verification_jobs SET status='running',phase='preparing',
      started_at=NOW(),heartbeat_at=NOW(),lease_until=NOW()+INTERVAL '3 minutes',updated_at=NOW()
      WHERE id=(SELECT id FROM app_backup_verification_jobs WHERE environment=$1 AND status='queued'
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[config.environment]);
    if (!picked.rows[0]) return false;
    await runJob(picked.rows[0]); return true;
  };
  return Object.freeze({ tick, runJob });
};
