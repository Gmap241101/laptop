// User-facing signup errors remain on the signup form, never an outcome page.
// The request has NOT committed when identity duplication is reported.
export const SIGNUP_IDENTITY_CONFLICT_MESSAGE =
  '동일한 부서와 이름으로 등록된 회원이 있습니다. 기존 계정 여부를 확인하거나 관리자에게 문의해 주세요.';

export const isSignupIdentityConflict = (error) =>
  ['member_identity_already_claimed', 'member/identity-already-claimed'].includes(
    String(error?.code || '').trim()
  );

export const signupSubmissionFeedback = (error) =>
  isSignupIdentityConflict(error) ? SIGNUP_IDENTITY_CONFLICT_MESSAGE : '';
