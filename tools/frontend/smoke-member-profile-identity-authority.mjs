import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const retiredModule = 'src/features/compatibility/memberProfileIdentityAuthority.js';
assert.equal(existsSync(retiredModule), false, 'retired member-profile identity compatibility module must stay deleted');

const userClient = readFileSync('src/clerk/clerkUserClient.js', 'utf8');
const adminClient = readFileSync('src/clerk/clerkStagingClient.js', 'utf8');
const directorySave = readFileSync('src/features/members/useAdminMemberDirectorySaveActions.js', 'utf8');
const userProfile = readFileSync('src/features/members/useUserMyPageAccountController.js', 'utf8');
const adminProfile = readFileSync('src/features/members/useAdminMemberAccountEditActions.js', 'utf8');
const app = readFileSync('server/src/app.mjs', 'utf8');

assert.ok(userClient.includes("path: '/api/users/me/member-profile'"), 'user profile writes must use the PostgreSQL member-profile API');
assert.ok(userProfile.includes('clerkStagingClient.writeMemberProfile'), 'user profile edit must use backend member authority');
assert.ok(adminProfile.includes('clerkStagingClient.writeAdminMemberProfile'), 'admin profile edit must use backend member authority');
for (const marker of ['requestAdminMemberDirectoryPostgresqlSync', '/api/admin/member-directory/sync', 'syncAdminMemberDirectory']) {
  assert.ok(adminClient.includes(marker), marker);
}
assert.ok(directorySave.includes('syncAdminMemberDirectory'), 'administrator member directory saves must stay on the backend authority');
for (const marker of [
  'memberProfileWriteMirrorDisabled: Boolean(config.memberProfileWriteMirrorDisabled)',
  "memberProfileSource: config.memberProfileWriteMirrorDisabled ? 'postgresql'",
  "memberIdentitySource: config.memberProfileWriteMirrorDisabled ? 'postgresql'",
]) {
  assert.ok(app.includes(marker), `missing PostgreSQL member-profile authority marker: ${marker}`);
}

for (const source of [userClient, adminClient, directorySave, userProfile, adminProfile]) {
  assert.equal(source.includes('memberProfileIdentityAuthority'), false, 'active frontend source must not import the retired identity compatibility module');
  assert.equal(source.includes('VITE_MEMBER_PROFILE_IDENTITY_POSTGRES_AUTHORITY_ENABLED'), false, 'retired Phase 31 frontend flag must not return to active source');
}

console.log('[member-profile-identity-authority-frontend-smoke] PASS (retired compatibility module absent; user/admin profile authority remains PostgreSQL-backed)');
