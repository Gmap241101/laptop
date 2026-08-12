import { useCallback, useEffect, useRef, useState } from 'react';

import { today } from '../utils/appUtils.js';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';

const DASHBOARD_SUMMARY_CACHE_KEY = 'rental-system:admin-dashboard-summary-cache-v2-postgresql';
const DASHBOARD_SUMMARY_ENTRY_REFRESH_AGE_MS = 60 * 60 * 1000;
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
const generatedAtMillis = (summary) => Number(summary?.generatedAtClientMs || Date.parse(summary?.generatedAt || '') || 0);
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
  adminTab,
  triggerToast,
}) => {
  const cachedRef = useRef(readCache());
  const summaryRef = useRef(cachedRef.current);
  const refreshInProgressRef = useRef(false);
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
      const [dashboardPayload, pendingPayload, pendingRequestsPayload, rentalRequestsPayload, assetPayload, systemDataPayload] = await Promise.all([
        clerkStagingClient.getAdminRentalDashboard('', referenceDate),
        clerkStagingClient.getAdminMembers('', { status: 'pending', page: 1, pageSize: DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT }),
        clerkStagingClient.getAdminRentalRequests('', { tab: 'pending', page: 1, pageSize: DASHBOARD_ACTIVE_REQUEST_LIMIT, referenceDate }),
        clerkStagingClient.getAdminRentalRequests('', { tab: 'rental', page: 1, pageSize: DASHBOARD_ACTIVE_REQUEST_LIMIT, referenceDate }),
        clerkStagingClient.getAssetCatalog(),
        clerkStagingClient.getAdminSystemDataOverview(),
      ]);

      const counts = dashboardPayload?.adminRentalDashboard?.counts || {};
      const pendingAccounts = pendingPayload?.adminMembers?.accounts || [];
      const pendingRequests = pendingRequestsPayload?.adminRentalRequests?.requests || [];
      const rentalRequests = rentalRequestsPayload?.adminRentalRequests?.requests || [];
      const catalog = assetPayload?.assetCatalog || {};
      const assetMetrics = catalog?.metrics || {};
      const integrity = systemDataPayload?.systemDataOverview?.integrity || {};
      const assetReference = integrity?.assetReference || {};
      const next = {
        ...emptySummary(),
        businessDate: dashboardPayload?.adminRentalDashboard?.referenceDate || referenceDate,
        activeRequests: mergeUniqueRequests(pendingRequests, rentalRequests),
        pendingAccounts: pendingAccounts.slice(0, DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT),
        metrics: {
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
          totalAssetCount: Number(assetMetrics.totalAssetCount || 0),
          availableCount: Number(assetMetrics.availableCount || 0),
          unavailableCount: Number(assetMetrics.unavailableCount || 0),
          pendingAccountCount: Number(pendingPayload?.adminMembers?.statusCounts?.pending || pendingPayload?.adminMembers?.totalCount || 0),
        },
        requestTabCounts: {
          pending: Number(counts.pending || 0),
          rental: Number(counts.rental || 0),
          closed: Number(counts.closed || 0),
          returned: Number(counts.returned || 0),
        },
        dataIssueCounts: {
          missingAsset: Number(assetReference.missingRequestCount || 0),
          orphanedAvailability: Number(assetReference.missingReservationCount || 0),
          missingDate: 0,
          invalidPeriod: 0,
          missingRequester: 0,
        },
        sourceStats: {
          authority: 'postgresql',
          rentalRequestMetricSource: 'postgresql',
          memberMetricSource: 'postgresql',
          assetMetricSource: 'postgresql',
          assetCatalogCount: Number(assetMetrics.totalAssetCount || 0),
          assetAvailabilityCount: Array.isArray(catalog?.availability) ? catalog.availability.length : 0,
          dataIntegritySource: 'postgresql',
          assetReferenceRecoverableCount: Number(assetReference.recoverableRequestCount || 0),
          assetReferenceUnrecoverableCount: Number(assetReference.unrecoverableRequestCount || 0),
        },
      };
      applySummary(next);
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
      return;
    }
    const cached = summaryRef.current || cachedRef.current;
    const stale = !cached || Date.now() - generatedAtMillis(cached) >= DASHBOARD_SUMMARY_ENTRY_REFRESH_AGE_MS;
    if (adminTab === 'dashboard' || stale) void refreshDashboardSummary({ showToast: false });
  }, [adminTab, readyForDashboard, refreshDashboardSummary]);

  return {
    dashboardSummary,
    dashboardSummaryReady,
    dashboardSummaryRefreshing,
    dashboardSummaryLoadErrorMessage,
    refreshDashboardSummary,
  };
};

export default useDashboardSummary;
