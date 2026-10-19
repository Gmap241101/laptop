/**
 * Offline operator gate for destructive system-data resets.
 * Never run this as a web request or during Heroku release.
 *
 * Required: DATABASE_URL (source); RESTORE_TEST_DATABASE_URL (an existing,
 * freshly created EMPTY disposable database); BACKUP_FILE (new local path);
 * CONFIRM_DISPOSABLE_RESTORE_DB=YES. Requires pg_dump and pg_restore installed.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import pg from 'pg';
import { RESET_BACKUP_PROOF_KEY } from '../src/settings/system-reset-backup-proof.mjs';

const { Client } = pg;
const sourceUrl = process.env.DATABASE_URL;
const restoreUrl = process.env.RESTORE_TEST_DATABASE_URL;
const backupFile = process.env.BACKUP_FILE;
const confirmed = process.env.CONFIRM_DISPOSABLE_RESTORE_DB === 'YES';
if (!sourceUrl || !restoreUrl || !backupFile || !confirmed) {
  throw new Error('DATABASE_URL, RESTORE_TEST_DATABASE_URL, BACKUP_FILE and CONFIRM_DISPOSABLE_RESTORE_DB=YES are required.');
}
const source = new URL(sourceUrl);
const target = new URL(restoreUrl);
if (!['postgres:', 'postgresql:'].includes(source.protocol) || !['postgres:', 'postgresql:'].includes(target.protocol)) {
  throw new Error('Both database URLs must use PostgreSQL.');
}
if (source.pathname === target.pathname && source.hostname === target.hostname && (source.port || '5432') === (target.port || '5432')) {
  throw new Error('The restore target must not be the source database.');
}
const tls = (url) => url.searchParams.get('sslmode') === 'require' ||
  (url.hostname.endsWith('.amazonaws.com') || url.hostname.endsWith('.heroku.com'));
const connect = (url) => new Client({ connectionString: url.href,
  ssl: tls(url) ? { rejectUnauthorized: false } : undefined });
// Passing connection URLs on the process command line can expose credentials.
const pgenv = (url) => ({ ...process.env,
  PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGSSLMODE: url.searchParams.get('sslmode') || (tls(url) ? 'require' : 'prefer'),
});
const run = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env, stdio: ['ignore', 'inherit', 'inherit'] });
  child.once('error', reject);
  child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
});
const tableList = async (client) => (await client.query(`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
`)).rows.map((row) => row.tablename);
const quote = (name) => '"' + String(name).replaceAll('"', '""') + '"';
const countTables = async (client, names) => {
  const counts = {};
  for (const name of names) {
    const result = await client.query(`SELECT count(*)::text AS n FROM public.${quote(name)}`);
    counts[name] = result.rows[0].n;
  }
  return counts;
};
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const hashFile = async (path) => {
  const hasher = createHash('sha256');
  for await (const chunk of createReadStream(path)) hasher.update(chunk);
  return hasher.digest('hex');
};
const sourceClient = connect(source);
const targetClient = connect(target);
let completed = false;
try {
  await sourceClient.connect();
  await targetClient.connect();
  const [sourceName, targetName] = await Promise.all([
    sourceClient.query('SELECT current_database() AS db'),
    targetClient.query('SELECT current_database() AS db'),
  ]);
  if (sourceName.rows[0].db === targetName.rows[0].db) {
    throw new Error('Source and restore database names must differ, even across hosts.');
  }
  if ((await tableList(targetClient)).length !== 0) {
    throw new Error('Restore target is not empty; refusing pg_restore to avoid modifying existing data.');
  }
  try { await stat(backupFile); throw new Error('BACKUP_FILE already exists; refusing overwrite.'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await run('pg_dump', ['--no-password', '--format=custom', '--file', backupFile], pgenv(source));
  await run('pg_restore', ['--no-password', '--no-owner', '--no-privileges', '--exit-on-error',
    '--single-transaction', '--dbname', targetName.rows[0].db, backupFile], pgenv(target));
  const expectedTables = await tableList(sourceClient);
  const actualTables = await tableList(targetClient);
  if (JSON.stringify(expectedTables) !== JSON.stringify(actualTables)) {
    throw new Error('Restored database table inventory differs from source.');
  }
  const expectedCounts = await countTables(sourceClient, expectedTables);
  const actualCounts = await countTables(targetClient, actualTables);
  if (JSON.stringify(expectedCounts) !== JSON.stringify(actualCounts)) {
    throw new Error('Restored table counts differ from source; re-run during a stable database window.');
  }
  // A pg_restore --single-transaction run exits nonzero on constraint errors.
  // Verification does not modify the restored database after restore.
  const digest = await hashFile(backupFile);
  const verifiedAt = new Date().toISOString();
  const evidence = {
    type: 'full-pg-dump-isolated-restore-v1', databaseName: sourceName.rows[0].db,
    verifiedAt, dumpSha256: digest,
    tableCountsSha256: hash(JSON.stringify(actualCounts)), verifiedTableCount: actualTables.length,
  };
  await sourceClient.query(`INSERT INTO app_runtime_metadata (key, value, updated_at)
    VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
  [RESET_BACKUP_PROOF_KEY, JSON.stringify(evidence)]);
  completed = true;
  console.log(JSON.stringify({ success: true, verifiedAt,
    sourceDatabase: sourceName.rows[0].db, restoredDatabase: targetName.rows[0].db,
    tableCount: actualTables.length, backupSha256: digest, validForMinutes: 60 }, null, 2));
} finally {
  await Promise.allSettled([sourceClient.end(), targetClient.end()]);
  if (!completed) console.error('[reset-backup-verify] No proof recorded. Destructive reset remains blocked.');
}
