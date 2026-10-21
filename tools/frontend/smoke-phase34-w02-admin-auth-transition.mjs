import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectAppReadiness } from '../../src/selectors/appReadinessSelectors.js';
import { getAdminClerkSignOutOptions } from '../../src/features/auth/adminClerkSignOutPolicy.js';
import { createClerkStagingClient } from '../../src/clerk/clerkStagingClient.js';
const read = path => readFileSync(path, 'utf8');
const base = {
  view: 'admin', authenticatedAdminId:'ADMIN-1', currentAuthAdminAccount:{ id: 'ADMIN-1' },
  adminAccountsReady:true, currentAuthRoleReady:true, firebaseAuthReady:true,
  isAdminAuthenticated:true, adminLogoutInProgress:false,
};
const evaluate = patch => selectAppReadiness({ ...base, ...patch });
let n=0;
const good = evaluate({});
assert.equal(good.hasAdminAccess, true); assert.equal(good.shouldShowAdminLoadingPage, false); n++;
const logout = evaluate({ adminLogoutInProgress:true, isAdminAuthenticated:false });
assert.equal(logout.shouldShowAdminSigningOutPage,true);
assert.equal(logout.hasAdminAccess, false);
assert.equal(logout.shouldShowAdminLoadingPage,false);
assert.equal(logout.shouldShowAdminLoginPage,false); n+=3;
const signedOut = evaluate({ authenticatedAdminId:'', currentAuthAdminAccount:null, isAdminAuthenticated:false });
assert.equal(signedOut.shouldShowAdminLoginPage,true);
assert.equal(signedOut.shouldShowAdminSigningOutPage,false);n++;
// Regression for Staging: login -> admin data check -> login after Clerk logout.
// The anonymous UI must remain on the login screen while an asynchronous
// post-logout session bootstrap changes readiness flags, even after remount.
for (const patch of [
  { firebaseAuthReady: false },
  { firebaseAuthReady: false, currentAuthRoleReady: false },
  { adminAccountsReady: false, currentAuthAdminAccount: null },
  { firebaseAuthReady: true, currentAuthRoleReady: false },
  { firebaseAuthReady: true, currentAuthRoleReady: true, adminAccountsReady: true },
]) {
  const state = evaluate({ authenticatedAdminId: '', isAdminAuthenticated: false, ...patch });
  assert.equal(state.shouldShowAdminLoginPage, true, 'anonymous session must keep login visible');
  assert.equal(state.shouldShowAdminLoadingPage, false, 'no anonymous admin data check screen');
  assert.equal(state.hasAdminAccess, false, 'no protected content after logout');
  n += 3;
}
// A restored admin session and a pending interactive Clerk sign-in must still
// wait for authority verification. Never bypass these security gates.
const restored = evaluate({ firebaseAuthReady: false, isAdminAuthenticated: false });
assert.equal(restored.shouldShowAdminLoadingPage, true);
assert.equal(restored.shouldShowAdminLoginPage, false); n += 2;
const transition = evaluate({
  authenticatedAdminId: '', isAdminAuthenticated: false,
  currentAuthAdminAccount: null, firebaseAuthReady: false,
  adminAuthTransitionPending: true,
});
assert.equal(transition.shouldShowAdminLoadingPage, true);
assert.equal(transition.shouldShowAdminLoginPage, false); n += 2;
const noDataAfterSignOut = evaluate({
  authenticatedAdminId: '', isAdminAuthenticated: false,
  firebaseAuthReady: false, currentAuthRoleReady: false,
  adminAccountsReady: false, currentAuthAdminAccount: null,
});
assert.equal(noDataAfterSignOut.shouldShowAdminAccountsErrorPage, false);
assert.equal(noDataAfterSignOut.hasAdminAccess, false); n += 2;
const cold = evaluate({ firebaseAuthReady:false });
assert.equal(cold.shouldShowAdminLoadingPage,true);n++;
const denied = evaluate({ currentAuthRoleReady:true, currentAuthRoleErrorMessage:'403' });
assert.equal(denied.hasAdminAccess,false); n++;
const ui = read('src/features/auth/useAdminAuthenticationController.js');
assert.match(ui,/adminSecuritySettingsRef\.current = systemAdminSettings/);n++;
assert.match(ui,/securitySettingsOverride \|\| adminSecuritySettingsRef\.current/);n++;
assert.doesNotMatch(ui,/window\.setTimeout\(applyAdminRoute|requestAnimationFrame\?\.\(applyAdminRoute\)/);n++;
assert.equal((ui.match(/setAdminTab\('dashboard'\);/g)||[]).length, 2);n++;
assert.match(ui, /clerkStagingClient\.signOut\(getAdminClerkSignOutOptions\(runtimeSurface\)\)/); n++;
assert.match(ui, /const signOutClerkForRuntimeSurface = \(runtimeSurface\)/); n++;
assert.deepEqual(getAdminClerkSignOutOptions('admin'), { redirectUrl: '/admin' }); n++;
assert.equal(getAdminClerkSignOutOptions('user'), undefined); n++;
// Emulate ClerkJS post-sign-out navigation and assert that the actual adapter
// receives the admin override. The old no-argument call navigated to '/'.
let navigatedTo = null;
const fakeClerk = {
  loaded: true,
  load: async () => {},
  signOut: async (options) => { navigatedTo = options?.redirectUrl || '/'; },
};
const fakeClient = createClerkStagingClient({
  env: {
    MODE: 'staging', VITE_CLERK_STAGING_ENABLED: 'true',
    VITE_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('staging.clerk.example$').toString('base64')}`,
    VITE_API_URL: 'https://staging-api.example',
  },
  windowRef: {
    Clerk: fakeClerk, atob: value => Buffer.from(value, 'base64').toString('utf8'),
    location: { pathname: '/admin', search: '' },
  },
  documentRef: {},
  fetchImpl: async () => { throw Error('No network expected during sign-out mock'); },
});
await fakeClient.signOut(getAdminClerkSignOutOptions('admin'));
assert.equal(navigatedTo, '/admin', 'admin sign-out must not enter the user homepage'); n++;
await fakeClient.signOut(getAdminClerkSignOutOptions('user'));
assert.equal(navigatedTo, '/', 'user surface behavior must remain unchanged'); n++;
// A fresh ClerkJS boot must also use admin-specific after-sign-out defaults,
// protecting implicit session cleanup and multi-session sign-out paths.
let clerkLoadOptions = null;
const clerkBootstrapMock = {
  loaded: false,
  load: async options => { clerkLoadOptions = options; clerkBootstrapMock.loaded = true; },
  signOut: async () => {},
};
const bootClient = createClerkStagingClient({
  env: {
    MODE: 'staging', VITE_CLERK_STAGING_ENABLED: 'true',
    VITE_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('staging.clerk.example$').toString('base64')}`,
    VITE_API_URL: 'https://staging-api.example',
  },
  windowRef: {
    Clerk: clerkBootstrapMock,
    atob: value => Buffer.from(value, 'base64').toString('utf8'),
    location: { pathname: '/admin', search: '' },
  },
  documentRef: {},
  fetchImpl: async () => { throw Error('No network expected during Clerk bootstrap mock'); },
});
await bootClient.initialize();
assert.equal(clerkLoadOptions.afterSignOutUrl, '/admin'); n++;
assert.equal(clerkLoadOptions.afterMultiSessionSingleSignOutUrl, '/admin'); n++;
const userBootstrapMock = {
  loaded: false,
  load: async options => { clerkLoadOptions = options; userBootstrapMock.loaded = true; },
};
const userBootClient = createClerkStagingClient({
  env: {
    MODE: 'staging', VITE_CLERK_STAGING_ENABLED: 'true',
    VITE_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('staging.clerk.example$').toString('base64')}`,
    VITE_API_URL: 'https://staging-api.example',
  },
  windowRef: {
    Clerk: userBootstrapMock,
    atob: value => Buffer.from(value, 'base64').toString('utf8'),
    location: { pathname: '/', search: '' },
  },
  documentRef: {},
  fetchImpl: async () => { throw Error('No network expected during Clerk bootstrap mock'); },
});
await userBootClient.initialize();
assert.equal(clerkLoadOptions.afterSignOutUrl, undefined); n++;

const app = read('src/admin/AdminApp.jsx');
assert.match(app, /adminAuthTransitionPending: readAdminAuthTransition\(\)\?\.status === ['\"]pending['\"]/);n++;
const boot = read('src/features/auth/useAdminIdentityPolicyController.js');
assert.match(boot,/setAdminAuthenticatedSession,/);
const workspace = read('src/admin/AdminWorkspace.jsx');
assert.match(workspace,/shouldShowAdminSigningOutPage \? \(/);
assert.match(workspace,/로그아웃 중\.\.\./);n++;
assert.doesNotMatch(workspace,/PostgreSQL 관리자 레지스트리와 Clerk 인증 상태를 확인한 뒤/);n++;
const slices = read('src/context/appContextSlices.js');
assert.match(slices,/shouldShowAdminSigningOutPage/);n++;
console.log(`[phase34-w02-admin-auth-transition] PASS (${n} checks)`);
