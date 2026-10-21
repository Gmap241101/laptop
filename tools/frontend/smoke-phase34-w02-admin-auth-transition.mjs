import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectAppReadiness } from '../../src/selectors/appReadinessSelectors.js';
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
const cold = evaluate({ firebaseAuthReady:false });
assert.equal(cold.shouldShowAdminLoadingPage,true);n++;
const denied = evaluate({ currentAuthRoleReady:true, currentAuthRoleErrorMessage:'403' });
assert.equal(denied.hasAdminAccess,false); n++;
const ui = read('src/features/auth/useAdminAuthenticationController.js');
assert.match(ui,/adminSecuritySettingsRef\.current = systemAdminSettings/);n++;
assert.match(ui,/securitySettingsOverride \|\| adminSecuritySettingsRef\.current/);n++;
assert.doesNotMatch(ui,/window\.setTimeout\(applyAdminRoute|requestAnimationFrame\?\.\(applyAdminRoute\)/);n++;
assert.equal((ui.match(/setAdminTab\('dashboard'\);/g)||[]).length, 2);n++;
const boot = read('src/features/auth/useAdminIdentityPolicyController.js');
assert.match(boot,/setAdminAuthenticatedSession,/);
const workspace = read('src/admin/AdminWorkspace.jsx');
assert.match(workspace,/shouldShowAdminSigningOutPage \? \(/);
assert.match(workspace,/로그아웃 중\.\.\./);n++;
assert.doesNotMatch(workspace,/PostgreSQL 관리자 레지스트리와 Clerk 인증 상태를 확인한 뒤/);n++;
const slices = read('src/context/appContextSlices.js');
assert.match(slices,/shouldShowAdminSigningOutPage/);n++;
console.log(`[phase34-w02-admin-auth-transition] PASS (${n} checks)`);
