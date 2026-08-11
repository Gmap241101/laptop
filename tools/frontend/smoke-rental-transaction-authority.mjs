import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRentalRequestWriteMirrorRetirementConfig, requestRentalRequestWriteMirrorRetirementStatus } from '../../src/features/compatibility/rentalRequestWriteMirrorRetirement.js';

const config = readRentalRequestWriteMirrorRetirementConfig({ env: { VITE_CLERK_STAGING_ENABLED: 'true', VITE_FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED: 'true', VITE_API_URL: 'https://api.example.test' } });
assert.equal(config.enabled, true);
assert.equal(config.apiBaseUrl, 'https://api.example.test');
const mismatchStatus = await requestRentalRequestWriteMirrorRetirementStatus({
  config,
  fetchImpl: async () => ({ ok: true, json: async () => ({ compatibility: { rentalRequestWriteMirrorDisabled: false, rentalTransactionSource: 'firestore-compatibility-source', retiredWriteMirrorDomains: ['assets','notice','faq'] } }) }),
});
assert.equal(mismatchStatus.backendApplied, false);
assert.equal(mismatchStatus.error, 'backend-rental-retirement-not-applied');
const appliedStatus = await requestRentalRequestWriteMirrorRetirementStatus({
  config,
  fetchImpl: async () => ({ ok: true, json: async () => ({ compatibility: { rentalRequestWriteMirrorDisabled: true, rentalTransactionSource: 'postgresql', retiredWriteMirrorDomains: ['assets','notice','faq','rental-requests'] } }) }),
});
assert.equal(appliedStatus.backendApplied, true);
assert.equal(appliedStatus.error, null);


const rentalReadCutover = readFileSync('src/features/requests/rentalRequestReadCutover.js', 'utf8');
for (const marker of [
  "['postgresql-shadow', 'postgresql-authoritative']",
  "source === 'postgresql-authoritative'",
  "source: candidate.source || 'postgresql-shadow'",
]) assert.ok(rentalReadCutover.includes(marker), marker);

const rentalDataController = readFileSync('src/features/requests/useRentalDataSubscriptionController.js', 'utf8');
for (const marker of [
  'readRentalRequestWriteMirrorRetirementConfig',
  'rentalWriteMirrorRetirementConfig.enabled',
  'clerkStagingClient.getRentalRequestReadCandidate()',
]) assert.ok(rentalDataController.includes(marker), marker);
const enabledBranch = rentalDataController.indexOf('if (rentalWriteMirrorRetirementConfig.enabled)');
const syncBranch = rentalDataController.indexOf('clerkStagingClient.syncRentalRequestShadow', enabledBranch);
const getBranch = rentalDataController.indexOf('clerkStagingClient.getRentalRequestReadCandidate()', enabledBranch);
assert.ok(enabledBranch >= 0 && getBranch > enabledBranch && syncBranch > getBranch, 'Phase 29 enabled branch must select PostgreSQL candidate before any legacy shadow sync branch.');

const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
for (const marker of [
  'Clerk Staging Test · Phase 29',
  'Phase 29 rental transaction PostgreSQL authority + Firestore write mirror retirement',
  'Rental write mirror retirement requested',
  'Rental backend retirement applied',
  'Rental transaction source',
  'Preserved write mirrors: member / restriction / site shell / policy-terms transactions',
  "top: '184px'",
]) assert.ok(diagnostics.includes(marker), marker);
const app = readFileSync('src/App.jsx', 'utf8');
assert.ok(!app.includes('rentalRequestWriteMirrorRetirement'), 'Phase 29 compatibility logic must remain outside App.jsx');
console.log('[rental-transaction-authority-frontend-smoke] PASS (Phase 29 opt-in + authoritative rental read bypass + diagnostics contracts)');
