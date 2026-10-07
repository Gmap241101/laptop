import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSystemDataService } from '../../server/src/settings/system-data-service.mjs';

const calls = [];
const repository = {
  async getOverview() { calls.push('overview'); return { authority: 'postgresql', integrity: { errors: 0, warnings: 0 } }; },
  async checkIntegrity() { calls.push('integrity'); return { authority: 'postgresql', errors: 0, warnings: 0 }; },
  async repairAssetReferences() { calls.push('repair'); return { authority: 'postgresql', repairedRequestCount: 2 }; },
  async reconcileAssetCatalogMetadata() { calls.push('catalog-metadata-reconcile'); return { authority: 'postgresql', metadata: { assetCount: 26, categoryCount: 4 } }; },
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
assert.equal((await service.reconcileAssetCatalogMetadata(owner)).metadata.assetCount, 26);
await assert.rejects(() => service.reconcileAssetCatalogMetadata(admin), (error) => error?.code === 'admin_owner_required');
assert.equal((await service.exportSnapshot(owner)).format, 'mk-rental-postgresql-backup-v1');
await assert.rejects(() => service.exportSnapshot(admin), (error) => error?.code === 'admin_owner_required');
assert.equal((await service.getResetCounts(owner, ['assets', 'rentals', 'inquiries'])).authority, 'postgresql');
await assert.rejects(() => service.getResetCounts(admin, ['assets']), (error) => error?.code === 'admin_owner_required');
await assert.rejects(() => service.resetScopes(owner, { scopes: ['assets'], confirmText: 'wrong', backupConfirmed: true }), (error) => error?.code === 'system_data_reset_confirmation_invalid');
await assert.rejects(() => service.resetScopes(owner, { scopes: ['assets'], confirmText: '테스트 데이터 전체 초기화', backupConfirmed: false }), (error) => error?.code === 'system_data_reset_backup_required');
assert.equal((await service.resetScopes(owner, { scopes: ['assets', 'inquiries'], confirmText: '테스트 데이터 전체 초기화', backupConfirmed: true })).authority, 'postgresql');

const migration = await readFile(new URL('../../server/migrations/027_phase34_asset_reference_reconciliation.sql', import.meta.url), 'utf8');
for (const required of [
  'app_rental_request_items',
  'app_rental_asset_reservation_guards',
  'asset_no_normalized=lower(trim(item.asset_no))',
  "source_mode='postgresql-reference-repaired'",
  'app_asset_catalog_syncs',
]) assert.ok(migration.includes(required), `migration missing ${required}`);

const repositorySource = await readFile(new URL('../../server/src/settings/system-data-repository.mjs', import.meta.url), 'utf8');
assert.ok(
  repositorySource.includes('SELECT * FROM app_user_term_consent_states ORDER BY firebase_uid, term_id'),
  'member backup must order term-consent states by columns that exist in the canonical schema',
);
assert.equal(
  repositorySource.includes('SELECT * FROM app_user_term_consent_states ORDER BY app_user_id'),
  false,
  'member backup must not reference the removed/nonexistent app_user_id column in app_user_term_consent_states',
);


assert.ok(
  repositorySource.includes("DELETE FROM app_site_content_documents WHERE domain='footer' AND document_key LIKE 'footerPages/%'"),
  'content reset must remove footer menu pages separately instead of deleting the whole footer domain',
);
assert.ok(
  repositorySource.includes("('footer','siteFooter/config'") && repositorySource.includes('ON CONFLICT (domain, document_key) DO UPDATE SET'),
  'content reset must preserve the footer common-information row and replace only its payload with an empty canonical value',
);
assert.equal(
  repositorySource.includes("DELETE FROM app_site_content_documents WHERE domain IN ('home','popup','footer','terms')"),
  false,
  'content reset must never delete the siteFooter/config row by deleting the entire footer domain',
);
for (const requiredInquiryResetMarker of [
  "selected.includes('inquiries')",
  "DELETE FROM app_secure_attachments WHERE owner_type IN ('inquiry','inquiry_answer')",
  'DELETE FROM app_inquiry_guest_sessions',
  'DELETE FROM app_inquiry_guest_consents',
  'DELETE FROM app_inquiry_answers',
  'DELETE FROM app_inquiries',
  'memberInquiries',
  'guestInquiries',
]) assert.ok(repositorySource.includes(requiredInquiryResetMarker), `inquiry reset missing ${requiredInquiryResetMarker}`);
assert.ok(
  repositorySource.includes('snapshot.operations') && repositorySource.includes('inquiries: {'),
  'pre-reset operational backup must include inquiry-management data before inquiry reset',
);

for (const required of [
  'missingRequestCount',
  'recoverableRequestCount',
  'unrecoverableRequestCount',
  'repairAssetReferences',
  'reconcileAssetCatalogMetadata',
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
  '/api/admin/system-data/reconcile-asset-catalog-metadata',
  '/api/admin/system-data/export',
  '/api/admin/system-data/reset/scan',
  '/api/admin/system-data/reset',
]) assert.ok(appSource.includes(route), `app route missing ${route}`);

console.log('[phase34-system-data-backend-smoke] PASS', { calls });
