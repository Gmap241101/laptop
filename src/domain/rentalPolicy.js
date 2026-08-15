import {
  RENTAL_BLOCKING_REQUEST_STATUSES,
  RENTAL_EXTENSION_APPROVAL_MODE,
  STATUS,
  USER_REQUEST_REVIEW_STATUS,
} from '../constants/appConstants.js';
import {
  addDaysFrom,
  formatDateWithKoreanWeekday,
  getDisplayRentalStatus,
  getKoreaNow,
  hasRentalPeriodOverlap,
  today,
} from '../utils/appUtils.js';
import { normalizeOverduePolicySettings } from '../utils/overduePolicy.js';

export const findSameAssetBlockingRequest = (requests = [], laptopId) => {
  return requests.find(
    (request) =>
      request?.laptopId === laptopId &&
      RENTAL_BLOCKING_REQUEST_STATUSES.includes(request.status)
  );
};

export const findSameAssetPeriodOverlappingRequest = (
  requests = [],
  laptopId,
  startDate,
  dueDate
) => {
  return requests.find(
    (request) =>
      request?.laptopId === laptopId &&
      RENTAL_BLOCKING_REQUEST_STATUSES.includes(request.status) &&
      hasRentalPeriodOverlap(
        request.startDate,
        request.dueDate,
        startDate,
        dueDate
      )
  );
};

export const getLaptopRentalAvailability = (
  laptop,
  requests = [],
  settings = {},
  startDate = '',
  dueDate = ''
) => {
  if (!laptop) {
    return {
      blocked: true,
      status: STATUS.UNAVAILABLE,
      reason: 'notFound',
      blockingRequest: null,
    };
  }

  if (laptop.status === STATUS.UNAVAILABLE) {
    return {
      blocked: true,
      status: STATUS.UNAVAILABLE,
      reason: 'assetUnavailable',
      blockingRequest: null,
    };
  }

  const shouldAllowNonOverlappingSameAssetRequests =
    settings.allowNonOverlappingSameAssetRequests ??
    DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS;

  if (shouldAllowNonOverlappingSameAssetRequests && startDate && dueDate) {
    const periodBlockingRequest = findSameAssetPeriodOverlappingRequest(
      requests,
      laptop.id,
      startDate,
      dueDate
    );

    return {
      blocked: Boolean(periodBlockingRequest),
      status: periodBlockingRequest?.status || STATUS.AVAILABLE,
      reason: periodBlockingRequest ? 'periodOverlap' : '',
      blockingRequest: periodBlockingRequest || null,
    };
  }

  const blockingRequest = findSameAssetBlockingRequest(requests, laptop.id);

  return {
    blocked: Boolean(blockingRequest),
    status: blockingRequest?.status || STATUS.AVAILABLE,
    reason: blockingRequest ? 'currentStatus' : '',
    blockingRequest: blockingRequest || null,
  };
};

export const DEFAULT_MAX_RENTAL_DAYS = 14;
export const DEFAULT_ADJUST_START_DATE_AFTER_WORK_END = true;
export const DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY = true;
export const DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE = true;
export const DEFAULT_EXCLUDE_SATURDAYS = true;
export const DEFAULT_EXCLUDE_SUNDAYS = true;
export const DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE = true;
export const DEFAULT_WORK_END_TIME = '18:00';
export const DEFAULT_HOLIDAY_TYPE = 'company';
export const DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS = false;
export const DEFAULT_RENTAL_EXTENSION_ENABLED = false;
export const DEFAULT_RENTAL_EXTENSION_APPROVAL_MODE =
  RENTAL_EXTENSION_APPROVAL_MODE.MANUAL;
export const DEFAULT_RENTAL_EXTENSION_MAX_COUNT = 1;
export const DEFAULT_RENTAL_EXTENSION_DAYS = 5;
export const DEFAULT_RENTAL_EXTENSION_REQUEST_WAIT_DAYS = 7;

export const HOLIDAY_TYPE_LABEL = {
  public: '법정공휴일',
  temporary: '임시공휴일',
  substitute: '대체공휴일',
  company: '회사지정휴일',
  manual: '기타휴일',
};

export const normalizeHolidayReason = (reason = {}) => {
  const sourceType = reason.type || DEFAULT_HOLIDAY_TYPE;
  const sourceName = String(
    reason.name || HOLIDAY_TYPE_LABEL[sourceType] || '휴일'
  ).trim();
  const type =
    sourceType === 'public' && sourceName.startsWith('대체공휴일')
      ? 'substitute'
      : sourceType;
  const name = sourceName || HOLIDAY_TYPE_LABEL[type] || '휴일';

  return {
    type,
    name,
  };
};

export const getHolidayReasons = (holiday = {}) => {
  const sourceReasons = Array.isArray(holiday.reasons)
    ? holiday.reasons
    : holiday.reasons && typeof holiday.reasons === 'object'
      ? Object.values(holiday.reasons)
      : [
          {
            type: holiday.type || DEFAULT_HOLIDAY_TYPE,
            name: holiday.name || '',
          },
        ];

  const reasonMap = new Map();

  sourceReasons.forEach((reason) => {
    const normalizedReason = normalizeHolidayReason(reason);
    const key = `${normalizedReason.type}::${normalizedReason.name}`;

    if (!reasonMap.has(key)) {
      reasonMap.set(key, normalizedReason);
    }
  });

  return Array.from(reasonMap.values());
};

export const normalizeHolidayList = (holidays = []) => {
  const holidayMap = new Map();

  (Array.isArray(holidays) ? holidays : []).forEach((holiday) => {
    if (!holiday?.date) return;

    const date = String(holiday.date);
    const reasons = getHolidayReasons(holiday);
    const existing = holidayMap.get(date);

    if (!existing) {
      const primaryReason = reasons[0] || normalizeHolidayReason();

      holidayMap.set(date, {
        date,
        name: primaryReason.name,
        type: primaryReason.type,
        reasons,
        enabled: holiday.enabled !== false,
      });
      return;
    }

    const mergedReasons = getHolidayReasons({
      reasons: [...existing.reasons, ...reasons],
    });
    const primaryReason = mergedReasons[0] || normalizeHolidayReason();

    holidayMap.set(date, {
      ...existing,
      name: primaryReason.name,
      type: primaryReason.type,
      reasons: mergedReasons,
      enabled: existing.enabled !== false || holiday.enabled !== false,
    });
  });

  return Array.from(holidayMap.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
};

export const getHolidayDisplayName = (holiday = {}) => {
  const names = getHolidayReasons(holiday)
    .map((reason) => reason.name)
    .filter(Boolean);

  return names.length > 0 ? names.join(' · ') : '등록 휴일';
};

export const serializeHolidayListForFirestore = (holidays = []) =>
  normalizeHolidayList(holidays).map((holiday) => {
    const reasons = getHolidayReasons(holiday);
    const primaryReason = reasons[0] || normalizeHolidayReason();

    return {
      date: holiday.date,
      name: primaryReason.name,
      type: primaryReason.type,
      reasons: Object.fromEntries(
        reasons.map((reason, index) => [
          `reason${index + 1}`,
          {
            type: reason.type,
            name: reason.name,
          },
        ])
      ),
      enabled: holiday.enabled !== false,
    };
  });

export const getLaptopRepresentativeRequest = (requests = [], laptopId) => {
  const blockingRequests = requests.filter(
    (request) =>
      request?.laptopId === laptopId &&
      RENTAL_BLOCKING_REQUEST_STATUSES.includes(request.status)
  );

  if (blockingRequests.length === 0) {
    return null;
  }

  const todayDate = today();

  const sortByStartDate = (a, b) =>
    String(a.startDate || '').localeCompare(String(b.startDate || ''));

  const activeRentalRequest = blockingRequests
    .filter(
      (request) =>
        request.status === STATUS.APPROVED &&
        (!request.startDate || request.startDate <= todayDate)
    )
    .sort(sortByStartDate)[0];

  const reservedRequest = blockingRequests
    .filter(
      (request) =>
        request.status === STATUS.APPROVED &&
        request.startDate &&
        request.startDate > todayDate
    )
    .sort(sortByStartDate)[0];

  const requestedRequest = blockingRequests
    .filter((request) => request.status === STATUS.REQUESTED)
    .sort(sortByStartDate)[0];

  const onHoldRequest = blockingRequests
    .filter((request) => request.status === STATUS.ON_HOLD)
    .sort(sortByStartDate)[0];

  return activeRentalRequest || reservedRequest || requestedRequest || onHoldRequest || null;
};

export const getLaptopAdminDisplayStatus = (laptop, requests = []) => {
  if (!laptop) {
    return STATUS.UNAVAILABLE;
  }

  if (laptop.status === STATUS.UNAVAILABLE) {
    return STATUS.UNAVAILABLE;
  }

  const representativeRequest = getLaptopRepresentativeRequest(requests, laptop.id);

  if (!representativeRequest) {
    return STATUS.AVAILABLE;
  }

  return getDisplayRentalStatus(
    representativeRequest.status,
    representativeRequest.startDate
  );
};

export const addDays = (days) => addDaysFrom(today(), days);

export const parseTimeToMinutes = (timeString) => {
  const [hours, minutes] = String(timeString || DEFAULT_WORK_END_TIME)
    .split(':')
    .map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return 18 * 60;
  }

  return hours * 60 + minutes;
};

// 한국시간 기준 설정된 업무 종료 시간을 넘으면 다음날을 기본 후보일로 사용
export const isKoreaNowAfterTime = (timeString) => {
  const koreaNow = getKoreaNow();
  const nowMinutes = koreaNow.getUTCHours() * 60 + koreaNow.getUTCMinutes();
  const workEndMinutes = parseTimeToMinutes(timeString);

  return (
    nowMinutes > workEndMinutes ||
    (nowMinutes === workEndMinutes &&
      (koreaNow.getUTCSeconds() > 0 ||
        koreaNow.getUTCMilliseconds() > 0))
  );
};

export const getBusinessDayAdjustmentEnabled = (settings = {}) =>
  settings.adjustStartDateToNextBusinessDay ??
  settings.adjustStartDateAfterWorkEnd ??
  DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY;

export const getHolidayList = (settings = {}) =>
  normalizeHolidayList(settings.holidays);

export const getEnabledHoliday = (dateStr, settings = {}) =>
  getHolidayList(settings).find(
    (holiday) => holiday?.enabled !== false && holiday.date === dateStr
  );

export const getDateWeekday = (dateStr) => {
  if (!dateStr) return -1;

  const date = new Date(`${dateStr}T00:00:00Z`);

  return Number.isNaN(date.getTime()) ? -1 : date.getUTCDay();
};

export const isWeekendDate = (dateStr) => {
  const weekday = getDateWeekday(dateStr);
  return weekday === 0 || weekday === 6;
};

export const shouldExcludeSaturday = (settings = {}) =>
  settings.excludeSaturdays ??
  settings.excludeWeekendsForStartDate ??
  DEFAULT_EXCLUDE_SATURDAYS;

export const shouldExcludeSunday = (settings = {}) =>
  settings.excludeSundays ??
  settings.excludeWeekendsForStartDate ??
  DEFAULT_EXCLUDE_SUNDAYS;

export const getConfiguredRestWeekdayReason = (dateStr, settings = {}) => {
  const weekday = getDateWeekday(dateStr);

  if (weekday === 6 && shouldExcludeSaturday(settings)) {
    return '토요일';
  }

  if (weekday === 0 && shouldExcludeSunday(settings)) {
    return '일요일';
  }

  return '';
};

export const isHolidayDate = (dateStr, settings = {}) => {
  const shouldExcludeHolidays =
    settings.excludeHolidaysForStartDate ?? DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE;

  if (!shouldExcludeHolidays) {
    return false;
  }

  return Boolean(getEnabledHoliday(dateStr, settings));
};

export const getNonBusinessDayReason = (dateStr, settings = {}) => {
  const holiday = getEnabledHoliday(dateStr, settings);

  if (
    (settings.excludeHolidaysForStartDate ?? DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE) &&
    holiday
  ) {
    return getHolidayDisplayName(holiday);
  }

  return getConfiguredRestWeekdayReason(dateStr, settings);
};

export const isBusinessDay = (dateStr, settings = {}) => {
  if (!dateStr) return false;

  if (isHolidayDate(dateStr, settings)) {
    return false;
  }

  return !getConfiguredRestWeekdayReason(dateStr, settings);
};

export const getNextBusinessDay = (dateStr, settings = {}) => {
  let candidateDate = dateStr || today();

  for (let i = 0; i < 370; i += 1) {
    if (isBusinessDay(candidateDate, settings)) {
      return candidateDate;
    }

    candidateDate = addDaysFrom(candidateDate, 1);
  }

  return candidateDate;
};

export const getAdjustedRentalStartDate = (dateStr, settings = {}) => {
  const minDate = today();
  const candidateDate = !dateStr || dateStr < minDate ? minDate : dateStr;

  return getNextBusinessDay(candidateDate, settings);
};

export const getSafeMaxRentalDays = (settings = {}) => {
  const parsedMaxRentalDays = Math.trunc(
    Number(settings.maxRentalDays ?? DEFAULT_MAX_RENTAL_DAYS)
  );

  if (
    Number.isNaN(parsedMaxRentalDays) ||
    parsedMaxRentalDays < 1
  ) {
    return DEFAULT_MAX_RENTAL_DAYS;
  }

  return parsedMaxRentalDays;
};

export const getSafeRentalExtensionMaxCount = (settings = {}) => {
  const parsedValue = Math.trunc(
    Number(
      settings.rentalExtensionMaxCount ??
        DEFAULT_RENTAL_EXTENSION_MAX_COUNT
    )
  );

  return Number.isFinite(parsedValue) && parsedValue >= 1
    ? parsedValue
    : DEFAULT_RENTAL_EXTENSION_MAX_COUNT;
};

export const getSafeRentalExtensionDays = (settings = {}) => {
  const parsedValue = Math.trunc(
    Number(
      settings.rentalExtensionDays ??
        settings.rentalExtensionBusinessDays ??
        DEFAULT_RENTAL_EXTENSION_DAYS
    )
  );

  return Number.isFinite(parsedValue) && parsedValue >= 1
    ? parsedValue
    : DEFAULT_RENTAL_EXTENSION_DAYS;
};

export const getSafeRentalExtensionRequestWaitDays = (settings = {}) => {
  const parsedValue = Math.trunc(
    Number(
      settings.rentalExtensionRequestWaitDays ??
        DEFAULT_RENTAL_EXTENSION_REQUEST_WAIT_DAYS
    )
  );

  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? parsedValue
    : DEFAULT_RENTAL_EXTENSION_REQUEST_WAIT_DAYS;
};

export const getRentalExtensionApprovalMode = (settings = {}) =>
  settings.rentalExtensionApprovalMode ===
  RENTAL_EXTENSION_APPROVAL_MODE.AUTO
    ? RENTAL_EXTENSION_APPROVAL_MODE.AUTO
    : RENTAL_EXTENSION_APPROVAL_MODE.MANUAL;

export const normalizeRentalExtensionSettings = (settings = {}) => ({
  ...settings,
  rentalExtensionEnabled:
    settings.rentalExtensionEnabled ?? DEFAULT_RENTAL_EXTENSION_ENABLED,
  rentalExtensionApprovalMode:
    getRentalExtensionApprovalMode(settings),
  rentalExtensionMaxCount:
    getSafeRentalExtensionMaxCount(settings),
  rentalExtensionDays:
    getSafeRentalExtensionDays(settings),
  rentalExtensionRequestWaitDays:
    getSafeRentalExtensionRequestWaitDays(settings),
});

export const normalizeRentalPolicySettings = (settings = {}) =>
  normalizeOverduePolicySettings(
    normalizeRentalExtensionSettings(settings)
  );

export const RENTAL_POLICY_SETTING_KEYS = [
  'maxRentalDays',
  'allowNonOverlappingSameAssetRequests',
  'adjustStartDateAfterWorkEnd',
  'adjustStartDateToNextBusinessDay',
  'excludeSaturdays',
  'excludeSundays',
  'excludeWeekendsForStartDate',
  'excludeHolidaysForStartDate',
  'workEndTime',
  'rentalExtensionEnabled',
  'rentalExtensionApprovalMode',
  'rentalExtensionMaxCount',
  'rentalExtensionDays',
  'rentalExtensionRequestWaitDays',
  'overdueRentalBlockEnabled',
  'postOverduePenaltyEnabled',
  'overduePenaltyMode',
  'overdueFixedDaysPerAsset',
  'overdueDayMultiplier',
];

export const isRentalDueBusinessDay = (dateStr, settings = {}) =>
  isBusinessDay(dateStr, settings);

export const getAdjustedRentalDueDate = (dateStr, settings = {}) => {
  let candidateDate = dateStr || today();

  for (let i = 0; i < 370; i += 1) {
    if (isRentalDueBusinessDay(candidateDate, settings)) {
      return candidateDate;
    }

    candidateDate = addDaysFrom(candidateDate, 1);
  }

  return candidateDate;
};

export const getRentalDueDateAdjustmentReason = (dateStr, settings = {}) =>
  getNonBusinessDayReason(dateStr, settings);

export const getMaxRentalDueDate = (startDate, settings = {}) => {
  if (!startDate) return '';

  const calendarDueDate = addDaysFrom(
    startDate,
    getSafeMaxRentalDays(settings)
  );

  return getAdjustedRentalDueDate(calendarDueDate, settings);
};

export const getRentalExtensionPeriod = (
  request = {},
  settings = {},
  daysOverride
) => {
  const extensionDays =
    daysOverride === undefined
      ? getSafeRentalExtensionDays(settings)
      : Math.max(1, Math.trunc(Number(daysOverride) || 1));

  const extensionStartDate = addDaysFrom(request.dueDate, 1);
  const calendarExtensionDueDate = addDaysFrom(
    request.dueDate,
    extensionDays
  );

  return {
    extensionDays,
    extensionStartDate,
    extensionDueDate: getAdjustedRentalDueDate(
      calendarExtensionDueDate,
      settings
    ),
  };
};

export const getRequestExtensionCount = (request = {}) => {
  const parsedCount = Math.trunc(Number(request.extensionCount || 0));
  return Number.isFinite(parsedCount) && parsedCount > 0
    ? parsedCount
    : 0;
};

export const getLastApprovedExtensionDate = (request = {}) => {
  if (request.lastExtensionApprovedDate) {
    return request.lastExtensionApprovedDate;
  }

  const extensionHistory = Array.isArray(request.extensionHistory)
    ? request.extensionHistory
    : [];

  const lastApprovedHistory = [...extensionHistory]
    .reverse()
    .find(
      (history) =>
        history?.status === USER_REQUEST_REVIEW_STATUS.APPROVED &&
        history?.approvedDate
    );

  return lastApprovedHistory?.approvedDate || '';
};

export const getExtensionRequestAvailableDate = (request = {}, settings = {}) => {
  if (request.nextExtensionRequestDate) {
    return request.nextExtensionRequestDate;
  }

  const baseDate =
    getRequestExtensionCount(request) > 0
      ? getLastApprovedExtensionDate(request)
      : request.startDate || '';

  if (!baseDate) return '';

  return addDaysFrom(
    baseDate,
    getSafeRentalExtensionRequestWaitDays(settings)
  );
};

export const findExtensionPeriodConflict = (
  requests = [],
  laptopId,
  currentRequestId,
  extensionStartDate,
  extensionDueDate
) =>
  requests.find(
    (request) =>
      request?.id !== currentRequestId &&
      request?.laptopId === laptopId &&
      RENTAL_BLOCKING_REQUEST_STATUSES.includes(request.status) &&
      hasRentalPeriodOverlap(
        request.startDate,
        request.dueDate,
        extensionStartDate,
        extensionDueDate
      )
  );


export const getRentalExtensionEligibility = (
  request = {},
  settings = {},
  referenceDate = today()
) => {
  if (!settings.rentalExtensionEnabled) {
    return {
      allowed: false,
      code: 'rental-extension-disabled',
      availableDate: '',
    };
  }

  if (request.status !== STATUS.APPROVED) {
    return {
      allowed: false,
      code: 'invalid-rental-extension-status',
      availableDate: '',
    };
  }

  if (
    request.userActionRequest?.status ===
    USER_REQUEST_REVIEW_STATUS.PENDING
  ) {
    return {
      allowed: false,
      code: 'user-action-request-already-pending',
      availableDate: '',
    };
  }

  const extensionCount = getRequestExtensionCount(request);
  const maxExtensionCount = getSafeRentalExtensionMaxCount(settings);

  if (extensionCount >= maxExtensionCount) {
    return {
      allowed: false,
      code: 'rental-extension-count-exceeded',
      availableDate: '',
    };
  }

  const availableDate = getExtensionRequestAvailableDate(
    request,
    settings
  );

  if (availableDate && referenceDate < availableDate) {
    return {
      allowed: false,
      code: 'rental-extension-too-early',
      availableDate,
    };
  }

  return {
    allowed: true,
    code: '',
    availableDate,
    extensionCount,
    maxExtensionCount,
  };
};

export const getRentalExtensionErrorMessage = (
  code,
  availableDate = ''
) => {
  if (code === 'rental-extension-disabled') {
    return '대여 관리 규정 상 연장 신청은 불가합니다';
  }

  if (code === 'invalid-rental-extension-status') {
    return '대여 연장 요청은 대여중 상태에서만 가능합니다.';
  }

  if (code === 'user-action-request-already-pending') {
    return '이미 처리 중인 대여 연장 신청이 있습니다.';
  }

  if (code === 'rental-extension-count-exceeded') {
    return '허용된 대여 연장 횟수를 모두 사용했습니다.';
  }

  if (code === 'rental-extension-too-early') {
    return `대여 연장 신청은 ${formatDateWithKoreanWeekday(
      availableDate
    )}부터 가능합니다.`;
  }

  if (code === 'rental-extension-period-conflict') {
    return '해당 연장 기간에 다른 대여 신청 또는 예약이 있어 연장할 수 없습니다.';
  }

  return '대여 연장 요청을 처리할 수 없습니다.';
};

export const isTemporaryDateInputValue = (dateStr) => {
  const match = String(dateStr || '').match(/^(\d{4})-\d{2}-\d{2}$/);

  if (!match) {
    return false;
  }

  return Number(match[1]) < 1000;
};

export const defaultRentalStartDate = (settings = {}) => {
  const shouldMoveAfterWorkEnd =
    getBusinessDayAdjustmentEnabled(settings) &&
    isKoreaNowAfterTime(settings.workEndTime || DEFAULT_WORK_END_TIME);

  const candidateDate = shouldMoveAfterWorkEnd
    ? addDaysFrom(today(), 1)
    : today();

  return getNextBusinessDay(candidateDate, settings);
};

export const getRentalStartAdjustmentInfo = (settings = {}) => {
  const isAfterWorkEnd =
    getBusinessDayAdjustmentEnabled(settings) &&
    isKoreaNowAfterTime(settings.workEndTime || DEFAULT_WORK_END_TIME);
  const candidateDate = isAfterWorkEnd ? addDaysFrom(today(), 1) : today();
  const adjustedDate = getNextBusinessDay(candidateDate, settings);

  const reasons = [];

  if (isAfterWorkEnd) {
    reasons.push(`업무 종료 시간(${settings.workEndTime || DEFAULT_WORK_END_TIME}) 이후`);
  }

  let checkingDate = candidateDate;
  for (let i = 0; i < 370 && checkingDate < adjustedDate; i += 1) {
    const reason = getNonBusinessDayReason(checkingDate, settings);

    if (reason && !reasons.includes(reason)) {
      reasons.push(reason);
    }

    checkingDate = addDaysFrom(checkingDate, 1);
  }

  return {
    adjusted: adjustedDate !== today() || reasons.length > 0,
    adjustedDate,
    reasons,
  };
};

export const createDefaultRequestForm = (settings = {}) => {
  const startDate = defaultRentalStartDate(settings);

  return {
    team: '',
    borrower: '',
    startDate,
    dueDate: getMaxRentalDueDate(startDate, settings),
    purpose: '',
  };
};
