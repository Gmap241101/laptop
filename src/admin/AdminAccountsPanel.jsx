import { useMemo, useState } from 'react';
import AdminAccountCreateDialog from './AdminAccountCreateDialog.jsx';
import AdminAccountEditDialog from './AdminAccountEditDialog.jsx';
import AdminManagedPasswordDialog from './AdminManagedPasswordDialog.jsx';

const compactActionButtonClass = '!gap-1 !rounded-lg !px-2 !py-1 !text-[10px]';
const ADMIN_ACCOUNT_PAGE_SIZE_OPTIONS = [10, 30, 50];

const formatAdminCreatedAt = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
};

export default function AdminAccountsPanel({ ctx }) {
  const {
    AdminPageHeader,
    ADMIN_ACCOUNT_PAGE_SIZE,
    ADMIN_CUSTOM_OPTION_VALUE,
    Button,
    Input,
    Search,
    Select,
    adminAccountEditForm,
    adminAccountForm,
    authenticatedAdminAccount,
    authenticatedAdminId,
    cancelEditAdminAccount,
    changeAdminAccountPassword,
    data,
    deleteAdminAccount,
    editingAdminAccountId,
    registerAdminAccount,
    registeredAdminAccounts,
    safeAdminAccountPage,
    saveAdminAccountEdit,
    setAdminAccountEditForm,
    setAdminAccountForm,
    setAdminAccountPage,
    startEditAdminAccount,
    toggleAdminAccountLock,
  } = ctx;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [passwordAccount, setPasswordAccount] = useState(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [adminAccountQuery, setAdminAccountQuery] = useState('');
  const [adminAccountRoleFilter, setAdminAccountRoleFilter] = useState('all');
  const [adminAccountPageSize, setAdminAccountPageSize] = useState(ADMIN_ACCOUNT_PAGE_SIZE);
  const normalizedQuery = adminAccountQuery.trim().toLowerCase();
  const filteredAdminAccounts = useMemo(() => (registeredAdminAccounts || []).filter((account) => {
    const role = account.adminRole === 'owner' ? 'owner' : 'admin';
    if (adminAccountRoleFilter !== 'all' && role !== adminAccountRoleFilter) return false;
    if (!normalizedQuery) return true;
    return [
      account.adminLoginId,
      account.organizationName,
      account.userName,
      account.authEmail || account.email,
      account.phone,
      role === 'owner' ? '최고 관리자' : '일반 관리자',
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
  }), [adminAccountRoleFilter, normalizedQuery, registeredAdminAccounts]);

  const adminAccountTotalPages = Math.max(1, Math.ceil(filteredAdminAccounts.length / adminAccountPageSize));
  const displayAdminAccountPage = Math.min(safeAdminAccountPage, adminAccountTotalPages);
  const paginatedAdminAccounts = filteredAdminAccounts.slice(
    (displayAdminAccountPage - 1) * adminAccountPageSize,
    displayAdminAccountPage * adminAccountPageSize
  );
  const editingAccount = (registeredAdminAccounts || []).find((account) => account.id === editingAdminAccountId) || null;
  const ownerCount = (registeredAdminAccounts || []).filter((account) => (account.adminRole || 'admin') === 'owner').length;
  const adminCount = (registeredAdminAccounts || []).filter((account) => (account.adminRole || 'admin') !== 'owner').length;
  const lockedCount = (registeredAdminAccounts || []).filter((account) => Number(account.lockUntil || 0) > Date.now()).length;

  const handleRegister = async () => {
    const account = await registerAdminAccount();
    if (account) setCreateDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="관리자 계정 관리"
        description="관리자 로그인 계정, 권한, 잠금 상태와 관리자 정보를 목록에서 관리합니다."
      />


      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
          <div className="text-xs font-semibold">전체 관리자</div>
          <div className="mt-1 text-2xl font-bold">{(registeredAdminAccounts || []).length}</div>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-700">
          <div className="text-xs font-semibold">최고 관리자</div>
          <div className="mt-1 text-2xl font-bold">{ownerCount}</div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-700">
          <div className="text-xs font-semibold">일반 관리자</div>
          <div className="mt-1 text-2xl font-bold">{adminCount}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <div className="text-xs font-semibold">잠금 계정</div>
          <div className="mt-1 text-2xl font-bold">{lockedCount}</div>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_160px_140px] md:items-end">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">관리자 검색</span>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={adminAccountQuery}
              onChange={(event) => {
                setAdminAccountQuery(event.target.value);
                setAdminAccountPage(1);
              }}
              placeholder="관리자 ID, 사용자명, 조직명, 이메일, 전화번호"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none mk-form-border-focus"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">권한</span>
          <select
            value={adminAccountRoleFilter}
            onChange={(event) => {
              setAdminAccountRoleFilter(event.target.value);
              setAdminAccountPage(1);
            }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
          >
            <option value="all">전체</option>
            <option value="owner">최고 관리자</option>
            <option value="admin">일반 관리자</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600">페이지당 표시</span>
          <select
            value={adminAccountPageSize}
            onChange={(event) => {
              setAdminAccountPageSize(Number(event.target.value));
              setAdminAccountPage(1);
            }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
          >
            {ADMIN_ACCOUNT_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}개</option>
            ))}
          </select>
        </label>
      </div>

      {filteredAdminAccounts.length === 0 ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
            {normalizedQuery ? '검색 조건에 맞는 관리자 계정이 없습니다.' : '등록된 관리자 계정이 없습니다.'}
          </div>
          <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="text-[11px] text-slate-500 sm:justify-self-start">검색 결과 0건 · 1 / 1페이지</div>
            <div className="flex items-center justify-center gap-2 sm:justify-self-center">
              <Button variant="outline" disabled className="px-3 py-2 text-xs">이전</Button>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">1 / 1</div>
              <Button variant="outline" disabled className="px-3 py-2 text-xs">다음</Button>
            </div>
            <div className="flex sm:justify-self-end"><Button type="button" variant="primary" onClick={() => setCreateDialogOpen(true)}>관리자 계정 신규 등록</Button></div>
          </div>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white xl:block">
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[8%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[11%]" />
                <col className="w-[16%]" />
                <col className="w-[17%]" />
              </colgroup>
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">번호</th>
                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">상태</th>
                  <th className="border-b border-slate-200 px-3 py-2.5">관리자 ID</th>
                  <th className="border-b border-slate-200 px-3 py-2.5">사용자명</th>
                  <th className="border-b border-slate-200 px-3 py-2.5">조직명</th>
                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">권한</th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-center">등록일시</th>
                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">계정 관리</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAdminAccounts.map((account, index) => {
                  const isCurrent = account.id === authenticatedAdminId;
                  const locked = Number(account.lockUntil || 0) > Date.now();
                  const sequence = (displayAdminAccountPage - 1) * adminAccountPageSize + index + 1;
                  return (
                    <tr key={account.id} className="border-b border-slate-100 align-middle hover:bg-slate-50">
                      <td className="px-2 py-2.5 text-center text-[11px] font-semibold text-slate-400">{sequence}</td>
                      <td className="px-2 py-2.5 text-center">
                        <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${locked ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                          {locked ? '잠금' : '활성'}
                        </span>
                      </td>
                      <td className="truncate px-3 py-2.5 text-xs font-bold text-slate-900" title={account.adminLoginId}>{account.adminLoginId || '-'}</td>
                      <td className="truncate px-3 py-2.5 text-xs text-slate-700" title={account.userName}>{account.userName || '-'}</td>
                      <td className="truncate px-3 py-2.5 text-xs text-slate-600" title={account.organizationName}>{account.organizationName || '-'}</td>
                      <td className="px-2 py-2.5 text-center">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${(account.adminRole || 'admin') === 'owner' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                          {(account.adminRole || 'admin') === 'owner' ? '최고 관리자' : '일반 관리자'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-[11px] leading-4 text-slate-500">{formatAdminCreatedAt(account.createdAt)}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {(authenticatedAdminAccount?.adminRole || 'owner') === 'owner' && !isCurrent ? (
                            <Button type="button" variant="outline" className={compactActionButtonClass} onClick={() => toggleAdminAccountLock(account)}>
                              {locked ? '잠금 해제' : '계정 잠금'}
                            </Button>
                          ) : null}
                          <Button type="button" variant="outline" className={compactActionButtonClass} onClick={() => startEditAdminAccount(account)}>수정</Button>
                          <Button
                            type="button"
                            variant="dangerOutline"
                            className={compactActionButtonClass}
                            disabled={isCurrent || (registeredAdminAccounts || []).length <= 1}
                            onClick={() => deleteAdminAccount(account)}
                          >
                            삭제
                          </Button>
                          {isCurrent ? <span className="text-[10px] font-semibold text-orange-600">현재 로그인</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 xl:hidden">
            {paginatedAdminAccounts.map((account, index) => {
              const isCurrent = account.id === authenticatedAdminId;
              const locked = Number(account.lockUntil || 0) > Date.now();
              const sequence = (displayAdminAccountPage - 1) * adminAccountPageSize + index + 1;
              return (
                <div key={account.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">#{sequence}</span>
                    <span className="text-sm font-bold text-slate-900">{account.adminLoginId || '-'}</span>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${locked ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{locked ? '잠금' : '활성'}</span>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${(account.adminRole || 'admin') === 'owner' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{(account.adminRole || 'admin') === 'owner' ? '최고 관리자' : '일반 관리자'}</span>
                    {isCurrent ? <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-600">현재 로그인</span> : null}
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                    <div>사용자명: <span className="font-semibold text-slate-800">{account.userName || '-'}</span></div>
                    <div>조직명: <span className="font-semibold text-slate-800">{account.organizationName || '-'}</span></div>
                    <div>권한: <span className="font-semibold text-slate-800">{(account.adminRole || 'admin') === 'owner' ? '최고 관리자' : '일반 관리자'}</span></div>
                    <div className="text-[11px] text-slate-400">등록일시: {formatAdminCreatedAt(account.createdAt)}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                    {(authenticatedAdminAccount?.adminRole || 'owner') === 'owner' && !isCurrent ? (
                      <Button type="button" variant="outline" className="px-3 py-2 text-xs" onClick={() => toggleAdminAccountLock(account)}>{locked ? '잠금 해제' : '계정 잠금'}</Button>
                    ) : null}
                    <Button type="button" variant="outline" className="px-3 py-2 text-xs" onClick={() => startEditAdminAccount(account)}>수정</Button>
                    <Button type="button" variant="dangerOutline" className="px-3 py-2 text-xs" disabled={isCurrent || (registeredAdminAccounts || []).length <= 1} onClick={() => deleteAdminAccount(account)}>삭제</Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="text-[11px] text-slate-500 sm:justify-self-start">
              검색 결과 {filteredAdminAccounts.length}건 · {displayAdminAccountPage} / {adminAccountTotalPages}페이지
            </div>
            <div className="flex items-center justify-center gap-2 sm:justify-self-center">
              <Button variant="outline" disabled={displayAdminAccountPage <= 1} onClick={() => setAdminAccountPage((prev) => Math.max(1, prev - 1))} className="px-3 py-2 text-xs">이전</Button>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">{displayAdminAccountPage} / {adminAccountTotalPages}</div>
              <Button variant="outline" disabled={displayAdminAccountPage >= adminAccountTotalPages} onClick={() => setAdminAccountPage((prev) => Math.min(adminAccountTotalPages, prev + 1))} className="px-3 py-2 text-xs">다음</Button>
            </div>
            <div className="flex sm:justify-self-end">
              <Button type="button" variant="primary" onClick={() => setCreateDialogOpen(true)}>관리자 계정 신규 등록</Button>
            </div>
          </div>
        </>
      )}

      <AdminAccountCreateDialog
        open={createDialogOpen}
        Button={Button}
        Input={Input}
        Select={Select}
        data={data}
        form={adminAccountForm}
        setForm={setAdminAccountForm}
        ADMIN_CUSTOM_OPTION_VALUE={ADMIN_CUSTOM_OPTION_VALUE}
        authenticatedAdminAccount={authenticatedAdminAccount}
        onClose={() => setCreateDialogOpen(false)}
        onSave={handleRegister}
      />

      <AdminAccountEditDialog
        account={editingAccount}
        Button={Button}
        Input={Input}
        Select={Select}
        form={adminAccountEditForm}
        setForm={setAdminAccountEditForm}
        authenticatedAdminAccount={authenticatedAdminAccount}
        onClose={cancelEditAdminAccount}
        onSave={saveAdminAccountEdit}
        onPasswordChange={(account) => setPasswordAccount(account)}
      />

      <AdminManagedPasswordDialog
        account={passwordAccount}
        accountType="admin"
        Button={Button}
        open={Boolean(passwordAccount)}
        saving={passwordSaving}
        onClose={() => { if (!passwordSaving) setPasswordAccount(null); }}
        onSave={async ({ password, passwordConfirm }) => {
          if (!passwordAccount) return;
          setPasswordSaving(true);
          try {
            const changed = await changeAdminAccountPassword(passwordAccount, password, passwordConfirm);
            if (changed) setPasswordAccount(null);
          } finally {
            setPasswordSaving(false);
          }
        }}
      />
    </div>
  );
}
