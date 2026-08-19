import assert from 'node:assert/strict';
import fs from 'node:fs';

const identitySource = fs.readFileSync(new URL('../../src/features/auth/useAuthIdentityPolicySubscriptionController.js', import.meta.url), 'utf8');
const termsServiceSource = fs.readFileSync(new URL('../../src/features/terms/termsService.js', import.meta.url), 'utf8');
const termsComplianceSource = fs.readFileSync(new URL('../../src/features/terms/useUserTermsCompliance.js', import.meta.url), 'utf8');
const boardCutoverSource = fs.readFileSync(new URL('../../src/features/boards/boardContentCutover.js', import.meta.url), 'utf8');
const boardControllerSource = fs.readFileSync(new URL('../../src/features/boards/useBoardContentSubscriptionController.js', import.meta.url), 'utf8');
const inquiryApiSource = fs.readFileSync(new URL('../../src/features/inquiries/inquiryApi.js', import.meta.url), 'utf8');
const userWorkspaceSource = fs.readFileSync(new URL('../../src/user/UserWorkspace.jsx', import.meta.url), 'utf8');

// Render-safety contract: session bootstrap must not inject a partial profile/policy shape
// into the React render path before the canonical profile/terms subscriptions settle.
assert.equal(identitySource.includes('userSessionBootstrapProfileRef'), false, 'session bootstrap profile injection must remain disabled after the user render crash regression');
assert.equal(identitySource.includes('userSessionPolicyBootstrapRef'), false, 'session bootstrap session-policy injection must remain disabled after the user render crash regression');
assert.equal(identitySource.includes('primeSignupTermsPolicyCache(authority.termsPolicy)'), false, 'session response must not mutate the terms render cache directly');
assert.equal(identitySource.includes('authority.profile'), false, 'partial session profile must not become the render-time user profile');
assert.equal(identitySource.includes('authority.sessionPolicy'), false, 'partial bundled session policy must not become render-time policy state');

// Terms keep the existing bounded client cache, but the stable compliance hook remains the authority.
assert.match(termsServiceSource, /SIGNUP_TERMS_POLICY_CACHE_TTL_MS\s*=\s*60_000/, 'signup terms policy client cache must avoid repeated policy reads during navigation');
assert.match(termsComplianceSource, /effectivePolicy/, 'terms gate must keep normalized cached-policy handling');
assert.match(termsComplianceSource, /effectiveReady/, 'terms gate readiness must remain tied to the current refresh result');

// Community reads use a longer bounded cache and safe idle warming, without stale data being
// pushed synchronously into panel state before the normal request resolves.
assert.match(boardCutoverSource, /BOARD_READ_CACHE_TTL_MS\s*=\s*60_000/, 'community board reads should have a practical fresh cache window');
assert.equal(boardCutoverSource.includes('BOARD_READ_STALE_TTL_MS'), false, 'stale synchronous board hydration is disabled for render safety');
assert.equal(boardCutoverSource.includes('getCachedNoticeBoard'), false, 'notice panel must not synchronously inject stale cached board state');
assert.equal(boardCutoverSource.includes('getCachedFaqBoard'), false, 'FAQ panel must not synchronously inject stale cached board state');
assert.match(boardCutoverSource, /prefetchUserCommunityBoards/, 'notice and FAQ first pages must support safe background warming');
assert.match(boardControllerSource, /prefetchUserCommunityBoards\(\)/, 'home board data should warm notice/FAQ data after the home critical path is ready');
assert.equal(boardControllerSource.includes('const cachedBoard = getCachedNoticeBoard'), false, 'notice render path must use the established async state transition');
assert.equal(boardControllerSource.includes('const cachedBoard = getCachedFaqBoard'), false, 'FAQ render path must use the established async state transition');

// Inquiry cache remains session-scoped and mutation-invalidated. It is not injected into auth state.
assert.match(inquiryApiSource, /INQUIRY_READ_CACHE_TTL_MS\s*=\s*60_000/, 'inquiry list/config reads should use a bounded client cache');
assert.match(inquiryApiSource, /sessionKey/, 'member inquiry cache must be scoped to the authenticated Clerk session');
assert.match(inquiryApiSource, /invalidateInquiryReadCache\('member:'\)/, 'member inquiry mutations must invalidate cached member lists');
assert.match(inquiryApiSource, /async prefetchMemberHome\(\)/, 'inquiry data may still expose an explicit non-rendering prefetch helper');

assert.equal(userWorkspaceSource.includes('requestIdleCallback'), false, 'user workspace must not preload lazy panel chunks and compete with first paint');
assert.equal(userWorkspaceSource.includes("import('../features/inquiries/inquiryApi.js')"), false, 'inquiry data prefetch must not be coupled to the lazy UI workspace');

console.log('[phase34-user-loading-performance-frontend-smoke] PASS');
