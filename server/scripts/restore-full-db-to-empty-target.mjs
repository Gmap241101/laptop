/**
 * Emergency offline restore into a NEW EMPTY PostgreSQL DB only. Never switches
 * application DATABASE_URL. This utility does not attempt an in-place restore.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import pg from 'pg';

const fail = (message) => { throw new Error(message); };
const restoreUrl = process.env.EMPTY_RESTORE_DATABASE_URL || '';
const dumpPath = process.env.BACKUP_FILE || '';
const expectedHash = String(process.env.EXPECTED_DUMP_SHA256 || '').trim().toLowerCase();
if (!restoreUrl || !dumpPath || process.env.CONFIRM_EMPTY_DATABASE_RESTORE !== 'YES' ||
    !/^[a-f0-9]{64}$/.test(expectedHash)) {
  fail('EMPTY_RESTORE_DATABASE_URL, BACKUP_FILE, EXPECTED_DUMP_SHA256 and CONFIRM_EMPTY_DATABASE_RESTORE=YES are required.');
}
let target;
try { target = new URL(restoreUrl); }
catch { fail('Invalid PostgreSQL restore target URL.'); }
if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname ||
    !target.username || !target.pathname || target.pathname === '/') fail('Invalid target DB URL.');
const digest = createHash('sha256');
for await (const chunk of createReadStream(dumpPath)) digest.update(chunk);
const actualHash = digest.digest('hex');
if (actualHash !== expectedHash) fail('Backup SHA-256 mismatch: restore aborted before contacting DB.');
const ssl = target.searchParams.get('sslmode') === 'require' ||
  target.hostname.endsWith('.amazonaws.com') || target.hostname.endsWith('.heroku.com');
const client = new pg.Client({ connectionString: restoreUrl,
  ssl: ssl ? { rejectUnauthorized: false } : undefined });
try {
  await client.connect();
  const name = (await client.query('SELECT current_database() AS db')).rows[0].db;
  const existing = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' LIMIT 1");
  if (existing.rows.length) fail('Target database is not empty; refusing to overwrite existing data.');
  const env = { ...process.env,
    PGHOST: target.hostname, PGPORT: target.port || '5432',
    PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password),
    PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
    PGSSLMODE: target.searchParams.get('sslmode') || (ssl ? 'require' : 'prefer'),
  };
  await new Promise((resolve, reject) => {
    const task = spawn('pg_restore', ['--no-password', '--no-owner', '--no-privileges',
      '--exit-on-error', '--single-transaction', '--dbname', name, dumpPath],
    { env, stdio: ['ignore', 'inherit', 'inherit'] });
    task.once('error', reject);
    task.once('close', (code) => code === 0 ? resolve() : reject(new Error(`pg_restore exited ${code}`)));
  });
  const tables = await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
  const migration = await client.query("SELECT count(*)::int AS count FROM schema_migrations");
  if (tables.rows[0].count < 1 || migration.rows[0].count < 38) fail('Restored DB failed basic inventory checks.');
  console.log(JSON.stringify({ ok: true, targetDatabase: name, publicTables: tables.rows[0].count,
    appliedMigrations: migration.rows[0].count, dumpSha256: actualHash,
    note: 'The application DATABASE_URL is unchanged; separately verify records, logins and integration before switching.' }, null, 2));
} finally { await client.end().catch(() => {}); }
