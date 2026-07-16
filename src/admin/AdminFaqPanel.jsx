export default function AdminFaqPanel({ ctx }) {
  const {
    AnimatePresence,
    Button,
    Edit3,
    FAQ_POSTS_PER_PAGE_OPTIONS,
    Plus,
    Save,
    Select,
    Trash2,
    X,
    addFaqCategory,
    adminExpandedFaqPostId,
    adminFaqTotalPages,
    adminPinnedFaqPosts,
    adminRegularFaqPosts,
    confirmDeleteFaqCategory,
    confirmDeleteFaqPost,
    editingFaqCategoryId,
    editingFaqCategoryName,
    faqBoardConfigLoadErrorMessage,
    faqBoardConfigReady,
    faqBoardConfigSaving,
    faqCategories,
    faqCategoriesLoadErrorMessage,
    faqCategoriesReady,
    faqCategoryDeletingId,
    faqCategoryNameById,
    faqCategorySavingId,
    faqPostDeletingId,
    faqPosts,
    faqPostsLoadErrorMessage,
    faqPostsPerPageInput,
    faqPostsReady,
    motion,
    newFaqCategoryName,
    openFaqPostDialog,
    paginatedAdminFaqPosts,
    safeAdminFaqPage,
    saveFaqBoardConfig,
    saveFaqCategoryName,
    setAdminExpandedFaqPostId,
    setAdminFaqPage,
    setEditingFaqCategoryId,
    setEditingFaqCategoryName,
    setFaqPostsPerPageInput,
    setNewFaqCategoryName,
    startEditFaqCategory,
    toggleAdminFaqPost,
  } = ctx;

  return (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">
                            FAQ 관리
                          </h2>

                          <p className="mt-1 text-xs text-slate-500">
                            FAQ 카테고리와 질문·답변을 등록, 수정, 삭제하고 목록 표시 개수를 설정합니다.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="primary"
                          className="shrink-0 px-4 py-2 text-xs"
                          onClick={() =>
                            openFaqPostDialog()
                          }
                        >
                          <Plus size={14} />
                          FAQ 등록
                        </Button>
                      </div>

                      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="border-b border-slate-200 pb-3">
                            <h3 className="text-sm font-bold text-slate-900">
                              FAQ 카테고리 관리
                            </h3>

                            <p className="mt-1 text-[11px] leading-5 text-slate-500">
                              부서 관리와 같은 방식으로 카테고리를 등록, 수정, 삭제합니다.
                            </p>
                          </div>

                          <div className="mt-4 flex gap-2">
                            <input
                              value={newFaqCategoryName}
                              onChange={(event) =>
                                setNewFaqCategoryName(
                                  event.target.value
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  addFaqCategory();
                                }
                              }}
                              placeholder="새 FAQ 카테고리명"
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                            />

                            <Button
                              type="button"
                              className="shrink-0 px-3 py-2"
                              disabled={
                                faqCategorySavingId ===
                                'new'
                              }
                              onClick={addFaqCategory}
                            >
                              <Plus size={16} />
                            </Button>
                          </div>

                          {!faqCategoriesReady ? (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
                              카테고리를 불러오는 중입니다.
                            </div>
                          ) : faqCategoriesLoadErrorMessage ? (
                            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-700">
                              {faqCategoriesLoadErrorMessage}
                            </div>
                          ) : faqCategories.length === 0 ? (
                            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
                              등록된 FAQ 카테고리가 없습니다.
                            </div>
                          ) : (
                            <div className="mt-4 max-h-80 space-y-1 overflow-y-auto pr-1">
                              {faqCategories.map(
                                (category) => {
                                  const categoryPostCount =
                                    faqPosts.filter(
                                      (post) =>
                                        post.categoryId ===
                                        category.id
                                    ).length;

                                  const isEditing =
                                    editingFaqCategoryId ===
                                    category.id;

                                  return (
                                    <div
                                      key={category.id}
                                      className="rounded-xl border border-slate-100 bg-white px-3.5 py-2 text-xs text-slate-700"
                                    >
                                      {isEditing ? (
                                        <div className="flex flex-col gap-2">
                                          <input
                                            value={
                                              editingFaqCategoryName
                                            }
                                            onChange={(event) =>
                                              setEditingFaqCategoryName(
                                                event.target.value
                                              )
                                            }
                                            onKeyDown={(event) => {
                                              if (
                                                event.key ===
                                                'Enter'
                                              ) {
                                                saveFaqCategoryName(
                                                  category
                                                );
                                              }

                                              if (
                                                event.key ===
                                                'Escape'
                                              ) {
                                                setEditingFaqCategoryId(
                                                  ''
                                                );
                                                setEditingFaqCategoryName(
                                                  ''
                                                );
                                              }
                                            }}
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                                          />

                                          <div className="flex justify-end gap-1">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              className="rounded-lg px-2 py-1 text-xs"
                                              disabled={
                                                faqCategorySavingId ===
                                                category.id
                                              }
                                              onClick={() =>
                                                saveFaqCategoryName(
                                                  category
                                                )
                                              }
                                            >
                                              <Save size={13} />
                                              적용
                                            </Button>

                                            <Button
                                              type="button"
                                              variant="ghost"
                                              className="rounded-lg px-2 py-1 text-xs"
                                              disabled={
                                                faqCategorySavingId ===
                                                category.id
                                              }
                                              onClick={() => {
                                                setEditingFaqCategoryId(
                                                  ''
                                                );
                                                setEditingFaqCategoryName(
                                                  ''
                                                );
                                              }}
                                            >
                                              <X size={13} />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="truncate font-semibold text-slate-800">
                                              {category.name}
                                            </div>

                                            <div className="mt-0.5 text-[10px] text-slate-400">
                                              FAQ {categoryPostCount}건
                                            </div>
                                          </div>

                                          <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              className="rounded-lg px-1 py-1 hover:bg-blue-50 hover:text-blue-600"
                                              onClick={() =>
                                                startEditFaqCategory(
                                                  category
                                                )
                                              }
                                            >
                                              <Edit3 size={14} />
                                            </Button>

                                            <Button
                                              type="button"
                                              variant="ghost"
                                              className="rounded-lg px-1 py-1 hover:bg-rose-50 hover:text-rose-600"
                                              disabled={
                                                faqCategoryDeletingId ===
                                                category.id
                                              }
                                              onClick={() =>
                                                confirmDeleteFaqCategory(
                                                  category
                                                )
                                              }
                                            >
                                              <Trash2 size={14} />
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                          <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-slate-900">
                                목록 표시 설정
                              </h3>

                              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
                                상단 고정 FAQ는 제외하고 일반 FAQ만 설정한 개수만큼 한 페이지에 표시합니다.
                              </p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-end">
                              <div className="w-full">
                                <Select
                                  label="페이지당 일반 FAQ 수"
                                  value={String(
                                    faqPostsPerPageInput
                                  )}
                                  onChange={(value) =>
                                    setFaqPostsPerPageInput(
                                      Number(value)
                                    )
                                  }
                                >
                                  {FAQ_POSTS_PER_PAGE_OPTIONS.map(
                                    (option) => (
                                      <option
                                        key={option}
                                        value={option}
                                      >
                                        {option}개
                                      </option>
                                    )
                                  )}
                                </Select>
                              </div>

                              <Button
                                type="button"
                                variant="primary"
                                className="h-10 w-full whitespace-nowrap px-4 text-xs"
                                disabled={
                                  !faqBoardConfigReady ||
                                  faqBoardConfigSaving
                                }
                                onClick={saveFaqBoardConfig}
                              >
                                <Save size={14} />
                                {faqBoardConfigSaving
                                  ? '저장 중'
                                  : '설정 저장'}
                              </Button>
                            </div>
                          </div>

                          {faqBoardConfigLoadErrorMessage && (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                              {faqBoardConfigLoadErrorMessage}
                            </div>
                          )}
                        </div>
                      </div>

                      {!faqPostsReady ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          FAQ를 불러오는 중입니다.
                        </div>
                      ) : faqPostsLoadErrorMessage ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                          {faqPostsLoadErrorMessage}
                        </div>
                      ) : faqPosts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          등록된 FAQ가 없습니다.
                        </div>
                      ) : (
                        <>
                          <div className="overflow-hidden rounded-xl border border-slate-200">
                            <div className="grid grid-cols-[140px_minmax(0,1fr)_170px] border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                              <div className="px-4 py-3">
                                카테고리
                              </div>
                              <div className="px-4 py-3">
                                제목
                              </div>
                              <div className="px-4 py-3 text-center">
                                관리
                              </div>
                            </div>

                            {[
                              ...adminPinnedFaqPosts,
                              ...paginatedAdminFaqPosts,
                            ].map((post, index, displayedPosts) => {
                              const isExpanded =
                                adminExpandedFaqPostId ===
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
                                  <div className="grid grid-cols-[140px_minmax(0,1fr)_170px] items-center">
                                    <div className="px-4 py-3">
                                      <span className="inline-flex max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                                        {faqCategoryNameById.get(
                                          post.categoryId
                                        ) || '미분류'}
                                      </span>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleAdminFaqPost(
                                          post.id
                                        )
                                      }
                                      className="flex min-w-0 items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
                                    >
                                      {post.isPinned && (
                                        <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                          고정
                                        </span>
                                      )}

                                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                                        {post.title}
                                      </span>

                                      <span className="shrink-0 text-base font-semibold text-slate-400">
                                        {isExpanded
                                          ? '−'
                                          : '+'}
                                      </span>
                                    </button>

                                    <div className="flex items-center justify-center gap-1.5 px-3 py-3">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="whitespace-nowrap px-2.5 py-2 text-xs"
                                        onClick={() =>
                                          openFaqPostDialog(
                                            post
                                          )
                                        }
                                      >
                                        <Edit3 size={13} />
                                        수정
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="dangerOutline"
                                        className="whitespace-nowrap px-2.5 py-2 text-xs"
                                        disabled={
                                          faqPostDeletingId ===
                                          post.id
                                        }
                                        onClick={() =>
                                          confirmDeleteFaqPost(
                                            post
                                          )
                                        }
                                      >
                                        <Trash2 size={13} />
                                        {faqPostDeletingId ===
                                        post.id
                                          ? '삭제 중'
                                          : '삭제'}
                                      </Button>
                                    </div>
                                  </div>

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
                                        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-5 text-sm leading-7 text-slate-700">
                                          <div className="whitespace-pre-wrap break-words">
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

                          {adminRegularFaqPosts.length > 0 && (
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminFaqPage <= 1
                                }
                                onClick={() => {
                                  setAdminFaqPage((prev) =>
                                    Math.max(1, prev - 1)
                                  );
                                  setAdminExpandedFaqPostId('');
                                }}
                              >
                                이전
                              </Button>

                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                {safeAdminFaqPage} / {adminFaqTotalPages}
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminFaqPage >=
                                  adminFaqTotalPages
                                }
                                onClick={() => {
                                  setAdminFaqPage((prev) =>
                                    Math.min(
                                      adminFaqTotalPages,
                                      prev + 1
                                    )
                                  );
                                  setAdminExpandedFaqPostId('');
                                }}
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
