import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAccountLifecycleService } from '../../server/src/accounts/account-lifecycle-service.mjs';
import { createUserClerkAuthService } from '../../server/src/auth/user-clerk-auth-service.mjs';
import { createUserClerkAuthRepository } from '../../server/src/auth/user-clerk-auth-repository.mjs';
import { createMemberAuthorityRepository } from '../../server/src/members/member-authority-repository.mjs';
import { createMemberAuthorityService } from '../../server/src/members/member-authority-service.mjs';

const serviceSource = await readFile(new URL('../../server/src/auth/user-clerk-auth-service.mjs', import.meta.url), 'utf8');
const repoSource = await readFile(new URL('../../server/src/auth/user-clerk-auth-repository.mjs', import.meta.url), 'utf8');
const accountRepoSource = await readFile(new URL('../../server/src/accounts/account-lifecycle-repository.mjs', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../../server/migrations/031_phase34_member_lifecycle_finalization.sql', import.meta.url), 'utf8');
const consolidationMigrationSource = await readFile(new URL('../../server/migrations/032_phase34_rejoin_approval_consolidation.sql', import.meta.url), 'utf8');
const memberRepoSource = await readFile(new URL('../../server/src/members/member-authority-repository.mjs', import.meta.url), 'utf8');
const memberServiceSource = await readFile(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8');
assert.match(serviceSource, /newMemberKey\('signup'\)/);
assert.doesNotMatch(serviceSource, /clerk-native:\$\{sha256/);
assert.match(repoSource, /async purgeMemberAccount/);
assert.match(repoSource, /DELETE FROM app_rental_requests/);
assert.match(repoSource, /DELETE FROM app_user_term_consent_logs/);
assert.match(repoSource, /DELETE FROM app_user_identities/);
assert.match(repoSource, /previous_account_uids \? \$1/);
assert.match(repoSource, /rental_event_actor_refs/);
assert.match(repoSource, /member_purge_orphan_reference/);
const signupInsert = accountRepoSource.slice(accountRepoSource.indexOf('`INSERT INTO app_member_accounts'), accountRepoSource.indexOf('if (rejoinedAccount', accountRepoSource.indexOf('`INSERT INTO app_member_accounts')));
assert.doesNotMatch(signupInsert, /ON CONFLICT \(firebase_uid\) DO UPDATE/);
assert.match(accountRepoSource, /member_account_uid_conflict/);
assert.match(migrationSource, /member_lifecycle_finalization/);
assert.match(migrationSource, /new-account-linked-to-retired-until-purge/);
assert.match(consolidationMigrationSource, /transfer-business-records-to-current-account-then-delete-retired-account/);
assert.match(consolidationMigrationSource, /retired_auto_purge', false/);
assert.match(memberRepoSource, /async approveRejoinedMemberAndConsolidate/);
assert.match(memberRepoSource, /postgresql-rejoin-consolidated/);
assert.match(memberRepoSource, /DELETE FROM app_member_accounts WHERE firebase_uid=ANY/);
assert.match(memberRepoSource, /rejoin_consolidation_orphan_reference/);
assert.match(memberRepoSource, /rental_event_payload_refs/);
assert.match(memberRepoSource, /profile_payload_refs/);
assert.match(memberServiceSource, /approveRejoinedMemberAndConsolidate/);

const created = [];
const lifecycle = createAccountLifecycleService({
  authorityEnabled: true,
  userAuthRepository: { async findByClerkUserId() { return null; } },
  siteContentRepository: {
    async getDocument(domain, key) {
      if (domain === 'rental-config' && key === 'rentalSystem/publicConfig') return { payload: { settings: { requireRegisteredMemberForSignup: false } } };
      if (domain === 'terms' && key === 'signupTermsPolicy/current') return { payload: { enabled: false, revision: 0, activeTerms: [] } };
      return null;
    },
  },
  repository: {
    async getConsentSnapshot() { return {}; }, async importConsents() {}, async saveConsents() {},
    async getDirectoryEntry() { return null; }, async findIdentityAccounts() { return []; },
    async findRetiredAccountsByEmail(email) { return email === 'rejoin@example.com' ? [{ firebase_uid: 'retired:old', status: 'retired' }] : []; },
    async createSignupAccount(input) { created.push(input); return { firebase_uid: input.firebaseUid, status: input.status, previous_account_uids: input.previousAccountUids }; },
  },
});
const rejoin = await lifecycle.signup({
  firebaseIdentity: { uid: 'new:random', email: 'rejoin@example.com', idToken: 'verified' },
  input: { email: 'rejoin@example.com', name: '홍길동', team: '채용대행팀', phone: '010-1234-5678', terms: {} },
});
assert.equal(rejoin.status, 'pending');
assert.equal(created[0].rejoinedAccount, true);
assert.deepEqual(created[0].previousAccountUids, ['retired:old']);

let purgedStatus = '';
let finalizedWithdrawalOptions = null;
let clerkRetiredMarked = false;
const deletedClerkUsers = [];
const authService = createUserClerkAuthService({
  repository: {
    async findByClerkUserId() { return null; },
    async findByFirebaseUid(uid) {
      if (uid === 'retired:legacy-unlinked') return null;
      const memberStatus = uid === 'pending:new' ? 'pending' : uid === 'active:new' ? 'active' : 'retired';
      return { firebaseUid: uid, memberStatus, clerkUserId: `clerk:${uid}`, clerkAccountState: 'active' };
    },
    async purgeMemberAccount({ requiredStatus }) { purgedStatus = requiredStatus; return { deleted: true, deletedCounts: { memberAccounts: 1 } }; },
    async finalizePostgresqlWithdrawal(options) { finalizedWithdrawalOptions = options; },
    async markClerkRetired() { clerkRetiredMarked = true; return {}; },
  },
  clerkClient: {
    async getUser() { return {}; }, async findUserByEmail() { return null; }, async createUser() { return {}; }, async updateUser() { return {}; }, async updateUserMetadata() { return {}; }, async verifyPassword() {},
    async deleteUser(id) { deletedClerkUsers.push(id); },
  },
  userRepository: { async upsertFromClerk() { return { id: 1 }; } },
  firebaseLinkRepository: { async link() {} }, memberRepository: {
    async findByFirebaseUid(uid) {
      return uid === 'retired:legacy-unlinked'
        ? { uid, firebaseUid: uid, status: 'retired', appUserId: '' }
        : null;
    },
  },
  adminIdentityRepository: { async findByFirebaseUid() { return null; }, async findByClerkUserId() { return { status: 'active' }; } },
  accountLifecycleService: { async signup() {}, async provisionAdminMember() {} },
  accountLifecycleCompatibilityDisabled: true, userFirebaseAuthCompatibilityDisabled: true,
});
await authService.rejectAdminPendingMember({ actorClerkUserId: 'admin', targetUid: 'pending:new' });
assert.equal(purgedStatus, 'pending');
assert.ok(deletedClerkUsers.includes('clerk:pending:new'));
await authService.retireAdminMember({ actorClerkUserId: 'admin', targetUid: 'active:new' });
assert.deepEqual(finalizedWithdrawalOptions, { firebaseUid: 'active:new', allowBlockingRestriction: true });
assert.ok(deletedClerkUsers.includes('clerk:active:new'));
assert.equal(clerkRetiredMarked, true);
await authService.purgeAdminRetiredMember({ actorClerkUserId: 'admin', targetUid: 'retired:old' });
assert.equal(purgedStatus, 'retired');
assert.ok(deletedClerkUsers.includes('clerk:retired:old'));
const legacyUnlinkedPurge = await authService.purgeAdminRetiredMember({ actorClerkUserId: 'admin', targetUid: 'retired:legacy-unlinked' });
assert.equal(legacyUnlinkedPurge.deleted, true);
assert.equal(legacyUnlinkedPurge.legacyUnlinkedAccount, true);
assert.equal(legacyUnlinkedPurge.firebaseUid, 'retired:legacy-unlinked');
assert.equal(purgedStatus, 'retired');
assert.equal(deletedClerkUsers.includes('clerk:retired:legacy-unlinked'), false);

const purgeQueries = [];
const fakeClient = {
  async query(sql, args = []) {
    purgeQueries.push({ sql: String(sql), args });
    const text = String(sql);
    if (text.includes('SELECT firebase_uid, app_user_id, status') && text.includes('FOR UPDATE')) return { rows: [{ firebase_uid: 'retired:old', app_user_id: 99, status: 'retired' }], rowCount: 1 };
    if (text.includes('active_count') && text.includes('pending_action_count')) return { rows: [{ active_count: 0, pending_action_count: 0, overdue_penalty_pending_count: 0 }], rowCount: 1 };
    if (text.startsWith('SELECT id FROM app_rental_requests')) return { rows: [{ id: 101 }], rowCount: 1 };
    if (text.includes('AS members') && text.includes('AS lineage_refs')) return { rows: [{ members: 0, links: 0, identities: 0, requests: 0, rental_event_actor_refs: 0, restrictions: 0, term_states: 0, term_logs: 0, profile_events: 0, lineage_refs: 0 }], rowCount: 1 };
    if (text.startsWith('DELETE FROM app_member_accounts')) return { rows: [{ app_user_id: 99 }], rowCount: 1 };
    if (/^(DELETE|UPDATE|INSERT)/.test(text.trim())) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
  release() {},
};
const purgeRepository = createUserClerkAuthRepository({
  async query() { return { rows: [], rowCount: 0 }; },
  async connect() { return fakeClient; },
});
const purgeResult = await purgeRepository.purgeMemberAccount({ firebaseUid: 'retired:old', requiredStatus: 'retired', operation: 'smoke-purge' });
assert.equal(purgeResult.deleted, true);
assert.ok(purgeQueries.some(({ sql }) => sql.includes('DELETE FROM app_rental_request_items')));
assert.ok(purgeQueries.some(({ sql }) => sql.includes('DELETE FROM app_user_term_consent_logs')));
assert.ok(purgeQueries.some(({ sql }) => sql.includes('DELETE FROM app_user_identities')));
assert.ok(purgeQueries.some(({ sql }) => sql.includes('previous_account_uids=COALESCE')));
assert.ok(purgeQueries.some(({ sql }) => sql.includes('rental_event_actor_refs')));


const consolidationQueries = [];
const consolidationTargetUid = 'member:new';
const consolidationOldUid = 'member:old';
const consolidationTargetAppUserId = '202';
const consolidationOldAppUserId = '101';
const consolidationClient = {
  async query(sql, args = []) {
    const text = String(sql);
    consolidationQueries.push({ sql: text, args });
    if (text.includes('SELECT * FROM app_member_accounts WHERE firebase_uid=$1 FOR UPDATE')) {
      return { rows: [{
        firebase_uid: consolidationTargetUid,
        app_user_id: consolidationTargetAppUserId,
        email: 'member@example.com', masked_email: 'm****r@example.com', name: '홍길동', team: '채용대행팀', phone: '010-1234-5678',
        status: 'pending', directory_member_id: '', directory_verified_version: 0, profile_required_reason: '',
        rejoined_account: true, terms_consent_revision: 3, terms_consent_policy_version: 3,
        identity_key: 'identity:new', recovery_key: 'recovery:new', previous_account_uids: [consolidationOldUid],
        authority_mode: 'postgresql-authoritative', mirror_state: 'retired', last_mutation_id: '',
        synced_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }], rowCount: 1 };
    }
    if (text.includes('SELECT * FROM app_member_accounts WHERE firebase_uid=ANY')) {
      return { rows: [{ firebase_uid: consolidationOldUid, app_user_id: consolidationOldAppUserId, status: 'retired' }], rowCount: 1 };
    }
    if (text.includes('SELECT app_user_id, firebase_uid FROM app_user_firebase_links')) {
      return { rows: [{ app_user_id: consolidationOldAppUserId, firebase_uid: consolidationOldUid }], rowCount: 1 };
    }
    if (text.includes('firebase_uid <> ALL') && text.includes('app_user_id=ANY')) return { rows: [], rowCount: 0 };
    if (text.includes('status IN (\'신청중\',\'보류\',\'대여중\')')) return { rows: [{ count: 0 }], rowCount: 1 };
    if (text.includes('SELECT firebase_uid, restriction_exists, restriction_payload')) {
      return { rows: [
        { firebase_uid: consolidationTargetUid, restriction_exists: true, restriction_payload: { uid: consolidationTargetUid, inheritedFromPreviousAccount: true, inheritedFromFirebaseUid: consolidationOldUid } },
        { firebase_uid: consolidationOldUid, restriction_exists: true, restriction_payload: { uid: consolidationOldUid, manualBlock: true } },
      ], rowCount: 2 };
    }
    if (text.includes('AS requests') && text.includes('AS member_refs')) {
      return { rows: [{ requests: 0, rental_event_actor_refs: 0, restrictions: 0, profile_events: 0, member_refs: 0 }], rowCount: 1 };
    }
    if (text.includes('AS members') && text.includes('AS lineage_refs')) {
      return { rows: [{ members: 0, links: 0, requests: 0, rental_event_actor_refs: 0, restrictions: 0, term_states: 0, term_logs: 0, profile_events: 0, lineage_refs: 0 }], rowCount: 1 };
    }
    if (text.includes('SELECT COUNT(*)::bigint AS count FROM app_user_identities')) return { rows: [{ count: 0 }], rowCount: 1 };
    if (/^(UPDATE|DELETE|INSERT)/.test(text.trim())) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
  release() {},
};
const consolidationRepository = createMemberAuthorityRepository({
  async connect() { return consolidationClient; },
  async query() { return { rows: [], rowCount: 0 }; },
});
const consolidationResult = await consolidationRepository.approveRejoinedMemberAndConsolidate({
  firebaseUid: consolidationTargetUid,
  appUserId: consolidationTargetAppUserId,
  actorFirebaseUid: 'admin:smoke',
});
assert.equal(consolidationResult.profile.status, 'active');
assert.equal(consolidationResult.profile.rejoinedAccount, false);
assert.deepEqual(consolidationResult.profile.previousAccountUids, []);
assert.ok(consolidationQueries.some(({ sql }) => sql.includes("source_mode='postgresql-rejoin-consolidated'")));
assert.ok(consolidationQueries.some(({ sql }) => sql.includes('requester_email=$3') && sql.includes('requester_name=$4')));
assert.ok(consolidationQueries.some(({ sql }) => sql.includes("event_payload=CASE WHEN jsonb_typeof(event_payload)='object'")));
assert.ok(consolidationQueries.some(({ sql }) => sql.includes('DELETE FROM app_user_term_consent_logs WHERE firebase_uid=ANY')));
assert.ok(consolidationQueries.some(({ sql }) => sql.includes('DELETE FROM app_member_accounts WHERE firebase_uid=ANY')));
assert.ok(consolidationQueries.some(({ sql }) => sql.includes('DELETE FROM app_user_identities WHERE id=ANY')));

let consolidationCalled = false;
let normalMutationCalled = false;
const consolidationService = createMemberAuthorityService({
  repository: {
    async mutateProfile() { throw new Error('not used'); },
    async mutateStatus() { normalMutationCalled = true; throw new Error('normal mutation must not run for rejoin approval'); },
    async countBlockingRentalRequestsForUids() { return 0; },
    async approveRejoinedMemberAndConsolidate(input) {
      consolidationCalled = true;
      assert.equal(input.firebaseUid, consolidationTargetUid);
      return { mutationId: 'consolidated-mutation', profile: { uid: consolidationTargetUid, status: 'active', rejoinedAccount: false, previousAccountUids: [] }, previousAccountUids: [consolidationOldUid], transferCounts: { rentalRequests: 2 } };
    },
    async findActiveIdentityOwner() { return null; },
    async findDirectoryEntryByIdentityKey() { return null; },
    async getDirectoryBootstrapState() { return { completed: true, version: 0 }; },
    async replaceDirectoryEntries() { return {}; },
    async findByFirebaseUid() {
      return { uid: consolidationTargetUid, firebaseUid: consolidationTargetUid, email: 'member@example.com', name: '홍길동', team: '채용대행팀', phone: '010-1234-5678', status: 'pending', rejoinedAccount: true, previousAccountUids: [consolidationOldUid] };
    },
  },
  firebaseLinkRepository: {
    async findByFirebaseUid() { return { firebaseUid: consolidationTargetUid, appUserId: consolidationTargetAppUserId }; },
    async findByAppUserId() { return null; },
  },
  userRepository: { async findByClerkUserId() { return null; } },
  rentalRestrictionRepository: { async findByFirebaseUid() { return null; } },
  siteContentRepository: { async getDomain() { return { documents: [] }; } },
});
const approvedRejoin = await consolidationService.changeStatusAdmin({
  firebaseIdentity: { source: 'clerk-postgresql', uid: 'admin:smoke' },
  targetUid: consolidationTargetUid,
  nextStatus: 'active',
});
assert.equal(consolidationCalled, true);
assert.equal(normalMutationCalled, false);
assert.equal(approvedRejoin.rejoinConsolidation.completed, true);
assert.deepEqual(approvedRejoin.rejoinConsolidation.previousAccountUids, [consolidationOldUid]);

console.log('[phase34-member-lifecycle-finalization-backend-smoke] PASS');
