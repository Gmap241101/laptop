import assert from 'node:assert/strict';
import fs from 'node:fs';

const identitySource = fs.readFileSync(new URL('../../src/features/auth/useAuthIdentityPolicySubscriptionController.js', import.meta.url), 'utf8');
const termsServiceSource = fs.readFileSync(new URL('../../src/features/terms/termsService.js', import.meta.url), 'utf8');
const termsComplianceSource = fs.readFileSync(new URL('../../src/features/terms/useUserTermsCompliance.js', import.meta.url), 'utf8');
const boardCutoverSource = fs.readFileSync(new URL('../../src/features/boards/boardContentCutover.js', import.meta.url), 'utf8');
const boardControllerSource = fs.readFileSync(new URL('../../src/features/boards/useBoardContentSubscriptionController.js', import.meta.url), 'utf8');
const inquiryApiSource = fs.readFileSync(new URL('../../src/features/inquiries/inquiryApi.js', import.meta.url), 'utf8');
const userWorkspaceSource = fs.readFileSync(new URL('../../src/user/UserWorkspace.jsx', import.meta.url), 'utf8');

assert.match(identitySource, /primeSignupTermsPolicyCache\(authority\.termsPolicy\)/, 'session bootstrap must prime signup terms policy cache before the protected-route terms gate runs');
assert.match(identitySource, /authority\.sessionPolicy/, 'session bootstrap must consume the bundled user session policy');
assert.match(identitySource, /setUserSessionPolicyReady\(true\)/, 'bundled user session policy must resolve readiness without a second critical-path request');
assert.match(identitySource, /authority\.profile/, 'session bootstrap must consume the bundled member profile');
assert.match(identitySource, /setUserProfileReady\(true\)/, 'bundled member profile must resolve profile readiness immediately');
assert.match(identitySource, /setCurrentAuthRoleReady\(true\)/, 'user role readiness must resolve from the authenticated bootstrap response');
assert.match(identitySource, /userSessionBootstrapProfileRef/, 'profile refresh must recognize a session-bootstrap profile and skip the duplicate first read');
assert.match(identitySource, /userSessionPolicyBootstrapRef/, 'session policy effect must recognize bootstrap data and skip the duplicate first read');
assert.match(identitySource, /inquiryApi\.prefetchMemberHome/, 'signed-in inquiry list/config should be warmed only after the critical session bootstrap has completed');

assert.match(termsServiceSource, /SIGNUP_TERMS_POLICY_CACHE_TTL_MS\s*=\s*60_000/, 'signup terms policy client cache must avoid repeated policy reads during navigation');
assert.match(termsServiceSource, /primeSignupTermsPolicyCache/, 'session bootstrap must be able to prime the terms policy cache');
assert.match(termsComplianceSource, /effectivePolicy/, 'terms gate must use freshly primed/cached policy without transient stale-ready races');
assert.match(termsComplianceSource, /effectiveReady/, 'terms gate readiness must track the current refresh key rather than a stale previous result');

assert.match(boardCutoverSource, /BOARD_READ_CACHE_TTL_MS\s*=\s*60_000/, 'community board reads should have a practical fresh cache window');
assert.match(boardCutoverSource, /BOARD_READ_STALE_TTL_MS\s*=\s*5\s*\*\s*60_000/, 'community board reads should retain a bounded stale-while-revalidate window');
assert.match(boardCutoverSource, /getCachedNoticeBoard/, 'notice board must expose cached data for immediate render');
assert.match(boardCutoverSource, /getCachedFaqBoard/, 'FAQ board must expose cached data for immediate render');
assert.match(boardCutoverSource, /prefetchUserCommunityBoards/, 'notice and FAQ first pages must support background warming');
assert.match(boardControllerSource, /const cachedBoard = getCachedNoticeBoard\(requestOptions\)/, 'notice controller must hydrate from cache before network refresh');
assert.match(boardControllerSource, /const cachedBoard = getCachedFaqBoard\(requestOptions\)/, 'FAQ controller must hydrate from cache before network refresh');
assert.match(boardControllerSource, /prefetchUserCommunityBoards\(\)/, 'home board data should warm notice/FAQ list data after the home critical path is ready');

assert.match(inquiryApiSource, /INQUIRY_READ_CACHE_TTL_MS\s*=\s*60_000/, 'inquiry list/config reads should use a bounded client cache');
assert.match(inquiryApiSource, /sessionKey/, 'member inquiry cache must be scoped to the authenticated Clerk session');
assert.match(inquiryApiSource, /async prefetchMemberHome\(\)/, 'member inquiry first page/config must support background warming');
assert.match(inquiryApiSource, /Promise\.allSettled\(\[/, 'inquiry config and member list prefetch should run in parallel');

assert.equal(userWorkspaceSource.includes('requestIdleCallback'), false, 'user workspace must not preload lazy panel chunks and compete with first paint');
assert.equal(userWorkspaceSource.includes("import('../features/inquiries/inquiryApi.js')"), false, 'inquiry data prefetch must not be coupled to the lazy UI workspace');

console.log('[phase34-user-loading-performance-frontend-smoke] PASS');
