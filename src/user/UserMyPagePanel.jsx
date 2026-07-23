import DomesticPhoneInput from '../components/DomesticPhoneInput.jsx';
import { normalizeMemberName } from '../utils/memberPolicy.js';

export default function UserMyPagePanel({ ctx }) {
  const {
    Button,
    Card,
    CardContent,
    Input,
    Users,
    adminMyProfileForm,
    adminMyProfileSaving,
    currentAuthAdminAccount,
    currentAuthRoleReady,
    data,
    firebaseAuthUser,
    goToUserLogin,
    goToUserSignup,
    isAdminAuthenticated,
    isCurrentFirebaseAuthGeneralUser,
    logoutAdmin,
    pushAppPath,
    saveMyAdminProfile,
    saveMyUserProfile,
    setAdminMyProfileForm,
    setUserProfileForm,
    setView,
    userProfile,
    userProfileForm,
    userProfileReady,
    userProfileSaving,
    userDirectoryVerificationLoading,
  } = ctx;

  return (
            <div className="mx-auto max-w-3xl space-y-6">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white">
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                  <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                  <div className="relative">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                      <Users size={26} />
                    </div>

                    <h2 className="text-xl font-black tracking-tight">마이페이지</h2>

                    <p className="mt-2 text-xs leading-5 text-slate-300">
                      로그인한 본인의 기본 정보를 수정합니다.
                    </p>
                  </div>
                </div>

                <CardContent className="p-6">
                  {!firebaseAuthUser && !isAdminAuthenticated ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-xs leading-5 text-orange-800">
                        마이페이지는 로그인 후 사용할 수 있습니다.
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={goToUserSignup}>
                          회원가입
                        </Button>
                        <Button type="button" variant="primary" onClick={goToUserLogin}>
                          로그인
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {currentAuthRoleReady &&
                        currentAuthAdminAccount &&
                        !isAdminAuthenticated && (
                          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
                            <h3 className="text-sm font-bold text-orange-900">
                              관리자 재인증이 필요합니다
                            </h3>

                            <p className="mt-2 text-xs leading-5 text-orange-800">
                              현재 계정은 관리자 계정입니다. 관리자 모드에서 다시 인증한 뒤
                              관리자 마이페이지를 이용해 주세요.
                            </p>

                            <div className="mt-4 flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={logoutAdmin}
                              >
                                로그아웃
                              </Button>

                              <Button
                                type="button"
                                variant="primary"
                                onClick={() => {
                                  pushAppPath('admin');
                                  setView('admin');
                                }}
                              >
                                관리자 모드로 이동
                              </Button>
                            </div>
                          </div>
                        )}

                      {isAdminAuthenticated && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                          <div className="mb-4">
                            <h3 className="text-base font-bold text-slate-900">관리자 내 정보</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              관리자 본인의 표시 정보와 연락처를 수정합니다.
                            </p>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <Input
                              label="관리자 ID"
                              value={adminMyProfileForm.adminLoginId}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  adminLoginId: v,
                                })
                              }
                              placeholder="관리자 ID 입력"
                            />

                            <Input
                              label="로그인 이메일"
                              type="email"
                              value={adminMyProfileForm.email}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  email: v,
                                })
                              }
                              disabled
                              placeholder="Firebase Auth 로그인 이메일"
                            />

                            <Input
                              label="조직명"
                              value={adminMyProfileForm.organizationName}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  organizationName: v,
                                })
                              }
                              placeholder="조직명 입력"
                            />

                            <Input
                              label="사용자명"
                              value={adminMyProfileForm.userName}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  userName: v,
                                })
                              }
                              placeholder="사용자명 입력"
                            />

                            <Input
                              label="전화번호"
                              value={adminMyProfileForm.phone}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  phone: v,
                                })
                              }
                              placeholder="전화번호 입력"
                            />

                            <Input
                              label="새 비밀번호"
                              type="password"
                              value={adminMyProfileForm.newPassword || ''}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  newPassword: v,
                                })
                              }
                              placeholder="변경할 때만 입력"
                            />

                            <Input
                              label="새 비밀번호 확인"
                              type="password"
                              value={adminMyProfileForm.newPasswordConfirm || ''}
                              onChange={(v) =>
                                setAdminMyProfileForm({
                                  ...adminMyProfileForm,
                                  newPasswordConfirm: v,
                                })
                              }
                              placeholder="새 비밀번호 재입력"
                            />
                          </div>

                          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-5 text-slate-500">
                            Firebase Auth 로그인 이메일은 이 화면에서 변경하지 않습니다.
                            비밀번호는 새 비밀번호를 입력한 경우에만 변경됩니다.
                            Firebase Auth 계정은 보안상 최근 로그인 상태가 필요할 수 있습니다.
                          </div>

                          <div className="mt-5 flex justify-end">
                            <Button
                              type="button"
                              variant="primary"
                              onClick={saveMyAdminProfile}
                              disabled={adminMyProfileSaving}
                            >
                              {adminMyProfileSaving ? '저장 중...' : '관리자 내 정보 저장'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {isCurrentFirebaseAuthGeneralUser && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                          <div className="mb-4">
                            <h3 className="text-base font-bold text-slate-900">일반 회원 내 정보</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              대여 신청에 사용할 본인 정보를 수정합니다.
                            </p>
                          </div>

                          {!userProfileReady ? (
                            <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-400">
                              회원 정보를 불러오는 중입니다.
                            </div>
                          ) : (
                            <>
                              {userProfile?.status === 'profileRequired' && (
                                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
                                  <div className="text-sm font-bold text-rose-900">
                                    등록 정보 확인이 필요합니다
                                  </div>
                                  <p className="mt-1 text-xs leading-5 text-rose-800">
                                    현재 등록 정보가 관리자 명부와 일치하지 않아 서비스 이용이 제한되었습니다.
                                    등록된 부서와 성명을 입력해 저장해 주세요.
                                  </p>
                                </div>
                              )}

                              <div className="grid gap-4 md:grid-cols-2">
                                <Input
                                  label="이메일"
                                  type="email"
                                  value={firebaseAuthUser.email || userProfile?.email || ''}
                                  onChange={() => {}}
                                  disabled
                                  placeholder="로그인 이메일"
                                />

                                <Input
                                  label="성명"
                                  value={userProfileForm.name}
                                  onChange={(value) =>
                                    setUserProfileForm({
                                      ...userProfileForm,
                                      name: normalizeMemberName(value).slice(0, 30),
                                    })
                                  }
                                  placeholder="공백 없이 성명을 입력하세요"
                                  maxLength={30}
                                />

                                {data.settings.requireRegisteredMemberForSignup ? (
                                  <label className="block">
                                    <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">
                                      부서 / 팀
                                    </span>
                                    <select
                                      value={userProfileForm.team}
                                      onChange={(event) =>
                                        setUserProfileForm({
                                          ...userProfileForm,
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
                                    value={userProfileForm.team}
                                    onChange={(value) =>
                                      setUserProfileForm({
                                        ...userProfileForm,
                                        team: value,
                                      })
                                    }
                                    placeholder="소속 부서 또는 팀명 입력"
                                  />
                                )}

                                <DomesticPhoneInput
                                  prefix={userProfileForm.phonePrefix}
                                  middle={userProfileForm.phoneMiddle}
                                  last={userProfileForm.phoneLast}
                                  disabled={userProfileSaving}
                                  onChange={(phoneParts) =>
                                    setUserProfileForm({
                                      ...userProfileForm,
                                      phonePrefix: phoneParts.prefix,
                                      phoneMiddle: phoneParts.middle,
                                      phoneLast: phoneParts.last,
                                    })
                                  }
                                />

                                <Input
                                  label="새 비밀번호"
                                  type="password"
                                  value={userProfileForm.newPassword || ''}
                                  onChange={(value) =>
                                    setUserProfileForm({
                                      ...userProfileForm,
                                      newPassword: value,
                                    })
                                  }
                                  placeholder="8자 이상, 영문+숫자 포함"
                                />

                                <Input
                                  label="새 비밀번호 확인"
                                  type="password"
                                  value={userProfileForm.newPasswordConfirm || ''}
                                  onChange={(value) =>
                                    setUserProfileForm({
                                      ...userProfileForm,
                                      newPasswordConfirm: value,
                                    })
                                  }
                                  placeholder="새 비밀번호 재입력"
                                />
                              </div>

                              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-5 text-slate-500">
                                새 비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.
                                Firebase Auth 계정은 보안상 최근 로그인 상태가 필요할 수 있습니다.
                              </div>

                              <div className="mt-5 flex justify-end">
                                <Button
                                  type="button"
                                  variant="primary"
                                  onClick={saveMyUserProfile}
                                  disabled={userProfileSaving || userDirectoryVerificationLoading}
                                >
                                  {userProfileSaving
                                    ? '저장 중...'
                                    : userDirectoryVerificationLoading
                                      ? '명부 확인 중...'
                                      : '일반 회원 내 정보 저장'}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
  );
}
