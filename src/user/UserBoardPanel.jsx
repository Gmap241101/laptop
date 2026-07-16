export default function UserBoardPanel({ ctx }) {
  const {
    AlertCircle,
    AnimatePresence,
    Button,
    Card,
    CardContent,
    Clock,
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
    noticePostsPerPage,
    noticePostsReady,
    noticeTotalPages,
    openNoticePost,
    paginatedNoticePosts,
    pinnedNoticePosts,
    pushAppPath,
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
    setIsCommunityMenuOpen,
    setNoticePage,
    setUserTab,
    setView,
    toggleFaqPost,
    userTab,
  } = ctx;

  return (
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-10 text-white">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                <div className="relative mx-auto max-w-3xl text-center">
                  <h2 className="text-2xl font-black tracking-tight">
                    {userTab === 'home' && '초기화면 준비중입니다'}
                    {userTab === 'history' && '신청내역 화면 준비중입니다'}
                    {userTab === 'notice' && '공지사항'}
                    {userTab === 'faq' && '자주 묻는 질문'}
                    {userTab === 'notFound' && '404 - 페이지를 찾을 수 없습니다'}
                  </h2>

                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
                    {userTab === 'home' && '상단의 서비스 제목과 아이콘을 클릭하면 언제든 이 초기화면으로 돌아옵니다.'}
                    {userTab === 'history' && '사용자의 대여 신청 현황과 처리 상태를 확인할 수 있는 화면을 준비하고 있습니다.'}
                    {userTab === 'notice' && '운영 공지, 대여 정책, 점검 안내를 확인할 수 있습니다.'}
                    {userTab === 'faq' && '질문 유형별 FAQ를 선택하고 제목을 눌러 답변을 확인할 수 있습니다.'}
                    {userTab === 'notFound' && '입력하신 주소와 일치하는 메뉴를 찾을 수 없습니다.'}
                  </p>
                </div>
              </div>

              <CardContent className="p-6">
                {userTab === 'notFound' ? (
                  <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 px-6 py-12 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-sm">
                      <AlertCircle size={26} />
                    </div>

                    <h3 className="text-lg font-bold text-slate-900">
                      요청하신 페이지가 없습니다
                    </h3>

                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                      주소가 잘못 입력되었거나, 아직 제공되지 않는 메뉴입니다.
                      아래 버튼을 통해 기기 대여 시스템의 주요 화면으로 이동할 수 있습니다.
                    </p>

                    <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                      <Button
                        type="button"
                        onClick={goToUserHome}
                        variant="primary"
                        className="w-full sm:w-auto"
                      >
                        초기화면으로 이동
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          pushAppPath('user', 'rental');
                          setView('user');
                          setUserTab('rental');
                          setIsCommunityMenuOpen(false);
                        }}
                        className="w-full sm:w-auto"
                      >
                        대여신청으로 이동
                      </Button>
                    </div>
                  </div>
                ) : userTab === 'notice' ? (
                  selectedNoticePost ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                        <div>
                          <h3 className="text-base font-bold text-slate-900">
                            공지사항
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            선택한 공지사항의 상세 내용을 확인합니다.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 px-4 py-2 text-xs"
                          onClick={closeNoticePost}
                        >
                          목록으로
                        </Button>
                      </div>

                      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {selectedNoticePost.isPinned && (
                              <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700">
                                상단 고정
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

                        <div className="min-h-[260px] whitespace-pre-wrap break-words px-5 py-6 text-sm leading-7 text-slate-700">
                          {selectedNoticePost.content}
                        </div>
                      </article>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="border-b border-slate-100 pb-4">
                        <h3 className="text-base font-bold text-slate-900">
                          공지사항
                        </h3>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          제목을 클릭하면 공지사항 상세 내용을 확인할 수 있습니다.
                        </p>
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
                      ) : (
                        <>
                          <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="min-w-[720px] w-full border-collapse text-left">
                              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                                <tr>
                                  <th className="w-20 border-b border-slate-200 px-4 py-3 text-center">
                                    번호
                                  </th>
                                  <th className="border-b border-slate-200 px-4 py-3">
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
                                  ...pinnedNoticePosts.map(
                                    (post) => ({
                                      post,
                                      number: '공지',
                                    })
                                  ),
                                  ...paginatedNoticePosts.map(
                                    (post, index) => ({
                                      post,
                                      number:
                                        regularNoticePosts.length -
                                        (
                                          (safeNoticePage - 1) *
                                          noticePostsPerPage
                                        ) -
                                        index,
                                    })
                                  ),
                                ].map((item) => (
                                  <tr
                                    key={item.post.id}
                                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                                  >
                                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                                      {item.number}
                                    </td>

                                    <td className="px-4 py-3">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openNoticePost(
                                            item.post
                                          )
                                        }
                                        className="break-words text-left text-sm font-semibold text-slate-800 hover:text-orange-600 hover:underline"
                                      >
                                        {item.post.isPinned && (
                                          <span className="mr-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                            고정
                                          </span>
                                        )}
                                        {item.post.title}
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
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={safeNoticePage <= 1}
                                onClick={() =>
                                  setNoticePage((prev) =>
                                    Math.max(1, prev - 1)
                                  )
                                }
                              >
                                이전
                              </Button>

                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                {safeNoticePage} / {noticeTotalPages}
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeNoticePage >=
                                  noticeTotalPages
                                }
                                onClick={() =>
                                  setNoticePage((prev) =>
                                    Math.min(
                                      noticeTotalPages,
                                      prev + 1
                                    )
                                  )
                                }
                              >
                                다음
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                ) : userTab === 'faq' ? (
                  <div className="space-y-5">
                    <div className="border-b border-slate-100 pb-4">
                      <h3 className="text-base font-bold text-slate-900">
                        자주 묻는 질문
                      </h3>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        카테고리를 선택한 뒤 제목을 클릭하면 같은 화면에서 답변이 열립니다.
                      </p>
                    </div>

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
                                setExpandedFaqPostId('');
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

                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
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
                            setExpandedFaqPostId('');
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
                            setExpandedFaqPostId('');
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
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                                    toggleFaqPost(
                                      post.id
                                    )
                                  }
                                  className="grid w-full grid-cols-[minmax(0,1fr)_28px] items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:grid-cols-[150px_minmax(0,1fr)_28px] sm:px-5"
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

                                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-semibold text-slate-500">
                                    {isExpanded
                                      ? '−'
                                      : '+'}
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
                                      <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-5 sm:pl-[175px]">
                                        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                                          {post.content}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>

                        {regularFaqPosts.length > 0 && (
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-2 text-xs"
                              disabled={safeFaqPage <= 1}
                              onClick={() => {
                                setFaqPage((prev) =>
                                  Math.max(1, prev - 1)
                                );
                                setExpandedFaqPostId('');
                              }}
                            >
                              이전
                            </Button>

                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                              {safeFaqPage} / {faqTotalPages}
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-2 text-xs"
                              disabled={
                                safeFaqPage >=
                                faqTotalPages
                              }
                              onClick={() => {
                                setFaqPage((prev) =>
                                  Math.min(
                                    faqTotalPages,
                                    prev + 1
                                  )
                                );
                                setExpandedFaqPostId('');
                              }}
                            >
                              다음
                            </Button>
                          </div>
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
