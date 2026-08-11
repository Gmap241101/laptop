import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAccountLifecycleService } from '../../server/src/accounts/account-lifecycle-service.mjs';
import { createUserClerkAuthService } from '../../server/src/auth/user-clerk-auth-service.mjs';
import { createUserClerkAuthRepository } from '../../server/src/auth/user-clerk-auth-repository.mjs';

const firebaseUid = 'firebase-phase32-user';
const clerkUserId = 'clerk-phase32-user';
const policy = {
  enabled: true,
  revision: 5,
  requiredRevision: 5,
  initialRevision: 1,
  activeTerms: [
    { id: 'service', title: '이용약관', required: true, version: 2, versionId: 'service-v2', contentHash: 'hash-service-v2' },
    { id: 'marketing', title: '마케팅 수신', required: false, version: 1, versionId: 'marketing-v1', contentHash: 'hash-marketing-v1' },
  ],
};
const siteContentRepository = {
  async getDomain(domain) {
    if (domain === 'rental-config') {
      return { documents: [{ key: 'rentalSystem/publicConfig', payload: { settings: { requireRegisteredMemberForSignup: true, autoApproveNewMembers: true, memberDirectoryVersion: 9 } } }] };
    }
    if (domain === 'terms') return { documents: [{ key: 'signupTermsPolicy/current', payload: policy }] };
    throw new Error(`unexpected domain ${domain}`);
  },
};
let signupArgs = null;
let importedArgs = null;
let savedArgs = null;
let bootstrapCompleted = false;
const repository = {
  async getDirectoryEntry() { return { identity_key: 'x', directory_member_id: 'dir-32', name: '홍길동', team: '채용대행팀', enabled: true }; },
  async findIdentityAccounts() { return []; },
  async createSignupAccount(args) { signupArgs = args; bootstrapCompleted = true; return { firebase_uid: args.firebaseUid, status: args.status, mirror_state: 'retired' }; },
  async getConsentSnapshot() { return { states: {}, logs: [], termsConsentRevision: bootstrapCompleted ? 5 : 0, termsConsentPolicyVersion: bootstrapCompleted ? 5 : 0, bootstrapCompleted }; },
  async importConsents(args) { importedArgs = args; bootstrapCompleted = true; return { states: Object.fromEntries(args.states.map((item) => [item.termId, item])), logs: args.logs, termsConsentRevision: 5, termsConsentPolicyVersion: 5, bootstrapCompleted: true }; },
  async saveConsents(args) { savedArgs = args; bootstrapCompleted = true; return { states: Object.fromEntries(args.decisions.map((item) => [item.termId, item])), logs: [], termsConsentRevision: 5, termsConsentPolicyVersion: 5, bootstrapCompleted: true }; },
};
const userAuthRepository = { async findByClerkUserId(id) { assert.equal(id, clerkUserId); return { firebaseUid }; } };
let legacyStateReads = 0;
let legacyLogReads = 0;
const firestoreClient = {
  async listUserTermConsentStates({ firebaseUid: uid, firebaseIdToken }) {
    assert.equal(uid, firebaseUid); assert.equal(firebaseIdToken, 'firebase-token-32'); legacyStateReads += 1;
    return [{ name: 'projects/p/databases/(default)/documents/userTermConsentStates/state-service', fields: {
      uid, termId: 'service', termVersion: 2, termVersionId: 'service-v2', policyRevision: 5, decision: 'accepted', requiredSnapshot: true,
      titleSnapshot: '이용약관', contentHash: 'hash-service-v2', viewedAtMs: 100, decidedAt: '2026-08-01T01:00:00.000Z', source: 'signup', updatedAt: '2026-08-01T01:00:00.000Z',
    } }];
  },
  async listUserTermConsentLogs({ firebaseUid: uid, firebaseIdToken }) {
    assert.equal(uid, firebaseUid); assert.equal(firebaseIdToken, 'firebase-token-32'); legacyLogReads += 1;
    return [{ name: 'projects/p/databases/(default)/documents/userTermConsentLogs/log-legacy-1', fields: {
      uid, termId: 'service', termVersion: 2, termVersionId: 'service-v2', policyRevision: 5, decision: 'accepted', previousDecision: '', requiredSnapshot: true,
      titleSnapshot: '이용약관', contentHash: 'hash-service-v2', viewedAtMs: 100, createdAt: '2026-08-01T01:00:00.000Z', source: 'signup',
    } }];
  },
};
const disabledService = createAccountLifecycleService({
  repository,
  siteContentRepository,
  userAuthRepository,
  firestoreClient,
  authorityEnabled: false,
});
for (const invoke of [
  () => disabledService.signup({ firebaseIdentity: { uid: firebaseUid, idToken: 'firebase-token-32', email: 'member@example.com' }, input: {} }),
  () => disabledService.getTerms({ clerkUserId }),
  () => disabledService.bootstrapTerms({ clerkUserId, firebaseIdentity: { uid: firebaseUid, idToken: 'firebase-token-32' } }),
  () => disabledService.saveTerms({ clerkUserId, input: {} }),
]) {
  await assert.rejects(invoke, (error) => error?.code === 'account_lifecycle_authority_disabled' && error?.status === 503);
}
assert.equal(signupArgs, null, 'disabled Phase 32 authority must fail before PostgreSQL signup mutation');
assert.equal(importedArgs, null, 'disabled Phase 32 authority must fail before legacy terms import');
assert.equal(savedArgs, null, 'disabled Phase 32 authority must fail before terms mutation');

const service = createAccountLifecycleService({
  repository,
  siteContentRepository,
  userAuthRepository,
  firestoreClient,
  authorityEnabled: true,
});
const termsSubmission = {
  policyRevision: 5,
  decisions: [
    { termId: 'service', termVersion: 2, termVersionId: 'service-v2', contentHash: 'hash-service-v2', decision: 'accepted', viewedAtMs: 100 },
    { termId: 'marketing', termVersion: 1, termVersionId: 'marketing-v1', contentHash: 'hash-marketing-v1', decision: 'declined', viewedAtMs: 101 },
  ],
};
const signup = await service.signup({ firebaseIdentity: { uid: firebaseUid, idToken: 'firebase-token-32', email: 'member@example.com' }, input: {
  email: 'member@example.com', name: '홍길동', team: '채용대행팀', phone: '010-1234-5678', terms: termsSubmission,
} });
assert.equal(signup.source, 'postgresql');
assert.equal(signup.firestoreBootstrap, 'retired');
assert.equal(signup.status, 'active');
assert.equal(signupArgs.directoryMemberId, 'dir-32');
assert.equal(signupArgs.directoryVerifiedVersion, 9);
assert.equal(signupArgs.decisions.length, 2);

bootstrapCompleted = false;
const firstRead = await service.getTerms({ clerkUserId });
assert.equal(firstRead.source, 'postgresql');
assert.equal(firstRead.bootstrapRequired, true);
assert.equal(firstRead.termsConsentRevision, 0);
await assert.rejects(
  () => service.bootstrapTerms({ clerkUserId, firebaseIdentity: { uid: 'wrong-uid', idToken: 'firebase-token-32' } }),
  (error) => error?.code === 'terms_firebase_identity_mismatch',
);
const bootstrapped = await service.bootstrapTerms({ clerkUserId, firebaseIdentity: { uid: firebaseUid, idToken: 'firebase-token-32' } });
assert.equal(bootstrapped.source, 'postgresql');
assert.equal(bootstrapped.bootstrapRequired, false);
assert.equal(bootstrapped.legacyBootstrap, 'imported');
assert.equal(bootstrapped.termsConsentRevision, 5);
assert.equal(legacyStateReads, 1);
assert.equal(legacyLogReads, 1);
assert.equal(importedArgs.states[0].source, 'legacy-firestore:signup');
assert.equal(importedArgs.logs[0].id, 'log-legacy-1');
const saved = await service.saveTerms({ clerkUserId, input: termsSubmission });
assert.equal(saved.firestoreMirror, 'retired');
assert.equal(savedArgs.decisions.length, 2);

let firestoreUserAccountReads = 0;
let compatibilitySyncCalls = 0;
const authRepository = {
  async findByClerkUserId() { return null; },
  async syncMemberFromCompatibility() { compatibilitySyncCalls += 1; },
  async linkAuthority() { return true; },
  async findByFirebaseUid(uid) { return { firebaseUid: uid, memberStatus: 'active', email: 'member@example.com' }; },
};
const clerkClient = {
  async getUser() { return { primaryEmail: 'member@example.com' }; },
  async findUserByEmail() { return null; },
  async createUser({ email }) { return { clerkUserId, primaryEmail: email, privateMetadata: {}, publicMetadata: {} }; },
  async updateUser() { throw new Error('not expected'); },
  async updateUserMetadata(userId, metadata) { return { clerkUserId: userId, primaryEmail: 'member@example.com', ...metadata }; },
  async verifyPassword() {},
  async deleteUser() {},
};
const userRepository = { async upsertFromClerk() { return { id: 32, clerkUserId }; } };
const firebaseLinkRepository = { async link() { return { appUserId: 32, firebaseUid }; } };
const authFirestoreClient = {
  async getAdminAccount() { return null; },
  async getUserAccount() { firestoreUserAccountReads += 1; throw new Error('Phase 32 provision must not read Firestore userAccounts.'); },
};
const memberRepository = { async findByFirebaseUid(uid) { return { firebaseUid: uid, email: 'member@example.com', name: '홍길동', team: '채용대행팀', phone: '010-1234-5678', status: 'active' }; } };
const userClerkAuthService = createUserClerkAuthService({
  repository: authRepository, clerkClient, userRepository, firebaseLinkRepository, firestoreClient: authFirestoreClient,
  memberRepository, accountLifecycleCompatibilityDisabled: true,
});
const provision = await userClerkAuthService.provisionCurrent({ firebaseIdentity: {
  uid: firebaseUid, idToken: 'firebase-token-32', email: 'member@example.com', authTime: Math.floor(Date.now() / 1000),
}, password: 'Password1234' });
assert.equal(provision.provisioned, true);
assert.equal(firestoreUserAccountReads, 0);
assert.equal(compatibilitySyncCalls, 0);

const runtimeReadModelQueries = [];
const runtimeReadModelPool = {
  async query(sql, params = []) {
    runtimeReadModelQueries.push({ sql, params });
    if (sql.includes('UPDATE app_member_accounts') && sql.includes('RETURNING firebase_uid')) {
      return { rows: [{ firebase_uid: firebaseUid }] };
    }
    if (sql.includes('UPDATE app_member_accounts') && sql.includes('RETURNING app_user_id, firebase_uid')) {
      return { rows: [{ app_user_id: 32, firebase_uid: firebaseUid }] };
    }
    if (sql.includes('INSERT INTO app_user_member_shadows')) return { rows: [] };
    if (sql.includes('INSERT INTO app_user_rental_restriction_shadows')) return { rows: [] };
    if (sql.includes('FROM app_user_identities u') && sql.includes('WHERE l.firebase_uid = $1')) {
      return { rows: [{
        app_user_id: 32, clerk_user_id: clerkUserId, primary_email: 'member@example.com',
        firebase_uid: firebaseUid, firebase_email: 'member@example.com', member_status: 'active',
        auth_authority_mode: 'clerk-authoritative', lifecycle_authority_mode: 'postgresql-authoritative',
        clerk_account_state: 'active', clerk_linked_at: null, clerk_last_verified_at: null,
        password_authority_updated_at: null, withdrawn_at: null,
      }] };
    }
    throw new Error(`unexpected runtime read-model SQL: ${sql}`);
  },
};
const runtimeReadModelRepository = createUserClerkAuthRepository(runtimeReadModelPool);
assert.equal(await runtimeReadModelRepository.linkAuthority({ appUserId: 32, firebaseUid }), true);
await runtimeReadModelRepository.markVerifiedLogin({ firebaseUid });
const memberReadModelQueries = runtimeReadModelQueries.filter(({ sql }) => sql.includes('INSERT INTO app_user_member_shadows'));
const restrictionReadModelQueries = runtimeReadModelQueries.filter(({ sql }) => sql.includes('INSERT INTO app_user_rental_restriction_shadows'));
assert.equal(memberReadModelQueries.length, 2, 'signup provision and first verified login must both self-heal the PostgreSQL member read model');
assert.equal(restrictionReadModelQueries.length, 2, 'signup provision and first verified login must both self-heal the PostgreSQL default restriction read model');
for (const { sql } of memberReadModelQueries) {
  assert.ok(sql.includes("m.lifecycle_authority_mode='postgresql-authoritative'"));
  assert.ok(sql.includes('m.terms_consent_bootstrap_completed_at IS NOT NULL'));
  assert.ok(sql.includes("source_collection=EXCLUDED.source_collection"));
  assert.ok(sql.includes("authority_mode='postgresql-authoritative'"));
  assert.ok(sql.includes("mirror_state='retired'"));
}
for (const { sql } of restrictionReadModelQueries) {
  assert.ok(sql.includes('restriction_exists, restriction_payload'));
  assert.ok(sql.includes("false, '{}'::jsonb"));
  assert.ok(sql.includes("app_user_rental_restriction_shadows.restriction_exists=false"));
  assert.ok(sql.includes("app_user_rental_restriction_shadows.authority_mode='postgresql-authoritative'"));
}

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [migration, repoSource, serviceSource, appSource, envSource, indexSource, firestoreSource, authServiceSource, authRepoSource] = await Promise.all([
  read('server/migrations/024_phase32_account_lifecycle_postgresql_authority.sql'),
  read('server/src/accounts/account-lifecycle-repository.mjs'),
  read('server/src/accounts/account-lifecycle-service.mjs'),
  read('server/src/app.mjs'),
  read('server/src/config/env.mjs'),
  read('server/src/index.mjs'),
  read('server/src/firestore/firestore-members.mjs'),
  read('server/src/auth/user-clerk-auth-service.mjs'),
  read('server/src/auth/user-clerk-auth-repository.mjs'),
]);
for (const marker of ['CREATE TABLE IF NOT EXISTS app_user_term_consent_states', 'CREATE TABLE IF NOT EXISTS app_user_term_consent_logs', 'terms_consent_bootstrap_completed_at', "'phase', 32", "'password_reset_delivery', 'firebase-auth-compatibility-preserved'"]) assert.ok(migration.includes(marker), marker);
for (const marker of ['createSignupAccount', 'importConsents', 'saveConsents', 'terms_consent_bootstrap_completed_at', 'terms_consent_revision, terms_consent_policy_version', 'GREATEST(terms_consent_revision, $2)', "mirror_state='retired'"]) assert.ok(repoSource.includes(marker), marker);
for (const marker of ['authorityEnabled = false', 'assertAuthorityEnabled', 'account_lifecycle_authority_disabled', 'bootstrapTerms', 'listUserTermConsentStates', 'legacy-firestore:', "firestoreBootstrap: 'retired'"]) assert.ok(serviceSource.includes(marker), marker);
for (const marker of ["'/api/users/signup/bootstrap'", "'/api/users/me/terms-consent/bootstrap'", 'accountLifecycleCompatibilityDisabled', "passwordResetDelivery: 'firebase-auth-compatibility-preserved'", "runtimeRevision: 'phase32-canonical-member-profile-read-20260811-2054'"]) assert.ok(appSource.includes(marker), marker);
assert.ok(envSource.includes('FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED'));
assert.ok(indexSource.includes('firestoreClient: firestoreMemberAuthorityClient'));
assert.ok(indexSource.includes('authorityEnabled: config.accountLifecycleCompatibilityDisabled'));
assert.ok(firestoreSource.includes('listUserTermConsentStates'));
assert.ok(firestoreSource.includes('listUserTermConsentLogs'));
for (const marker of ['readProvisionUser', 'memberRepository.findByFirebaseUid', 'if (!accountLifecycleCompatibilityDisabled)']) assert.ok(authServiceSource.includes(marker), marker);
for (const marker of ['materializePostgresqlRuntimeReadModels', 'app_user_member_shadows', 'app_user_rental_restriction_shadows', "m.lifecycle_authority_mode='postgresql-authoritative'", 'm.terms_consent_bootstrap_completed_at IS NOT NULL']) assert.ok(authRepoSource.includes(marker), marker);
console.log('[account-lifecycle-authority-backend-smoke] PASS (backend flag gates Phase 32 service, PostgreSQL signup/terms authority, PG-only signup read-model self-heal, one-time trusted terms import, Firebase reset preserved)');
