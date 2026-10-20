import assert from 'node:assert/strict';
import { createScopedJsonRestore, normalizeRestoreRequest } from '../../server/src/settings/system-data-restore.mjs';
import { createSystemDataService } from '../../server/src/settings/system-data-service.mjs';

const migration = { name: '038_phase34_footer_reset_recovery_inquiry_reset.sql', checksum: '1'.repeat(64) };
const version039 = { name: '039_phase34_p0_scoped_json_restore_audit.sql', checksum: '2'.repeat(64) };
const fixture = (site = [{ domain: 'home', document_key: 'homePage/config', payload: { value: 2 }, enabled: true }]) => ({
  format: 'mk-rental-postgresql-backup-v1', authority: 'postgresql', exportedAt: '2026-10-19T00:00:00.000Z',
  schemaMigrations: [migration],
  content: { site, boardConfigs: [], boardPosts: [], faqCategories: [] },
  assets: { categories: [], items: [] },
});
const proof = { type: 'full-pg-dump-isolated-restore-v1', databaseName: 'staging',
  verifiedAt: new Date().toISOString(), dumpSha256: 'a'.repeat(64), tableCountsSha256: 'b'.repeat(64), verifiedTableCount: 35 };
const schema = { app_site_content_documents: ['domain', 'document_key', 'payload', 'enabled'] };
const pk = (row) => `${row.domain}:${row.document_key}`;
const clone = (value) => structuredClone(value);
const makePool = ({ missingProof = false, failOnInsert = false } = {}) => {
  let source = new Map([['home:homePage/config', { domain: 'home', document_key: 'homePage/config', payload: { value: 1 }, enabled: true }]]);
  let currentProof = missingProof ? null : clone(proof);
  let active = null;
  let failedOnce = false;
  const audit = [];
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql).trim();
      queries.push(text);
      // pg rejects $0 with SQLSTATE 42P02. Validate actual bind-marker
      // numbering here rather than letting the mock silently accept it.
      const placeholders = [...text.matchAll(/\$(\d+)\b/g)].map((match) => Number(match[1]));
      if (placeholders.length) {
        const used = [...new Set(placeholders)].sort((a, b) => a - b);
        assert.deepEqual(used, Array.from({ length: params.length }, (_, index) => index + 1),
          `Invalid PostgreSQL parameter numbering in ${text.slice(0, 140)}`);
      } else {
        assert.equal(params.length, 0, `Unexpected values without SQL placeholders in ${text.slice(0, 140)}`);
      }
      if (text.startsWith('BEGIN')) { active = { data: clone([...source.entries()]), proof: clone(currentProof) }; return { rows: [] }; }
      if (text === 'COMMIT') { active = null; return { rows: [] }; }
      if (text === 'ROLLBACK') {
        if (active) { source = new Map(active.data); currentProof = active.proof; }
        active = null; return { rows: [] };
      }
      if (text.includes('FROM schema_migrations')) return { rows: [migration, version039] };
      if (text.includes('FROM information_schema.columns')) {
        return { rows: (schema[params[0]] || ['id']).map((column_name) => ({ column_name,
          udt_name: column_name === 'payload' ? 'jsonb' : 'text', is_generated: 'NEVER' })) };
      }
      if (text.startsWith('SELECT') && text.includes('FROM "app_site_content_documents"')) {
        return { rows: [...source.values()].filter((row) => {
          for (let i = 0; i < params.length; i += 2) if (row.domain === params[i] && row.document_key === params[i + 1]) return true;
          return false;
        }).map((row) => ({ domain: row.domain, document_key: row.document_key, restore_row: JSON.stringify(row) })) };
      }
      if (text.includes('FROM app_runtime_metadata') && text.includes('current_database()')) {
        return { rows: currentProof ? [{ value: currentProof, database_name: 'staging' }] : [] };
      }
      if (text.startsWith('INSERT INTO "app_site_content_documents"')) {
        if (failOnInsert && !failedOnce) { failedOnce = true; throw Object.assign(new Error('Injected statement failure'), { code: 'forced_restore_failure' }); }
        let rowCount = 0;
        for (let i = 0; i < params.length; i += 4) {
          const incoming = { domain: params[i], document_key: params[i + 1], payload: JSON.parse(params[i + 2]), enabled: params[i + 3] };
          const key = pk(incoming);
          const was = source.has(key);
          if (!was || !text.includes('DO NOTHING')) { source.set(key, incoming); rowCount += 1; }
        }
        return { rowCount, rows: [] };
      }
      if (text.startsWith('DELETE FROM app_runtime_metadata')) { currentProof = null; return { rowCount: 1, rows: [] }; }
      if (text.startsWith('INSERT INTO app_system_data_restore_audit')) { audit.push(params); return { rowCount: 1, rows: [] }; }
      if (text.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [{}] };
      throw new Error(`Unexpected mock SQL: ${text.slice(0, 110)}`);
    },
    release() {},
  };
  const pool = { connect: async () => client, query: (...args) => client.query(...args) };
  return { pool, audit, queries, get: (key) => source.get(key), set: (key, value) => source.set(key, value), setProof: (value) => { currentProof = value; }, proof: () => currentProof };
};
const payload = { snapshot: fixture(), scopes: ['site'], mode: 'addMissing' };
assert.throws(() => normalizeRestoreRequest({ ...payload, snapshot: { ...fixture(), format: 'unknown' } }),
  (e) => e.code === 'system_restore_backup_format_invalid');
assert.throws(() => normalizeRestoreRequest({ ...payload, scopes: ['members'] }),
  (e) => e.code === 'system_restore_scopes_invalid');
assert.throws(() => normalizeRestoreRequest({ ...payload, snapshot: fixture([{
  domain: 'home', document_key: 'x', payload: { key: '[redacted]' }, enabled: true,
}]) }), (e) => e.code === 'system_restore_redacted_or_invalid_row');
const tooMany = fixture(Array.from({ length: 2501 }, (_, i) => ({ domain: 'home', document_key: `x${i}`, payload: {}, enabled: true })));
assert.throws(() => normalizeRestoreRequest({ ...payload, snapshot: tooMany }), (e) => e.code === 'system_restore_too_many_rows');
const mocked = makePool();
const restorer = createScopedJsonRestore(mocked.pool);
const preview = await restorer.preview(payload);
assert.equal(preview.willInsert, 0);
assert.equal(preview.willSkip, 1);
assert.equal(preview.restoreProof.valid, true);
assert.ok(mocked.queries.some((sql) => sql.includes('REPEATABLE READ READ ONLY')));
await assert.rejects(() => restorer.execute({ ...payload, actorClerkUserId: 'admin', previewSha256: preview.previewSha256, confirmText: 'wrong' }),
  (e) => e.code === 'system_restore_confirmation_invalid');
assert.equal((await restorer.execute({ ...payload, actorClerkUserId: 'admin', previewSha256: preview.previewSha256,
  confirmText: '백업 데이터 복원' })).changedRows, 0);
assert.equal(mocked.get('home:homePage/config').payload.value, 1);
assert.equal(mocked.proof(), null, 'successful operation consumes the full backup proof');
const overwrite = { ...payload, mode: 'overwrite' };
mocked.setProof(clone(proof));
const overPreview = await restorer.preview(overwrite);
assert.equal(overPreview.willUpdate, 1);
assert.equal((await restorer.execute({ ...overwrite, actorClerkUserId: 'admin', previewSha256: overPreview.previewSha256,
  confirmText: '백업 데이터 복원' })).changedRows, 1);
assert.equal(mocked.get('home:homePage/config').payload.value, 2);
assert.equal(mocked.audit.length, 2);
// Multiple rows must allocate $1..$N contiguously in SELECT and INSERT.
const multi = makePool();
const multiSnapshot = fixture([
  { domain: 'home', document_key: 'homePage/config', payload: { value: 9 }, enabled: true },
  { domain: 'footer', document_key: 'footer/test-restore', payload: { value: 8 }, enabled: true },
]);
const multiPayload = { snapshot: multiSnapshot, scopes: ['site'], mode: 'overwrite' };
const multiService = createScopedJsonRestore(multi.pool);
const multiPreview = await multiService.preview(multiPayload);
assert.equal(multiPreview.willUpdate, 1);
assert.equal(multiPreview.willInsert, 1);
assert.equal((await multiService.execute({ ...multiPayload, actorClerkUserId: 'admin',
  previewSha256: multiPreview.previewSha256, confirmText: '백업 데이터 복원' })).changedRows, 2);
assert.equal(multi.get('home:homePage/config').payload.value, 9);
assert.equal(multi.get('footer:footer/test-restore').payload.value, 8);
const stale = makePool();
const staleRestore = createScopedJsonRestore(stale.pool);
const oldPreview = await staleRestore.preview(payload);
// A modification to an existing row (same ID and count) invalidates its preview.
stale.set('home:homePage/config', { domain: 'home', document_key: 'homePage/config', payload: { value: 999 }, enabled: true });
await assert.rejects(() => staleRestore.execute({ ...payload, actorClerkUserId: 'admin',
  previewSha256: oldPreview.previewSha256, confirmText: '백업 데이터 복원' }),
(e) => e.code === 'system_restore_preview_stale');
assert.equal(stale.get('home:homePage/config').payload.value, 999);
const missing = makePool({ missingProof: true });
const noProofPreview = await createScopedJsonRestore(missing.pool).preview(payload);
assert.equal(noProofPreview.restoreProof.valid, false);
await assert.rejects(() => createScopedJsonRestore(missing.pool).execute({ ...payload, actorClerkUserId: 'admin',
  previewSha256: noProofPreview.previewSha256, confirmText: '백업 데이터 복원' }),
(e) => e.code === 'system_restore_verified_backup_required');
const interrupted = makePool({ failOnInsert: true });
const recovery = createScopedJsonRestore(interrupted.pool);
const interruptedPreview = await recovery.preview(overwrite);
await assert.rejects(() => recovery.execute({ ...overwrite, actorClerkUserId: 'admin',
  previewSha256: interruptedPreview.previewSha256, confirmText: '백업 데이터 복원' }),
(e) => e.code === 'forced_restore_failure');
assert.equal(interrupted.get('home:homePage/config').payload.value, 1, 'failed upsert must roll back');
assert.ok(interrupted.proof(), 'failed restore must not consume backup proof');
const owner = { id: 'admin', clerkUserId: 'user_admin', adminRole: 'owner' };
const nonOwner = { id: 'admin2', clerkUserId: 'user_other', adminRole: 'admin' };
const service = createSystemDataService({ repository: { previewRestore: (p) => restorer.preview(p), executeRestore: (p) => restorer.execute(p) } });
await assert.rejects(() => service.previewRestore(nonOwner, payload), (e) => e.code === 'admin_owner_required');
await assert.rejects(() => service.executeRestore(nonOwner, { ...payload, confirmText: '백업 데이터 복원' }),
  (e) => e.code === 'admin_owner_required');
assert.equal((await service.previewRestore(owner, overwrite)).mode, 'overwrite');
console.log('[phase34-scoped-restore-smoke] PASS: PostgreSQL $1-based bind indexes, multi-row preview/upsert, redactions, 2 modes, stale checks, proof, rollback, owner, row limit');
