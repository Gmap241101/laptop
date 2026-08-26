import { useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import PaginationControls from '../components/PaginationControls.jsx';
import RichTextContent from '../components/RichTextContent.jsx';
import SecureAttachmentList from '../components/SecureAttachmentList.jsx';
import {
  backUserCommunityHistoryState,
  pushUserCommunityHistoryState,
  readUserCommunityHistoryState,
  replaceUserCommunityHistoryState,
} from '../routing/userCommunityHistory.js';

export default function UserBoardPanel({ ctx }) {
  const {
    AnimatePresence,
    Button,
    Card,
    CardContent,
    Clock,
    Pin,
    Search,
    activeFaqCategoryId,
    activeFaqCategoryName,
    categoryFilteredFaqPosts,
    closeNoticePost,
    displayedFaqPosts,
    expandedFaqPostId,
    faqCategories,
    faqCategoriesLoadErrorMessage,
    faqCategoriesReady,
    faqCategoryNameById,
    faqPostsLoadErrorMessage,
    faqPostsReady,
    faqQuery,
    faqSearchWithinCategory,
    faqTotalPages,
    formatFirestoreDate,
    goToUserHome,
    motion,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsReady,
    noticeRegularPostNumberById,
    noticeTotalPages,
    openNoticePost,
    paginatedNoticePosts,
    pinnedNoticePosts,
    regularFaqPosts,
    regularNoticePosts,
    safeFaqPage,
    safeNoticePage,
    selectedNoticePost,
    setActiveFaqCategoryId,
    setExpandedFaqPostId,
    setFaqPage,
    setFaqQuery,
    setFaqSearchWithinCategory,
    setNoticePage,
    setUserNoticeQuery,
    userNoticeQuery,
    userTab,
  } = ctx;

  useEffect(() => {
    if (!['notice', 'faq'].includes(userTab) || typeof window === 'undefined') return undefined;

    const current = readUserCommunityHistoryState();
    if (!current || current.tab !== userTab) {
      replaceUserCommunityHistoryState({ tab: userTab, view: 'list' });
    }

    const syncCommunityHistory = () => {
      const target = readUserCommunityHistoryState();
      if (!target || target.tab !== userTab) return;

      if (userTab === 'notice') {
        if (target.view === 'detail' && target.id) {
          void openNoticePost({ id: target.id }, { recordView: false });
        } else {
          closeNoticePost();
        }
        return;
      }

      setExpandedFaqPostId(target.view === 'detail' ? target.id : '');
    };

    syncCommunityHistory();
    window.addEventListener('popstate', syncCommunityHistory);
    return () => window.removeEventListener('popstate', syncCommunityHistory);
  }, [closeNoticePost, openNoticePost, setExpandedFaqPostId, userTab]);

  const handleOpenNoticePost = (post) => {
    if (!post?.id) return;
    pushUserCommunityHistoryState({ tab: 'notice', view: 'detail', id: post.id });
    void openNoticePost(post);
  };

  const handleCloseNoticePost = () => {
    closeNoticePost();
    pushUserCommunityHistoryState({ tab: 'notice', view: 'list' });
  };

  const handleFaqToggle = (postId) => {
    const normalizedPostId = String(postId || '').trim();
    if (!normalizedPostId) return;

    if (expandedFaqPostId === normalizedPostId) {
      if (backUserCommunityHistoryState({ tab: 'faq', view: 'detail', id: normalizedPostId })) {
        return;
      }
      setExpandedFaqPostId('');
      replaceUserCommunityHistoryState({ tab: 'faq', view: 'list' });
      return;
    }

    pushUserCommunityHistoryState({ tab: 'faq', view: 'detail', id: normalizedPostId });
    setExpandedFaqPostId(normalizedPostId);
  };

  const resetFaqHistoryToList = () => {
    setExpandedFaqPostId('');
    replaceUserCommunityHistoryState({ tab: 'faq', view: 'list' });
  };

  const handleNotFoundBack = () => {
    if (typeof window === 'undefined') return;

    if (window.history.length > 1 && document.referrer) {
      window.history.back();
      return;
    }

    goToUserHome();
  };

  if (userTab === 'notFound') {
    return (
      <section
        className="grid min-h-[416px] place-items-center px-4 py-10 sm:px-6 sm:py-12"
        aria-labelledby="user-not-found-title"
      >
        <div className="relative w-full max-w-[608px] text-center">
          <div className="px-4 py-8 sm:px-8 sm:py-10">
            <div className="mx-auto mb-5 grid h-[74px] w-[74px] place-items-center rounded-[22px] bg-[#fff4ec] text-[#e65300] ring-1 ring-inset ring-orange-500/10">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-10 w-10"
                aria-hidden="true"
              >
                <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                <path d="M14 2v5h5" />
                <path d="m9.5 14.5 5-5" />
                <path d="m14.5 14.5-5-5" />
              </svg>
            </div>

            <p className="m-0 text-[clamp(48px,9vw,76px)] font-black leading-[0.95] tracking-[-0.065em] text-[#ff6b00]">
              404
            </p>

            <h1
              id="user-not-found-title"
              className="mt-4 text-[clamp(23px,3.2vw,30px)] font-black leading-tight tracking-[-0.045em] text-slate-900"
            >
              페이지를 찾을 수 없습니다
            </h1>

            <p className="mx-auto mt-4 max-w-[460px] text-sm leading-6 tracking-[-0.02em] text-slate-500 sm:leading-7">
              입력한 주소가 잘못되었거나 페이지가 이동·삭제되었을 수 있습니다.
              <br className="hidden sm:block" />
              주소를 다시 확인하거나 서비스 홈으로 이동해 주세요.
            </p>

            <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={goToUserHome}
                className="inline-flex min-h-11 w-full min-w-[136px] items-center justify-center gap-2 rounded-xl border border-transparent bg-gradient-to-br from-[#ff6b00] to-[#e65300] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(230,83,0,0.20)] transition hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(230,83,0,0.28)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/25 sm:w-auto"
              >
                <span aria-hidden="true">⌂</span>
                서비스 홈으로
              </button>

              <button
                type="button"
                onClick={handleNotFoundBack}
                className="inline-flex min-h-11 w-full min-w-[136px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:-translate-y-px hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/25 sm:w-auto"
              >
                이전 페이지로
              </button>
            </div>

            <p className="mt-6 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-400">
              문제가 계속되면 사이트 관리자에게 접속 주소와 발생 시점을 알려 주세요.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
            <Card className="-mx-3 flex min-h-0 flex-1 flex-col overflow-hidden border-slate-200 bg-white shadow-sm sm:mx-0">
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-8 text-white sm:px-6 sm:py-10">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                <div className="relative mx-auto max-w-3xl text-center">
                  <h2 className="text-2xl font-black tracking-tight">
                    {userTab === 'home' && '초기화면 준비중입니다'}
                    {userTab === 'history' && '나의 신청내역 화면 준비중입니다'}
                    {userTab === 'notice' && '공지사항'}
                    {userTab === 'faq' && '자주 묻는 질문'}
                  </h2>

                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
                    {userTab === 'home' && '상단의 서비스 제목과 아이콘을 클릭하면 언제든 이 초기화면으로 돌아옵니다.'}
                    {userTab === 'history' && '사용자의 대여 신청 현황과 처리 상태를 확인할 수 있는 화면을 준비하고 있습니다.'}
                    {userTab === 'notice' && '운영 공지, 대여 정책, 점검 안내를 확인할 수 있습니다.'}
                    {userTab === 'faq' && '질문 유형별 FAQ를 선택하고 제목을 눌러 답변을 확인할 수 있습니다.'}
                  </p>
                </div>
              </div>

              <CardContent className="flex flex-1 flex-col px-3 py-4 sm:p-6">
                {userTab === 'notice' ? (
                  selectedNoticePost ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 sm:gap-5">
                      <article className="-mx-1 flex min-h-0 flex-1 flex-col bg-white sm:mx-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-200">
                        <div className="border-b border-slate-200 bg-white px-1.5 pb-4 sm:bg-slate-50 sm:px-5 sm:py-4">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            {selectedNoticePost.isPinned && (
                              <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 text-[10px] font-bold leading-none text-orange-700">
                                공지
                              </span>
                            )}

                            <h3 className="break-words text-base font-bold text-slate-900">
                              {selectedNoticePost.title}
                            </h3>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
                            <span>
                              등록자: {selectedNoticePost.authorName || '관리자'}
                            </span>
                            <span>
                              등록일: {formatFirestoreDate(
                                selectedNoticePost.createdAt
                              )}
                            </span>
                            <span>
                              조회수: {Number(
                                selectedNoticePost.viewCount
                              ) || 0}
                            </span>
                          </div>
                        </div>

                        <div className="flex-1 px-1.5 py-4 sm:px-5 sm:py-6">
                          <RichTextContent
                            html={selectedNoticePost.contentHtml}
                            text={selectedNoticePost.contentText || selectedNoticePost.content}
                            className="text-sm leading-7 text-slate-700"
                          />
                          <SecureAttachmentList attachments={selectedNoticePost.attachments} />
                        </div>
                      </article>

                      <div className="-mx-1 divide-y divide-slate-100 border-y border-slate-200 bg-white sm:mx-0 sm:hidden">
                        {[
                          ['이전글', selectedNoticePost.navigation?.previous],
                          ['다음글', selectedNoticePost.navigation?.next],
                        ].map(([label, item]) => (
                          <div key={label} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2 px-1.5 py-3">
                            <span className="text-center text-[11px] text-slate-500">{label}</span>
                            {item ? (
                              <button
                                type="button"
                                className="min-w-0 truncate text-left text-sm text-slate-800 hover:text-orange-600 hover:underline"
                                onClick={() => handleOpenNoticePost(item)}
                              >
                                {item.title}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">{label}이 없습니다.</span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white sm:block">
                        <table className="min-w-[680px] w-full border-collapse text-left">
                          <tbody>
                            {[
                              ['이전글', selectedNoticePost.navigation?.previous],
                              ['다음글', selectedNoticePost.navigation?.next],
                            ].map(([label, item]) => (
                              <tr key={label} className="border-b border-slate-100 last:border-b-0">
                                <td className="px-4 py-3">
                                  {item ? (
                                    <div className="flex min-w-0 items-center gap-3">
                                      <span className="w-12 shrink-0 text-[11px] font-normal text-slate-500">{label}</span>
                                      <button
                                        type="button"
                                        className="min-w-0 truncate text-left text-sm font-normal text-slate-800 hover:text-orange-600 hover:underline"
                                        onClick={() => handleOpenNoticePost(item)}
                                      >
                                        {item.title}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex min-w-0 items-center gap-3">
                                      <span className="w-12 shrink-0 text-[11px] font-normal text-slate-500">{label}</span>
                                      <span className="text-xs font-normal text-slate-400">{label}이 없습니다.</span>
                                    </div>
                                  )}
                                </td>
                                <td className="w-32 px-4 py-3 text-center text-xs text-slate-500">{item ? item.authorName || '관리자' : ''}</td>
                                <td className="w-32 px-4 py-3 text-center text-xs text-slate-500">{item ? formatFirestoreDate(item.createdAt) : ''}</td>
                                <td className="w-24 px-4 py-3 text-center text-xs text-slate-500">{item ? Number(item.viewCount || 0) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 px-4 py-2 text-xs"
                          onClick={handleCloseNoticePost}
                        >
                          목록으로
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="border-y border-slate-100 bg-white py-3 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-slate-50 sm:p-4">
                        <label className="block text-[11px] font-semibold text-slate-600">
                          공지사항 검색
                        </label>
                        <div className="relative mt-2">
                          <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            size={16}
                          />
                          <input
                            type="search"
                            value={userNoticeQuery}
                            onChange={(event) => {
                              setUserNoticeQuery(event.target.value);
                              setNoticePage(1);
                            }}
                            placeholder="공지사항 제목 또는 본문 검색"
                            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
                          />
                        </div>
                      </div>

                      {!noticePostsReady ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          공지사항을 불러오는 중입니다.
                        </div>
                      ) : noticePostsLoadErrorMessage ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                          {noticePostsLoadErrorMessage}
                        </div>
                      ) : noticePosts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          등록된 공지사항이 없습니다.
                        </div>
                      ) : pinnedNoticePosts.length + regularNoticePosts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          검색 조건에 맞는 공지사항이 없습니다.
                        </div>
                      ) : (
                        <>
                          <div className="-mx-1 border-y border-slate-200 bg-white sm:hidden">
                            <div className="grid grid-cols-[36px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 px-1 py-2.5 text-[10px] font-semibold text-slate-500">
                              <span className="text-center">번호</span>
                              <span className="px-2">제목</span>
                            </div>
                            {[
                              ...pinnedNoticePosts.map((post) => ({ post, isPinned: true, number: null })),
                              ...paginatedNoticePosts.map((post) => ({
                                post,
                                isPinned: false,
                                number: noticeRegularPostNumberById.get(post.id) || '-',
                              })),
                            ].map((item) => (
                              <div
                                key={item.post.id}
                                className="grid grid-cols-[36px_minmax(0,1fr)] border-b border-slate-100 px-1 py-3 last:border-b-0"
                              >
                                <div className="flex h-5 items-center justify-center text-xs leading-5 text-slate-500">
                                  {item.isPinned ? (
                                    <Pin size={13} className="shrink-0 text-orange-600" aria-label="상단 고정 공지" />
                                  ) : item.number}
                                </div>
                                <div className="min-w-0 px-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenNoticePost(item.post)}
                                    className="flex w-full items-baseline gap-1.5 break-words text-left text-sm font-semibold leading-5 text-slate-800 hover:text-orange-600 hover:underline"
                                  >
                                    {item.post.isPinned && (
                                      <span className="inline-flex h-[18px] shrink-0 items-center rounded-full border border-orange-200 bg-orange-50 px-2 text-[9px] font-bold leading-none text-orange-700">
                                        공지
                                      </span>
                                    )}
                                    <span className="min-w-0 break-words">{item.post.title}</span>
                                  </button>
                                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-4 text-slate-500">
                                    <span className="max-w-[7rem] truncate">{item.post.authorName || '관리자'}</span>
                                    <span aria-hidden="true" className="text-slate-300">·</span>
                                    <span className="whitespace-nowrap">{formatFirestoreDate(item.post.createdAt)}</span>
                                    <span aria-hidden="true" className="text-slate-300">·</span>
                                    <span className="whitespace-nowrap">조회 {Number(item.post.viewCount) || 0}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 sm:block">
                            <table className="min-w-[720px] w-full border-collapse text-left">
                              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                                <tr>
                                  <th className="w-20 border-b border-slate-200 px-4 py-3 text-center">
                                    번호
                                  </th>
                                  <th className="border-b border-slate-200 px-4 py-3 text-center">
                                    제목
                                  </th>
                                  <th className="w-32 border-b border-slate-200 px-4 py-3 text-center">
                                    등록자
                                  </th>
                                  <th className="w-32 border-b border-slate-200 px-4 py-3 text-center">
                                    등록일
                                  </th>
                                  <th className="w-24 border-b border-slate-200 px-4 py-3 text-center">
                                    조회수
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                {[
                                  ...pinnedNoticePosts.map((post) => ({
                                    post,
                                    isPinned: true,
                                    number: null,
                                  })),
                                  ...paginatedNoticePosts.map((post) => ({
                                    post,
                                    isPinned: false,
                                    number:
                                      noticeRegularPostNumberById.get(post.id) || '-',
                                  })),
                                ].map((item) => (
                                  <tr
                                    key={item.post.id}
                                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                                  >
                                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                                      {item.isPinned ? (
                                        <span
                                          className="inline-flex items-center justify-center text-orange-600"
                                          title="상단 고정 공지"
                                          aria-label="상단 고정 공지"
                                        >
                                          <Pin size={15} aria-hidden="true" />
                                        </span>
                                      ) : (
                                        item.number
                                      )}
                                    </td>

                                    <td className="px-4 py-3">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenNoticePost(
                                            item.post
                                          )
                                        }
                                        className="inline-flex items-baseline gap-2 break-words text-left text-sm font-semibold text-slate-800 hover:text-orange-600 hover:underline"
                                      >
                                        {item.post.isPinned && (
                                          <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-orange-200 bg-orange-50 px-2 text-[10px] font-bold leading-none text-orange-700">
                                            공지
                                          </span>
                                        )}
                                        <span className="min-w-0 break-words">{item.post.title}</span>
                                      </button>
                                    </td>

                                    <td className="px-4 py-3 text-center text-xs text-slate-600">
                                      {item.post.authorName || '관리자'}
                                    </td>

                                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                                      {formatFirestoreDate(
                                        item.post.createdAt
                                      )}
                                    </td>

                                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                                      {Number(
                                        item.post.viewCount
                                      ) || 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {regularNoticePosts.length > 0 && (
                            <PaginationControls
                              currentPage={safeNoticePage}
                              totalPages={noticeTotalPages}
                              onPageChange={(nextPage) => setNoticePage(nextPage)}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )
                ) : userTab === 'faq' ? (
                  <div className="space-y-5">
                    {!faqCategoriesReady ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-400">
                        FAQ 카테고리를 불러오는 중입니다.
                      </div>
                    ) : faqCategoriesLoadErrorMessage ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                        {faqCategoriesLoadErrorMessage}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            id: 'all',
                            name: '전체',
                          },
                          ...faqCategories,
                        ].map((category) => {
                          const isActive =
                            activeFaqCategoryId ===
                            category.id;

                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => {
                                setActiveFaqCategoryId(
                                  category.id
                                );
                                resetFaqHistoryToList();
                                setFaqPage(1);
                              }}
                              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                                isActive
                                  ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                              }`}
                            >
                              {category.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:rounded-2xl sm:p-4 sm:flex-row sm:items-center">
                      <div className="relative min-w-0 flex-1">
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={16}
                        />

                        <input
                          type="search"
                          value={faqQuery}
                          onChange={(event) => {
                            setFaqQuery(
                              event.target.value
                            );
                            resetFaqHistoryToList();
                            setFaqPage(1);
                          }}
                          placeholder="FAQ 제목 또는 본문 검색"
                          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
                        />
                      </div>

                      <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={
                            faqSearchWithinCategory
                          }
                          onChange={(event) => {
                            setFaqSearchWithinCategory(
                              event.target.checked
                            );
                            resetFaqHistoryToList();
                            setFaqPage(1);
                          }}
                          className="h-4 w-4 rounded border-slate-300 accent-orange-500"
                        />

                        <span>
                          {activeFaqCategoryName} 내 검색
                        </span>
                      </label>
                    </div>

                    {!faqPostsReady ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                        FAQ를 불러오는 중입니다.
                      </div>
                    ) : faqPostsLoadErrorMessage ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                        {faqPostsLoadErrorMessage}
                      </div>
                    ) : categoryFilteredFaqPosts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                        {faqQuery.trim()
                          ? '검색 조건에 맞는 FAQ가 없습니다.'
                          : '선택한 카테고리에 등록된 FAQ가 없습니다.'}
                      </div>
                    ) : (
                      <>
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-2xl">
                          {displayedFaqPosts.map(
                            (post, index, displayedPosts) => {
                            const isExpanded =
                              expandedFaqPostId ===
                              post.id;

                            return (
                              <div
                                key={post.id}
                                className={
                                  index <
                                  displayedPosts.length - 1
                                    ? 'border-b border-slate-100'
                                    : ''
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleFaqToggle(
                                      post.id
                                    )
                                  }
                                  className="grid w-full grid-cols-[minmax(0,1fr)_28px] items-center gap-2 px-3 py-3.5 text-left transition hover:bg-slate-50 sm:grid-cols-[150px_minmax(0,1fr)_28px] sm:gap-3 sm:px-5 sm:py-4"
                                >
                                  <div className="hidden sm:block">
                                    <span className="inline-flex max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                      {faqCategoryNameById.get(
                                        post.categoryId
                                      ) || '미분류'}
                                    </span>
                                  </div>

                                  <div className="min-w-0">
                                    <div className="mb-1 flex flex-wrap items-center gap-2 sm:hidden">
                                      <span className="inline-flex max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                                        {faqCategoryNameById.get(
                                          post.categoryId
                                        ) || '미분류'}
                                      </span>
                                    </div>

                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="w-6 shrink-0 text-sm font-black text-orange-600">
                                        Q.
                                      </span>

                                      {post.isPinned && (
                                        <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                          고정
                                        </span>
                                      )}

                                      <span className="min-w-0 flex-1 break-words text-sm font-bold text-slate-800">
                                        {post.title}
                                      </span>
                                    </div>
                                  </div>

                                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                                    {isExpanded ? (
                                      <ChevronUp
                                        size={15}
                                        strokeWidth={2}
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <ChevronDown
                                        size={15}
                                        strokeWidth={2}
                                        aria-hidden="true"
                                      />
                                    )}
                                  </span>
                                </button>

                                <AnimatePresence initial={false}>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{
                                        height: 0,
                                        opacity: 0,
                                      }}
                                      animate={{
                                        height: 'auto',
                                        opacity: 1,
                                      }}
                                      exit={{
                                        height: 0,
                                        opacity: 0,
                                      }}
                                      transition={{
                                        duration: 0.2,
                                      }}
                                      className="overflow-hidden"
                                    >
                                      <div className="grid grid-cols-[minmax(0,1fr)_28px] gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-4 sm:grid-cols-[150px_minmax(0,1fr)_28px] sm:gap-3 sm:px-5 sm:py-5">
                                        <div
                                          className="hidden sm:block"
                                          aria-hidden="true"
                                        />

                                        <div className="flex min-w-0 items-start gap-2">
                                          <span className="w-6 shrink-0 pt-0.5 text-sm font-black text-orange-600">
                                            A.
                                          </span>

                                          <div className="min-w-0 flex-1">
                                            <RichTextContent
                                              html={post.contentHtml}
                                              text={post.contentText || post.content}
                                              className="text-sm leading-7 text-slate-700"
                                            />
                                            <SecureAttachmentList attachments={post.attachments} />
                                          </div>
                                        </div>

                                        <div aria-hidden="true" />
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>

                        {regularFaqPosts.length > 0 && (
                          <PaginationControls
                            currentPage={safeFaqPage}
                            totalPages={faqTotalPages}
                            onPageChange={(nextPage) => {
                              setFaqPage(nextPage);
                              resetFaqHistoryToList();
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                      <Clock size={22} />
                    </div>

                    <h3 className="text-base font-bold text-slate-900">준비중입니다</h3>

                    <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">
                      현재는 화면 구조만 먼저 분리했습니다. 세부 기능은 이후 단계에서 하나씩 추가할 예정입니다.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
  );
}
