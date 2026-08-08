const normalizeText = (value) => String(value ?? '').trim();
const BLOCKING_STATUSES = new Set(['신청중', '대여중', '보류']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDate = (value) => {
  const text = normalizeText(value);
  if (!DATE_PATTERN.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (date) => date.toISOString().slice(0, 10);

export const koreaToday = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const koreaRequestedAtText = (now = new Date()) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).format(now);

const getEnabledHoliday = (dateText, settings = {}) => {
  const holidays = Array.isArray(settings?.holidays) ? settings.holidays : [];
  return holidays.find((holiday) =>
    holiday && holiday.enabled !== false && normalizeText(holiday.date) === dateText
  ) || null;
};

const shouldExcludeSaturday = (settings = {}) =>
  settings.excludeSaturdays ?? settings.excludeWeekendsForStartDate ?? true;
const shouldExcludeSunday = (settings = {}) =>
  settings.excludeSundays ?? settings.excludeWeekendsForStartDate ?? true;
const shouldExcludeHolidays = (settings = {}) =>
  settings.excludeHolidaysForStartDate ?? true;

export const isBusinessDay = (dateText, settings = {}) => {
  const date = parseDate(dateText);
  if (!date) return false;
  const weekday = date.getUTCDay();
  if (weekday === 6 && shouldExcludeSaturday(settings)) return false;
  if (weekday === 0 && shouldExcludeSunday(settings)) return false;
  if (shouldExcludeHolidays(settings) && getEnabledHoliday(dateText, settings)) return false;
  return true;
};

const addDays = (dateText, days) => {
  const date = parseDate(dateText);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
};

const getNextBusinessDay = (dateText, settings = {}) => {
  let candidate = dateText;
  for (let index = 0; index < 370; index += 1) {
    if (isBusinessDay(candidate, settings)) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
};

const getMaxRentalDays = (settings = {}) => {
  const parsed = Math.trunc(Number(settings.maxRentalDays ?? 14));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 14;
};

const dateCompare = (left, right) => String(left).localeCompare(String(right));

const serviceError = (code, message) => {
  const error = new Error(message);
  error.name = 'RentalRequestWritePolicyError';
  error.code = code;
  return error;
};

export const periodsOverlap = (leftStart, leftDue, rightStart, rightDue) =>
  dateCompare(leftStart, rightDue) <= 0 && dateCompare(rightStart, leftDue) <= 0;

export const validateRequestedPeriod = ({ startDate, dueDate, settings = {}, today = koreaToday() }) => {
  const start = normalizeText(startDate);
  const due = normalizeText(dueDate);
  if (!parseDate(start) || !parseDate(due)) {
    throw serviceError('rental_request_invalid_date', 'Rental request dates must use YYYY-MM-DD format.');
  }
  if (start < today) {
    throw serviceError('rental_request_start_in_past', 'Rental request start date cannot be before today.');
  }
  if (!isBusinessDay(start, settings)) {
    throw serviceError('rental_request_start_not_business_day', 'Rental request start date must be a configured business day.');
  }
  if (due < start) {
    throw serviceError('rental_request_due_before_start', 'Rental request due date cannot be before the start date.');
  }
  if (!isBusinessDay(due, settings)) {
    throw serviceError('rental_request_due_not_business_day', 'Rental request due date must be a configured business day.');
  }
  const maxCalendarDue = addDays(start, getMaxRentalDays(settings));
  const maxDue = getNextBusinessDay(maxCalendarDue, settings);
  if (due > maxDue) {
    throw serviceError('rental_request_period_too_long', `Rental request due date cannot exceed ${maxDue}.`);
  }
  return Object.freeze({ startDate: start, dueDate: due, maxDueDate: maxDue });
};

export const normalizeAssetReservationsForWrite = (reservations = []) =>
  (Array.isArray(reservations) ? reservations : [])
    .map((reservation) => ({
      id: normalizeText(reservation?.id),
      laptopId: normalizeText(reservation?.laptopId),
      assetCategory: normalizeText(reservation?.assetCategory),
      assetNo: normalizeText(reservation?.assetNo),
      startDate: normalizeText(reservation?.startDate),
      dueDate: normalizeText(reservation?.dueDate),
      status: normalizeText(reservation?.status),
    }))
    .filter((reservation) =>
      reservation.id && reservation.laptopId && parseDate(reservation.startDate) && parseDate(reservation.dueDate)
    );

export const findBlockingReservation = ({ reservations = [], laptopId, startDate, dueDate, settings = {} }) => {
  const allowNonOverlapping = Boolean(settings.allowNonOverlappingSameAssetRequests ?? false);
  return normalizeAssetReservationsForWrite(reservations).find((reservation) => {
    if (reservation.laptopId !== laptopId || !BLOCKING_STATUSES.has(reservation.status)) return false;
    if (!allowNonOverlapping) return true;
    return periodsOverlap(reservation.startDate, reservation.dueDate, startDate, dueDate);
  }) || null;
};

export const isRestrictionBlocked = ({ restriction, settings = {}, referenceDate = koreaToday(), currentOverdueCount = 0 }) => {
  const currentOverdueBlocked = Boolean(settings.overdueRentalBlockEnabled) && Number(currentOverdueCount) > 0;
  const eligibleFromDate = normalizeText(restriction?.eligibleFromDate);
  const postPenaltyBlocked = Boolean(settings.postOverduePenaltyEnabled)
    && Boolean(restriction?.activePenalty)
    && Boolean(eligibleFromDate)
    && referenceDate < eligibleFromDate;
  return Object.freeze({
    blocked: currentOverdueBlocked || postPenaltyBlocked,
    currentOverdueBlocked,
    postPenaltyBlocked,
    eligibleFromDate,
  });
};

export const RENTAL_BLOCKING_STATUSES = Object.freeze([...BLOCKING_STATUSES]);
