import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createUserClerkAuthService } from '../../server/src/auth/user-clerk-auth-service.mjs';

let adminReads = 0;
let memberReads = 0;
let clerkReads = 0;
let verifiedWrites = 0;

const account = Object.freeze({
  appUserId: '1',
  clerkUserId: 'user_perf',
  primaryEmail: 'perf@example.com',
  firebaseUid: 'member-perf',
  firebaseEmail: 'perf@example.com',
  email: 'perf@example.com',
  maskedEmail: 'p***@example.com',
  name: '성능테스트',
  team: '개발팀',
  phone: '010-1234-5678',
  status: 'active',
  memberStatus: 'active',
  termsConsentRevision: 7,
  termsConsentPolicyVersion: 7,
  authAuthorityMode: 'clerk-authoritative',
  lifecycleAuthorityMode: 'postgresql-authoritative',
  clerkAccountState: 'active',
});

const repository = {
  async findByClerkUserId() { memberReads += 1; return account; },
  async findByFirebaseUid() { return account; },
  async markVerifiedLogin() { verifiedWrites += 1; return account; },
};
const adminIdentityRepository = {
  async findByClerkUserId() { adminReads += 1; return null; },
  async findByFirebaseUid() { return null; },
};
const clerkClient = {
  async getUser() { clerkReads += 1; return { clerkUserId: 'user_perf', primaryEmail: 'perf@example.com', displayName: '성능테스트' }; },
  async findUserByEmail() { return null; },
  async createUser() { throw new Error('not used'); },
  async updateUser() { return null; },
  async updateUserMetadata() { return null; },
  async verifyPassword() { return { verified: true }; },
  async deleteUser() { return null; },
};
const service = createUserClerkAuthService({
  repository,
  clerkClient,
  userRepository: { async upsertFromClerk() { return { id: '1' }; } },
  firebaseLinkRepository: { async link() { return true; } },
  memberRepository: { async findByFirebaseUid() { return account; } },
  adminIdentityRepository,
  accountLifecycleService: { async signup() {}, async provisionAdminMember() {} },
  accountLifecycleCompatibilityDisabled: true,
  userFirebaseAuthCompatibilityDisabled: true,
});

const [first, second] = await Promise.all([
  service.getCurrent({ clerkUserId: 'user_perf' }),
  service.getCurrent({ clerkUserId: 'user_perf' }),
]);
assert.equal(first, second, 'concurrent user authority checks must share the exact verified result');
assert.equal(adminReads, 1, 'concurrent checks must coalesce administrator exclusion lookup');
assert.equal(memberReads, 1, 'concurrent checks must coalesce member authority lookup');
assert.equal(clerkReads, 1, 'concurrent checks must coalesce Clerk Backend API user lookup');
assert.equal(verifiedWrites, 1, 'concurrent checks must coalesce verified-login write path');
assert.equal(first.account.name, '성능테스트', 'verified session authority result must retain the authoritative member profile fields');
assert.equal(first.account.termsConsentRevision, 7, 'verified session authority result must retain the current terms consent revision');

const third = await service.getCurrent({ clerkUserId: 'user_perf' });
assert.equal(third, first, 'immediate repeated check must reuse the bounded verified result');
assert.equal(clerkReads, 1, 'bounded cache must avoid an immediate duplicate Clerk Backend API lookup');

await service.verifyPassword({ clerkUserId: 'user_perf', password: 'password88' });
assert.equal(clerkReads, 2, 'security-sensitive password verification must force a fresh authority check');

const serviceSource = fs.readFileSync(new URL('../../server/src/auth/user-clerk-auth-service.mjs', import.meta.url), 'utf8');
const repositorySource = fs.readFileSync(new URL('../../server/src/auth/user-clerk-auth-repository.mjs', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../../server/src/app.mjs', import.meta.url), 'utf8');
assert.equal(serviceSource.includes('getCurrentFast'), false, 'removed fast-path must not be reintroduced');
assert.ok(serviceSource.includes('CURRENT_USER_AUTH_CACHE_TTL_MS = 3000'), 'user authority cache must stay short and bounded');
assert.ok(repositorySource.includes('m.name AS member_name'), 'session authority query must project the existing canonical member profile without a follow-up member query');
assert.ok(repositorySource.includes('m.terms_consent_revision'), 'session authority query must project the current terms consent revision');
assert.ok(repositorySource.includes('app_rental_restrictions.app_user_id IS DISTINCT FROM EXCLUDED.app_user_id'), 'restriction ensure must not rewrite an unchanged row');
assert.ok(repositorySource.includes('RETURNING u.id AS app_user_id'), 'verified-login update must return the authority row without a redundant re-read');
assert.ok(appSource.includes('const [result, signupTermsPolicy] = await Promise.all(['), 'user session response must read auth authority and terms policy in parallel');
assert.ok(appSource.includes('memberProfile: {'), 'user session response must bundle the canonical member profile');
assert.ok(appSource.includes('...(signupTermsPolicy ? { signupTermsPolicy } : {})'), 'terms bundle failure must degrade to the existing standalone fallback instead of failing authentication');

console.log('[phase34-user-loading-performance-backend-smoke] PASS');
