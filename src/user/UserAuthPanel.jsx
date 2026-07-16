export default function UserAuthPanel({ ctx }) {
  const {
    Button,
    Card,
    CardContent,
    Input,
    Users,
    firebaseAuthReady,
    firebaseAuthUser,
    form,
    goToUserLogin,
    goToUserSignup,
    logoutUser,
    pushAppPath,
    setIsCommunityMenuOpen,
    setUserAuthForm,
    setUserTab,
    setView,
    submitUserAuthForm,
    userAuthForm,
    userAuthLoading,
    userTab,
  } = ctx;

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
                    {userTab === 'signup' ? '일반 사용자 회원가입' : '일반 사용자 로그인'}
                  </h2>

                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {userTab === 'signup'
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
                        onClick={() => {
                          pushAppPath('user', 'rental');
                          setView('user');
                          setUserTab('rental');
                          setIsCommunityMenuOpen(false);
                        }}
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
                      onChange={(v) => setUserAuthForm({ ...userAuthForm, email: v })}
                      placeholder="example@company.com"
                      type="email"
                      autoComplete="email"
                    />

                    {userTab === 'signup' && (
                      <>
                        <Input
                          label="이름"
                          value={userAuthForm.name}
                          onChange={(v) => setUserAuthForm({ ...userAuthForm, name: v })}
                          placeholder="성명을 입력하세요"
                          autoComplete="name"
                        />

                        <Input
                          label="부서 / 팀"
                          value={userAuthForm.team}
                          onChange={(v) => setUserAuthForm({ ...userAuthForm, team: v })}
                          placeholder="소속 부서 또는 팀명을 입력하세요"
                        />

                        <Input
                          label="연락처"
                          value={userAuthForm.phone}
                          onChange={(v) => setUserAuthForm({ ...userAuthForm, phone: v })}
                          placeholder="연락처를 입력하세요"
                          autoComplete="tel"
                        />
                      </>
                    )}

                    <Input
                      label="비밀번호"
                      value={userAuthForm.password}
                      onChange={(v) => setUserAuthForm({ ...userAuthForm, password: v })}
                      placeholder="6자 이상 입력"
                      type="password"
                      autoComplete={userTab === 'signup' ? 'new-password' : 'current-password'}
                    />

                    {userTab === 'signup' && (
                      <Input
                        label="비밀번호 확인"
                        value={userAuthForm.passwordConfirm}
                        onChange={(v) => setUserAuthForm({ ...userAuthForm, passwordConfirm: v })}
                        placeholder="비밀번호를 한 번 더 입력"
                        type="password"
                        autoComplete="new-password"
                      />
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
                      일반 사용자 계정은 Firebase Authentication 이메일/비밀번호 방식으로 생성됩니다.
                      기존 관리자 모드 로그인 방식은 이번 단계에서 변경하지 않습니다.
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      disabled={userAuthLoading || !firebaseAuthReady}
                      className="w-full justify-center py-3"
                    >
                      {userAuthLoading
                        ? '처리 중...'
                        : userTab === 'signup'
                          ? '회원가입'
                          : '로그인'}
                    </Button>

                    <div className="flex justify-center border-t border-slate-100 pt-4 text-xs text-slate-500">
                      {userTab === 'signup' ? (
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
