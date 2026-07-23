import DomesticPhoneInput from '../components/DomesticPhoneInput.jsx';
import { normalizeMemberName } from '../utils/memberPolicy.js';

export default function UserAuthPanel({ ctx }) {
  const {
    Button,
    Card,
    CardContent,
    Input,
    Users,
    cancelUserSignup,
    data,
    firebaseAuthReady,
    firebaseAuthUser,
    goToProtectedUserTab,
    goToUserLogin,
    goToUserSignup,
    logoutUser,
    setUserAuthForm,
    submitUserAuthForm,
    userAuthForm,
    userAuthLoading,
    userTab,
  } = ctx;

  const isSignupMode = userTab === 'signup';
  const directorySignupRequired = Boolean(
    data.settings.requireRegisteredMemberForSignup
  );
  const identityClaimsReady = Boolean(
    data.settings.memberIdentityClaimsReady
  );

  return (
    <Card className="mx-auto max-w-xl overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

        <div className="relative">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Users size={26} />
          </div>

          <h2 className="text-xl font-black tracking-tight">
            {isSignupMode ? '일반 사용자 회원가입' : '일반 사용자 로그인'}
          </h2>

          <p className="mt-2 text-xs leading-5 text-slate-300">
            {isSignupMode
              ? '대여 신청을 위한 일반 사용자 계정을 생성합니다.'
              : '가입한 이메일과 비밀번호로 로그인합니다.'}
          </p>
        </div>
      </div>

      <CardContent className="p-6">
        {firebaseAuthUser ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-800">
              현재 <span className="font-bold">{firebaseAuthUser.email}</span> 계정으로 로그인되어 있습니다.
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={logoutUser}
                disabled={userAuthLoading}
              >
                로그아웃
              </Button>

              <Button
                type="button"
                variant="primary"
                onClick={() => goToProtectedUserTab('rental')}
              >
                대여신청으로 이동
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submitUserAuthForm}>
            <Input
              label="이메일"
              value={userAuthForm.email}
              onChange={(value) =>
                setUserAuthForm({ ...userAuthForm, email: value })
              }
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
                      name: normalizeMemberName(value).slice(0, 30),
                    })
                  }
                  placeholder="공백 없이 성명을 입력하세요"
                  autoComplete="name"
                  maxLength={30}
                />

                {directorySignupRequired ? (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">
                      부서 / 팀
                    </span>
                    <select
                      value={userAuthForm.team}
                      onChange={(event) =>
                        setUserAuthForm({
                          ...userAuthForm,
                          team: event.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition mk-form-focus"
                    >
                      <option value="">부서 / 팀을 선택해 주세요</option>
                      {(data.teams || []).map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <Input
                    label="부서 / 팀"
                    value={userAuthForm.team}
                    onChange={(value) =>
                      setUserAuthForm({ ...userAuthForm, team: value })
                    }
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
              onChange={(value) =>
                setUserAuthForm({ ...userAuthForm, password: value })
              }
              placeholder={isSignupMode ? '8자 이상, 영문+숫자 포함' : '비밀번호 입력'}
              type="password"
              autoComplete={isSignupMode ? 'new-password' : 'current-password'}
            />

            {isSignupMode && (
              <Input
                label="비밀번호 확인"
                value={userAuthForm.passwordConfirm}
                onChange={(value) =>
                  setUserAuthForm({
                    ...userAuthForm,
                    passwordConfirm: value,
                  })
                }
                placeholder="비밀번호를 한 번 더 입력"
                type="password"
                autoComplete="new-password"
              />
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
              {isSignupMode && !identityClaimsReady
                ? '회원 중복 확인 정보가 준비되지 않아 현재 가입할 수 없습니다. 관리자에게 문의해 주세요. '
                : isSignupMode && directorySignupRequired
                  ? '관리자가 등록한 부서·성명과 일치하는 경우에만 가입할 수 있습니다. '
                  : ''}
              {isSignupMode
                ? '비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.'
                : '가입한 이메일과 비밀번호를 입력해 주세요.'}
            </div>

            {isSignupMode ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={userAuthLoading}
                  className="w-full justify-center py-3"
                  onClick={cancelUserSignup}
                >
                  취소
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    userAuthLoading ||
                    !firebaseAuthReady ||
                    !identityClaimsReady
                  }
                  className="w-full justify-center py-3"
                >
                  {userAuthLoading ? '가입 정보 확인 중...' : '회원가입'}
                </Button>
              </div>
            ) : (
              <Button
                type="submit"
                variant="primary"
                disabled={userAuthLoading || !firebaseAuthReady}
                className="w-full justify-center py-3"
              >
                {userAuthLoading ? '처리 중...' : '로그인'}
              </Button>
            )}

            <div className="flex justify-center border-t border-slate-100 pt-4 text-xs text-slate-500">
              {isSignupMode ? (
                <button
                  type="button"
                  onClick={goToUserLogin}
                  className="font-bold mk-brand-text hover:underline"
                >
                  이미 계정이 있으면 로그인하기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goToUserSignup}
                  className="font-bold mk-brand-text hover:underline"
                >
                  계정이 없으면 회원가입하기
                </button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
