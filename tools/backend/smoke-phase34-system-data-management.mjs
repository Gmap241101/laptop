import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSystemDataService } from '../../server/src/settings/system-data-service.mjs';

const calls = [];
const repository = {
  async getOverview() { calls.push('overview'); return { authority: 'postgresql', integrity: { errors: 0, warnings: 0 } }; },
  async checkIntegrity() { calls.push('integrity'); return { authority: 'postgresql', errors: 0, warnings: 0 }; },
  async repairAssetReferences() { calls.push('repair'); return { authority: 'postgresql', repairedRequestCount: 2 }; },
  async exportSnapshot() { calls.push('export'); return { authority: 'postgresql', format: 'mk-rental-postgresql-backup-v1' }; },
  async getResetCounts(scopes) { calls.push(`reset-scan:${scopes.join(',')}`); return { authority: 'postgresql', scopes, counts: Object.fromEntries(scopes.map((scope) => [scope, 1])), details: {} }; },
  async resetScopes({ scopes, actorClerkUserId }) { calls.push(`reset:${scopes.join(',')}:${actorClerkUserId}`); return { authority: 'postgresql', scopes, before: { counts: {} }, after: { counts: {} } }; },
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
assert.equal((await service.getResetCounts(owner, ['assets', 'rentals'])).authority, 'postgresql');
await assert.rejects(() => service.getResetCounts(admin, ['assets']), (error) => error?.code === 'admin_owner_required');
await assert.rejects(() => service.resetScopes(owner, { scopes: ['assets'], confirmText: 'wrong', backupConfirmed: true }), (error) => error?.code === 'system_data_reset_confirmation_invalid');
await assert.rejects(() => service.resetScopes(owner, { scopes: ['assets'], confirmText: '테스트 데이터 전체 초기화', backupConfirmed: false }), (error) => error?.code === 'system_data_reset_backup_required');
assert.equal((await service.resetScopes(owner, { scopes: ['assets'], confirmText: '테스트 데이터 전체 초기화', backupConfirmed: true })).authority, 'postgresql');

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
  'getResetCounts',
  'resetScopes',
  'phase34_last_system_data_reset',
  'pg_database_size',
]) assert.ok(repositorySource.includes(required), `repository missing ${required}`);

const appSource = await readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8');
for (const route of [
  '/api/admin/system-data/overview',
  '/api/admin/system-data/integrity',
  '/api/admin/system-data/repair-asset-references',
  '/api/admin/system-data/export',
  '/api/admin/system-data/reset/scan',
  '/api/admin/system-data/reset',
]) assert.ok(appSource.includes(route), `app route missing ${route}`);

console.log('[phase34-system-data-backend-smoke] PASS', { calls });
