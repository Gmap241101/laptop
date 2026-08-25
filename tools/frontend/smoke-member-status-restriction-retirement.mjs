import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const retiredModule = 'src/features/compatibility/memberStatusRestrictionWriteMirrorRetirement.js';
assert.equal(existsSync(retiredModule), false, 'retired member-status compatibility module must stay deleted');

const controller = readFileSync('src/features/members/useAdminMemberAccountsController.js', 'utf8');
const statusActions = readFileSync('src/features/members/useAdminMemberAccountStatusActions.js', 'utf8');
const panel = readFileSync('src/admin/AdminMemberAccountsPanel.jsx', 'utf8');
const client = readFileSync('src/clerk/clerkStagingClient.js', 'utf8');
const service = readFileSync('server/src/members/member-authority-service.mjs', 'utf8');
const app = readFileSync('server/src/app.mjs', 'utf8');

assert.ok(controller.includes('clerkStagingClient.getAdminMembers'), 'administrator member list must stay on PostgreSQL-backed Clerk API');
assert.ok(statusActions.includes('writeAdminMemberStatus'), 'administrator status changes must stay on the backend authority');
assert.ok(statusActions.includes('rejoined_member_active_requests'), 'rejoined-member active-rental guard must remain mapped in the administrator UI');
assert.ok(panel.includes('onStatusChanged'), 'member list must refresh after status changes');
for (const marker of ['requestAdminMembersPostgresql', 'getAdminMembers', '/api/admin/members']) {
  assert.ok(client.includes(marker), marker);
}
assert.ok(service.includes("firestoreMirror: 'retired'"), 'backend member status writes must report the retired mirror');
for (const marker of [
  'memberStatusRestrictionWriteMirrorDisabled: Boolean(config.memberStatusRestrictionWriteMirrorDisabled)',
  "memberStatusSource: config.memberStatusRestrictionWriteMirrorDisabled ? 'postgresql'",
]) {
  assert.ok(app.includes(marker), `missing PostgreSQL member-status authority marker: ${marker}`);
}

for (const source of [controller, statusActions, panel, client]) {
  assert.equal(source.includes('memberStatusRestrictionWriteMirrorRetirement'), false, 'active frontend source must not import the retired member-status compatibility module');
  assert.equal(source.includes('VITE_FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED'), false, 'retired frontend member-status flag must not return to active source');
}

console.log('[member-status-restriction-retirement-frontend-smoke] PASS (retired compatibility module absent; PostgreSQL member status/restriction authority preserved)');
