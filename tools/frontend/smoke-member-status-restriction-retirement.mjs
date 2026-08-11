import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  readMemberStatusRestrictionWriteMirrorRetirementConfig,
  requestMemberStatusRestrictionWriteMirrorRetirementStatus,
} from '../../src/features/compatibility/memberStatusRestrictionWriteMirrorRetirement.js';

const enabledConfig = readMemberStatusRestrictionWriteMirrorRetirementConfig({ env: {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED: 'true',
  VITE_API_URL: 'https://api.example.test/',
} });
assert.equal(enabledConfig.enabled, true);
assert.equal(enabledConfig.apiBaseUrl, 'https://api.example.test');

const applied = await requestMemberStatusRestrictionWriteMirrorRetirementStatus({
  config: enabledConfig,
  fetchImpl: async () => new Response(JSON.stringify({ compatibility: {
    memberStatusRestrictionWriteMirrorDisabled: true,
    memberStatusSource: 'postgresql',
    retiredWriteMirrorDomains: ['assets', 'notice', 'faq', 'rental-requests', 'member-status', 'rental-restriction-status'],
  } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
});
assert.equal(applied.requested, true);
assert.equal(applied.backendApplied, true);
assert.equal(applied.source, 'postgresql');
assert.equal(applied.error, null);
assert.ok(applied.retiredDomains.includes('member-status'));
assert.ok(applied.retiredDomains.includes('rental-restriction-status'));

const mismatch = await requestMemberStatusRestrictionWriteMirrorRetirementStatus({
  config: enabledConfig,
  fetchImpl: async () => new Response(JSON.stringify({ compatibility: {
    memberStatusRestrictionWriteMirrorDisabled: false,
    memberStatusSource: 'firestore-compatibility-source',
    retiredWriteMirrorDomains: [],
  } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
});
assert.equal(mismatch.error, 'backend-member-status-retirement-not-applied');

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [controller, statusActions, panel, client, diagnostics, service] = await Promise.all([
  read('src/features/members/useAdminMemberAccountsController.js'),
  read('src/features/members/useAdminMemberAccountStatusActions.js'),
  read('src/admin/AdminMemberAccountsPanel.jsx'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('server/src/members/member-authority-service.mjs'),
]);
for (const marker of ['phase30Config.enabled', 'clerkStagingClient.getAdminMembers', "adminMemberReadSource: 'postgresql'", 'Phase 30에서는 오래된 Firestore 회원 목록으로 fallback하지 않습니다.', 'serverPaged']) assert.ok(controller.includes(marker), marker);
for (const marker of ['onStatusChanged', 'onStatusChangedRef.current?.', 'writeAdminMemberStatus', 'readMemberStatusRestrictionWriteMirrorRetirementConfig', '!phase30Retirement.enabled', 'rejoined_member_active_requests']) assert.ok(statusActions.includes(marker), marker);
for (const marker of ['onStatusChanged: refreshAdminUserAccounts', 'new Date(account.createdAt)']) assert.ok(panel.includes(marker), marker);
for (const marker of ['requestAdminMembersPostgresql', 'getAdminMembers', '/api/admin/members']) assert.ok(client.includes(marker), marker);
for (const marker of ['Clerk Staging Test · Phase 30', 'Phase 30 member status / rental restriction PostgreSQL authority + Firestore write mirror retirement', 'Admin member list source:', 'Phase 30 retirement error:', "top: '184px'"]) assert.ok(diagnostics.includes(marker), marker);
assert.ok(service.includes("firestoreMirror: writeMirrorEnabled ? 'synced' : 'retired'"), 'backend status write must report retired mirror');
console.log('[member-status-restriction-retirement-frontend-smoke] PASS (flag/health contract, PostgreSQL admin member list, server pagination, PostgreSQL rejoined guard routing, refresh-after-status, diagnostics)');
