import { OVERDUE_PENALTY_MODE } from '../constants/appConstants.js';
import { addDaysFrom, today } from './appUtils.js';

export { OVERDUE_PENALTY_MODE };

export const DEFAULT_OVERDUE_RENTAL_BLOCK_ENABLED = false;
export const DEFAULT_POST_OVERDUE_PENALTY_ENABLED = false;
export const DEFAULT_OVERDUE_PENALTY_MODE =
  OVERDUE_PENALTY_MODE.FIXED_PER_ASSET;
export const DEFAULT_OVERDUE_FIXED_DAYS_PER_ASSET = 1;
export const DEFAULT_OVERDUE_DAY_MULTIPLIER = 1;

const getSafePositiveInteger = (value, fallback) => {
  const parsedValue = Math.trunc(Number(value));

  return Number.isFinite(parsedValue) && parsedValue >= 1
    ? parsedValue
    : fallback;
};

export const normalizeOverduePolicySettings = (settings = {}) => ({
  ...settings,
  overdueRentalBlockEnabled:
    settings.overdueRentalBlockEnabled ??
    DEFAULT_OVERDUE_RENTAL_BLOCK_ENABLED,
  postOverduePenaltyEnabled:
    settings.postOverduePenaltyEnabled ??
    DEFAULT_POST_OVERDUE_PENALTY_ENABLED,
  overduePenaltyMode:
    settings.overduePenaltyMode ===
    OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
      ? OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
      : OVERDUE_PENALTY_MODE.FIXED_PER_ASSET,
  overdueFixedDaysPerAsset: getSafePositiveInteger(
    settings.overdueFixedDaysPerAsset,
    DEFAULT_OVERDUE_FIXED_DAYS_PER_ASSET
  ),
  overdueDayMultiplier: getSafePositiveInteger(
    settings.overdueDayMultiplier,
    DEFAULT_OVERDUE_DAY_MULTIPLIER
  ),
});

export const getCalendarDayDifference = (laterDate, earlierDate) => {
  if (!laterDate || !earlierDate) return 0;

  const laterTime = Date.parse(`${laterDate}T00:00:00Z`);
  const earlierTime = Date.parse(`${earlierDate}T00:00:00Z`);

  if (Number.isNaN(laterTime) || Number.isNaN(earlierTime)) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((laterTime - earlierTime) / (24 * 60 * 60 * 1000))
  );
};

export const getCurrentOverdueRequests = (
  requests = [],
  requesterUid = '',
  referenceDate = today(),
  excludedRequestId = ''
) =>
  (Array.isArray(requests) ? requests : []).filter(
    (request) =>
      request?.requesterUid === requesterUid &&
      request?.id !== excludedRequestId &&
      request?.status === '대여중' &&
      Boolean(request?.dueDate) &&
      request.dueDate < referenceDate
  );

export const getRentalRestrictionStatus = ({
  requests = [],
  requesterUid = '',
  settings = {},
  restriction = null,
  referenceDate = today(),
} = {}) => {
  const normalizedSettings = normalizeOverduePolicySettings(settings);
  const overdueRequests = getCurrentOverdueRequests(
    requests,
    requesterUid,
    referenceDate
  );

  const currentOverdueBlocked =
    normalizedSettings.overdueRentalBlockEnabled &&
    overdueRequests.length > 0;

  const eligibleFromDate = String(
    restriction?.eligibleFromDate || ''
  );

  const postPenaltyBlocked =
    normalizedSettings.postOverduePenaltyEnabled &&
    Boolean(restriction?.activePenalty) &&
    Boolean(eligibleFromDate) &&
    referenceDate < eligibleFromDate;

  let message = '';

  if (currentOverdueBlocked) {
    message = `반납기한이 지난 대여 기기 ${overdueRequests.length}대가 있어 신규 대여를 신청할 수 없습니다. 연체 기기를 모두 반납한 후 다시 신청해 주세요.`;
  } else if (postPenaltyBlocked) {
    message = `연체 반납에 따른 대여 제한 기간입니다. ${eligibleFromDate}부터 신규 대여를 신청할 수 있습니다.`;
  }

  return {
    blocked: currentOverdueBlocked || postPenaltyBlocked,
    currentOverdueBlocked,
    postPenaltyBlocked,
    overdueRequests,
    overdueCount: overdueRequests.length,
    eligibleFromDate,
    message,
  };
};

const getUniqueRequestIds = (requestIds = []) =>
  Array.from(
    new Set(
      (Array.isArray(requestIds) ? requestIds : [])
        .map((requestId) => String(requestId || '').trim())
        .filter(Boolean)
    )
  );

export const buildOverdueReturnResult = ({
  request = {},
  actualReturnDate = today(),
  settings = {},
  restriction = null,
  hasOtherCurrentOverdueRequests = false,
  batchId = '',
} = {}) => {
  const normalizedSettings = normalizeOverduePolicySettings(settings);
  const overdueDaysAtReturn = getCalendarDayDifference(
    actualReturnDate,
    request.dueDate
  );

  const baseRequestFields = {
    actualReturnDate,
    overdueDaysAtReturn,
    overduePenaltyPending: false,
    overduePenaltyBatchId: '',
  };

  if (overdueDaysAtReturn < 1) {
    return {
      overdueDaysAtReturn,
      requestFields: baseRequestFields,
      restrictionData: null,
      finalizedRequestIds: [],
    };
  }

  const existingPendingRequestIds = getUniqueRequestIds(
    restriction?.pendingOverdueRequestIds
  );

  const isAlreadyPending = existingPendingRequestIds.includes(request.id);
  const pendingRequestIds = getUniqueRequestIds([
    ...existingPendingRequestIds,
    request.id,
  ]);

  const pendingOverdueDeviceCount =
    Math.max(0, Number(restriction?.pendingOverdueDeviceCount || 0)) +
    (isAlreadyPending ? 0 : 1);

  const pendingTotalOverdueDays =
    Math.max(0, Number(restriction?.pendingTotalOverdueDays || 0)) +
    (isAlreadyPending ? 0 : overdueDaysAtReturn);

  if (hasOtherCurrentOverdueRequests) {
    return {
      overdueDaysAtReturn,
      requestFields: {
        ...baseRequestFields,
        overduePenaltyPending: true,
      },
      restrictionData: {
        ...(restriction || {}),
        uid: request.requesterUid || restriction?.uid || '',
        pendingOverdueRequestIds: pendingRequestIds,
        pendingOverdueDeviceCount,
        pendingTotalOverdueDays,
      },
      finalizedRequestIds: [],
    };
  }

  const penaltyDays =
    normalizedSettings.overduePenaltyMode ===
    OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER
      ? pendingTotalOverdueDays *
        normalizedSettings.overdueDayMultiplier
      : pendingOverdueDeviceCount *
        normalizedSettings.overdueFixedDaysPerAsset;

  const existingPenaltyEndDate = String(
    restriction?.penaltyEndDate || ''
  );

  const penaltyBaseDate =
    existingPenaltyEndDate && existingPenaltyEndDate > actualReturnDate
      ? existingPenaltyEndDate
      : actualReturnDate;

  const shouldApplyPenalty =
    normalizedSettings.postOverduePenaltyEnabled && penaltyDays > 0;

  const penaltyStartDate = shouldApplyPenalty
    ? addDaysFrom(penaltyBaseDate, 1)
    : '';

  const penaltyEndDate = shouldApplyPenalty
    ? addDaysFrom(penaltyBaseDate, penaltyDays)
    : String(restriction?.penaltyEndDate || '');

  const eligibleFromDate = shouldApplyPenalty
    ? addDaysFrom(penaltyEndDate, 1)
    : String(restriction?.eligibleFromDate || '');

  const finalizedBatchId = batchId || `OVERDUE-${request.id}`;

  return {
    overdueDaysAtReturn,
    requestFields: {
      ...baseRequestFields,
      overduePenaltyBatchId: finalizedBatchId,
    },
    restrictionData: {
      ...(restriction || {}),
      uid: request.requesterUid || restriction?.uid || '',
      activePenalty: shouldApplyPenalty
        ? true
        : Boolean(restriction?.activePenalty),
      penaltyStartDate: shouldApplyPenalty
        ? penaltyStartDate
        : String(restriction?.penaltyStartDate || ''),
      penaltyEndDate,
      eligibleFromDate,
      penaltyDays: shouldApplyPenalty
        ? penaltyDays
        : Number(restriction?.penaltyDays || 0),
      penaltyMode: shouldApplyPenalty
        ? normalizedSettings.overduePenaltyMode
        : String(restriction?.penaltyMode || ''),
      fixedDaysPerAssetApplied: shouldApplyPenalty
        ? normalizedSettings.overdueFixedDaysPerAsset
        : Number(restriction?.fixedDaysPerAssetApplied || 0),
      multiplierApplied: shouldApplyPenalty
        ? normalizedSettings.overdueDayMultiplier
        : Number(restriction?.multiplierApplied || 0),
      sourceRequestIds: shouldApplyPenalty
        ? pendingRequestIds
        : getUniqueRequestIds(restriction?.sourceRequestIds),
      overdueDeviceCount: shouldApplyPenalty
        ? pendingOverdueDeviceCount
        : Number(restriction?.overdueDeviceCount || 0),
      totalOverdueDays: shouldApplyPenalty
        ? pendingTotalOverdueDays
        : Number(restriction?.totalOverdueDays || 0),
      batchId: finalizedBatchId,
      pendingOverdueRequestIds: [],
      pendingOverdueDeviceCount: 0,
      pendingTotalOverdueDays: 0,
      lastEpisodeRequestIds: pendingRequestIds,
      lastEpisodeOverdueDeviceCount: pendingOverdueDeviceCount,
      lastEpisodeTotalOverdueDays: pendingTotalOverdueDays,
      lastEpisodePenaltyDays: shouldApplyPenalty ? penaltyDays : 0,
      lastEpisodeClosedDate: actualReturnDate,
    },
    finalizedRequestIds: pendingRequestIds,
  };
};
