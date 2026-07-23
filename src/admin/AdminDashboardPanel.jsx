import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;

const getTimestampMillis = (value) => {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'number') return value;

  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getDateDiffDays = (fromDate, toDate) => {
  if (!fromDate || !toDate) return 0;

  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);

  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / DAY_MS));
};

const getWaitingDays = (value, nowMillis) => {
  const createdMillis = getTimestampMillis(value);
  if (!createdMillis) return 0;
  return Math.max(0, Math.floor((nowMillis - createdMillis) / DAY_MS));
};

const getRequesterName = (request = {}) =>
  request.requesterName ||
  request.borrower ||
  request.requesterEmail ||
  '신청자 미지정';

const getRequesterTeam = (request = {}) =>
  request.requesterTeam || request.team || '-';

const getRequestIdentity = (request = {}) =>
  request.requesterUid ||
  request.requesterEmail ||
  `${getRequesterName(request)}|${getRequesterTeam(request)}`;

const getUserActionLabel = (type, USER_REQUEST_ACTION) => {
  if (type === USER_REQUEST_ACTION.CHANGE) return '정보 변경';
  if (type === USER_REQUEST_ACTION.CANCEL) return '신청 취소';
  if (type === USER_REQUEST_ACTION.EXTEND) return '대여 연장';
  if (type === USER_REQUEST_ACTION.RETURN) return '반납 요청';
  return '사용자 요청';
};

const getRequestTab = (request, ADMIN_REQUEST_TAB, STATUS) => {
  if ([STATUS.REQUESTED, STATUS.ON_HOLD].includes(request.status)) {
    return ADMIN_REQUEST_TAB.PENDING;
  }

  if (request.status === STATUS.APPROVED) {
    return ADMIN_REQUEST_TAB.RENTAL;
  }

  if ([STATUS.DENIED, STATUS.USER_CANCELLED].includes(request.status)) {
    return ADMIN_REQUEST_TAB.CLOSED;
  }

  return ADMIN_REQUEST_TAB.RETURNED;
};

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'slate',
  onClick,
  disabled = false,
}) {
  const toneMap = {
    rose: {
      border: 'border-rose-200',
      background: 'bg-rose-50/80',
      icon: 'bg-rose-100 text-rose-700',
      value: 'text-rose-800',
    },
    amber: {
      border: 'border-amber-200',
      background: 'bg-amber-50/80',
      icon: 'bg-amber-100 text-amber-700',
      value: 'text-amber-800',
    },
    blue: {
      border: 'border-blue-200',
      background: 'bg-blue-50/80',
      icon: 'bg-blue-100 text-blue-700',
      value: 'text-blue-800',
    },
    violet: {
      border: 'border-violet-200',
      background: 'bg-violet-50/80',
      icon: 'bg-violet-100 text-violet-700',
      value: 'text-violet-800',
    },
    emerald: {
      border: 'border-emerald-200',
      background: 'bg-emerald-50/80',
      icon: 'bg-emerald-100 text-emerald-700',
      value: 'text-emerald-800',
    },
    slate: {
      border: 'border-slate-200',
      background: 'bg-white',
      icon: 'bg-slate-100 text-slate-600',
      value: 'text-slate-900',
    },
  };

  const colors = toneMap[tone] || toneMap.slate;
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`group w-full rounded-2xl border p-4 text-left shadow-sm transition ${colors.border} ${colors.background} ${
        onClick && !disabled
          ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-200'
          : ''
      } ${disabled ? 'cursor-default opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
          <Icon size={20} strokeWidth={2.1} aria-hidden="true" />
        </span>
        {onClick && !disabled ? (
          <ArrowRight
            size={16}
            className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className="mt-4 text-xs font-bold text-slate-600">{label}</div>
      <div className={`mt-1 text-2xl font-black tracking-tight ${colors.value}`}>{value}</div>
      <div className="mt-1 min-h-[2.25rem] text-[11px] leading-[1.125rem] text-slate-500">
        {detail}
      </div>
    </Component>
  );
}

function StatusCard({ icon: Icon, label, value, tone }) {
  const toneMap = {
    slate: 'border-slate-200 bg-white text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
  };

  return (
    <div className={`rounded-2xl border p-3.5 shadow-sm ${toneMap[tone] || toneMap.slate}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} aria-hidden="true" />
        <span className="text-[11px] font-bold">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

export default function AdminDashboardPanel({ ctx }) {
  const {
    ADMIN_REQUEST_QUICK_FILTER,
    ADMIN_REQUEST_TAB,
    AdminPageHeader,
    STATUS,
    USER_PROFILE_STATUS,
    USER_REQUEST_ACTION,
    USER_REQUEST_REVIEW_STATUS,
    adminUserAccountsLoadErrorMessage,
    adminUserAccountsReady,
    data,
    defaultRentalStartDate,
    formatDateWithKoreanWeekday,
    getMaxRentalDueDate,
    getSafeMaxRentalDays,
    managedUserAccounts,
    mergedRentalRequests,
    orphanedRentalAvailabilityRequests,
    rentalRequestsLoadErrorMessage,
    rentalRequestsReady,
    rentalStartAdjustmentInfo,
    setAdminRequestPage,
    setAdminRequestQuery,
    setAdminRequestQuickFilter,
    setAdminRequestTab,
    setAdminTab,
    setAdminUserAccountQuery,
    setAdminUserAccountStatusFilter,
    setSelectedAdminRequestId,
    today,
  } = ctx;

  const [nowMillis, setNowMillis] = useState(() => Date.now());
  const [workTab, setWorkTab] = useState('overdue');

  useEffect(() => {
    const timer = window.setInterval(() => setNowMillis(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const todayDate = today();
  const settings = data.settings || {};
  const requests = mergedRentalRequests || [];
  const laptops = data.laptops || [];
  const accounts = managedUserAccounts || [];

  const dashboardData = useMemo(() => {
    const approvedRequests = requests.filter(
      (request) => request.status === STATUS.APPROVED
    );

    const overdueRequests = approvedRequests
      .filter(
        (request) =>
          (!request.startDate || request.startDate <= todayDate) &&
          Boolean(request.dueDate) &&
          request.dueDate < todayDate
      )
      .sort((first, second) =>
        String(first.dueDate || '').localeCompare(String(second.dueDate || ''))
      );

    const dueTodayRequests = approvedRequests
      .filter(
        (request) =>
          (!request.startDate || request.startDate <= todayDate) &&
          request.dueDate === todayDate
      )
      .sort((first, second) =>
        String(first.assetNo || '').localeCompare(String(second.assetNo || ''))
      );

    const startTodayRequests = approvedRequests
      .filter((request) => request.startDate === todayDate)
      .sort((first, second) =>
        String(first.assetNo || '').localeCompare(String(second.assetNo || ''))
      );

    const reservedRequests = approvedRequests.filter(
      (request) => Boolean(request.startDate) && request.startDate > todayDate
    );

    const activeRentalRequests = approvedRequests.filter(
      (request) => !request.startDate || request.startDate <= todayDate
    );

    const requestedRequests = requests.filter(
      (request) => request.status === STATUS.REQUESTED
    );

    const onHoldRequests = requests.filter(
      (request) => request.status === STATUS.ON_HOLD
    );

    const pendingUserActions = requests
      .filter(
        (request) =>
          request.userActionRequest?.status ===
          USER_REQUEST_REVIEW_STATUS.PENDING
      )
      .sort((first, second) => {
        const firstTime = getTimestampMillis(
          first.userActionRequest?.requestedAt || first.updatedAt
        );
        const secondTime = getTimestampMillis(
          second.userActionRequest?.requestedAt || second.updatedAt
        );
        return firstTime - secondTime;
      });

    const pendingAccounts = accounts
      .filter((account) => account.status === USER_PROFILE_STATUS.PENDING)
      .sort(
        (first, second) =>
          getTimestampMillis(first.createdAt || first.updatedAt) -
          getTimestampMillis(second.createdAt || second.updatedAt)
      );

    const blockedLaptopIds = new Set(
      requests
        .filter((request) =>
          [STATUS.REQUESTED, STATUS.APPROVED, STATUS.ON_HOLD].includes(
            request.status
          )
        )
        .map((request) => request.laptopId)
        .filter(Boolean)
    );

    const unavailableLaptopIds = new Set(
      laptops
        .filter((laptop) => laptop.status === STATUS.UNAVAILABLE)
        .map((laptop) => laptop.id)
    );

    const availableCount = laptops.filter(
      (laptop) =>
        !unavailableLaptopIds.has(laptop.id) && !blockedLaptopIds.has(laptop.id)
    ).length;

    const uniqueReservedAssets = new Set(
      reservedRequests.map((request) => request.laptopId).filter(Boolean)
    ).size;

    const uniqueActiveAssets = new Set(
      activeRentalRequests.map((request) => request.laptopId).filter(Boolean)
    ).size;

    const uniqueOverdueAssets = new Set(
      overdueRequests.map((request) => request.laptopId || request.assetNo).filter(Boolean)
    ).size;

    const uniqueOverdueUsers = new Set(
      overdueRequests.map((request) => getRequestIdentity(request))
    ).size;

    const longestOverdueDays = overdueRequests.reduce(
      (maximum, request) =>
        Math.max(maximum, getDateDiffDays(request.dueDate, todayDate)),
      0
    );

    const oldestRequestedDays = requestedRequests.reduce(
      (maximum, request) =>
        Math.max(
          maximum,
          getWaitingDays(request.createdAt || request.requestedAt, nowMillis)
        ),
      0
    );

    const oldestPendingMemberDays = pendingAccounts.reduce(
      (maximum, account) =>
        Math.max(
          maximum,
          getWaitingDays(account.createdAt || account.updatedAt, nowMillis)
        ),
      0
    );

    const assetIdSet = new Set(laptops.map((laptop) => laptop.id).filter(Boolean));
    const missingDateRequests = approvedRequests.filter(
      (request) => !request.startDate || !request.dueDate
    );
    const invalidPeriodRequests = requests.filter(
      (request) =>
        request.startDate && request.dueDate && request.dueDate < request.startDate
    );
    const missingAssetRequests = requests.filter(
      (request) => request.laptopId && !assetIdSet.has(request.laptopId)
    );
    const missingRequesterRequests = requests.filter(
      (request) =>
        !request.requesterUid &&
        !request.requesterEmail &&
        !request.requesterName &&
        !request.borrower
    );

    const nextWeekEndDate = new Date(`${todayDate}T00:00:00Z`);
    nextWeekEndDate.setUTCDate(nextWeekEndDate.getUTCDate() + 7);
    const nextWeekEnd = nextWeekEndDate.toISOString().slice(0, 10);
    const upcomingReturns = approvedRequests.filter(
      (request) =>
        request.dueDate && request.dueDate > todayDate && request.dueDate <= nextWeekEnd
    );

    return {
      overdueRequests,
      dueTodayRequests,
      startTodayRequests,
      reservedRequests,
      activeRentalRequests,
      requestedRequests,
      onHoldRequests,
      pendingUserActions,
      pendingAccounts,
      availableCount,
      uniqueReservedAssets,
      uniqueActiveAssets,
      uniqueOverdueAssets,
      uniqueOverdueUsers,
      longestOverdueDays,
      oldestRequestedDays,
      oldestPendingMemberDays,
      unavailableCount: unavailableLaptopIds.size,
      missingDateRequests,
      invalidPeriodRequests,
      missingAssetRequests,
      missingRequesterRequests,
      upcomingReturns,
    };
  }, [
    STATUS,
    USER_PROFILE_STATUS,
    USER_REQUEST_REVIEW_STATUS,
    accounts,
    laptops,
    nowMillis,
    requests,
    todayDate,
  ]);

  const workTabs = useMemo(
    () => [
      {
        id: 'overdue',
        label: '연체',
        count: dashboardData.overdueRequests.length,
        items: dashboardData.overdueRequests,
        quickFilter: ADMIN_REQUEST_QUICK_FILTER.OVERDUE,
        requestTab: ADMIN_REQUEST_TAB.RENTAL,
      },
      {
        id: 'dueToday',
        label: '오늘 반납',
        count: dashboardData.dueTodayRequests.length,
        items: dashboardData.dueTodayRequests,
        quickFilter: ADMIN_REQUEST_QUICK_FILTER.DUE_TODAY,
        requestTab: ADMIN_REQUEST_TAB.RENTAL,
      },
      {
        id: 'startToday',
        label: '오늘 시작',
        count: dashboardData.startTodayRequests.length,
        items: dashboardData.startTodayRequests,
        quickFilter: ADMIN_REQUEST_QUICK_FILTER.START_TODAY,
        requestTab: ADMIN_REQUEST_TAB.RENTAL,
      },
      {
        id: 'userActions',
        label: '사용자 요청',
        count: dashboardData.pendingUserActions.length,
        items: dashboardData.pendingUserActions,
        quickFilter: ADMIN_REQUEST_QUICK_FILTER.PENDING_USER_ACTION,
        requestTab: ADMIN_REQUEST_TAB.RENTAL,
      },
    ],
    [ADMIN_REQUEST_QUICK_FILTER, ADMIN_REQUEST_TAB, dashboardData]
  );

  useEffect(() => {
    const selected = workTabs.find((tab) => tab.id === workTab);
    if (selected?.count > 0) return;

    const nextTab = workTabs.find((tab) => tab.count > 0);
    if (nextTab) setWorkTab(nextTab.id);
  }, [workTab, workTabs]);

  const activeWorkTab =
    workTabs.find((tab) => tab.id === workTab) || workTabs[0];

  const defaultStartDate = defaultRentalStartDate(settings);
  const defaultDueDate = getMaxRentalDueDate(defaultStartDate, settings);
  const maxRentalDays = getSafeMaxRentalDays(settings);

  const currentTimeLabel = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(nowMillis));

  const openRequestList = (requestTab, quickFilter) => {
    setAdminRequestTab(requestTab);
    setAdminRequestQuickFilter(quickFilter);
    setAdminRequestQuery('');
    setAdminRequestPage(1);
    setSelectedAdminRequestId('');
    setAdminTab('requests');
  };

  const openRequestDetail = (request) => {
    setAdminRequestTab(getRequestTab(request, ADMIN_REQUEST_TAB, STATUS));
    setAdminRequestQuickFilter(ADMIN_REQUEST_QUICK_FILTER.ALL);
    setAdminRequestQuery('');
    setAdminRequestPage(1);
    setSelectedAdminRequestId(request.id);
    setAdminTab('requests');
  };

  const openPendingMembers = () => {
    setAdminUserAccountQuery('');
    setAdminUserAccountStatusFilter(USER_PROFILE_STATUS.PENDING);
    setAdminTab('memberAccounts');
  };

  const dataIssues = [
    {
      label: '정식 신청 문서 없이 남은 예약 요약',
      count: orphanedRentalAvailabilityRequests.length,
    },
    {
      label: '대여기간이 누락된 진행 건',
      count: dashboardData.missingDateRequests.length,
    },
    {
      label: '시작일보다 반납일이 빠른 신청',
      count: dashboardData.invalidPeriodRequests.length,
    },
    {
      label: '등록되지 않은 자산을 참조하는 신청',
      count: dashboardData.missingAssetRequests.length,
    },
    {
      label: '신청자 정보가 누락된 신청',
      count: dashboardData.missingRequesterRequests.length,
    },
  ];

  const totalIssueCount =
    dataIssues.reduce((sum, issue) => sum + issue.count, 0) +
    (rentalRequestsLoadErrorMessage ? 1 : 0) +
    (adminUserAccountsLoadErrorMessage ? 1 : 0);

  const requestLoading = !rentalRequestsReady;
  const accountLoading = !adminUserAccountsReady;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="관리자 대시보드"
        description="오늘 처리해야 할 대여·반납·회원 업무와 전체 자산 운영 상태를 한 화면에서 확인합니다."
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-200">
            <Clock3 size={13} aria-hidden="true" />
            {currentTimeLabel} 기준
          </span>
        }
      />

      {rentalRequestsLoadErrorMessage || adminUserAccountsLoadErrorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-800">
          <div className="flex items-start gap-2">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="font-bold">일부 대시보드 데이터를 불러오지 못했습니다.</div>
              {rentalRequestsLoadErrorMessage ? (
                <div className="mt-1">대여신청: {rentalRequestsLoadErrorMessage}</div>
              ) : null}
              {adminUserAccountsLoadErrorMessage ? (
                <div className="mt-1">회원계정: {adminUserAccountsLoadErrorMessage}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="dashboard-priority-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 id="dashboard-priority-heading" className="text-sm font-black text-slate-900">
              우선 처리 업무
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              숫자를 선택하면 해당 조건이 적용된 관리 화면으로 이동합니다.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={ShieldAlert}
            label="연체자 현황"
            value={
              requestLoading
                ? '—'
                : `${dashboardData.uniqueOverdueUsers}명 · ${dashboardData.uniqueOverdueAssets}대`
            }
            detail={
              requestLoading
                ? '대여신청을 불러오는 중입니다.'
                : dashboardData.overdueRequests.length
                  ? `최장 ${dashboardData.longestOverdueDays}일 연체 · 총 ${dashboardData.overdueRequests.length}건`
                  : '현재 연체 중인 기기가 없습니다.'
            }
            tone={dashboardData.overdueRequests.length ? 'rose' : 'emerald'}
            disabled={requestLoading}
            onClick={() =>
              openRequestList(
                ADMIN_REQUEST_TAB.RENTAL,
                ADMIN_REQUEST_QUICK_FILTER.OVERDUE
              )
            }
          />

          <MetricCard
            icon={CalendarCheck2}
            label="오늘 반납 예정"
            value={requestLoading ? '—' : `${dashboardData.dueTodayRequests.length}대`}
            detail={
              requestLoading
                ? '대여신청을 불러오는 중입니다.'
                : dashboardData.dueTodayRequests.length
                  ? `반납 요청 ${dashboardData.dueTodayRequests.filter(
                      (request) =>
                        request.userActionRequest?.type === USER_REQUEST_ACTION.RETURN &&
                        request.userActionRequest?.status ===
                          USER_REQUEST_REVIEW_STATUS.PENDING
                    ).length}건`
                  : '오늘 반납 예정인 기기가 없습니다.'
            }
            tone={dashboardData.dueTodayRequests.length ? 'amber' : 'slate'}
            disabled={requestLoading}
            onClick={() =>
              openRequestList(
                ADMIN_REQUEST_TAB.RENTAL,
                ADMIN_REQUEST_QUICK_FILTER.DUE_TODAY
              )
            }
          />

          <MetricCard
            icon={ClipboardCheck}
            label="대여 승인 대기"
            value={requestLoading ? '—' : `${dashboardData.requestedRequests.length}건`}
            detail={
              requestLoading
                ? '대여신청을 불러오는 중입니다.'
                : `최장 대기 ${dashboardData.oldestRequestedDays}일 · 보류 ${dashboardData.onHoldRequests.length}건`
            }
            tone={dashboardData.requestedRequests.length ? 'blue' : 'slate'}
            disabled={requestLoading}
            onClick={() =>
              openRequestList(
                ADMIN_REQUEST_TAB.PENDING,
                ADMIN_REQUEST_QUICK_FILTER.REQUESTED
              )
            }
          />

          <MetricCard
            icon={UserPlus}
            label="회원가입 승인 대기"
            value={accountLoading ? '—' : `${dashboardData.pendingAccounts.length}명`}
            detail={
              accountLoading
                ? '회원 계정을 불러오는 중입니다.'
                : dashboardData.pendingAccounts.length
                  ? `최장 대기 ${dashboardData.oldestPendingMemberDays}일`
                  : '승인 대기 중인 회원이 없습니다.'
            }
            tone={dashboardData.pendingAccounts.length ? 'violet' : 'slate'}
            disabled={accountLoading}
            onClick={openPendingMembers}
          />
        </div>
      </section>

      <section aria-labelledby="dashboard-assets-heading">
        <div className="mb-3">
          <h3 id="dashboard-assets-heading" className="text-sm font-black text-slate-900">
            자산 운영 현황
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            신청중·보류·예약·대여중인 자산은 현재 신청 가능 수에서 제외합니다.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatusCard icon={Boxes} label="전체 자산" value={laptops.length} tone="slate" />
          <StatusCard
            icon={PackageCheck}
            label="대여 가능"
            value={dashboardData.availableCount}
            tone="emerald"
          />
          <StatusCard
            icon={CalendarClock}
            label="예약중"
            value={dashboardData.uniqueReservedAssets}
            tone="sky"
          />
          <StatusCard
            icon={PackageOpen}
            label="대여중"
            value={dashboardData.uniqueActiveAssets}
            tone="blue"
          />
          <StatusCard
            icon={Wrench}
            label="대여불가"
            value={dashboardData.unavailableCount}
            tone="rose"
          />
          <StatusCard
            icon={RotateCcw}
            label="오늘 대여 시작"
            value={dashboardData.startTodayRequests.length}
            tone="orange"
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">오늘의 업무</h3>
                <p className="mt-1 text-[11px] text-slate-500">
                  항목을 선택하면 해당 신청 상세 화면으로 이동합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {workTabs.map((tab) => {
                  const isActive = activeWorkTab.id === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWorkTab(tab.id)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                          isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {!rentalRequestsReady ? (
            <div className="py-16 text-center text-xs text-slate-400">
              오늘의 업무를 불러오는 중입니다.
            </div>
          ) : activeWorkTab.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={24} aria-hidden="true" />
              </span>
              <div className="mt-3 text-sm font-bold text-slate-800">
                {activeWorkTab.label} 업무가 없습니다.
              </div>
              <div className="mt-1 text-xs text-slate-400">
                현재 기준으로 추가 확인이 필요한 항목이 없습니다.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeWorkTab.items.slice(0, 8).map((request) => {
                const isOverdue = activeWorkTab.id === 'overdue';
                const actionType = request.userActionRequest?.type;
                return (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => openRequestDetail(request)}
                    className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50"
                  >
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isOverdue
                          ? 'bg-rose-50 text-rose-600'
                          : activeWorkTab.id === 'userActions'
                            ? 'bg-violet-50 text-violet-600'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {activeWorkTab.id === 'userActions' ? (
                        <UserCheck size={18} aria-hidden="true" />
                      ) : (
                        <PackageOpen size={18} aria-hidden="true" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-xs font-black text-slate-900">
                          {request.assetNo || '자산번호 미지정'}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          {request.assetCategory || '기기'}
                        </span>
                        {activeWorkTab.id === 'userActions' ? (
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                            {getUserActionLabel(actionType, USER_REQUEST_ACTION)}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-slate-500">
                        {getRequesterName(request)} · {getRequesterTeam(request)}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      {isOverdue ? (
                        <>
                          <span className="block text-xs font-black text-rose-700">
                            {getDateDiffDays(request.dueDate, todayDate)}일 연체
                          </span>
                          <span className="mt-1 block text-[10px] text-slate-400">
                            {request.dueDate || '-'} 반납 예정
                          </span>
                        </>
                      ) : activeWorkTab.id === 'startToday' ? (
                        <>
                          <span className="block text-xs font-bold text-blue-700">오늘 시작</span>
                          <span className="mt-1 block text-[10px] text-slate-400">
                            {request.dueDate || '-'}까지
                          </span>
                        </>
                      ) : activeWorkTab.id === 'userActions' ? (
                        <>
                          <span className="block text-xs font-bold text-violet-700">검토 대기</span>
                          <span className="mt-1 block text-[10px] text-slate-400">
                            {request.dueDate || '-'} 반납 예정
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="block text-xs font-bold text-amber-700">오늘 반납</span>
                          <span className="mt-1 block text-[10px] text-slate-400">
                            {request.startDate || '-'}부터
                          </span>
                        </>
                      )}
                    </span>
                    <ArrowRight
                      size={15}
                      className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          )}

          {activeWorkTab.items.length > 0 ? (
            <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3 text-right">
              <button
                type="button"
                onClick={() =>
                  openRequestList(activeWorkTab.requestTab, activeWorkTab.quickFilter)
                }
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-orange-600"
              >
                전체 {activeWorkTab.count}건 보기
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <CalendarClock size={19} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-black text-slate-900">현재 신청 기준 기본 일정</h3>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  사용자 신청 화면과 동일한 날짜 정책을 적용합니다.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="text-[10px] font-bold text-slate-400">대여 시작일</div>
                <div className="mt-1.5 text-sm font-black text-slate-900">
                  {formatDateWithKoreanWeekday(defaultStartDate) || '-'}
                </div>
              </div>
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3.5">
                <div className="text-[10px] font-bold text-orange-500">최장 반납 예정일</div>
                <div className="mt-1.5 text-sm font-black text-orange-800">
                  {formatDateWithKoreanWeekday(defaultDueDate) || '-'}
                </div>
              </div>
            </div>

            <dl className="mt-4 space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">최대 대여 기간</dt>
                <dd className="font-bold text-slate-800">{maxRentalDays}일</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">업무 종료 시간</dt>
                <dd className="font-bold text-slate-800">{settings.workEndTime || '18:00'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">시작일 조정</dt>
                <dd className="max-w-[65%] text-right font-bold leading-4 text-slate-800">
                  {rentalStartAdjustmentInfo?.adjusted
                    ? rentalStartAdjustmentInfo.reasons.join(' · ') || '다음 영업일 적용'
                    : '오늘부터 신청 가능'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">향후 7일 반납 예정</dt>
                <dd className="font-bold text-slate-800">
                  {dashboardData.upcomingReturns.length}대
                </dd>
              </div>
            </dl>
          </section>

          <section
            className={`rounded-2xl border p-5 shadow-sm ${
              totalIssueCount
                ? 'border-amber-200 bg-amber-50/60'
                : 'border-emerald-200 bg-emerald-50/60'
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  totalIssueCount
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {totalIssueCount ? (
                  <AlertTriangle size={19} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={19} aria-hidden="true" />
                )}
              </span>
              <div>
                <h3 className="text-sm font-black text-slate-900">시스템 데이터 점검</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {totalIssueCount
                    ? `확인이 필요한 항목 ${totalIssueCount}건`
                    : '현재 확인된 데이터 이상이 없습니다.'}
                </p>
              </div>
            </div>

            {totalIssueCount ? (
              <div className="mt-4 space-y-2">
                {dataIssues
                  .filter((issue) => issue.count > 0)
                  .map((issue) => (
                    <div
                      key={issue.label}
                      className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white/70 px-3 py-2.5 text-[11px]"
                    >
                      <span className="text-slate-600">{issue.label}</span>
                      <span className="shrink-0 font-black text-amber-800">
                        {issue.count}건
                      </span>
                    </div>
                  ))}
                {rentalRequestsLoadErrorMessage ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] text-rose-700">
                    대여신청 데이터 로딩 오류
                  </div>
                ) : null}
                {adminUserAccountsLoadErrorMessage ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] text-rose-700">
                    회원계정 데이터 로딩 오류
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-white/70 px-3 py-3 text-[11px] leading-5 text-emerald-800">
                예약 요약, 대여기간, 자산 참조와 신청자 정보가 정상입니다.
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">회원가입 승인 대기</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                가입 신청일이 오래된 회원부터 표시합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={openPendingMembers}
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-orange-600"
            >
              전체 보기
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>

          {!adminUserAccountsReady ? (
            <div className="py-12 text-center text-xs text-slate-400">
              회원 계정을 불러오는 중입니다.
            </div>
          ) : dashboardData.pendingAccounts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Users size={24} className="text-slate-300" aria-hidden="true" />
              <div className="mt-2 text-xs font-bold text-slate-600">
                승인 대기 중인 회원이 없습니다.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {dashboardData.pendingAccounts.slice(0, 6).map((account) => (
                <button
                  key={account.uid || account.id || account.email}
                  type="button"
                  onClick={openPendingMembers}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-xs font-black text-violet-700">
                    {String(account.name || account.email || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black text-slate-900">
                      {account.name || '이름 미입력'}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-slate-500">
                      {account.team || '부서 미입력'} · {account.email || '-'}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-bold text-violet-700">
                    {getWaitingDays(account.createdAt || account.updatedAt, nowMillis)}일 대기
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-sm font-black text-slate-900">접수·검토 보조 현황</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              일반 신청과 사용자 후속 요청을 구분하여 확인합니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
            {[
              {
                label: '신규 신청',
                value: dashboardData.requestedRequests.length,
                tone: 'border-blue-200 bg-blue-50 text-blue-700',
                tab: ADMIN_REQUEST_TAB.PENDING,
                filter: ADMIN_REQUEST_QUICK_FILTER.REQUESTED,
              },
              {
                label: '보류',
                value: dashboardData.onHoldRequests.length,
                tone: 'border-violet-200 bg-violet-50 text-violet-700',
                tab: ADMIN_REQUEST_TAB.PENDING,
                filter: ADMIN_REQUEST_QUICK_FILTER.ON_HOLD,
              },
              {
                label: '예약중',
                value: dashboardData.reservedRequests.length,
                tone: 'border-sky-200 bg-sky-50 text-sky-700',
                tab: ADMIN_REQUEST_TAB.RENTAL,
                filter: ADMIN_REQUEST_QUICK_FILTER.RESERVED,
              },
              {
                label: '사용자 요청',
                value: dashboardData.pendingUserActions.length,
                tone: 'border-amber-200 bg-amber-50 text-amber-700',
                tab: ADMIN_REQUEST_TAB.RENTAL,
                filter: ADMIN_REQUEST_QUICK_FILTER.PENDING_USER_ACTION,
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => openRequestList(item.tab, item.filter)}
                className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${item.tone}`}
              >
                <div className="text-[10px] font-bold">{item.label}</div>
                <div className="mt-1 text-xl font-black text-slate-900">{item.value}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
