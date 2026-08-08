import {
  findBlockingReservation,
  isBusinessDay,
  koreaToday,
  normalizeAssetReservationsForWrite,
  periodsOverlap,
  validateRequestedPeriod,
} from './rental-request-write-policy.mjs';

const trim = (value) => String(value ?? '').trim();
const parseInteger = (value, fallback, minimum = 0) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
};
const addDays = (dateText, days) => {
  const date = new Date(`${trim(dateText)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};
const nextBusinessDay = (dateText, settings = {}) => {
  let candidate = trim(dateText);
  for (let index = 0; index < 370; index += 1) {
    if (isBusinessDay(candidate, settings)) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
};

export const normalizeExtensionSettings = (settings = {}) => Object.freeze({
  ...settings,
  rentalExtensionEnabled: Boolean(settings.rentalExtensionEnabled ?? false),
  rentalExtensionApprovalMode: settings.rentalExtensionApprovalMode === 'auto' ? 'auto' : 'manual',
  rentalExtensionMaxCount: parseInteger(settings.rentalExtensionMaxCount, 1, 1),
  rentalExtensionDays: parseInteger(settings.rentalExtensionDays ?? settings.rentalExtensionBusinessDays, 5, 1),
  rentalExtensionRequestWaitDays: parseInteger(settings.rentalExtensionRequestWaitDays, 7, 0),
});

export const getRequestExtensionCount = (request = {}) => parseInteger(request.extensionCount, 0, 0);

export const getExtensionAvailableDate = (request = {}, settings = {}) => {
  if (trim(request.nextExtensionRequestDate)) return trim(request.nextExtensionRequestDate);
  const history = Array.isArray(request.extensionHistory) ? request.extensionHistory : [];
  const lastApproved = [...history].reverse().find((entry) => entry?.status === 'approved' && entry?.approvedDate);
  const baseDate = getRequestExtensionCount(request) > 0
    ? trim(request.lastExtensionApprovedDate || lastApproved?.approvedDate)
    : trim(request.startDate);
  return baseDate ? addDays(baseDate, settings.rentalExtensionRequestWaitDays) : '';
};

export const validateExtensionEligibility = ({ request, settings = {}, referenceDate = koreaToday() }) => {
  const normalized = normalizeExtensionSettings(settings);
  if (!normalized.rentalExtensionEnabled) {
    const error = new Error('rental-extension-disabled'); error.code = 'rental_extension_disabled'; throw error;
  }
  if (trim(request?.status) !== '대여중') {
    const error = new Error('invalid-rental-extension-status'); error.code = 'invalid_rental_extension_status'; throw error;
  }
  if (request?.userActionRequest?.status === 'pending') {
    const error = new Error('user-action-request-already-pending'); error.code = 'user_action_request_already_pending'; throw error;
  }
  const count = getRequestExtensionCount(request);
  if (count >= normalized.rentalExtensionMaxCount) {
    const error = new Error('rental-extension-count-exceeded'); error.code = 'rental_extension_count_exceeded'; throw error;
  }
  const availableDate = getExtensionAvailableDate(request, normalized);
  if (availableDate && referenceDate < availableDate) {
    const error = new Error('rental-extension-too-early');
    error.code = 'rental_extension_too_early';
    error.availableDate = availableDate;
    throw error;
  }
  return Object.freeze({ settings: normalized, count, availableDate });
};

export const buildExtensionPeriod = ({ request, settings = {} }) => {
  const normalized = normalizeExtensionSettings(settings);
  const extensionStartDate = addDays(request.dueDate, 1);
  const calendarDue = addDays(request.dueDate, normalized.rentalExtensionDays);
  return Object.freeze({
    extensionDays: normalized.rentalExtensionDays,
    extensionStartDate,
    extensionDueDate: nextBusinessDay(calendarDue, normalized),
  });
};

export const findPeriodConflictExcludingRequest = ({ reservations, requestId, laptopId, startDate, dueDate, settings = {} }) => {
  const filtered = normalizeAssetReservationsForWrite(reservations).filter((reservation) => reservation.id !== requestId);
  return findBlockingReservation({ reservations: filtered, laptopId, startDate, dueDate, settings });
};

export const findExtensionConflict = ({ reservations, requestId, laptopId, startDate, dueDate }) =>
  normalizeAssetReservationsForWrite(reservations).find((reservation) =>
    reservation.id !== requestId &&
    reservation.laptopId === laptopId &&
    ['신청중', '대여중', '보류'].includes(reservation.status) &&
    periodsOverlap(reservation.startDate, reservation.dueDate, startDate, dueDate)
  ) || null;

export const validateDirectEditPeriod = ({ startDate, dueDate, settings = {} }) =>
  validateRequestedPeriod({ startDate, dueDate, settings, today: koreaToday() });

export const toAvailability = (request = {}) => Object.freeze({
  id: trim(request.id),
  laptopId: trim(request.laptopId),
  assetCategory: trim(request.assetCategory),
  assetNo: trim(request.assetNo),
  startDate: trim(request.startDate),
  dueDate: trim(request.dueDate),
  status: trim(request.status),
});
