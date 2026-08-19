import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createUserClerkAuthService } from '../../server/src/auth/user-clerk-auth-service.mjs';


let clerkBackendReads = 0;
let verifiedLoginWrites = 0;
const testAccount = Object.freeze({
  appUserId: 'app-user-1',
  clerkUserId: 'clerk-user-1',
  firebaseUid: 'member-1',
  firebaseEmail: 'member@example.com',
  memberEmail: 'member@example.com',
  memberName: '회원1',
  memberTeam: '테스트팀',
  memberPhone: '010-0000-0000',
  memberStatus: 'active',
  clerkAccountState: 'active',
});
const fastAuthService = createUserClerkAuthService({
  repository: {
    async findByClerkUserId(id) { return id === 'clerk-user-1' ? testAccount : null; },
    async findByFirebaseUid(uid) { return uid === 'member-1' ? testAccount : null; },
    async markVerifiedLogin() { verifiedLoginWrites += 1; return testAccount; },
  },
  clerkClient: {
    async getUser() { clerkBackendReads += 1; return { clerkUserId: 'clerk-user-1', primaryEmail: 'member@example.com', displayName: '회원1' }; },
    async findUserByEmail() { return null; },
    async createUser() { throw new Error('not used'); },
    async updateUser() { throw new Error('not used'); },
    async updateUserMetadata() { throw new Error('not used'); },
    async verifyPassword() { return { verified: true }; },
    async deleteUser() {},
  },
  userRepository: { async upsertFromClerk() { return { id: 'app-user-1' }; } },
  firebaseLinkRepository: { async link() {} },
  adminIdentityRepository: {
    async findByFirebaseUid() { return null; },
    async findByClerkUserId() { return null; },
  },
  accountLifecycleCompatibilityDisabled: true,
  userFirebaseAuthCompatibilityDisabled: false,
});
const fastResult = await fastAuthService.getCurrentFast({ clerkUserId: 'clerk-user-1' });
assert.equal(fastResult.verification, 'local-jwt-postgresql');
assert.equal(fastResult.account.firebaseUid, 'member-1');
assert.equal(clerkBackendReads, 0, 'fast protected reads must not call Clerk Backend API');
assert.equal(verifiedLoginWrites, 0, 'fast protected reads must not write login verification state');
const strongResult = await fastAuthService.getCurrent({ clerkUserId: 'clerk-user-1' });
assert.equal(strongResult.verification, 'clerk-backend-postgresql');
assert.equal(clerkBackendReads, 1, 'explicit strong verification must still call Clerk Backend API');
assert.equal(verifiedLoginWrites, 1, 'explicit strong verification must still persist verified login state');

const userAuthServiceSource = fs.readFileSync(new URL('../../server/src/auth/user-clerk-auth-service.mjs', import.meta.url), 'utf8');
const userAuthRepositorySource = fs.readFileSync(new URL('../../server/src/auth/user-clerk-auth-repository.mjs', import.meta.url), 'utf8');
const serverAppSource = fs.readFileSync(new URL('../../server/src/app.mjs', import.meta.url), 'utf8');
const accountLifecycleSource = fs.readFileSync(new URL('../../server/src/accounts/account-lifecycle-service.mjs', import.meta.url), 'utf8');

const fastCurrentBlock = userAuthServiceSource.match(/const getCurrentFast = async \(clerkUserId\) => \{[\s\S]*?\n  \};\n\n  const getCurrent = async/)?.[0] || '';
assert.ok(fastCurrentBlock, 'user auth service must expose a dedicated fast current-user authority path');
assert.equal(fastCurrentBlock.includes('clerkClient.getUser'), false, 'routine fast user authority must not call Clerk Backend API');
assert.equal(fastCurrentBlock.includes('markVerifiedLogin'), false, 'routine fast user authority must not write verified-login state on every protected read');
assert.match(fastCurrentBlock, /repository\.findByClerkUserId/, 'fast user authority must resolve the PostgreSQL-linked member account');

const strongCurrentBlock = userAuthServiceSource.match(/const getCurrent = async \(clerkUserId\) => \{[\s\S]*?\n  \};\n\n  return Object\.freeze/)?.[0] || '';
assert.ok(strongCurrentBlock, 'strong user authority path must remain available for explicit verification flows');
assert.match(strongCurrentBlock, /clerkClient\.getUser/, 'strong authority must preserve Clerk Backend verification when explicitly required');
assert.match(strongCurrentBlock, /repository\.markVerifiedLogin/, 'strong authority must preserve verified-login persistence when explicitly required');
assert.match(userAuthServiceSource, /getCurrentFast:\s*\(\{ clerkUserId \}\)\s*=>\s*getCurrentFast\(clerkUserId\)/, 'fast authority must be exported');

const authenticateUserAuthorityBlock = serverAppSource.match(/const authenticateUserAuthority = async \(request, response, headers, requestId\) => \{[\s\S]*?\n  \};/)?.[0] || '';
assert.ok(authenticateUserAuthorityBlock, 'server must define protected-user authority helper');
assert.match(authenticateUserAuthorityBlock, /userClerkAuthService\.getCurrentFast/, 'routine protected APIs must prefer the fast PostgreSQL authority path');

const sessionRouteBlock = serverAppSource.match(/if \(request\.method === 'GET' && url\.pathname === '\/api\/users\/auth\/session'\) \{[\s\S]*?\n      return;\n    \}/)?.[0] || '';
assert.ok(sessionRouteBlock, 'user session bootstrap route must exist');
assert.match(sessionRouteBlock, /Promise\.all\(\[/, 'user session bootstrap must parallelize independent PostgreSQL policy/profile reads');
assert.match(sessionRouteBlock, /accountLifecycleService\.getPolicy/, 'session bootstrap must include the active signup terms policy');
assert.match(sessionRouteBlock, /systemConfigService\.get\('user-session-policy'\)/, 'session bootstrap must include the user session policy');
assert.match(sessionRouteBlock, /profile,/, 'session bootstrap must include the PostgreSQL member profile');
assert.match(sessionRouteBlock, /termsPolicy:/, 'session bootstrap must expose terms policy to prime the client cache');
assert.match(sessionRouteBlock, /sessionPolicy:/, 'session bootstrap must expose user session policy to avoid a second critical-path request');

assert.match(accountLifecycleSource, /TERMS_POLICY_READ_CACHE_TTL_MS\s*=\s*30_000/, 'terms policy read cache must bound repeated PostgreSQL reads during session bootstrap');
assert.match(accountLifecycleSource, /loadTermsPolicyCached/, 'terms policy cache loader must exist');
assert.match(accountLifecycleSource, /async getPolicy\(\)/, 'account lifecycle service must expose cached policy reads for session bootstrap');

for (const field of ['memberEmail', 'memberName', 'memberTeam', 'memberPhone', 'termsConsentRevision', 'termsConsentPolicyVersion']) {
  assert.ok(userAuthRepositorySource.includes(field), `fast PostgreSQL user authority must include ${field} required by bootstrap profile/terms gates`);
}

console.log('[phase34-user-loading-performance-backend-smoke] PASS');
