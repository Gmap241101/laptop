export default function AdminNoticePanel({ ctx }) {
  const {
    AdminPageHeader,
    Button,
    Edit3,
    NOTICE_POSTS_PER_PAGE_OPTIONS,
    Pin,
    Plus,
    Save,
    Search,
    Select,
    Trash2,
    adminNoticeQuery,
    adminNoticeTotalPages,
    adminPinnedNoticePosts,
    adminRegularNoticePosts,
    confirmDeleteNoticePost,
    formatFirestoreDate,
    noticeBoardConfigLoadErrorMessage,
    noticeBoardConfigReady,
    noticeBoardConfigSaving,
    noticePostDeletingId,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsPerPageInput,
    noticePostsReady,
    noticeRegularPostNumberById,
    openNoticePostDialog,
    paginatedAdminNoticePosts,
    safeAdminNoticePage,
    saveNoticeBoardConfig,
    setAdminNoticePage,
    setAdminNoticeQuery,
    setNoticePostsPerPageInput,
  } = ctx;

  const filteredNoticeCount =
    adminPinnedNoticePosts.length + adminRegularNoticePosts.length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="공지사항 관리"
        description="사용자 화면에 표시되는 공지사항을 등록, 수정, 삭제하고 목록 표시 개수를 설정합니다."
        actions={
          <Button
            type="button"
            variant="primary"
            className="shrink-0 px-4 py-2 text-xs"
            onClick={() => openNoticePostDialog()}
          >
            <Plus size={14} />
            공지사항 등록
          </Button>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">목록 표시 설정</h3>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
              상단 고정 게시글은 제외하고 일반 게시글만 설정한 개수만큼 한 페이지에 표시합니다.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-end">
            <div className="w-full">
              <Select
                label="페이지당 일반 게시글 수"
                value={String(noticePostsPerPageInput)}
                onChange={(value) => setNoticePostsPerPageInput(Number(value))}
              >
                {NOTICE_POSTS_PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}개
                  </option>
                ))}
              </Select>
            </div>

            <Button
              type="button"
              variant="primary"
              className="h-10 w-full whitespace-nowrap px-4 text-xs"
              disabled={!noticeBoardConfigReady || noticeBoardConfigSaving}
              onClick={saveNoticeBoardConfig}
            >
              <Save size={14} />
              {noticeBoardConfigSaving ? '저장 중' : '설정 저장'}
            </Button>
          </div>
        </div>

        {noticeBoardConfigLoadErrorMessage && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            {noticeBoardConfigLoadErrorMessage}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
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
            value={adminNoticeQuery}
            onChange={(event) => {
              setAdminNoticeQuery(event.target.value);
              setAdminNoticePage(1);
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
      ) : filteredNoticeCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
          검색 조건에 맞는 공지사항이 없습니다.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="w-16 border-b border-slate-200 px-3 py-3 text-center">
                    번호
                  </th>
                  <th className="border-b border-slate-200 px-3 py-3">제목</th>
                  <th className="w-24 border-b border-slate-200 px-3 py-3 text-center">
                    등록자
                  </th>
                  <th className="w-28 border-b border-slate-200 px-3 py-3 text-center">
                    등록일
                  </th>
                  <th className="w-20 border-b border-slate-200 px-3 py-3 text-center">
                    조회수
                  </th>
                  <th className="w-48 border-b border-slate-200 px-3 py-3 text-center">
                    관리
                  </th>
                </tr>
              </thead>

              <tbody>
                {[
                  ...adminPinnedNoticePosts.map((post) => ({
                    post,
                    isPinned: true,
                    number: null,
                  })),
                  ...paginatedAdminNoticePosts.map((post) => ({
                    post,
                    isPinned: false,
                    number: noticeRegularPostNumberById.get(post.id) || '-',
                  })),
                ].map((item) => (
                  <tr
                    key={item.post.id}
                    className="border-b border-slate-100 align-middle last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="px-3 py-3 text-center text-xs text-slate-500">
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

                    <td className="min-w-0 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {item.post.isPinned && (
                          <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                            공지
                          </span>
                        )}

                        <span
                          title={item.post.title}
                          className="block min-w-0 flex-1 truncate text-sm font-semibold text-slate-800"
                        >
                          {item.post.title}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-center text-xs text-slate-600">
                      {item.post.authorName || '관리자'}
                    </td>

                    <td className="px-3 py-3 text-center text-xs text-slate-500">
                      {formatFirestoreDate(item.post.createdAt)}
                    </td>

                    <td className="px-3 py-3 text-center text-xs text-slate-500">
                      {Number(item.post.viewCount) || 0}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          className="whitespace-nowrap px-2.5 py-2 text-xs"
                          onClick={() => openNoticePostDialog(item.post)}
                        >
                          <Edit3 size={13} />
                          수정
                        </Button>

                        <Button
                          type="button"
                          variant="dangerOutline"
                          className="whitespace-nowrap px-2.5 py-2 text-xs"
                          disabled={noticePostDeletingId === item.post.id}
                          onClick={() => confirmDeleteNoticePost(item.post)}
                        >
                          <Trash2 size={13} />
                          {noticePostDeletingId === item.post.id
                            ? '삭제 중'
                            : '삭제'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {adminRegularNoticePosts.length > 0 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="px-3 py-2 text-xs"
                disabled={safeAdminNoticePage <= 1}
                onClick={() =>
                  setAdminNoticePage((prev) => Math.max(1, prev - 1))
                }
              >
                이전
              </Button>

              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {safeAdminNoticePage} / {adminNoticeTotalPages}
              </div>

              <Button
                type="button"
                variant="outline"
                className="px-3 py-2 text-xs"
                disabled={safeAdminNoticePage >= adminNoticeTotalPages}
                onClick={() =>
                  setAdminNoticePage((prev) =>
                    Math.min(adminNoticeTotalPages, prev + 1)
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
  );
}
