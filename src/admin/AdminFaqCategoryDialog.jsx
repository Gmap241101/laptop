import { Edit3, Plus, Save, Trash2, X } from 'lucide-react';

import ModalPortal from '../components/ModalPortal.jsx';

export default function AdminFaqCategoryDialog({
  open,
  Button,
  faqCategories = [],
  faqCategoriesLoadErrorMessage,
  faqCategoriesReady,
  faqCategoryDeletingId,
  faqCategorySavingId,
  faqPosts = [],
  newFaqCategoryName,
  editingFaqCategoryId,
  editingFaqCategoryName,
  addFaqCategory,
  confirmDeleteFaqCategory,
  saveFaqCategoryName,
  setEditingFaqCategoryId,
  setEditingFaqCategoryName,
  setNewFaqCategoryName,
  startEditFaqCategory,
  onClose,
}) {
  if (!open) return null;

  const busy = Boolean(faqCategorySavingId || faqCategoryDeletingId);
  const closeDialog = () => {
    if (busy) return;
    setEditingFaqCategoryId?.('');
    setEditingFaqCategoryName?.('');
    onClose?.();
  };

  return (
    <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-900">FAQ 카테고리 관리</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              FAQ 카테고리를 등록, 수정, 삭제합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            disabled={busy}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex gap-2">
            <input
              value={newFaqCategoryName}
              onChange={(event) => setNewFaqCategoryName?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addFaqCategory?.();
              }}
              placeholder="새 FAQ 카테고리명"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
            />
            <Button
              type="button"
              className="shrink-0 px-3 py-2"
              disabled={faqCategorySavingId === 'new'}
              onClick={addFaqCategory}
            >
              <Plus size={16} />
              등록
            </Button>
          </div>

          {!faqCategoriesReady ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-400">
              카테고리를 불러오는 중입니다.
            </div>
          ) : faqCategoriesLoadErrorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-700">
              {faqCategoriesLoadErrorMessage}
            </div>
          ) : faqCategories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-400">
              등록된 FAQ 카테고리가 없습니다.
            </div>
          ) : (
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {faqCategories.map((category) => {
                const categoryPostCount = faqPosts.filter(
                  (post) => post.categoryId === category.id
                ).length;
                const isEditing = editingFaqCategoryId === category.id;

                return (
                  <div
                    key={category.id}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-700"
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <input
                          value={editingFaqCategoryName}
                          onChange={(event) => setEditingFaqCategoryName?.(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') saveFaqCategoryName?.(category);
                            if (event.key === 'Escape') {
                              setEditingFaqCategoryId?.('');
                              setEditingFaqCategoryName?.('');
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                        />
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-lg px-2 py-1 text-xs"
                            disabled={faqCategorySavingId === category.id}
                            onClick={() => saveFaqCategoryName?.(category)}
                          >
                            <Save size={13} />
                            적용
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-lg px-2 py-1 text-xs"
                            disabled={faqCategorySavingId === category.id}
                            onClick={() => {
                              setEditingFaqCategoryId?.('');
                              setEditingFaqCategoryName?.('');
                            }}
                          >
                            <X size={13} />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-800">{category.name}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">FAQ {categoryPostCount}건</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-lg px-1 py-1 hover:bg-blue-50 hover:text-blue-600"
                            onClick={() => startEditFaqCategory?.(category)}
                          >
                            <Edit3 size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-lg px-1 py-1 hover:bg-rose-50 hover:text-rose-600"
                            disabled={faqCategoryDeletingId === category.id}
                            onClick={() => confirmDeleteFaqCategory?.(category)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={closeDialog} disabled={busy}>
              닫기
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
