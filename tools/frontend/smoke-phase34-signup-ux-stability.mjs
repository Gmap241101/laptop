import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completePendingSignupWithClerk } from '../../src/features/auth/pendingSignupCompletion.js';
import { signupSubmissionFeedback, SIGNUP_IDENTITY_CONFLICT_MESSAGE } from '../../src/features/auth/signupSubmissionFeedback.js';

let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };
const load = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const controller = load('src/features/auth/useUserSignupController.js');
const authPanel = load('src/user/UserAuthPanel.jsx');
const clerk = load('src/clerk/clerkUserClient.js');
const navigation = load('src/routing/useAppNavigationController.js');
const login = load('src/features/auth/useUserLoginController.js');
const memberStatus = load('src/features/members/useUserMembershipStatusController.js');
const withdrawal = load('src/features/members/useUserMyPageAccountController.js');
const status = load('src/user/UserAccountStatusPanel.jsx');
const workspace = load('src/user/UserWorkspace.jsx');
const shell = load('src/user/UserShell.jsx');
const app = load('src/UserApp.jsx');

check(signupSubmissionFeedback({code:'member_identity_already_claimed'}) === SIGNUP_IDENTITY_CONFLICT_MESSAGE, 'server 409 code handled');
check(signupSubmissionFeedback({code:'member/identity-already-claimed'}) === SIGNUP_IDENTITY_CONFLICT_MESSAGE, 'legacy 409 handled');
for (const code of ['', 'member_directory_mismatch', 'member_email_already_registered', 'clerk_session_expired']) {
  check(signupSubmissionFeedback({code}) === '', `non-identity code ${code} not misclassified`);
}
check(signupSubmissionFeedback(null) === '', 'null error safe');
check(SIGNUP_IDENTITY_CONFLICT_MESSAGE === '동일한 부서와 이름으로 등록된 회원이 있습니다. 기존 계정 여부를 확인하거나 관리자에게 문의해 주세요.', 'exact approved Korean UX copy');
check(controller.includes('signupSubmissionError: signupFeedback'), 'signup error persisted inline');
check(controller.includes('signupFeedback || ('), 'actual duplicate error gets toast priority');
check(controller.includes('await clerkStagingClient.signOutWithoutNavigation()'), 'signup rejection must not navigate away');
check(!controller.includes('await clerkStagingClient.signOut().catch(() => {});\n          throw signupError;'), 'redirecting failure cleanup removed');
check(authPanel.includes('role="alert" aria-live="assertive"'), 'persistent visible alert has accessibility semantics');
check(authPanel.includes('userAuthForm.signupSubmissionError'), 'inline alert bound to signup form');
check(authPanel.includes('기존 계정으로 로그인하기'), 'next action available');
check(authPanel.includes('!userAuthForm.signupSubmissionError ? ('), 'secondary email warning does not mask actual error');
check(authPanel.includes("name: sanitizeMemberNameInput(value).slice(0, 30),\n                              signupSubmissionError: '',"), 'identity edit clears stale feedback');
check(clerk.includes('async signOutWithoutNavigation()'), 'client provides native session-only logout');
check(clerk.includes('await endActiveClerkSessionWithoutNavigation(clerk);'), 'client uses existing Clerk session cleanup helper');
check(clerk.includes('clerk.setActive({ session: null, navigate: async () => {} })'), 'session deactivation cannot navigate');
check(navigation.includes('immediate = false'), 'regular nav default unchanged');
check(navigation.includes('if (immediate) {'), 'status nav synchronous');
check(navigation.includes('immediate: true,'), 'account status uses immediate route');
check(login.includes('await clerkStagingClient.signOutWithoutNavigation().catch(() => {});'), 'pending/blocked login route uses non-navigation logout');
check(memberStatus.includes('await clerkStagingClient.signOutWithoutNavigation().catch('), 'membership status route uses non-navigation logout');
check(withdrawal.includes('await clerkStagingClient.signOutWithoutNavigation().catch(() => {});'), 'withdrawal outcome uses non-navigation logout');
for (const type of ['signupPendingComplete','signupAutoApprovedComplete','loginPending','loginBlocked','loginRetired','passwordResetSent','withdrawalComplete']) {
  check(status.includes(type + ':'), `${type} outcome still supported`);
}
check(app.includes("errorCode === 'member_identity_already_claimed'"), 'global fallback message maps backend snake-case');
check(workspace.includes("import UserAccountStatusPanel from './UserAccountStatusPanel.jsx';"), 'all status panels eagerly available');
check(workspace.includes("{ lazyPanel: false }"), 'status has no lazy fallback flash');
check(shell.includes("!['home', 'accountStatus'].includes(userTab) && !firebaseReady"), 'account status never blurred behind data loading overlay');

let route = '/signup';
const states = [];
const toasts = [];
await completePendingSignupWithClerk({
  clerkClient: {
    signOutWithoutNavigation: async () => {
      states.push(['clerkSessionEnd', route]);
      check(route === '/account-status', 'Clerk session termination starts only after direct result routing');
    },
    signOut: async () => {throw Error('navigation-enabled signOut should never be called');},
  },
  clearUserAuthenticatedSession: () => states.push(['clearLocalSession']),
  setFirebaseAuthUser: (value) => states.push(['principal', value]),
  resetUserAuthForm: () => states.push(['reset']),
  showUserAccountStatus: (type) => { states.push(['show', type]); route='/account-status'; },
  triggerToast: (...args) => toasts.push(args),
});
check(route === '/account-status', 'pending status never flashes to home');
check(states.map(x=>x[0]).join(',') === 'principal,clearLocalSession,reset,show,clerkSessionEnd', 'one result transition, then session cleanup');
check(toasts.length === 0, 'no false error on completed signup');
console.log(`Phase 34 signup UX stability PASS (${assertions} assertions, no external calls or DB writes)`);
