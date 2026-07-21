export default function AdminAssetsPanel({ ctx }) {
  const {
    AdminPageHeader,
    Badge,
    Button,
    ClipboardList,
    Edit3,
    Input,
    Plus,
    React,
    STATUS,
    Save,
    Search,
    Select,
    Trash2,
    adminAvailabilityFilter,
    adminFilteredLaptops,
    adminLaptopQuery,
    adminSelectedAssetCategory,
    createLaptop,
    data,
    deleteLaptop,
    editLaptop,
    editLaptopInsertIndex,
    getLaptopAdminDisplayStatus,
    handleAddLaptopClick,
    handleFileUpload,
    newLaptop,
    saveLaptop,
    setAdminAvailabilityFilter,
    setAdminLaptopQuery,
    setAdminSelectedAssetCategory,
    setEditLaptop,
    setNewLaptop,
    setShowUploadPanel,
    showUploadPanel,
  } = ctx;

  return (
                    <div className="space-y-6">
                      <AdminPageHeader
                        title="대여 자산 관리"
                        description="자산 고유 시리얼 넘버, 기기 사진 연동, 특이 사항 메모 및 장비를 관리합니다."
                        actions={
                          <>
                            <Button
                              onClick={() => {
                                setShowUploadPanel((prev) => !prev);
                                setNewLaptop(null);
                                setEditLaptop(null);
                              }}
                              variant="outline"
                              className="border-white/20 bg-white/10 px-4 py-2.5 text-xs text-white shadow-sm hover:bg-white/20 sm:text-sm"
                            >
                              <ClipboardList size={16} /> 엑셀/CSV 업로드
                            </Button>
                            <Button
                              onClick={handleAddLaptopClick}
                              variant="primary"
                              className="px-4 py-2.5 text-xs shadow-md sm:text-sm"
                            >
                              <Plus size={16} /> 신규 자산 추가
                            </Button>
                          </>
                        }
                      />
                      
                      <div className="grid w-full gap-2 sm:grid-cols-[120px_120px_minmax(0,1fr)] lg:w-auto lg:grid-cols-[118px_118px_15rem]">
                        <select
                          aria-label="관리자 자산 카테고리 필터"
                          value={adminSelectedAssetCategory}
                          onChange={(e) => {
                            setAdminSelectedAssetCategory(e.target.value);
                            setEditLaptop(null);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                        >
                          <option value="전체">전체</option>
                          {(data.assetCategories || []).map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>

                        <select
                          aria-label="관리자 대여 가능여부 필터"
                          value={adminAvailabilityFilter}
                          onChange={(e) => {
                            setAdminAvailabilityFilter(e.target.value);
                            setEditLaptop(null);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                        >
                          <option value="전체">전체</option>
                          <option value={STATUS.AVAILABLE}>대여가능</option>
                          <option value={STATUS.UNAVAILABLE}>대여불가</option>
                        </select>

                        <div className="relative w-full">
                          <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                          <input
                            value={adminLaptopQuery}
                            onChange={(e) => {
                              setAdminLaptopQuery(e.target.value);
                              setEditLaptop(null);
                            }}
                            placeholder="자산관리번호, 기종, 키워드 검색"
                            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
                          />
                        </div>
                      </div>

                      {/* 자동 일괄 업로드 가이드 및 파일 셀렉터 드롭존 UI */}
                      {showUploadPanel && (
                        <div className="rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/50 p-6 text-center transition-colors duration-150 animate-fadeIn">
                          <div className="mx-auto flex max-w-xl flex-col items-center justify-center">
                            <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 mb-3 border border-blue-100">
                              <ClipboardList size={26} />
                            </div>
                            <h4 className="text-sm font-bold text-slate-800">엑셀 / CSV 파일 자동 업로드 일괄 추가</h4>
                            <p className="text-[11px] text-slate-500 mt-1 max-w-lg leading-relaxed">
                              샘플 양식을 기준으로 첫 번째 시트 또는 CSV 첫 줄의 헤더를 유지하고, 다음 행부터 자산 정보를 입력해 업로드해 주세요.
                            </p>
                            <div className="mt-3.5 rounded-lg bg-white px-4 py-3 border border-slate-200 text-left w-full text-[11px] space-y-1.5 text-slate-600 shadow-sm">
                              <div>📌 <b>엑셀은 첫 번째 시트만 읽습니다.</b> 작성가이드 시트는 그대로 두어도 되지만, 첫 번째 시트로 이동시키면 안 됩니다.</div>
                              <div>📌 <b>헤더는 엑셀 1행 또는 CSV 첫 줄에 있어야 합니다.</b> 제목, 안내문, 빈 줄을 헤더 위에 두면 업로드가 정상 인식되지 않을 수 있습니다.</div>
                              <div>📌 <b>자산카테고리와 자산관리번호는 필수입니다.</b> 둘 중 하나라도 비어 있는 행은 등록되지 않습니다.</div>
                              <div>📌 <b>자산카테고리 검증:</b> 관리자 메뉴의 자산 카테고리 등록 목록과 정확히 일치하는 카테고리만 업로드됩니다.</div>
                              <div>📌 <b>일부 칸은 비워도 등록됩니다.</b> 모델명은 미지정 기종, 시리얼번호는 자동 번호, 제조일자는 오늘 날짜, 사진URL은 기본 이미지, 대여가능여부는 대여가능으로 처리됩니다.</div>
                              <div>📌 <b>권장 헤더:</b> 자산카테고리, 자산관리번호, 대여가능여부, 모델명, 시리얼번호, 제조일자, 사진URL, 비고</div>
                              <div>📌 <b>대여불가 처리:</b> 대여가능여부 칸에 대여불가, 불가, unavailable 중 하나가 포함되면 대여불가로 등록됩니다.</div>
                            </div>
                            <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                              <a
                                href="files/sample.xlsx"
                                download
                                className="inline-flex items-center justify-center gap-2 font-semibold rounded-xl text-xs transition-all duration-150 active:scale-[0.98] bg-blue-600 text-white hover:bg-blue-700 px-4 py-3 cursor-pointer shadow-sm shadow-blue-100"
                              >
                                <Save size={14} /> 샘플 엑셀 양식 다운로드
                              </a>
                              <label htmlFor="excel-csv-file-selector" className="inline-flex items-center justify-center gap-2 font-semibold rounded-xl text-xs transition-all duration-150 active:scale-[0.98] bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-3 cursor-pointer shadow-sm">
                                <Plus size={14} /> 엑셀 또는 CSV 파일 선택
                              </label>
                              <input
                                id="excel-csv-file-selector"
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                onChange={handleFileUpload}
                                className="hidden"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 신규 자산 추가 폼 */}
                      {newLaptop && (
                        <div className="rounded-2xl border-2 border-emerald-400/80 bg-emerald-50/20 p-5 space-y-4 shadow-sm animate-fadeIn">
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                            <span className="text-sm font-bold text-slate-900">신규 대여 자산 등록</span>
                            <Button onClick={() => setNewLaptop(null)} variant="outline" className="px-2 py-1 text-xs">닫기</Button>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Select
                              label="자산 카테고리"
                              value={newLaptop.category || data.assetCategories?.[0] || '노트북'}
                              onChange={(v) => setNewLaptop({ ...newLaptop, category: v })}
                            >
                              {(data.assetCategories || ['노트북']).map((category) => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </Select>
                            <Input
                              label="자산 관리 번호"
                              value={newLaptop.assetNo}
                              onChange={(v) => setNewLaptop({ ...newLaptop, assetNo: v })}
                              placeholder="예: LAPTOP-2026-16"
                            />
                            <Select
                              label="대여 가능 여부"
                              value={newLaptop.status}
                              onChange={(v) => setNewLaptop({ ...newLaptop, status: v })}
                            >
                              <option value={STATUS.AVAILABLE}>대여가능 (기본)</option>
                              <option value={STATUS.UNAVAILABLE}>대여불가 (고장/수리 등)</option>
                            </Select>
                            <Input
                              label="제작/출고 모델명"
                              value={newLaptop.model}
                              onChange={(v) => setNewLaptop({ ...newLaptop, model: v })}
                              placeholder="예: LG Gram 16 Pro"
                            />
                            <Input
                              label="고유 시리얼 번호 (S/N)"
                              value={newLaptop.serialNo}
                              onChange={(v) => setNewLaptop({ ...newLaptop, serialNo: v })}
                              placeholder="예: SN-2026-10500"
                            />
                            <Input
                              label="출고일"
                              type="date"
                              value={newLaptop.manufactureDate}
                              onChange={(v) => setNewLaptop({ ...newLaptop, manufactureDate: v })}
                            />
                            <Input
                              label="자산 기종 사진 연결 URL"
                              value={newLaptop.photo}
                              onChange={(v) => setNewLaptop({ ...newLaptop, photo: v })}
                              placeholder="사진 URL 입력"
                            />
                            <Input
                              label="비고 / 기재 사항"
                              value={newLaptop.note}
                              onChange={(v) => setNewLaptop({ ...newLaptop, note: v })}
                              placeholder="예: 마우스 포함, 액정 흠집 등"
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/40">
                            <Button onClick={() => setNewLaptop(null)} variant="outline">취소</Button>
                            <Button onClick={createLaptop} variant="primary" className="bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100">
                              새 자산 등록 완료
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {adminFilteredLaptops.map((l, index) => (
                          <React.Fragment key={l.id}>
                            <div
                              className={`rounded-xl p-4 flex flex-col justify-between hover:shadow-sm transition ${
                                editLaptop?.id === l.id
                                  ? 'border-2 border-blue-400/80 bg-blue-50/20'
                                  : 'border border-slate-200 bg-white'
                              }`}
                            >
                              <div className="relative mb-3 h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                                <img
                                  src={l.photo}
                                  alt={l.assetNo}
                                  className="h-full w-full object-cover transition duration-350"
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {l.category}
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-900 text-sm">{l.assetNo}</span>
                                  <Badge>{getLaptopAdminDisplayStatus(l, data.requests)}</Badge>
                                </div>
                                <div className="text-xs font-semibold text-slate-700">{l.model}</div>
                                <div className="space-y-0.5 text-[11px] text-slate-500">
                                  <div>S/N: {l.serialNo}</div>
                                  <div>출고일: {l.manufactureDate}</div>
                                </div>
                                <div className="mt-1 rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600 border border-slate-200/50">
                                  💡 {l.note || '특이사항 없음'}
                                </div>
                              </div>
                              <div className="flex gap-2 mt-4">
                                <Button
                                  onClick={() => {
                                    if (editLaptop?.id === l.id) {
                                      setEditLaptop(null);
                                      return;
                                    }

                                    setNewLaptop(null);
                                    setShowUploadPanel(false);
                                    setEditLaptop(l);
                                  }}
                                  variant="outline"
                                  className="flex-1 py-1.5 text-xs rounded-lg"
                                >
                                  <Edit3 size={12} /> 정보 변경 수정
                                </Button>
                                <Button
                                  onClick={() => deleteLaptop(l.id, l.assetNo)}
                                  variant="dangerOutline"
                                  className="py-1.5 text-xs rounded-lg px-3"
                                  title="자산 삭제"
                                >
                                  <Trash2 size={12} /> 삭제
                                </Button>
                              </div>
                            </div>

                            {editLaptopInsertIndex === index && editLaptop && (
                              <div className="col-span-full rounded-2xl border-2 border-blue-400/80 bg-blue-50/20 p-5 space-y-4 shadow-sm animate-fadeIn">
                                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                                  <span className="text-sm font-bold text-slate-900">자산 수정 패널: <b className="text-blue-600">{editLaptop.assetNo}</b></span>
                                  <Button onClick={() => setEditLaptop(null)} variant="outline" className="px-2 py-1 text-xs">닫기</Button>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Select
                                    label="자산 카테고리"
                                    value={editLaptop.category || data.assetCategories?.[0] || '노트북'}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, category: v })}
                                  >
                                    {(data.assetCategories || ['노트북']).map((category) => (
                                      <option key={category} value={category}>{category}</option>
                                    ))}
                                  </Select>
                                  <Input
                                    label="자산 관리 번호"
                                    value={editLaptop.assetNo}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, assetNo: v })}
                                  />
                                  <Select
                                    label="대여 가능 여부"
                                    value={editLaptop.status === STATUS.UNAVAILABLE ? STATUS.UNAVAILABLE : STATUS.AVAILABLE}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, status: v })}
                                  >
                                    <option value={STATUS.AVAILABLE}>대여가능 (기본)</option>
                                    <option value={STATUS.UNAVAILABLE}>대여불가 (고장/수리 등)</option>
                                  </Select>
                                  <Input
                                    label="제작/출고 모델명"
                                    value={editLaptop.model}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, model: v })}
                                  />
                                  <Input
                                    label="고유 시리얼 번호 (S/N)"
                                    value={editLaptop.serialNo}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, serialNo: v })}
                                  />
                                  <Input
                                    label="출고일"
                                    type="date"
                                    value={editLaptop.manufactureDate}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, manufactureDate: v })}
                                  />
                                  <Input
                                    label="자산 기종 사진 연결 URL"
                                    value={editLaptop.photo}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, photo: v })}
                                  />
                                  <Input
                                    label="비고 / 기재 사항"
                                    value={editLaptop.note}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, note: v })}
                                  />
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/40">
                                  <Button onClick={() => setEditLaptop(null)} variant="outline">취소</Button>
                                  <Button onClick={saveLaptop} variant="primary">자산 정보 최종 저장</Button>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
  );
}
