import { useState } from 'react';
import DomesticPhoneInput from '../components/DomesticPhoneInput.jsx';
import useUserMyPageSecurity from '../features/members/useUserMyPageSecurity.js';
import { sanitizeMemberNameInput } from '../utils/memberPolicy.js';
import UserTermsConsentPanel from './UserTermsConsentPanel.jsx';

function PasswordChangePanel({ Button, Input, security }) {
  return (
    <form onSubmit={security.changePassword}>
      <div className="mb-4">
        <h3 className="text-base font-bold text-slate-900">비밀번호 변경</h3>
        <p className="mt-1 text-xs text-slate-500">
          새 비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="새 비밀번호"
          type="password"
          value={security.newPassword}
          onChange={security.setNewPassword}
          placeholder="8자 이상, 영문+숫자 포함"
          autoComplete="new-password"
          disabled={security.passwordChanging}
        />
        <Input
          label="새 비밀번호 확인"
          type="password"
          value={security.newPasswordConfirm}
          onChange={security.setNewPasswordConfirm}
          placeholder="새 비밀번호 재입력"
          autoComplete="new-password"
          disabled={security.passwordChanging}
          aria-invalid={security.passwordMismatch || undefined}
        />
      </div>

      {security.passwordMismatch ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          입력하신 비밀번호가 일치하지 않습니다.
        </div>
      ) : security.passwordErrorMessage ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {security.passwordErrorMessage}
        </div>
      ) : null}

      <div className="mt-5 flex justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={
            security.passwordChanging ||
            !security.newPassword ||
            !security.newPasswordConfirm ||
            security.passwordMismatch
          }
        >
          {security.passwordChanging ? '변경 중...' : '비밀번호 변경'}
        </Button>
      </div>
    </form>
  );
}

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
    goToUserHome,
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
    triggerToast,
    userProfile,
    userProfileForm,
    userProfileReady,
    userProfileSaving,
    userDirectoryVerificationLoading,
    withdrawalDialogOpen,
    withdrawalLoading,
    withdrawalPassword,
    withdrawalBlockMessage,
    openWithdrawalDialog,
    cancelWithdrawal,
    submitMembershipWithdrawal,
    setWithdrawalPassword,
  } = ctx;

  const [generalUserTab, setGeneralUserTab] = useState('profile');
  const [adminMyPageTab, setAdminMyPageTab] = useState('profile');
  const security = useUserMyPageSecurity({
    firebaseAuthUser,
    triggerToast,
  });
  const requiresMyPageVerification = Boolean(firebaseAuthUser?.uid);

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
              로그인한 본인의 기본 정보와 보안 설정을 관리합니다.
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
          ) : requiresMyPageVerification && !security.isVerified ? (
            <form className="mx-auto max-w-md space-y-4" onSubmit={security.verifyCurrentPassword}>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <h3 className="text-base font-bold text-slate-900">마이페이지 본인 확인</h3>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  회원정보 보호를 위해 현재 비밀번호를 다시 입력해 주세요.
                </p>

                <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold text-slate-500">로그인 이메일</div>
                  <div className="mt-1 break-all text-sm font-bold text-slate-900">
                    {firebaseAuthUser?.email || '이메일 확인 불가'}
                  </div>
                </div>

                <div className="mt-4">
                  <Input
                    label="현재 비밀번호"
                    type="password"
                    value={security.currentPassword}
                    onChange={security.setCurrentPassword}
                    placeholder="현재 비밀번호 입력"
                    autoComplete="current-password"
                    disabled={security.verificationLoading}
                    autoFocus
                  />
                </div>

                {security.verificationErrorMessage ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                    {security.verificationErrorMessage}
                  </div>
                ) : null}

                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={security.verificationLoading}
                    onClick={() => {
                      if (isAdminAuthenticated) {
                        pushAppPath('admin');
                        setView('admin');
                        return;
                      }

                      goToUserHome();
                    }}
                  >
                    취소
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={security.verificationLoading || !security.currentPassword}
                  >
                    {security.verificationLoading ? '확인 중...' : '본인 확인'}
                  </Button>
                </div>
              </div>
            </form>
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
                  <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white text-center text-[11px] font-bold">
                    {[
                      ['profile', '기본 정보'],
                      ['password', '비밀번호 변경'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAdminMyPageTab(value)}
                        className={`px-3 py-2.5 transition ${adminMyPageTab === value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {adminMyPageTab === 'profile' ? (
                    <div>
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
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-5 text-slate-500">
                        Firebase Auth 로그인 이메일은 이 화면에서 변경하지 않습니다.
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
                  ) : null}

                  {adminMyPageTab === 'password' ? (
                    <PasswordChangePanel Button={Button} Input={Input} security={security} />
                  ) : null}
                </div>
              )}

              {isCurrentFirebaseAuthGeneralUser && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                  <div className="mb-5 grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200 bg-white text-center text-[11px] font-bold">
                    {[
                      ['profile', '기본 정보'],
                      ['password', '비밀번호 변경'],
                      ['terms', '약관 동의'],
                      ['withdrawal', '회원 탈퇴'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setGeneralUserTab(value)}
                        className={`px-2 py-2.5 transition ${generalUserTab === value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {generalUserTab === 'profile' ? (
                    <div>
                      <div className="mb-4">
                        <h3 className="text-base font-bold text-slate-900">일반 회원 내 정보</h3>
                        <p className="mt-1 text-xs text-slate-500">대여 신청에 사용할 본인 정보를 수정합니다.</p>
                      </div>

                      {!userProfileReady ? (
                        <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-400">
                          회원 정보를 불러오는 중입니다.
                        </div>
                      ) : (
                        <>
                          {userProfile?.status === 'profileRequired' && (
                            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
                              <div className="text-sm font-bold text-rose-900">등록 정보 확인이 필요합니다</div>
                              <p className="mt-1 text-xs leading-5 text-rose-800">
                                현재 등록 정보가 관리자 명부와 일치하지 않아 서비스 이용이 제한되었습니다. 등록된 부서와 성명을 입력해 저장해 주세요.
                              </p>
                            </div>
                          )}

                          <div className="grid gap-4 md:grid-cols-2">
                            <Input label="이메일" type="email" value={firebaseAuthUser.email || userProfile?.email || ''} onChange={() => {}} disabled placeholder="로그인 이메일" />
                            <Input
                              label="성명"
                              value={userProfileForm.name}
                              onChange={(value) => setUserProfileForm({ ...userProfileForm, name: sanitizeMemberNameInput(value).slice(0, 30) })}
                              placeholder="공백 없이 성명을 입력하세요"
                              maxLength={30}
                            />

                            {data.settings.requireRegisteredMemberForSignup ? (
                              <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">부서 / 팀</span>
                                <select
                                  value={userProfileForm.team}
                                  onChange={(event) => setUserProfileForm({ ...userProfileForm, team: event.target.value })}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition mk-form-focus"
                                >
                                  <option value="">부서 / 팀을 선택해 주세요</option>
                                  {(data.teams || []).map((team) => <option key={team} value={team}>{team}</option>)}
                                </select>
                              </label>
                            ) : (
                              <Input label="부서 / 팀" value={userProfileForm.team} onChange={(value) => setUserProfileForm({ ...userProfileForm, team: value })} placeholder="소속 부서 또는 팀명 입력" />
                            )}

                            <DomesticPhoneInput
                              prefix={userProfileForm.phonePrefix}
                              middle={userProfileForm.phoneMiddle}
                              last={userProfileForm.phoneLast}
                              disabled={userProfileSaving}
                              onChange={(phoneParts) => setUserProfileForm({ ...userProfileForm, phonePrefix: phoneParts.prefix, phoneMiddle: phoneParts.middle, phoneLast: phoneParts.last })}
                            />
                          </div>

                          <div className="mt-5 flex justify-end">
                            <Button type="button" variant="primary" onClick={saveMyUserProfile} disabled={userProfileSaving || userDirectoryVerificationLoading}>
                              {userProfileSaving ? '저장 중...' : userDirectoryVerificationLoading ? '명부 확인 중...' : '일반 회원 내 정보 저장'}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                  {generalUserTab === 'password' ? (
                    <PasswordChangePanel Button={Button} Input={Input} security={security} />
                  ) : null}

                  {generalUserTab === 'terms' ? (
                    <div>
                      <div className="mb-4">
                        <h3 className="text-base font-bold text-slate-900">약관 동의 내역</h3>
                        <p className="mt-1 text-xs text-slate-500">현재 약관 동의 상태와 변경 이력을 확인하고 선택 약관을 수정합니다.</p>
                      </div>
                      <UserTermsConsentPanel account={userProfile} Button={Button} triggerToast={triggerToast} />
                    </div>
                  ) : null}

                  {generalUserTab === 'withdrawal' ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
                      <h3 className="text-sm font-bold text-rose-900">회원 탈퇴</h3>
                      <p className="mt-2 text-xs leading-5 text-rose-800">
                        탈퇴하면 현재 계정으로 로그인할 수 없습니다. 진행 중인 신청·대여, 연체 또는 유효한 대여 제한이 있으면 탈퇴할 수 없습니다.
                      </p>

                      {withdrawalBlockMessage ? (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-white px-4 py-3 text-[11px] leading-5 text-rose-700">{withdrawalBlockMessage}</div>
                      ) : null}

                      {withdrawalDialogOpen ? (
                        <form className="mt-4 space-y-3" onSubmit={submitMembershipWithdrawal}>
                          <Input label="현재 비밀번호" type="password" value={withdrawalPassword} onChange={setWithdrawalPassword} placeholder="본인 확인을 위해 현재 비밀번호 입력" autoComplete="current-password" />
                          <div className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-[11px] leading-5 text-rose-700">
                            탈퇴 시 이메일·연락처 등 개인정보는 비식별 처리되며, 대여·연체·제재 이력은 감사 및 재가입 확인을 위해 연결 정보가 보존됩니다.
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" disabled={withdrawalLoading} onClick={cancelWithdrawal}>취소</Button>
                            <Button type="submit" variant="danger" disabled={withdrawalLoading || Boolean(withdrawalBlockMessage)}>{withdrawalLoading ? '탈퇴 처리 중...' : '회원 탈퇴'}</Button>
                          </div>
                        </form>
                      ) : (
                        <div className="mt-4 flex justify-end">
                          <Button type="button" variant="danger" onClick={openWithdrawalDialog} disabled={Boolean(withdrawalBlockMessage)}>회원 탈퇴</Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
