export default function AdminAccountsPanel({ ctx }) {
  const {
    AdminPageHeader,
    ADMIN_ACCOUNT_PAGE_SIZE,
    ADMIN_CUSTOM_OPTION_VALUE,
    Button,
    Input,
    Select,
    adminAccountEditForm,
    adminAccountForm,
    adminAccountTotalPages,
    adminAccountUserOptions,
    authenticatedAdminId,
    cancelEditAdminAccount,
    createDefaultAdminAccountForm,
    data,
    deleteAdminAccount,
    editingAdminAccountId,
    paginatedAdminAccounts,
    registerAdminAccount,
    registeredAdminAccounts,
    safeAdminAccountPage,
    saveAdminAccountEdit,
    sendAdminAccountPasswordResetEmail,
    setAdminAccountEditForm,
    setAdminAccountForm,
    setAdminAccountPage,
    startEditAdminAccount,
  } = ctx;

  return (
                    <div className="space-y-6">
                      <AdminPageHeader
                        title="관리자 ID 관리"
                        description="공지사항 작성 권한과 관리자 모드 보안 강화를 위한 관리자 ID 등록 대장입니다."
                      />

                      <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 text-xs leading-5 text-orange-800">
                        신규 관리자 계정은 관리자모드에서 생성하되, 비밀번호 검증은 Firebase Authentication 이메일/비밀번호 방식으로 처리합니다.
                        기존 PBKDF2 관리자 계정은 이메일이 등록되어 있으면 로그인 성공 시 Firebase Auth 계정으로 자동 연결됩니다.
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                        <div className="mb-4">
                          <h3 className="text-base font-bold text-slate-900">관리자 ID 등록</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            조직명과 사용자명은 기존 부서·사용자 목록에서 선택하거나, 기타 직접 입력으로 공용 계정을 등록할 수 있습니다.
                          </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <Input
                            label="관리자 ID"
                            value={adminAccountForm.adminLoginId}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                adminLoginId: v,
                              })
                            }
                            placeholder="예: admin01"
                          />

                          <Input
                            label="초기 비밀번호"
                            type="password"
                            value={adminAccountForm.password}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                password: v,
                              })
                            }
                            placeholder="Firebase Auth 초기 비밀번호 입력"
                          />

                          <Select
                            label="조직명"
                            value={adminAccountForm.organizationName}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                organizationName: v,
                                customOrganizationName:
                                  v === ADMIN_CUSTOM_OPTION_VALUE
                                    ? adminAccountForm.customOrganizationName
                                    : '',
                                userName: '',
                                customUserName: '',
                              })
                            }
                          >
                            <option value="">조직 선택</option>
                            {(data.teams || []).map((team) => (
                              <option key={team} value={team}>
                                {team}
                              </option>
                            ))}
                            <option value={ADMIN_CUSTOM_OPTION_VALUE}>기타 직접 입력</option>
                          </Select>

                          {adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE ? (
                            <Input
                              label="조직명 직접 입력"
                              value={adminAccountForm.customOrganizationName}
                              onChange={(v) =>
                                setAdminAccountForm({
                                  ...adminAccountForm,
                                  customOrganizationName: v,
                                  userName: ADMIN_CUSTOM_OPTION_VALUE,
                                })
                              }
                              placeholder="예: 관리자, 기획1팀, 공용계정"
                            />
                          ) : (
                            <Select
                              label="사용자명"
                              value={adminAccountForm.userName}
                              onChange={(v) =>
                                setAdminAccountForm({
                                  ...adminAccountForm,
                                  userName: v,
                                  customUserName:
                                    v === ADMIN_CUSTOM_OPTION_VALUE
                                      ? adminAccountForm.customUserName
                                      : '',
                                })
                              }
                            >
                              <option value="">
                                {adminAccountForm.organizationName
                                  ? '사용자 선택'
                                  : '조직명을 먼저 선택해 주세요'}
                              </option>
                              {adminAccountUserOptions.map((borrower, index) => (
                                <option
                                  key={`${borrower.team}-${borrower.name}-${index}`}
                                  value={borrower.name}
                                >
                                  {borrower.name}
                                </option>
                              ))}
                              <option value={ADMIN_CUSTOM_OPTION_VALUE}>기타 직접 입력</option>
                            </Select>
                          )}

                          {(adminAccountForm.organizationName === ADMIN_CUSTOM_OPTION_VALUE ||
                            adminAccountForm.userName === ADMIN_CUSTOM_OPTION_VALUE) && (
                            <Input
                              label="사용자명 직접 입력"
                              value={adminAccountForm.customUserName}
                              onChange={(v) =>
                                setAdminAccountForm({
                                  ...adminAccountForm,
                                  customUserName: v,
                                  userName: ADMIN_CUSTOM_OPTION_VALUE,
                                })
                              }
                              placeholder="예: 관리자, 기획1팀 공용"
                            />
                          )}

                          <Input
                            label="로그인 이메일"
                            type="email"
                            value={adminAccountForm.email}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                email: v,
                              })
                            }
                            placeholder="예: admin@example.com"
                          />

                          <Input
                            label="전화번호"
                            value={adminAccountForm.phone}
                            onChange={(v) =>
                              setAdminAccountForm({
                                ...adminAccountForm,
                                phone: v,
                              })
                            }
                            placeholder="예: 010-0000-0000"
                          />
                        </div>

                        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200/70 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setAdminAccountForm(createDefaultAdminAccountForm())}
                          >
                            입력 초기화
                          </Button>
                          <Button variant="primary" onClick={registerAdminAccount}>
                            관리자 ID 등록
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-end">
                          <div>
                            <h3 className="text-base font-bold text-slate-900">관리자 ID 현황</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              한 페이지에 최대 {ADMIN_ACCOUNT_PAGE_SIZE}개까지 표시됩니다.
                            </p>
                          </div>
                          <div className="text-xs font-semibold text-slate-500">
                            총 {(registeredAdminAccounts || []).length}개
                          </div>
                        </div>

                        {(registeredAdminAccounts || []).length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                            등록된 관리자 ID가 없습니다.
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              {paginatedAdminAccounts.map((account, index) => {
                                const isEditingAdminAccount = editingAdminAccountId === account.id;
                                const isCurrentAdminAccount = account.id === authenticatedAdminId;

                                return (
                                  <div
                                    key={account.id}
                                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                  >
                                    {isEditingAdminAccount ? (
                                      <div className="space-y-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                          <Input
                                            label="관리자 ID"
                                            value={adminAccountEditForm.adminLoginId}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                adminLoginId: v,
                                              })
                                            }
                                            placeholder="관리자 ID 입력"
                                          />

                                          <Input
                                            label="로그인 이메일"
                                            type="email"
                                            value={adminAccountEditForm.email}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                email: v,
                                              })
                                            }
                                            disabled={Boolean(account.authUid)}
                                            placeholder={
                                              account.authUid
                                                ? 'Firebase Auth 연결 계정은 이메일 변경 불가'
                                                : '관리자 로그인 이메일 입력'
                                            }
                                          />

                                          <Input
                                            label="조직명"
                                            value={adminAccountEditForm.organizationName}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                organizationName: v,
                                              })
                                            }
                                            placeholder="조직명 입력"
                                          />

                                          <Input
                                            label="사용자명"
                                            value={adminAccountEditForm.userName}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                userName: v,
                                              })
                                            }
                                            placeholder="사용자명 입력"
                                          />

                                          <Input
                                            label="전화번호"
                                            value={adminAccountEditForm.phone}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                phone: v,
                                              })
                                            }
                                            placeholder="전화번호 입력"
                                          />

                                          <Input
                                            label="새 비밀번호"
                                            type="password"
                                            value={adminAccountEditForm.newPassword || ''}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                newPassword: v,
                                              })
                                            }
                                            disabled={Boolean(account.authUid) && !isCurrentAdminAccount}
                                            placeholder={
                                              account.authUid && !isCurrentAdminAccount
                                                ? '다른 Firebase Auth 계정은 직접 지정 불가'
                                                : '변경할 때만 입력'
                                            }
                                          />

                                          <Input
                                            label="새 비밀번호 확인"
                                            type="password"
                                            value={adminAccountEditForm.newPasswordConfirm || ''}
                                            onChange={(v) =>
                                              setAdminAccountEditForm({
                                                ...adminAccountEditForm,
                                                newPasswordConfirm: v,
                                              })
                                            }
                                            disabled={Boolean(account.authUid) && !isCurrentAdminAccount}
                                            placeholder={
                                              account.authUid && !isCurrentAdminAccount
                                                ? '비밀번호 재설정 메일 사용'
                                                : '새 비밀번호 재입력'
                                            }
                                          />
                                        </div>

                                        {account.authUid && (
                                          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
                                            <p>
                                              Firebase Auth 연결 계정의 로그인 이메일은 클라이언트 관리자 화면에서 직접 변경하지 않습니다.
                                              {isCurrentAdminAccount
                                                ? ' 현재 로그인 중인 본인 계정은 새 비밀번호를 직접 변경할 수 있습니다.'
                                                : ' 다른 관리자 계정의 비밀번호는 직접 지정할 수 없으며, 재설정 메일 발송으로 변경합니다.'}
                                            </p>

                                            {!isCurrentAdminAccount && (
                                              <div className="flex justify-end">
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  className="px-3 py-2 text-xs"
                                                  onClick={() => sendAdminAccountPasswordResetEmail(account)}
                                                >
                                                  비밀번호 재설정 메일 발송
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {!account.authUid && (
                                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
                                            기존 해시 계정은 새 비밀번호 입력 시 PBKDF2-SHA-256 방식으로 다시 저장됩니다.
                                          </div>
                                        )}

                                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="px-3 py-2 text-xs"
                                            onClick={cancelEditAdminAccount}
                                          >
                                            취소
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="primary"
                                            className="px-3 py-2 text-xs"
                                            onClick={() => saveAdminAccountEdit(account)}
                                          >
                                            저장
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                                        <div className="min-w-0 space-y-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                              #{(safeAdminAccountPage - 1) * ADMIN_ACCOUNT_PAGE_SIZE + index + 1}
                                            </span>
                                            <span className="text-sm font-bold text-slate-900">
                                              {account.adminLoginId}
                                            </span>
                                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                              {account.authUid ? 'Firebase Auth 연결' : '기존 해시 계정'}
                                            </span>
                                            {isCurrentAdminAccount && (
                                              <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold mk-brand-text">
                                                현재 로그인
                                              </span>
                                            )}
                                          </div>

                                          <div className="text-xs text-slate-600">
                                            조직명: <span className="font-semibold text-slate-800">{account.organizationName}</span>
                                            <span className="mx-1 text-slate-300">|</span>
                                            사용자명: <span className="font-semibold text-slate-800">{account.userName}</span>
                                          </div>

                                          <div className="text-[11px] text-slate-500">
                                            이메일: {account.authEmail || account.email || '미입력'}
                                            <span className="mx-1 text-slate-300">|</span>
                                            전화번호: {account.phone || '미입력'}
                                          </div>

                                          <div className="text-[10px] text-slate-400">
                                            등록일: {account.createdAt || '기록 없음'}
                                          </div>
                                        </div>

                                        <div className="flex shrink-0 gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="px-3 py-2 text-xs"
                                            onClick={() => startEditAdminAccount(account)}
                                          >
                                            수정
                                          </Button>

                                          <Button
                                            type="button"
                                            variant="danger"
                                            className="px-3 py-2 text-xs"
                                            disabled={isCurrentAdminAccount || (registeredAdminAccounts || []).length <= 1}
                                            onClick={() => deleteAdminAccount(account)}
                                          >
                                            삭제
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                              <Button
                                variant="outline"
                                disabled={safeAdminAccountPage <= 1}
                                onClick={() =>
                                  setAdminAccountPage((prev) => Math.max(1, prev - 1))
                                }
                                className="px-3 py-2 text-xs"
                              >
                                이전
                              </Button>
                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                {safeAdminAccountPage} / {adminAccountTotalPages}
                              </div>
                              <Button
                                variant="outline"
                                disabled={safeAdminAccountPage >= adminAccountTotalPages}
                                onClick={() =>
                                  setAdminAccountPage((prev) =>
                                    Math.min(adminAccountTotalPages, prev + 1)
                                  )
                                }
                                className="px-3 py-2 text-xs"
                              >
                                다음
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
  );
}
