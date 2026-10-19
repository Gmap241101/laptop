import { createHash, randomUUID } from 'node:crypto';
import { RESET_BACKUP_PROOF_KEY, describeResetBackupProof } from './system-reset-backup-proof.mjs';

export const RESTORE_CONFIRM_TEXT = '백업 데이터 복원';
export const RESTORE_MODES = Object.freeze(['addMissing', 'overwrite']);
export const RESTORE_SCOPES = Object.freeze(['site', 'boards', 'assets', 'organization']);
export const RESTORE_MAX_ROWS = 2500;
const allowedSiteDomains = new Set(['site-settings', 'rental-config', 'home', 'popup', 'footer', 'terms']);
const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status });
const quote = (name) => `"${String(name).replaceAll('"', '""')}"`;
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const hasRedaction = (value) => value === '[redacted]' || (Array.isArray(value) && value.some(hasRedaction)) ||
  (isObject(value) && Object.values(value).some(hasRedaction));

const tableDefinitions = Object.freeze({
  site: [{ name: 'app_site_content_documents', key: ['domain', 'document_key'], get: (s) =>
    s.content.site.filter((row) => allowedSiteDomains.has(row.domain)) }],
  boards: [
    { name: 'app_board_configs', key: ['board_type'], get: (s) => s.content.boardConfigs },
    { name: 'app_faq_categories', key: ['category_id'], get: (s) => s.content.faqCategories },
    { name: 'app_board_posts', key: ['post_id'], get: (s) => s.content.boardPosts },
  ],
  assets: [
    { name: 'app_asset_categories', key: ['id'], identity: true, get: (s) => s.assets.categories },
    { name: 'app_rental_assets', key: ['asset_id'], get: (s) => s.assets.items },
  ],
  organization: [{ name: 'app_member_directory_entries', key: ['identity_key'], get: (s) => s.members.directory }],
});

export const normalizeRestoreRequest = ({ snapshot, scopes, mode } = {}) => {
  if (!isObject(snapshot) || snapshot.format !== 'mk-rental-postgresql-backup-v1' ||
      snapshot.authority !== 'postgresql' || !Array.isArray(snapshot.schemaMigrations)) {
    throw fail('system_restore_backup_format_invalid');
  }
  if (!Number.isFinite(Date.parse(snapshot.exportedAt || ''))) throw fail('system_restore_backup_date_invalid');
  if (!RESTORE_MODES.includes(mode)) throw fail('system_restore_mode_invalid');
  if (!Array.isArray(scopes) || !scopes.length || scopes.some((scope) => !RESTORE_SCOPES.includes(scope)) ||
      new Set(scopes).size !== scopes.length) throw fail('system_restore_scopes_invalid');
  if (!snapshot.schemaMigrations.some((migration) => String(migration.name).startsWith('038_'))) {
    throw fail('system_restore_migration_baseline_missing', 409);
  }
  const migrationNames = new Set();
  for (const migration of snapshot.schemaMigrations) {
    if (!/^[a-z0-9_.-]+\.sql$/i.test(String(migration?.name || '')) ||
        !/^[a-f0-9]{64}$/.test(String(migration?.checksum || '')) || migrationNames.has(migration.name)) {
      throw fail('system_restore_backup_migrations_invalid');
    }
    migrationNames.add(migration.name);
  }
  const tables = [];
  for (const scope of RESTORE_SCOPES.filter((entry) => scopes.includes(entry))) {
    if (scope === 'site' || scope === 'boards') {
      if (!isObject(snapshot.content) || !Array.isArray(snapshot.content.site) ||
          !Array.isArray(snapshot.content.boardConfigs) || !Array.isArray(snapshot.content.faqCategories) ||
          !Array.isArray(snapshot.content.boardPosts)) throw fail('system_restore_backup_scope_missing');
    }
    if (scope === 'assets' && (!isObject(snapshot.assets) || !Array.isArray(snapshot.assets.categories) || !Array.isArray(snapshot.assets.items))) {
      throw fail('system_restore_backup_scope_missing');
    }
    if (scope === 'organization' && (!isObject(snapshot.members) || snapshot.members.personalDataIncluded !== true ||
        !Array.isArray(snapshot.members.directory))) throw fail('system_restore_personal_data_required', 409);
    for (const definition of tableDefinitions[scope]) {
      const rows = definition.get(snapshot);
      const seen = new Set();
      for (const row of rows) {
        if (!isObject(row) || hasRedaction(row)) throw fail('system_restore_redacted_or_invalid_row');
        for (const key of definition.key) {
          if (row[key] === null || row[key] === undefined || row[key] === '' ||
              (definition.identity && (!Number.isSafeInteger(Number(row[key])) || Number(row[key]) < 1))) {
            throw fail('system_restore_primary_key_invalid');
          }
        }
        const unique = JSON.stringify(definition.key.map((key) => String(row[key])));
        if (seen.has(unique)) throw fail('system_restore_duplicate_primary_key');
        seen.add(unique);
      }
      tables.push({ ...definition, rows, scope });
    }
  }
  const totalRows = tables.reduce((sum, table) => sum + table.rows.length, 0);
  if (totalRows > RESTORE_MAX_ROWS) throw fail('system_restore_too_many_rows', 413);
  return { snapshot, scopes: RESTORE_SCOPES.filter((scope) => scopes.includes(scope)), mode, tables, totalRows,
    snapshotHash: sha(snapshot) };
};

const schemaCheck = async (client, request) => {
  const current = await client.query('SELECT name, checksum FROM schema_migrations ORDER BY name');
  const applied = new Map(current.rows.map((row) => [row.name, String(row.checksum).trim()]));
  if (!applied.has('039_phase34_p0_scoped_json_restore_audit.sql')) throw fail('system_restore_migration_039_required', 409);
  for (const migration of request.snapshot.schemaMigrations) {
    if (applied.get(migration.name) !== String(migration.checksum).trim()) throw fail('system_restore_migration_mismatch', 409);
  }
  return applied.size;
};

const tableColumns = async (client, table) => {
  const result = await client.query(`SELECT column_name, udt_name, is_generated FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table.name]);
  if (!result.rows.length) throw fail('system_restore_table_not_found', 409);
  const mapping = new Map(result.rows.map((row) => [row.column_name, row]));
  const keys = new Set(table.key);
  for (const key of keys) if (!mapping.has(key)) throw fail('system_restore_table_schema_mismatch', 409);
  const provided = new Set();
  for (const row of table.rows) for (const column of Object.keys(row)) {
    if (!mapping.has(column) || mapping.get(column).is_generated !== 'NEVER') throw fail('system_restore_unknown_column', 409);
    provided.add(column);
  }
  const columns = [...mapping.keys()].filter((column) => provided.has(column));
  if (table.rows.some((row) => columns.some((column) => !Object.hasOwn(row, column)))) {
    throw fail('system_restore_inconsistent_columns');
  }
  return { columns, metadata: mapping };
};

const existingCounts = async (client, table) => {
  let existing = 0;
  const checksums = [];
  const keys = table.key;
  for (let offset = 0; offset < table.rows.length; offset += 100) {
    const batch = table.rows.slice(offset, offset + 100);
    const params = batch.flatMap((row) => keys.map((column) => row[column]));
    const tuples = batch.map((_, index) => `(${keys.map((__, i) => `$${index * keys.length + i}`).join(',')})`).join(',');
    const sql = `SELECT ${keys.map(quote).join(',')}, row_to_json(t)::text AS restore_row FROM ${quote(table.name)} t WHERE (${keys.map(quote).join(',')}) IN (${tuples})`;
    const rows = (await client.query(sql, params)).rows;
    existing += rows.length;
    checksums.push(...rows.map((row) => sha(row.restore_row || row)));
  }
  checksums.sort();
  return { existing, existingSha256: sha(checksums) };
};

const previewOnClient = async (client, request) => {
  await schemaCheck(client, request);
  const counts = [];
  for (const table of request.tables) {
    const { columns, metadata } = await tableColumns(client, table);
    const { existing, existingSha256 } = await existingCounts(client, table);
    counts.push({ scope: table.scope, table: table.name, rows: table.rows.length, existing, existingSha256,
      newRows: table.rows.length - existing, writableColumns: columns, metadata });
  }
  const proofRow = await client.query('SELECT value, current_database() AS database_name FROM app_runtime_metadata WHERE key=$1', [RESET_BACKUP_PROOF_KEY]);
  const restoreProof = describeResetBackupProof(proofRow.rows[0]?.value, proofRow.rows[0]?.database_name || '');
  const safeCounts = counts.map(({ scope, table, rows, existing, newRows }) => ({ scope, table, rows, existing, newRows }));
  const fingerprint = sha({ snapshotHash: request.snapshotHash, scopes: request.scopes, mode: request.mode,
    counts: counts.map(({ metadata, writableColumns, ...safe }) => safe), databaseName: proofRow.rows[0]?.database_name || '' });
  return { authority: 'postgresql', mode: request.mode, scopes: request.scopes, snapshotSha256: request.snapshotHash,
    previewSha256: fingerprint, totalRows: request.totalRows, totals: safeCounts,
    willInsert: safeCounts.reduce((n, row) => n + row.newRows, 0),
    willUpdate: request.mode === 'overwrite' ? safeCounts.reduce((n, row) => n + row.existing, 0) : 0,
    willSkip: request.mode === 'addMissing' ? safeCounts.reduce((n, row) => n + row.existing, 0) : 0,
    deletesRows: false, restoreProof, internalCounts: counts };
};

const insertRows = async (client, table, detail, mode) => {
  if (!table.rows.length) return 0;
  const { writableColumns: columns, metadata } = detail;
  let changes = 0;
  const colList = columns.map(quote).join(',');
  const conflict = `(${table.key.map(quote).join(',')})`;
  const updateCols = columns.filter((col) => !table.key.includes(col));
  const conflictClause = mode === 'addMissing' || !updateCols.length
    ? `ON CONFLICT ${conflict} DO NOTHING`
    : `ON CONFLICT ${conflict} DO UPDATE SET ${updateCols.map((c) => `${quote(c)}=EXCLUDED.${quote(c)}`).join(',')}`;
  const perBatch = Math.min(50, Math.floor(3000 / Math.max(1, columns.length)));
  for (let offset = 0; offset < table.rows.length; offset += perBatch) {
    const rows = table.rows.slice(offset, offset + perBatch);
    const params = rows.flatMap((row) => columns.map((column) => {
      const value = row[column];
      return (metadata.get(column).udt_name === 'jsonb' || metadata.get(column).udt_name === 'json') && value != null
        ? JSON.stringify(value) : value;
    }));
    const tuples = rows.map((_, index) => `(${columns.map((__, i) => `$${index * columns.length + i}`).join(',')})`).join(',');
    const overriding = table.identity ? ' OVERRIDING SYSTEM VALUE' : '';
    const result = await client.query(`INSERT INTO ${quote(table.name)} (${colList})${overriding} VALUES ${tuples} ${conflictClause}`, params);
    changes += Number(result.rowCount || 0);
  }
  return changes;
};

export const createScopedJsonRestore = (pool) => {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('PostgreSQL pool required.');
  return Object.freeze({
    async preview(payload) {
      const request = normalizeRestoreRequest(payload);
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const plan = await previewOnClient(client, request);
        await client.query('COMMIT');
        const { internalCounts, ...publicResult } = plan;
        return publicResult;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
    async execute({ actorClerkUserId, previewSha256, confirmText, ...payload }) {
      if (confirmText !== RESTORE_CONFIRM_TEXT) throw fail('system_restore_confirmation_invalid');
      if (!/^[a-f0-9]{64}$/.test(previewSha256 || '')) throw fail('system_restore_preview_required', 409);
      if (!actorClerkUserId) throw fail('system_restore_actor_required', 403);
      const request = normalizeRestoreRequest(payload);
      const client = await pool.connect();
      let started = false;
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        started = true;
        await client.query("SELECT pg_advisory_xact_lock(hashtext('phase34-system-data-reset'))");
        const plan = await previewOnClient(client, request);
        if (plan.previewSha256 !== previewSha256) throw fail('system_restore_preview_stale', 409);
        const locked = await client.query('SELECT value, current_database() AS database_name FROM app_runtime_metadata WHERE key=$1 FOR UPDATE', [RESET_BACKUP_PROOF_KEY]);
        if (!describeResetBackupProof(locked.rows[0]?.value, locked.rows[0]?.database_name || '').valid) {
          throw fail('system_restore_verified_backup_required', 409);
        }
        let changed = 0;
        for (const table of request.tables) {
          const detail = plan.internalCounts.find((item) => item.table === table.name);
          changed += await insertRows(client, table, detail, request.mode);
        }
        if (request.scopes.includes('assets')) {
          // Explicit identity imports must advance the category sequence for future inserts.
          await client.query(`SELECT setval(pg_get_serial_sequence('app_asset_categories','id'),
            GREATEST((SELECT COALESCE(MAX(id),0) FROM app_asset_categories), 1),
            EXISTS (SELECT 1 FROM app_asset_categories))`);
        }
        // Successful restoration consumes the verified whole-database recovery point.
        await client.query('DELETE FROM app_runtime_metadata WHERE key=$1', [RESET_BACKUP_PROOF_KEY]);
        await client.query(`INSERT INTO app_system_data_restore_audit
          (restore_id, actor_clerk_user_id, action, mode, scopes, snapshot_sha256, preview_sha256, affected_rows, detail)
          VALUES ($1,$2,'apply',$3,$4::jsonb,$5,$6,$7,$8::jsonb)`,
        [randomUUID(), actorClerkUserId, request.mode, JSON.stringify(request.scopes), request.snapshotHash,
          plan.previewSha256, changed, JSON.stringify({ inserted: plan.willInsert, updated: plan.willUpdate, skipped: plan.willSkip })]);
        await client.query('COMMIT');
        return { authority: 'postgresql', success: true, mode: request.mode, scopes: request.scopes,
          snapshotSha256: request.snapshotHash, changedRows: changed, expected: {
            insert: plan.willInsert, update: plan.willUpdate, skip: plan.willSkip,
          }, completedAt: new Date().toISOString() };
      } catch (error) {
        if (started) await client.query('ROLLBACK').catch(() => {});
        // Failure record contains no source payload or personal data. Best effort only.
        try {
          await client.query(`INSERT INTO app_system_data_restore_audit
            (restore_id, actor_clerk_user_id, action, mode, scopes, snapshot_sha256, preview_sha256, detail)
            VALUES ($1,$2,'failed',$3,$4::jsonb,$5,$6,$7::jsonb)`,
          [randomUUID(), actorClerkUserId, request.mode, JSON.stringify(request.scopes), request.snapshotHash,
            previewSha256, JSON.stringify({ errorCode: error?.code || 'restore_failed' })]);
        } catch { /* Never mask the original error. */ }
        throw error;
      } finally { client.release(); }
    },
  });
};
