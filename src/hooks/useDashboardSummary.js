import { useCallback, useEffect, useRef, useState } from 'react';

import { today } from '../utils/appUtils.js';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';
import { subscribeAdminRentalRequestCutoverObservation } from '../features/requests/adminRentalRequestCutover.js';
import { subscribeAssetDomainCutoverObservation } from '../features/assets/assetDomainCutover.js';
import { subscribeMemberAuthorityObservation } from '../features/members/memberAuthorityCutover.js';

const DASHBOARD_SUMMARY_CACHE_KEY = 'rental-system:admin-dashboard-summary-cache-v2-postgresql';
const DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT = 12;
const DASHBOARD_ACTIVE_REQUEST_LIMIT = 100;

const readCache = () => {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(DASHBOARD_SUMMARY_CACHE_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
};
const writeCache = (summary) => {
  if (typeof window === 'undefined' || !summary) return;
  try { window.localStorage.setItem(DASHBOARD_SUMMARY_CACHE_KEY, JSON.stringify(summary)); } catch { /* ignore quota */ }
};
const emptySummary = () => ({
  schemaVersion: 3,
  authority: 'postgresql',
  generatedAt: new Date().toISOString(),
  generatedAtClientMs: Date.now(),
  businessDate: today(),
  activeRequests: [],
  pendingAccounts: [],
  metrics: {},
  requestTabCounts: {},
  dataIssueCounts: {},
  sourceStats: {},
});

const mergeUniqueRequests = (...groups) => {
  const byId = new Map();
  for (const request of groups.flat()) {
    if (!request?.id) continue;
    byId.set(request.id, request);
  }
  return [...byId.values()]
    .sort((a, b) => Date.parse(b?.createdAt || b?.requestedAt || b?.updatedAt || '') - Date.parse(a?.createdAt || a?.requestedAt || a?.updatedAt || ''))
    .slice(0, DASHBOARD_ACTIVE_REQUEST_LIMIT);
};

export const useDashboardSummary = ({
  authenticatedAdminId,
  currentAuthAdminAccountId,
  isAdminAuthenticated,
  view,
  triggerToast,
}) => {
  const cachedRef = useRef(readCache());
  const summaryRef = useRef(cachedRef.current);
  const refreshInProgressRef = useRef(false);
  const integrityRefreshInProgressRef = useRef(false);
  const triggerToastRef = useRef(triggerToast);
  const [dashboardSummary, setDashboardSummary] = useState(() => cachedRef.current);
  const [dashboardSummaryReady, setDashboardSummaryReady] = useState(() => Boolean(cachedRef.current));
  const [dashboardSummaryRefreshing, setDashboardSummaryRefreshing] = useState(false);
  const [dashboardSummaryLoadErrorMessage, setDashboardSummaryLoadErrorMessage] = useState('');

  useEffect(() => { triggerToastRef.current = triggerToast; }, [triggerToast]);

  const applySummary = useCallback((summary) => {
    summaryRef.current = summary;
    cachedRef.current = summary;
    setDashboardSummary(summary);
    setDashboardSummaryReady(true);
    setDashboardSummaryLoadErrorMessage('');
    writeCache(summary);
  }, []);

  const refreshDashboardSummary = useCallback(async ({ showToast = false } = {}) => {
    if (refreshInProgressRef.current) return null;
    const adminId = currentAuthAdminAccountId || authenticatedAdminId;
    if (!adminId || !isAdminAuthenticated) return null;

    refreshInProgressRef.current = true;
    setDashboardSummaryRefreshing(true);
    setDashboardSummaryLoadErrorMessage('');
    try {
      const referenceDate = today();
      const previous = summaryRef.current || emptySummary();
      const dashboardPayload = await clerkStagingClient.getAdminRentalDashboard('', referenceDate);
      const counts = dashboardPayload?.adminRentalDashboard?.counts || {};
      const core = {
        ...emptySummary(),
        ...previous,
        generatedAt: new Date().toISOString(),
        generatedAtClientMs: Date.now(),
        businessDate: dashboardPayload?.adminRentalDashboard?.referenceDate || referenceDate,
        metrics: {
          ...(previous?.metrics || {}),
          requestedCount: Number(counts.requested || 0),
          onHoldCount: Number(counts.on_hold || 0),
          approvedCount: Number(counts.rental || 0),
          pendingUserActionCount: Number(counts.pending_user_action || 0),
          overdueCount: Number(counts.overdue || 0),
          dueTodayCount: Number(counts.due_today || 0),
          startTodayCount: Number(counts.start_today || 0),
          uniqueReservedAssets: Number(counts.unique_reserved_assets || 0),
          uniqueActiveAssets: Number(counts.unique_active_assets || 0),
          uniqueOverdueAssets: Number(counts.unique_overdue_assets || 0),
          uniqueOverdueUsers: Number(counts.unique_overdue_users || 0),
          longestOverdueDays: Number(counts.longest_overdue_days || 0),
          oldestRequestedDays: Number(counts.oldest_requested_days || 0),
        },
        requestTabCounts: {
          pending: Number(counts.pending || 0),
          rental: Number(counts.rental || 0),
          closed: Number(counts.closed || 0),
          returned: Number(counts.returned || 0),
        },
        sourceStats: {
          ...(previous?.sourceStats || {}),
          authority: 'postgresql',
          rentalRequestMetricSource: 'postgresql',
          dashboardCriticalPath: 'rental-counts-first',
        },
      };
      applySummary(core);

      const [pendingResult, pendingRequestsResult, rentalRequestsResult, assetResult] = await Promise.allSettled([
        clerkStagingClient.getAdminMembers('', { status: 'pending', page: 1, pageSize: DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT }),
        clerkStagingClient.getAdminRentalRequests('', { tab: 'pending', page: 1, pageSize: DASHBOARD_ACTIVE_REQUEST_LIMIT, referenceDate, includeCounts: false }),
        clerkStagingClient.getAdminRentalRequests('', { tab: 'rental', page: 1, pageSize: DASHBOARD_ACTIVE_REQUEST_LIMIT, referenceDate, includeCounts: false }),
        clerkStagingClient.getAssetCatalog(),
      ]);

      const pendingPayload = pendingResult.status === 'fulfilled' ? pendingResult.value : null;
      const pendingRequestsPayload = pendingRequestsResult.status === 'fulfilled' ? pendingRequestsResult.value : null;
      const rentalRequestsPayload = rentalRequestsResult.status === 'fulfilled' ? rentalRequestsResult.value : null;
      const assetPayload = assetResult.status === 'fulfilled' ? assetResult.value : null;
      const pendingAccounts = pendingPayload?.adminMembers?.accounts || previous?.pendingAccounts || [];
      const pendingRequests = pendingRequestsPayload?.adminRentalRequests?.requests || [];
      const rentalRequests = rentalRequestsPayload?.adminRentalRequests?.requests || [];
      const catalog = assetPayload?.assetCatalog || null;
      const assetMetrics = catalog?.metrics || null;
      const requestPreviewsAvailable = pendingRequestsResult.status === 'fulfilled' || rentalRequestsResult.status === 'fulfilled';

      const next = {
        ...core,
        generatedAt: new Date().toISOString(),
        generatedAtClientMs: Date.now(),
        activeRequests: requestPreviewsAvailable
          ? mergeUniqueRequests(pendingRequests, rentalRequests)
          : (previous?.activeRequests || []),
        pendingAccounts: pendingResult.status === 'fulfilled'
          ? pendingAccounts.slice(0, DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT)
          : (previous?.pendingAccounts || []),
        metrics: {
          ...core.metrics,
          ...(assetMetrics ? {
            totalAssetCount: Number(assetMetrics.totalAssetCount || 0),
            availableCount: Number(assetMetrics.availableCount || 0),
            unavailableCount: Number(assetMetrics.unavailableCount || 0),
          } : {}),
          ...(pendingPayload ? {
            pendingAccountCount: Number(pendingPayload?.adminMembers?.statusCounts?.pending || pendingPayload?.adminMembers?.totalCount || 0),
          } : {}),
        },
        sourceStats: {
          ...core.sourceStats,
          memberMetricSource: pendingPayload ? 'postgresql' : (previous?.sourceStats?.memberMetricSource || 'postgresql-cache'),
          ...(catalog ? {
            assetMetricSource: 'postgresql',
            assetCatalogCount: Number(assetMetrics?.totalAssetCount || 0),
            assetAvailabilityCount: Array.isArray(catalog?.availability) ? catalog.availability.length : 0,
          } : {
            assetMetricSource: previous?.sourceStats?.assetMetricSource || 'postgresql-cache',
          }),
        },
      };
      applySummary(next);

      if (!integrityRefreshInProgressRef.current) {
        integrityRefreshInProgressRef.current = true;
        void clerkStagingClient.getAdminSystemDataOverview()
          .then((systemDataPayload) => {
            const integrity = systemDataPayload?.systemDataOverview?.integrity || {};
            const assetReference = integrity?.assetReference || {};
            const current = summaryRef.current || next;
            applySummary({
              ...current,
              dataIssueCounts: {
                missingAsset: Number(assetReference.missingRequestCount || 0),
                orphanedAvailability: Number(assetReference.missingReservationCount || 0),
                missingDate: 0,
                invalidPeriod: 0,
                missingRequester: 0,
              },
              sourceStats: {
                ...(current?.sourceStats || {}),
                dataIntegritySource: 'postgresql-background',
                assetReferenceRecoverableCount: Number(assetReference.recoverableRequestCount || 0),
                assetReferenceUnrecoverableCount: Number(assetReference.unrecoverableRequestCount || 0),
              },
            });
          })
          .catch((error) => {
            console.warn('PostgreSQL dashboard background integrity refresh error:', error);
          })
          .finally(() => {
            integrityRefreshInProgressRef.current = false;
          });
      }

      if (showToast) triggerToastRef.current?.('관리자 대시보드 요약을 PostgreSQL 최신 데이터로 갱신했습니다.', 'success');
      return next;
    } catch (error) {
      console.error('PostgreSQL dashboard summary refresh error:', error);
      const message = '관리자 대시보드 요약을 PostgreSQL에서 불러오지 못했습니다.';
      setDashboardSummaryLoadErrorMessage(message);
      setDashboardSummaryReady(true);
      if (showToast) triggerToastRef.current?.(message, 'error');
      return null;
    } finally {
      refreshInProgressRef.current = false;
      setDashboardSummaryRefreshing(false);
    }
  }, [applySummary, authenticatedAdminId, currentAuthAdminAccountId, isAdminAuthenticated]);

  const readyForDashboard = isAdminAuthenticated && Boolean(currentAuthAdminAccountId || authenticatedAdminId) && view === 'admin';

  useEffect(() => {
    if (!readyForDashboard) {
      setDashboardSummary(summaryRef.current || cachedRef.current);
      setDashboardSummaryReady(Boolean(summaryRef.current || cachedRef.current));
      setDashboardSummaryLoadErrorMessage('');
      return undefined;
    }

    let wasAwayFromWindow = false;
    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshDashboardSummary({ showToast: false });
    };
    const markWindowAway = () => {
      wasAwayFromWindow = true;
    };
    const refreshAfterWindowReturn = () => {
      if (!wasAwayFromWindow) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      wasAwayFromWindow = false;
      refreshIfVisible();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markWindowAway();
        return;
      }
      refreshAfterWindowReturn();
    };
    const refreshAfterMutation = (detail) => {
      if (!detail || detail.error) return;
      const isPostgresWrite =
        detail.writeSource === 'postgresql-authoritative' ||
        detail.memberWriteRequested === true ||
        detail.restrictionWriteRequested === true;
      if (isPostgresWrite) refreshIfVisible();
    };

    refreshIfVisible();
    window.addEventListener('blur', markWindowAway);
    window.addEventListener('focus', refreshAfterWindowReturn);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const unsubscribeRequestWrites = subscribeAdminRentalRequestCutoverObservation(refreshAfterMutation);
    const unsubscribeAssetWrites = subscribeAssetDomainCutoverObservation(refreshAfterMutation);
    const unsubscribeMemberWrites = subscribeMemberAuthorityObservation(refreshAfterMutation);

    return () => {
      window.removeEventListener('blur', markWindowAway);
      window.removeEventListener('focus', refreshAfterWindowReturn);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeRequestWrites();
      unsubscribeAssetWrites();
      unsubscribeMemberWrites();
    };
  }, [readyForDashboard, refreshDashboardSummary]);

  return {
    dashboardSummary,
    dashboardSummaryReady,
    dashboardSummaryRefreshing,
    dashboardSummaryLoadErrorMessage,
    refreshDashboardSummary,
  };
};

export default useDashboardSummary;
