import { findBlockingReservation, koreaToday, normalizeAssetReservationsForWrite } from './rental-request-write-policy.mjs';

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

export const createAdminRentalRequestService = ({ repository, firestoreClient }) => {
  if (!repository || typeof repository.list !== 'function' || typeof repository.upsertImportedRequests !== 'function') {
    throw new TypeError('Admin rental request repository is required.');
  }
  if (!firestoreClient || typeof firestoreClient.verifyAdmin !== 'function') {
    throw new TypeError('Firestore admin rental request client is required.');
  }

  const verify = async (firebaseIdentity) => {
    if (!firebaseIdentity?.uid || !firebaseIdentity?.idToken) {
      throw serviceError('admin_firebase_identity_missing', 'Verified Firebase admin identity is required.', 401);
    }
    return firestoreClient.verifyAdmin({
      firebaseUid: firebaseIdentity.uid,
      firebaseIdToken: firebaseIdentity.idToken,
    });
  };

  const bootstrap = async (firebaseIdentity) => {
    const admin = await verify(firebaseIdentity);
    const documents = await firestoreClient.listAllRentalRequests({ firebaseIdToken: firebaseIdentity.idToken });
    const requests = documents.map(normalizeRequestDocument);
    const synchronized = await repository.upsertImportedRequests(requests);
    return Object.freeze({ admin, synchronized, sourceCount: requests.length });
  };

  return Object.freeze({
    async bootstrap(firebaseIdentity) {
      return bootstrap(firebaseIdentity);
    },

    async list(firebaseIdentity, options = {}) {
      const admin = await verify(firebaseIdentity);
      const referenceDate = DATE_RE.test(trim(options.referenceDate)) ? trim(options.referenceDate) : koreaToday();
      const page = Math.max(1, Math.trunc(Number(options.page || 1)));
      const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(options.pageSize || 10))));
      const result = await repository.list({
        tab: trim(options.tab || 'pending'),
        quickFilter: trim(options.quickFilter || 'all'),
        query: trim(options.query),
        page,
        pageSize,
        referenceDate,
      });
      const counts = await repository.getCounts(referenceDate);
      return Object.freeze({ admin, referenceDate, page, pageSize, ...result, counts });
    },

    async getDashboard(firebaseIdentity, referenceDate = koreaToday()) {
      const admin = await verify(firebaseIdentity);
      return Object.freeze({ admin, referenceDate, counts: await repository.getCounts(referenceDate) });
    },

    async changeStatus(firebaseIdentity, { requestId, nextStatus }) {
      const admin = await verify(firebaseIdentity);
      const id = trim(requestId);
      const status = trim(nextStatus);
      if (!id || !status) throw serviceError('admin_rental_status_input_missing', 'Request ID and next status are required.', 400);

      const sourceDoc = await firestoreClient.getRentalRequest({ requestId: id, firebaseIdToken: firebaseIdentity.idToken });
      if (!sourceDoc) throw serviceError('rental_request_not_found', 'Rental request was not found.', 404);
      const sourceRequest = normalizeRequestDocument(sourceDoc);
      await repository.upsertImportedRequests([sourceRequest]);

      const assetDoc = await firestoreClient.getRentalAsset({ assetId: sourceRequest.laptopId, firebaseIdToken: firebaseIdentity.idToken });
      if (!assetDoc) throw serviceError('rental_asset_not_found', 'Rental asset was not found.', 404);
      const publicConfig = await firestoreClient.getPublicConfig({ firebaseIdToken: firebaseIdentity.idToken });
      const restrictionDoc = status === '반납완료' && sourceRequest.requesterUid
        ? await firestoreClient.getRentalRestriction({ firebaseUid: sourceRequest.requesterUid, firebaseIdToken: firebaseIdentity.idToken })
        : null;

      const referenceDate = koreaToday();
      const hasOtherOverdue = status === '반납완료'
        ? await repository.hasOtherCurrentOverdue({
            requesterUid: sourceRequest.requesterUid,
            excludedRequestId: id,
            referenceDate,
          })
        : false;
      const returnResult = status === '반납완료'
        ? buildReturnResult({
            request: sourceRequest,
            actualReturnDate: referenceDate,
            settings: publicConfig?.fields?.settings || {},
            restriction: restrictionDoc?.fields || null,
            hasOtherOverdue,
            batchId: `OVERDUE-${id}-${Date.now()}`,
          })
        : { requestFields: {}, restrictionFields: null, finalizedRequestIds: [] };

      const assetFields = assetDoc.fields || {};
      const settings = publicConfig?.fields?.settings || {};
      const existingReservations = normalizeAssetReservationsForWrite(assetFields.reservations || [])
        .filter((reservation) => reservation.id !== id);
      if (BLOCKING.has(status)) {
        const sourceConflict = findBlockingReservation({
          reservations: existingReservations,
          laptopId: sourceRequest.laptopId,
          startDate: sourceRequest.startDate,
          dueDate: sourceRequest.dueDate,
          settings,
        });
        if (sourceConflict) {
          throw serviceError('rental_period_conflict', 'The requested rental period conflicts with an existing reservation.', 409, {
            blockingRequest: sourceConflict,
          });
        }
      }
      const nextAvailability = {
        id,
        laptopId: sourceRequest.laptopId,
        assetCategory: sourceRequest.assetCategory,
        assetNo: sourceRequest.assetNo,
        startDate: sourceRequest.startDate,
        dueDate: sourceRequest.dueDate,
        status,
      };
      const nextReservations = BLOCKING.has(status)
        ? [...existingReservations, nextAvailability]
        : existingReservations;
      const representative = representativeReservation(nextReservations, sourceRequest.laptopId, referenceDate);
      const nextAsset = {
        id: sourceRequest.laptopId,
        reservations: nextReservations,
        status: trim(assetFields.status) === '대여불가'
          ? '대여불가'
          : representative?.status || '대여가능',
        currentRequestId: representative?.id || null,
      };
      const relatedRequestUpdates = (returnResult.finalizedRequestIds || [])
        .filter((relatedId) => relatedId !== id)
        .map((relatedId) => ({
          id: relatedId,
          fields: {
            overduePenaltyPending: false,
            overduePenaltyBatchId: returnResult.requestFields.overduePenaltyBatchId || '',
          },
        }));

      const committed = await repository.changeStatus({
        requestId: id,
        nextStatus: status,
        auditActor: admin,
        returnFields: returnResult.requestFields,
        allowNonOverlappingSameAssetRequests: Boolean(settings.allowNonOverlappingSameAssetRequests ?? false),
        relatedRequestUpdates,
        beforeCommit: async ({ currentRequest, nextRequest }) => {
          await firestoreClient.commitStatusChange({
            request: nextRequest,
            previousRequest: currentRequest,
            availability: BLOCKING.has(status) ? nextAvailability : null,
            asset: nextAsset,
            requestUpdateTime: sourceDoc.updateTime,
            assetUpdateTime: assetDoc.updateTime,
            auditActor: admin,
            restriction: returnResult.restrictionFields?.uid
              ? { uid: returnResult.restrictionFields.uid, fields: returnResult.restrictionFields }
              : null,
            relatedRequestUpdates,
            firebaseIdToken: firebaseIdentity.idToken,
          });
        },
      });

      return Object.freeze({
        admin,
        authority: 'postgresql',
        firestoreMirror: 'synced',
        request: committed,
        availability: BLOCKING.has(status) ? nextAvailability : null,
        asset: nextAsset,
        restrictionUpdated: Boolean(returnResult.restrictionFields?.uid),
      });
    },
  });
};
