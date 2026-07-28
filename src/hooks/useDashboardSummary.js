import { useCallback, useEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

import { DASHBOARD_SUMMARY_DOC_REF } from '../firebase.js';
import { today } from '../utils/appUtils.js';
import {
  DASHBOARD_SUMMARY_ENTRY_REFRESH_AGE_MS,
  DASHBOARD_SUMMARY_SCHEMA_VERSION,
  getDashboardSummaryGeneratedAtMillis,
  normalizeDashboardSummary,
  refreshDashboardSummaryDocument,
} from '../services/dashboardSummaryService.js';

const DASHBOARD_REFRESH_AFTER_ADMIN_TABS = new Set([
  'requests',
  'memberAccounts',
  'laptops',
  'categories',
  'dataManagement',
]);

export const useDashboardSummary = ({
  firebaseAuthReady,
  currentAuthRoleReady,
  authenticatedAdminId,
  currentAuthAdminAccountId,
  view,
  adminTab,
  setAdminRequestTabCountsRemote,
  triggerToast,
}) => {
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [dashboardSummaryReady, setDashboardSummaryReady] = useState(false);
  const [dashboardSummaryRefreshing, setDashboardSummaryRefreshing] =
    useState(false);
  const [
    dashboardSummaryLoadErrorMessage,
    setDashboardSummaryLoadErrorMessage,
  ] = useState('');

  const refreshInProgressRef = useRef(false);
  const previousAdminTabRef = useRef('dashboard');
  const triggerToastRef = useRef(triggerToast);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  const refreshDashboardSummary = useCallback(
    async ({ showToast = false } = {}) => {
      if (refreshInProgressRef.current) return;

      const adminUid = currentAuthAdminAccountId || authenticatedAdminId;
      if (!adminUid) return;

      refreshInProgressRef.current = true;
      setDashboardSummaryRefreshing(true);
      setDashboardSummaryLoadErrorMessage('');

      try {
        const nextSummary = await refreshDashboardSummaryDocument({ adminUid });
        setDashboardSummary(nextSummary);
        setDashboardSummaryReady(true);
        setAdminRequestTabCountsRemote(nextSummary.requestTabCounts);

        if (showToast) {
          triggerToastRef.current?.(
            '관리자 대시보드 요약을 최신 데이터로 갱신했습니다.'
          );
        }
      } catch (error) {
        const message =
          '관리자 대시보드 요약을 갱신하지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.';
        console.error('Dashboard summary refresh error:', error);
        setDashboardSummaryLoadErrorMessage(message);
        setDashboardSummaryReady(true);
        if (showToast) triggerToastRef.current?.(message, 'error');
      } finally {
        refreshInProgressRef.current = false;
        setDashboardSummaryRefreshing(false);
      }
    }, [
      authenticatedAdminId,
      currentAuthAdminAccountId,
      setAdminRequestTabCountsRemote,
    ]
  );

  const shouldSubscribeDashboardSummary =
    firebaseAuthReady &&
    currentAuthRoleReady &&
    Boolean(authenticatedAdminId) &&
    Boolean(currentAuthAdminAccountId) &&
    view === 'admin';

  useEffect(() => {
    if (!shouldSubscribeDashboardSummary) {
      setDashboardSummary(null);
      setDashboardSummaryReady(false);
      setDashboardSummaryLoadErrorMessage('');
      return undefined;
    }

    setDashboardSummaryReady(false);
    let refreshRequested = false;

    const requestRefreshOnce = () => {
      if (refreshRequested) return;
      refreshRequested = true;
      void refreshDashboardSummary();
    };

    const unsubscribe = onSnapshot(
      DASHBOARD_SUMMARY_DOC_REF,
      (snapshot) => {
        if (!snapshot.exists()) {
          setDashboardSummary(null);
          setDashboardSummaryReady(false);
          requestRefreshOnce();
          return;
        }

        const nextSummary = normalizeDashboardSummary(snapshot.data());
        setDashboardSummary(nextSummary);
        setDashboardSummaryReady(true);
        setDashboardSummaryLoadErrorMessage('');
        setAdminRequestTabCountsRemote(nextSummary.requestTabCounts);
      },
      (error) => {
        const message =
          '관리자 대시보드 요약 문서를 불러오지 못했습니다.';
        console.error('Dashboard summary sync error:', error);
        setDashboardSummaryLoadErrorMessage(message);
        setDashboardSummaryReady(true);
        requestRefreshOnce();
      }
    );

    return () => {
      unsubscribe();
    };
  }, [
    shouldSubscribeDashboardSummary,
    refreshDashboardSummary,
    setAdminRequestTabCountsRemote,
  ]);

  useEffect(() => {
    const previousAdminTab = previousAdminTabRef.current;
    previousAdminTabRef.current = adminTab;

    if (
      !shouldSubscribeDashboardSummary ||
      adminTab !== 'dashboard' ||
      !dashboardSummaryReady ||
      !dashboardSummary
    ) {
      return;
    }

    const generatedAtMillis =
      getDashboardSummaryGeneratedAtMillis(dashboardSummary);
    const isStale =
      dashboardSummary.schemaVersion !== DASHBOARD_SUMMARY_SCHEMA_VERSION ||
      dashboardSummary.businessDate !== today() ||
      !generatedAtMillis ||
      Date.now() - generatedAtMillis >
        DASHBOARD_SUMMARY_ENTRY_REFRESH_AGE_MS;
    const shouldForceRefreshAfterAdminWork =
      DASHBOARD_REFRESH_AFTER_ADMIN_TABS.has(previousAdminTab);

    if (isStale || shouldForceRefreshAfterAdminWork) {
      void refreshDashboardSummary();
    }
  }, [
    adminTab,
    dashboardSummary,
    dashboardSummaryReady,
    refreshDashboardSummary,
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
