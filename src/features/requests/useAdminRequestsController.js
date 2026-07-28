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
} from 'firebase/firestore';

import {
  RENTAL_REQUESTS_COLLECTION_REF,
} from '../../firebase.js';
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
import useAdminRequestProgressiveSearch from './useAdminRequestProgressiveSearch.js';

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
  [ADMIN_REQUEST_TAB.PENDING]: 0,
  [ADMIN_REQUEST_TAB.RENTAL]: 0,
  [ADMIN_REQUEST_TAB.CLOSED]: 0,
  [ADMIN_REQUEST_TAB.RETURNED]: 0,
});

export default function useAdminRequestsController({
  enabled,
  mutationVersion = 0,
  navigationRequest,
  onControllerStateChange,
  prerequisitesReady,
  selectedRequestId,
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

  const cursorByPageRef = useRef(new Map([[1, null]]));
  const cursorKeyRef = useRef('');
  const requestsRef = useRef(requests);
  const triggerToastRef = useRef(triggerToast);

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
      getRequestById,
      resetPage,
      updateRequests,
    });

    return () => {
      onControllerStateChange(null);
    };
  }, [getRequestById, onControllerStateChange, resetPage, updateRequests]);

  const progressiveSearchEnabled = Boolean(
    enabled &&
      prerequisitesReady &&
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
    if (!enabled) {
      setRequests([]);
      setReady(true);
      setLoadErrorMessage('');
      setHasNextPage(false);
      setTotalCount(0);
      cursorKeyRef.current = '';
      cursorByPageRef.current = new Map([[1, null]]);
      return undefined;
    }

    if (!prerequisitesReady) {
      setReady(false);
      return undefined;
    }

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
  ]);

  useEffect(() => {
    const shouldLoadSelectedRequest = Boolean(
      enabled &&
        prerequisitesReady &&
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
  }, [enabled, prerequisitesReady, selectedRequestId]);

  useEffect(() => {
    setPage(1);
    cursorByPageRef.current = new Map([[1, null]]);
  }, [pageSize, query, quickFilter, requestTab]);

  useEffect(() => {
    if (!enabled || !prerequisitesReady) return undefined;

    let cancelled = false;

    void Promise.all([
      [
        ADMIN_REQUEST_TAB.PENDING,
        getCountFromServer(
          firestoreQuery(
            RENTAL_REQUESTS_COLLECTION_REF,
            where('status', 'in', [STATUS.REQUESTED, STATUS.ON_HOLD])
          )
        ),
      ],
      [
        ADMIN_REQUEST_TAB.RENTAL,
        getCountFromServer(
          firestoreQuery(
            RENTAL_REQUESTS_COLLECTION_REF,
            where('status', '==', STATUS.APPROVED)
          )
        ),
      ],
      [
        ADMIN_REQUEST_TAB.CLOSED,
        getCountFromServer(
          firestoreQuery(
            RENTAL_REQUESTS_COLLECTION_REF,
            where('status', 'in', [STATUS.DENIED, STATUS.USER_CANCELLED])
          )
        ),
      ],
      [
        ADMIN_REQUEST_TAB.RETURNED,
        getCountFromServer(
          firestoreQuery(
            RENTAL_REQUESTS_COLLECTION_REF,
            where('status', '==', STATUS.RETURNED)
          )
        ),
      ],
    ])
      .then((entries) => {
        if (cancelled) return;

        setTabCounts(
          Object.fromEntries(
            entries.map(([key, countSnapshot]) => [
              key,
              countSnapshot.data().count,
            ])
          )
        );
      })
      .catch((error) => {
        console.error('Rental request tab counts error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, mutationVersion, prerequisitesReady]);

  useEffect(() => {
    if (
      enabled &&
      quickFilter === ADMIN_REQUEST_QUICK_FILTER.ALL &&
      !String(debouncedQuery || '').trim()
    ) {
      setTotalCount(Number(tabCounts[requestTab]) || 0);
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
  const totalPages = Math.max(
    1,
    Math.ceil(
      (searchMode ? filteredRequests.length : totalCount) / pageSize
    )
  );
  const safePage = Math.min(page, totalPages);
  const paginatedRequests = searchMode
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
    adminRequestTabCounts: tabCounts,
    adminRequestTotalPages: totalPages,
    filteredAdminRequests: filteredRequests,
    mergedRentalRequests: requests,
    paginatedAdminRequests: paginatedRequests,
    rentalRequestIdSet: requestIdSet,
    rentalRequestsLoadErrorMessage: loadErrorMessage,
    rentalRequestsReady: ready,
    safeAdminRequestPage: safePage,
    selectedAdminRequest: selectedRequest,
    setAdminRequestPage: setPage,
    setAdminRequestPageSize: setPageSize,
    setAdminRequestQuery: setQuery,
    setAdminRequestQuickFilter: setQuickFilter,
    setAdminRequestTab: setRequestTab,
  };
}
