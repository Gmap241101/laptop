import { clearUserLoginReturnTarget } from '../../routing/appRoutes.js';

// Show the accepted signup outcome without causing a Clerk document navigation.
// No registration data is sent here.
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

  // Commit and display the result in the same UI turn, before logout.
  // Use Clerk's navigation-free session termination so no intermediate
  // home/login document is ever shown after a successful submission.
  showUserAccountStatus('signupPendingComplete');

  try {
    await clerkClient.signOutWithoutNavigation();
  } catch (error) {
    // Account creation has already committed: never repeat registration.
    // Fail closed: no navigation-redirecting fallback that hides this result.
    triggerToast('가입 신청은 완료됐지만 인증 세션을 종료하지 못했습니다. 사이트를 새로고침하지 말고 관리자에게 문의해 주세요.', 'error');
  }
}
