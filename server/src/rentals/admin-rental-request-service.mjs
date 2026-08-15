import { findBlockingReservation, koreaToday, normalizeAssetReservationsForWrite } from './rental-request-write-policy.mjs';
import { buildExtensionPeriod, findExtensionConflict, getExtensionAvailableDate, getRequestExtensionCount, normalizeExtensionSettings, validateDirectEditPeriod } from './rental-request-user-action-policy.mjs';

const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();
const BLOCKING = new Set(['신청중', '대여중', '보류']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const serviceError = (code, message, status = 400, details = {}) => {
  const error = new Error(message);
  error.name = 'AdminRentalRequestServiceError';
  error.code = code;
  error.status = status;
  Object.assign(error, details);
  return error;
};

const requestIdFromDocument = (document) => {
  const path = trim(document?.name);
  return path ? decodeURIComponent(path.split('/').at(-1) || '') : '';
};

const timestamp = (value) => {
  const text = trim(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const normalizeRequestDocument = (document) => {
  const fields = document?.fields || {};
  const id = trim(fields.id) || requestIdFromDocument(document);
  const startDate = trim(fields.startDate);
  const dueDate = trim(fields.dueDate);
  if (!id) throw serviceError('admin_rental_request_id_missing', 'Rental request is missing its ID.', 409);
  if (!DATE_RE.test(startDate) || !DATE_RE.test(dueDate)) {
    throw serviceError('admin_rental_request_date_invalid', `Rental request ${id} contains invalid dates.`, 409);
  }
  return Object.freeze({
    id,
    requesterUid: trim(fields.requesterUid),
    requesterEmail: lower(fields.requesterEmail),
    requesterName: trim(fields.requesterName),
    requesterTeam: trim(fields.requesterTeam || fields.team),
    laptopId: trim(fields.laptopId),
    assetCategory: trim(fields.assetCategory),
    assetNo: trim(fields.assetNo),
    startDate,
    dueDate,
    purpose: trim(fields.purpose),
    status: trim(fields.status),
    adminMemo: trim(fields.adminMemo),
    extensionCount: Number(fields.extensionCount || 0),
    lastExtensionApprovedDate: trim(fields.lastExtensionApprovedDate),
    nextExtensionRequestDate: trim(fields.nextExtensionRequestDate),
    extensionHistory: Array.isArray(fields.extensionHistory) ? fields.extensionHistory : [],
    userActionRequest: fields.userActionRequest && typeof fields.userActionRequest === 'object' && !Array.isArray(fields.userActionRequest)
      ? fields.userActionRequest : null,
    requestedAt: trim(fields.requestedAt),
    returnedAt: timestamp(fields.returnedAt),
    actualReturnDate: trim(fields.actualReturnDate),
    overdueDaysAtReturn: Number(fields.overdueDaysAtReturn || 0),
    overduePenaltyPending: Boolean(fields.overduePenaltyPending),
    overduePenaltyBatchId: trim(fields.overduePenaltyBatchId),
    syncedAt: timestamp(fields.syncedAt),
    createdAt: timestamp(fields.createdAt || document?.createTime),
    updatedAt: timestamp(fields.updatedAt || document?.updateTime),
    sourceUpdateTime: trim(document?.updateTime),
  });
};

const addDays = (dateText, days) => {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};

const calendarDays = (later, earlier) => {
  const a = Date.parse(`${later}T00:00:00Z`);
  const b = Date.parse(`${earlier}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((a - b) / 86400000));
};

const normalizeOverdueSettings = (settings = {}) => ({
  postOverduePenaltyEnabled: Boolean(settings.postOverduePenaltyEnabled ?? false),
  overduePenaltyMode: settings.overduePenaltyMode === 'overdueDayMultiplier' ? 'overdueDayMultiplier' : 'fixedPerAsset',
  overdueFixedDaysPerAsset: Math.max(1, Math.trunc(Number(settings.overdueFixedDaysPerAsset || 1))),
  overdueDayMultiplier: Math.max(1, Math.trunc(Number(settings.overdueDayMultiplier || 1))),
});

const unique = (values) => [...new Set((values || []).map(trim).filter(Boolean))];

const buildReturnResult = ({ request, actualReturnDate, settings, restriction, hasOtherOverdue, batchId }) => {
  const normalized = normalizeOverdueSettings(settings);
  const overdueDaysAtReturn = calendarDays(actualReturnDate, request.dueDate);
  const base = {
    returnedAt: new Date().toISOString(),
    actualReturnDate,
    overdueDaysAtReturn,
    overduePenaltyPending: false,
    overduePenaltyBatchId: '',
  };
  if (overdueDaysAtReturn < 1) {
    return { requestFields: base, restrictionFields: null, finalizedRequestIds: [] };
  }

  const existingPending = unique(restriction?.pendingOverdueRequestIds);
  const alreadyPending = existingPending.includes(request.id);
  const pendingIds = unique([...existingPending, request.id]);
  const deviceCount = Math.max(0, Number(restriction?.pendingOverdueDeviceCount || 0)) + (alreadyPending ? 0 : 1);
  const totalDays = Math.max(0, Number(restriction?.pendingTotalOverdueDays || 0)) + (alreadyPending ? 0 : overdueDaysAtReturn);

  if (hasOtherOverdue) {
    return {
      requestFields: { ...base, overduePenaltyPending: true },
      restrictionFields: {
        ...(restriction || {}),
        uid: request.requesterUid || restriction?.uid || '',
        pendingOverdueRequestIds: pendingIds,
        pendingOverdueDeviceCount: deviceCount,
        pendingTotalOverdueDays: totalDays,
      },
      finalizedRequestIds: [],
    };
  }

  const penaltyDays = normalized.overduePenaltyMode === 'overdueDayMultiplier'
    ? totalDays * normalized.overdueDayMultiplier
    : deviceCount * normalized.overdueFixedDaysPerAsset;
  const existingEnd = trim(restriction?.penaltyEndDate);
  const baseDate = existingEnd && existingEnd > actualReturnDate ? existingEnd : actualReturnDate;
  const apply = normalized.postOverduePenaltyEnabled && penaltyDays > 0;
  const penaltyStartDate = apply ? addDays(baseDate, 1) : trim(restriction?.penaltyStartDate);
  const penaltyEndDate = apply ? addDays(baseDate, penaltyDays) : trim(restriction?.penaltyEndDate);
  const eligibleFromDate = apply ? addDays(penaltyEndDate, 1) : trim(restriction?.eligibleFromDate);
  const finalBatch = batchId || `OVERDUE-${request.id}`;
  return {
    requestFields: { ...base, overduePenaltyBatchId: finalBatch },
    restrictionFields: {
      ...(restriction || {}),
      uid: request.requesterUid || restriction?.uid || '',
      activePenalty: apply ? true : Boolean(restriction?.activePenalty),
      penaltyStartDate,
      penaltyEndDate,
      eligibleFromDate,
      penaltyDays: apply ? penaltyDays : Number(restriction?.penaltyDays || 0),
      penaltyMode: apply ? normalized.overduePenaltyMode : trim(restriction?.penaltyMode),
      fixedDaysPerAssetApplied: apply ? normalized.overdueFixedDaysPerAsset : Number(restriction?.fixedDaysPerAssetApplied || 0),
      multiplierApplied: apply ? normalized.overdueDayMultiplier : Number(restriction?.multiplierApplied || 0),
      sourceRequestIds: apply ? pendingIds : unique(restriction?.sourceRequestIds),
      overdueDeviceCount: apply ? deviceCount : Number(restriction?.overdueDeviceCount || 0),
      totalOverdueDays: apply ? totalDays : Number(restriction?.totalOverdueDays || 0),
      batchId: finalBatch,
      pendingOverdueRequestIds: [],
      pendingOverdueDeviceCount: 0,
      pendingTotalOverdueDays: 0,
      lastEpisodeRequestIds: pendingIds,
      lastEpisodeOverdueDeviceCount: deviceCount,
      lastEpisodeTotalOverdueDays: totalDays,
      lastEpisodePenaltyDays: apply ? penaltyDays : 0,
      lastEpisodeClosedDate: actualReturnDate,
    },
    finalizedRequestIds: pendingIds,
  };
};

const weekday = (dateText) => {
  const date = new Date(`${dateText}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.getUTCDay() : -1;
};

const getAdjustedDueDate = (dateText, settings = {}) => {
  let candidate = trim(dateText);
  if (!DATE_RE.test(candidate)) return candidate;
  const holidays = Array.isArray(settings.holidays) ? settings.holidays : [];
  const holidaySet = new Set(
    holidays
      .filter((holiday) => holiday && holiday.enabled !== false && trim(holiday.date))
      .map((holiday) => trim(holiday.date)),
  );
  const excludeSaturday = Boolean(settings.excludeSaturdays ?? settings.excludeWeekendsForStartDate ?? true);
  const excludeSunday = Boolean(settings.excludeSundays ?? settings.excludeWeekendsForStartDate ?? true);
  const excludeHolidays = Boolean(settings.excludeHolidaysForStartDate ?? true);
  for (let index = 0; index < 370; index += 1) {
    const day = weekday(candidate);
    const blocked = (excludeSaturday && day === 6)
      || (excludeSunday && day === 0)
      || (excludeHolidays && holidaySet.has(candidate));
    if (!blocked) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
};

const createAvailability = (request) => Object.freeze({
  id: request.id,
  laptopId: request.laptopId,
  assetCategory: request.assetCategory,
  assetNo: request.assetNo,
  startDate: request.startDate,
  dueDate: request.dueDate,
  status: request.status,
});

const representativeReservation = (reservations, laptopId, referenceDate) => {
  const items = normalizeAssetReservationsForWrite(reservations)
    .filter((item) => item.laptopId === laptopId && BLOCKING.has(item.status));
  const byStart = (a, b) => String(a.startDate).localeCompare(String(b.startDate));
  return items.filter((item) => item.status === '대여중' && item.startDate <= referenceDate).sort(byStart)[0]
    || items.filter((item) => item.status === '대여중' && item.startDate > referenceDate).sort(byStart)[0]
    || items.filter((item) => item.status === '신청중').sort(byStart)[0]
    || items.filter((item) => item.status === '보류').sort(byStart)[0]
    || null;
};

export const createAdminRentalRequestService = ({ repository, restrictionAuthorityRepository = null, postgresSource }) => {
  if (!repository || typeof repository.list !== 'function') {
    throw new TypeError('Admin rental request repository is required.');
  }
  if (!postgresSource || typeof postgresSource.getRentalRequest !== 'function' || typeof postgresSource.getRentalAsset !== 'function' || typeof postgresSource.getPublicConfig !== 'function' || typeof postgresSource.getRentalRestriction !== 'function') {
    throw new TypeError('postgresSource is required.');
  }
  const mutationSourceClient = postgresSource;
  const mirrorStatus = 'retired';
  const verify = async (identity) => {
    if (identity?.source !== 'clerk-postgresql') {
      throw serviceError('admin_postgresql_identity_required', 'Clerk/PostgreSQL administrator identity is required.', 401);
    }
    return Object.freeze({ uid: identity.uid, role: 'admin', source: 'postgresql-admin-registry' });
  };



  return Object.freeze({
    async bootstrap(firebaseIdentity) {
      const admin = await verify(firebaseIdentity);
      return Object.freeze({
        admin,
        synchronized: 0,
        sourceCount: 0,
        eventCount: 0,
        skipped: true,
        source: 'postgresql-authoritative',
      });
    },

    async list(firebaseIdentity, options = {}) {
      const admin = await verify(firebaseIdentity);
      const referenceDate = DATE_RE.test(trim(options.referenceDate)) ? trim(options.referenceDate) : koreaToday();
      const page = Math.max(1, Math.trunc(Number(options.page || 1)));
      const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(options.pageSize || 10))));
      const includeCounts = options.includeCounts !== false;
      const tab = trim(options.tab || 'pending');
      const quickFilter = trim(options.quickFilter || 'all');
      const query = trim(options.query);
      const canUseTabCountAsTotal = quickFilter === 'all' && !query;
      const needsTabCounts = includeCounts || canUseTabCountAsTotal;
      const result = await repository.list({
        tab,
        quickFilter,
        query,
        page,
        pageSize,
        referenceDate,
        includeTotalCount: !canUseTabCountAsTotal,
        includeTabCounts: needsTabCounts,
      });
      const counts = needsTabCounts ? result.tabCounts : null;
      const totalCount = canUseTabCountAsTotal
        ? Number(counts?.[tab] || 0)
        : Number(result.totalCount || 0);
      return Object.freeze({ admin, referenceDate, page, pageSize, requests: result.requests, totalCount, counts });
    },

    async getDashboard(firebaseIdentity, referenceDate = koreaToday()) {
      const admin = await verify(firebaseIdentity);
      return Object.freeze({ admin, referenceDate, counts: await repository.getCounts(referenceDate) });
    },

    async syncRequest(firebaseIdentity, requestId) {
      const admin = await verify(firebaseIdentity);
      const id = trim(requestId);
      if (!id) throw serviceError('admin_rental_request_id_missing', 'Rental request ID is required.', 400);
      const request = await repository.getByRequestId(id);
      if (!request) throw serviceError('rental_request_not_found', 'Rental request was not found.', 404);
      return Object.freeze({ admin, synchronized: 0, eventCount: 0, request, skipped: true, source: 'postgresql-authoritative' });
    },

    async getEvents(firebaseIdentity, requestId) {
      const admin = await verify(firebaseIdentity);
      const events = await repository.listEvents(trim(requestId), 100);
      return Object.freeze({ admin, events });
    },

    async editRequest(firebaseIdentity, { requestId, form = {} }) {
      const admin = await verify(firebaseIdentity);
      const id = trim(requestId);
      if (!id) throw serviceError('admin_rental_request_id_missing', 'Rental request ID is required.', 400);
      const sourceDoc = await mutationSourceClient.getRentalRequest({ requestId: id });
      if (!sourceDoc) throw serviceError('rental_request_not_found', 'Rental request was not found.', 404);
      const sourceRequest = normalizeRequestDocument(sourceDoc);
      const assetDoc = await mutationSourceClient.getRentalAsset({ assetId: sourceRequest.laptopId });
      if (!assetDoc) throw serviceError('rental_asset_not_found', 'Rental asset was not found.', 404);
      const publicConfig = await mutationSourceClient.getPublicConfig();
      const settings = publicConfig?.fields?.settings || {};
      const requestedDueDate = trim(form.dueDate);
      const nextRequest = Object.freeze({
        ...sourceRequest,
        startDate: trim(form.startDate),
        dueDate: getAdjustedDueDate(requestedDueDate, settings),
        purpose: trim(form.purpose),
        adminMemo: String(form.adminMemo ?? '').trim(),
      });
      if (!nextRequest.requesterTeam || !nextRequest.requesterName || !DATE_RE.test(nextRequest.startDate) || !DATE_RE.test(requestedDueDate)) {
        throw serviceError('required_rental_edit_fields_missing', 'Required rental edit fields are missing.', 400);
      }
      if (requestedDueDate < nextRequest.startDate) {
        throw serviceError('invalid_rental_edit_period', 'Rental due date cannot be before the start date.', 400);
      }
      const assetFields = assetDoc.fields || {};
      const existingReservations = normalizeAssetReservationsForWrite(assetFields.reservations || [])
        .filter((reservation) => reservation.id !== id);
      if (BLOCKING.has(sourceRequest.status)) {
        const conflict = findBlockingReservation({
          reservations: existingReservations,
          laptopId: sourceRequest.laptopId,
          startDate: nextRequest.startDate,
          dueDate: nextRequest.dueDate,
          settings,
        });
        if (conflict) throw serviceError('rental_period_conflict', 'The edited period conflicts with an existing reservation.', 409, { blockingRequest: conflict });
      }
      const nextAvailability = BLOCKING.has(sourceRequest.status) ? createAvailability(nextRequest) : null;
      const nextReservations = nextAvailability ? [...existingReservations, nextAvailability] : existingReservations;
      const representative = representativeReservation(nextReservations, sourceRequest.laptopId, koreaToday());
      const nextAsset = Object.freeze({
        id: sourceRequest.laptopId,
        reservations: nextReservations,
        status: trim(assetFields.status) === '대여불가' ? '대여불가' : representative?.status || '대여가능',
        currentRequestId: representative?.id || null,
      });
      const detail = [
        sourceRequest.startDate !== nextRequest.startDate ? `대여 시작일: ${sourceRequest.startDate || '-'} → ${nextRequest.startDate}` : '',
        sourceRequest.dueDate !== nextRequest.dueDate ? `반납 예정일: ${sourceRequest.dueDate || '-'} → ${nextRequest.dueDate}` : '',
        sourceRequest.purpose !== nextRequest.purpose ? '대여 목적 변경' : '',
        sourceRequest.adminMemo !== nextRequest.adminMemo ? '관리자 메모 변경' : '',
      ].filter(Boolean).join(' / ') || '신청 정보를 다시 저장했습니다.';
      const committed = await repository.editRequest({
        requestId: id,
        updates: {
          requesterTeam: sourceRequest.requesterTeam,
          requesterName: sourceRequest.requesterName,
          startDate: nextRequest.startDate,
          dueDate: nextRequest.dueDate,
          purpose: nextRequest.purpose,
          adminMemo: nextRequest.adminMemo,
        },
        auditActor: admin,
        allowNonOverlappingSameAssetRequests: Boolean(settings.allowNonOverlappingSameAssetRequests ?? false),
      });
      return Object.freeze({
        admin,
        authority: 'postgresql',
        transactionSource: 'postgresql',
        firestoreMirror: mirrorStatus,
        request: committed,
        availability: nextAvailability,
        asset: nextAsset,
        dueDateAdjusted: Boolean(requestedDueDate && requestedDueDate !== nextRequest.dueDate),
      });
    },

    async saveMemo(firebaseIdentity, { requestId, memo = '' }) {
      const admin = await verify(firebaseIdentity);
      const id = trim(requestId);
      const sourceDoc = await mutationSourceClient.getRentalRequest({ requestId: id });
      if (!sourceDoc) throw serviceError('rental_request_not_found', 'Rental request was not found.', 404);
      const sourceRequest = normalizeRequestDocument(sourceDoc);
      const result = await repository.saveMemo({
        requestId: id,
        memo: String(memo ?? ''),
        auditActor: admin,
      });
      return Object.freeze({ admin, authority: 'postgresql', transactionSource: 'postgresql', firestoreMirror: result.changed ? mirrorStatus : 'not-needed', ...result });
    },

    async restoreStatus(firebaseIdentity, { requestId, nextStatus, restoreReason }) {
      const admin = await verify(firebaseIdentity);
      const id = trim(requestId);
      const status = trim(nextStatus);
      const reason = trim(restoreReason);
      if (!id || !status) throw serviceError('admin_rental_restore_input_missing', 'Request ID and restore status are required.', 400);
      if (!reason) throw serviceError('restore_reason_missing', 'Restore reason is required.', 400);
      const sourceDoc = await mutationSourceClient.getRentalRequest({ requestId: id });
      if (!sourceDoc) throw serviceError('rental_request_not_found', 'Rental request was not found.', 404);
      const sourceRequest = normalizeRequestDocument(sourceDoc);
      const assetDoc = await mutationSourceClient.getRentalAsset({ assetId: sourceRequest.laptopId });
      if (!assetDoc) throw serviceError('rental_asset_not_found', 'Rental asset was not found.', 404);
      const publicConfig = await mutationSourceClient.getPublicConfig();
      const settings = publicConfig?.fields?.settings || {};
      const assetFields = assetDoc.fields || {};
      const existingReservations = normalizeAssetReservationsForWrite(assetFields.reservations || [])
        .filter((reservation) => reservation.id !== id);
      const restoredRequest = Object.freeze({ ...sourceRequest, status, userActionRequest: null });
      if (BLOCKING.has(status)) {
        const conflict = findBlockingReservation({
          reservations: existingReservations,
          laptopId: sourceRequest.laptopId,
          startDate: sourceRequest.startDate,
          dueDate: sourceRequest.dueDate,
          settings,
        });
        if (conflict) throw serviceError('rental_period_conflict', 'The restored rental period conflicts with an existing reservation.', 409, { blockingRequest: conflict });
      }
      const nextAvailability = BLOCKING.has(status) ? createAvailability(restoredRequest) : null;
      const nextReservations = nextAvailability ? [...existingReservations, nextAvailability] : existingReservations;
      const representative = representativeReservation(nextReservations, sourceRequest.laptopId, koreaToday());
      const nextAsset = Object.freeze({
        id: sourceRequest.laptopId,
        reservations: nextReservations,
        status: trim(assetFields.status) === '대여불가' ? '대여불가' : representative?.status || '대여가능',
        currentRequestId: representative?.id || null,
      });
      const committed = await repository.changeStatus({
        requestId: id,
        nextStatus: status,
        auditActor: admin,
        allowNonOverlappingSameAssetRequests: Boolean(settings.allowNonOverlappingSameAssetRequests ?? false),
        eventType: 'status-restored',
        eventPayload: { detail: `상태 복구 사유: ${reason}` },
        clearUserActionRequest: true,
      });
      return Object.freeze({ admin, authority: 'postgresql', transactionSource: 'postgresql', firestoreMirror: mirrorStatus, request: committed, availability: nextAvailability, asset: nextAsset });
    },

    async reviewUserAction(firebaseIdentity, { requestId, approved = false }) {
      const admin = await verify(firebaseIdentity);
      const id = trim(requestId);
      if (!id) throw serviceError('admin_rental_request_id_missing', 'Rental request ID is required.', 400);
      const sourceDoc = await mutationSourceClient.getRentalRequest({ requestId: id });
      if (!sourceDoc) throw serviceError('rental_request_not_found', 'Rental request was not found.', 404);
      const sourceRequest = normalizeRequestDocument(sourceDoc);
      const action = sourceRequest.userActionRequest;
      if (!action || action.status !== 'pending') throw serviceError('user_action_request_not_pending', 'No pending user action exists.', 409);
      const actionType = trim(action.type);
      if (!['change', 'cancel', 'extend', 'return'].includes(actionType)) throw serviceError('invalid_user_action_request_type', 'User action type is invalid.', 400);

      const [assetDoc, publicConfig, restrictionDoc] = await Promise.all([
        mutationSourceClient.getRentalAsset({ assetId: sourceRequest.laptopId }),
        mutationSourceClient.getPublicConfig(),
        actionType === 'return' && sourceRequest.requesterUid
          ? mutationSourceClient.getRentalRestriction({ firebaseUid: sourceRequest.requesterUid })
          : Promise.resolve(null),
      ]);
      if (!assetDoc) throw serviceError('rental_asset_not_found', 'Rental asset was not found.', 404);
      const settings = publicConfig?.fields?.settings && typeof publicConfig.fields.settings === 'object' ? publicConfig.fields.settings : {};
      const asset = Object.freeze({ id: requestIdFromDocument(assetDoc) || sourceRequest.laptopId, ...(assetDoc.fields || {}) });
      const reviewedAt = new Date();
      const nextReviewStatus = approved ? 'approved' : 'denied';
      let nextAction = {
        ...action,
        status: nextReviewStatus,
        reviewedAt,
        reviewedByUid: admin.uid,
        reviewedByName: admin.name,
        reviewMemo: sourceRequest.adminMemo || '',
      };
      let nextRequest = { ...sourceRequest, userActionRequest: nextAction };
      let restrictionFields = null;
      let relatedRequestUpdates = [];
      let touchAsset = false;
      let allowNonOverlapping = false;

      if (approved && actionType === 'change') {
        if (!['신청중', '보류'].includes(sourceRequest.status)) throw serviceError('invalid_user_action_request_status', 'Current status cannot approve this user action.', 409);
        const period = validateDirectEditPeriod({ startDate: trim(action.startDate), dueDate: trim(action.dueDate), settings });
        const conflict = findBlockingReservation({
          reservations: normalizeAssetReservationsForWrite(asset.reservations || []).filter((item) => item.id !== id),
          laptopId: sourceRequest.laptopId,
          startDate: period.startDate,
          dueDate: period.dueDate,
          settings,
        });
        if (conflict) throw serviceError('user_action_period_conflict', 'Requested change conflicts with another reservation.', 409, { blockingRequest: conflict });
        nextRequest = { ...nextRequest, startDate: period.startDate, dueDate: period.dueDate, purpose: trim(action.purpose) };
        touchAsset = true;
        allowNonOverlapping = Boolean(settings.allowNonOverlappingSameAssetRequests ?? false);
      }

      if (approved && actionType === 'extend') {
        if (sourceRequest.status !== '대여중') throw serviceError('invalid_user_action_request_status', 'Only active rentals can be extended.', 409);
        const extensionSettings = normalizeExtensionSettings(settings);
        if (!extensionSettings.rentalExtensionEnabled) throw serviceError('rental_extension_disabled', 'Rental extension is disabled.', 409);
        const count = getRequestExtensionCount(sourceRequest);
        if (count >= extensionSettings.rentalExtensionMaxCount) throw serviceError('rental_extension_count_exceeded', 'Rental extension count exceeded.', 409);
        const availableDate = getExtensionAvailableDate(sourceRequest, extensionSettings);
        if (availableDate && koreaToday() < availableDate) throw serviceError('rental_extension_too_early', 'Rental extension request is too early.', 409, { availableDate });
        const period = buildExtensionPeriod({ request: sourceRequest, settings: extensionSettings });
        const conflict = findExtensionConflict({ reservations: asset.reservations || [], requestId: id, laptopId: sourceRequest.laptopId, startDate: period.extensionStartDate, dueDate: period.extensionDueDate });
        if (conflict) throw serviceError('rental_extension_period_conflict', 'Rental extension conflicts with another reservation.', 409, { blockingRequest: conflict });
        const extensionNumber = count + 1;
        const approvalDate = koreaToday();
        const nextExtensionRequestDate = addDays(approvalDate, extensionSettings.rentalExtensionRequestWaitDays);
        nextAction = {
          ...nextAction,
          extensionStartDate: period.extensionStartDate,
          dueDate: period.extensionDueDate,
          extensionDays: period.extensionDays,
          extensionNumber,
          approvalDate,
          nextExtensionRequestDate,
        };
        const extensionHistory = [
          ...(Array.isArray(sourceRequest.extensionHistory) ? sourceRequest.extensionHistory : []),
          {
            extensionNumber,
            approvalMode: trim(action.approvalMode) || 'manual',
            previousDueDate: sourceRequest.dueDate,
            extensionStartDate: period.extensionStartDate,
            newDueDate: period.extensionDueDate,
            extensionDays: period.extensionDays,
            requestedAt: action.requestedAt || reviewedAt,
            approvedAt: reviewedAt,
            approvedDate: approvalDate,
            approvedByUid: admin.uid,
            approvedByName: admin.name,
            status: 'approved',
          },
        ];
        nextRequest = {
          ...nextRequest,
          dueDate: period.extensionDueDate,
          extensionCount: extensionNumber,
          lastExtensionApprovedDate: approvalDate,
          nextExtensionRequestDate,
          extensionHistory,
          userActionRequest: nextAction,
        };
        touchAsset = true;
        allowNonOverlapping = true;
      }

      if (approved && actionType === 'cancel') {
        if (!['신청중', '보류'].includes(sourceRequest.status)) throw serviceError('invalid_user_action_request_status', 'Current status cannot approve cancellation.', 409);
        nextRequest = { ...nextRequest, status: '사용자취소' };
        touchAsset = true;
      }

      if (approved && actionType === 'return') {
        if (sourceRequest.status !== '대여중') throw serviceError('invalid_user_action_request_status', 'Only active rentals can be returned.', 409);
        const hasOther = await repository.hasOtherCurrentOverdue({ requesterUid: sourceRequest.requesterUid, excludedRequestId: id, referenceDate: koreaToday() });
        const restriction = restrictionDoc?.fields || null;
        const returnResult = buildReturnResult({
          request: sourceRequest,
          actualReturnDate: koreaToday(),
          settings,
          restriction,
          hasOtherOverdue: hasOther,
          batchId: `OVERDUE-${id}-${Date.now()}`,
        });
        nextRequest = { ...nextRequest, status: '반납완료', ...returnResult.requestFields };
        restrictionFields = returnResult.restrictionFields;
        relatedRequestUpdates = (returnResult.finalizedRequestIds || [])
          .filter((relatedId) => relatedId !== id)
          .map((relatedId) => ({ id: relatedId, fields: { overduePenaltyPending: false, overduePenaltyBatchId: returnResult.requestFields.overduePenaltyBatchId || '' } }));
        touchAsset = true;
      }

      const baseReservations = normalizeAssetReservationsForWrite(asset.reservations || []).filter((item) => item.id !== id);
      const nextAvailability = BLOCKING.has(nextRequest.status) ? createAvailability(nextRequest) : null;
      const nextReservations = approved
        ? (nextAvailability ? [...baseReservations, nextAvailability] : baseReservations)
        : normalizeAssetReservationsForWrite(asset.reservations || []);
      const representative = representativeReservation(nextReservations, asset.id, koreaToday());
      const nextAsset = Object.freeze({
        ...asset,
        reservations: nextReservations,
        status: asset.status === '대여불가' ? '대여불가' : (representative?.status || '대여가능'),
        currentRequestId: representative?.id || null,
      });

      const committed = await repository.reviewUserAction({
        requestId: id,
        nextRequest,
        auditActor: admin,
        approved: Boolean(approved),
        allowNonOverlappingSameAssetRequests: allowNonOverlapping,
        relatedRequestUpdates,
        eventPayload: {
          userActionType: actionType,
          reviewStatus: nextReviewStatus,
          detail: actionType === 'extend'
            ? `대여 연장 신청 ${approved ? '승인' : '불허'} · ${trim(action.extensionStartDate) || '-'} ~ ${trim(action.dueDate) || '-'}`
            : `${actionType} ${approved ? '승인' : '불허'} · 요청 사유: ${trim(action.reason) || '-'}`,
        },
      });

      if (returnResult.restrictionFields?.uid && restrictionAuthorityRepository) {
        await restrictionAuthorityRepository.upsertRestrictionAuthoritative({
          firebaseUid: returnResult.restrictionFields.uid,
          appUserId: null,
          restriction: returnResult.restrictionFields,
          mirrorState: mirrorStatus,
        });
      }
      return Object.freeze({
        admin,
        authority: 'postgresql',
        transactionSource: 'postgresql',
        firestoreMirror: mirrorStatus,
        restrictionAuthority: returnResult.restrictionFields?.uid ? 'postgresql-authoritative' : 'unchanged',
        request: committed,
        availability: BLOCKING.has(status) ? nextAvailability : null,
        asset: nextAsset,
        restrictionUpdated: Boolean(returnResult.restrictionFields?.uid),
      });
    },
  });
};
