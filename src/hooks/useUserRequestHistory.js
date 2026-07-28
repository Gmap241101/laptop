import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCountFromServer,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query as firestoreQuery,
  startAfter,
  where,
} from 'firebase/firestore';

import { RENTAL_REQUESTS_COLLECTION_REF } from '../firebase.js';
import { ADMIN_REQUEST_TAB, STATUS } from '../constants/appConstants.js';
import { useDebouncedValue } from './useDebouncedValue.js';

const USER_HISTORY_SEARCH_LIMIT = 200;

const getHistoryStatusConstraints = (requestTab) => {
  if (requestTab === ADMIN_REQUEST_TAB.CLOSED) {
    return [where('status', 'in', [STATUS.DENIED, STATUS.USER_CANCELLED])];
  }

  return [where('status', '==', STATUS.RETURNED)];
};

export default function useUserRequestHistory({
  enabled,
  userUid,
  requestTab,
  requestPage,
  requestPageSize,
  requestQuery,
  setRequestPage,
}) {
  const [historyRequests, setHistoryRequests] = useState([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyErrorMessage, setHistoryErrorMessage] = useState('');
  const [historyHasNextPage, setHistoryHasNextPage] = useState(false);
  const [historyCounts, setHistoryCounts] = useState({
    [ADMIN_REQUEST_TAB.CLOSED]: 0,
    [ADMIN_REQUEST_TAB.RETURNED]: 0,
  });
  const [historyCountsReady, setHistoryCountsReady] = useState(false);
  const cursorByPageRef = useRef(new Map([[1, null]]));
  const cursorKeyRef = useRef('');
  const debouncedRequestQuery = useDebouncedValue(requestQuery, 350);
  const normalizedQuery = String(debouncedRequestQuery || '').trim().toLowerCase();
  const searchMode = Boolean(normalizedQuery);
  const historyTab = [
    ADMIN_REQUEST_TAB.CLOSED,
    ADMIN_REQUEST_TAB.RETURNED,
  ].includes(requestTab);
  const countRefreshKey = historyTab ? requestTab : 'active';

  useEffect(() => {
    if (!enabled || !userUid) {
      setHistoryCounts({
        [ADMIN_REQUEST_TAB.CLOSED]: 0,
        [ADMIN_REQUEST_TAB.RETURNED]: 0,
      });
      setHistoryCountsReady(true);
      return undefined;
    }

    let cancelled = false;
    setHistoryCountsReady(false);

    void Promise.all([
      getCountFromServer(
        firestoreQuery(
          RENTAL_REQUESTS_COLLECTION_REF,
          where('requesterUid', '==', userUid),
          where('status', 'in', [STATUS.DENIED, STATUS.USER_CANCELLED])
        )
      ),
      getCountFromServer(
        firestoreQuery(
          RENTAL_REQUESTS_COLLECTION_REF,
          where('requesterUid', '==', userUid),
          where('status', '==', STATUS.RETURNED)
        )
      ),
    ])
      .then(([closedSnapshot, returnedSnapshot]) => {
        if (cancelled) return;
        setHistoryCounts({
          [ADMIN_REQUEST_TAB.CLOSED]: closedSnapshot.data().count,
          [ADMIN_REQUEST_TAB.RETURNED]: returnedSnapshot.data().count,
        });
        setHistoryCountsReady(true);
      })
      .catch((error) => {
        console.error('User rental history counts error:', error);
        if (cancelled) return;
        setHistoryCountsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, userUid, countRefreshKey]);

  useEffect(() => {
    if (!enabled || !userUid || !historyTab) {
      cursorKeyRef.current = '';
      cursorByPageRef.current = new Map([[1, null]]);
      setHistoryRequests([]);
      setHistoryErrorMessage('');
      setHistoryHasNextPage(false);
      setHistoryReady(true);
      return undefined;
    }

    const cursorKey = [
      userUid,
      requestTab,
      requestPageSize,
      searchMode ? 'search' : 'browse',
    ].join('|');
    const cursorKeyChanged = cursorKeyRef.current !== cursorKey;

    if (cursorKeyChanged) {
      cursorKeyRef.current = cursorKey;
      cursorByPageRef.current = new Map([[1, null]]);
    }

    const pageCursor = cursorByPageRef.current.get(requestPage);
    if (!searchMode && requestPage > 1 && !pageCursor) {
      setRequestPage(1);
      return undefined;
    }

    let cancelled = false;
    setHistoryReady(false);
    setHistoryErrorMessage('');

    const source = firestoreQuery(
      RENTAL_REQUESTS_COLLECTION_REF,
      where('requesterUid', '==', userUid),
      ...getHistoryStatusConstraints(requestTab),
      orderBy('createdAt', 'desc'),
      ...(!searchMode && pageCursor ? [startAfter(pageCursor)] : []),
      firestoreLimit(searchMode ? USER_HISTORY_SEARCH_LIMIT : requestPageSize + 1)
    );

    void getDocs(source)
      .then((snapshot) => {
        if (cancelled) return;
        const sourceDocs = snapshot.docs;
        const visibleDocs = searchMode
          ? sourceDocs
          : sourceDocs.slice(0, requestPageSize);
        const hasNext = !searchMode && sourceDocs.length > requestPageSize;

        if (!searchMode && visibleDocs.length > 0) {
          cursorByPageRef.current.set(
            requestPage + 1,
            visibleDocs[visibleDocs.length - 1]
          );
        }

        setHistoryRequests(
          visibleDocs.map((requestDoc) => ({
            ...requestDoc.data(),
            id: requestDoc.id,
          }))
        );
        setHistoryHasNextPage(hasNext);
        setHistoryReady(true);
      })
      .catch((error) => {
        console.error('User rental history page read error:', error);
        if (cancelled) return;
        setHistoryRequests([]);
        setHistoryHasNextPage(false);
        setHistoryErrorMessage(
          '과거 대여 신청내역을 불러오지 못했습니다. Firestore 인덱스와 조회 권한을 확인해 주세요.'
        );
        setHistoryReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    userUid,
    historyTab,
    requestTab,
    requestPage,
    requestPageSize,
    searchMode,
    setRequestPage,
  ]);

  const filteredHistoryRequests = useMemo(() => {
    if (!searchMode) return historyRequests;

    return historyRequests.filter((request) =>
      [
        request.assetNo,
        request.assetCategory,
        request.startDate,
        request.dueDate,
        request.purpose,
        request.status,
      ]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(normalizedQuery))
    );
  }, [historyRequests, normalizedQuery, searchMode]);

  return {
    filteredHistoryRequests,
    historyCounts,
    historyCountsReady,
    historyErrorMessage,
    historyHasNextPage,
    historyReady,
    historySearchMode: searchMode,
    historyTab,
    historyTotalCount: Number(historyCounts[requestTab]) || 0,
    historySearchLimit: USER_HISTORY_SEARCH_LIMIT,
  };
}
