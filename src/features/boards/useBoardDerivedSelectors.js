import { useMemo } from 'react';

import { richTextHtmlToText } from '../../utils/richTextCore.js';
import { getFirestoreTimestampMillis } from '../../utils/appUtils.js';
import {
  filterNoticePostsByQuery,
  getSafeFaqPostsPerPage,
  getSafeNoticePostsPerPage,
} from './useBoardContentSubscriptionController.js';

export default function useBoardDerivedSelectors({
  activeFaqCategoryId,
  adminFaqPage,
  adminNoticePage,
  adminNoticeQuery,
  adminTab,
  faqBoardConfig,
  faqCategories,
  faqPage,
  faqPosts,
  faqQuery,
  faqRegularTotalCount,
  faqSearchWithinCategory,
  noticeBoardConfig,
  noticePage,
  noticePosts,
  noticeRegularTotalCount,
  selectedNoticePostId,
  selectedNoticePostOverride,
  userNoticeQuery,
  view,
}) {
  const noticePostsPerPage = getSafeNoticePostsPerPage(
    noticeBoardConfig.postsPerPage
  );

  const allPinnedNoticePosts = useMemo(
    () => (noticePosts || []).filter((post) => post.isPinned),
    [noticePosts]
  );

  const allRegularNoticePosts = useMemo(
    () => (noticePosts || []).filter((post) => !post.isPinned),
    [noticePosts]
  );

  const userNoticeSearchMode = Boolean(String(userNoticeQuery || '').trim());
  const adminNoticeSearchMode = Boolean(String(adminNoticeQuery || '').trim());
  const activeNoticePage =
    view === 'admin' && adminTab === 'noticePosts'
      ? adminNoticePage
      : noticePage;
  const activeNoticeSearchMode =
    view === 'admin' && adminTab === 'noticePosts'
      ? adminNoticeSearchMode
      : userNoticeSearchMode;

  const adminNoticeRowsAreServerSummaries = useMemo(
    () => [...allPinnedNoticePosts, ...allRegularNoticePosts].some(
      (post) => typeof post?.contentHtml === 'undefined'
    ),
    [allPinnedNoticePosts, allRegularNoticePosts]
  );

  const noticeRegularPostNumberById = useMemo(
    () =>
      new Map(
        allRegularNoticePosts.map((post, index) => [
          post.id,
          activeNoticeSearchMode && !adminNoticeRowsAreServerSummaries
            ? allRegularNoticePosts.length - index
            : Math.max(
                1,
                noticeRegularTotalCount -
                  (activeNoticePage - 1) * noticePostsPerPage -
                  index
              ),
        ])
      ),
    [
      allRegularNoticePosts,
      activeNoticePage,
      activeNoticeSearchMode,
      noticeRegularTotalCount,
      noticePostsPerPage,
      adminNoticeRowsAreServerSummaries,
    ]
  );

  const pinnedNoticePosts = useMemo(
    () => filterNoticePostsByQuery(allPinnedNoticePosts, userNoticeQuery),
    [allPinnedNoticePosts, userNoticeQuery]
  );

  const regularNoticePosts = useMemo(
    () => filterNoticePostsByQuery(allRegularNoticePosts, userNoticeQuery),
    [allRegularNoticePosts, userNoticeQuery]
  );

  const adminPinnedNoticePosts = useMemo(
    () => adminNoticeRowsAreServerSummaries
      ? allPinnedNoticePosts
      : filterNoticePostsByQuery(allPinnedNoticePosts, adminNoticeQuery),
    [allPinnedNoticePosts, adminNoticeQuery, adminNoticeRowsAreServerSummaries]
  );

  const adminRegularNoticePosts = useMemo(
    () => adminNoticeRowsAreServerSummaries
      ? allRegularNoticePosts
      : filterNoticePostsByQuery(allRegularNoticePosts, adminNoticeQuery),
    [allRegularNoticePosts, adminNoticeQuery, adminNoticeRowsAreServerSummaries]
  );

  const noticeTotalPages = Math.max(
    1,
    Math.ceil(
      (userNoticeSearchMode
        ? regularNoticePosts.length
        : noticeRegularTotalCount) / noticePostsPerPage
    )
  );

  const safeNoticePage = Math.min(noticePage, noticeTotalPages);

  const paginatedNoticePosts = useMemo(
    () =>
      userNoticeSearchMode
        ? regularNoticePosts.slice(
            (safeNoticePage - 1) * noticePostsPerPage,
            safeNoticePage * noticePostsPerPage
          )
        : regularNoticePosts,
    [
      userNoticeSearchMode,
      regularNoticePosts,
      safeNoticePage,
      noticePostsPerPage,
    ]
  );

  const adminNoticeTotalPages = Math.max(
    1,
    Math.ceil(
      (adminNoticeSearchMode && !adminNoticeRowsAreServerSummaries
        ? adminRegularNoticePosts.length
        : noticeRegularTotalCount) / noticePostsPerPage
    )
  );

  const safeAdminNoticePage = Math.min(
    adminNoticePage,
    adminNoticeTotalPages
  );

  const paginatedAdminNoticePosts = useMemo(
    () =>
      adminNoticeSearchMode && !adminNoticeRowsAreServerSummaries
        ? adminRegularNoticePosts.slice(
            (safeAdminNoticePage - 1) * noticePostsPerPage,
            safeAdminNoticePage * noticePostsPerPage
          )
        : adminRegularNoticePosts,
    [
      adminNoticeSearchMode,
      adminNoticeRowsAreServerSummaries,
      adminRegularNoticePosts,
      safeAdminNoticePage,
      noticePostsPerPage,
    ]
  );

  const selectedNoticePost = useMemo(
    () =>
      selectedNoticePostId
        ? (selectedNoticePostOverride?.id === selectedNoticePostId
            ? selectedNoticePostOverride
            : noticePosts.find((post) => post.id === selectedNoticePostId) || null)
        : null,
    [noticePosts, selectedNoticePostId, selectedNoticePostOverride]
  );

  const faqCategoryNameById = useMemo(
    () =>
      new Map(
        (faqCategories || []).map((category) => [category.id, category.name])
      ),
    [faqCategories]
  );

  const faqPostsPerPage = getSafeFaqPostsPerPage(
    faqBoardConfig.postsPerPage
  );

  const activeFaqCategoryName =
    activeFaqCategoryId === 'all'
      ? '전체'
      : faqCategoryNameById.get(activeFaqCategoryId) || '선택 카테고리';

  const faqCategoryOrderById = useMemo(
    () =>
      new Map(
        (faqCategories || []).map((category, index) => [category.id, index])
      ),
    [faqCategories]
  );

  const categoryFilteredFaqPosts = useMemo(() => {
    const normalizedQuery = faqQuery.trim().toLowerCase();

    const shouldLimitToActiveCategory =
      activeFaqCategoryId !== 'all' &&
      (!normalizedQuery || faqSearchWithinCategory);

    return (faqPosts || [])
      .filter((post) => {
        const categoryMatched =
          !shouldLimitToActiveCategory ||
          post.categoryId === activeFaqCategoryId;

        const keywordMatched =
          !normalizedQuery ||
          String(post.title || '').toLowerCase().includes(normalizedQuery) ||
          String(
            post.contentText ||
              post.content ||
              richTextHtmlToText(post.contentHtml || '')
          )
            .toLowerCase()
            .includes(normalizedQuery);

        return categoryMatched && keywordMatched;
      })
      .sort((first, second) => {
        const firstCategoryOrder =
          faqCategoryOrderById.get(first.categoryId) ?? Number.MAX_SAFE_INTEGER;
        const secondCategoryOrder =
          faqCategoryOrderById.get(second.categoryId) ?? Number.MAX_SAFE_INTEGER;

        if (firstCategoryOrder !== secondCategoryOrder) {
          return firstCategoryOrder - secondCategoryOrder;
        }

        return (
          getFirestoreTimestampMillis(second.createdAt) -
          getFirestoreTimestampMillis(first.createdAt)
        );
      });
  }, [
    faqPosts,
    faqQuery,
    faqSearchWithinCategory,
    activeFaqCategoryId,
    faqCategoryOrderById,
  ]);

  const pinnedFaqPosts = useMemo(
    () => categoryFilteredFaqPosts.filter((post) => post.isPinned),
    [categoryFilteredFaqPosts]
  );

  const regularFaqPosts = useMemo(
    () => categoryFilteredFaqPosts.filter((post) => !post.isPinned),
    [categoryFilteredFaqPosts]
  );

  const faqSearchMode = Boolean(String(faqQuery || '').trim());

  const faqTotalPages = Math.max(
    1,
    Math.ceil(
      (faqSearchMode ? regularFaqPosts.length : faqRegularTotalCount) /
        faqPostsPerPage
    )
  );

  const safeFaqPage = Math.min(faqPage, faqTotalPages);

  const paginatedFaqPosts = useMemo(
    () =>
      faqSearchMode
        ? regularFaqPosts.slice(
            (safeFaqPage - 1) * faqPostsPerPage,
            safeFaqPage * faqPostsPerPage
          )
        : regularFaqPosts,
    [faqSearchMode, regularFaqPosts, safeFaqPage, faqPostsPerPage]
  );

  const displayedFaqPosts = useMemo(
    () =>
      [...pinnedFaqPosts, ...paginatedFaqPosts].sort((first, second) => {
        const firstCategoryOrder =
          faqCategoryOrderById.get(first.categoryId) ?? Number.MAX_SAFE_INTEGER;
        const secondCategoryOrder =
          faqCategoryOrderById.get(second.categoryId) ?? Number.MAX_SAFE_INTEGER;

        if (firstCategoryOrder !== secondCategoryOrder) {
          return firstCategoryOrder - secondCategoryOrder;
        }

        return (
          getFirestoreTimestampMillis(second.createdAt) -
          getFirestoreTimestampMillis(first.createdAt)
        );
      }),
    [pinnedFaqPosts, paginatedFaqPosts, faqCategoryOrderById]
  );

  const adminFaqRowsAreServerSummaries = useMemo(
    () => (faqPosts || []).some((post) => typeof post?.contentHtml === 'undefined'),
    [faqPosts]
  );

  const adminPinnedFaqPosts = useMemo(
    () => (faqPosts || []).filter((post) => post.isPinned),
    [faqPosts]
  );

  const adminRegularFaqPosts = useMemo(
    () => (faqPosts || []).filter((post) => !post.isPinned),
    [faqPosts]
  );

  const adminFaqTotalPages = Math.max(
    1,
    Math.ceil(faqRegularTotalCount / faqPostsPerPage)
  );

  const safeAdminFaqPage = Math.min(adminFaqPage, adminFaqTotalPages);
  const paginatedAdminFaqPosts = faqSearchMode && !adminFaqRowsAreServerSummaries
    ? adminRegularFaqPosts.slice(
        (safeAdminFaqPage - 1) * faqPostsPerPage,
        safeAdminFaqPage * faqPostsPerPage
      )
    : adminRegularFaqPosts;

  return {
    activeFaqCategoryName,
    adminFaqTotalPages,
    adminNoticeTotalPages,
    adminPinnedFaqPosts,
    adminPinnedNoticePosts,
    adminRegularFaqPosts,
    adminRegularNoticePosts,
    categoryFilteredFaqPosts,
    displayedFaqPosts,
    faqCategoryNameById,
    faqTotalPages,
    noticeRegularPostNumberById,
    noticeTotalPages,
    paginatedAdminFaqPosts,
    paginatedAdminNoticePosts,
    paginatedNoticePosts,
    pinnedNoticePosts,
    regularFaqPosts,
    regularNoticePosts,
    safeAdminFaqPage,
    safeAdminNoticePage,
    safeFaqPage,
    safeNoticePage,
    selectedNoticePost,
  };
}
