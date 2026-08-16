import { useState } from 'react';

import AdminMemberAccountCreateDialog from './AdminMemberAccountCreateDialog.jsx';
import AdminMemberAccountDetailPanel from './AdminMemberAccountDetailPanel.jsx';
import AdminMemberAccountEditDialog from './AdminMemberAccountEditDialog.jsx';
import AdminMemberTermsDialog from './AdminMemberTermsDialog.jsx';

import useAdminMemberAccountsController, {
  ADMIN_MEMBER_ACCOUNT_PAGE_SIZE_OPTIONS,
} from '../features/members/useAdminMemberAccountsController.js';
import useAdminMemberAccountCreateActions from '../features/members/useAdminMemberAccountCreateActions.js';
import useAdminMemberAccountEditActions from '../features/members/useAdminMemberAccountEditActions.js';
import useAdminMemberAccountStatusActions from '../features/members/useAdminMemberAccountStatusActions.js';
import {
  formatUserAccountCreatedAt,
  getUserAccountStatusClassName,
  getUserAccountStatusLabel,
} from '../features/members/memberAccountPolicy.js';

const compactActionButtonClass = '!gap-1 !rounded-lg !px-2 !py-1 !text-[10px]';

const MEMBER_ACCOUNT_TAB_KEY = 'mk_member_account_management_tab';
const MEMBER_ACCOUNT_TABS = [
  ['current', '전체 회원'],
  ['retired', '탈퇴 회원'],
];

const getInitialMemberAccountTab = () => {
  if (typeof window === 'undefined') return 'current';
  const saved = window.sessionStorage.getItem(MEMBER_ACCOUNT_TAB_KEY);
  return MEMBER_ACCOUNT_TABS.some(([key]) => key === saved) ? saved : 'current';
};


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
    memberDirectoryBorrowers,
    memberDirectoryPolicyEnabled,
    memberDirectoryTeams,
    registeredAdminAccounts,
    triggerConfirm,
    triggerToast,
  } = ctx;

  const [activeTab, setActiveTab] = useState(getInitialMemberAccountTab);

  const {
    adminUserAccountHasNextPage,
    adminUserAccountPageSize,
    adminUserAccountQuery,
    adminUserAccountResultCount,
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
    accountView: activeTab,
  });

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [termsAccount, setTermsAccount] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const {
    adminUserAccountSavingUid,
    confirmUserAccountStatusChange,
    confirmPendingMemberRejection,
    confirmMemberRetirement,
    confirmRetiredMemberPurge,
  } = useAdminMemberAccountStatusActions({
    isAdminAuthenticated,
    triggerConfirm,
    triggerToast,
    onStatusChanged: ({ uid, operation }) => {
      refreshAdminUserAccounts();
      if (operation === 'reject' || operation === 'retire' || operation === 'purge') {
        setSelectedAccount((current) => (current?.uid === uid ? null : current));
        setEditAccount((current) => (current?.uid === uid ? null : current));
        setTermsAccount((current) => (current?.uid === uid ? null : current));
      }
    },
  });

  const {
    adminMemberProfileSavingUid,
    saveAdminMemberAccountProfile,
  } = useAdminMemberAccountEditActions({
    isAdminAuthenticated,
    memberDirectoryPolicyEnabled,
    triggerToast,
  });

  const {
    adminMemberAccountCreating,
    createAdminMemberAccount,
  } = useAdminMemberAccountCreateActions({
    isAdminAuthenticated,
    memberDirectoryPolicyEnabled,
    triggerToast,
    onCreated: () => {
      setCreateDialogOpen(false);
      setSelectedAccount(null);
      setAdminUserAccountPage(1);
      refreshAdminUserAccounts();
    },
  });

  const changeMemberAccountTab = (nextTab) => {
    if (nextTab === activeTab) return;
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(MEMBER_ACCOUNT_TAB_KEY, nextTab);
    }
    setActiveTab(nextTab);
    setSelectedAccount(null);
    setEditAccount(null);
    setTermsAccount(null);
    setAdminUserAccountStatusFilter('all');
    setAdminUserAccountPage(1);
  };

  const saveEditAccount = async (form) => {
    if (!editAccount) return;
    try {
      const savedProfile = await saveAdminMemberAccountProfile({ account: editAccount, form });
      refreshAdminUserAccounts();
      if (savedProfile) {
        setSelectedAccount((current) =>
          current?.uid === editAccount.uid ? { ...current, ...savedProfile } : current
        );
      }
      setEditAccount(null);
    } catch {
      // 오류 메시지는 저장 훅에서 표시한다. 다이얼로그는 수정할 수 있도록 유지한다.
    }
  };

  const renderUseManagementActions = (account, isSaving, stopPropagation = false) => {
    const accountStatus = account.status || '';
    const action = (callback) => (event) => {
      if (stopPropagation) event?.stopPropagation?.();
      callback();
    };
    if (accountStatus === USER_PROFILE_STATUS.RETIRED) {
      return (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">탈퇴 완료</span>
          <Button variant="dangerOutline" className={compactActionButtonClass} disabled={isSaving} onClick={action(() => confirmRetiredMemberPurge(account))}>
            <XCircle size={11} /> 회원 완전 삭제
          </Button>
        </div>
      );
    }
    if (accountStatus === USER_PROFILE_STATUS.PENDING) {
      return (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Button variant="primary" className={compactActionButtonClass} disabled={isSaving} onClick={action(() => confirmUserAccountStatusChange(account, USER_PROFILE_STATUS.ACTIVE))}>
            <CheckCircle2 size={11} /> 가입 승인
          </Button>
          <Button variant="dangerOutline" className={compactActionButtonClass} disabled={isSaving} onClick={action(() => confirmPendingMemberRejection(account))}>
            <XCircle size={11} /> 가입 거절
          </Button>
        </div>
      );
    }
    if (accountStatus === USER_PROFILE_STATUS.BLOCKED) {
      return (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Button variant="primary" className={compactActionButtonClass} disabled={isSaving} onClick={action(() => confirmUserAccountStatusChange(account, USER_PROFILE_STATUS.ACTIVE))}>
            <CheckCircle2 size={11} /> 이용 재개
          </Button>
          <Button variant="outline" className={compactActionButtonClass} disabled={isSaving} onClick={action(() => confirmMemberRetirement(account))}>
            <LogOut size={11} /> 이용 종료
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button variant="dangerOutline" className={compactActionButtonClass} disabled={isSaving} onClick={action(() => confirmUserAccountStatusChange(account, USER_PROFILE_STATUS.BLOCKED))}>
          <XCircle size={11} /> 이용 차단
        </Button>
        <Button variant="outline" className={compactActionButtonClass} disabled={isSaving} onClick={action(() => confirmMemberRetirement(account))}>
          <LogOut size={11} /> 이용 종료
        </Button>
      </div>
    );
  };

  const renderMemberDetail = (account) => (
    <AdminMemberAccountDetailPanel
      account={account}
      onOpenTerms={() => setTermsAccount(account)}
      onEdit={() => setEditAccount(account)}
      onPurge={() => confirmRetiredMemberPurge(account)}
      purgeLoading={adminUserAccountSavingUid === account.uid}
    />
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="회원 계정 관리"
        description="가입 승인·거절, 이용 차단·재개·종료, 탈퇴 회원 완전 삭제를 계정 생명주기별로 관리합니다. 재가입 승인 시 기존 탈퇴 계정의 업무기록을 현재 계정으로 이관한 뒤 기존 계정을 자동 삭제합니다."
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex min-w-max gap-2">
          {MEMBER_ACCOUNT_TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => changeMemberAccountTab(key)}
              className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                activeTab === key
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}{key === 'retired' && adminUserAccountStatusCounts.retired > 0 ? ` ${adminUserAccountStatusCounts.retired}` : ''}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'retired' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <div className="font-bold">탈퇴 회원 관리 지침</div>
          <div className="mt-1">실제 퇴사 여부와 퇴사일은 시스템에서 수집·저장하거나 자동 판단하지 않습니다. 관리자가 별도로 확인하고, 내부 지침에 따라 퇴사일로부터 최대 1년 이내에 회원 완전 삭제를 수동으로 실행해 주세요. 자동 삭제 기능은 사용하지 않습니다.</div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" variant="primary" onClick={() => setCreateDialogOpen(true)}>
          회원 신규 등록
        </Button>
      </div>

      {activeTab === 'current' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['승인 대기', adminUserAccountStatusCounts.pending, 'border-amber-200 bg-amber-50 text-amber-700'],
            ['활성', adminUserAccountStatusCounts.active, 'border-emerald-200 bg-emerald-50 text-emerald-700'],
            ['정보 수정 필요', adminUserAccountStatusCounts.profileRequired, 'border-orange-200 bg-orange-50 text-orange-700'],
            ['차단', adminUserAccountStatusCounts.blocked, 'border-rose-200 bg-rose-50 text-rose-700'],
          ].map(([label, count, className]) => (
            <div key={label} className={`rounded-2xl border p-4 ${className}`}>
              <div className="text-xs font-semibold">{label}</div>
              <div className="mt-1 text-2xl font-bold">{count}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
          <div className="text-xs font-semibold">탈퇴 회원</div>
          <div className="mt-1 text-2xl font-bold">{adminUserAccountStatusCounts.retired}</div>
          <div className="mt-1 text-[11px] text-slate-500">이용 종료 후 회원정보와 과거 업무기록을 보존 중인 회원입니다. 필요 시 회원 완전 삭제로 관련 기록을 함께 삭제할 수 있습니다.</div>
        </div>
      )}

      {selectedAccount ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="shrink-0 px-4 py-2 text-xs"
              onClick={() => setSelectedAccount(null)}
            >
              목록으로
            </Button>
            <div className="min-w-0 text-right text-[11px] text-slate-500">
              회원 상세 · {selectedAccount.name || selectedAccount.email || selectedAccount.uid || '-'}
            </div>
          </div>
          {renderMemberDetail(selectedAccount)}
        </div>
      ) : (
        <>
          <div className={`grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:items-end ${activeTab === 'current' ? 'md:grid-cols-[minmax(0,1fr)_160px_140px]' : 'md:grid-cols-[minmax(0,1fr)_140px]'}`}>

            <label className="block min-w-0">
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

            {activeTab === 'current' ? (
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
                </select>
              </label>
            ) : null}

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
              {activeTab === 'retired' ? '탈퇴 회원이 없습니다.' : '검색 조건에 맞는 회원 계정이 없습니다.'}
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white xl:block">
                <table className="w-full table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-[50px]" />
                    <col className="w-[92px]" />
                    <col />
                    <col className="w-[130px]" />
                    <col className="w-[160px]" />
                    <col className="w-[215px]" />
                    <col className="w-[86px]" />
                  </colgroup>
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-2 py-2.5 text-center">번호</th>
                      <th className="border-b border-slate-200 px-2 py-2.5 text-center">활성여부</th>
                      <th className="border-b border-slate-200 px-3 py-2.5">이름</th>
                      <th className="border-b border-slate-200 px-3 py-2.5">부서</th>
                      <th className="border-b border-slate-200 px-3 py-2.5 text-center">가입일시</th>
                      <th className="border-b border-slate-200 px-2 py-2.5 text-center">이용 관리</th>
                      <th className="border-b border-slate-200 px-2 py-2.5 text-center">회원정보</th>
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
                          className="cursor-pointer border-b border-slate-100 align-middle hover:bg-slate-50"
                          onClick={() => setSelectedAccount(account)}
                        >
                          <td className="px-2 py-2.5 text-center text-[11px] font-semibold text-slate-400">{sequence}</td>
                          <td className="px-2 py-2.5 text-center">
                            <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getUserAccountStatusClassName(accountStatus)}`}>
                              {getUserAccountStatusLabel(accountStatus)}
                            </span>
                          </td>
                          <td className="truncate px-3 py-2.5 text-xs font-bold text-slate-900" title={account.name || '이름 미등록'}>
                            {account.name || '이름 미등록'}
                          </td>
                          <td className="truncate px-3 py-2.5 text-xs text-slate-600" title={account.team || '-'}>
                            {account.team || '-'}
                          </td>
                          <td className="px-3 py-2.5 text-center text-[11px] leading-4 text-slate-500">
                            {formatUserAccountCreatedAt(account)}
                          </td>
                          <td className="px-2 py-2.5">
                            {renderUseManagementActions(account, isSaving, true)}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <Button
                              type="button"
                              variant="outline"
                              className={compactActionButtonClass}
                              disabled={accountStatus === USER_PROFILE_STATUS.RETIRED}
                              title={accountStatus === USER_PROFILE_STATUS.RETIRED ? '탈퇴 회원은 조회만 할 수 있습니다.' : '회원정보 수정'}
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditAccount(account);
                              }}
                            >
                              회원 수정
                            </Button>
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
                      <button type="button" className="w-full text-left" onClick={() => setSelectedAccount(account)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{sequence}</span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-slate-900">{account.name || '이름 미등록'}</div>
                              <div className="mt-0.5 truncate text-[11px] text-slate-500">{account.team || '-'}</div>
                            </div>
                          </div>
                          <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getUserAccountStatusClassName(accountStatus)}`}>
                            {getUserAccountStatusLabel(accountStatus)}
                          </span>
                        </div>
                        <div className="mt-3 text-[11px] text-slate-500">가입일시 {formatUserAccountCreatedAt(account)}</div>
                      </button>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                        {renderUseManagementActions(account, isSaving)}
                        <Button
                          type="button"
                          variant="outline"
                          className={compactActionButtonClass}
                          disabled={accountStatus === USER_PROFILE_STATUS.RETIRED}
                          onClick={() => setEditAccount(account)}
                        >
                          회원 수정
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {adminUserAccountsReady && !adminUserAccountsLoadErrorMessage ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[11px] text-slate-500">
                검색 결과 {adminUserAccountResultCount}건 · {safeAdminUserAccountPage} / {adminUserAccountTotalPages}페이지
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
        </>
      )}

      <AdminMemberAccountCreateDialog
        open={createDialogOpen}
        memberDirectoryTeams={memberDirectoryTeams}
        memberDirectoryBorrowers={memberDirectoryBorrowers}
        memberDirectoryPolicyEnabled={memberDirectoryPolicyEnabled}
        Button={Button}
        saving={adminMemberAccountCreating}
        onClose={() => setCreateDialogOpen(false)}
        onSave={createAdminMemberAccount}
      />

      {editAccount ? (
        <AdminMemberAccountEditDialog
          account={editAccount}
          memberDirectoryTeams={memberDirectoryTeams}
          memberDirectoryBorrowers={memberDirectoryBorrowers}
          memberDirectoryPolicyEnabled={memberDirectoryPolicyEnabled}
          Button={Button}
          saving={adminMemberProfileSavingUid === editAccount.uid}
          onClose={() => setEditAccount(null)}
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
