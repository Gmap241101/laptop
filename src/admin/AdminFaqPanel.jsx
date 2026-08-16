import { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

import RichTextContent from '../components/RichTextContent.jsx';
import AdminBoardListSettingsDialog from './AdminBoardListSettingsDialog.jsx';
import AdminFaqCategoryDialog from './AdminFaqCategoryDialog.jsx';

export default function AdminFaqPanel({ ctx }) {
  const {
    AdminPageHeader,
    AnimatePresence,
    Button,
    Edit3,
    FAQ_POSTS_PER_PAGE_OPTIONS,
    Search,
    activeFaqCategoryId,
    activeFaqCategoryName,
    addFaqCategory,
    adminExpandedFaqPostId,
    adminFaqTotalPages,
    adminPinnedFaqPosts,
    adminRegularFaqPosts,
    confirmDeleteFaqCategory,
    confirmDeleteFaqPost,
    discardFaqBoardConfigChanges,
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
    faqQuery,
    faqRegularTotalCount,
    faqSearchWithinCategory,
    motion,
    newFaqCategoryName,
    openFaqPostDialog,
    paginatedAdminFaqPosts,
    safeAdminFaqPage,
    saveFaqBoardConfig,
    saveFaqCategoryName,
    setActiveFaqCategoryId,
    setAdminExpandedFaqPostId,
    setAdminFaqPage,
    setEditingFaqCategoryId,
    setEditingFaqCategoryName,
    setFaqPostsPerPageInput,
    setFaqQuery,
    setFaqSearchWithinCategory,
    setNewFaqCategoryName,
    startEditFaqCategory,
    toggleAdminFaqPost,
  } = ctx;

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const faqResultCount = adminPinnedFaqPosts.length + Number(faqRegularTotalCount || 0);

  return (
                    <div className="space-y-6">
                      <AdminPageHeader
                        title="FAQ 관리"
                        description="FAQ 카테고리와 질문·답변을 등록, 수정, 삭제하고 목록 표시 개수를 설정합니다."
                      />

                      {faqCategoriesReady && !faqCategoriesLoadErrorMessage && faqCategories.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveFaqCategoryId('all');
                              setAdminExpandedFaqPostId('');
                              setAdminFaqPage(1);
                            }}
                            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                              activeFaqCategoryId === 'all'
                                ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                            }`}
                          >
                            전체
                          </button>
                          {faqCategories.map((category) => {
                            const isActive = activeFaqCategoryId === category.id;
                            return (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => {
                                  setActiveFaqCategoryId(category.id);
                                  setAdminExpandedFaqPostId('');
                                  setAdminFaqPage(1);
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
                      ) : null}

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
                              setFaqQuery(event.target.value);
                              setAdminExpandedFaqPostId('');
                              setAdminFaqPage(1);
                            }}
                            placeholder="FAQ 제목 또는 본문 검색"
                            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
                          />
                        </div>
                        <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={faqSearchWithinCategory}
                            onChange={(event) => {
                              setFaqSearchWithinCategory(event.target.checked);
                              setAdminExpandedFaqPostId('');
                              setAdminFaqPage(1);
                            }}
                            className="h-4 w-4 rounded border-slate-300 accent-orange-500"
                          />
                          <span>{activeFaqCategoryName} 내 검색</span>
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
                      ) : faqPosts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          {faqQuery.trim()
                            ? '검색 조건에 맞는 FAQ가 없습니다.'
                            : activeFaqCategoryId !== 'all'
                              ? '선택한 카테고리에 등록된 FAQ가 없습니다.'
                              : '등록된 FAQ가 없습니다.'}
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
                                      <span className="w-6 shrink-0 text-sm font-black text-orange-600">
                                        Q.
                                      </span>

                                      {post.isPinned && (
                                        <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                          고정
                                        </span>
                                      )}

                                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                                        {post.title}
                                      </span>

                                      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400">
                                        {isExpanded ? (
                                          <ChevronUp
                                            size={16}
                                            strokeWidth={2}
                                            aria-hidden="true"
                                          />
                                        ) : (
                                          <ChevronDown
                                            size={16}
                                            strokeWidth={2}
                                            aria-hidden="true"
                                          />
                                        )}
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
                                        <div className="grid grid-cols-[140px_minmax(0,1fr)_170px] border-t border-slate-100 bg-slate-50/70">
                                          <div aria-hidden="true" />

                                          <div className="flex min-w-0 items-start gap-2 px-4 py-5">
                                            <span className="w-6 shrink-0 pt-0.5 text-sm font-black text-orange-600">
                                              A.
                                            </span>

                                            <RichTextContent
                                              html={post.contentHtml}
                                              text={post.contentText || post.content}
                                              className="min-w-0 flex-1 text-sm leading-7 text-slate-700"
                                            />
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

                        </>
                      )}

                      {faqPostsReady && !faqPostsLoadErrorMessage ? (
                        <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                          <div className="text-[11px] text-slate-500 sm:justify-self-start">
                            전체 FAQ {faqResultCount}건 · {safeAdminFaqPage} / {adminFaqTotalPages}페이지
                          </div>
                          <div className="flex items-center justify-center gap-2 sm:justify-self-center">
                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-2 text-xs"
                              disabled={safeAdminFaqPage <= 1}
                              onClick={() => {
                                setAdminFaqPage((prev) => Math.max(1, prev - 1));
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
                              disabled={safeAdminFaqPage >= adminFaqTotalPages}
                              onClick={() => {
                                setAdminFaqPage((prev) => Math.min(adminFaqTotalPages, prev + 1));
                                setAdminExpandedFaqPostId('');
                              }}
                            >
                              다음
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-self-end">
                            <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(true)}>카테고리 관리</Button>
                            <Button type="button" variant="outline" onClick={() => setSettingsDialogOpen(true)}>목록 표시 설정</Button>
                            <Button type="button" variant="primary" onClick={() => openFaqPostDialog()}>FAQ 등록</Button>
                          </div>
                        </div>
                      ) : null}

                      <AdminFaqCategoryDialog
                        open={categoryDialogOpen}
                        Button={Button}
                        faqCategories={faqCategories}
                        faqCategoriesLoadErrorMessage={faqCategoriesLoadErrorMessage}
                        faqCategoriesReady={faqCategoriesReady}
                        faqCategoryDeletingId={faqCategoryDeletingId}
                        faqCategorySavingId={faqCategorySavingId}
                        faqPosts={faqPosts}
                        newFaqCategoryName={newFaqCategoryName}
                        editingFaqCategoryId={editingFaqCategoryId}
                        editingFaqCategoryName={editingFaqCategoryName}
                        addFaqCategory={addFaqCategory}
                        confirmDeleteFaqCategory={confirmDeleteFaqCategory}
                        saveFaqCategoryName={saveFaqCategoryName}
                        setEditingFaqCategoryId={setEditingFaqCategoryId}
                        setEditingFaqCategoryName={setEditingFaqCategoryName}
                        setNewFaqCategoryName={setNewFaqCategoryName}
                        startEditFaqCategory={startEditFaqCategory}
                        onClose={() => setCategoryDialogOpen(false)}
                      />

                      <AdminBoardListSettingsDialog
                        open={settingsDialogOpen}
                        title="FAQ 목록 표시 설정"
                        description="상단 고정 FAQ를 제외한 일반 FAQ만 설정한 개수만큼 한 페이지에 표시합니다."
                        selectLabel="페이지당 일반 FAQ 수"
                        value={faqPostsPerPageInput}
                        options={FAQ_POSTS_PER_PAGE_OPTIONS}
                        ready={faqBoardConfigReady}
                        saving={faqBoardConfigSaving}
                        errorMessage={faqBoardConfigLoadErrorMessage}
                        Button={Button}
                        onChange={setFaqPostsPerPageInput}
                        onDiscard={discardFaqBoardConfigChanges}
                        onSave={saveFaqBoardConfig}
                        onClose={() => setSettingsDialogOpen(false)}
                      />
                    </div>
  );
}
