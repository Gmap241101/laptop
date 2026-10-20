/**
 * Read-only SQL integration gate for the Phase 34 scoped JSON restore preview.
 * Intended only for the isolated local database created by the full backup/
 * pg_restore verification; NEVER use against staging or production.
 *
 * RESTORE_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/rental_staging_restore_...
 * node server/scripts/verify-scoped-restore-preview-on-isolated-db.mjs
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { createScopedJsonRestore } from '../src/settings/system-data-restore.mjs';

const connectionString = process.env.RESTORE_TEST_DATABASE_URL;
if (!connectionString) throw new Error('RESTORE_TEST_DATABASE_URL is required.');
const url = new URL(connectionString);
const name = decodeURIComponent(url.pathname.slice(1));
if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^rental_staging_restore_[a-z0-9_]+$/i.test(name)) {
  throw new Error('Refusing to connect: isolated local rental_staging_restore_* database required.');
}

const pool = new pg.Pool({ connectionString, max: 2 });
const scopes = [
  { scope: 'site', entries: [['site', 'app_site_content_documents']] },
  { scope: 'boards', entries: [['boardConfigs', 'app_board_configs'], ['faqCategories', 'app_faq_categories'], ['boardPosts', 'app_board_posts']] },
  { scope: 'assets', entries: [['categories', 'app_asset_categories'], ['items', 'app_rental_assets']] },
  { scope: 'organization', entries: [['directory', 'app_member_directory_entries']] },
];
const allowed = ['site-settings', 'rental-config', 'home', 'popup', 'footer', 'terms'];
let runningScope = 'bootstrap';
try {
  const schemaMigrations = (await pool.query('SELECT name, checksum FROM schema_migrations ORDER BY name')).rows;
  const restore = createScopedJsonRestore(pool);
  const results = [];
  for (const { scope, entries } of scopes) {
    runningScope = scope;
    const snapshot = {
      format: 'mk-rental-postgresql-backup-v1', authority: 'postgresql',
      exportedAt: new Date().toISOString(), schemaMigrations,
      content: { site: [], boardConfigs: [], faqCategories: [], boardPosts: [] },
      assets: { categories: [], items: [] },
      members: { personalDataIncluded: true, directory: [] },
    };
    let expected = 0;
    for (const [field, table] of entries) {
      // Table identifiers come from the fixed static allowlist above, not input.
      const rows = table === 'app_site_content_documents'
        ? (await pool.query('SELECT * FROM app_site_content_documents WHERE domain = ANY($1::text[])', [allowed])).rows
        : (await pool.query(`SELECT * FROM "${table}"`)).rows;
      if (scope === 'site' || scope === 'boards') snapshot.content[field] = rows;
      if (scope === 'assets') snapshot.assets[field] = rows;
      if (scope === 'organization') snapshot.members[field] = rows;
      expected += rows.length;
    }
    if (expected > 2500) throw Object.assign(new Error('The scope exceeds the 2,500-row restore limit.'), { code: 'scope_row_limit_exceeded' });
    for (const mode of ['addMissing', 'overwrite']) {
      const preview = await restore.preview({ snapshot, scopes: [scope], mode });
      assert.equal(preview.totalRows, expected);
      assert.equal(preview.willInsert, 0, 'Exporting from the same local DB must have no missing rows');
      assert.equal(preview.willSkip, mode === 'addMissing' ? expected : 0);
      assert.equal(preview.willUpdate, mode === 'overwrite' ? expected : 0);
      assert.match(preview.previewSha256, /^[a-f0-9]{64}$/);
    }
    results.push({ scope, rows: expected, modes: ['addMissing', 'overwrite'], status: 'PASS' });
  }
  console.log(JSON.stringify({ success: true, database: name, mode: 'read-only-preview', results }, null, 2));
} catch (error) {
  console.error('[isolated-restore-preview] FAIL', {
    scope: runningScope, code: String(error?.code || 'integration_failure').slice(0, 90),
    name: String(error?.name || 'Error').slice(0, 90),
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
