import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSystemDataService } from '../../server/src/settings/system-data-service.mjs';

const calls = [];
const repository = {
  async getOverview() { calls.push('overview'); return { authority: 'postgresql', integrity: { errors: 0, warnings: 0 } }; },
  async checkIntegrity() { calls.push('integrity'); return { authority: 'postgresql', errors: 0, warnings: 0 }; },
  async repairAssetReferences() { calls.push('repair'); return { authority: 'postgresql', repairedRequestCount: 2 }; },
  async exportSnapshot() { calls.push('export'); return { authority: 'postgresql', format: 'mk-rental-postgresql-backup-v1' }; },
};
const service = createSystemDataService({ repository });
const owner = { id: 'admin:test', clerkUserId: 'user_test', adminRole: 'owner' };
const admin = { id: 'admin:test2', clerkUserId: 'user_test2', adminRole: 'admin' };
assert.equal((await service.getOverview(owner)).authority, 'postgresql');
assert.equal((await service.checkIntegrity(admin)).authority, 'postgresql');
assert.equal((await service.repairAssetReferences(owner)).repairedRequestCount, 2);
await assert.rejects(() => service.repairAssetReferences(admin), (error) => error?.code === 'admin_owner_required');
assert.equal((await service.exportSnapshot(owner)).format, 'mk-rental-postgresql-backup-v1');
await assert.rejects(() => service.exportSnapshot(admin), (error) => error?.code === 'admin_owner_required');

const migration = await readFile(new URL('../../server/migrations/027_phase34_asset_reference_reconciliation.sql', import.meta.url), 'utf8');
for (const required of [
  'app_rental_request_items',
  'app_rental_asset_reservation_guards',
  'asset_no_normalized=lower(trim(item.asset_no))',
  "source_mode='postgresql-reference-repaired'",
  'app_asset_catalog_syncs',
]) assert.ok(migration.includes(required), `migration missing ${required}`);

const repositorySource = await readFile(new URL('../../server/src/settings/system-data-repository.mjs', import.meta.url), 'utf8');
for (const required of [
  'missingRequestCount',
  'recoverableRequestCount',
  'unrecoverableRequestCount',
  'repairAssetReferences',
  'exportSnapshot',
  'pg_database_size',
]) assert.ok(repositorySource.includes(required), `repository missing ${required}`);

const appSource = await readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8');
for (const route of [
  '/api/admin/system-data/overview',
  '/api/admin/system-data/integrity',
  '/api/admin/system-data/repair-asset-references',
  '/api/admin/system-data/export',
]) assert.ok(appSource.includes(route), `app route missing ${route}`);

console.log('[phase34-system-data-backend-smoke] PASS', { calls });
