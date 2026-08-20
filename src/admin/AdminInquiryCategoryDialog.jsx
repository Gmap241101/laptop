import { Edit3, Plus, Save, Trash2, X } from 'lucide-react';

import ModalPortal from '../components/ModalPortal.jsx';

export default function AdminInquiryCategoryDialog({
  open,
  Button,
  categories = [],
  categoryDeletingId,
  categorySavingId,
  newCategoryName,
  editingCategoryId,
  editingCategoryName,
  addCategory,
  confirmDeleteCategory,
  saveCategoryName,
  setEditingCategoryId,
  setEditingCategoryName,
  setNewCategoryName,
  startEditCategory,
  onClose,
}) {
  if (!open) return null;

  const busy = Boolean(categorySavingId || categoryDeletingId);
  const closeDialog = () => {
    if (busy) return;
    setEditingCategoryId?.('');
    setEditingCategoryName?.('');
    onClose?.();
  };

  return (
    <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-900">문의 구분 관리</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              문의 구분을 등록, 수정, 삭제합니다.
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
              value={newCategoryName}
              onChange={(event) => setNewCategoryName?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addCategory?.();
              }}
              placeholder="새 문의 구분명"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
            />
            <Button
              type="button"
              className="shrink-0 px-3 py-2"
              disabled={categorySavingId === 'new'}
              onClick={addCategory}
            >
              <Plus size={16} />
              등록
            </Button>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-400">
              등록된 문의 구분이 없습니다.
            </div>
          ) : (
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {categories.map((category) => {
                const isEditing = editingCategoryId === category.id;

                return (
                  <div
                    key={category.id}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-700"
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <input
                          value={editingCategoryName}
                          onChange={(event) => setEditingCategoryName?.(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') saveCategoryName?.(category);
                            if (event.key === 'Escape') {
                              setEditingCategoryId?.('');
                              setEditingCategoryName?.('');
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                        />
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-lg px-2 py-1 text-xs"
                            disabled={categorySavingId === category.id}
                            onClick={() => saveCategoryName?.(category)}
                          >
                            <Save size={13} />
                            적용
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-lg px-2 py-1 text-xs"
                            disabled={categorySavingId === category.id}
                            onClick={() => {
                              setEditingCategoryId?.('');
                              setEditingCategoryName?.('');
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
                          <div className="mt-0.5 text-[10px] text-slate-400">문의 {Number(category.inquiryCount || 0)}건</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-lg px-1 py-1 hover:bg-blue-50 hover:text-blue-600"
                            onClick={() => startEditCategory?.(category)}
                          >
                            <Edit3 size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-lg px-1 py-1 hover:bg-rose-50 hover:text-rose-600"
                            disabled={categoryDeletingId === category.id}
                            onClick={() => confirmDeleteCategory?.(category)}
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
