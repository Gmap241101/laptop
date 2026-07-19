export default function AdminSettingsPanel({ ctx }) {
  const {
    Button,
    CheckCircle2,
    ClipboardList,
    DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
    DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE,
    DEFAULT_HOLIDAY_TYPE,
    DEFAULT_WORK_END_TIME,
    HOLIDAY_TYPE_LABEL,
    Input,
    Plus,
    Save,
    Select,
    Trash2,
    addTempHoliday,
    data,
    deleteTempHoliday,
    finalizeSplitStorageMigration,
    formatDateWithKoreanWeekday,
    getKoreaNow,
    holidayImportLoading,
    holidayImportYear,
    importKoreanPublicHolidaysFromJson,
    isSplitStorageReady,
    newHolidayDate,
    newHolidayName,
    newHolidayType,
    saveSystemSettings,
    setHolidayImportLoading,
    setHolidayImportYear,
    setNewHolidayDate,
    setNewHolidayName,
    setNewHolidayType,
    setTempSettings,
    splitStorageFinalizeLoading,
    tempAllowNonOverlappingSameAssetRequests,
    tempBusinessDayAdjustmentEnabled,
    tempHolidayList,
    tempSettings,
    today,
    triggerConfirm,
    triggerToast,
  } = ctx;

  return (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">시스템 설정</h2>
                        <p className="text-xs text-slate-500 mt-1">사용자 페이지의 소속 입력 모드 전환 및 최대 기한 제어가 즉각 가동됩니다.</p>
                      </div>

                      <div className="grid gap-5 sm:grid-cols-2">
                        <Select
                          label="부서/팀명 입력 유형 선택"
                          value={tempSettings.teamInputMode}
                          onChange={(v) =>
                            setTempSettings({ ...tempSettings, teamInputMode: v })
                          }
                        >
                          <option value="dropdown">관리자 등록 부서 리스트</option>
                          <option value="text">신청인 자율 입력</option>
                        </Select>

                        <Select
                          label="사원/신청인 이름 입력 유형 선택"
                          value={tempSettings.borrowerInputMode}
                          onChange={(v) =>
                            setTempSettings({ ...tempSettings, borrowerInputMode: v })
                          }
                        >
                          <option value="dropdown">관리자 등록 사원 리스트</option>
                          <option value="text">신청인 자율 입력</option>
                        </Select>

                        <Input
                          label="기본 최장 허용 대여 기한 (일수)"
                          type="number"
                          value={tempSettings.maxRentalDays}
                          onChange={(v) =>
                            setTempSettings({ ...tempSettings, maxRentalDays: Number(v) })
                          }
                        />

                        <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-white p-3.5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-slate-700">
                                기간이 겹치지 않으면 동일 기기 신청 허용
                              </div>
                              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                켜면 같은 기기라도 기존 신청 기간과 겹치지 않는 경우 추가 신청을 허용합니다. 끄면 기존처럼 기기가 신청중, 대여중, 보류 상태일 때 다른 신청을 막습니다.
                              </p>
                            </div>

                            <button
                              type="button"
                              aria-label="기간이 겹치지 않으면 동일 기기 신청 허용"
                              aria-pressed={tempAllowNonOverlappingSameAssetRequests}
                              onClick={() =>
                                setTempSettings({
                                  ...tempSettings,
                                  allowNonOverlappingSameAssetRequests:
                                    !tempAllowNonOverlappingSameAssetRequests,
                                })
                              }
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                                tempAllowNonOverlappingSameAssetRequests
                                  ? 'mk-brand-gradient-r border-transparent'
                                  : 'border-slate-300 bg-slate-200'
                              }`}
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                                  tempAllowNonOverlappingSameAssetRequests
                                    ? 'translate-x-5'
                                    : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <div className="mb-1.5 text-xs font-semibold text-slate-600 tracking-wide">
                            업무 종료/휴무일 기준 대여 시작일 다음 영업일로 조정
                          </div>
                          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className="text-xs font-medium text-slate-500">사용여부</span>
                                <button
                                  type="button"
                                  aria-label="업무 종료/휴무일 기준 대여 시작일 다음 영업일로 조정 사용 여부"
                                  aria-pressed={tempBusinessDayAdjustmentEnabled}
                                  onClick={() => {
                                    const nextValue = !tempBusinessDayAdjustmentEnabled;

                                    setTempSettings({
                                      ...tempSettings,
                                      adjustStartDateAfterWorkEnd: nextValue,
                                      adjustStartDateToNextBusinessDay: nextValue,
                                    });
                                  }}
                                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                                    tempBusinessDayAdjustmentEnabled
                                      ? 'mk-brand-gradient-r border-transparent'
                                      : 'border-slate-300 bg-slate-200'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                                      tempBusinessDayAdjustmentEnabled
                                        ? 'translate-x-5'
                                        : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </div>

                              <div className="flex items-center gap-2.5">
                                <span className="shrink-0 text-xs font-medium text-slate-500">업무 종료 시간</span>
                                <input
                                  type="time"
                                  value={tempSettings.workEndTime || DEFAULT_WORK_END_TIME}
                                  disabled={!tempBusinessDayAdjustmentEnabled}
                                  onChange={(e) =>
                                    setTempSettings({
                                      ...tempSettings,
                                      workEndTime: e.target.value || DEFAULT_WORK_END_TIME,
                                    })
                                  }
                                  className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition mk-form-focus sm:w-36 ${
                                    tempBusinessDayAdjustmentEnabled
                                      ? 'bg-white text-slate-900'
                                      : 'cursor-not-allowed bg-slate-100 text-slate-400'
                                  }`}
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                                <span className="text-xs font-medium text-slate-600">토요일/일요일 제외</span>
                                <input
                                  type="checkbox"
                                  checked={tempSettings.excludeWeekendsForStartDate ?? DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE}
                                  disabled={!tempBusinessDayAdjustmentEnabled}
                                  onChange={(e) =>
                                    setTempSettings({
                                      ...tempSettings,
                                      excludeWeekendsForStartDate: e.target.checked,
                                    })
                                  }
                                  className="h-4 w-4"
                                />
                              </label>

                              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                                <span className="text-xs font-medium text-slate-600">등록 휴일 제외</span>
                                <input
                                  type="checkbox"
                                  checked={tempSettings.excludeHolidaysForStartDate ?? DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE}
                                  disabled={!tempBusinessDayAdjustmentEnabled}
                                  onChange={(e) =>
                                    setTempSettings({
                                      ...tempSettings,
                                      excludeHolidaysForStartDate: e.target.checked,
                                    })
                                  }
                                  className="h-4 w-4"
                                />
                              </label>
                            </div>

                            <p className="text-[11px] leading-relaxed text-slate-500">
                              사용 시 업무 종료 시간 이후, 주말, 등록된 공휴일/임시공휴일/회사휴일에는 대여 시작일이 다음 영업일로 자동 조정됩니다.
                            </p>
                          </div>
                        </div>

                        <div className="sm:col-span-2 space-y-3">
                          <div className="border-b border-slate-100 pb-3">
                            <h3 className="text-sm font-bold text-slate-900">휴일 관리</h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              법정공휴일/임시공휴일은 정적 JSON 파일에서 자동 불러오고, 매일경제 자체 휴일은 직접 등록해 주세요. 불러온 휴일도 변경사항 저장을 눌러야 최종 반영됩니다.
                            </p>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h4 className="text-xs font-bold text-blue-900">법정/임시공휴일 자동 불러오기</h4>
                                <p className="mt-1 text-[11px] leading-relaxed text-blue-700">
                                  public/holidays 폴더에 생성된 연도별 JSON 파일을 불러와 임시 휴일 목록에 병합합니다. 회사휴일/수동등록 휴일은 덮어쓰지 않습니다.
                                </p>
                              </div>

                              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                  type="number"
                                  min="2000"
                                  max="2100"
                                  value={holidayImportYear}
                                  onChange={(e) => setHolidayImportYear(e.target.value)}
                                  className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus sm:w-28"
                                />

                                <Button
                                  onClick={importKoreanPublicHolidaysFromJson}
                                  disabled={holidayImportLoading}
                                  variant="outline"
                                  className="px-3 py-2.5 text-xs bg-white"
                                >
                                  <ClipboardList size={14} />
                                  {holidayImportLoading ? '불러오는 중' : '자동 불러오기'}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-[150px_130px_minmax(0,1fr)_auto]">
                            <input
                              type="date"
                              value={newHolidayDate}
                              onChange={(e) => setNewHolidayDate(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                            />

                            <select
                              value={newHolidayType}
                              onChange={(e) => setNewHolidayType(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                            >
                              <option value="public">법정공휴일</option>
                              <option value="temporary">임시공휴일</option>
                              <option value="company">회사휴일</option>
                              <option value="manual">수동등록</option>
                            </select>

                            <input
                              value={newHolidayName}
                              onChange={(e) => setNewHolidayName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  addTempHoliday();
                                }
                              }}
                              placeholder="휴일명 입력 예: 신정, 창립기념 휴무"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none mk-form-border-focus"
                            />

                            <Button
                              onClick={addTempHoliday}
                              className="px-3 py-2.5 text-xs"
                            >
                              <Plus size={14} /> 추가
                            </Button>
                          </div>

                          <div className="space-y-1 max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
                            {tempHolidayList.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
                                현재 등록된 휴일이 없습니다.
                              </div>
                            ) : (
                              tempHolidayList.map((holiday, index) => (
                                <div
                                  key={`${holiday.date}-${holiday.name}-${index}`}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-2 text-xs text-slate-700"
                                >
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-900">
                                      {formatDateWithKoreanWeekday(holiday.date)}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-500">
                                      {holiday.name || '휴일'} · {HOLIDAY_TYPE_LABEL[holiday.type] || '휴일'}
                                    </div>
                                  </div>

                                  <Button
                                    onClick={() => deleteTempHoliday(index)}
                                    variant="ghost"
                                    className="shrink-0 px-1 py-1 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-100 p-4 border border-slate-200/50 text-xs text-slate-600">
                        💡 <b>운영 권장사항 안내:</b> 실제 사내 보안망 연동 개발 단계에서는 AD 연동 인증, 부서별 허용 기한 할당제, Slack/Alimtalk 실시간 전송, 지연 지연자 메일 자동 발송 모듈을 접목하여 완벽한 자동화를 꾀할 수 있습니다.
                      </div>

                      {isSplitStorageReady ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                          <div className="flex items-start gap-3">
                            <CheckCircle2
                              size={18}
                              className="mt-0.5 shrink-0 text-emerald-600"
                            />
                            <div>
                              <h3 className="text-sm font-bold text-emerald-900">
                                Firestore 분리 저장소 전환 완료
                              </h3>
                              <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
                                현재 서비스는 rentalSystem/publicConfig,
                                rentalAssets, rentalAvailability,
                                rentalBorrowers, rentalRequests 컬렉션을
                                직접 사용합니다. laptopRentalDashboard/main은
                                더 이상 읽거나 저장하지 않습니다.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h3 className="text-sm font-bold text-amber-900">
                                Firestore 분리 저장소 최종 전환
                              </h3>

                              <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                                1차 복사된 자산과 진행 중 예약을 검증하고,
                                자산별 예약 잠금 데이터와 자산관리번호
                                중복 방지 레지스트리를 생성합니다. 완료 전에는
                                신청 및 관리자 데이터 변경이 차단됩니다.
                              </p>

                              <div className="mt-2 text-[11px] text-amber-700">
                                검증 대상: 자산 {data.laptops.length}건 ·
                                진행 중 예약 {data.requests.length}건 ·
                                대여자 {data.borrowers.length}건
                              </div>
                            </div>

                            <Button
                              variant="outline"
                              disabled={splitStorageFinalizeLoading}
                              onClick={() => {
                                triggerConfirm(
                                  'Firestore 분리 저장소 최종 전환',
                                  '신규 컬렉션 데이터를 최종 검증하고 자산별 예약 잠금 및 자산관리번호 레지스트리를 생성합니다. 현재 시스템 운영이 중지된 상태에서 한 번만 실행하세요. 계속하시겠습니까?',
                                  finalizeSplitStorageMigration
                                );
                              }}
                              className="shrink-0 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                            >
                              <Save size={14} />
                              {splitStorageFinalizeLoading
                                ? '최종 전환 중'
                                : '분리 저장소 최종 전환'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* 하단 저장 및 취소 액션 버튼 컨테이너 추가 */}
                      <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200/60">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTempSettings(data.settings);
                            setNewHolidayDate(today());
                            setNewHolidayName('');
                            setNewHolidayType(DEFAULT_HOLIDAY_TYPE);
                            setHolidayImportYear(String(getKoreaNow().getUTCFullYear()));
                            setHolidayImportLoading(false);
                            triggerToast('설정 변경사항이 취소되고 이전 상태로 복원되었습니다.', 'success');
                          }}
                        >
                          취소
                        </Button>
                        <Button
                          variant="primary"
                          onClick={saveSystemSettings}
                        >
                          변경사항 저장
                        </Button>
                      </div>
                    </div>
  );
}
