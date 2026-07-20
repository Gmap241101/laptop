import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  List,
  RotateCcw,
  X,
} from 'lucide-react';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function AdminHolidayManagementPanel({ ctx }) {
  const {
    Button,
    ClipboardList,
    DEFAULT_HOLIDAY_TYPE,
    HOLIDAY_TYPE_LABEL,
    Plus,
    Save,
    Trash2,
    addTempHoliday,
    applyHolidayImportConflictChoice,
    data,
    deleteTempHoliday,
    discardHolidayChanges,
    formatDateWithKoreanWeekday,
    getKoreaNow,
    holidayImportConflictModal,
    holidayImportLoading,
    holidayImportYear,
    holidayManagementMonth,
    holidayManagementView,
    holidayManagementYear,
    holidaySettingsDirty,
    importKoreanPublicHolidaysFromJson,
    newHolidayDate,
    newHolidayName,
    newHolidayType,
    saveHolidaySettings,
    setHolidayImportConflictModal,
    setHolidayImportYear,
    setHolidayManagementMonth,
    setHolidayManagementView,
    setHolidayManagementYear,
    setNewHolidayDate,
    setNewHolidayName,
    setNewHolidayType,
    tempHolidayList,
    today,
    updateTempHolidayReason,
  } = ctx;

  const [editingHoliday, setEditingHoliday] = useState(null);
  const [holidayEditForm, setHolidayEditForm] = useState({
    date: '',
    type: DEFAULT_HOLIDAY_TYPE,
    name: '',
  });
  const [calendarDetailDate, setCalendarDetailDate] = useState('');

  const selectedHolidayYear = Math.min(
    2100,
    Math.max(2000, Number(holidayManagementYear) || getKoreaNow().getUTCFullYear())
  );
  const selectedHolidayMonth = Math.min(
    12,
    Math.max(1, Number(holidayManagementMonth) || 1)
  );

  const selectedYearHolidays = useMemo(
    () =>
      (tempHolidayList || [])
        .filter(
          (holiday) =>
            String(holiday.date || '').slice(0, 4) ===
            String(selectedHolidayYear)
        )
        .sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [selectedHolidayYear, tempHolidayList]
  );

  const selectedMonthHolidays = useMemo(
    () =>
      selectedYearHolidays.filter(
        (holiday) =>
          Number(String(holiday.date || '').slice(5, 7)) ===
          selectedHolidayMonth
      ),
    [selectedHolidayMonth, selectedYearHolidays]
  );

  const selectableHolidayYears = useMemo(() => {
    const years = new Set([
      selectedHolidayYear,
      getKoreaNow().getUTCFullYear(),
      Number(holidayImportYear) || selectedHolidayYear,
    ]);

    (tempHolidayList || []).forEach((holiday) => {
      const year = Number(String(holiday.date || '').slice(0, 4));
      if (year >= 2000 && year <= 2100) years.add(year);
    });

    return Array.from(years).sort((a, b) => a - b);
  }, [holidayImportYear, selectedHolidayYear, tempHolidayList]);

  const holidaysByMonth = useMemo(() => {
    const groups = new Map();

    selectedYearHolidays.forEach((holiday) => {
      const month = Number(String(holiday.date).slice(5, 7));
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(holiday);
    });

    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [selectedYearHolidays]);

  const selectedMonthReasonCount = useMemo(
    () =>
      selectedMonthHolidays.reduce(
        (sum, holiday) => sum + (holiday.reasons || []).length,
        0
      ),
    [selectedMonthHolidays]
  );

  const getReasonBadgeClassName = (type) => {
    if (type === 'public') return 'border-blue-200 bg-blue-50 text-blue-700';
    if (type === 'temporary') return 'border-violet-200 bg-violet-50 text-violet-700';
    if (type === 'company') return 'border-orange-200 bg-orange-50 text-orange-700';
    return 'border-slate-200 bg-slate-100 text-slate-600';
  };

  const getCompactReasonLabel = (type) => {
    if (type === 'public') return '공휴일';
    if (type === 'temporary') return '임시';
    if (type === 'company') return '회사';
    return '수동';
  };

  const setCalendarYearMonth = (year, month) => {
    let nextYear = Number(year);
    let nextMonth = Number(month);

    while (nextMonth < 1) {
      nextYear -= 1;
      nextMonth += 12;
    }
    while (nextMonth > 12) {
      nextYear += 1;
      nextMonth -= 12;
    }

    setHolidayManagementYear(String(Math.min(2100, Math.max(2000, nextYear))));
    setHolidayManagementMonth(nextMonth);
    setCalendarDetailDate('');
  };

  const moveCalendarMonth = (offset) => {
    setCalendarYearMonth(
      selectedHolidayYear,
      selectedHolidayMonth + offset
    );
  };

  const moveToToday = () => {
    const koreaNow = getKoreaNow();
    setHolidayManagementYear(String(koreaNow.getUTCFullYear()));
    setHolidayManagementMonth(koreaNow.getUTCMonth() + 1);
    setCalendarDetailDate(today());
  };

  const calendarCells = useMemo(() => {
    const firstDate = new Date(
      Date.UTC(selectedHolidayYear, selectedHolidayMonth - 1, 1)
    );
    const firstWeekday = firstDate.getUTCDay();
    const gridStart = new Date(firstDate);
    gridStart.setUTCDate(1 - firstWeekday);
    const holidayMap = new Map(
      (tempHolidayList || []).map((holiday) => [holiday.date, holiday])
    );

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setUTCDate(gridStart.getUTCDate() + index);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      return {
        date: dateStr,
        year,
        month,
        day,
        weekday: date.getUTCDay(),
        isCurrentMonth:
          year === selectedHolidayYear && month === selectedHolidayMonth,
        holiday: holidayMap.get(dateStr) || null,
      };
    });
  }, [selectedHolidayMonth, selectedHolidayYear, tempHolidayList]);

  const calendarDetailHoliday = (tempHolidayList || []).find(
    (holiday) => holiday.date === calendarDetailDate
  );

  const startHolidayEdit = (holiday, reasonIndex) => {
    const reason = holiday.reasons?.[reasonIndex] || {
      type: holiday.type || DEFAULT_HOLIDAY_TYPE,
      name: holiday.name || '',
    };

    setEditingHoliday({
      sourceDate: holiday.date,
      reasonIndex,
    });
    setHolidayEditForm({
      date: holiday.date,
      type: reason.type || DEFAULT_HOLIDAY_TYPE,
      name: reason.name || '',
    });
  };

  const cancelHolidayEdit = () => {
    setEditingHoliday(null);
    setHolidayEditForm({
      date: '',
      type: DEFAULT_HOLIDAY_TYPE,
      name: '',
    });
  };

  const saveHolidayEdit = () => {
    if (!editingHoliday) return;

    const saved = updateTempHolidayReason({
      ...editingHoliday,
      ...holidayEditForm,
    });

    if (saved) {
      setCalendarDetailDate(holidayEditForm.date);
      cancelHolidayEdit();
    }
  };

  const renderHolidayEditForm = () => (
    <div className="grid gap-2 rounded-xl border border-orange-200 bg-orange-50/50 p-3 lg:grid-cols-[150px_130px_minmax(0,1fr)_auto]">
      <input
        type="date"
        value={holidayEditForm.date}
        onChange={(event) =>
          setHolidayEditForm((prev) => ({
            ...prev,
            date: event.target.value,
          }))
        }
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none mk-form-focus"
      />
      <select
        value={holidayEditForm.type}
        onChange={(event) =>
          setHolidayEditForm((prev) => ({
            ...prev,
            type: event.target.value,
          }))
        }
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none mk-form-focus"
      >
        <option value="public">법정공휴일</option>
        <option value="temporary">임시공휴일</option>
        <option value="company">회사휴일</option>
        <option value="manual">수동등록</option>
      </select>
      <input
        value={holidayEditForm.name}
        onChange={(event) =>
          setHolidayEditForm((prev) => ({
            ...prev,
            name: event.target.value,
          }))
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter') saveHolidayEdit();
          if (event.key === 'Escape') cancelHolidayEdit();
        }}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none mk-form-focus"
      />
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          aria-label="수정 적용"
          onClick={saveHolidayEdit}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-700"
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          aria-label="수정 취소"
          onClick={cancelHolidayEdit}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );

  const renderReasonRow = (holiday, reason, reasonIndex) => {
    const isEditing =
      editingHoliday?.sourceDate === holiday.date &&
      editingHoliday?.reasonIndex === reasonIndex;

    if (isEditing) {
      return (
        <div key={`${holiday.date}-${reasonIndex}-edit`}>
          {renderHolidayEditForm()}
        </div>
      );
    }

    return (
      <div
        key={`${holiday.date}-${reason.type}-${reason.name}-${reasonIndex}`}
        className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${getReasonBadgeClassName(
              reason.type
            )}`}
          >
            {HOLIDAY_TYPE_LABEL[reason.type] || '휴일'}
          </span>
          <span className="min-w-0 break-words text-xs font-semibold text-slate-700">
            {reason.name || '휴일'}
          </span>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1">
          <button
            type="button"
            aria-label="휴일 수정"
            onClick={() => startHolidayEdit(holiday, reasonIndex)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
          >
            <Edit3 size={14} />
          </button>
          <button
            type="button"
            aria-label="휴일 삭제"
            onClick={() => deleteTempHoliday(holiday.date, reasonIndex)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-100 pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">휴일 관리</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              법정·임시공휴일을 자동으로 불러오거나 회사휴일과 수동 휴일을 등록합니다. 등록된 휴일은 대여 시작일, 반납 예정일 및 연장 영업일 계산에 반영됩니다.
            </p>
          </div>
          {holidaySettingsDirty && (
            <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
              저장되지 않은 변경사항
            </span>
          )}
        </div>
      </div>

      <section className="space-y-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            휴일 등록
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            연도별 공휴일 파일을 불러오거나 날짜·유형·명칭을 직접 입력합니다.
          </p>
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="text-xs font-bold text-blue-900">
                  법정·임시공휴일 자동 불러오기
                </h4>
                <p className="mt-1 text-[11px] leading-5 text-blue-700">
                  public/holidays 폴더의 연도별 JSON을 불러옵니다. 같은 날짜가 이미 있으면 기존 사유 유지, 병합 또는 교체 방식을 선택할 수 있습니다.
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={holidayImportYear}
                  onChange={(event) => setHolidayImportYear(event.target.value)}
                  className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus sm:w-28"
                />

                <Button
                  onClick={importKoreanPublicHolidaysFromJson}
                  disabled={holidayImportLoading}
                  variant="outline"
                  className="bg-white px-3 py-2.5 text-xs"
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
              onChange={(event) => setNewHolidayDate(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
            />

            <select
              value={newHolidayType}
              onChange={(event) => setNewHolidayType(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
            >
              <option value="public">법정공휴일</option>
              <option value="temporary">임시공휴일</option>
              <option value="company">회사휴일</option>
              <option value="manual">수동등록</option>
            </select>

            <input
              value={newHolidayName}
              onChange={(event) => setNewHolidayName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addTempHoliday();
              }}
              placeholder="휴일명 입력 예: 신정, 창립기념 휴무"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none mk-form-border-focus"
            />

            <Button onClick={addTempHoliday} className="px-3 py-2.5 text-xs">
              <Plus size={14} /> 추가
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-5 border-t border-slate-200 pt-7">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            등록 휴일 조회
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            목록은 선택 연도 전체를 월별로 표시하고, 달력은 선택한 한 달을 전체 폭으로 표시합니다.
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label={holidayManagementView === 'calendar' ? '이전 달' : '이전 연도'}
                onClick={() =>
                  holidayManagementView === 'calendar'
                    ? moveCalendarMonth(-1)
                    : setHolidayManagementYear(
                        String(Math.max(2000, selectedHolidayYear - 1))
                      )
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
              >
                <ChevronLeft size={16} />
              </button>

              <select
                value={selectedHolidayYear}
                onChange={(event) =>
                  setHolidayManagementYear(event.target.value)
                }
                className="h-9 min-w-28 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none mk-form-focus"
              >
                {selectableHolidayYears.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </select>

              {holidayManagementView === 'calendar' && (
                <select
                  value={selectedHolidayMonth}
                  onChange={(event) => {
                    setHolidayManagementMonth(Number(event.target.value));
                    setCalendarDetailDate('');
                  }}
                  className="h-9 min-w-24 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none mk-form-focus"
                >
                  {MONTH_OPTIONS.map((month) => (
                    <option key={month} value={month}>
                      {month}월
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                aria-label={holidayManagementView === 'calendar' ? '다음 달' : '다음 연도'}
                onClick={() =>
                  holidayManagementView === 'calendar'
                    ? moveCalendarMonth(1)
                    : setHolidayManagementYear(
                        String(Math.min(2100, selectedHolidayYear + 1))
                      )
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
              >
                <ChevronRight size={16} />
              </button>

              {holidayManagementView === 'calendar' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={moveToToday}
                  className="h-9 px-3 text-xs"
                >
                  오늘
                </Button>
              )}

              <span className="text-xs text-slate-500">
                {holidayManagementView === 'calendar'
                  ? `휴일 날짜 ${selectedMonthHolidays.length}일 · 휴일 사유 ${selectedMonthReasonCount}건`
                  : `등록 휴일 ${selectedYearHolidays.length}일`}
              </span>
            </div>

            <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setHolidayManagementView('list')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  holidayManagementView === 'list'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <List size={14} /> 목록
              </button>
              <button
                type="button"
                onClick={() => setHolidayManagementView('calendar')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  holidayManagementView === 'calendar'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <CalendarDays size={14} /> 달력
              </button>
            </div>
          </div>

          {holidayManagementView === 'list' ? (
            <div className="space-y-5">
              {holidaysByMonth.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
                  {selectedHolidayYear}년에 등록된 휴일이 없습니다.
                </div>
              ) : (
                holidaysByMonth.map(([month, monthHolidays]) => (
                  <div key={month} className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-xs font-bold text-slate-800">
                        {month}월
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        {monthHolidays.length}일
                      </span>
                    </div>

                    <div className="space-y-2">
                      {monthHolidays.map((holiday) => (
                        <div
                          key={holiday.date}
                          className="rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <div className="mb-2 text-xs font-bold text-slate-900">
                            {formatDateWithKoreanWeekday(holiday.date)}
                          </div>
                          <div className="space-y-2">
                            {(holiday.reasons || []).map((reason, reasonIndex) =>
                              renderReasonRow(holiday, reason, reasonIndex)
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                  {WEEKDAY_LABELS.map((label, index) => (
                    <div
                      key={label}
                      className={`px-1 py-2.5 text-center text-[11px] font-bold sm:text-xs ${
                        index === 0
                          ? 'text-rose-500'
                          : index === 6
                            ? 'text-blue-500'
                            : 'text-slate-600'
                      }`}
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {calendarCells.map((cell, index) => {
                    const reasons = cell.holiday?.reasons || [];
                    const isSelected = calendarDetailDate === cell.date;
                    const isToday = cell.date === today();

                    return (
                      <button
                        type="button"
                        key={cell.date}
                        onClick={() => {
                          if (!cell.isCurrentMonth) {
                            setCalendarYearMonth(cell.year, cell.month);
                          }
                          setCalendarDetailDate(cell.date);
                        }}
                        className={`relative min-h-16 border-b border-r border-slate-100 p-1.5 text-left transition sm:min-h-24 sm:p-2 lg:min-h-28 ${
                          index % 7 === 6 ? 'border-r-0' : ''
                        } ${
                          isSelected
                            ? 'bg-orange-50 ring-1 ring-inset ring-orange-300'
                            : cell.isCurrentMonth
                              ? 'bg-white hover:bg-slate-50'
                              : 'bg-slate-50/70 text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-[11px] font-bold sm:text-xs ${
                              isToday
                                ? 'bg-slate-900 text-white'
                                : cell.weekday === 0
                                  ? 'text-rose-500'
                                  : cell.weekday === 6
                                    ? 'text-blue-500'
                                    : cell.isCurrentMonth
                                      ? 'text-slate-700'
                                      : 'text-slate-300'
                            }`}
                          >
                            {cell.day}
                          </span>
                          {reasons.length > 0 && (
                            <span className="text-[9px] font-bold text-orange-600 sm:hidden">
                              {reasons.length}
                            </span>
                          )}
                        </div>

                        {reasons.length > 0 && (
                          <>
                            <div className="mt-1 flex gap-0.5 sm:hidden">
                              {reasons.slice(0, 3).map((reason, reasonIndex) => (
                                <span
                                  key={`${reason.type}-${reasonIndex}`}
                                  className={`h-1.5 w-1.5 rounded-full border ${getReasonBadgeClassName(
                                    reason.type
                                  )}`}
                                />
                              ))}
                            </div>

                            <div className="mt-1.5 hidden space-y-1 sm:block">
                              {reasons.slice(0, 2).map((reason, reasonIndex) => (
                                <div
                                  key={`${reason.type}-${reason.name}-${reasonIndex}`}
                                  className={`flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-1 ${getReasonBadgeClassName(
                                    reason.type
                                  )}`}
                                >
                                  <span className="shrink-0 text-[9px] font-bold">
                                    {getCompactReasonLabel(reason.type)}
                                  </span>
                                  <span className="truncate text-[9px] font-semibold lg:text-[10px]">
                                    {reason.name || '휴일'}
                                  </span>
                                </div>
                              ))}
                              {reasons.length > 2 && (
                                <div className="px-1 text-[9px] font-semibold text-slate-400">
                                  외 {reasons.length - 2}건
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {calendarDetailDate && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {formatDateWithKoreanWeekday(calendarDetailDate)}
                      </h4>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {calendarDetailHoliday
                          ? '등록된 휴일 사유를 확인하거나 수정할 수 있습니다.'
                          : '이 날짜에는 등록된 휴일이 없습니다.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="선택 날짜 닫기"
                      onClick={() => {
                        setCalendarDetailDate('');
                        cancelHolidayEdit();
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {calendarDetailHoliday && (
                    <div className="mt-4 space-y-2">
                      {(calendarDetailHoliday.reasons || []).map(
                        (reason, reasonIndex) =>
                          renderReasonRow(
                            calendarDetailHoliday,
                            reason,
                            reasonIndex
                          )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2.5 border-t border-slate-200/60 pt-4 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => {
            discardHolidayChanges();
            setEditingHoliday(null);
            setCalendarDetailDate('');
          }}
          className="w-full sm:w-auto"
          disabled={!holidaySettingsDirty}
        >
          <RotateCcw size={14} />
          변경 취소
        </Button>

        <Button
          variant="primary"
          onClick={saveHolidaySettings}
          className="w-full sm:w-auto"
          disabled={!holidaySettingsDirty}
        >
          <Save size={14} />
          변경사항 저장
        </Button>
      </div>

      {holidayImportConflictModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              중복 휴일 확인
            </h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {holidayImportConflictModal.year}년 공휴일{' '}
              {holidayImportConflictModal.importedDateCount}일 중 이미 등록된 날짜가{' '}
              {holidayImportConflictModal.duplicateDateCount}일 있습니다. 신규 날짜는{' '}
              {holidayImportConflictModal.newDateCount}일입니다.
            </p>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-5 text-slate-600">
              <div>
                <strong>중복 제외:</strong> 기존 날짜의 휴일 사유를 유지하고 신규 날짜만 추가합니다.
              </div>
              <div>
                <strong>병합:</strong> 기존 사유를 유지하면서 불러온 법정·임시공휴일 사유를 함께 등록합니다.
              </div>
              <div>
                <strong>교체:</strong> 중복 날짜의 모든 기존 사유를 불러온 데이터로 바꿉니다. 회사휴일과 수동등록 사유도 제거될 수 있습니다.
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => setHolidayImportConflictModal(null)}
                className="w-full"
              >
                취소
              </Button>
              <Button
                variant="outline"
                onClick={() => applyHolidayImportConflictChoice('exclude')}
                className="w-full"
              >
                중복 제외
              </Button>
              <Button
                onClick={() => applyHolidayImportConflictChoice('merge')}
                className="w-full"
              >
                기존 휴일과 병합
              </Button>
              <Button
                variant="outline"
                onClick={() => applyHolidayImportConflictChoice('replace')}
                className="w-full border-rose-200 text-rose-600 hover:bg-rose-50"
              >
                불러온 데이터로 교체
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
