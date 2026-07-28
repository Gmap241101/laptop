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
import {
  DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
  scanFirestoreMatches,
} from '../services/progressiveFirestoreSearch.js';

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
  const searchCacheRef = useRef(null);
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
      searchCacheRef.current = null;
      setHistoryRequests([]);
      setHistoryErrorMessage('');
      setHistoryHasNextPage(false);
      setHistoryReady(true);
      return undefined;
    }

    const baseConstraints = [
      where('requesterUid', '==', userUid),
      ...getHistoryStatusConstraints(requestTab),
      orderBy('createdAt', 'desc'),
    ];

    if (searchMode) {
      const searchKey = [userUid, requestTab, normalizedQuery].join('|');
      const previousCache = searchCacheRef.current;
      const cache =
        previousCache?.key === searchKey
          ? previousCache
          : { key: searchKey, cursor: null, exhausted: false, matches: [] };

      searchCacheRef.current = cache;
      let cancelled = false;
      setHistoryReady(false);
      setHistoryErrorMessage('');

      void scanFirestoreMatches({
        collectionRef: RENTAL_REQUESTS_COLLECTION_REF,
        constraints: baseConstraints,
        startCursor: cache.cursor,
        existingMatches: cache.matches,
        targetMatchCount: requestPage * requestPageSize + 1,
        batchSize: DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
        mapDocument: (requestDoc) => ({ ...requestDoc.data(), id: requestDoc.id }),
        matchesDocument: (request) =>
          [request.assetNo, request.assetCategory, request.startDate, request.dueDate, request.purpose, request.status]
            .map((value) => String(value || '').toLowerCase())
            .some((value) => value.includes(normalizedQuery)),
        isCancelled: () => cancelled,
      })
        .then((result) => {
          if (cancelled || result.cancelled) return;
          searchCacheRef.current = {
            key: searchKey,
            cursor: result.cursor,
            exhausted: result.exhausted,
            matches: result.matches,
          };
          setHistoryRequests(result.matches);
          setHistoryHasNextPage(
            result.matches.length > requestPage * requestPageSize || !result.exhausted
          );
          setHistoryReady(true);
        })
        .catch((error) => {
          console.error('User rental history progressive search error:', error);
          if (cancelled) return;
          setHistoryRequests([]);
          setHistoryHasNextPage(false);
          setHistoryErrorMessage(
            '과거 대여 신청내역 검색 결과를 불러오지 못했습니다. Firestore 인덱스와 조회 권한을 확인해 주세요.'
          );
          setHistoryReady(true);
        });

      return () => {
        cancelled = true;
      };
    }

    searchCacheRef.current = null;
    const cursorKey = [userUid, requestTab, requestPageSize, 'browse'].join('|');
    const cursorKeyChanged = cursorKeyRef.current !== cursorKey;

    if (cursorKeyChanged) {
      cursorKeyRef.current = cursorKey;
      cursorByPageRef.current = new Map([[1, null]]);
    }

    const pageCursor = cursorByPageRef.current.get(requestPage);
    if (requestPage > 1 && !pageCursor) {
      setRequestPage(1);
      return undefined;
    }

    let cancelled = false;
    setHistoryReady(false);
    setHistoryErrorMessage('');

    const source = firestoreQuery(
      RENTAL_REQUESTS_COLLECTION_REF,
      ...baseConstraints,
      ...(pageCursor ? [startAfter(pageCursor)] : []),
      firestoreLimit(requestPageSize + 1)
    );

    void getDocs(source)
      .then((snapshot) => {
        if (cancelled) return;
        const sourceDocs = snapshot.docs;
        const visibleDocs = sourceDocs.slice(0, requestPageSize);
        const hasNext = sourceDocs.length > requestPageSize;
        if (visibleDocs.length > 0) {
          cursorByPageRef.current.set(requestPage + 1, visibleDocs[visibleDocs.length - 1]);
        }
        setHistoryRequests(
          visibleDocs.map((requestDoc) => ({ ...requestDoc.data(), id: requestDoc.id }))
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
    normalizedQuery,
    searchMode,
    setRequestPage,
  ]);


  const filteredHistoryRequests = useMemo(
    () => historyRequests,
    [historyRequests]
  );

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
    historySearchHasMore: historyHasNextPage,
  };
}
