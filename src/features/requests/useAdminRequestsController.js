import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  doc,
  getCountFromServer,
  getDoc,
  limit as firestoreLimit,
  onSnapshot,
  query as firestoreQuery,
  startAfter,
  where,
} from '../../platform/retiredLegacyDataCompat.js';

import {
  RENTAL_REQUESTS_COLLECTION_REF,
  firebaseAuth,
} from '../../platform/appDataRefs.js';
import {
  ADMIN_REQUEST_QUICK_FILTER,
  ADMIN_REQUEST_TAB,
  STATUS,
  USER_REQUEST_REVIEW_STATUS,
} from '../../constants/appConstants.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import {
  getAdminRequestCountConstraints,
  getAdminRequestServerConstraints,
} from '../../services/adminRequestQuery.js';
import {
  getFirestoreTimestampMillis,
  today,
} from '../../utils/appUtils.js';
import {
  isFirestoreCapacityCoolingDown,
  isFirestoreResourceExhaustedError,
  markFirestoreCapacityExhausted,
} from '../../utils/firestoreCapacity.js';
import useAdminRequestProgressiveSearch from './useAdminRequestProgressiveSearch.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import {
  publishAdminRentalRequestCutoverObservation,
  readAdminRentalRequestCutoverConfig,
} from './adminRentalRequestCutover.js';
import { readRentalRequestWriteMirrorRetirementConfig } from '../compatibility/rentalRequestWriteMirrorRetirement.js';

const DEFAULT_PAGE_SIZE = 10;

const adminRequestsSessionState = {
  lastNavigationRequestId: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  query: '',
  quickFilter: ADMIN_REQUEST_QUICK_FILTER.ALL,
  requestTab: ADMIN_REQUEST_TAB.PENDING,
};

const createDefaultTabCounts = () => ({
  [ADMIN_REQUEST_TAB.PENDING]: null,
  [ADMIN_REQUEST_TAB.RENTAL]: null,
  [ADMIN_REQUEST_TAB.CLOSED]: null,
  [ADMIN_REQUEST_TAB.RETURNED]: null,
});

const createDefaultTabCountErrors = () => ({
  [ADMIN_REQUEST_TAB.PENDING]: false,
  [ADMIN_REQUEST_TAB.RENTAL]: false,
  [ADMIN_REQUEST_TAB.CLOSED]: false,
  [ADMIN_REQUEST_TAB.RETURNED]: false,
});

export default function useAdminRequestsController({
  enabled,
  fallbackTabCounts = null,
  mutationVersion = 0,
  navigationRequest,
  onControllerStateChange,
  prerequisitesReady,
  triggerToast,
}) {
  const [requests, setRequests] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState('');
  const [requestTab, setRequestTab] = useState(
    () => adminRequestsSessionState.requestTab
  );
  const [quickFilter, setQuickFilter] = useState(
    () => adminRequestsSessionState.quickFilter
  );
  const [query, setQuery] = useState(
    () => adminRequestsSessionState.query
  );
  const [pageSize, setPageSize] = useState(
    () => adminRequestsSessionState.pageSize
  );
  const [page, setPage] = useState(
    () => adminRequestsSessionState.page
  );
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [tabCounts, setTabCounts] = useState(createDefaultTabCounts);
  const [tabCountErrors, setTabCountErrors] = useState(
    createDefaultTabCountErrors
  );
  const [tabCountsReady, setTabCountsReady] = useState(false);
  const [tabCountCapacityLimited, setTabCountCapacityLimited] =
    useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState('');

  const cursorByPageRef = useRef(new Map([[1, null]]));
  const cursorKeyRef = useRef('');
  const requestsRef = useRef(requests);
  const triggerToastRef = useRef(triggerToast);
  const postgresBootstrapRef = useRef(false);
  const [postgresFallbackActive, setPostgresFallbackActive] = useState(false);
  const adminCutoverConfig = useMemo(() => readAdminRentalRequestCutoverConfig(), []);
  const rentalWriteMirrorRetirementConfig = useMemo(
    () => readRentalRequestWriteMirrorRetirementConfig(),
    []
  );
  const postgresServerPaging = Boolean(
    adminCutoverConfig.readRequested && !postgresFallbackActive
  );

  useEffect(() => {
    if (enabled && prerequisitesReady) return;
    postgresBootstrapRef.current = false;
    setPostgresFallbackActive(false);
  }, [enabled, prerequisitesReady]);

  const debouncedQuery = useDebouncedValue(query);
  const referenceDate = today();

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    adminRequestsSessionState.page = page;
    adminRequestsSessionState.pageSize = pageSize;
    adminRequestsSessionState.query = query;
    adminRequestsSessionState.quickFilter = quickFilter;
    adminRequestsSessionState.requestTab = requestTab;
  }, [page, pageSize, query, quickFilter, requestTab]);

  useEffect(() => {
    const requestId = Number(navigationRequest?.requestId || 0);

    if (
      requestId <= 0 ||
      requestId === adminRequestsSessionState.lastNavigationRequestId
    ) {
      return;
    }

    adminRequestsSessionState.lastNavigationRequestId = requestId;
    setRequestTab(
      navigationRequest?.requestTab || ADMIN_REQUEST_TAB.PENDING
    );
    setQuickFilter(
      navigationRequest?.quickFilter || ADMIN_REQUEST_QUICK_FILTER.ALL
    );
    setQuery(String(navigationRequest?.query || ''));
    setSelectedRequestId(String(navigationRequest?.selectedRequestId || ''));
    setPage(1);
    cursorByPageRef.current = new Map([[1, null]]);
    cursorKeyRef.current = '';
  }, [navigationRequest]);

  const getRequestById = useCallback(
    (requestId) =>
      requestsRef.current.find((request) => request.id === requestId) || null,
    []
  );

  const updateRequests = useCallback((updater) => {
    setRequests((currentRequests) => {
      const nextRequests =
        typeof updater === 'function'
          ? updater(currentRequests)
          : updater;

      return Array.isArray(nextRequests)
        ? nextRequests
        : currentRequests;
    });
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
    cursorByPageRef.current = new Map([[1, null]]);
  }, []);

  useEffect(() => {
    if (typeof onControllerStateChange !== 'function') return undefined;

    onControllerStateChange({
      clearSelection: () => setSelectedRequestId(''),
      getRequestById,
      resetPage,
      updateRequests,
    });

    return () => {
      onControllerStateChange(null);
    };
  }, [getRequestById, onControllerStateChange, resetPage, updateRequests]);

  useEffect(() => {
    if (!adminCutoverConfig.readRequested) return;
    postgresBootstrapRef.current = false;
  }, [adminCutoverConfig.readRequested]);

  const progressiveSearchEnabled = Boolean(
    enabled &&
      prerequisitesReady &&
      !postgresServerPaging &&
      String(debouncedQuery || '').trim()
  );

  useAdminRequestProgressiveSearch({
    enabled: progressiveSearchEnabled,
    requestTab,
    quickFilter,
    searchQuery: debouncedQuery,
    serverPage: page,
    pageSize,
    referenceDate,
    setRequests,
    setHasNextPage,
    setTotalCount,
    setLoadErrorMessage,
    setReady,
    triggerToast: (...args) => triggerToastRef.current?.(...args),
  });

  useEffect(() => {
    if (!postgresServerPaging) return undefined;
    if (!enabled) {
      setRequests([]);
      setReady(true);
      setLoadErrorMessage('');
      setHasNextPage(false);
      setTotalCount(0);
      return undefined;
    }
    if (!prerequisitesReady) {
      setReady(false);
      return undefined;
    }

    let cancelled = false;
    setReady(false);
    setLoadErrorMessage('');

    const loadPostgresRequests = async () => {
      try {
        const firebaseUser = firebaseAuth.currentUser;
        if (!firebaseUser) {
          const error = new Error('Firebase admin sign-in is required.');
          error.code = 'admin_firebase_sign_in_required';
          throw error;
        }
        const firebaseIdToken = await firebaseUser.getIdToken();
        let bootstrapCount = null;
        if (!postgresBootstrapRef.current) {
          if (rentalWriteMirrorRetirementConfig.enabled) {
            bootstrapCount = 0;
          } else {
            const bootstrapPayload = await clerkStagingClient.bootstrapAdminRentalRequests(firebaseIdToken);
            bootstrapCount = Number(bootstrapPayload?.adminRentalRequestBootstrap?.synchronized || 0);
          }
          postgresBootstrapRef.current = true;
        }
        const payload = await clerkStagingClient.getAdminRentalRequests(firebaseIdToken, {
          tab: requestTab,
          quickFilter,
          query: debouncedQuery,
          page,
          pageSize,
          referenceDate,
        });
        if (cancelled) return;
        const candidate = payload.adminRentalRequests;
        let nextRequests = Array.isArray(candidate.requests) ? candidate.requests : [];

        if (
          selectedRequestId &&
          !nextRequests.some((request) => request.id === selectedRequestId)
        ) {
          try {
            const selectedPayload = await clerkStagingClient.getAdminRentalRequests(firebaseIdToken, {
              tab: requestTab,
              quickFilter: ADMIN_REQUEST_QUICK_FILTER.ALL,
              query: selectedRequestId,
              page: 1,
              pageSize: 1,
              referenceDate,
            });
            const selectedCandidate = selectedPayload?.adminRentalRequests?.requests?.[0];
            if (selectedCandidate?.id === selectedRequestId) {
              nextRequests = [...nextRequests, selectedCandidate];
            }
          } catch (selectedError) {
            console.warn('PostgreSQL selected rental request lookup failed:', selectedError);
          }
        }

        const counts = candidate.counts || {};
        setRequests(nextRequests);
        setTotalCount(Number(candidate.totalCount || 0));
        setHasNextPage(page * pageSize < Number(candidate.totalCount || 0));
        setTabCounts({
          [ADMIN_REQUEST_TAB.PENDING]: Number(counts.pending || 0),
          [ADMIN_REQUEST_TAB.RENTAL]: Number(counts.rental || 0),
          [ADMIN_REQUEST_TAB.CLOSED]: Number(counts.closed || 0),
          [ADMIN_REQUEST_TAB.RETURNED]: Number(counts.returned || 0),
        });
        setTabCountErrors(createDefaultTabCountErrors());
        setTabCountsReady(true);
        setTabCountCapacityLimited(false);
        setLoadErrorMessage('');
        setReady(true);
        publishAdminRentalRequestCutoverObservation({
          readRequested: true,
          readSource: 'postgresql',
          firestoreWatcher: 'disabled',
          bootstrapCount,
          totalCount: Number(candidate.totalCount || 0),
          page,
          pageSize,
          error: '',
        });
      } catch (error) {
        if (cancelled) return;
        console.error('PostgreSQL admin rental request read error:', error);
        const retirementEnabled = rentalWriteMirrorRetirementConfig.enabled;
        publishAdminRentalRequestCutoverObservation({
          readRequested: true,
          readSource: retirementEnabled ? 'unavailable' : 'firestore-fallback',
          firestoreWatcher: retirementEnabled ? 'disabled' : 'active',
          bootstrapCount: null,
          totalCount: null,
          error: error?.code || error?.message || 'admin-rental-request-read-failed',
        });
        if (retirementEnabled) {
          setPostgresFallbackActive(false);
          setRequests([]);
          setHasNextPage(false);
          setTotalCount(0);
          setLoadErrorMessage(
            'PostgreSQL 관리자 대여신청 조회에 실패했습니다. Phase 29에서는 오래된 Firestore 신청 목록으로 fallback하지 않습니다.'
          );
          setReady(true);
          return;
        }
        setPostgresFallbackActive(true);
        setLoadErrorMessage(
          'PostgreSQL 관리자 대여신청 조회에 실패해 기존 Firestore 조회로 전환했습니다.'
        );
        setReady(false);
      }
    };

    let refreshInFlight = false;
    let wasAwayFromWindow = false;
    const refreshPostgresRequests = () => {
      if (refreshInFlight || cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshInFlight = true;
      void loadPostgresRequests().finally(() => {
        refreshInFlight = false;
      });
    };
    const markWindowAway = () => {
      wasAwayFromWindow = true;
    };
    const refreshAfterWindowReturn = () => {
      if (!wasAwayFromWindow) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      wasAwayFromWindow = false;
      refreshPostgresRequests();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markWindowAway();
        return;
      }
      refreshAfterWindowReturn();
    };

    refreshPostgresRequests();
    window.addEventListener('blur', markWindowAway);
    window.addEventListener('focus', refreshAfterWindowReturn);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener('blur', markWindowAway);
      window.removeEventListener('focus', refreshAfterWindowReturn);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    debouncedQuery,
    enabled,
    mutationVersion,
    page,
    pageSize,
    postgresServerPaging,
    prerequisitesReady,
    rentalWriteMirrorRetirementConfig.enabled,
    quickFilter,
    referenceDate,
    requestTab,
    selectedRequestId,
  ]);

  useEffect(() => {
    if (!enabled) {
      setRequests([]);
      setReady(true);
      setLoadErrorMessage('');
      setHasNextPage(false);
      setTotalCount(0);
      setSelectedRequestId('');
      cursorKeyRef.current = '';
      cursorByPageRef.current = new Map([[1, null]]);
      return undefined;
    }

    if (!prerequisitesReady) {
      setReady(false);
      return undefined;
    }

    if (postgresServerPaging) return undefined;

    const normalizedSearch = String(debouncedQuery || '')
      .trim()
      .toLowerCase();

    if (normalizedSearch) return undefined;

    const baseConstraints = getAdminRequestServerConstraints({
      requestTab,
      quickFilter,
      referenceDate,
    });

    const cursorKey = [
      requestTab,
      quickFilter,
      pageSize,
      'browse',
    ].join('|');
    const cursorKeyChanged = cursorKeyRef.current !== cursorKey;

    if (cursorKeyChanged) {
      cursorKeyRef.current = cursorKey;
      cursorByPageRef.current = new Map([[1, null]]);
    }

    const pageCursor = cursorByPageRef.current.get(page);

    if (page > 1 && !pageCursor) {
      setPage(1);
      return undefined;
    }

    setReady(false);
    setLoadErrorMessage('');

    const requestSource = firestoreQuery(
      RENTAL_REQUESTS_COLLECTION_REF,
      ...baseConstraints,
      ...(pageCursor ? [startAfter(pageCursor)] : []),
      firestoreLimit(pageSize + 1)
    );

    const unsubscribe = onSnapshot(
      requestSource,
      (snapshot) => {
        const sourceDocs = snapshot.docs;
        const visibleDocs = sourceDocs.slice(0, pageSize);
        const nextHasNextPage = sourceDocs.length > pageSize;

        if (visibleDocs.length > 0) {
          cursorByPageRef.current.set(
            page + 1,
            visibleDocs[visibleDocs.length - 1]
          );
        }

        setRequests(
          visibleDocs.map((requestDoc) => ({
            ...requestDoc.data(),
            id: requestDoc.id,
          }))
        );
        setHasNextPage(nextHasNextPage);
        setLoadErrorMessage('');
        setReady(true);
      },
      (error) => {
        const message =
          '대여신청 목록을 불러오지 못했습니다. Firestore Rules와 필요한 인덱스를 확인해 주세요.';
        console.error('Paged rental requests sync error:', error);
        setRequests([]);
        setHasNextPage(false);
        setLoadErrorMessage(message);
        setReady(true);
        triggerToastRef.current?.(message, 'error');
      }
    );

    if (
      cursorKeyChanged &&
      quickFilter !== ADMIN_REQUEST_QUICK_FILTER.ALL
    ) {
      void getCountFromServer(
        firestoreQuery(
          RENTAL_REQUESTS_COLLECTION_REF,
          ...getAdminRequestCountConstraints({
            requestTab,
            quickFilter,
            referenceDate,
          })
        )
      )
        .then((countSnapshot) => {
          setTotalCount(countSnapshot.data().count);
        })
        .catch((error) => {
          console.error('Rental request count error:', error);
        });
    }

    return unsubscribe;
  }, [
    debouncedQuery,
    enabled,
    page,
    pageSize,
    prerequisitesReady,
    quickFilter,
    referenceDate,
    requestTab,
    postgresServerPaging,
  ]);

  useEffect(() => {
    const shouldLoadSelectedRequest = Boolean(
      enabled &&
        prerequisitesReady &&
        !postgresServerPaging &&
        selectedRequestId &&
        !requestsRef.current.some(
          (request) => request.id === selectedRequestId
        )
    );

    if (!shouldLoadSelectedRequest) return undefined;

    let cancelled = false;

    void getDoc(
      doc(RENTAL_REQUESTS_COLLECTION_REF, selectedRequestId)
    )
      .then((snapshot) => {
        if (cancelled || !snapshot.exists()) return;

        setRequests((currentRequests) => {
          if (
            currentRequests.some(
              (request) => request.id === selectedRequestId
            )
          ) {
            return currentRequests;
          }

          return [
            ...currentRequests,
            {
              ...snapshot.data(),
              id: snapshot.id,
            },
          ];
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Selected rental request read error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, postgresServerPaging, prerequisitesReady, selectedRequestId]);

  useEffect(() => {
    setPage(1);
    cursorByPageRef.current = new Map([[1, null]]);
  }, [pageSize, query, quickFilter, requestTab]);

  useEffect(() => {
    const normalizedFallbackCounts = createDefaultTabCounts();
    Object.keys(normalizedFallbackCounts).forEach((key) => {
      const fallbackValue = Number(fallbackTabCounts?.[key]);

      if (Number.isFinite(fallbackValue) && fallbackValue >= 0) {
        normalizedFallbackCounts[key] = fallbackValue;
      }
    });

    if (!enabled) {
      setTabCounts(createDefaultTabCounts());
      setTabCountErrors(createDefaultTabCountErrors());
      setTabCountsReady(true);
      setTabCountCapacityLimited(false);
      return undefined;
    }

    if (!prerequisitesReady) {
      setTabCountsReady(false);
      return undefined;
    }

    if (postgresServerPaging) return undefined;

    if (isFirestoreCapacityCoolingDown()) {
      setTabCounts(normalizedFallbackCounts);
      setTabCountErrors(
        Object.fromEntries(
          Object.keys(createDefaultTabCountErrors()).map((key) => [
            key,
            typeof normalizedFallbackCounts[key] !== 'number',
          ])
        )
      );
      setTabCountsReady(true);
      setTabCountCapacityLimited(true);
      return undefined;
    }

    let cancelled = false;

    setTabCounts(createDefaultTabCounts());
    setTabCountErrors(createDefaultTabCountErrors());
    setTabCountsReady(false);
    setTabCountCapacityLimited(false);

    const countRequests = [
      {
        key: ADMIN_REQUEST_TAB.PENDING,
        promise: getCountFromServer(
          firestoreQuery(
            RENTAL_REQUESTS_COLLECTION_REF,
            where('status', 'in', [STATUS.REQUESTED, STATUS.ON_HOLD])
          )
        ),
      },
      {
        key: ADMIN_REQUEST_TAB.RENTAL,
        promise: getCountFromServer(
          firestoreQuery(
            RENTAL_REQUESTS_COLLECTION_REF,
            where('status', '==', STATUS.APPROVED)
          )
        ),
      },
      {
        key: ADMIN_REQUEST_TAB.CLOSED,
        promise: getCountFromServer(
          firestoreQuery(
            RENTAL_REQUESTS_COLLECTION_REF,
            where('status', 'in', [STATUS.DENIED, STATUS.USER_CANCELLED])
          )
        ),
      },
      {
        key: ADMIN_REQUEST_TAB.RETURNED,
        promise: getCountFromServer(
          firestoreQuery(
            RENTAL_REQUESTS_COLLECTION_REF,
            where('status', '==', STATUS.RETURNED)
          )
        ),
      },
    ];

    void Promise.allSettled(
      countRequests.map(({ key, promise }) =>
        promise.then((countSnapshot) => ({
          count: countSnapshot.data().count,
          key,
        }))
      )
    ).then((results) => {
      if (cancelled) return;

      const nextCounts = createDefaultTabCounts();
      const nextErrors = createDefaultTabCountErrors();
      let capacityLimited = false;

      results.forEach((result, index) => {
        const key = countRequests[index].key;

        if (result.status === 'fulfilled') {
          nextCounts[key] = Number(result.value.count) || 0;
          return;
        }

        if (isFirestoreResourceExhaustedError(result.reason)) {
          markFirestoreCapacityExhausted(result.reason);
          capacityLimited = true;

          if (typeof normalizedFallbackCounts[key] === 'number') {
            nextCounts[key] = normalizedFallbackCounts[key];
            return;
          }
        }

        nextErrors[key] = true;
        console.error(
          `Rental request tab count error (${key}):`,
          result.reason
        );
      });

      setTabCounts(nextCounts);
      setTabCountErrors(nextErrors);
      setTabCountsReady(true);
      setTabCountCapacityLimited(capacityLimited);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, fallbackTabCounts, mutationVersion, postgresServerPaging, prerequisitesReady]);


  useEffect(() => {
    const currentTabCount = tabCounts[requestTab];

    if (
      enabled &&
      quickFilter === ADMIN_REQUEST_QUICK_FILTER.ALL &&
      !String(debouncedQuery || '').trim() &&
      typeof currentTabCount === 'number'
    ) {
      setTotalCount(currentTabCount);
    }
  }, [debouncedQuery, enabled, quickFilter, requestTab, tabCounts]);

  const filteredRequests = useMemo(() => {
    const normalizedQuery = String(query || '').trim().toLowerCase();

    const getStatusLogTime = (request) =>
      getFirestoreTimestampMillis(request.updatedAt) ||
      getFirestoreTimestampMillis(request.createdAt) ||
      Date.parse(request.requestedAt || '') ||
      0;

    const tabFilteredRequests = requests.filter((request) => {
      if (requestTab === ADMIN_REQUEST_TAB.PENDING) {
        return [STATUS.REQUESTED, STATUS.ON_HOLD].includes(request.status);
      }

      if (requestTab === ADMIN_REQUEST_TAB.RENTAL) {
        return request.status === STATUS.APPROVED;
      }

      if (requestTab === ADMIN_REQUEST_TAB.CLOSED) {
        return [STATUS.DENIED, STATUS.USER_CANCELLED].includes(
          request.status
        );
      }

      return request.status === STATUS.RETURNED;
    });

    const quickFilterSourceRequests =
      quickFilter === ADMIN_REQUEST_QUICK_FILTER.PENDING_USER_ACTION
        ? requests
        : tabFilteredRequests;

    const quickFilteredRequests =
      quickFilter === ADMIN_REQUEST_QUICK_FILTER.ALL
        ? tabFilteredRequests
        : quickFilterSourceRequests.filter((request) => {
            if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.OVERDUE) {
              return (
                request.status === STATUS.APPROVED &&
                (!request.startDate || request.startDate <= referenceDate) &&
                Boolean(request.dueDate) &&
                request.dueDate < referenceDate
              );
            }

            if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.DUE_TODAY) {
              return (
                request.status === STATUS.APPROVED &&
                (!request.startDate || request.startDate <= referenceDate) &&
                request.dueDate === referenceDate
              );
            }

            if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.START_TODAY) {
              return (
                request.status === STATUS.APPROVED &&
                request.startDate === referenceDate
              );
            }

            if (
              quickFilter === ADMIN_REQUEST_QUICK_FILTER.PENDING_USER_ACTION
            ) {
              return (
                request.userActionRequest?.status ===
                USER_REQUEST_REVIEW_STATUS.PENDING
              );
            }

            if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.REQUESTED) {
              return request.status === STATUS.REQUESTED;
            }

            if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.ON_HOLD) {
              return request.status === STATUS.ON_HOLD;
            }

            if (quickFilter === ADMIN_REQUEST_QUICK_FILTER.RESERVED) {
              return (
                request.status === STATUS.APPROVED &&
                Boolean(request.startDate) &&
                request.startDate > referenceDate
              );
            }

            return true;
          });

    const queryFilteredRequests = normalizedQuery
      ? quickFilteredRequests.filter((request) =>
          [
            request.id,
            request.assetNo,
            request.assetCategory,
            request.requesterName,
            request.requesterEmail,
            request.borrower,
            request.team,
            request.purpose,
          ]
            .map((value) => String(value || '').toLowerCase())
            .some((value) => value.includes(normalizedQuery))
        )
      : quickFilteredRequests;

    return [...queryFilteredRequests].sort((first, second) => {
      if (requestTab === ADMIN_REQUEST_TAB.PENDING) {
        return getStatusLogTime(first) - getStatusLogTime(second);
      }

      if (requestTab === ADMIN_REQUEST_TAB.RENTAL) {
        const firstOverdue = first.dueDate && first.dueDate < referenceDate;
        const secondOverdue = second.dueDate && second.dueDate < referenceDate;

        if (firstOverdue !== secondOverdue) {
          return firstOverdue ? -1 : 1;
        }

        return String(first.dueDate || '').localeCompare(
          String(second.dueDate || '')
        );
      }

      return getStatusLogTime(second) - getStatusLogTime(first);
    });
  }, [query, quickFilter, referenceDate, requestTab, requests]);

  const searchMode = Boolean(String(query || '').trim());
  const currentTabCountAvailable =
    typeof tabCounts[requestTab] === 'number';
  const totalPages = postgresServerPaging
    ? Math.max(1, Math.ceil(totalCount / pageSize))
    : searchMode
      ? Math.max(1, Math.ceil(filteredRequests.length / pageSize))
      : currentTabCountAvailable
        ? Math.max(1, Math.ceil(totalCount / pageSize))
        : Math.max(1, page + (hasNextPage ? 1 : 0));
  const safePage = Math.min(page, totalPages);
  const paginatedRequests = postgresServerPaging
    ? filteredRequests
    : searchMode
      ? filteredRequests.slice(
          (safePage - 1) * pageSize,
          safePage * pageSize
        )
      : filteredRequests;
  const selectedRequest = selectedRequestId
    ? requests.find((request) => request.id === selectedRequestId) || null
    : null;
  const requestIdSet = new Set(
    requests.map((request) => request?.id).filter(Boolean)
  );

  return {
    adminRequestHasNextPage: hasNextPage,
    adminRequestPageSize: pageSize,
    adminRequestQuery: query,
    adminRequestQuickFilter: quickFilter,
    adminRequestTab: requestTab,
    adminRequestTabCountErrors: tabCountErrors,
    adminRequestTabCountCapacityLimited: tabCountCapacityLimited,
    adminRequestTabCounts: tabCounts,
    adminRequestTabCountsReady: tabCountsReady,
    adminRequestTotalPages: totalPages,
    filteredAdminRequests: filteredRequests,
    mergedRentalRequests: requests,
    paginatedAdminRequests: paginatedRequests,
    rentalRequestIdSet: requestIdSet,
    rentalRequestsLoadErrorMessage: loadErrorMessage,
    rentalRequestsReady: ready,
    resetAdminRequestPage: resetPage,
    safeAdminRequestPage: safePage,
    selectedAdminRequest: selectedRequest,
    selectedAdminRequestId: selectedRequestId,
    setAdminRequestPage: setPage,
    setAdminRequestPageSize: setPageSize,
    setAdminRequestQuery: setQuery,
    setAdminRequestQuickFilter: setQuickFilter,
    setAdminRequestTab: setRequestTab,
    setSelectedAdminRequestId: setSelectedRequestId,
  };
}
