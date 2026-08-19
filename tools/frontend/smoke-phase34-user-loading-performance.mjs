import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const workspace = read('src/user/UserWorkspace.jsx');
const termsHook = read('src/features/terms/useUserTermsCompliance.js');
const userMain = read('src/user-main.jsx');
const clerkClient = read('src/clerk/clerkStagingClient.js');
const boardCutover = read('src/features/boards/boardContentCutover.js');
const inquiryApi = read('src/features/inquiries/inquiryApi.js');
const userShell = read('src/user/UserShell.jsx');

assert.ok(workspace.includes('!firebaseAuthReady || !currentAuthRoleReady'), 'login readiness gate must remain unchanged');
assert.ok(workspace.includes('!userProfileReady || !termsCompliance.ready'), 'profile/terms readiness gate must remain unchanged');
assert.equal(workspace.includes('effectiveReady'), false, 'failed effectiveReady shortcut must not return');
assert.equal(termsHook.includes('effectiveReady'), false, 'terms hook must keep its original ready state machine');
assert.equal(clerkClient.includes('getCurrentFast'), false, 'frontend must not depend on a fast user-authority endpoint');

assert.ok(userMain.includes('PROTECTED_USER_TABS.has(initialRoute.userTab)'), 'direct protected routes must prewarm terms policy without bypassing readiness');
assert.ok(userMain.includes('preloadSignupTermsPolicy'), 'terms policy prewarm must reuse the existing bounded terms cache');
assert.ok(clerkClient.includes('clerkSessionTokenPending = new WeakMap()'), 'concurrent Clerk token reads must be coalesced');
assert.ok(clerkClient.includes('USER_SESSION_VERIFICATION_CACHE_TTL_MS = 3000'), 'session verification reuse must be short and bounded');
assert.ok(boardCutover.includes('BOARD_READ_CACHE_TTL_MS = 30_000'), 'board list cache must remain bounded');
assert.ok(inquiryApi.includes('INQUIRY_READ_CACHE_TTL_MS = 15_000'), 'inquiry list/config cache must remain bounded');
assert.ok(inquiryApi.includes('member-list|${sessionKey}|${path}'), 'member inquiry cache must be scoped to the active Clerk session');
assert.ok(inquiryApi.includes("clearInquiryReadCache('member-list|')"), 'member inquiry mutations must invalidate cached lists');
assert.ok(userShell.includes('onPointerEnter={prefetchUserNotice}'), 'notice prefetch must be tied to explicit user intent');
assert.ok(userShell.includes('onPointerEnter={prefetchUserFaq}'), 'FAQ prefetch must be tied to explicit user intent');
assert.ok(userShell.includes('prefetchUserInquiry(Boolean(firebaseAuthUser))'), 'inquiry prefetch must preserve member/public scope');

assert.equal(userShell.includes('requestIdleCallback'), false, 'community list prefetch must not use broad idle prefetch');
assert.equal(boardCutover.includes('staleWhileRevalidate'), false, 'board rendering must not use a stale-while-revalidate shortcut');

console.log('[phase34-user-loading-performance-frontend-smoke] PASS');
