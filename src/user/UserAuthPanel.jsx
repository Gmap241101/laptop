import { useCallback, useEffect, useState } from 'react';
import DomesticPhoneInput from '../components/DomesticPhoneInput.jsx';
import { sanitizeMemberNameInput } from '../utils/memberPolicy.js';
import UserSignupTermsSection from './UserSignupTermsSection.jsx';
import { createEmptyTermsSubmission } from '../features/terms/termsConstants.js';

export default function UserAuthPanel({ ctx }) {
  const {
    Button,
    Card,
    CardContent,
    Input,
    Users,
    accountRecoveryForm,
    accountRecoveryLoading,
    accountRecoveryResult,
    cancelUserSignup,
    data,
    firebaseAuthReady,
    firebaseAuthUser,
    hasEstablishedUserSession,
    goToProtectedUserTab,
    goToUserEmailRecovery,
    goToUserLogin,
    goToUserPasswordReset,
    goToUserSignup,
    logoutUser,
    passwordResetForm,
    passwordResetLoading,
    passwordResetVerificationResult,
    resetAccountRecoverySearch,
    setAccountRecoveryForm,
    updatePasswordResetForm,
    setUserAuthForm,
    submitAccountRecovery,
    submitPasswordReset,
    submitUserAuthForm,
    userAuthForm,
    userAuthLoading,
    userTab,
    siteSettings,
  } = ctx;

  const isSignupMode = userTab === 'signup';
  const isEmailRecoveryMode = userTab === 'findEmail';
  const isPasswordResetMode = userTab === 'resetPassword';
  const isLoginMode = !isSignupMode && !isEmailRecoveryMode && !isPasswordResetMode;
  const directorySignupRequired = Boolean(
    data.settings.requireRegisteredMemberForSignup
  );
  const identityClaimsReady = Boolean(
    data.settings.memberIdentityClaimsReady
  );
  const signupClosed =
    siteSettings?.serviceMode !== 'normal' ||
    siteSettings?.allowNewMemberSignup === false;
  const signupPasswordMismatch = Boolean(
    isSignupMode &&
      userAuthForm.passwordConfirm &&
      userAuthForm.password !== userAuthForm.passwordConfirm
  );

  const [signupStep, setSignupStep] = useState(1);
  const [signupTermsSubmission, setSignupTermsSubmission] = useState(
    createEmptyTermsSubmission
  );
  const handleSignupTermsChange = useCallback((nextSubmission) => {
    setSignupTermsSubmission(nextSubmission);
  }, []);

  useEffect(() => {
    if (!isSignupMode) {
      setSignupStep(1);
      setSignupTermsSubmission(createEmptyTermsSubmission());
    }
  }, [isSignupMode]);

  const title = isSignupMode
    ? '일반 사용자 회원가입'
    : isEmailRecoveryMode
      ? '이메일 찾기'
      : isPasswordResetMode
        ? '비밀번호 재설정'
        : '일반 사용자 로그인';

  const description = isSignupMode
    ? '대여 신청을 위한 일반 사용자 계정을 생성합니다.'
    : isEmailRecoveryMode
      ? '가입할 때 등록한 부서·성명·연락처로 이메일을 확인합니다.'
      : isPasswordResetMode
        ? '가입 이메일로 비밀번호 재설정 링크를 전송합니다.'
        : '가입한 이메일과 비밀번호로 로그인합니다.';

  return (
    <Card className="mx-auto max-w-xl overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

        <div className="relative">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Users size={26} />
          </div>

          <h2 className="text-xl font-black tracking-tight">{title}</h2>
          <p className="mt-2 text-xs leading-5 text-slate-300">{description}</p>
        </div>
      </div>

      <CardContent className="p-6">
        {firebaseAuthUser &&
        hasEstablishedUserSession &&
        !userAuthLoading &&
        (isLoginMode || isSignupMode) ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-800">
              현재 <span className="font-bold">{firebaseAuthUser.email}</span> 계정으로 로그인되어 있습니다.
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={logoutUser} disabled={userAuthLoading}>
                로그아웃
              </Button>
              <Button type="button" variant="primary" onClick={() => goToProtectedUserTab('rental')}>
                대여신청으로 이동
              </Button>
            </div>
          </div>
        ) : isEmailRecoveryMode ? (
          <form className="space-y-4" onSubmit={submitAccountRecovery}>
            <Input
              label="성명"
              value={accountRecoveryForm.name}
              onChange={(value) =>
                setAccountRecoveryForm({
                  ...accountRecoveryForm,
                  name: sanitizeMemberNameInput(value).slice(0, 30),
                })
              }
              placeholder="공백 없이 성명을 입력하세요"
              maxLength={30}
            />

            <Input
              label="부서 / 팀"
              value={accountRecoveryForm.team}
              onChange={(value) =>
                setAccountRecoveryForm({
                  ...accountRecoveryForm,
                  team: value,
                })
              }
              placeholder="가입할 때 입력한 부서 또는 팀명"
              list="account-recovery-team-options"
              maxLength={80}
            />
            <datalist id="account-recovery-team-options">
              {(data.teams || []).map((team) => (
                <option key={team} value={team} />
              ))}
            </datalist>

            <DomesticPhoneInput
              prefix={accountRecoveryForm.phonePrefix}
              middle={accountRecoveryForm.phoneMiddle}
              last={accountRecoveryForm.phoneLast}
              disabled={accountRecoveryLoading}
              onChange={(phoneParts) =>
                setAccountRecoveryForm({
                  ...accountRecoveryForm,
                  phonePrefix: phoneParts.prefix,
                  phoneMiddle: phoneParts.middle,
                  phoneLast: phoneParts.last,
                })
              }
            />

            {accountRecoveryResult ? (
              <div className={`rounded-2xl border px-5 py-4 text-sm leading-6 ${accountRecoveryResult.found ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {accountRecoveryResult.found
                  ? <>가입한 이메일은 <span className="font-black">{accountRecoveryResult.maskedEmail}</span>입니다.</>
                  : '입력한 정보와 일치하는 계정을 찾지 못했습니다.'}
              </div>
            ) : null}

            {accountRecoveryResult?.found ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={accountRecoveryLoading}
                  onClick={resetAccountRecoverySearch}
                  className="w-full justify-center py-3"
                >
                  취소
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={accountRecoveryLoading}
                  onClick={goToUserLogin}
                  className="w-full justify-center py-3"
                >
                  로그인 하기
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={accountRecoveryLoading}
                  onClick={() =>
                    goToUserPasswordReset({
                      name: accountRecoveryForm.name,
                      team: accountRecoveryForm.team,
                      phonePrefix: accountRecoveryForm.phonePrefix,
                      phoneMiddle: accountRecoveryForm.phoneMiddle,
                      phoneLast: accountRecoveryForm.phoneLast,
                    })
                  }
                  className="w-full justify-center py-3"
                >
                  비밀번호 재설정
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" disabled={accountRecoveryLoading} onClick={goToUserLogin} className="w-full justify-center py-3">
                  취소
                </Button>
                <Button type="submit" variant="primary" disabled={accountRecoveryLoading} className="w-full justify-center py-3">
                  {accountRecoveryLoading ? '확인 중...' : '이메일 찾기'}
                </Button>
              </div>
            )}
          </form>
        ) : isPasswordResetMode ? (
          <form className="space-y-4" onSubmit={submitPasswordReset}>
            <Input
              label="가입 이메일"
              value={passwordResetForm.email}
              onChange={(value) => {
                updatePasswordResetForm({
                  ...passwordResetForm,
                  email: value,
                });
              }}
              placeholder="example@company.com"
              type="email"
              autoComplete="email"
            />

            <Input
              label="성명"
              value={passwordResetForm.name}
              onChange={(value) =>
                updatePasswordResetForm({
                  ...passwordResetForm,
                  name: sanitizeMemberNameInput(value).slice(0, 30),
                })
              }
              placeholder="공백 없이 성명을 입력하세요"
              maxLength={30}
            />

            <Input
              label="부서 / 팀"
              value={passwordResetForm.team}
              onChange={(value) =>
                updatePasswordResetForm({
                  ...passwordResetForm,
                  team: value,
                })
              }
              placeholder="가입할 때 입력한 부서 또는 팀명"
              list="password-reset-team-options"
              maxLength={80}
            />
            <datalist id="password-reset-team-options">
              {(data.teams || []).map((team) => (
                <option key={team} value={team} />
              ))}
            </datalist>

            <DomesticPhoneInput
              prefix={passwordResetForm.phonePrefix}
              middle={passwordResetForm.phoneMiddle}
              last={passwordResetForm.phoneLast}
              disabled={passwordResetLoading}
              onChange={(phoneParts) =>
                updatePasswordResetForm({
                  ...passwordResetForm,
                  phonePrefix: phoneParts.prefix,
                  phoneMiddle: phoneParts.middle,
                  phoneLast: phoneParts.last,
                })
              }
            />

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
              가입 이메일, 성명, 부서 / 팀, 연락처가 모두 일치하는 경우에만 비밀번호 재설정 메일을 발송합니다.
            </div>

            {passwordResetVerificationResult ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
                {passwordResetVerificationResult.message}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" disabled={passwordResetLoading} onClick={goToUserLogin} className="w-full justify-center py-3">
                취소
              </Button>
              <Button type="submit" variant="primary" disabled={passwordResetLoading || !firebaseAuthReady} className="w-full justify-center py-3">
                {passwordResetLoading ? '확인 중...' : '재설정 메일 보내기'}
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              if (isSignupMode && signupStep === 1) {
                event.preventDefault();
                if (signupTermsSubmission.ready && signupTermsSubmission.valid) {
                  setSignupStep(2);
                }
                return;
              }
              submitUserAuthForm(event, signupTermsSubmission);
            }}
          >
            {isSignupMode ? (
              <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-center text-[11px] font-bold">
                <div className={`px-3 py-2.5 ${signupStep === 1 ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>1. 약관 동의</div>
                <div className={`px-3 py-2.5 ${signupStep === 2 ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>2. 회원정보 입력</div>
              </div>
            ) : null}

            {isSignupMode && signupStep === 1 ? (
              <>
                <UserSignupTermsSection onChange={handleSignupTermsChange} />

                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" disabled={userAuthLoading} className="w-full justify-center py-3" onClick={cancelUserSignup}>
                    취소
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!signupTermsSubmission.ready || !signupTermsSubmission.valid || signupClosed}
                    className="w-full justify-center py-3"
                  >
                    회원정보 입력
                  </Button>
                </div>

                <div className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                  <button type="button" onClick={goToUserLogin} className="font-bold mk-brand-text hover:underline">
                    이미 계정이 있으면 로그인하기
                  </button>
                </div>
              </>
            ) : (
              <>
                {isSignupMode ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] text-emerald-800">
                    <span className="font-bold">필수 약관 확인이 완료되었습니다.</span>
                    <button type="button" onClick={() => setSignupStep(1)} className="font-bold underline underline-offset-2">약관 동의 다시 하기</button>
                  </div>
                ) : null}

                {!isSignupMode && userAuthForm.clientTrustRequired ? (
                  <>
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-800">
                      새 브라우저 확인이 필요합니다. Clerk가 <span className="font-bold">{userAuthForm.clientTrustDestination || userAuthForm.email}</span>로 보낸 인증코드를 입력해 주세요.
                    </div>
                    <Input
                      label="Clerk 새 기기 확인 인증코드"
                      value={userAuthForm.clientTrustCode || ''}
                      onChange={(value) => setUserAuthForm({ ...userAuthForm, clientTrustCode: value })}
                      placeholder="인증코드 입력"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </>
                ) : (
                  <>
                    <Input
                      label="이메일"
                      value={userAuthForm.email}
                      onChange={(value) => setUserAuthForm({ ...userAuthForm, email: value })}
                      placeholder="example@company.com"
                      type="email"
                      autoComplete="email"
                    />

                    {isSignupMode && (
                      <>
                        <Input
                          label="성명"
                          value={userAuthForm.name}
                          onChange={(value) =>
                            setUserAuthForm({
                              ...userAuthForm,
                              name: sanitizeMemberNameInput(value).slice(0, 30),
                            })
                          }
                          placeholder="공백 없이 성명을 입력하세요"
                          autoComplete="name"
                          maxLength={30}
                        />

                        {directorySignupRequired ? (
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">부서 / 팀</span>
                            <select
                              value={userAuthForm.team}
                              onChange={(event) => setUserAuthForm({ ...userAuthForm, team: event.target.value })}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition mk-form-focus"
                            >
                              <option value="">부서 / 팀을 선택해 주세요</option>
                              {(data.teams || []).map((team) => (
                                <option key={team} value={team}>{team}</option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <Input
                            label="부서 / 팀"
                            value={userAuthForm.team}
                            onChange={(value) => setUserAuthForm({ ...userAuthForm, team: value })}
                            placeholder="소속 부서 또는 팀명을 입력하세요"
                            maxLength={80}
                          />
                        )}

                        <DomesticPhoneInput
                          prefix={userAuthForm.phonePrefix}
                          middle={userAuthForm.phoneMiddle}
                          last={userAuthForm.phoneLast}
                          disabled={userAuthLoading}
                          onChange={(phoneParts) =>
                            setUserAuthForm({
                              ...userAuthForm,
                              phonePrefix: phoneParts.prefix,
                              phoneMiddle: phoneParts.middle,
                              phoneLast: phoneParts.last,
                            })
                          }
                        />
                      </>
                    )}

                    <Input
                      label="비밀번호"
                      value={userAuthForm.password}
                      onChange={(value) => setUserAuthForm({ ...userAuthForm, password: value })}
                      placeholder={isSignupMode ? '8자 이상, 영문+숫자 포함' : '비밀번호 입력'}
                      type="password"
                      autoComplete={isSignupMode ? 'new-password' : 'current-password'}
                    />

                    {isSignupMode && (
                      <>
                        <Input
                          label="비밀번호 확인"
                          value={userAuthForm.passwordConfirm}
                          onChange={(value) => setUserAuthForm({ ...userAuthForm, passwordConfirm: value })}
                          placeholder="비밀번호를 한 번 더 입력"
                          type="password"
                          autoComplete="new-password"
                          aria-invalid={signupPasswordMismatch || undefined}
                        />

                        {signupPasswordMismatch ? (
                          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                            입력하신 비밀번호가 일치하지 않습니다.
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                )}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
                  {isSignupMode && signupClosed
                    ? '현재 신규 회원가입 접수가 일시 중지되어 있습니다. '
                    : isSignupMode && !identityClaimsReady
                    ? '회원 중복 확인 정보가 준비되지 않아 현재 가입할 수 없습니다. 관리자에게 문의해 주세요. '
                    : isSignupMode && directorySignupRequired
                      ? '관리자가 등록한 부서·성명과 일치하는 경우에만 가입할 수 있습니다. '
                      : ''}
                  {isSignupMode
                    ? '비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.'
                    : userAuthForm.clientTrustRequired
                      ? '인증코드는 현재 Clerk 로그인 시도에만 사용됩니다.'
                      : '가입한 이메일과 비밀번호를 입력해 주세요.'}
                </div>

                {isSignupMode ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" disabled={userAuthLoading} className="w-full justify-center py-3" onClick={() => setSignupStep(1)}>
                      이전
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={userAuthLoading || !firebaseAuthReady || !identityClaimsReady || signupClosed || !signupTermsSubmission.valid || signupPasswordMismatch}
                      className="w-full justify-center py-3"
                    >
                      {userAuthLoading ? '가입 정보 확인 중...' : '회원가입'}
                    </Button>
                  </div>
                ) : (
                  <Button type="submit" variant="primary" disabled={userAuthLoading || !firebaseAuthReady} className="w-full justify-center py-3">
                    {userAuthLoading ? '처리 중...' : userAuthForm.clientTrustRequired ? '인증코드 확인' : '로그인'}
                  </Button>
                )}

                <div className="space-y-3 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                  {isSignupMode ? (
                    <button type="button" onClick={goToUserLogin} className="font-bold mk-brand-text hover:underline">
                      이미 계정이 있으면 로그인하기
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center justify-center gap-3">
                        <button type="button" onClick={goToUserEmailRecovery} className="font-semibold text-slate-600 hover:underline">이메일 찾기</button>
                        <span className="text-slate-300">|</span>
                        <button type="button" onClick={goToUserPasswordReset} className="font-semibold text-slate-600 hover:underline">비밀번호 재설정</button>
                      </div>
                      <button type="button" onClick={goToUserSignup} className="font-bold mk-brand-text hover:underline">
                        계정이 없으면 회원가입하기
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
