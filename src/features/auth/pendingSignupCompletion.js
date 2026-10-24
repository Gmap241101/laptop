import { clearUserLoginReturnTarget } from '../../routing/appRoutes.js';

// Keep the pending-approval screen visible even if Clerk performs a full
// document navigation during sign-out. No registration data is sent here.
export async function completePendingSignupWithClerk({
  clerkClient,
  clearUserAuthenticatedSession,
  setFirebaseAuthUser,
  resetUserAuthForm,
  showUserAccountStatus,
  triggerToast,
}) {
  // Clear any local authenticated state before showing the outcome.
  setFirebaseAuthUser(null);
  clearUserAuthenticatedSession();
  resetUserAuthForm();
  clearUserLoginReturnTarget();

  // Persists the correct result to sessionStorage AND routes to /account-status
  // before signOut() can redirect (for example, to Clerk's default '/').
  showUserAccountStatus('signupPendingComplete');

  try {
    await clerkClient.signOut({ redirectUrl: '/account-status' });
  } catch (error) {
    // Account creation has committed already: do not pretend it failed or
    // repeat signup. The pending account remains blocked by the server.
    triggerToast('가입 신청은 완료됐지만 로그아웃에 실패했습니다. 페이지를 새로고침해 주세요.', 'error');
  }
}
