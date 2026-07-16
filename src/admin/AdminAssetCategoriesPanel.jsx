export default function AdminAssetCategoriesPanel({ ctx }) {
  const {
    Button,
    Edit3,
    Plus,
    Save,
    Trash2,
    X,
    addTempAssetCategory,
    applyEditTempAssetCategory,
    cancelTempAssetCategoryChanges,
    deleteTempAssetCategory,
    draggingAssetCategoryIndex,
    editingAssetCategoryIndex,
    editingAssetCategoryName,
    moveTempAssetCategory,
    newAssetCategory,
    saveTempAssetCategoryChanges,
    setDraggingAssetCategoryIndex,
    setEditingAssetCategoryIndex,
    setEditingAssetCategoryName,
    setNewAssetCategory,
    startEditTempAssetCategory,
    tempAssetCategories,
  } = ctx;

  return (
                    <div className="space-y-6">
                      <div className="grid gap-8 md:grid-cols-2">
                        {/* 자산 카테고리 관리 컬럼 */}
                        <div className="space-y-4">
                          <div className="border-b border-slate-100 pb-3">
                            <h2 className="text-base font-bold text-slate-900">자산 카테고리 관리</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">대여 자산 분류를 관리합니다.</p>
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={newAssetCategory}
                              onChange={(e) => setNewAssetCategory(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  addTempAssetCategory();
                                }
                              }}
                              placeholder="새로운 자산 카테고리 명칭"
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                            />
                            <Button
                              onClick={addTempAssetCategory}
                              className="px-3 py-2"
                            >
                              <Plus size={16} />
                            </Button>
                          </div>
                          <div className="rounded-xl bg-slate-100 p-4 border border-slate-200/50 text-xs text-slate-600">
                            💡 <b>운영 안내:</b> 카테고리 추가, 수정, 삭제, 순서 변경은 임시 편집 상태로 먼저 반영됩니다. 하단의 변경사항 저장을 눌러야 최종 DB에 저장됩니다.
                          </div>
                        </div>

                        {/* 등록된 자산 카테고리 목록 컬럼 */}
                        <div className="space-y-4">
                          <div className="border-b border-slate-100 pb-3">
                            <h2 className="text-base font-bold text-slate-900">등록된 자산 카테고리</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">카드를 드래그해서 대여 자산 등록 시 사용할 분류 순서를 변경할 수 있습니다.</p>
                          </div>
                          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                            {(tempAssetCategories || []).length === 0 ? (
                              <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-10 text-center text-slate-400 text-xs">
                                현재 등록된 자산 카테고리가 없습니다.
                              </div>
                            ) : (
                              (tempAssetCategories || []).map((category, index) => (
                                <div
                                  key={`${category}-${index}`}
                                  draggable={editingAssetCategoryIndex !== index}
                                  onDragStart={() => setDraggingAssetCategoryIndex(index)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    moveTempAssetCategory(draggingAssetCategoryIndex, index);
                                    setDraggingAssetCategoryIndex(null);
                                  }}
                                  onDragEnd={() => setDraggingAssetCategoryIndex(null)}
                                  className={`flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-100 text-xs text-slate-700 transition ${
                                    draggingAssetCategoryIndex === index
                                      ? 'opacity-50'
                                      : editingAssetCategoryIndex === index
                                        ? ''
                                        : 'cursor-move hover:bg-slate-100'
                                  }`}
                                >
                                  {editingAssetCategoryIndex === index ? (
                                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                                      <input
                                        value={editingAssetCategoryName}
                                        onChange={(e) => setEditingAssetCategoryName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            applyEditTempAssetCategory(category, index);
                                          }

                                          if (e.key === 'Escape') {
                                            setEditingAssetCategoryIndex(null);
                                            setEditingAssetCategoryName('');
                                          }
                                        }}
                                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                                      />
                                      <div className="flex shrink-0 gap-1">
                                        <Button
                                          onClick={() => applyEditTempAssetCategory(category, index)}
                                          variant="outline"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <Save size={13} /> 적용
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            setEditingAssetCategoryIndex(null);
                                            setEditingAssetCategoryName('');
                                          }}
                                          variant="ghost"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <X size={13} />
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <span>{category}</span>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            startEditTempAssetCategory(category, index);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                                        >
                                          <Edit3 size={14} />
                                        </Button>
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTempAssetCategory(category, index);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                        >
                                          <Trash2 size={14} />
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200/60">
                        <Button
                          variant="outline"
                          onClick={cancelTempAssetCategoryChanges}
                        >
                          취소
                        </Button>
                        <Button
                          variant="primary"
                          onClick={saveTempAssetCategoryChanges}
                        >
                          변경사항 저장
                        </Button>
                      </div>
                    </div>
  );
}
