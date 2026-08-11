import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRentalRequestWriteMirrorRetirementConfig } from '../../src/features/compatibility/rentalRequestWriteMirrorRetirement.js';

const config = readRentalRequestWriteMirrorRetirementConfig({ env: { VITE_CLERK_STAGING_ENABLED: 'true', VITE_FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED: 'true', VITE_API_URL: 'https://api.example.test' } });
assert.equal(config.enabled, true);
assert.equal(config.apiBaseUrl, 'https://api.example.test');
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
console.log('[rental-transaction-authority-frontend-smoke] PASS (Phase 29 opt-in + diagnostics contracts)');
