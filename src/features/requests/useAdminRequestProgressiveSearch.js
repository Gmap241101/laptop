import { useEffect, useRef } from 'react';

import { RENTAL_REQUESTS_COLLECTION_REF } from '../../platform/appDataRefs.js';
import { getAdminRequestServerConstraints } from '../../services/adminRequestQuery.js';
import {
  DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
  scanFirestoreMatches,
} from '../../services/progressiveFirestoreSearch.js';

const createEmptySearchCache = (key) => ({
  key,
  cursor: null,
  exhausted: false,
  matches: [],
});

const matchesAdminRequestSearch = (request, normalizedSearch) =>
  [
    request.assetNo,
    request.assetCategory,
    request.requesterName,
    request.requesterEmail,
    request.borrower,
    request.team,
    request.purpose,
  ].some((value) =>
    String(value || '')
      .toLowerCase()
      .includes(normalizedSearch)
  );

export default function useAdminRequestProgressiveSearch({
  enabled,
  requestTab,
  quickFilter,
  searchQuery,
  serverPage,
  pageSize,
  referenceDate,
  setRequests,
  setHasNextPage,
  setTotalCount,
  setLoadErrorMessage,
  setReady,
  triggerToast,
}) {
  const searchCacheRef = useRef(null);

  useEffect(() => {
    const normalizedSearch = String(searchQuery || '')
      .trim()
      .toLowerCase();

    if (!enabled || !normalizedSearch) {
      searchCacheRef.current = null;
      return undefined;
    }

    const searchKey = [requestTab, quickFilter, normalizedSearch].join('|');
    const previousCache = searchCacheRef.current;
    const cache =
      previousCache?.key === searchKey
        ? previousCache
        : createEmptySearchCache(searchKey);

    searchCacheRef.current = cache;
    let cancelled = false;

    setReady(false);
    setLoadErrorMessage('');

    void scanFirestoreMatches({
      collectionRef: RENTAL_REQUESTS_COLLECTION_REF,
      constraints: getAdminRequestServerConstraints({
        requestTab,
        quickFilter,
        referenceDate,
      }),
      startCursor: cache.cursor,
      existingMatches: cache.matches,
      targetMatchCount: serverPage * pageSize + 1,
      batchSize: DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
      mapDocument: (requestDoc) => ({
        ...requestDoc.data(),
        id: requestDoc.id,
      }),
      matchesDocument: (request) =>
        matchesAdminRequestSearch(request, normalizedSearch),
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
        setRequests(result.matches);
        setHasNextPage(
          result.matches.length > serverPage * pageSize || !result.exhausted
        );
        setTotalCount(result.matches.length);
        setLoadErrorMessage('');
        setReady(true);
      })
      .catch((error) => {
        if (cancelled) return;

        const message =
          '대여신청 검색 결과를 불러오지 못했습니다. Firestore Rules와 필요한 인덱스를 확인해 주세요.';
        console.error('Rental request progressive search error:', error);
        setRequests([]);
        setHasNextPage(false);
        setLoadErrorMessage(message);
        setReady(true);
        triggerToast(message, 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    pageSize,
    quickFilter,
    referenceDate,
    requestTab,
    searchQuery,
    serverPage,
  ]);
}
