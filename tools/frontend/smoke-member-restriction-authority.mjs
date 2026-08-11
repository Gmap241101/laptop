import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readMemberAuthorityCutoverConfig } from '../../src/features/members/memberAuthorityCutover.js';

const memory = new Map();
const storage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_MEMBER_PROFILE_POSTGRES_WRITE_ENABLED: 'true',
  VITE_RENTAL_RESTRICTION_POSTGRES_WRITE_ENABLED: 'true',
  VITE_ADMIN_IDENTITY_REGISTRY_ENABLED: 'true',
};
const config = readMemberAuthorityCutoverConfig({ env, location: { search: '?memberWrite=postgres&restrictionWrite=postgres&adminIdentity=postgres' }, storage });
assert.equal(config.memberRequested, true);
assert.equal(config.restrictionRequested, true);
assert.equal(config.adminRegistryRequested, true);
const latched = readMemberAuthorityCutoverConfig({ env, location: { search: '' }, storage });
assert.equal(latched.memberRequested, true);
assert.equal(latched.restrictionRequested, true);
assert.equal(latched.adminRegistryRequested, true);
const reset = readMemberAuthorityCutoverConfig({ env, location: { search: '?memberWrite=firestore&restrictionWrite=firestore&adminIdentity=firestore' }, storage });
assert.equal(reset.memberRequested, false);
assert.equal(reset.restrictionRequested, false);
assert.equal(reset.adminRegistryRequested, false);

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [userProfile, adminEdit, adminStatus, adminAccounts, client, diagnostics, adminRentalService] = await Promise.all([
  read('src/features/members/useUserMyPageAccountController.js'),
  read('src/features/members/useAdminMemberAccountEditActions.js'),
  read('src/features/members/useAdminMemberAccountStatusActions.js'),
  read('src/features/auth/useAdminAccountManagementController.js'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('server/src/rentals/admin-rental-request-service.mjs'),
]);
for (const marker of ['readMemberAuthorityCutoverConfig', 'writeMemberProfile', 'memberAuthorityConfig.memberRequested', 'runTransaction']) assert.ok(userProfile.includes(marker), marker);
for (const marker of ['writeAdminMemberProfile', 'memberAuthorityConfig.memberRequested', 'runTransaction']) assert.ok(adminEdit.includes(marker), marker);
for (const marker of ['writeAdminMemberStatus', 'memberAuthorityConfig.memberRequested', 'writeBatch']) assert.ok(adminStatus.includes(marker), marker);
for (const marker of ['bootstrapAdminIdentityRegistry', 'adminRegistryRequested', 'syncAdminIdentityRegistryIfRequested', 'createUserWithEmailAndPassword']) assert.ok(adminAccounts.includes(marker), marker);
for (const marker of ['writeMemberProfile', 'writeAdminMemberProfile', 'writeAdminMemberStatus', 'bootstrapAdminIdentityRegistry']) assert.ok(client.includes(marker), marker);
assert.match(diagnostics, /Clerk Staging Test · Phase (21|22|23|24|25|26|27|28|29|30)/);
assert.match(diagnostics, /Phase 21 member \/ restriction authority \+ admin identity preparation/);
for (const label of ['Member authoritative write requested:', 'Restriction authoritative write requested:', 'Admin identity registry requested:', 'Member Firestore compatibility mirror:']) assert.ok(diagnostics.includes(label), label);
assert.ok(adminRentalService.includes('upsertRestrictionAuthoritative'), 'PostgreSQL rental restriction authority must be updated after admin rental writes');
console.log('[member-restriction-authority-frontend-smoke] PASS (opt-in latches, self/admin profile/status authority, admin registry prep, diagnostics, restriction authority hook)');
