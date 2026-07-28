import { useEffect, useRef } from 'react';
import { orderBy, where } from 'firebase/firestore';

import {
  DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
  scanFirestoreMatches,
} from '../../services/progressiveFirestoreSearch.js';
import { richTextHtmlToText } from '../../utils/richTextCore.js';

const createEmptyBoardSearchCache = (key) => ({
  key,
  pinned: {
    cursor: null,
    exhausted: false,
    matches: [],
  },
  regular: {
    cursor: null,
    exhausted: false,
    matches: [],
  },
});

const matchesBoardPost = (post, normalizedSearch) =>
  String(post.title || '')
    .toLowerCase()
    .includes(normalizedSearch) ||
  String(
    post.contentText ||
      post.content ||
      richTextHtmlToText(post.contentHtml || '')
  )
    .toLowerCase()
    .includes(normalizedSearch);

export default function useBoardProgressiveSearch({
  enabled,
  collectionRef,
  searchKey,
  searchQuery,
  activePage,
  postsPerPage,
  pinnedBatchSize,
  categoryId = '',
  errorMessage,
  errorLogLabel,
  setPinnedPosts,
  setRegularPagePosts,
  setRegularTotalCount,
  setHasNextPage,
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

    const previousCache = searchCacheRef.current;
    const cache =
      previousCache?.key === searchKey
        ? previousCache
        : createEmptyBoardSearchCache(searchKey);
    const categoryConstraints = categoryId
      ? [where('categoryId', '==', categoryId)]
      : [];

    searchCacheRef.current = cache;
    let cancelled = false;

    setReady(false);
    setLoadErrorMessage('');

    void Promise.all([
      scanFirestoreMatches({
        collectionRef,
        constraints: [
          ...categoryConstraints,
          where('isPinned', '==', true),
          orderBy('createdAt', 'desc'),
        ],
        startCursor: cache.pinned.cursor,
        existingMatches: cache.pinned.matches,
        targetMatchCount: Number.POSITIVE_INFINITY,
        batchSize: pinnedBatchSize,
        mapDocument: (postDoc) => ({
          ...postDoc.data(),
          id: postDoc.id,
        }),
        matchesDocument: (post) =>
          matchesBoardPost(post, normalizedSearch),
        isCancelled: () => cancelled,
      }),
      scanFirestoreMatches({
        collectionRef,
        constraints: [
          ...categoryConstraints,
          where('isPinned', '==', false),
          orderBy('createdAt', 'desc'),
        ],
        startCursor: cache.regular.cursor,
        existingMatches: cache.regular.matches,
        targetMatchCount: activePage * postsPerPage + 1,
        batchSize: DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
        mapDocument: (postDoc) => ({
          ...postDoc.data(),
          id: postDoc.id,
        }),
        matchesDocument: (post) =>
          matchesBoardPost(post, normalizedSearch),
        isCancelled: () => cancelled,
      }),
    ])
      .then(([pinnedResult, regularResult]) => {
        if (
          cancelled ||
          pinnedResult.cancelled ||
          regularResult.cancelled
        ) {
          return;
        }

        searchCacheRef.current = {
          key: searchKey,
          pinned: {
            cursor: pinnedResult.cursor,
            exhausted: pinnedResult.exhausted,
            matches: pinnedResult.matches,
          },
          regular: {
            cursor: regularResult.cursor,
            exhausted: regularResult.exhausted,
            matches: regularResult.matches,
          },
        };
        setPinnedPosts(pinnedResult.matches);
        setRegularPagePosts(regularResult.matches);
        setRegularTotalCount(regularResult.matches.length);
        setHasNextPage(
          regularResult.matches.length > activePage * postsPerPage ||
            !regularResult.exhausted
        );
        setLoadErrorMessage('');
        setReady(true);
      })
      .catch((error) => {
        if (cancelled) return;

        console.error(errorLogLabel, error);
        setPinnedPosts([]);
        setRegularPagePosts([]);
        setHasNextPage(false);
        setLoadErrorMessage(errorMessage);
        setReady(true);
        triggerToast(errorMessage, 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [
    activePage,
    categoryId,
    collectionRef,
    enabled,
    errorLogLabel,
    errorMessage,
    pinnedBatchSize,
    postsPerPage,
    searchKey,
    searchQuery,
  ]);
}
