import assert from 'node:assert/strict';
import fs from 'node:fs';
import { completePendingSignupWithClerk } from '../../src/features/auth/pendingSignupCompletion.js';
import {
  USER_ACCOUNT_STATUS_SESSION_KEY,
  USER_LOGIN_RETURN_TARGET_SESSION_KEY,
  readUserAccountStatusView,
  writeUserAccountStatusView,
  replaceAppPath,
  getRouteStateFromPath,
} from '../../src/routing/appRoutes.js';

const signup = fs.readFileSync(new URL('../../src/features/auth/useUserSignupController.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../../src/user/UserAccountStatusPanel.jsx', import.meta.url), 'utf8');
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

const cells = new Map();
const navigation = [];
globalThis.window = {
  sessionStorage: {
    getItem: (key) => cells.has(key) ? cells.get(key) : null,
    setItem: (key, value) => cells.set(key, String(value)),
    removeItem: (key) => cells.delete(key),
  },
  location: { pathname: '/signup' },
  history: {
    pushState: (_state, _title, path) => { navigation.push(['push', path]); window.location.pathname = path; },
    replaceState: (_state, _title, path) => { navigation.push(['replace', path]); window.location.pathname = path; },
  },
};
const sequence = [];
const notices = [];
const run = async ({ rejectSignout = false, preexistingStatus = 'loginRetired' } = {}) => {
  cells.clear();
  navigation.length = 0;
  sequence.length = 0;
  notices.length = 0;
  window.location.pathname = '/signup';
  cells.set(USER_LOGIN_RETURN_TARGET_SESSION_KEY, JSON.stringify({ userTab: 'rental' }));
  writeUserAccountStatusView({ type: preexistingStatus });
  const client = { signOutWithoutNavigation: async () => {
    sequence.push(['signOutWithoutNavigation', readUserAccountStatusView().type, window.location.pathname]);
    if (rejectSignout) throw new Error('synthetic signout rejection');
  }};
  await completePendingSignupWithClerk({
    clerkClient: client,
    setFirebaseAuthUser: (value) => sequence.push(['principal', value]),
    clearUserAuthenticatedSession: () => sequence.push(['clearSession']),
    resetUserAuthForm: () => sequence.push(['resetForm']),
    showUserAccountStatus: (type) => {
      writeUserAccountStatusView({ type });
      replaceAppPath('user', 'accountStatus');
      sequence.push(['status', type]);
    },
    triggerToast: (...args) => notices.push(args),
  });
};

await run();
check(readUserAccountStatusView().type === 'signupPendingComplete', 'pending status persists across navigation');
check(window.location.pathname === '/account-status', 'pending completion must retain status route');
check(getRouteStateFromPath().userTab === 'accountStatus', 'fresh route bootstrap must recognize status page');
check(!cells.has(USER_LOGIN_RETURN_TARGET_SESSION_KEY), 'signup return target cleared');
check(sequence[0][0] === 'principal' && sequence[0][1] === null, 'principal cleared before display');
check(sequence[1][0] === 'clearSession', 'local session cleared before display');
check(sequence[2][0] === 'resetForm', 'signup form cleared before display');
check(sequence[3][0] === 'status' && sequence[3][1] === 'signupPendingComplete', 'pending status shown before Clerk signout');
check(sequence[4][0] === 'signOutWithoutNavigation', 'Clerk session ends without navigation');
check(sequence[4][1] === 'signupPendingComplete', 'result persisted before Clerk cleanup');
check(sequence[4][2] === '/account-status', 'status route set before Clerk cleanup');
check(navigation.every(([,path]) => path === '/account-status'), 'no home-navigation introduced');
check(notices.length === 0, 'success path does not show signout failure');
check(panel.includes('가입 신청이 완료되었습니다.'), 'pending panel exists');
check(panel.includes('관리자 승인 후 서비스를 이용할 수 있습니다.'), 'approval-required description exists');

await run({rejectSignout:true});
check(readUserAccountStatusView().type === 'signupPendingComplete', 'signout failure must not erase completed signup');
check(window.location.pathname === '/account-status', 'signout failure must keep status page');
check(notices.length === 1 && notices[0][1] === 'error', 'signout failure must warn user');
check(sequence.filter(([name])=>name === 'signOutWithoutNavigation').length === 1, 'signout failure never automatically retries');
check(!cells.has(USER_LOGIN_RETURN_TARGET_SESSION_KEY), 'failure does not retain protected return target');

await run({preexistingStatus:'withdrawalComplete'});
check(readUserAccountStatusView().type === 'signupPendingComplete', 'old status overwritten with pending outcome');
check(sequence[4][1] === 'signupPendingComplete', 'stale outcome cannot survive Clerk session termination');

check(signup.includes("import { completePendingSignupWithClerk } from './pendingSignupCompletion.js';"), 'controller uses hardened completion');
check(signup.includes("showUserAccountStatus('signupAutoApprovedComplete');"), 'automatic approval remains available');
check(signup.includes('if (createdAccountStatus === USER_PROFILE_STATUS.ACTIVE)'), 'status-aware signup branch preserved');
check(!signup.includes("showUserAccountStatus(createdAccountStatus === USER_PROFILE_STATUS.ACTIVE ? 'signupAutoApprovedComplete' : 'signupPendingComplete');"), 'old signout/navigation race removed');
check(signup.includes('signupPayload?.signupLifecycle?.status || USER_PROFILE_STATUS.PENDING'), 'PostgreSQL lifecycle remains authority');

console.log(`Phase 34 signup pending completion routing PASS (${checks} assertions; no provider or DB calls)`);
