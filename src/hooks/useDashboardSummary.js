import { useCallback, useEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

import { DASHBOARD_SUMMARY_DOC_REF, firebaseAuth } from '../firebase.js';
import { today } from '../utils/appUtils.js';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';
import { readAdminRentalRequestCutoverConfig } from '../features/requests/adminRentalRequestCutover.js';
import { readAssetDomainCutoverConfig } from '../features/assets/assetDomainCutover.js';
import {
  getFirestoreResourceExhaustedMessage,
  isFirestoreCapacityCoolingDown,
  isFirestoreResourceExhaustedError,
  markFirestoreCapacityExhausted,
} from '../utils/firestoreCapacity.js';

let dashboardSummaryServicePromise = null;

const DASHBOARD_SUMMARY_CACHE_KEY =
  'rental-system:admin-dashboard-summary-cache-v1';

const loadDashboardSummaryService = () => {
  if (!dashboardSummaryServicePromise) {
    dashboardSummaryServicePromise = import(
      '../services/dashboardSummaryService.js'
    ).catch((error) => {
      dashboardSummaryServicePromise = null;
      throw error;
    });
  }

  return dashboardSummaryServicePromise;
};

const readDashboardSummaryCache = () => {
  if (typeof window === 'undefined') return null;

  try {
    const cached = JSON.parse(
      window.localStorage.getItem(DASHBOARD_SUMMARY_CACHE_KEY) || 'null'
    );

    return cached && typeof cached === 'object' ? cached : null;
  } catch {
    return null;
  }
};

const writeDashboardSummaryCache = (summary) => {
  if (typeof window === 'undefined' || !summary) return;

  try {
    window.localStorage.setItem(
      DASHBOARD_SUMMARY_CACHE_KEY,
      JSON.stringify(summary)
    );
  } catch {
    // 저장공간 제한 시 화면 데이터만 유지합니다.
  }
};

export const useDashboardSummary = ({
  firebaseAuthReady,
  currentAuthRoleReady,
  authenticatedAdminId,
  currentAuthAdminAccountId,
  firebaseAuthUserUid,
  isAdminAuthenticated,
  view,
  adminTab,
  triggerToast,
}) => {
  const cachedSummaryRef = useRef(readDashboardSummaryCache());
  const dashboardSummaryRef = useRef(cachedSummaryRef.current);
  const [dashboardSummary, setDashboardSummary] = useState(
    () => cachedSummaryRef.current
  );
  const [dashboardSummaryReady, setDashboardSummaryReady] = useState(
    () => Boolean(cachedSummaryRef.current)
  );
  const [dashboardSummaryRefreshing, setDashboardSummaryRefreshing] =
    useState(false);
  const [
    dashboardSummaryLoadErrorMessage,
    setDashboardSummaryLoadErrorMessage,
  ] = useState('');

  const refreshInProgressRef = useRef(false);
  const triggerToastRef = useRef(triggerToast);
  const adminRentalCutoverConfigRef = useRef(
    readAdminRentalRequestCutoverConfig()
  );
  const assetCutoverConfigRef = useRef(readAssetDomainCutoverConfig());

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  const applyDashboardSummary = useCallback((nextSummary) => {
    if (!nextSummary) return;

    cachedSummaryRef.current = nextSummary;
    dashboardSummaryRef.current = nextSummary;
    setDashboardSummary(nextSummary);
    setDashboardSummaryReady(true);
    setDashboardSummaryLoadErrorMessage('');
    writeDashboardSummaryCache(nextSummary);
  }, []);

  const applyPostgresRentalDashboard = useCallback(async () => {
    if (!adminRentalCutoverConfigRef.current.readRequested) return null;
    const firebaseUser = firebaseAuth.currentUser;
    if (!firebaseUser) return null;
    const firebaseIdToken = await firebaseUser.getIdToken();
    const payload = await clerkStagingClient.getAdminRentalDashboard(
      firebaseIdToken,
      today()
    );
    const dashboard = payload?.adminRentalDashboard;
    const counts = dashboard?.counts || {};
    const currentSummary = dashboardSummaryRef.current || cachedSummaryRef.current || {
      schemaVersion: 2,
      businessDate: today(),
      activeRequests: [],
      pendingAccounts: [],
      metrics: {},
      requestTabCounts: {},
      dataIssueCounts: {},
      sourceStats: {},
    };
    const nextSummary = {
      ...currentSummary,
      businessDate: today(),
      metrics: {
        ...(currentSummary.metrics || {}),
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
        ...(currentSummary.sourceStats || {}),
        rentalRequestMetricSource: 'postgresql-phase17',
        rentalRequestMetricReferenceDate: dashboard?.referenceDate || today(),
      },
    };
    applyDashboardSummary(nextSummary);
    return nextSummary;
  }, [applyDashboardSummary]);

  const applyPostgresAssetDashboard = useCallback(async () => {
    if (!assetCutoverConfigRef.current.readRequested) return null;
    const payload = await clerkStagingClient.getAssetCatalog();
    const catalog = payload?.assetCatalog;
    const metrics = catalog?.metrics || {};
    const currentSummary = dashboardSummaryRef.current || cachedSummaryRef.current || {
      schemaVersion: 2,
      businessDate: today(),
      activeRequests: [],
      pendingAccounts: [],
      metrics: {},
      requestTabCounts: {},
      dataIssueCounts: {},
      sourceStats: {},
    };
    const nextSummary = {
      ...currentSummary,
      metrics: {
        ...(currentSummary.metrics || {}),
        totalAssetCount: Number(metrics.totalAssetCount || 0),
        availableCount: Number(metrics.availableCount || 0),
        unavailableCount: Number(metrics.unavailableCount || 0),
      },
      sourceStats: {
        ...(currentSummary.sourceStats || {}),
        assetMetricSource: 'postgresql-phase20',
        assetCatalogCount: Number(metrics.totalAssetCount || 0),
        assetAvailabilityCount: Array.isArray(catalog?.availability) ? catalog.availability.length : 0,
      },
    };
    applyDashboardSummary(nextSummary);
    return nextSummary;
  }, [applyDashboardSummary]);

  const applyCapacityError = useCallback((error, { showToast = false } = {}) => {
    markFirestoreCapacityExhausted(error);

    const cachedDataAvailable = Boolean(
      cachedSummaryRef.current || dashboardSummaryRef.current
    );
    const message = getFirestoreResourceExhaustedMessage({
      operation: '관리자 대시보드 요약 조회·갱신',
      cachedDataAvailable,
    });

    if (cachedSummaryRef.current && !dashboardSummaryRef.current) {
      dashboardSummaryRef.current = cachedSummaryRef.current;
      setDashboardSummary(cachedSummaryRef.current);
    }

    setDashboardSummaryReady(true);
    setDashboardSummaryLoadErrorMessage(message);

    if (showToast) {
      triggerToastRef.current?.(message, 'error');
    }
  }, []);

  const refreshDashboardSummary = useCallback(
    async ({ showToast = false } = {}) => {
      if (refreshInProgressRef.current) return;

      const adminUid = currentAuthAdminAccountId || authenticatedAdminId;
      if (!adminUid) return;

      if (isFirestoreCapacityCoolingDown()) {
        applyCapacityError(
          { code: 'resource-exhausted' },
          { showToast }
        );
        return;
      }

      refreshInProgressRef.current = true;
      setDashboardSummaryRefreshing(true);
      setDashboardSummaryLoadErrorMessage('');

      try {
        const { refreshDashboardSummaryDocument } =
          await loadDashboardSummaryService();
        const nextSummary = await refreshDashboardSummaryDocument({
          adminUid,
        });

        applyDashboardSummary(nextSummary);

        if (showToast) {
          triggerToastRef.current?.(
            '관리자 대시보드 요약을 최신 데이터로 갱신했습니다.'
          );
        }
      } catch (error) {
        console.error('Dashboard summary refresh error:', error);

        if (isFirestoreResourceExhaustedError(error)) {
          applyCapacityError(error, { showToast });
        } else {
          const message =
            '관리자 대시보드 요약을 갱신하지 못했습니다. Firestore 권한과 데이터 구조를 확인해 주세요.';
          setDashboardSummaryLoadErrorMessage(message);
          setDashboardSummaryReady(true);
          if (showToast) triggerToastRef.current?.(message, 'error');
        }
      } finally {
        refreshInProgressRef.current = false;
        setDashboardSummaryRefreshing(false);
      }
    },
    [
      applyCapacityError,
      applyDashboardSummary,
      authenticatedAdminId,
      currentAuthAdminAccountId,
    ]
  );

  const shouldSubscribeDashboardSummary =
    firebaseAuthReady &&
    currentAuthRoleReady &&
    isAdminAuthenticated &&
    Boolean(authenticatedAdminId) &&
    Boolean(currentAuthAdminAccountId) &&
    Boolean(firebaseAuthUserUid) &&
    firebaseAuthUserUid === currentAuthAdminAccountId &&
    view === 'admin';

  useEffect(() => {
    if (!shouldSubscribeDashboardSummary) {
      dashboardSummaryRef.current = cachedSummaryRef.current;
      setDashboardSummary(cachedSummaryRef.current);
      setDashboardSummaryReady(Boolean(cachedSummaryRef.current));
      setDashboardSummaryLoadErrorMessage('');
      return undefined;
    }

    if (!cachedSummaryRef.current) {
      setDashboardSummaryReady(false);
    }

    let cancelled = false;
    let unsubscribe = null;
    let refreshRequested = false;

    const requestRefreshOnce = () => {
      if (
        refreshRequested ||
        cancelled ||
        isFirestoreCapacityCoolingDown()
      ) {
        return;
      }

      refreshRequested = true;
      void refreshDashboardSummary();
    };

    const subscribeDashboardSummary = async () => {
      try {
        const { normalizeDashboardSummary } =
          await loadDashboardSummaryService();

        if (cancelled) return;

        unsubscribe = onSnapshot(
          DASHBOARD_SUMMARY_DOC_REF,
          (snapshot) => {
            if (!snapshot.exists()) {
              if (cachedSummaryRef.current) {
                dashboardSummaryRef.current = cachedSummaryRef.current;
                setDashboardSummary(cachedSummaryRef.current);
                setDashboardSummaryReady(true);
              } else {
                dashboardSummaryRef.current = null;
                setDashboardSummary(null);
                setDashboardSummaryReady(false);
              }

              requestRefreshOnce();
              return;
            }

            applyDashboardSummary(
              normalizeDashboardSummary(snapshot.data())
            );
          },
          (error) => {
            console.error('Dashboard summary sync error:', error);

            if (isFirestoreResourceExhaustedError(error)) {
              applyCapacityError(error);
              return;
            }

            const message =
              '관리자 대시보드 요약 문서를 불러오지 못했습니다.';
            setDashboardSummaryLoadErrorMessage(message);
            setDashboardSummaryReady(true);
            requestRefreshOnce();
          }
        );
      } catch (error) {
        if (cancelled) return;

        console.error('Dashboard summary module load error:', error);
        setDashboardSummaryLoadErrorMessage(
          '관리자 대시보드 모듈을 불러오지 못했습니다.'
        );
        setDashboardSummaryReady(true);
      }
    };

    void subscribeDashboardSummary();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [
    applyCapacityError,
    applyDashboardSummary,
    refreshDashboardSummary,
    shouldSubscribeDashboardSummary,
  ]);

  useEffect(() => {
    if (
      !shouldSubscribeDashboardSummary ||
      adminTab !== 'dashboard' ||
      !dashboardSummaryReady ||
      !dashboardSummary ||
      isFirestoreCapacityCoolingDown()
    ) {
      return undefined;
    }

    let cancelled = false;

    const refreshStaleDashboardSummary = async () => {
      try {
        if (adminRentalCutoverConfigRef.current.readRequested || assetCutoverConfigRef.current.readRequested) {
          if (adminRentalCutoverConfigRef.current.readRequested) await applyPostgresRentalDashboard();
          if (assetCutoverConfigRef.current.readRequested) await applyPostgresAssetDashboard();
          return;
        }

        const {
          DASHBOARD_SUMMARY_ENTRY_REFRESH_AGE_MS,
          DASHBOARD_SUMMARY_SCHEMA_VERSION,
          getDashboardSummaryGeneratedAtMillis,
        } = await loadDashboardSummaryService();

        if (cancelled) return;

        const generatedAtMillis =
          getDashboardSummaryGeneratedAtMillis(dashboardSummary);
        const isStale =
          dashboardSummary.schemaVersion !==
            DASHBOARD_SUMMARY_SCHEMA_VERSION ||
          dashboardSummary.businessDate !== today() ||
          !generatedAtMillis ||
          Date.now() - generatedAtMillis >
            DASHBOARD_SUMMARY_ENTRY_REFRESH_AGE_MS;

        if (isStale) {
          void refreshDashboardSummary();
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Dashboard summary staleness check error:', error);
      }
    };

    void refreshStaleDashboardSummary();

    return () => {
      cancelled = true;
    };
  }, [
    adminTab,
    dashboardSummary,
    dashboardSummaryReady,
    refreshDashboardSummary,
    applyPostgresRentalDashboard,
    applyPostgresAssetDashboard,
    shouldSubscribeDashboardSummary,
  ]);

  return {
    dashboardSummary,
    dashboardSummaryLoadErrorMessage,
    dashboardSummaryReady,
    dashboardSummaryRefreshing,
    refreshDashboardSummary,
  };
};

export default useDashboardSummary;
