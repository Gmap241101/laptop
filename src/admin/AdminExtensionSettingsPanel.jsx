import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  List,
  X,
} from 'lucide-react';

export default function AdminExtensionSettingsPanel({ ctx }) {
  const {
    Button,
    ClipboardList,
    DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
    DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE,
    DEFAULT_HOLIDAY_TYPE,
    DEFAULT_WORK_END_TIME,
    HOLIDAY_TYPE_LABEL,
    OVERDUE_PENALTY_MODE,
    Plus,
    RENTAL_EXTENSION_APPROVAL_MODE,
    Save,
    Trash2,
    addTempHoliday,
    data,
    deleteTempHoliday,
    formatDateWithKoreanWeekday,
    getKoreaNow,
    holidayImportConflictModal,
    holidayImportLoading,
    holidayImportYear,
    holidayManagementView,
    holidayManagementYear,
    importKoreanPublicHolidaysFromJson,
    applyHolidayImportConflictChoice,
    newHolidayDate,
    newHolidayName,
    newHolidayType,
    saveSystemSettings,
    setHolidayImportConflictModal,
    setHolidayImportLoading,
    setHolidayImportYear,
    setHolidayManagementView,
    setHolidayManagementYear,
    setNewHolidayDate,
    setNewHolidayName,
    setNewHolidayType,
    setTempSettings,
    tempAllowNonOverlappingSameAssetRequests,
    tempBusinessDayAdjustmentEnabled,
    tempHolidayList,
    tempSettings,
    today,
    triggerToast,
    updateTempHolidayReason,
  } = ctx;

  const extensionEnabled =
    tempSettings.rentalExtensionEnabled === true;

  const approvalMode =
    tempSettings.rentalExtensionApprovalMode ===
    RENTAL_EXTENSION_APPROVAL_MODE.AUTO
      ? RENTAL_EXTENSION_APPROVAL_MODE.AUTO
      : RENTAL_EXTENSION_APPROVAL_MODE.MANUAL;

  const overdueBlockEnabled =
    tempSettings.overdueRentalBlockEnabled === true;

  const postPenaltyEnabled =
    tempSettings.postOverduePenaltyEnabled === true;

  const penaltyMode =
    tempSettings.overduePenaltyMode ===
    OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
      ? OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
      : OVERDUE_PENALTY_MODE.FIXED_PER_ASSET;

  const updateSetting = (key, value) => {
    setTempSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

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

  const getReasonBadgeClassName = (type) => {
    if (type === 'public') return 'border-blue-200 bg-blue-50 text-blue-700';
    if (type === 'temporary') return 'border-violet-200 bg-violet-50 text-violet-700';
    if (type === 'company') return 'border-orange-200 bg-orange-50 text-orange-700';
    return 'border-slate-200 bg-slate-100 text-slate-600';
  };

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

    if (saved) cancelHolidayEdit();
  };

  const openCalendarHolidayEdit = (holiday, reasonIndex) => {
    setCalendarDetailDate('');
    setHolidayManagementView('list');
    setHolidayManagementYear(String(holiday.date).slice(0, 4));
    startHolidayEdit(holiday, reasonIndex);
  };

  const getMonthCalendarCells = (year, month) => {
    const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const holidayMap = new Map(
      selectedYearHolidays.map((holiday) => [holiday.date, holiday])
    );
    const cells = Array.from({ length: firstDay }, () => null);

    for (let day = 1; day <= lastDate; day += 1) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        day,
        date,
        holiday: holidayMap.get(date) || null,
        weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      });
    }

    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const calendarDetailHoliday = selectedYearHolidays.find(
    (holiday) => holiday.date === calendarDetailDate
  );

  const Toggle = ({
    label,
    description,
    checked,
    onChange,
    ariaLabel,
  }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-900">
            {label}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {description}
          </p>
        </div>

        <button
          type="button"
          aria-label={ariaLabel}
          aria-pressed={checked}
          onClick={onChange}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
            checked
              ? 'mk-brand-gradient-r border-transparent'
              : 'border-slate-300 bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold text-slate-900">
          대여 정책 관리
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          기본 대여 기간, 예약 충돌, 시작·반납일, 휴일, 연장 및 연체자 정책을 한 화면에서 통합 관리합니다.
        </p>
      </div>

      <section className="space-y-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            기본 대여 정책
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            최초 대여의 최대 기간과 동일 기기 추가 신청 허용 기준을 설정합니다.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <label className="block max-w-md">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              기본 최장 허용 대여 기간
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={tempSettings.maxRentalDays ?? 14}
                onChange={(event) =>
                  updateSetting('maxRentalDays', Number(event.target.value))
                }
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
              />
              <span className="shrink-0 text-xs font-semibold text-slate-500">
                일(달력 기준)
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              대여 시작일을 1일차로 포함합니다. 계산된 마지막 날이 주말 또는 등록 휴일이면 다음 영업일로 자동 조정됩니다.
            </p>
          </label>
        </div>

        <Toggle
          label="기간이 겹치지 않으면 동일 기기 신청 허용"
          description="켜면 같은 기기라도 기존 신청·예약·대여 기간과 겹치지 않는 경우 추가 신청을 허용합니다."
          checked={tempAllowNonOverlappingSameAssetRequests}
          ariaLabel="기간이 겹치지 않으면 동일 기기 신청 허용"
          onChange={() =>
            updateSetting(
              'allowNonOverlappingSameAssetRequests',
              !tempAllowNonOverlappingSameAssetRequests
            )
          }
        />
      </section>

      <section className="space-y-5 border-t border-slate-200 pt-7">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            대여 일정 정책
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            업무 종료 이후와 휴무일의 대여 시작일 처리 기준을 설정합니다.
          </p>
        </div>

        <Toggle
          label="업무 종료·휴무일 기준 대여 시작일 다음 영업일 조정"
          description="켜면 설정한 업무 종료 시간 이후 또는 허용하지 않는 휴무일에 신청할 때 대여 시작일을 다음 가능한 영업일로 이동합니다."
          checked={tempBusinessDayAdjustmentEnabled}
          ariaLabel="대여 시작일 다음 영업일 자동 조정 여부"
          onChange={() => {
            const nextValue = !tempBusinessDayAdjustmentEnabled;

            setTempSettings((prev) => ({
              ...prev,
              adjustStartDateAfterWorkEnd: nextValue,
              adjustStartDateToNextBusinessDay: nextValue,
            }));
          }}
        />

        <div
          className={`space-y-5 rounded-2xl border p-5 transition ${
            tempBusinessDayAdjustmentEnabled
              ? 'border-slate-200 bg-white'
              : 'border-slate-200 bg-slate-50 opacity-60'
          }`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                업무 종료 시간
              </span>
              <input
                type="time"
                value={tempSettings.workEndTime || DEFAULT_WORK_END_TIME}
                disabled={!tempBusinessDayAdjustmentEnabled}
                onChange={(event) =>
                  updateSetting(
                    'workEndTime',
                    event.target.value || DEFAULT_WORK_END_TIME
                  )
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <span className="text-xs font-medium text-slate-600">
                  토요일·일요일 제외
                </span>
                <input
                  type="checkbox"
                  checked={
                    tempSettings.excludeWeekendsForStartDate ??
                    DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE
                  }
                  disabled={!tempBusinessDayAdjustmentEnabled}
                  onChange={(event) =>
                    updateSetting(
                      'excludeWeekendsForStartDate',
                      event.target.checked
                    )
                  }
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <span className="text-xs font-medium text-slate-600">
                  등록 휴일 제외
                </span>
                <input
                  type="checkbox"
                  checked={
                    tempSettings.excludeHolidaysForStartDate ??
                    DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE
                  }
                  disabled={!tempBusinessDayAdjustmentEnabled}
                  onChange={(event) =>
                    updateSetting(
                      'excludeHolidaysForStartDate',
                      event.target.checked
                    )
                  }
                  className="h-4 w-4"
                />
              </label>
            </div>
          </div>

          <p className="text-[11px] leading-5 text-slate-500">
            시작일 자동 조정 설정과 관계없이 반납 예정일은 토요일·일요일과 활성화된 법정공휴일, 임시공휴일, 회사휴일, 수동등록 휴일을 피하도록 다음 영업일로 자동 조정됩니다.
          </p>
        </div>
      </section>

      <section className="space-y-5 border-t border-slate-200 pt-7">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            휴일 관리
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            법정공휴일과 임시공휴일을 자동으로 불러오거나 회사휴일과 수동 휴일을 직접 등록할 수 있습니다. 등록된 휴일은 대여 시작일과 반납 예정일 계산에 반영됩니다.
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
                  onChange={(event) =>
                    setHolidayImportYear(event.target.value)
                  }
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

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="이전 연도"
                onClick={() =>
                  setHolidayManagementYear(
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

              <button
                type="button"
                aria-label="다음 연도"
                onClick={() =>
                  setHolidayManagementYear(
                    String(Math.min(2100, selectedHolidayYear + 1))
                  )
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
              >
                <ChevronRight size={16} />
              </button>

              <span className="ml-1 text-xs text-slate-500">
                등록 휴일 {selectedYearHolidays.length}일
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
                            {(holiday.reasons || []).map((reason, reasonIndex) => {
                              const isEditing =
                                editingHoliday?.sourceDate === holiday.date &&
                                editingHoliday?.reasonIndex === reasonIndex;

                              return isEditing ? (
                                <div
                                  key={`${holiday.date}-${reasonIndex}-edit`}
                                  className="grid gap-2 rounded-xl border border-orange-200 bg-orange-50/50 p-3 lg:grid-cols-[150px_130px_minmax(0,1fr)_auto]"
                                >
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
                              ) : (
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
                                    <span className="truncate text-xs font-semibold text-slate-700">
                                      {reason.name || '휴일'}
                                    </span>
                                  </div>

                                  <div className="flex shrink-0 items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      aria-label="휴일 수정"
                                      onClick={() =>
                                        startHolidayEdit(holiday, reasonIndex)
                                      }
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                                    >
                                      <Edit3 size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="휴일 삭제"
                                      onClick={() =>
                                        deleteTempHoliday(
                                          holiday.date,
                                          reasonIndex
                                        )
                                      }
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 12 }, (_, monthIndex) => monthIndex + 1).map(
                (month) => (
                  <div
                    key={month}
                    className="rounded-2xl border border-slate-200 bg-white p-3"
                  >
                    <div className="mb-3 text-center text-xs font-bold text-slate-900">
                      {selectedHolidayYear}년 {month}월
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400">
                      {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                        <div
                          key={day}
                          className={
                            index === 0
                              ? 'text-rose-500'
                              : index === 6
                                ? 'text-blue-500'
                                : ''
                          }
                        >
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {getMonthCalendarCells(selectedHolidayYear, month).map(
                        (cell, cellIndex) =>
                          cell ? (
                            <button
                              type="button"
                              key={cell.date}
                              onClick={() =>
                                cell.holiday && setCalendarDetailDate(cell.date)
                              }
                              className={`relative min-h-12 rounded-lg border px-1 py-1 text-left transition ${
                                cell.holiday
                                  ? 'cursor-pointer border-orange-200 bg-orange-50 hover:border-orange-300'
                                  : 'cursor-default border-transparent hover:bg-slate-50'
                              }`}
                            >
                              <span
                                className={`text-[10px] font-semibold ${
                                  cell.weekday === 0
                                    ? 'text-rose-500'
                                    : cell.weekday === 6
                                      ? 'text-blue-500'
                                      : 'text-slate-600'
                                }`}
                              >
                                {cell.day}
                              </span>
                              {cell.holiday && (
                                <div className="mt-0.5 max-h-6 overflow-hidden text-[8px] font-semibold leading-3 text-orange-700">
                                  {(cell.holiday.reasons || [])
                                    .map((reason) => reason.name)
                                    .join(' · ')}
                                </div>
                              )}
                            </button>
                          ) : (
                            <div key={`blank-${cellIndex}`} className="min-h-12" />
                          )
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-5 border-t border-slate-200 pt-7">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            대여 연장 관리
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            기존 대여 연장 허용 여부, 승인 방식, 횟수와 기간을 설정합니다.
          </p>
        </div>

        <Toggle
          label="대여 연장 허용"
          description="끄면 사용자가 연장 요청을 생성할 수 없습니다."
          checked={extensionEnabled}
          ariaLabel="대여 연장 허용 여부"
          onChange={() =>
            updateSetting(
              'rentalExtensionEnabled',
              !extensionEnabled
            )
          }
        />

        <div
          className={`space-y-5 rounded-2xl border p-5 transition ${
            extensionEnabled
              ? 'border-slate-200 bg-white'
              : 'border-slate-200 bg-slate-50 opacity-60'
          }`}
        >
          <div>
            <div className="text-sm font-bold text-slate-900">
              연장 처리 방식
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              관리자 승인형은 신청 관리 화면에서 처리하고, 자동 승인형은 조건을 통과한 요청을 즉시 승인합니다.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  value: RENTAL_EXTENSION_APPROVAL_MODE.MANUAL,
                  title: '관리자 승인형',
                  description: '관리자가 일정 충돌을 확인한 뒤 승인 또는 불허합니다.',
                },
                {
                  value: RENTAL_EXTENSION_APPROVAL_MODE.AUTO,
                  title: '조건 충족 시 자동 승인형',
                  description: '횟수·신청 가능일·예약 충돌 조건을 통과하면 즉시 연장합니다.',
                },
              ].map((option) => (
                <button
                  type="button"
                  key={option.value}
                  disabled={!extensionEnabled}
                  onClick={() =>
                    updateSetting(
                      'rentalExtensionApprovalMode',
                      option.value
                    )
                  }
                  className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed ${
                    approvalMode === option.value
                      ? 'border-orange-400 bg-orange-50 text-orange-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200'
                  }`}
                >
                  <div className="text-xs font-bold">
                    {option.title}
                  </div>
                  <div className="mt-1 text-[11px] leading-4">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                최대 연장 가능 횟수
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  disabled={!extensionEnabled}
                  value={tempSettings.rentalExtensionMaxCount ?? 1}
                  onChange={(event) =>
                    updateSetting(
                      'rentalExtensionMaxCount',
                      Number(event.target.value)
                    )
                  }
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <span className="text-xs font-semibold text-slate-500">회</span>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                회당 연장 가능 기간
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  disabled={!extensionEnabled}
                  value={tempSettings.rentalExtensionBusinessDays ?? 5}
                  onChange={(event) =>
                    updateSetting(
                      'rentalExtensionBusinessDays',
                      Number(event.target.value)
                    )
                  }
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <span className="text-xs font-semibold text-slate-500">
                  영업일
                </span>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                연장 신청 대기일
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={!extensionEnabled}
                  value={tempSettings.rentalExtensionRequestWaitDays ?? 7}
                  onChange={(event) =>
                    updateSetting(
                      'rentalExtensionRequestWaitDays',
                      Number(event.target.value)
                    )
                  }
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                />
                <span className="text-xs font-semibold text-slate-500">일</span>
              </div>
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-5 border-t border-slate-200 pt-7">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            연체자 관리
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            현재 연체 중인 사용자의 신규 신청 제한과 모든 연체 기기 반납 후 추가 페널티를 설정합니다.
          </p>
        </div>

        <Toggle
          label="연체 중 신규 대여 제한"
          description="켜면 반납예정일이 지난 미반납 기기가 한 대라도 있는 사용자는 모든 연체 기기를 반납할 때까지 신규 신청할 수 없습니다."
          checked={overdueBlockEnabled}
          ariaLabel="연체 중 신규 대여 제한 여부"
          onChange={() =>
            updateSetting(
              'overdueRentalBlockEnabled',
              !overdueBlockEnabled
            )
          }
        />

        <Toggle
          label="연체 반납 후 추가 대여 제한"
          description="켜면 마지막 연체 기기를 반납한 다음 날부터 계산된 기간 동안 신규 대여를 제한합니다."
          checked={postPenaltyEnabled}
          ariaLabel="연체 반납 후 추가 대여 제한 여부"
          onChange={() =>
            updateSetting(
              'postOverduePenaltyEnabled',
              !postPenaltyEnabled
            )
          }
        />

        <div
          className={`space-y-5 rounded-2xl border p-5 transition ${
            postPenaltyEnabled
              ? 'border-slate-200 bg-white'
              : 'border-slate-200 bg-slate-50 opacity-60'
          }`}
        >
          <div>
            <div className="text-sm font-bold text-slate-900">
              페널티 계산 방식
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              두 방식 모두 주말과 공휴일을 포함한 달력 기준 일수를 사용합니다.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label
              className={`rounded-xl border p-4 transition ${
                penaltyMode === OVERDUE_PENALTY_MODE.FIXED_PER_ASSET
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="overduePenaltyMode"
                  disabled={!postPenaltyEnabled}
                  checked={
                    penaltyMode ===
                    OVERDUE_PENALTY_MODE.FIXED_PER_ASSET
                  }
                  onChange={() =>
                    updateSetting(
                      'overduePenaltyMode',
                      OVERDUE_PENALTY_MODE.FIXED_PER_ASSET
                    )
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900">
                    기기당 고정 기간
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    연체한 기기 수에 기기당 설정 일수를 곱합니다.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-600">기기 1대당</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={
                        !postPenaltyEnabled ||
                        penaltyMode !==
                          OVERDUE_PENALTY_MODE.FIXED_PER_ASSET
                      }
                      value={tempSettings.overdueFixedDaysPerAsset ?? 1}
                      onChange={(event) =>
                        updateSetting(
                          'overdueFixedDaysPerAsset',
                          Number(event.target.value)
                        )
                      }
                      className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <span className="text-xs font-semibold text-slate-500">일</span>
                  </div>
                </div>
              </div>
            </label>

            <label
              className={`rounded-xl border p-4 transition ${
                penaltyMode ===
                OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="overduePenaltyMode"
                  disabled={!postPenaltyEnabled}
                  checked={
                    penaltyMode ===
                    OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
                  }
                  onChange={() =>
                    updateSetting(
                      'overduePenaltyMode',
                      OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
                    )
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900">
                    연체일수 배수
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    각 기기의 실제 연체일수 합계에 설정 배수를 곱합니다.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-600">연체일수의</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={
                        !postPenaltyEnabled ||
                        penaltyMode !==
                          OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
                      }
                      value={tempSettings.overdueDayMultiplier ?? 1}
                      onChange={(event) =>
                        updateSetting(
                          'overdueDayMultiplier',
                          Number(event.target.value)
                        )
                      }
                      className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <span className="text-xs font-semibold text-slate-500">배</span>
                  </div>
                </div>
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] leading-5 text-blue-800">
            여러 연체 기기를 서로 다른 날 반납하면 각 기기의 실제 반납일까지 연체일수를 계산합니다. 예를 들어 3일 연체 후 반납한 기기와, 당시 5일 연체였다가 3일 뒤 반납한 기기는 3일 + 8일 = 총 11일로 계산합니다. 페널티는 마지막 연체 기기를 반납한 다음 날부터 시작합니다.
          </div>
        </div>
      </section>

      {calendarDetailHoliday && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {formatDateWithKoreanWeekday(calendarDetailHoliday.date)}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  등록된 휴일 사유를 확인하거나 수정할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setCalendarDetailDate('')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {(calendarDetailHoliday.reasons || []).map((reason, reasonIndex) => (
                <div
                  key={`${reason.type}-${reason.name}-${reasonIndex}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3"
                >
                  <div className="min-w-0">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${getReasonBadgeClassName(
                        reason.type
                      )}`}
                    >
                      {HOLIDAY_TYPE_LABEL[reason.type] || '휴일'}
                    </span>
                    <div className="mt-1 truncate text-xs font-semibold text-slate-700">
                      {reason.name || '휴일'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="휴일 수정"
                      onClick={() =>
                        openCalendarHolidayEdit(
                          calendarDetailHoliday,
                          reasonIndex
                        )
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="휴일 삭제"
                      onClick={() => {
                        deleteTempHoliday(
                          calendarDetailHoliday.date,
                          reasonIndex
                        );
                        if (
                          (calendarDetailHoliday.reasons || []).length <= 1
                        ) {
                          setCalendarDetailDate('');
                        }
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {holidayImportConflictModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              중복 휴일 확인
            </h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {holidayImportConflictModal.year}년 공휴일 {holidayImportConflictModal.importedDateCount}일 중 이미 등록된 날짜가 {holidayImportConflictModal.duplicateDateCount}일 있습니다. 신규 날짜는 {holidayImportConflictModal.newDateCount}일입니다.
            </p>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-5 text-slate-600">
              <div><strong>중복 제외:</strong> 기존 날짜의 휴일 사유를 유지하고 신규 날짜만 추가합니다.</div>
              <div><strong>병합:</strong> 기존 사유를 유지하면서 불러온 법정·임시공휴일 사유를 함께 등록합니다.</div>
              <div><strong>교체:</strong> 중복 날짜의 모든 기존 사유를 불러온 데이터로 바꿉니다. 회사휴일과 수동등록 사유도 제거될 수 있습니다.</div>
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

      <div className="flex flex-col-reverse gap-2.5 border-t border-slate-200/60 pt-4 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setTempSettings(data.settings);
            setNewHolidayDate(today());
            setNewHolidayName('');
            setNewHolidayType(DEFAULT_HOLIDAY_TYPE);
            setHolidayImportYear(String(getKoreaNow().getUTCFullYear()));
            setHolidayManagementYear(String(getKoreaNow().getUTCFullYear()));
            setHolidayImportConflictModal(null);
            setHolidayImportLoading(false);
            triggerToast(
              '대여 정책 변경사항이 취소되고 이전 상태로 복원되었습니다.',
              'success'
            );
          }}
          className="w-full sm:w-auto"
        >
          취소
        </Button>

        <Button
          variant="primary"
          onClick={saveSystemSettings}
          className="w-full sm:w-auto"
        >
          <Save size={14} />
          변경사항 저장
        </Button>
      </div>
    </div>
  );
}
