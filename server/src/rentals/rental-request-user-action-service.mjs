import {
  buildExtensionPeriod,
  findExtensionConflict,
  findPeriodConflictExcludingRequest,
  getRequestExtensionCount,
  normalizeExtensionSettings,
  toAvailability,
  validateDirectEditPeriod,
  validateExtensionEligibility,
} from './rental-request-user-action-policy.mjs';
import { koreaToday, normalizeAssetReservationsForWrite } from './rental-request-write-policy.mjs';

const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();
const requestIdFromDocument = (document) => {
  const path = trim(document?.name);
  return path ? decodeURIComponent(path.split('/').at(-1) || '') : '';
};
const serviceError = (code, message, status = null, details = {}) => {
  const error = new Error(message);
  error.name = 'RentalRequestUserActionServiceError';
  error.code = code;
  error.status = status;
  Object.assign(error, details);
  return error;
};
const sourceRequest = (document) => document ? Object.freeze({ id: requestIdFromDocument(document), ...(document.fields || {}) }) : null;
const activeRestrictionBlocked = ({ restriction, settings, overdueCount = 0 }) => {
  const currentOverdue = Boolean(settings.overdueRentalBlockEnabled)
    && Number(overdueCount || 0) > 0;
  const eligible = trim(restriction?.eligibleFromDate);
  const postPenalty = Boolean(settings.postOverduePenaltyEnabled)
    && Boolean(restriction?.activePenalty)
    && eligible
    && koreaToday() < eligible;
  return currentOverdue || postPenalty;
};

export const createRentalRequestUserActionService = ({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  rentalRestrictionService,
  rentalRequestService,
  repository,
  firestoreClient,
  postgresSource = null,
  writeMirrorEnabled = true,
}) => {
  if (!userRepository || typeof userRepository.findByClerkUserId !== 'function') throw new TypeError('userRepository is required.');
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.findByAppUserId !== 'function') throw new TypeError('firebaseLinkRepository is required.');
  if (!memberShadowRepository || typeof memberShadowRepository.findByAppUserId !== 'function') throw new TypeError('memberShadowRepository is required.');
  if (!rentalRestrictionService || typeof rentalRestrictionService.syncLinkedFirebaseUid !== 'function') throw new TypeError('rentalRestrictionService is required.');
  if (!rentalRequestService || typeof rentalRequestService.syncCurrent !== 'function') throw new TypeError('rentalRequestService is required.');
  if (!repository || typeof repository.countCurrentOverdue !== 'function' || typeof repository.editAuthoritative !== 'function' || typeof repository.cancelAuthoritative !== 'function' || typeof repository.submitManualExtension !== 'function' || typeof repository.autoExtendAuthoritative !== 'function') throw new TypeError('rental request user action repository is required.');
  if (!firestoreClient || typeof firestoreClient.getRentalRequest !== 'function' || typeof firestoreClient.getRentalAsset !== 'function' || typeof firestoreClient.getPublicConfig !== 'function') throw new TypeError('Firestore rental request user action client is required.');
  if (!writeMirrorEnabled && (!postgresSource || typeof postgresSource.getRentalRequest !== 'function' || typeof postgresSource.getRentalAsset !== 'function' || typeof postgresSource.getPublicConfig !== 'function')) throw new TypeError('postgresSource is required when Firestore rental request write mirror is retired.');
  const sourceClient = writeMirrorEnabled ? firestoreClient : postgresSource;

  const resolveContext = async (clerkUserId, firebaseIdentity) => {
    const appUser = await userRepository.findByClerkUserId(clerkUserId);
    if (!appUser) throw serviceError('profile_not_synced', 'Application user identity is not synchronized.', 404);
    const link = await firebaseLinkRepository.findByAppUserId(appUser.id);
    if (!link) throw serviceError('legacy_link_not_found', 'Firebase legacy identity is not linked.', 404);
    const member = await memberShadowRepository.findByAppUserId(appUser.id);
    if (!member) throw serviceError('member_shadow_not_found', 'Member shadow is not synchronized.', 404);
    if (!firebaseIdentity?.uid || (writeMirrorEnabled && !firebaseIdentity?.idToken)) throw serviceError('firebase_identity_missing', 'Verified Firebase identity is required.', 401);
    if (firebaseIdentity.uid !== link.firebaseUid) throw serviceError('legacy_link_token_mismatch', 'Firebase token does not match linked identity.', 409);
    if (lower(firebaseIdentity.email) && lower(link.firebaseEmail) && lower(firebaseIdentity.email) !== lower(link.firebaseEmail)) throw serviceError('firebase_link_email_mismatch', 'Firebase token email does not match linked identity.', 409);
    if (trim(member.status) !== 'active') throw serviceError('rental_request_member_inactive', 'Only active members can change rental requests.', 403);
    return { appUser, link, member };
  };

  const readSource = async (firebaseIdentity, requestId) => {
    const [requestDoc, publicConfig] = await Promise.all([
      sourceClient.getRentalRequest({ requestId, firebaseIdToken: firebaseIdentity.idToken }),
      sourceClient.getPublicConfig({ firebaseIdToken: firebaseIdentity.idToken }),
    ]);
    if (!requestDoc) throw serviceError('rental_request_not_found', 'Rental request was not found.', 404);
    if (!publicConfig) throw serviceError('rental_request_public_config_not_found', 'Rental configuration was not found.', 503);
    const request = sourceRequest(requestDoc);
    if (!request?.laptopId) throw serviceError('rental_request_asset_missing', 'Rental request has no asset identity.', 409);
    const assetDoc = await sourceClient.getRentalAsset({ assetId: request.laptopId, firebaseIdToken: firebaseIdentity.idToken });
    if (!assetDoc) throw serviceError('rental_asset_not_found', 'Rental asset was not found.', 404);
    const asset = Object.freeze({ id: requestIdFromDocument(assetDoc) || trim(request.laptopId), ...(assetDoc.fields || {}) });
    const settings = publicConfig.fields?.settings && typeof publicConfig.fields.settings === 'object' ? publicConfig.fields.settings : {};
    return { requestDoc, request, assetDoc, asset, settings };
  };

  const verifyOwner = (request, context) => {
    if (trim(request?.requesterUid) !== trim(context.link.firebaseUid)) throw serviceError('rental_request_owner_mismatch', 'Rental request does not belong to the authenticated member.', 403);
  };

  const refreshShadow = async (clerkUserId, firebaseIdentity) => {
    if (!writeMirrorEnabled) return true;
    const result = await rentalRequestService.syncCurrent(clerkUserId, firebaseIdentity);
    return Boolean(result?.syncState || result?.requests);
  };
  const mirrorStatus = writeMirrorEnabled ? 'synced' : 'retired';

  return Object.freeze({
    async editCurrent(clerkUserId, firebaseIdentity, { requestId, startDate, dueDate, purpose = '' } = {}) {
      const id = trim(requestId);
      if (!id) throw serviceError('rental_request_id_missing', 'Rental request ID is required.', 400);
      const context = await resolveContext(clerkUserId, firebaseIdentity);
      const source = await readSource(firebaseIdentity, id);
      verifyOwner(source.request, context);
      if (!['신청중', '보류'].includes(source.request.status)) throw serviceError('invalid_direct_edit_status', 'Only requested/on-hold rentals can be edited.', 409);
      const period = validateDirectEditPeriod({ startDate, dueDate, settings: source.settings });
      const reservations = normalizeAssetReservationsForWrite(source.asset.reservations || []);
      const conflict = findPeriodConflictExcludingRequest({ reservations, requestId: id, laptopId: source.asset.id, startDate: period.startDate, dueDate: period.dueDate, settings: source.settings });
      if (conflict) throw serviceError('direct_edit_period_conflict', 'Edited rental period conflicts with another reservation.', 409, { blockingRequest: conflict });
      const nextRequest = Object.freeze({ ...source.request, startDate: period.startDate, dueDate: period.dueDate, purpose: trim(purpose), userActionRequest: null });
      const availability = toAvailability(nextRequest);
      const nextReservations = (Array.isArray(source.asset.reservations) ? source.asset.reservations : []).map((reservation) => reservation?.id === id ? availability : reservation);
      if (!nextReservations.some((reservation) => reservation?.id === id)) throw serviceError('asset_reservation_not_found', 'Asset reservation was not found.', 409);
      const asset = Object.freeze({ ...source.asset, reservations: nextReservations });
      const request = await repository.editAuthoritative({
        appUserId: context.appUser.id,
        firebaseUid: context.link.firebaseUid,
        requestId: id,
        startDate: period.startDate,
        dueDate: period.dueDate,
        purpose: trim(purpose),
        allowNonOverlappingSameAssetRequests: Boolean(source.settings.allowNonOverlappingSameAssetRequests ?? false),
        firestoreMirrorStatus: mirrorStatus,
        beforeCommit: writeMirrorEnabled ? () => firestoreClient.commitUserRequestEdit({
          request: nextRequest,
          availability,
          asset,
          requestUpdateTime: source.requestDoc.updateTime,
          assetUpdateTime: source.assetDoc.updateTime,
          firebaseIdToken: firebaseIdentity.idToken,
        }) : undefined,
      });
      await refreshShadow(clerkUserId, firebaseIdentity);
      return Object.freeze({ authority: 'postgresql', transactionSource: writeMirrorEnabled ? 'firestore-compatibility-source' : 'postgresql', operation: 'edit', firestoreMirror: mirrorStatus, shadowSynchronized: true, request, availability, asset });
    },

    async cancelCurrent(clerkUserId, firebaseIdentity, { requestId } = {}) {
      const id = trim(requestId);
      if (!id) throw serviceError('rental_request_id_missing', 'Rental request ID is required.', 400);
      const context = await resolveContext(clerkUserId, firebaseIdentity);
      const source = await readSource(firebaseIdentity, id);
      verifyOwner(source.request, context);
      if (source.request.status !== '신청중') throw serviceError('invalid_direct_cancel_status', 'Only unprocessed requested rentals can be cancelled.', 409);
      const stored = Array.isArray(source.asset.reservations) ? source.asset.reservations : [];
      if (!stored.some((reservation) => reservation?.id === id)) throw serviceError('asset_reservation_not_found', 'Asset reservation was not found.', 409);
      const asset = Object.freeze({ ...source.asset, reservations: stored.filter((reservation) => reservation?.id !== id) });
      const result = await repository.cancelAuthoritative({
        appUserId: context.appUser.id,
        firebaseUid: context.link.firebaseUid,
        requestId: id,
        beforeCommit: writeMirrorEnabled ? ({ currentRequest }) => firestoreClient.commitUserRequestCancel({
          request: currentRequest,
          asset,
          requestUpdateTime: source.requestDoc.updateTime,
          assetUpdateTime: source.assetDoc.updateTime,
          firebaseIdToken: firebaseIdentity.idToken,
        }) : undefined,
      });
      await refreshShadow(clerkUserId, firebaseIdentity);
      return Object.freeze({ authority: 'postgresql', transactionSource: writeMirrorEnabled ? 'firestore-compatibility-source' : 'postgresql', operation: 'cancel', firestoreMirror: mirrorStatus, shadowSynchronized: true, deleted: true, request: result.request, asset });
    },

    async extendCurrent(clerkUserId, firebaseIdentity, { requestId } = {}) {
      const id = trim(requestId);
      if (!id) throw serviceError('rental_request_id_missing', 'Rental request ID is required.', 400);
      const context = await resolveContext(clerkUserId, firebaseIdentity);
      const [source, restrictionSync] = await Promise.all([
        readSource(firebaseIdentity, id),
        writeMirrorEnabled
          ? rentalRestrictionService.syncLinkedFirebaseUid(firebaseIdentity, context.link.firebaseUid)
          : rentalRestrictionService.getCurrentByFirebaseIdentity(firebaseIdentity),
      ]);
      verifyOwner(source.request, context);
      await rentalRequestService.syncCurrent(clerkUserId, firebaseIdentity);
      const eligibility = validateExtensionEligibility({ request: source.request, settings: source.settings });
      const settings = eligibility.settings;
      const [overdueCount] = await Promise.all([
        repository.countCurrentOverdue(context.appUser.id, koreaToday()),
      ]);
      const restriction = writeMirrorEnabled
        ? (restrictionSync?.shadow?.exists ? restrictionSync.shadow.restriction : null)
        : (restrictionSync?.exists ? restrictionSync.restriction : null);
      if (activeRestrictionBlocked({ restriction, settings, overdueCount })) throw serviceError('rental_extension_restriction_blocked', 'Rental restriction blocks extension requests.', 403);
      const period = buildExtensionPeriod({ request: source.request, settings });
      const conflict = findExtensionConflict({ reservations: source.asset.reservations || [], requestId: id, laptopId: source.asset.id, startDate: period.extensionStartDate, dueDate: period.extensionDueDate });
      if (conflict) throw serviceError('rental_extension_period_conflict', 'Extension period conflicts with another reservation.', 409, { blockingRequest: conflict });
      const extensionNumber = getRequestExtensionCount(source.request) + 1;
      const requestedAt = new Date();
      const actionBase = {
        type: 'extend', reason: '', team: trim(source.request.team), borrower: trim(source.request.borrower),
        startDate: trim(source.request.startDate), previousDueDate: trim(source.request.dueDate),
        extensionStartDate: period.extensionStartDate, dueDate: period.extensionDueDate,
        purpose: trim(source.request.purpose), approvalMode: settings.rentalExtensionApprovalMode,
        extensionNumber, extensionDays: period.extensionDays, requestedAt,
        reviewedAt: null, reviewedByUid: '', reviewedByName: '', reviewMemo: '',
      };
      if (settings.rentalExtensionApprovalMode === 'manual') {
        const actionRequest = Object.freeze({ ...actionBase, status: 'pending' });
        const nextRequest = Object.freeze({ ...source.request, userActionRequest: actionRequest });
        const request = await repository.submitManualExtension({
          appUserId: context.appUser.id,
          firebaseUid: context.link.firebaseUid,
          requestId: id,
          actionRequest,
          firestoreMirrorStatus: mirrorStatus,
          beforeCommit: writeMirrorEnabled ? () => firestoreClient.commitUserExtension({
            request: nextRequest,
            requestUpdateTime: source.requestDoc.updateTime,
            firebaseIdToken: firebaseIdentity.idToken,
          }) : undefined,
        });
        await refreshShadow(clerkUserId, firebaseIdentity);
        return Object.freeze({ authority: 'postgresql', transactionSource: writeMirrorEnabled ? 'firestore-compatibility-source' : 'postgresql', operation: 'extend', approvalMode: 'manual', firestoreMirror: mirrorStatus, shadowSynchronized: true, request });
      }
      const approvalDate = koreaToday();
      const nextExtensionRequestDate = (() => {
        const date = new Date(`${approvalDate}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + settings.rentalExtensionRequestWaitDays);
        return date.toISOString().slice(0, 10);
      })();
      const actionRequest = Object.freeze({
        ...actionBase,
        status: 'approved',
        reviewedAt: requestedAt,
        reviewedByUid: 'system', reviewedByName: '시스템 자동 승인',
        approvalDate, nextExtensionRequestDate,
      });
      const extensionHistory = [
        ...(Array.isArray(source.request.extensionHistory) ? source.request.extensionHistory : []),
        {
          extensionNumber, approvalMode: 'auto', previousDueDate: trim(source.request.dueDate),
          extensionStartDate: period.extensionStartDate, newDueDate: period.extensionDueDate,
          extensionDays: period.extensionDays, requestedAt, approvedAt: requestedAt,
          approvedDate: approvalDate, approvedByUid: 'system', approvedByName: '시스템 자동 승인', status: 'approved',
        },
      ];
      const nextRequest = Object.freeze({
        ...source.request, dueDate: period.extensionDueDate, extensionCount: extensionNumber,
        lastExtensionApprovedDate: approvalDate, nextExtensionRequestDate, extensionHistory, userActionRequest: actionRequest,
      });
      const availability = toAvailability(nextRequest);
      const asset = Object.freeze({
        ...source.asset,
        reservations: (Array.isArray(source.asset.reservations) ? source.asset.reservations : []).map((reservation) => reservation?.id === id ? availability : reservation),
      });
      const request = await repository.autoExtendAuthoritative({
        appUserId: context.appUser.id,
        firebaseUid: context.link.firebaseUid,
        requestId: id,
        dueDate: period.extensionDueDate,
        extensionCount: extensionNumber,
        lastExtensionApprovedDate: approvalDate,
        nextExtensionRequestDate,
        extensionHistory,
        actionRequest,
        firestoreMirrorStatus: mirrorStatus,
        beforeCommit: writeMirrorEnabled ? () => firestoreClient.commitUserExtension({
          request: nextRequest, availability, asset, autoApproved: true,
          requestUpdateTime: source.requestDoc.updateTime, assetUpdateTime: source.assetDoc.updateTime,
          firebaseIdToken: firebaseIdentity.idToken,
        }) : undefined,
      });
      await refreshShadow(clerkUserId, firebaseIdentity);
      return Object.freeze({ authority: 'postgresql', transactionSource: writeMirrorEnabled ? 'firestore-compatibility-source' : 'postgresql', operation: 'extend', approvalMode: 'auto', firestoreMirror: mirrorStatus, shadowSynchronized: true, request, availability, asset });
    },
  });
};
