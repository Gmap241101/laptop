import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const workspace = read('src/user/UserWorkspace.jsx');
const termsHook = read('src/features/terms/useUserTermsCompliance.js');
const termsService = read('src/features/terms/termsService.js');
const authController = read('src/features/auth/useAuthIdentityPolicySubscriptionController.js');
const userMain = read('src/user-main.jsx');
const clerkClient = read('src/clerk/clerkStagingClient.js');
const boardCutover = read('src/features/boards/boardContentCutover.js');
const boardController = read('src/features/boards/useBoardContentSubscriptionController.js');
const inquiryApi = read('src/features/inquiries/inquiryApi.js');
const inquiryPanel = read('src/user/UserInquiryPanel.jsx');
const userShell = read('src/user/UserShell.jsx');

assert.ok(workspace.includes('!firebaseAuthReady || !currentAuthRoleReady'), 'login readiness gate must remain unchanged');
assert.ok(workspace.includes('!userProfileReady || !termsCompliance.ready'), 'profile/terms readiness gate must remain unchanged');
assert.ok(workspace.includes('enabled: isProtectedUserTab && hasFirebaseAuthSession && firebaseAuthReady'), 'terms policy read must wait for verified session bootstrap so bundled policy can be consumed before any fallback request');
assert.equal(workspace.includes('effectiveReady'), false, 'failed effectiveReady shortcut must not return');
assert.equal(termsHook.includes('effectiveReady'), false, 'terms hook must keep its original ready state machine');
assert.equal(clerkClient.includes('getCurrentFast'), false, 'frontend must not depend on a fast user-authority endpoint');

assert.ok(termsService.includes('primeSignupTermsPolicy'), 'verified session bootstrap must be able to seed the existing bounded terms cache');
assert.ok(authController.includes('primeSignupTermsPolicy(sessionPayload.signupTermsPolicy)'), 'auth bootstrap must seed terms before publishing readiness');
assert.ok(authController.includes('normalizeMemberProfileRead(authority.memberProfile'), 'auth bootstrap must consume the authoritative member profile bundled with the session');
assert.ok(authController.includes("source: 'postgresql-auth-session'"), 'profile controller must reuse the verified session profile instead of issuing a sequential initial profile read');
assert.ok(authController.includes("setCurrentAuthRoleReady(true)"), 'successful general-user session bootstrap must publish role readiness in the same bootstrap turn');
assert.ok(workspace.includes('약관 적용 상태를 확인하는 중입니다.'), 'the original fallback readiness UI must remain available when the session bundle is unavailable');

assert.ok(userMain.includes("initialRoute.userTab === 'signup'"), 'signup must continue to prewarm its terms policy independently');
assert.ok(userMain.includes('Protected user routes receive the current terms policy'), 'protected routes must use the verified session terms bundle instead of a duplicate startup request');
assert.equal(userMain.includes('requestNoticeBoard'), false, 'user entrypoint must not compete with first paint by starting board reads');
assert.equal(userMain.includes('preloadPublicCommunityData'), false, 'community warmup must stay out of the critical user entrypoint');

assert.ok(clerkClient.includes('clerkSessionTokenPending = new WeakMap()'), 'concurrent Clerk token reads must be coalesced');
assert.ok(clerkClient.includes('USER_SESSION_VERIFICATION_CACHE_TTL_MS = 3000'), 'session verification reuse must remain short and bounded');
assert.ok(boardCutover.includes('BOARD_READ_CACHE_TTL_MS = 60_000'), 'board list cache must remain bounded while covering normal menu navigation');
assert.ok(boardCutover.includes('getCachedNoticeBoard'), 'notice controller must be able to consume a completed prefetch synchronously');
assert.ok(boardCutover.includes('getCachedFaqBoard'), 'FAQ controller must be able to consume a completed prefetch synchronously');
assert.ok(boardController.includes('cachedNoticeBoard'), 'notice route must apply a warm first-page result without entering the loading state');
assert.ok(boardController.includes('cachedFaqBoard'), 'FAQ route must apply a warm first-page result without entering the loading state');

assert.ok(inquiryApi.includes('INQUIRY_READ_CACHE_TTL_MS = 30_000'), 'inquiry list/config cache must remain bounded');
assert.ok(inquiryApi.includes('peekPublicConfig'), 'inquiry panel must be able to synchronously consume prefetched config');
assert.ok(inquiryApi.includes('peekMemberList'), 'inquiry panel must be able to synchronously consume a prefetched member list');
assert.ok(inquiryApi.includes('member-list|${sessionKey}|${path}'), 'member inquiry cache must remain scoped to the active Clerk session');
assert.ok(inquiryApi.includes("clearInquiryReadCache('member-list|')"), 'member inquiry mutations must invalidate cached lists');
assert.ok(inquiryPanel.includes('cachedMemberList'), 'inquiry first render must initialize from a completed session-scoped prefetch when available');
assert.ok(inquiryPanel.includes('if (!warmConfig && !warmList)'), 'inquiry panel must use completed warm data before starting both network reads');
assert.ok(inquiryPanel.includes('else if (!warmList)'), 'inquiry panel must fetch the member list only when its warm value is unavailable');
assert.ok(inquiryApi.includes('peekGuestList'), 'verified guest inquiry lists must be able to reuse a completed first-page read');
assert.ok(inquiryApi.includes('peekMemberDetail'), 'member inquiry detail reads must have a short completed-read cache');
assert.ok(inquiryApi.includes('peekGuestDetail'), 'guest inquiry detail reads must have a short completed-read cache');
assert.ok(inquiryPanel.includes('!hasFirebaseAuthSession && (configLoading || !config)'), 'member list/detail paint must not wait for compose-only inquiry configuration');
assert.equal(inquiryPanel.includes('문의 본문을 불러오는 중입니다.'), false, 'internal detail-loading diagnostics must not be shown to users');
assert.equal(inquiryPanel.includes('목록은 다시 조회하지 않고 선택한 문의 상세만 확인하고 있습니다.'), false, 'implementation commentary must never be rendered in the user UI');
assert.ok(inquiryPanel.includes('aria-busy="true"'), 'detail wait state may use a neutral accessibility-labelled skeleton');
assert.ok(inquiryApi.includes('INQUIRY_DETAIL_CACHE_TTL_MS = 30_000'), 'detail reuse must cover normal list-detail navigation without becoming long-lived stale data');
assert.ok(inquiryApi.includes('prefetchMemberDetail'), 'member detail must warm on explicit navigation intent');
assert.ok(inquiryApi.includes('prefetchGuestDetail'), 'guest detail must warm on explicit navigation intent');

assert.ok(userShell.includes('prefetchUserCommunity'), 'community parent interaction must warm notice, FAQ, and inquiry data together');
assert.ok(userShell.includes("if (userTab !== 'home') return undefined"), 'background community warmup must be limited to the already-painted home shell');
assert.ok(userShell.includes('window.setTimeout(() =>'), 'home community warmup must start after the shell commit instead of competing in the critical entrypoint');
assert.ok(userShell.includes('onPointerDown={() => prefetchUserCommunity(Boolean(firebaseAuthUser))}'), 'mobile menu intent must start community prefetch before navigation');
assert.ok(userShell.includes('onPointerEnter={() => prefetchUserCommunity(Boolean(firebaseAuthUser))}'), 'desktop community intent must start community prefetch before submenu selection');
assert.equal(userShell.includes('requestIdleCallback'), false, 'community prefetch must not reintroduce the failed broad idle-render shortcut');
assert.equal(boardCutover.includes('staleWhileRevalidate'), false, 'board rendering must not use a stale-while-revalidate shortcut');

console.log('[phase34-user-loading-performance-frontend-smoke] PASS');
