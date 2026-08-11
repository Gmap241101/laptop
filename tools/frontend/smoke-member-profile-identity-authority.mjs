import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readMemberProfileIdentityAuthorityConfig, requestMemberProfileIdentityAuthorityStatus } from '../../src/features/compatibility/memberProfileIdentityAuthority.js';

const config = readMemberProfileIdentityAuthorityConfig({
  env: { VITE_CLERK_STAGING_ENABLED: 'true', VITE_MEMBER_PROFILE_IDENTITY_POSTGRES_AUTHORITY_ENABLED: 'true', VITE_API_URL: 'https://api.example.test/' },
  location: { search: '' }, storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
});
assert.equal(config.enabled, true);
assert.equal(config.requested, true);
assert.equal(config.apiBaseUrl, 'https://api.example.test');
const status = await requestMemberProfileIdentityAuthorityStatus({
  config,
  fetchImpl: async () => new Response(JSON.stringify({ compatibility: {
    memberProfileWriteMirrorDisabled: true,
    memberProfileSource: 'postgresql',
    memberIdentitySource: 'postgresql',
    retiredWriteMirrorDomains: ['member-profile','member-identity','account-recovery-key'],
  } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
});
assert.equal(status.backendApplied, true);
assert.equal(status.source, 'postgresql');
assert.equal(status.identitySource, 'postgresql');
assert.equal(status.error, null);

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [client, directorySave, userProfile, adminProfile, diagnostics] = await Promise.all([
  read('src/clerk/clerkStagingClient.js'),
  read('src/features/members/useAdminMemberDirectorySaveActions.js'),
  read('src/features/members/useUserMyPageAccountController.js'),
  read('src/features/members/useAdminMemberAccountEditActions.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
]);
assert.ok(client.includes("!['synced','retired'].includes(payload?.memberProfileWrite?.firestoreMirror)"), 'user profile client must accept retired mirror');
for (const marker of ['requestAdminMemberDirectoryPostgresqlSync', '/api/admin/member-directory/sync', 'syncAdminMemberDirectory']) assert.ok(client.includes(marker), marker);
for (const marker of ["syncSiteContentDomainFromFirestore({ domain: 'rental-config' })", 'syncAdminMemberDirectory', 'readMemberProfileIdentityAuthorityConfig']) assert.ok(directorySave.includes(marker), marker);
assert.ok(userProfile.includes('clerkStagingClient.writeMemberProfile'), 'user profile edit must use backend member authority');
assert.ok(adminProfile.includes('clerkStagingClient.writeAdminMemberProfile'), 'admin profile edit must use backend member authority');
for (const marker of ['Clerk Staging Test · Phase 31', 'Phase 31 member profile identity / recovery PostgreSQL authority + Firestore write mirror retirement', 'Member identity source:', 'Last profile edit mirror:', "top: '184px'"]) assert.ok(diagnostics.includes(marker), marker);
console.log('[member-profile-identity-authority-frontend-smoke] PASS (Phase 31 flag/health, retired mirror response, directory sync, user/admin profile authority, diagnostics)');
