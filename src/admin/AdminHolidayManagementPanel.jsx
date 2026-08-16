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
import ModalPortal from '../components/ModalPortal.jsx';
import { buildCalendarHolidaySegments } from './holidayCalendarLayout.js';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const HOLIDAY_TYPE_OPTIONS = [
  { value: 'public', label: '법정공휴일' },
  { value: 'temporary', label: '임시공휴일' },
  { value: 'substitute', label: '대체공휴일' },
  { value: 'company', label: '회사지정휴일' },
  { value: 'manual', label: '기타휴일' },
];

export default function AdminHolidayManagementPanel({ ctx }) {
  const {
    AdminPageHeader,
    Button,
    ClipboardList,
    DEFAULT_HOLIDAY_TYPE,
    HOLIDAY_TYPE_LABEL,
    Plus,
    Save,
    Trash2,
    addTempHoliday,
    applyHolidayImportConflictChoice,
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
    if (type === 'substitute') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (type === 'company') return 'border-orange-200 bg-orange-50 text-orange-700';
    return 'border-slate-200 bg-slate-100 text-slate-600';
  };

  const getCompactReasonLabel = (type) => {
    if (type === 'public') return '법정';
    if (type === 'temporary') return '임시';
    if (type === 'substitute') return '대체';
    if (type === 'company') return '회사';
    return '기타';
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

  const calendarWeeks = useMemo(
    () =>
      Array.from({ length: 6 }, (_, weekIndex) =>
        calendarCells.slice(weekIndex * 7, weekIndex * 7 + 7)
      ),
    [calendarCells]
  );

  const calendarHolidaySegmentsByWeek = useMemo(
    () => buildCalendarHolidaySegments(calendarCells),
    [calendarCells]
  );

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
        {HOLIDAY_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
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
      <AdminPageHeader
        title="휴일 관리"
        description="법정·임시·대체공휴일을 자동으로 불러오거나 회사지정휴일과 기타휴일을 등록합니다. 등록된 휴일은 대여 시작일과 대여·연장 최종 반납 예정일의 다음 영업일 조정에 반영됩니다."
        badge={
          holidaySettingsDirty ? (
            <span className="w-fit rounded-full border border-amber-200/70 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
              저장되지 않은 변경사항
            </span>
          ) : null
        }
      />

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
                  법정·임시·대체공휴일 자동 불러오기
                </h4>
                <p className="mt-1 text-[11px] leading-5 text-blue-700">
                  💡<b>운영 안내:</b> 연도별 JSON 파일(public/holidays)을 불러옵니다. 중복 날짜 발생 시 기존 사유 유지, 병합, 교체 중 선택 가능합니다.
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
              {HOLIDAY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHolidayManagementView('list')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                  holidayManagementView === 'list'
                    ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                }`}
              >
                <List size={14} /> 목록
              </button>
              <button
                type="button"
                onClick={() => setHolidayManagementView('calendar')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                  holidayManagementView === 'calendar'
                    ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
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

                <div className="divide-y divide-slate-100">
                  {calendarWeeks.map((weekCells, weekIndex) => {
                    const weekSegments =
                      calendarHolidaySegmentsByWeek.get(weekIndex) || [];
                    const laneCount = weekSegments.reduce(
                      (maxLane, segment) => Math.max(maxLane, segment.lane + 1),
                      0
                    );
                    const weekMinHeight = Math.max(72, 50 + laneCount * 24);

                    return (
                      <div
                        key={`week-${weekIndex}`}
                        className="relative grid grid-cols-7"
                        style={{ minHeight: `${weekMinHeight}px` }}
                      >
                        {weekCells.map((cell, dayIndex) => {
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
                              className={`relative h-full min-h-16 border-r border-slate-100 p-1.5 text-left transition sm:min-h-24 sm:p-2 lg:min-h-28 ${
                                dayIndex === 6 ? 'border-r-0' : ''
                              } ${
                                isSelected
                                  ? 'bg-orange-50 ring-1 ring-inset ring-orange-300'
                                  : cell.isCurrentMonth
                                    ? 'bg-white hover:bg-slate-50'
                                    : 'bg-slate-50/70 text-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              <span
                                className={`absolute right-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full border text-[11px] font-bold sm:text-xs ${
                                  reasons.length > 0
                                    ? cell.isCurrentMonth
                                      ? 'text-rose-500'
                                      : 'text-rose-300'
                                    : cell.weekday === 0
                                      ? cell.isCurrentMonth
                                        ? 'text-rose-500'
                                        : 'text-rose-300'
                                      : cell.weekday === 6
                                        ? cell.isCurrentMonth
                                          ? 'text-blue-500'
                                          : 'text-blue-300'
                                        : cell.isCurrentMonth
                                          ? 'text-slate-700'
                                          : 'text-slate-300'
                                } ${
                                  isToday
                                    ? 'border-orange-400 bg-yellow-100 shadow-sm'
                                    : 'border-transparent'
                                }`}
                              >
                                {cell.day}
                              </span>
                            </button>
                          );
                        })}

                        {weekSegments.map((segment) => {
                          const leftPercent = (segment.startCol / 7) * 100;
                          const rightPercent =
                            ((6 - segment.endCol) / 7) * 100;
                          const leftInset = segment.continuesBefore ? 0 : 6;
                          const rightInset = segment.continuesAfter ? 0 : 6;

                          return (
                            <div
                              key={segment.id}
                              aria-hidden="true"
                              className={`pointer-events-none absolute z-10 flex h-5 min-w-0 items-center overflow-hidden border px-1.5 text-[9px] font-semibold shadow-sm sm:h-6 sm:text-[10px] ${getReasonBadgeClassName(
                                segment.reason.type
                              )} ${
                                segment.continuesBefore ? 'rounded-l-none' : 'rounded-l-md'
                              } ${
                                segment.continuesAfter ? 'rounded-r-none' : 'rounded-r-md'
                              }`}
                              style={{
                                left: `calc(${leftPercent}% + ${leftInset}px)`,
                                right: `calc(${rightPercent}% + ${rightInset}px)`,
                                top: `${40 + segment.lane * 24}px`,
                              }}
                              title={`${HOLIDAY_TYPE_LABEL[segment.reason.type] || '휴일'} ${segment.reason.name || '휴일'}`}
                            >
                              {segment.showLabel ? (
                                <span className="truncate">
                                  <span className="mr-1 font-bold">
                                    {getCompactReasonLabel(segment.reason.type)}
                                  </span>
                                  {segment.reason.name || '휴일'}
                                </span>
                              ) : (
                                <span className="sr-only">
                                  {segment.reason.name || '휴일'} 계속
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
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
                    <div className="mt-2 space-y-1">
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
        <ModalPortal className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
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
        </ModalPortal>
      )}
    </div>
  );
}
