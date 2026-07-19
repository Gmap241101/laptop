export default function AdminOrganizationPanel({ ctx }) {
  const {
    Button,
    Edit3,
    Plus,
    Save,
    Trash2,
    X,
    addTempBorrower,
    addTempTeam,
    applyEditTempBorrower,
    applyEditTempTeam,
    cancelTempPeopleChanges,
    deleteTempBorrower,
    deleteTempTeam,
    displayedTempBorrowers,
    draggingBorrowerIndex,
    draggingTeamIndex,
    editingBorrowerIndex,
    editingBorrowerName,
    editingTeamIndex,
    editingTeamName,
    moveTempBorrower,
    moveTempTeam,
    newBorrower,
    newBorrowerTeam,
    newTeam,
    saveTempPeopleChanges,
    setDraggingBorrowerIndex,
    setDraggingTeamIndex,
    setEditingBorrowerIndex,
    setEditingBorrowerName,
    setEditingTeamIndex,
    setEditingTeamName,
    setNewBorrower,
    setNewBorrowerTeam,
    setNewTeam,
    startEditTempBorrower,
    startEditTempTeam,
    tempTeams,
  } = ctx;

  return (
                    <div className="space-y-6">
                      <div className="grid gap-8 md:grid-cols-2">
                        {/* 부서/팀 관리 컬럼 */}
                        <div className="space-y-4">
                          <div className="border-b border-slate-100 pb-3">
                            <h2 className="text-base font-bold text-slate-900">부서 관리</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">부서 카드를 드래그해서 사용자 화면에 표시될 부서 순서를 변경할 수 있습니다.</p>
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={newTeam}
                              onChange={(e) => setNewTeam(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  addTempTeam();
                                }
                              }}
                              placeholder="새로운 등록 부서 명칭"
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                            />
                            <Button
                              onClick={addTempTeam}
                              className="px-3 py-2"
                            >
                              <Plus size={16} />
                            </Button>
                          </div>
                          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                            {(tempTeams || []).length === 0 ? (
                              <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-10 text-center text-slate-400 text-xs">
                                현재 등록된 부서가 없습니다.
                              </div>
                            ) : (
                              (tempTeams || []).map((t, index) => (
                                <div
                                  key={`${t}-${index}`}
                                  draggable={editingTeamIndex !== index}
                                  onDragStart={() => setDraggingTeamIndex(index)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    moveTempTeam(draggingTeamIndex, index);
                                    setDraggingTeamIndex(null);
                                  }}
                                  onDragEnd={() => setDraggingTeamIndex(null)}
                                  className={`flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-100 text-xs text-slate-700 transition ${
                                    draggingTeamIndex === index
                                      ? 'opacity-50'
                                      : editingTeamIndex === index
                                        ? ''
                                        : 'cursor-move hover:bg-slate-100'
                                  }`}
                                >
                                  {editingTeamIndex === index ? (
                                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                                      <input
                                        value={editingTeamName}
                                        onChange={(e) => setEditingTeamName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            applyEditTempTeam(t, index);
                                          }

                                          if (e.key === 'Escape') {
                                            setEditingTeamIndex(null);
                                            setEditingTeamName('');
                                          }
                                        }}
                                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                                      />
                                      <div className="flex shrink-0 gap-1">
                                        <Button
                                          onClick={() => applyEditTempTeam(t, index)}
                                          variant="outline"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <Save size={13} /> 적용
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            setEditingTeamIndex(null);
                                            setEditingTeamName('');
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
                                      <span>{t}</span>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            startEditTempTeam(t, index);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                                        >
                                          <Edit3 size={14} />
                                        </Button>
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTempTeam(t, index);
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

                        {/* 사원 관리 컬럼 */}
                        <div className="space-y-4">
                          <div className="border-b border-slate-100 pb-3">
                            <h2 className="text-base font-bold text-slate-900">사용자 관리</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">부서를 선택하면 해당 부서 사용자만 표시됩니다. 전체를 선택하면 모든 사용자가 표시됩니다.</p>
                          </div>
                          <div className="space-y-2">
                            <select
                              value={newBorrowerTeam}
                              onChange={(e) => {
                                setNewBorrowerTeam(e.target.value);
                                setEditingBorrowerIndex(null);
                                setEditingBorrowerName('');
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                            >
                              <option value="전체">전체</option>
                              {(tempTeams || []).map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <input
                                value={newBorrower}
                                onChange={(e) => setNewBorrower(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    addTempBorrower();
                                  }
                                }}
                                placeholder="새로운 배정 사원명"
                                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                              />
                              <Button
                                onClick={addTempBorrower}
                                className="px-3 py-2"
                              >
                                <Plus size={16} />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                            {(displayedTempBorrowers || []).length === 0 ? (
                              <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-10 text-center text-slate-400 text-xs">
                                {newBorrowerTeam === '전체'
                                  ? '현재 등록된 사용자가 없습니다.'
                                  : '선택한 부서에 등록된 사용자가 없습니다.'}
                              </div>
                            ) : (
                              (displayedTempBorrowers || []).map((b) => (
                                <div
                                  key={`${b.team}-${b.name}-${b.originalIndex}`}
                                  draggable={editingBorrowerIndex !== b.originalIndex}
                                  onDragStart={() => setDraggingBorrowerIndex(b.originalIndex)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    moveTempBorrower(draggingBorrowerIndex, b.originalIndex);
                                    setDraggingBorrowerIndex(null);
                                  }}
                                  onDragEnd={() => setDraggingBorrowerIndex(null)}
                                  className={`flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-100 text-xs text-slate-700 transition ${
                                    draggingBorrowerIndex === b.originalIndex
                                      ? 'opacity-50'
                                      : editingBorrowerIndex === b.originalIndex
                                        ? ''
                                        : 'cursor-move hover:bg-slate-100'
                                  }`}
                                >
                                  {editingBorrowerIndex === b.originalIndex ? (
                                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                                      <input
                                        value={editingBorrowerName}
                                        onChange={(e) => setEditingBorrowerName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            applyEditTempBorrower(b, b.originalIndex);
                                          }

                                          if (e.key === 'Escape') {
                                            setEditingBorrowerIndex(null);
                                            setEditingBorrowerName('');
                                          }
                                        }}
                                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none mk-form-border-focus"
                                      />
                                      <div className="flex shrink-0 gap-1">
                                        <Button
                                          onClick={() => applyEditTempBorrower(b, b.originalIndex)}
                                          variant="outline"
                                          className="px-2 py-1 text-xs rounded-lg"
                                        >
                                          <Save size={13} /> 적용
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            setEditingBorrowerIndex(null);
                                            setEditingBorrowerName('');
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
                                      <span>
                                        {b.name} <span className="text-[10px] text-slate-400">({b.team})</span>
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            startEditTempBorrower(b, b.originalIndex);
                                          }}
                                          variant="ghost"
                                          className="px-1 py-1 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                                        >
                                          <Edit3 size={14} />
                                        </Button>
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTempBorrower(b, b.originalIndex);
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
                          onClick={cancelTempPeopleChanges}
                        >
                          취소
                        </Button>
                        <Button
                          variant="primary"
                          onClick={saveTempPeopleChanges}
                        >
                          변경사항 저장
                        </Button>
                      </div>
                    </div>
  );
}
