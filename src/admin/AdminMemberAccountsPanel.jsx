export default function AdminMemberAccountsPanel({ ctx }) {
  const {
    AdminPageHeader,
    Button,
    CheckCircle2,
    LogOut,
    Search,
    USER_PROFILE_STATUS,
    XCircle,
    adminUserAccountQuery,
    adminUserAccountSavingUid,
    adminUserAccountStatusCounts,
    adminUserAccountStatusFilter,
    adminUserAccountsLoadErrorMessage,
    adminUserAccountsReady,
    confirmUserAccountStatusChange,
    filteredManagedUserAccounts,
    getUserAccountStatusClassName,
    getUserAccountStatusLabel,
    setAdminUserAccountQuery,
    setAdminUserAccountStatusFilter,
  } = ctx;

  return (
                    <div className="space-y-6">
                      <AdminPageHeader
                        title="회원 계정 관리"
                        description="신규 가입 승인, 등록 정보 확인, 이용 차단과 이용 종료 상태를 관리합니다."
                      />

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        {[
                          [
                            '승인 대기',
                            adminUserAccountStatusCounts.pending,
                            'border-amber-200 bg-amber-50 text-amber-700',
                          ],
                          [
                            '활성',
                            adminUserAccountStatusCounts.active,
                            'border-emerald-200 bg-emerald-50 text-emerald-700',
                          ],
                          [
                            '정보 수정 필요',
                            adminUserAccountStatusCounts.profileRequired,
                            'border-orange-200 bg-orange-50 text-orange-700',
                          ],
                          [
                            '차단',
                            adminUserAccountStatusCounts.blocked,
                            'border-rose-200 bg-rose-50 text-rose-700',
                          ],
                          [
                            '이용 종료',
                            adminUserAccountStatusCounts.retired,
                            'border-slate-200 bg-slate-100 text-slate-700',
                          ],
                        ].map(
                          ([
                            label,
                            count,
                            className,
                          ]) => (
                            <div
                              key={label}
                              className={`rounded-2xl border p-4 ${className}`}
                            >
                              <div className="text-xs font-semibold">
                                {label}
                              </div>

                              <div className="mt-1 text-2xl font-bold">
                                {count}
                              </div>
                            </div>
                          )
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">
                            회원 검색
                          </span>

                          <div className="relative">
                            <Search
                              size={15}
                              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />

                            <input
                              value={
                                adminUserAccountQuery
                              }
                              onChange={(event) =>
                                setAdminUserAccountQuery(
                                  event.target.value
                                )
                              }
                              placeholder="이름, 이메일, 부서, 전화번호, UID"
                              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none mk-form-border-focus"
                            />
                          </div>
                        </label>

                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">
                            상태
                          </span>

                          <select
                            value={
                              adminUserAccountStatusFilter
                            }
                            onChange={(event) =>
                              setAdminUserAccountStatusFilter(
                                event.target.value
                              )
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none mk-form-border-focus"
                          >
                            <option value="all">
                              전체
                            </option>

                            <option
                              value={
                                USER_PROFILE_STATUS.PENDING
                              }
                            >
                              승인 대기
                            </option>

                            <option
                              value={
                                USER_PROFILE_STATUS.ACTIVE
                              }
                            >
                              활성
                            </option>

                            <option
                              value={
                                USER_PROFILE_STATUS.PROFILE_REQUIRED
                              }
                            >
                              정보 수정 필요
                            </option>

                            <option
                              value={
                                USER_PROFILE_STATUS.BLOCKED
                              }
                            >
                              차단
                            </option>

                            <option
                              value={
                                USER_PROFILE_STATUS.RETIRED
                              }
                            >
                              이용 종료
                            </option>
                          </select>
                        </label>
                      </div>

                      {!adminUserAccountsReady ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          회원 계정 목록을 불러오는 중입니다.
                        </div>
                      ) : adminUserAccountsLoadErrorMessage ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-xs leading-5 text-rose-700">
                          {
                            adminUserAccountsLoadErrorMessage
                          }
                        </div>
                      ) : filteredManagedUserAccounts.length ===
                        0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          검색 조건에 맞는 회원 계정이 없습니다.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredManagedUserAccounts.map(
                            (account) => {
                              const accountStatus =
                                account.status || '';

                              const isSaving =
                                adminUserAccountSavingUid ===
                                account.uid;

                              const createdAtText =
                                typeof account.createdAt
                                  ?.toDate === 'function'
                                  ? account.createdAt
                                      .toDate()
                                      .toLocaleString(
                                        'ko-KR'
                                      )
                                  : '-';

                              return (
                                <div
                                  key={account.uid}
                                  className="rounded-2xl border border-slate-200 bg-white p-4"
                                >
                                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0 space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="font-bold text-slate-900">
                                          {account.name ||
                                            '이름 미등록'}
                                        </div>

                                        <span
                                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getUserAccountStatusClassName(
                                            accountStatus
                                          )}`}
                                        >
                                          {getUserAccountStatusLabel(
                                            accountStatus
                                          )}
                                        </span>
                                      </div>

                                      <div className="grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                                        <div>
                                          이메일:{' '}
                                          <span className="text-slate-800">
                                            {account.email ||
                                              '-'}
                                          </span>
                                        </div>

                                        <div>
                                          부서:{' '}
                                          <span className="text-slate-800">
                                            {account.team ||
                                              '-'}
                                          </span>
                                        </div>

                                        <div>
                                          전화번호:{' '}
                                          <span className="text-slate-800">
                                            {account.phone ||
                                              '-'}
                                          </span>
                                        </div>

                                        <div>
                                          가입일:{' '}
                                          <span className="text-slate-800">
                                            {createdAtText}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="break-all text-[10px] text-slate-400">
                                        UID: {account.uid}
                                      </div>

                                      {accountStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED ? (
                                        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
                                          사유: {account.profileRequiredReason === 'duplicateIdentity'
                                            ? '부서·성명 중복 계정'
                                            : '등록 명부 불일치'}
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[330px] lg:justify-end">
                                      {accountStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED ? (
                                        <div className="w-full text-right text-[11px] leading-4 text-orange-600">
                                          사용자가 마이페이지에서 등록 정보를 확인해야 합니다.
                                        </div>
                                      ) : null}
                                      {accountStatus !==
                                        USER_PROFILE_STATUS.ACTIVE &&
                                        accountStatus !==
                                          USER_PROFILE_STATUS.PROFILE_REQUIRED && (
                                        <Button
                                          variant="primary"
                                          className="px-3 py-2 text-xs"
                                          disabled={
                                            isSaving
                                          }
                                          onClick={() =>
                                            confirmUserAccountStatusChange(
                                              account,
                                              USER_PROFILE_STATUS.ACTIVE
                                            )
                                          }
                                        >
                                          <CheckCircle2
                                            size={14}
                                          />

                                          {accountStatus ===
                                          USER_PROFILE_STATUS.PENDING
                                            ? '가입 승인'
                                            : '이용 재개'}
                                        </Button>
                                      )}

                                      {accountStatus !==
                                        USER_PROFILE_STATUS.BLOCKED && (
                                        <Button
                                          variant="dangerOutline"
                                          className="px-3 py-2 text-xs"
                                          disabled={
                                            isSaving
                                          }
                                          onClick={() =>
                                            confirmUserAccountStatusChange(
                                              account,
                                              USER_PROFILE_STATUS.BLOCKED
                                            )
                                          }
                                        >
                                          <XCircle
                                            size={14}
                                          />
                                          이용 차단
                                        </Button>
                                      )}

                                      {accountStatus !==
                                        USER_PROFILE_STATUS.RETIRED && (
                                        <Button
                                          variant="outline"
                                          className="px-3 py-2 text-xs"
                                          disabled={
                                            isSaving
                                          }
                                          onClick={() =>
                                            confirmUserAccountStatusChange(
                                              account,
                                              USER_PROFILE_STATUS.RETIRED
                                            )
                                          }
                                        >
                                          <LogOut
                                            size={14}
                                          />
                                          이용 종료
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>
  );
}
