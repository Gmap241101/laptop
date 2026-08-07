import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from '../src/db/pool.mjs';

const MIGRATION_NAME = /^[0-9]{3,}_[a-z0-9_-]+\.sql$/i;
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const checksum = (content) => createHash('sha256').update(content).digest('hex');
const loadMigrations = async () => {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && MIGRATION_NAME.test(entry.name)).map((entry) => entry.name).sort();
  return Promise.all(files.map(async (name) => {
    const sql = await readFile(join(migrationsDir, name), 'utf8');
    return { name, sql, checksum: checksum(sql) };
  }));
};
const run = async () => {
  const migrations = await loadMigrations();
  if (migrations.length === 0) throw new Error('No SQL migrations were found.');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dept-laptop-rental-schema-migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const appliedResult = await client.query('SELECT name, checksum FROM schema_migrations ORDER BY name');
    const applied = new Map(appliedResult.rows.map((row) => [row.name, String(row.checksum).trim()]));
    let appliedCount = 0;
    for (const migration of migrations) {
      const previousChecksum = applied.get(migration.name);
      if (previousChecksum) {
        if (previousChecksum !== migration.checksum) throw new Error(`Migration checksum mismatch for ${migration.name}; never edit an applied migration.`);
        console.log(`[migration] already applied: ${migration.name}`);
        continue;
      }
      console.log(`[migration] applying: ${migration.name}`);
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
      appliedCount += 1;
    }
    await client.query('COMMIT');
    console.log(`[migration] complete; newly applied=${appliedCount}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};
try { await run(); }
catch (error) { console.error('[migration] failed', { name: error?.name, code: error?.code, message: error?.message }); process.exitCode = 1; }
finally { await closePool(); }
