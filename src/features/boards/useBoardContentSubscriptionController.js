import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query as firestoreQuery,
  runTransaction,
  startAfter,
  where,
} from '../../platform/retiredLegacyDataCompat.js';

import {
  FAQ_BOARD_CONFIG_DOC_REF,
  FAQ_CATEGORIES_COLLECTION_REF,
  FAQ_POSTS_COLLECTION_REF,
  NOTICE_BOARD_CONFIG_DOC_REF,
  NOTICE_POSTS_COLLECTION_REF,
  db,
} from '../../platform/appDataRefs.js';
import {
  DEFAULT_FAQ_POSTS_PER_PAGE,
  DEFAULT_NOTICE_POSTS_PER_PAGE,
} from '../../constants/appConstants.js';
import { richTextHtmlToText } from '../../utils/richTextCore.js';
import useBoardProgressiveSearch from './useBoardProgressiveSearch.js';
import {
  incrementNoticePostView,
  publishBoardContentObservation,
  readBoardContentCutoverConfig,
  requestFaqBoard,
  requestNoticeBoard,
  requestNoticePost,
  subscribeBoardContentRefresh,
} from './boardContentCutover.js';
import {
  isLegacyFirestoreReadFallbackAllowed,
  readLegacyFirestoreReadFallbackConfig,
  recordLegacyFirestoreReadFallbackBlocked,
} from '../compatibility/legacyFirestoreReadFallbackCutover.js';

const FIRESTORE_PINNED_POST_LIMIT = 20;

export const getSafeNoticePostsPerPage = (value) => {
  const parsedValue = Math.trunc(Number(value));

  return parsedValue >= 5 && parsedValue <= 50
    ? parsedValue
    : DEFAULT_NOTICE_POSTS_PER_PAGE;
};

export const filterNoticePostsByQuery = (posts = [], queryText = '') => {
  const normalizedQuery = String(queryText || '')
    .trim()
    .toLowerCase();

  if (!normalizedQuery) {
    return posts;
  }

  return posts.filter(
    (post) =>
      String(post.title || '')
        .toLowerCase()
        .includes(normalizedQuery) ||
      String(
        post.contentText ||
          post.content ||
          richTextHtmlToText(post.contentHtml || '')
      )
        .toLowerCase()
        .includes(normalizedQuery)
  );
};

export const getSafeFaqPostsPerPage = (value) => {
  const parsedValue = Math.trunc(Number(value));

  return parsedValue >= 5 && parsedValue <= 50
    ? parsedValue
    : DEFAULT_FAQ_POSTS_PER_PAGE;
};

export const useBoardContentSubscriptionState = () => {
  const [noticePinnedPosts, setNoticePinnedPosts] = useState([]);
  const [noticeRegularPagePosts, setNoticeRegularPagePosts] = useState([]);
  const [noticeHasNextPage, setNoticeHasNextPage] = useState(false);
  const [noticeRegularTotalCount, setNoticeRegularTotalCount] = useState(0);
  const noticeCursorByPageRef = useRef(new Map([[1, null]]));
  const noticeCursorKeyRef = useRef('');
  const [noticePostsReady, setNoticePostsReady] = useState(false);
  const [noticePostsLoadErrorMessage, setNoticePostsLoadErrorMessage] =
    useState('');
  const [noticeBoardConfig, setNoticeBoardConfig] = useState({
    postsPerPage: DEFAULT_NOTICE_POSTS_PER_PAGE,
  });
  const [noticeBoardConfigReady, setNoticeBoardConfigReady] = useState(false);
  const [noticeBoardConfigLoadErrorMessage, setNoticeBoardConfigLoadErrorMessage] =
    useState('');
  const [selectedNoticePostId, setSelectedNoticePostId] = useState('');
  const [selectedNoticePostOverride, setSelectedNoticePostOverride] =
    useState(null);
  const [noticePage, setNoticePage] = useState(1);
  const [adminNoticePage, setAdminNoticePage] = useState(1);
  const [userNoticeQuery, setUserNoticeQuery] = useState('');
  const [adminNoticeQuery, setAdminNoticeQuery] = useState('');

  const [faqCategories, setFaqCategories] = useState([]);
  const [faqCategoriesReady, setFaqCategoriesReady] = useState(false);
  const [faqCategoriesLoadErrorMessage, setFaqCategoriesLoadErrorMessage] =
    useState('');
  const [faqPinnedPosts, setFaqPinnedPosts] = useState([]);
  const [faqRegularPagePosts, setFaqRegularPagePosts] = useState([]);
  const [faqHasNextPage, setFaqHasNextPage] = useState(false);
  const [faqRegularTotalCount, setFaqRegularTotalCount] = useState(0);
  const faqCursorByPageRef = useRef(new Map([[1, null]]));
  const faqCursorKeyRef = useRef('');
  const [faqPostsReady, setFaqPostsReady] = useState(false);
  const [faqPostsLoadErrorMessage, setFaqPostsLoadErrorMessage] = useState('');
  const [faqBoardConfig, setFaqBoardConfig] = useState({
    postsPerPage: DEFAULT_FAQ_POSTS_PER_PAGE,
  });
  const [faqBoardConfigReady, setFaqBoardConfigReady] = useState(false);
  const [faqBoardConfigLoadErrorMessage, setFaqBoardConfigLoadErrorMessage] =
    useState('');
  const [activeFaqCategoryId, setActiveFaqCategoryId] = useState('all');
  const [faqQuery, setFaqQuery] = useState('');
  const [faqSearchWithinCategory, setFaqSearchWithinCategory] = useState(false);
  const [expandedFaqPostId, setExpandedFaqPostId] = useState('');
  const [adminExpandedFaqPostId, setAdminExpandedFaqPostId] = useState('');
  const [faqPage, setFaqPage] = useState(1);
  const [adminFaqPage, setAdminFaqPage] = useState(1);

  const noticePosts = useMemo(
    () => [...(noticePinnedPosts || []), ...(noticeRegularPagePosts || [])],
    [noticePinnedPosts, noticeRegularPagePosts]
  );
  const faqPosts = useMemo(
    () => [...(faqPinnedPosts || []), ...(faqRegularPagePosts || [])],
    [faqPinnedPosts, faqRegularPagePosts]
  );

  return {
    activeFaqCategoryId,
    adminExpandedFaqPostId,
    adminFaqPage,
    adminNoticePage,
    adminNoticeQuery,
    expandedFaqPostId,
    faqBoardConfig,
    faqBoardConfigLoadErrorMessage,
    faqBoardConfigReady,
    faqCategories,
    faqCategoriesLoadErrorMessage,
    faqCategoriesReady,
    faqCursorByPageRef,
    faqCursorKeyRef,
    faqHasNextPage,
    faqPage,
    faqPinnedPosts,
    faqPosts,
    faqPostsLoadErrorMessage,
    faqPostsReady,
    faqQuery,
    faqRegularPagePosts,
    faqRegularTotalCount,
    faqSearchWithinCategory,
    noticeBoardConfig,
    noticeBoardConfigLoadErrorMessage,
    noticeBoardConfigReady,
    noticeCursorByPageRef,
    noticeCursorKeyRef,
    noticeHasNextPage,
    noticePage,
    noticePinnedPosts,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsReady,
    noticeRegularPagePosts,
    noticeRegularTotalCount,
    selectedNoticePostId,
    selectedNoticePostOverride,
    setActiveFaqCategoryId,
    setAdminExpandedFaqPostId,
    setAdminFaqPage,
    setAdminNoticePage,
    setAdminNoticeQuery,
    setExpandedFaqPostId,
    setFaqBoardConfig,
    setFaqBoardConfigLoadErrorMessage,
    setFaqBoardConfigReady,
    setFaqCategories,
    setFaqCategoriesLoadErrorMessage,
    setFaqCategoriesReady,
    setFaqHasNextPage,
    setFaqPage,
    setFaqPinnedPosts,
    setFaqPostsLoadErrorMessage,
    setFaqPostsReady,
    setFaqQuery,
    setFaqRegularPagePosts,
    setFaqRegularTotalCount,
    setFaqSearchWithinCategory,
    setNoticeBoardConfig,
    setNoticeBoardConfigLoadErrorMessage,
    setNoticeBoardConfigReady,
    setNoticeHasNextPage,
    setNoticePage,
    setNoticePinnedPosts,
    setNoticePostsLoadErrorMessage,
    setNoticePostsReady,
    setNoticeRegularPagePosts,
    setNoticeRegularTotalCount,
    setSelectedNoticePostId,
    setSelectedNoticePostOverride,
    setUserNoticeQuery,
    userNoticeQuery,
  };
};

export default function useBoardContentSubscriptionController({
  activeFaqCategoryId,
  adminFaqPage,
  adminNoticePage,
  adminTab,
  debouncedAdminNoticeQuery,
  debouncedFaqQuery,
  debouncedUserNoticeQuery,
  faqBoardConfig,
  faqCategories,
  faqCursorByPageRef,
  faqCursorKeyRef,
  faqPage,
  faqSearchWithinCategory,
  isAdminAuthenticated,
  noticeBoardConfig,
  noticeCursorByPageRef,
  noticeCursorKeyRef,
  noticePage,
  noticePosts,
  selectedNoticePostId,
  selectedNoticePostOverride,
  setActiveFaqCategoryId,
  setAdminFaqPage,
  setAdminNoticePage,
  setExpandedFaqPostId,
  setFaqBoardConfig,
  setFaqBoardConfigLoadErrorMessage,
  setFaqBoardConfigReady,
  setFaqCategories,
  setFaqCategoriesLoadErrorMessage,
  setFaqCategoriesReady,
  setFaqHasNextPage,
  setFaqPage,
  setFaqPinnedPosts,
  setFaqPostsLoadErrorMessage,
  setFaqPostsPerPageInput,
  setFaqPostsReady,
  setFaqRegularPagePosts,
  setFaqRegularTotalCount,
  setNoticeBoardConfig,
  setNoticeBoardConfigLoadErrorMessage,
  setNoticeBoardConfigReady,
  setNoticeHasNextPage,
  setNoticePage,
  setNoticePinnedPosts,
  setNoticePostsLoadErrorMessage,
  setNoticePostsPerPageInput,
  setNoticePostsReady,
  setNoticeRegularPagePosts,
  setNoticeRegularTotalCount,
  setSelectedNoticePostId,
  setSelectedNoticePostOverride,
  triggerToast,
  userTab,
  view,
}) {
  const triggerToastRef = useRef(triggerToast);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  const boardCutoverConfig = readBoardContentCutoverConfig();
  const boardReadRequested = boardCutoverConfig.readRequested;
  const legacyFallbackConfig = readLegacyFirestoreReadFallbackConfig();
  const legacyFallbackAllowed = isLegacyFirestoreReadFallbackAllowed(legacyFallbackConfig);
  const [noticePostgresFallback, setNoticePostgresFallback] = useState(false);
  const [faqPostgresFallback, setFaqPostgresFallback] = useState(false);
  const [boardRefreshVersion, setBoardRefreshVersion] = useState(0);

  useEffect(() => subscribeBoardContentRefresh(() => {
    setNoticePostgresFallback(false);
    setFaqPostgresFallback(false);
    setBoardRefreshVersion((current) => current + 1);
  }), []);

  const showToast = useCallback((message, type = 'success') => {
    triggerToastRef.current?.(message, type);
  }, []);

  useEffect(() => {
    if (!boardReadRequested) return undefined;
    const shouldLoadUserNotice = view === 'user' && userTab === 'notice';
    const shouldLoadUserHomeNotice = view === 'user' && userTab === 'home';
    const shouldLoadAdminNotice = isAdminAuthenticated && view === 'admin' && adminTab === 'noticePosts';
    if (!shouldLoadUserNotice && !shouldLoadUserHomeNotice && !shouldLoadAdminNotice) return undefined;

    const search = shouldLoadUserHomeNotice
      ? ''
      : shouldLoadAdminNotice
        ? debouncedAdminNoticeQuery
        : debouncedUserNoticeQuery;
    const searchMode = Boolean(String(search || '').trim());
    const postsPerPage = shouldLoadUserHomeNotice ? 6 : getSafeNoticePostsPerPage(noticeBoardConfig.postsPerPage);
    const activePage = shouldLoadUserHomeNotice ? 1 : shouldLoadAdminNotice ? adminNoticePage : noticePage;
    const requestPage = searchMode ? 1 : activePage;
    const requestPageSize = searchMode
      ? Math.min(500, activePage * postsPerPage)
      : shouldLoadUserHomeNotice
        ? 6
        : undefined;
    let cancelled = false;
    setNoticePostsReady(false);
    setNoticePostsLoadErrorMessage('');

    const loadNotice = () => {
      void requestNoticeBoard({
        search,
        page: requestPage,
        pageSize: requestPageSize,
        home: shouldLoadUserHomeNotice,
        useCache: true,
      }).then((board) => {
        if (cancelled) return;
        const safePostsPerPage = getSafeNoticePostsPerPage(board?.config?.postsPerPage);
        setNoticeBoardConfig({ postsPerPage: safePostsPerPage });
        setNoticePostsPerPageInput(safePostsPerPage);
        setNoticeBoardConfigReady(true);
        setNoticeBoardConfigLoadErrorMessage('');
        setNoticePinnedPosts(board?.pinnedPosts || []);
        setNoticeRegularPagePosts(board?.regularPosts || []);
        setNoticeRegularTotalCount(Number(board?.totalRegularCount || 0));
        setNoticeHasNextPage(Boolean(board?.hasNextPage));
        setNoticePostsLoadErrorMessage('');
        setNoticePostsReady(true);
        setNoticePostgresFallback(false);
      }).catch((error) => {
        if (cancelled) return;
        console.error('Phase 26 notice PostgreSQL read failed:', error);
        if (!legacyFallbackAllowed) {
          recordLegacyFirestoreReadFallbackBlocked('notice-board', error?.code || 'notice_board_postgres_unavailable');
          const message = '공지사항을 PostgreSQL에서 불러오지 못했습니다. legacy Firestore fallback은 비활성화되어 있습니다.';
          publishBoardContentObservation({
            readRequested: true,
            readSource: 'unavailable',
            boardType: 'notice',
            operation: shouldLoadUserHomeNotice ? 'home-read' : 'list-read',
            error: error?.code || 'notice_board_postgres_unavailable',
          });
          setNoticePostsLoadErrorMessage(message);
          setNoticePostsReady(true);
          setNoticePostgresFallback(false);
          return;
        }
        publishBoardContentObservation({
          readRequested: true,
          readSource: 'firestore-fallback',
          boardType: 'notice',
          operation: shouldLoadUserHomeNotice ? 'home-read' : 'list-read',
          error: error?.code || 'notice_board_postgres_unavailable',
        });
        setNoticePostgresFallback(true);
      });
    };

    let firstPaintFrameId = 0;
    let secondPaintFrameId = 0;
    if (shouldLoadUserHomeNotice && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      firstPaintFrameId = window.requestAnimationFrame(() => {
        secondPaintFrameId = window.requestAnimationFrame(loadNotice);
      });
    } else {
      loadNotice();
    }

    return () => {
      cancelled = true;
      if (firstPaintFrameId) window.cancelAnimationFrame?.(firstPaintFrameId);
      if (secondPaintFrameId) window.cancelAnimationFrame?.(secondPaintFrameId);
    };
  }, [
    boardReadRequested,
    boardRefreshVersion,
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    debouncedUserNoticeQuery,
    debouncedAdminNoticeQuery,
    noticePage,
    adminNoticePage,
    legacyFallbackAllowed,
  ]);

  useEffect(() => {
    if (!boardReadRequested) return undefined;
    const shouldLoadUserFaq = view === 'user' && userTab === 'faq';
    const shouldLoadAdminFaq = isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
    if (!shouldLoadUserFaq && !shouldLoadAdminFaq) return undefined;

    const search = debouncedFaqQuery;
    const searchMode = Boolean(String(search || '').trim());
    const postsPerPage = getSafeFaqPostsPerPage(faqBoardConfig.postsPerPage);
    const activePage = shouldLoadAdminFaq ? adminFaqPage : faqPage;
    const requestPage = searchMode ? 1 : activePage;
    const requestPageSize = searchMode
      ? Math.min(500, activePage * postsPerPage)
      : undefined;
    let cancelled = false;
    setFaqPostsReady(false);
    setFaqPostsLoadErrorMessage('');

    void requestFaqBoard({
      search,
      page: requestPage,
      pageSize: requestPageSize,
      categoryId: shouldLoadUserFaq ? activeFaqCategoryId : 'all',
      searchWithinCategory: shouldLoadUserFaq ? faqSearchWithinCategory : false,
      useCache: true,
    }).then((board) => {
      if (cancelled) return;
      const safePostsPerPage = getSafeFaqPostsPerPage(board?.config?.postsPerPage);
      setFaqBoardConfig({ postsPerPage: safePostsPerPage });
      setFaqPostsPerPageInput(safePostsPerPage);
      setFaqBoardConfigReady(true);
      setFaqBoardConfigLoadErrorMessage('');
      setFaqCategories(board?.categories || []);
      setFaqCategoriesReady(true);
      setFaqCategoriesLoadErrorMessage('');
      setFaqPinnedPosts(board?.pinnedPosts || []);
      setFaqRegularPagePosts(board?.regularPosts || []);
      setFaqRegularTotalCount(Number(board?.totalRegularCount || 0));
      setFaqHasNextPage(Boolean(board?.hasNextPage));
      setFaqPostsLoadErrorMessage('');
      setFaqPostsReady(true);
      setFaqPostgresFallback(false);
    }).catch((error) => {
      if (cancelled) return;
      console.error('Phase 26 FAQ PostgreSQL read failed:', error);
      if (!legacyFallbackAllowed) {
        recordLegacyFirestoreReadFallbackBlocked('faq-board', error?.code || 'faq_board_postgres_unavailable');
        const message = 'FAQ를 PostgreSQL에서 불러오지 못했습니다. legacy Firestore fallback은 비활성화되어 있습니다.';
        publishBoardContentObservation({
          readRequested: true,
          readSource: 'unavailable',
          boardType: 'faq',
          operation: 'list-read',
          error: error?.code || 'faq_board_postgres_unavailable',
        });
        setFaqPostsLoadErrorMessage(message);
        setFaqPostsReady(true);
        setFaqCategoriesReady(true);
        setFaqPostgresFallback(false);
        return;
      }
      publishBoardContentObservation({
        readRequested: true,
        readSource: 'firestore-fallback',
        boardType: 'faq',
        operation: 'list-read',
        error: error?.code || 'faq_board_postgres_unavailable',
      });
      setFaqPostgresFallback(true);
    });

    return () => { cancelled = true; };
  }, [
    boardReadRequested,
    boardRefreshVersion,
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    activeFaqCategoryId,
    faqSearchWithinCategory,
    debouncedFaqQuery,
    faqPage,
    adminFaqPage,
    legacyFallbackAllowed,
  ]);

  useEffect(() => {
    const shouldLoadUserNotice = view === 'user' && userTab === 'notice';
    const shouldLoadAdminNotice =
      isAdminAuthenticated && view === 'admin' && adminTab === 'noticePosts';
    const shouldLoadNotice = shouldLoadUserNotice || shouldLoadAdminNotice;

    if (shouldLoadNotice && boardReadRequested && !noticePostgresFallback) return undefined;

    if (!shouldLoadNotice) {
      setNoticeBoardConfigReady(true);
      setNoticeBoardConfigLoadErrorMessage('');
      return undefined;
    }

    setNoticeBoardConfigReady(false);
    setNoticeBoardConfigLoadErrorMessage('');

    return onSnapshot(
      NOTICE_BOARD_CONFIG_DOC_REF,
      (snapshot) => {
        const postsPerPage = getSafeNoticePostsPerPage(
          snapshot.exists()
            ? snapshot.data().postsPerPage
            : DEFAULT_NOTICE_POSTS_PER_PAGE
        );

        setNoticeBoardConfig({ postsPerPage });
        setNoticePostsPerPageInput(postsPerPage);
        setNoticeBoardConfigLoadErrorMessage('');
        setNoticeBoardConfigReady(true);
      },
      (error) => {
        const message =
          '공지사항 목록 설정을 불러오지 못해 기본값 10개를 사용합니다.';
        console.error('Notice board config sync error:', error);
        setNoticeBoardConfig({
          postsPerPage: DEFAULT_NOTICE_POSTS_PER_PAGE,
        });
        setNoticePostsPerPageInput(DEFAULT_NOTICE_POSTS_PER_PAGE);
        setNoticeBoardConfigLoadErrorMessage(message);
        setNoticeBoardConfigReady(true);
      }
    );
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    boardReadRequested,
    noticePostgresFallback,
  ]);

  const shouldRunAdminNoticeSearch =
    isAdminAuthenticated && view === 'admin' && adminTab === 'noticePosts';
  const shouldRunUserNoticeSearch = view === 'user' && userTab === 'notice';
  const activeNoticeSearchQuery = shouldRunAdminNoticeSearch
    ? debouncedAdminNoticeQuery
    : debouncedUserNoticeQuery;
  const noticeSearchPostsPerPage = getSafeNoticePostsPerPage(
    noticeBoardConfig.postsPerPage
  );
  const noticeSearchActivePage = shouldRunAdminNoticeSearch
    ? adminNoticePage
    : noticePage;
  const noticeProgressiveSearchEnabled = Boolean(
    (!boardReadRequested || noticePostgresFallback) &&
      (shouldRunAdminNoticeSearch || shouldRunUserNoticeSearch) &&
      String(activeNoticeSearchQuery || '').trim()
  );

  useBoardProgressiveSearch({
    enabled: noticeProgressiveSearchEnabled,
    collectionRef: NOTICE_POSTS_COLLECTION_REF,
    searchKey: [
      shouldRunAdminNoticeSearch ? 'admin' : 'user',
      String(activeNoticeSearchQuery || '').trim().toLowerCase(),
    ].join('|'),
    searchQuery: activeNoticeSearchQuery,
    activePage: noticeSearchActivePage,
    postsPerPage: noticeSearchPostsPerPage,
    pinnedBatchSize: FIRESTORE_PINNED_POST_LIMIT,
    errorMessage:
      '공지사항 검색 결과를 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.',
    errorLogLabel: 'Notice progressive search error:',
    setPinnedPosts: setNoticePinnedPosts,
    setRegularPagePosts: setNoticeRegularPagePosts,
    setRegularTotalCount: setNoticeRegularTotalCount,
    setHasNextPage: setNoticeHasNextPage,
    setLoadErrorMessage: setNoticePostsLoadErrorMessage,
    setReady: setNoticePostsReady,
    triggerToast: showToast,
  });

  useEffect(() => {
    const shouldLoadUserNotice = view === 'user' && userTab === 'notice';
    const shouldLoadUserHomeNotice = view === 'user' && userTab === 'home';
    const shouldLoadAdminNotice =
      isAdminAuthenticated && view === 'admin' && adminTab === 'noticePosts';
    const shouldLoadNotice =
      shouldLoadUserNotice || shouldLoadUserHomeNotice || shouldLoadAdminNotice;
    if (shouldLoadNotice && boardReadRequested && !noticePostgresFallback) return undefined;
    const activeSearchQuery = shouldLoadUserHomeNotice
      ? ''
      : shouldLoadAdminNotice
        ? debouncedAdminNoticeQuery
        : debouncedUserNoticeQuery;
    const searchMode = Boolean(String(activeSearchQuery || '').trim());

    if (!shouldLoadNotice) {
      noticeCursorKeyRef.current = '';
      noticeCursorByPageRef.current = new Map([[1, null]]);
      setNoticePinnedPosts([]);
      setNoticeRegularPagePosts([]);
      setNoticePostsReady(true);
      setNoticePostsLoadErrorMessage('');
      setNoticeHasNextPage(false);
      return undefined;
    }

    if (searchMode) return undefined;

    const pinnedSource = firestoreQuery(
      NOTICE_POSTS_COLLECTION_REF,
      where('isPinned', '==', true),
      orderBy('createdAt', 'desc'),
      firestoreLimit(
        shouldLoadUserHomeNotice ? 6 : FIRESTORE_PINNED_POST_LIMIT
      )
    );

    const applyPinnedNoticeSnapshot = (snapshot) => {
      setNoticePinnedPosts(
        snapshot.docs.map((postDoc) => ({
          ...postDoc.data(),
          id: postDoc.id,
        }))
      );
      setNoticePostsLoadErrorMessage('');
    };

    const handlePinnedNoticeError = (error) => {
      const message =
        '상단 고정 공지사항을 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.';
      console.error('Pinned notice posts load error:', error);
      setNoticePinnedPosts([]);
      setNoticePostsLoadErrorMessage(message);
      setNoticePostsReady(true);
      showToast(message, 'error');
    };

    if (shouldLoadUserHomeNotice) {
      let cancelled = false;

      void getDocs(pinnedSource)
        .then((snapshot) => {
          if (!cancelled) applyPinnedNoticeSnapshot(snapshot);
        })
        .catch((error) => {
          if (!cancelled) handlePinnedNoticeError(error);
        });

      return () => {
        cancelled = true;
      };
    }

    return onSnapshot(
      pinnedSource,
      applyPinnedNoticeSnapshot,
      handlePinnedNoticeError
    );
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    debouncedUserNoticeQuery,
    debouncedAdminNoticeQuery,
    noticePage,
    adminNoticePage,
    noticeBoardConfig.postsPerPage,
    boardReadRequested,
    noticePostgresFallback,
    showToast,
  ]);

  useEffect(() => {
    const shouldLoadUserNotice = view === 'user' && userTab === 'notice';
    const shouldLoadUserHomeNotice = view === 'user' && userTab === 'home';
    const shouldLoadAdminNotice =
      isAdminAuthenticated && view === 'admin' && adminTab === 'noticePosts';
    const shouldLoadNotice =
      shouldLoadUserNotice || shouldLoadUserHomeNotice || shouldLoadAdminNotice;
    if (shouldLoadNotice && boardReadRequested && !noticePostgresFallback) return undefined;
    const activeSearchQuery = shouldLoadUserHomeNotice
      ? ''
      : shouldLoadAdminNotice
        ? debouncedAdminNoticeQuery
        : debouncedUserNoticeQuery;
    const searchMode = Boolean(String(activeSearchQuery || '').trim());

    if (!shouldLoadNotice || searchMode) return undefined;

    const postsPerPage = shouldLoadUserHomeNotice
      ? 6
      : getSafeNoticePostsPerPage(noticeBoardConfig.postsPerPage);
    const activePage = shouldLoadUserHomeNotice
      ? 1
      : shouldLoadAdminNotice
        ? adminNoticePage
        : noticePage;
    const cursorKey = `${
      shouldLoadUserHomeNotice
        ? 'home'
        : shouldLoadAdminNotice
          ? 'admin'
          : 'user'
    }|${postsPerPage}`;
    const cursorKeyChanged = noticeCursorKeyRef.current !== cursorKey;

    if (cursorKeyChanged) {
      noticeCursorKeyRef.current = cursorKey;
      noticeCursorByPageRef.current = new Map([[1, null]]);
    }

    const pageCursor = noticeCursorByPageRef.current.get(activePage);
    if (activePage > 1 && !pageCursor) {
      if (shouldLoadAdminNotice) setAdminNoticePage(1);
      else setNoticePage(1);
      return undefined;
    }

    setNoticePostsReady(false);
    setNoticePostsLoadErrorMessage('');

    const regularSource = firestoreQuery(
      NOTICE_POSTS_COLLECTION_REF,
      where('isPinned', '==', false),
      orderBy('createdAt', 'desc'),
      ...(pageCursor ? [startAfter(pageCursor)] : []),
      firestoreLimit(postsPerPage + 1)
    );

    const applyRegularNoticeSnapshot = (snapshot) => {
      const sourceDocs = snapshot.docs;
      const visibleDocs = sourceDocs.slice(0, postsPerPage);
      const hasNext = sourceDocs.length > postsPerPage;

      if (visibleDocs.length > 0) {
        noticeCursorByPageRef.current.set(
          activePage + 1,
          visibleDocs[visibleDocs.length - 1]
        );
      }

      setNoticeRegularPagePosts(
        visibleDocs.map((postDoc) => ({
          ...postDoc.data(),
          id: postDoc.id,
        }))
      );
      setNoticeHasNextPage(hasNext);
      setNoticePostsLoadErrorMessage('');
      setNoticePostsReady(true);
    };

    const handleRegularNoticeError = (error) => {
      const message =
        '공지사항 목록을 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.';
      console.error('Paged notice posts load error:', error);
      setNoticeRegularPagePosts([]);
      setNoticeHasNextPage(false);
      setNoticePostsLoadErrorMessage(message);
      setNoticePostsReady(true);
      showToast(message, 'error');
    };

    let unsubscribe = null;
    let cancelled = false;

    if (shouldLoadUserHomeNotice) {
      void getDocs(regularSource)
        .then((snapshot) => {
          if (!cancelled) applyRegularNoticeSnapshot(snapshot);
        })
        .catch((error) => {
          if (!cancelled) handleRegularNoticeError(error);
        });
    } else {
      unsubscribe = onSnapshot(
        regularSource,
        applyRegularNoticeSnapshot,
        handleRegularNoticeError
      );
    }

    if (cursorKeyChanged && !shouldLoadUserHomeNotice) {
      void getCountFromServer(
        firestoreQuery(
          NOTICE_POSTS_COLLECTION_REF,
          where('isPinned', '==', false)
        )
      )
        .then((countSnapshot) => {
          setNoticeRegularTotalCount(countSnapshot.data().count);
        })
        .catch((error) => {
          console.error('Notice regular post count error:', error);
        });
    }

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    noticePage,
    adminNoticePage,
    noticeBoardConfig.postsPerPage,
    debouncedUserNoticeQuery,
    debouncedAdminNoticeQuery,
    boardReadRequested,
    noticePostgresFallback,
    showToast,
  ]);

  useEffect(() => {
    noticeCursorByPageRef.current = new Map([[1, null]]);
    noticeCursorKeyRef.current = '';
    setNoticePage(1);
  }, [debouncedUserNoticeQuery]);

  useEffect(() => {
    noticeCursorByPageRef.current = new Map([[1, null]]);
    noticeCursorKeyRef.current = '';
    setAdminNoticePage(1);
  }, [debouncedAdminNoticeQuery]);

  useEffect(() => {
    const hasSelectedNotice = Boolean(
      selectedNoticePostId &&
        ((noticePosts || []).some(
          (post) => post.id === selectedNoticePostId
        ) || selectedNoticePostOverride?.id === selectedNoticePostId)
    );
    const shouldLoadSelectedNotice =
      view === 'user' &&
      userTab === 'notice' &&
      Boolean(selectedNoticePostId) &&
      !hasSelectedNotice;

    if (!shouldLoadSelectedNotice) return undefined;

    let cancelled = false;

    if (boardReadRequested && !noticePostgresFallback) {
      void requestNoticePost(selectedNoticePostId)
        .then((post) => {
          if (cancelled || !post?.id) return;
          setSelectedNoticePostOverride(post);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error('Selected notice PostgreSQL read error:', error);
          if (!legacyFallbackAllowed) {
            recordLegacyFirestoreReadFallbackBlocked('notice-detail', error?.code || 'notice_detail_postgres_unavailable');
            publishBoardContentObservation({
              readRequested: true,
              readSource: 'unavailable',
              boardType: 'notice',
              operation: 'detail-read',
              error: error?.code || 'notice_detail_postgres_unavailable',
            });
            setNoticePostsLoadErrorMessage('공지사항 상세를 PostgreSQL에서 불러오지 못했습니다. legacy Firestore fallback은 비활성화되어 있습니다.');
            return;
          }
          publishBoardContentObservation({
            readRequested: true,
            readSource: 'firestore-fallback',
            boardType: 'notice',
            operation: 'detail-read',
            error: error?.code || 'notice_detail_postgres_unavailable',
          });
          setNoticePostgresFallback(true);
        });
    } else {
      void getDoc(doc(NOTICE_POSTS_COLLECTION_REF, selectedNoticePostId))
        .then((snapshot) => {
          if (cancelled || !snapshot.exists()) return;
          setSelectedNoticePostOverride({
            ...snapshot.data(),
            id: snapshot.id,
          });
        })
        .catch((error) => {
          console.error('Selected notice post read error:', error);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    noticePosts,
    selectedNoticePostId,
    selectedNoticePostOverride,
    userTab,
    view,
    boardReadRequested,
    noticePostgresFallback,
    legacyFallbackAllowed,
  ]);

  useEffect(() => {
    if (
      !selectedNoticePostId ||
      (noticePosts || []).some((post) => post.id === selectedNoticePostId)
    ) {
      setSelectedNoticePostOverride(null);
    }
  }, [selectedNoticePostId, noticePosts]);

  useEffect(() => {
    const shouldLoadUserFaq = view === 'user' && userTab === 'faq';
    const shouldLoadAdminFaq =
      isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
    const shouldLoadFaq = shouldLoadUserFaq || shouldLoadAdminFaq;

    if (shouldLoadFaq && boardReadRequested && !faqPostgresFallback) return undefined;

    if (!shouldLoadFaq) {
      setFaqCategoriesReady(true);
      setFaqCategoriesLoadErrorMessage('');
      return undefined;
    }

    setFaqCategoriesReady(false);
    setFaqCategoriesLoadErrorMessage('');

    return onSnapshot(
      FAQ_CATEGORIES_COLLECTION_REF,
      (snapshot) => {
        const remoteCategories = snapshot.docs
          .map((categoryDoc) => ({
            ...categoryDoc.data(),
            id: categoryDoc.id,
          }))
          .sort((first, second) => {
            const orderDifference =
              (Number(first.order) || 0) - (Number(second.order) || 0);
            if (orderDifference !== 0) return orderDifference;
            return String(first.name || '').localeCompare(
              String(second.name || ''),
              'ko'
            );
          });

        setFaqCategories(remoteCategories);
        setFaqCategoriesLoadErrorMessage('');
        setFaqCategoriesReady(true);
      },
      (error) => {
        const message =
          'FAQ 카테고리를 불러오지 못했습니다. Firestore Rules의 faqCategories 읽기 권한을 확인해 주세요.';
        console.error('FAQ categories sync error:', error);
        setFaqCategories([]);
        setFaqCategoriesLoadErrorMessage(message);
        setFaqCategoriesReady(true);
        showToast(message, 'error');
      }
    );
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    boardReadRequested,
    faqPostgresFallback,
    showToast,
  ]);

  useEffect(() => {
    const shouldLoadUserFaq = view === 'user' && userTab === 'faq';
    const shouldLoadAdminFaq =
      isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
    const shouldLoadFaq = shouldLoadUserFaq || shouldLoadAdminFaq;

    if (shouldLoadFaq && boardReadRequested && !faqPostgresFallback) return undefined;

    if (!shouldLoadFaq) {
      setFaqBoardConfigReady(true);
      setFaqBoardConfigLoadErrorMessage('');
      return undefined;
    }

    setFaqBoardConfigReady(false);
    setFaqBoardConfigLoadErrorMessage('');

    return onSnapshot(
      FAQ_BOARD_CONFIG_DOC_REF,
      (snapshot) => {
        const postsPerPage = getSafeFaqPostsPerPage(
          snapshot.exists()
            ? snapshot.data().postsPerPage
            : DEFAULT_FAQ_POSTS_PER_PAGE
        );
        setFaqBoardConfig({ postsPerPage });
        setFaqPostsPerPageInput(postsPerPage);
        setFaqBoardConfigLoadErrorMessage('');
        setFaqBoardConfigReady(true);
      },
      (error) => {
        const message =
          'FAQ 목록 설정을 불러오지 못해 기본값 10개를 사용합니다.';
        console.error('FAQ board config sync error:', error);
        setFaqBoardConfig({ postsPerPage: DEFAULT_FAQ_POSTS_PER_PAGE });
        setFaqPostsPerPageInput(DEFAULT_FAQ_POSTS_PER_PAGE);
        setFaqBoardConfigLoadErrorMessage(message);
        setFaqBoardConfigReady(true);
      }
    );
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    boardReadRequested,
    faqPostgresFallback,
  ]);

  const shouldRunAdminFaqSearch =
    isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
  const shouldRunUserFaqSearch = view === 'user' && userTab === 'faq';
  const faqProgressiveSearchCategoryId =
    shouldRunUserFaqSearch &&
    activeFaqCategoryId !== 'all' &&
    faqSearchWithinCategory
      ? activeFaqCategoryId
      : '';
  const faqSearchPostsPerPage = getSafeFaqPostsPerPage(
    faqBoardConfig.postsPerPage
  );
  const faqSearchActivePage = shouldRunAdminFaqSearch
    ? adminFaqPage
    : faqPage;
  const faqProgressiveSearchEnabled = Boolean(
    (!boardReadRequested || faqPostgresFallback) &&
      (shouldRunAdminFaqSearch || shouldRunUserFaqSearch) &&
      String(debouncedFaqQuery || '').trim()
  );

  useBoardProgressiveSearch({
    enabled: faqProgressiveSearchEnabled,
    collectionRef: FAQ_POSTS_COLLECTION_REF,
    searchKey: [
      shouldRunAdminFaqSearch ? 'admin' : 'user',
      faqProgressiveSearchCategoryId || 'all',
      String(debouncedFaqQuery || '').trim().toLowerCase(),
    ].join('|'),
    searchQuery: debouncedFaqQuery,
    activePage: faqSearchActivePage,
    postsPerPage: faqSearchPostsPerPage,
    pinnedBatchSize: FIRESTORE_PINNED_POST_LIMIT,
    categoryId: faqProgressiveSearchCategoryId,
    errorMessage:
      'FAQ 검색 결과를 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.',
    errorLogLabel: 'FAQ progressive search error:',
    setPinnedPosts: setFaqPinnedPosts,
    setRegularPagePosts: setFaqRegularPagePosts,
    setRegularTotalCount: setFaqRegularTotalCount,
    setHasNextPage: setFaqHasNextPage,
    setLoadErrorMessage: setFaqPostsLoadErrorMessage,
    setReady: setFaqPostsReady,
    triggerToast: showToast,
  });

  useEffect(() => {
    const shouldLoadUserFaq = view === 'user' && userTab === 'faq';
    const shouldLoadAdminFaq =
      isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
    const shouldLoadFaq = shouldLoadUserFaq || shouldLoadAdminFaq;
    if (shouldLoadFaq && boardReadRequested && !faqPostgresFallback) return undefined;
    const searchMode = Boolean(String(debouncedFaqQuery || '').trim());
    const shouldLimitToActiveCategory =
      shouldLoadUserFaq &&
      activeFaqCategoryId !== 'all' &&
      (!searchMode || faqSearchWithinCategory);
    const categoryConstraints = shouldLimitToActiveCategory
      ? [where('categoryId', '==', activeFaqCategoryId)]
      : [];

    if (!shouldLoadFaq) {
      faqCursorKeyRef.current = '';
      faqCursorByPageRef.current = new Map([[1, null]]);
      setFaqPinnedPosts([]);
      setFaqRegularPagePosts([]);
      setFaqPostsReady(true);
      setFaqPostsLoadErrorMessage('');
      setFaqHasNextPage(false);
      return undefined;
    }

    if (searchMode) return undefined;

    const pinnedSource = firestoreQuery(
      FAQ_POSTS_COLLECTION_REF,
      ...categoryConstraints,
      where('isPinned', '==', true),
      orderBy('createdAt', 'desc'),
      firestoreLimit(FIRESTORE_PINNED_POST_LIMIT)
    );

    return onSnapshot(
      pinnedSource,
      (snapshot) => {
        setFaqPinnedPosts(
          snapshot.docs.map((postDoc) => ({
            ...postDoc.data(),
            id: postDoc.id,
          }))
        );
        setFaqPostsLoadErrorMessage('');
      },
      (error) => {
        const message =
          '상단 고정 FAQ를 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.';
        console.error('Pinned FAQ sync error:', error);
        setFaqPinnedPosts([]);
        setFaqPostsLoadErrorMessage(message);
        setFaqPostsReady(true);
        showToast(message, 'error');
      }
    );
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    activeFaqCategoryId,
    faqSearchWithinCategory,
    debouncedFaqQuery,
    faqPage,
    adminFaqPage,
    faqBoardConfig.postsPerPage,
    boardReadRequested,
    faqPostgresFallback,
    showToast,
  ]);

  useEffect(() => {
    const shouldLoadUserFaq = view === 'user' && userTab === 'faq';
    const shouldLoadAdminFaq =
      isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
    const shouldLoadFaq = shouldLoadUserFaq || shouldLoadAdminFaq;
    if (shouldLoadFaq && boardReadRequested && !faqPostgresFallback) return undefined;
    const searchMode = Boolean(String(debouncedFaqQuery || '').trim());

    if (!shouldLoadFaq || searchMode) return undefined;

    const shouldLimitToActiveCategory =
      shouldLoadUserFaq && activeFaqCategoryId !== 'all';
    const categoryConstraints = shouldLimitToActiveCategory
      ? [where('categoryId', '==', activeFaqCategoryId)]
      : [];
    const postsPerPage = getSafeFaqPostsPerPage(faqBoardConfig.postsPerPage);
    const activePage = shouldLoadAdminFaq ? adminFaqPage : faqPage;
    const cursorKey = [
      shouldLoadAdminFaq ? 'admin' : 'user',
      shouldLimitToActiveCategory ? activeFaqCategoryId : 'all',
      postsPerPage,
    ].join('|');
    const cursorKeyChanged = faqCursorKeyRef.current !== cursorKey;

    if (cursorKeyChanged) {
      faqCursorKeyRef.current = cursorKey;
      faqCursorByPageRef.current = new Map([[1, null]]);
    }

    const pageCursor = faqCursorByPageRef.current.get(activePage);
    if (activePage > 1 && !pageCursor) {
      if (shouldLoadAdminFaq) setAdminFaqPage(1);
      else setFaqPage(1);
      return undefined;
    }

    setFaqPostsReady(false);
    setFaqPostsLoadErrorMessage('');

    const regularSource = firestoreQuery(
      FAQ_POSTS_COLLECTION_REF,
      ...categoryConstraints,
      where('isPinned', '==', false),
      orderBy('createdAt', 'desc'),
      ...(pageCursor ? [startAfter(pageCursor)] : []),
      firestoreLimit(postsPerPage + 1)
    );

    const unsubscribe = onSnapshot(
      regularSource,
      (snapshot) => {
        const sourceDocs = snapshot.docs;
        const visibleDocs = sourceDocs.slice(0, postsPerPage);
        const hasNext = sourceDocs.length > postsPerPage;

        if (visibleDocs.length > 0) {
          faqCursorByPageRef.current.set(
            activePage + 1,
            visibleDocs[visibleDocs.length - 1]
          );
        }

        setFaqRegularPagePosts(
          visibleDocs.map((postDoc) => ({
            ...postDoc.data(),
            id: postDoc.id,
          }))
        );
        setFaqHasNextPage(hasNext);
        setFaqPostsLoadErrorMessage('');
        setFaqPostsReady(true);
      },
      (error) => {
        const message =
          'FAQ 목록을 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.';
        console.error('Paged FAQ posts sync error:', error);
        setFaqRegularPagePosts([]);
        setFaqHasNextPage(false);
        setFaqPostsLoadErrorMessage(message);
        setFaqPostsReady(true);
        showToast(message, 'error');
      }
    );

    if (cursorKeyChanged) {
      void getCountFromServer(
        firestoreQuery(
          FAQ_POSTS_COLLECTION_REF,
          ...categoryConstraints,
          where('isPinned', '==', false)
        )
      )
        .then((countSnapshot) => {
          setFaqRegularTotalCount(countSnapshot.data().count);
        })
        .catch((error) => {
          console.error('FAQ regular post count error:', error);
        });
    }

    return unsubscribe;
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    activeFaqCategoryId,
    faqPage,
    adminFaqPage,
    faqBoardConfig.postsPerPage,
    debouncedFaqQuery,
    boardReadRequested,
    faqPostgresFallback,
    showToast,
  ]);

  useEffect(() => {
    faqCursorByPageRef.current = new Map([[1, null]]);
    faqCursorKeyRef.current = '';
    setFaqPage(1);
    setAdminFaqPage(1);
  }, [debouncedFaqQuery, activeFaqCategoryId, faqSearchWithinCategory]);

  useEffect(() => {
    if (
      activeFaqCategoryId !== 'all' &&
      !faqCategories.some(
        (category) => category.id === activeFaqCategoryId
      )
    ) {
      setActiveFaqCategoryId('all');
      setExpandedFaqPostId('');
      setFaqPage(1);
    }
  }, [faqCategories, activeFaqCategoryId]);

  const openNoticePost = useCallback(
    async (post) => {
      if (!post?.id) return;

      setSelectedNoticePostId(post.id);

      if (boardReadRequested && !noticePostgresFallback) {
        try {
          const nextViewCount = await incrementNoticePostView(post.id);
          setSelectedNoticePostOverride((current) =>
            current?.id === post.id
              ? { ...current, viewCount: nextViewCount }
              : current
          );
        } catch (error) {
          console.error('Notice PostgreSQL view count update error:', error);
          publishBoardContentObservation({
            readRequested: true,
            readSource: 'postgresql',
            writeSource: 'postgresql',
            boardType: 'notice',
            operation: 'view-count',
            error: error?.code || 'notice_view_postgres_failed',
          });
        }
      }

      try {
        await runTransaction(db, async (transaction) => {
          const postDocRef = doc(NOTICE_POSTS_COLLECTION_REF, post.id);
          const postSnapshot = await transaction.get(postDocRef);

          if (!postSnapshot.exists()) return;

          const currentViewCount = Number(postSnapshot.data().viewCount) || 0;
          transaction.update(postDocRef, {
            viewCount: currentViewCount + 1,
          });
        });
      } catch (error) {
        console.error('Notice Firestore compatibility view count update error:', error);
      }
    },
    [
      boardReadRequested,
      noticePostgresFallback,
      setSelectedNoticePostId,
      setSelectedNoticePostOverride,
    ]
  );

  const closeNoticePost = useCallback(() => {
    setSelectedNoticePostId('');
  }, [setSelectedNoticePostId]);

  return {
    closeNoticePost,
    openNoticePost,
  };
}
