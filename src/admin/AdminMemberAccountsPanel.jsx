import { useState } from 'react';

import AdminMemberAccountEditDialog from './AdminMemberAccountEditDialog.jsx';
import AdminMemberTermsDialog from './AdminMemberTermsDialog.jsx';

import useAdminMemberAccountsController, {
  ADMIN_MEMBER_ACCOUNT_PAGE_SIZE_OPTIONS,
} from '../features/members/useAdminMemberAccountsController.js';
import useAdminMemberAccountEditActions from '../features/members/useAdminMemberAccountEditActions.js';
import useAdminMemberAccountStatusActions from '../features/members/useAdminMemberAccountStatusActions.js';
import {
  getUserAccountStatusClassName,
  getUserAccountStatusLabel,
} from '../features/members/memberAccountPolicy.js';

const formatCreatedAt = (account) =>
  typeof account?.createdAt?.toDate === 'function'
    ? account.createdAt.toDate().toLocaleString('ko-KR')
    : '-';

export default function AdminMemberAccountsPanel({ ctx }) {
  const {
    AdminPageHeader,
    Button,
    CheckCircle2,
    LogOut,
    Search,
    USER_PROFILE_STATUS,
    XCircle,
    adminMemberAccountsNavigationRequest,
    isAdminAuthenticated,
    memberAccountsPrerequisitesReady,
    registeredAdminAccounts,
    triggerConfirm,
    triggerToast,
  } = ctx;

  const {
    adminUserAccountHasNextPage,
    adminUserAccountPageSize,
    adminUserAccountQuery,
    adminUserAccountSearchMode,
    adminUserAccountTotalPages,
    adminUserAccountStatusCounts,
    adminUserAccountStatusFilter,
    adminUserAccountsLoadErrorMessage,
    adminUserAccountsReady,
    filteredManagedUserAccounts,
    refreshAdminUserAccounts,
    safeAdminUserAccountPage,
    setAdminUserAccountPage,
    setAdminUserAccountPageSize,
    setAdminUserAccountQuery,
    setAdminUserAccountStatusFilter,
  } = useAdminMemberAccountsController({
    prerequisitesReady: memberAccountsPrerequisitesReady,
    enabled: isAdminAuthenticated,
    navigationRequest: adminMemberAccountsNavigationRequest,
    registeredAdminAccounts,
    triggerToast,
  });

  const {
    adminUserAccountSavingUid,
    confirmUserAccountStatusChange,
  } = useAdminMemberAccountStatusActions({
    isAdminAuthenticated,
    triggerConfirm,
    triggerToast,
  });

  const {
    adminMemberProfileSavingUid,
    saveAdminMemberAccountProfile,
  } = useAdminMemberAccountEditActions({
    isAdminAuthenticated,
    triggerToast,
  });

  const [editAccount, setEditAccount] = useState(null);
  const [termsAccount, setTermsAccount] = useState(null);

  const saveEditAccount = async (form) => {
    if (!editAccount) return;
    try {
      await saveAdminMemberAccountProfile({ account: editAccount, form });
      refreshAdminUserAccounts();
      setEditAccount(null);
    } catch {
      // 오류 메시지는 저장 훅에서 표시한다. 다이얼로그는 수정할 수 있도록 유지한다.
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="회원 계정 관리"
        description="회원 계정을 목록으로 확인하고 상태 변경, 회원정보 수정, 이용 종료를 관리합니다. 회원명을 선택하면 상세정보를 확인·수정할 수 있습니다."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['승인 대기', adminUserAccountStatusCounts.pending, 'border-amber-200 bg-amber-50 text-amber-700'],
          ['활성', adminUserAccountStatusCounts.active, 'border-emerald-200 bg-emerald-50 text-emerald-700'],
          ['정보 수정 필요', adminUserAccountStatusCounts.profileRequired, 'border-orange-200 bg-orange-50 text-orange-700'],
          ['차단', adminUserAccountStatusCounts.blocked, 'border-rose-200 bg-rose-50 text-rose-700'],
          ['이용 종료', adminUserAccountStatusCounts.retired, 'border-slate-200 bg-slate-100 text-slate-700'],
        ].map(([label, count, className]) => (
          <div key={label} className={`rounded-2xl border p-4 ${className}`}>
            <div className="text-xs font-semibold">{label}</div>
            <div className="mt-1 text-2xl font-bold">{count}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,360px)_160px_140px] md:items-end md:justify-start">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">회원 검색</span>
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={adminUserAccountQuery}
                onChange={(event) => setAdminUserAccountQuery(event.target.value)}
                placeholder="이름, 이메일, 부서, 전화번호, UID"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none mk-form-border-focus"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">상태</span>
            <select
              value={adminUserAccountStatusFilter}
              onChange={(event) => setAdminUserAccountStatusFilter(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
            >
              <option value="all">전체</option>
              <option value={USER_PROFILE_STATUS.PENDING}>승인 대기</option>
              <option value={USER_PROFILE_STATUS.ACTIVE}>활성</option>
              <option value={USER_PROFILE_STATUS.PROFILE_REQUIRED}>정보 수정 필요</option>
              <option value={USER_PROFILE_STATUS.BLOCKED}>차단</option>
              <option value={USER_PROFILE_STATUS.RETIRED}>이용 종료</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">페이지당 표시</span>
            <select
              value={adminUserAccountPageSize}
              onChange={(event) => {
                setAdminUserAccountPageSize(Number(event.target.value));
                setAdminUserAccountPage(1);
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
            >
              {ADMIN_MEMBER_ACCOUNT_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}개</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!adminUserAccountsReady ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
          회원 계정 목록을 불러오는 중입니다.
        </div>
      ) : adminUserAccountsLoadErrorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-xs leading-5 text-rose-700">
          {adminUserAccountsLoadErrorMessage}
        </div>
      ) : filteredManagedUserAccounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
          검색 조건에 맞는 회원 계정이 없습니다.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white xl:block">
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[56px]" />
                <col className="w-[105px]" />
                <col />
                <col className="w-[145px]" />
                <col className="w-[175px]" />
                <col className="w-[245px]" />
                <col className="w-[96px]" />
              </colgroup>
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">번호</th>
                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">활성여부</th>
                  <th className="border-b border-slate-200 px-3 py-2.5">이름</th>
                  <th className="border-b border-slate-200 px-3 py-2.5">부서</th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-center">가입일시</th>
                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">이용 재개 / 차단</th>
                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">이용 종료</th>
                </tr>
              </thead>
              <tbody>
                {filteredManagedUserAccounts.map((account, index) => {
                  const accountStatus = account.status || '';
                  const isSaving = adminUserAccountSavingUid === account.uid;
                  const sequence = (safeAdminUserAccountPage - 1) * adminUserAccountPageSize + index + 1;

                  return (
                    <tr
                      key={account.uid}
                      className="cursor-pointer border-b border-slate-100 align-middle last:border-b-0 hover:bg-slate-50"
                      onClick={() => setEditAccount(account)}
                    >
                      <td className="px-2 py-3 text-center text-[11px] font-semibold text-slate-400">{sequence}</td>
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getUserAccountStatusClassName(accountStatus)}`}>
                          {getUserAccountStatusLabel(accountStatus)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="max-w-full truncate text-left text-xs font-bold text-slate-900 hover:text-orange-600 hover:underline"
                          title="회원 상세정보 확인 및 수정"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditAccount(account);
                          }}
                        >
                          {account.name || '이름 미등록'}
                        </button>
                      </td>
                      <td className="truncate px-3 py-3 text-xs text-slate-600" title={account.team || '-'}>
                        {account.team || '-'}
                      </td>
                      <td className="px-3 py-3 text-center text-[11px] leading-4 text-slate-500">
                        {formatCreatedAt(account)}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {accountStatus !== USER_PROFILE_STATUS.ACTIVE &&
                          accountStatus !== USER_PROFILE_STATUS.PROFILE_REQUIRED ? (
                            <Button
                              variant="primary"
                              className="whitespace-nowrap px-2.5 py-1.5 text-[11px]"
                              disabled={isSaving}
                              onClick={(event) => {
                                event.stopPropagation();
                                confirmUserAccountStatusChange(account, USER_PROFILE_STATUS.ACTIVE);
                              }}
                            >
                              <CheckCircle2 size={13} />
                              {accountStatus === USER_PROFILE_STATUS.PENDING ? '가입 승인' : '이용 재개'}
                            </Button>
                          ) : null}
                          {accountStatus !== USER_PROFILE_STATUS.BLOCKED ? (
                            <Button
                              variant="dangerOutline"
                              className="whitespace-nowrap px-2.5 py-1.5 text-[11px]"
                              disabled={isSaving}
                              onClick={(event) => {
                                event.stopPropagation();
                                confirmUserAccountStatusChange(account, USER_PROFILE_STATUS.BLOCKED);
                              }}
                            >
                              <XCircle size={13} /> 이용 차단
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center">
                        {accountStatus !== USER_PROFILE_STATUS.RETIRED ? (
                          <Button
                            variant="outline"
                            className="whitespace-nowrap px-2.5 py-1.5 text-[11px]"
                            disabled={isSaving}
                            onClick={(event) => {
                              event.stopPropagation();
                              confirmUserAccountStatusChange(account, USER_PROFILE_STATUS.RETIRED);
                            }}
                          >
                            <LogOut size={13} /> 이용 종료
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 xl:hidden">
            {filteredManagedUserAccounts.map((account, index) => {
              const accountStatus = account.status || '';
              const isSaving = adminUserAccountSavingUid === account.uid;
              const sequence = (safeAdminUserAccountPage - 1) * adminUserAccountPageSize + index + 1;

              return (
                <div
                  key={account.uid}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <button type="button" className="w-full text-left" onClick={() => setEditAccount(account)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{sequence}</span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900">{account.name || '이름 미등록'}</div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-500">{account.team || '-'}</div>
                        </div>
                      </div>
                      <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getUserAccountStatusClassName(accountStatus)}`}>
                        {getUserAccountStatusLabel(accountStatus)}
                      </span>
                    </div>
                    <div className="mt-3 text-[11px] text-slate-500">가입일시 {formatCreatedAt(account)}</div>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {accountStatus !== USER_PROFILE_STATUS.ACTIVE &&
                    accountStatus !== USER_PROFILE_STATUS.PROFILE_REQUIRED ? (
                      <Button
                        variant="primary"
                        className="px-3 py-2 text-xs"
                        disabled={isSaving}
                        onClick={() => confirmUserAccountStatusChange(account, USER_PROFILE_STATUS.ACTIVE)}
                      >
                        {accountStatus === USER_PROFILE_STATUS.PENDING ? '가입 승인' : '이용 재개'}
                      </Button>
                    ) : null}
                    {accountStatus !== USER_PROFILE_STATUS.BLOCKED ? (
                      <Button
                        variant="dangerOutline"
                        className="px-3 py-2 text-xs"
                        disabled={isSaving}
                        onClick={() => confirmUserAccountStatusChange(account, USER_PROFILE_STATUS.BLOCKED)}
                      >
                        이용 차단
                      </Button>
                    ) : null}
                    {accountStatus !== USER_PROFILE_STATUS.RETIRED ? (
                      <Button
                        variant="outline"
                        className="px-3 py-2 text-xs"
                        disabled={isSaving}
                        onClick={() => confirmUserAccountStatusChange(account, USER_PROFILE_STATUS.RETIRED)}
                      >
                        이용 종료
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {adminUserAccountsReady && !adminUserAccountsLoadErrorMessage ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            {adminUserAccountSearchMode
              ? adminUserAccountHasNextPage
                ? `검색 결과를 순차 조회 중 · ${adminUserAccountPageSize}명씩 보기`
                : `검색 완료 · ${adminUserAccountPageSize}명씩 보기`
              : `서버 커서 페이지 · ${adminUserAccountPageSize}명씩 보기`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="px-3 py-2 text-xs"
              disabled={safeAdminUserAccountPage <= 1}
              onClick={() => setAdminUserAccountPage((prev) => Math.max(1, prev - 1))}
            >
              이전
            </Button>
            <span className="min-w-[72px] text-center text-xs font-bold text-slate-700">
              {safeAdminUserAccountPage} / {adminUserAccountTotalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              className="px-3 py-2 text-xs"
              disabled={
                safeAdminUserAccountPage >= adminUserAccountTotalPages ||
                (!adminUserAccountSearchMode && !adminUserAccountHasNextPage)
              }
              onClick={() =>
                setAdminUserAccountPage((prev) => Math.min(adminUserAccountTotalPages, prev + 1))
              }
            >
              다음
            </Button>
          </div>
        </div>
      ) : null}

      {editAccount ? (
        <AdminMemberAccountEditDialog
          account={editAccount}
          Button={Button}
          saving={adminMemberProfileSavingUid === editAccount.uid}
          onClose={() => setEditAccount(null)}
          onOpenTerms={() => setTermsAccount(editAccount)}
          onSave={saveEditAccount}
        />
      ) : null}

      {termsAccount ? (
        <AdminMemberTermsDialog
          account={termsAccount}
          onClose={() => setTermsAccount(null)}
        />
      ) : null}
    </div>
  );
}
