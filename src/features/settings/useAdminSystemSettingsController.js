import { useEffect, useMemo, useState } from 'react';
import { OVERDUE_PENALTY_MODE } from '../../constants/appConstants.js';
import {
  DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
  DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
  DEFAULT_EXCLUDE_SATURDAYS,
  DEFAULT_EXCLUDE_SUNDAYS,
  DEFAULT_HOLIDAY_TYPE,
  RENTAL_POLICY_SETTING_KEYS,
  getHolidayReasons,
  getSafeMaxRentalDays,
  normalizeHolidayList,
  normalizeHolidayReason,
  normalizeRentalPolicySettings,
  serializeHolidayListForFirestore,
} from '../../domain/rentalPolicy.js';
import {
  POLICY_CONTENT_DOMAINS,
  readPolicyContentCutoverConfig,
  replacePolicyContentDomainInPostgresql,
} from '../content/policyContentCutover.js';
import {
  formatDateWithKoreanWeekday,
  getKoreaNow,
  today,
} from '../../utils/appUtils.js';

const getComparableRentalPolicySettings = (
  settings = {},
  dataSettings = {}
) => {
  const excludeSaturdays =
    settings.excludeSaturdays ??
    settings.excludeWeekendsForStartDate ??
    DEFAULT_EXCLUDE_SATURDAYS;
  const excludeSundays =
    settings.excludeSundays ??
    settings.excludeWeekendsForStartDate ??
    DEFAULT_EXCLUDE_SUNDAYS;

  const normalizedSettings = normalizeRentalPolicySettings({
    ...dataSettings,
    ...settings,
    holidays: dataSettings.holidays,
    allowNonOverlappingSameAssetRequests:
      settings.allowNonOverlappingSameAssetRequests ??
      DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
    adjustStartDateAfterWorkEnd:
      settings.adjustStartDateToNextBusinessDay ??
      settings.adjustStartDateAfterWorkEnd ??
      DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
    adjustStartDateToNextBusinessDay:
      settings.adjustStartDateToNextBusinessDay ??
      settings.adjustStartDateAfterWorkEnd ??
      DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
    excludeSaturdays,
    excludeSundays,
    excludeWeekendsForStartDate: excludeSaturdays && excludeSundays,
    maxRentalDays: getSafeMaxRentalDays(settings),
  });

  const comparableSettings = Object.fromEntries(
    RENTAL_POLICY_SETTING_KEYS.map((key) => [key, normalizedSettings[key]])
  );

  [
    'maxRentalDays',
    'rentalExtensionMaxCount',
    'rentalExtensionDays',
    'rentalExtensionRequestWaitDays',
    'overdueFixedDaysPerAsset',
    'overdueDayMultiplier',
    'workEndTime',
  ].forEach((key) => {
    comparableSettings[key] = String(
      settings[key] ?? normalizedSettings[key] ?? ''
    );
  });

  return comparableSettings;
};

export const useAdminSystemSettingsState = ({ adminTab, dataSettings }) => {
  const [tempSettings, setTempSettings] = useState(dataSettings);
  const [newHolidayDate, setNewHolidayDate] = useState(today());
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayType, setNewHolidayType] = useState(DEFAULT_HOLIDAY_TYPE);
  const [holidayImportYear, setHolidayImportYear] = useState(
    String(getKoreaNow().getUTCFullYear())
  );
  const [holidayImportLoading, setHolidayImportLoading] = useState(false);
  const [holidayImportConflictModal, setHolidayImportConflictModal] =
    useState(null);
  const [holidayManagementYear, setHolidayManagementYear] = useState(
    String(getKoreaNow().getUTCFullYear())
  );
  const [holidayManagementMonth, setHolidayManagementMonth] = useState(
    getKoreaNow().getUTCMonth() + 1
  );
  const [holidayManagementView, setHolidayManagementView] =
    useState('calendar');

  useEffect(() => {
    if (
      ['serviceOperations', 'extensionSettings', 'holidaySettings'].includes(
        adminTab
      )
    ) {
      setTempSettings(dataSettings);
      setNewHolidayDate(today());
      setNewHolidayName('');
      setNewHolidayType(DEFAULT_HOLIDAY_TYPE);
      setHolidayImportYear(String(getKoreaNow().getUTCFullYear()));
      setHolidayImportLoading(false);

      if (adminTab === 'holidaySettings') {
        setHolidayManagementYear(String(getKoreaNow().getUTCFullYear()));
        setHolidayManagementMonth(getKoreaNow().getUTCMonth() + 1);
        setHolidayManagementView('calendar');
      }
    }
  }, [adminTab, dataSettings]);

  const holidaySettingsDirty = useMemo(
    () =>
      JSON.stringify(
        serializeHolidayListForFirestore(tempSettings.holidays || [])
      ) !==
      JSON.stringify(
        serializeHolidayListForFirestore(dataSettings.holidays || [])
      ),
    [dataSettings.holidays, tempSettings.holidays]
  );

  const rentalPolicySettingsDirty = useMemo(
    () =>
      JSON.stringify(
        getComparableRentalPolicySettings(tempSettings, dataSettings)
      ) !==
      JSON.stringify(
        getComparableRentalPolicySettings(dataSettings, dataSettings)
      ),
    [dataSettings, tempSettings]
  );

  return {
    holidayImportConflictModal,
    holidayImportLoading,
    holidayImportYear,
    holidayManagementMonth,
    holidayManagementView,
    holidayManagementYear,
    holidaySettingsDirty,
    newHolidayDate,
    newHolidayName,
    newHolidayType,
    rentalPolicySettingsDirty,
    setHolidayImportConflictModal,
    setHolidayImportLoading,
    setHolidayImportYear,
    setHolidayManagementMonth,
    setHolidayManagementView,
    setHolidayManagementYear,
    setNewHolidayDate,
    setNewHolidayName,
    setNewHolidayType,
    setTempSettings,
    tempSettings,
  };
};

export default function useAdminSystemSettingsController({
  dataSettings,
  publicConfig,
  holidayImportConflictModal,
  holidayImportYear,
  isSplitStorageReady,
  newHolidayDate,
  newHolidayName,
  newHolidayType,
  setData,
  setHolidayImportConflictModal,
  setHolidayImportLoading,
  setHolidayManagementMonth,
  setHolidayManagementYear,
  setNewHolidayDate,
  setNewHolidayName,
  setNewHolidayType,
  setTempSettings,
  tempSettings,
  triggerToast,
}) {
  const addTempHoliday = () => {
    const holidayDate = newHolidayDate;
    const holidayName = newHolidayName.trim();
    const nextReason = normalizeHolidayReason({
      type: newHolidayType || DEFAULT_HOLIDAY_TYPE,
      name: holidayName,
    });

    if (!holidayDate) {
      triggerToast('휴일 날짜를 선택해 주세요.', 'error');
      return;
    }

    const normalizedHolidays = normalizeHolidayList(tempSettings.holidays);
    const existingHoliday = normalizedHolidays.find(
      (holiday) => holiday.date === holidayDate
    );

    if (
      existingHoliday &&
      getHolidayReasons(existingHoliday).some(
        (reason) =>
          reason.type === nextReason.type && reason.name === nextReason.name
      )
    ) {
      triggerToast(
        '같은 날짜에 동일한 휴일 사유가 이미 등록되어 있습니다.',
        'error'
      );
      return;
    }

    const nextHolidays = existingHoliday
      ? normalizedHolidays.map((holiday) =>
          holiday.date === holidayDate
            ? normalizeHolidayList([
                holiday,
                {
                  date: holidayDate,
                  reasons: [nextReason],
                  enabled: true,
                },
              ])[0]
            : holiday
        )
      : normalizeHolidayList([
          ...normalizedHolidays,
          {
            date: holidayDate,
            reasons: [nextReason],
            enabled: true,
          },
        ]);

    setTempSettings((prev) => ({
      ...prev,
      holidays: normalizeHolidayList(nextHolidays),
    }));
    setHolidayManagementYear(String(holidayDate).slice(0, 4));
    setHolidayManagementMonth(Number(String(holidayDate).slice(5, 7)) || 1);
    setNewHolidayName('');
    triggerToast(
      `[${formatDateWithKoreanWeekday(holidayDate)}] ${nextReason.name} 사유가 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  };

  const updateTempHolidayReason = ({
    sourceDate,
    reasonIndex,
    date,
    type,
    name,
  }) => {
    const nextDate = String(date || '').trim();
    const nextReason = normalizeHolidayReason({ type, name });
    const normalizedHolidays = normalizeHolidayList(tempSettings.holidays);
    const sourceHoliday = normalizedHolidays.find(
      (holiday) => holiday.date === sourceDate
    );

    if (!nextDate) {
      triggerToast('휴일 날짜를 선택해 주세요.', 'error');
      return false;
    }

    if (!sourceHoliday) {
      triggerToast('수정할 휴일 정보를 찾지 못했습니다.', 'error');
      return false;
    }

    if (
      nextDate !== sourceDate &&
      normalizedHolidays.some((holiday) => holiday.date === nextDate)
    ) {
      triggerToast(
        '해당 날짜에는 이미 등록된 휴일이 있습니다. 기존 휴일에 사유를 추가하거나 다른 날짜를 선택해 주세요.',
        'error'
      );
      return false;
    }

    const sourceReasons = getHolidayReasons(sourceHoliday);

    if (
      sourceReasons.some(
        (reason, index) =>
          index !== reasonIndex &&
          reason.type === nextReason.type &&
          reason.name === nextReason.name
      )
    ) {
      triggerToast(
        '같은 날짜에 동일한 휴일 사유가 이미 등록되어 있습니다.',
        'error'
      );
      return false;
    }

    const nextSourceReasons = sourceReasons.filter(
      (_, index) => index !== reasonIndex
    );
    const withoutSource = normalizedHolidays.filter(
      (holiday) => holiday.date !== sourceDate
    );
    const rebuiltHolidays = [...withoutSource];

    if (nextSourceReasons.length > 0) {
      rebuiltHolidays.push({
        ...sourceHoliday,
        reasons: nextSourceReasons,
      });
    }

    rebuiltHolidays.push({
      date: nextDate,
      reasons: [nextReason],
      enabled: sourceHoliday.enabled !== false,
    });

    setTempSettings((prev) => ({
      ...prev,
      holidays: normalizeHolidayList(rebuiltHolidays),
    }));
    setHolidayManagementYear(nextDate.slice(0, 4));
    setHolidayManagementMonth(Number(nextDate.slice(5, 7)) || 1);
    triggerToast(
      `[${formatDateWithKoreanWeekday(nextDate)}] 휴일 정보가 임시 수정되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );

    return true;
  };

  const deleteTempHoliday = (targetDate, reasonIndex) => {
    const normalizedHolidays = normalizeHolidayList(tempSettings.holidays);
    const targetHoliday = normalizedHolidays.find(
      (holiday) => holiday.date === targetDate
    );
    const targetReason = getHolidayReasons(targetHoliday)[reasonIndex];

    if (!targetHoliday || !targetReason) {
      triggerToast('삭제할 휴일 정보를 찾지 못했습니다.', 'error');
      return;
    }

    const nextReasons = getHolidayReasons(targetHoliday).filter(
      (_, index) => index !== reasonIndex
    );
    const nextHolidays = normalizedHolidays
      .filter((holiday) => holiday.date !== targetDate)
      .concat(
        nextReasons.length > 0
          ? [
              {
                ...targetHoliday,
                reasons: nextReasons,
              },
            ]
          : []
      );

    setTempSettings((prev) => ({
      ...prev,
      holidays: normalizeHolidayList(nextHolidays),
    }));

    triggerToast(
      `[${targetReason.name || '휴일'}] 휴일 사유가 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  };

  const mergeImportedHolidays = (
    currentHolidays = [],
    importedHolidays = [],
    mode = 'merge'
  ) => {
    const currentList = normalizeHolidayList(currentHolidays);
    const importedList = normalizeHolidayList(importedHolidays);
    const holidayMap = new Map(
      currentList.map((holiday) => [holiday.date, holiday])
    );

    importedList.forEach((importedHoliday) => {
      const existingHoliday = holidayMap.get(importedHoliday.date);

      if (!existingHoliday) {
        holidayMap.set(importedHoliday.date, importedHoliday);
        return;
      }

      if (mode === 'exclude') {
        return;
      }

      if (mode === 'replace') {
        holidayMap.set(importedHoliday.date, importedHoliday);
        return;
      }

      holidayMap.set(
        importedHoliday.date,
        normalizeHolidayList([existingHoliday, importedHoliday])[0]
      );
    });

    return normalizeHolidayList(Array.from(holidayMap.values()));
  };

  const applyHolidayImportConflictChoice = (mode) => {
    const pendingImport = holidayImportConflictModal;

    if (!pendingImport) return;

    const nextMode = ['exclude', 'merge', 'replace'].includes(mode)
      ? mode
      : 'merge';

    setTempSettings((prev) => ({
      ...prev,
      holidays: mergeImportedHolidays(
        prev.holidays || [],
        pendingImport.importedHolidays,
        nextMode
      ),
    }));
    setHolidayManagementYear(String(pendingImport.year));
    setHolidayManagementMonth(
      pendingImport.year === getKoreaNow().getUTCFullYear()
        ? getKoreaNow().getUTCMonth() + 1
        : 1
    );
    setHolidayImportConflictModal(null);

    const actionLabel =
      nextMode === 'exclude'
        ? '중복 날짜를 제외하고'
        : nextMode === 'replace'
          ? '중복 날짜를 불러온 데이터로 교체하고'
          : '기존 휴일 사유와 병합하고';

    triggerToast(
      `${pendingImport.year}년 공휴일을 ${actionLabel} 임시 목록에 반영했습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  };

  const importKoreanPublicHolidaysFromJson = async () => {
    const year = Number(holidayImportYear);

    if (!year || year < 2000 || year > 2100) {
      triggerToast(
        '불러올 연도를 2000년부터 2100년 사이로 입력해 주세요.',
        'error'
      );
      return;
    }

    setHolidayImportLoading(true);

    try {
      const jsonUrl = `${import.meta.env.BASE_URL}holidays/kr-holidays-${year}.json?ts=${Date.now()}`;
      const response = await fetch(jsonUrl);

      if (!response.ok) {
        triggerToast(
          `${year}년 공휴일 JSON 파일을 찾지 못했습니다. 먼저 로컬 스크립트 또는 GitHub Actions로 public/holidays/kr-holidays-${year}.json 파일을 생성해 주세요.`,
          'error'
        );
        return;
      }

      const payload = await response.json();
      const importedHolidays = normalizeHolidayList(
        Array.isArray(payload)
          ? payload
          : Array.isArray(payload.holidays)
            ? payload.holidays
            : []
      );

      if (importedHolidays.length === 0) {
        triggerToast(
          `${year}년 공휴일 JSON에 불러올 휴일 데이터가 없습니다.`,
          'error'
        );
        return;
      }

      const currentHolidays = normalizeHolidayList(tempSettings.holidays);
      const currentDateSet = new Set(
        currentHolidays.map((holiday) => holiday.date)
      );
      const duplicateHolidays = importedHolidays.filter((holiday) =>
        currentDateSet.has(holiday.date)
      );
      const newHolidays = importedHolidays.filter(
        (holiday) => !currentDateSet.has(holiday.date)
      );

      setHolidayManagementYear(String(year));
      setHolidayManagementMonth(
        year === getKoreaNow().getUTCFullYear()
          ? getKoreaNow().getUTCMonth() + 1
          : 1
      );

      if (duplicateHolidays.length > 0) {
        setHolidayImportConflictModal({
          year,
          importedHolidays,
          importedDateCount: importedHolidays.length,
          newDateCount: newHolidays.length,
          duplicateDateCount: duplicateHolidays.length,
        });
        return;
      }

      setTempSettings((prev) => ({
        ...prev,
        holidays: mergeImportedHolidays(
          prev.holidays || [],
          importedHolidays,
          'merge'
        ),
      }));

      triggerToast(
        `${year}년 법정/임시공휴일 ${importedHolidays.length}건을 임시 목록에 불러왔습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
        'success'
      );
    } catch (error) {
      console.error('Static holiday JSON import error:', error);
      triggerToast(
        '공휴일 JSON 파일을 불러오는 중 오류가 발생했습니다. public/holidays 파일 생성 및 배포 상태를 확인해 주세요.',
        'error'
      );
    } finally {
      setHolidayImportLoading(false);
    }
  };

  const saveSystemSettings = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 대여 정책을 저장할 수 없습니다.',
        'error'
      );
      return false;
    }

    if (
      !Number.isInteger(Number(tempSettings.maxRentalDays)) ||
      Number(tempSettings.maxRentalDays) < 1
    ) {
      triggerToast(
        '기본 최장 허용 대여 기간은 1 이상의 정수로 입력해 주세요.',
        'error'
      );
      return false;
    }

    if (
      tempSettings.rentalExtensionEnabled &&
      (Number(tempSettings.rentalExtensionMaxCount) < 1 ||
        Number(tempSettings.rentalExtensionDays) < 1 ||
        Number(tempSettings.rentalExtensionRequestWaitDays) < 0)
    ) {
      triggerToast(
        '대여 연장 횟수와 회당 연장 기간은 1 이상, 연장 신청 대기일은 0 이상으로 입력해 주세요.',
        'error'
      );
      return false;
    }

    if (
      tempSettings.postOverduePenaltyEnabled &&
      ((tempSettings.overduePenaltyMode ===
        OVERDUE_PENALTY_MODE.FIXED_PER_ASSET &&
        Number(tempSettings.overdueFixedDaysPerAsset) < 1) ||
        (tempSettings.overduePenaltyMode ===
          OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER &&
          Number(tempSettings.overdueDayMultiplier) < 1))
    ) {
      triggerToast(
        '연체 페널티의 기기당 고정 일수와 연체일 배수는 1 이상의 정수로 입력해 주세요.',
        'error'
      );
      return false;
    }

    const excludeSaturdays =
      tempSettings.excludeSaturdays ??
      tempSettings.excludeWeekendsForStartDate ??
      DEFAULT_EXCLUDE_SATURDAYS;
    const excludeSundays =
      tempSettings.excludeSundays ??
      tempSettings.excludeWeekendsForStartDate ??
      DEFAULT_EXCLUDE_SUNDAYS;

    const normalizedPolicySettings = normalizeRentalPolicySettings({
      ...dataSettings,
      ...tempSettings,
      holidays: dataSettings.holidays,
      allowNonOverlappingSameAssetRequests:
        tempSettings.allowNonOverlappingSameAssetRequests ??
        DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
      adjustStartDateAfterWorkEnd:
        tempSettings.adjustStartDateToNextBusinessDay ??
        tempSettings.adjustStartDateAfterWorkEnd ??
        DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
      adjustStartDateToNextBusinessDay:
        tempSettings.adjustStartDateToNextBusinessDay ??
        tempSettings.adjustStartDateAfterWorkEnd ??
        DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
      excludeSaturdays,
      excludeSundays,
      excludeWeekendsForStartDate: excludeSaturdays && excludeSundays,
      maxRentalDays: getSafeMaxRentalDays(tempSettings),
    });

    const policyValues = Object.fromEntries(
      RENTAL_POLICY_SETTING_KEYS.map((key) => [
        key,
        normalizedPolicySettings[key],
      ])
    );

    try {
      const policyContentConfig = readPolicyContentCutoverConfig();
        await replacePolicyContentDomainInPostgresql({
          domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
          config: policyContentConfig,
          documents: [{
            key: 'rentalSystem/publicConfig',
            payload: {
              ...(publicConfig || {}),
              settings: { ...(publicConfig?.settings || dataSettings), ...policyValues },
              updatedAt: new Date(),
            },
          }],
        });

      const nextSettings = {
        ...dataSettings,
        ...policyValues,
        holidays: normalizeHolidayList(dataSettings.holidays),
      };

      setData((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          ...policyValues,
        },
      }));
      setTempSettings(nextSettings);

      triggerToast(
        '대여 정책 변경사항이 성공적으로 저장 및 반영되었습니다.',
        'success'
      );

      return true;
    } catch (error) {
      console.error('Rental policy settings save error:', error);
      triggerToast(
        '대여 정책 저장에 실패했습니다. 기존 설정은 유지됩니다.',
        'error'
      );
      return false;
    }
  };

  const saveHolidaySettings = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'PostgreSQL 설정 저장소가 준비되지 않아 휴일을 저장할 수 없습니다.',
        'error'
      );
      return false;
    }

    const nextHolidays = serializeHolidayListForFirestore(
      tempSettings.holidays || []
    );

    try {
      const policyContentConfig = readPolicyContentCutoverConfig();
        await replacePolicyContentDomainInPostgresql({
          domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
          config: policyContentConfig,
          documents: [{
            key: 'rentalSystem/publicConfig',
            payload: {
              ...(publicConfig || {}),
              settings: { ...(publicConfig?.settings || dataSettings), holidays: nextHolidays },
              updatedAt: new Date(),
            },
          }],
        });

      const normalizedHolidays = normalizeHolidayList(nextHolidays);

      setData((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          holidays: normalizedHolidays,
        },
      }));
      setTempSettings((prev) => ({
        ...prev,
        holidays: normalizedHolidays,
      }));
      setHolidayImportConflictModal(null);
      setHolidayImportLoading(false);

      triggerToast(
        '휴일 변경사항이 성공적으로 저장 및 반영되었습니다.',
        'success'
      );

      return true;
    } catch (error) {
      console.error('Holiday settings save error:', error);
      triggerToast(
        '휴일 저장에 실패했습니다. 기존 설정은 유지됩니다.',
        'error'
      );
      return false;
    }
  };

  const discardHolidayChanges = () => {
    setTempSettings((prev) => ({
      ...prev,
      holidays: normalizeHolidayList(dataSettings.holidays || []),
    }));
    setNewHolidayDate(today());
    setNewHolidayName('');
    setNewHolidayType(DEFAULT_HOLIDAY_TYPE);
    setHolidayImportConflictModal(null);
    setHolidayImportLoading(false);
  };

  const discardRentalPolicyChanges = () => {
    const savedPolicyValues = getComparableRentalPolicySettings(
      dataSettings,
      dataSettings
    );

    setTempSettings((prev) => ({
      ...prev,
      ...savedPolicyValues,
      holidays: prev.holidays,
    }));
  };

  return {
    addTempHoliday,
    applyHolidayImportConflictChoice,
    deleteTempHoliday,
    discardHolidayChanges,
    discardRentalPolicyChanges,
    importKoreanPublicHolidaysFromJson,
    saveHolidaySettings,
    saveSystemSettings,
    updateTempHolidayReason,
  };
}
