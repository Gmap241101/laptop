import {
  findBlockingReservation,
  koreaRequestedAtText,
  koreaToday,
  normalizeAssetReservationsForWrite,
  validateRequestedPeriod,
} from './rental-request-write-policy.mjs';

const normalizeText = (value) => String(value ?? '').trim();
const normalizeEmail = (value) => normalizeText(value).toLowerCase();
const REQUEST_ID_PATTERN = /^REQ-[A-Za-z0-9_-]{8,80}$/;

const serviceError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'RentalRequestWriteServiceError';
  error.code = code;
  error.status = status;
  return error;
};

const requestIdFromDocument = (document) => {
  const path = normalizeText(document?.name);
  return path ? decodeURIComponent(path.split('/').at(-1) || '') : '';
};

export const createRentalRequestWriteService = ({
  userRepository,
  firebaseLinkRepository,
  memberRepository,
  rentalRequestWriteRepository,
  postgresSource,
}) => {
  if (!userRepository || typeof userRepository.findByClerkUserId !== 'function') throw new TypeError('userRepository is required.');
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.findByAppUserId !== 'function') throw new TypeError('firebaseLinkRepository is required.');
  if (!memberRepository || typeof memberRepository.findByAppUserId !== 'function') throw new TypeError('memberRepository is required.');
  if (!rentalRequestWriteRepository || typeof rentalRequestWriteRepository.createAuthoritative !== 'function') throw new TypeError('rentalRequestWriteRepository is required.');
  if (!postgresSource || typeof postgresSource.getPublicConfig !== 'function' || typeof postgresSource.getRentalAsset !== 'function') throw new TypeError('postgresSource is required.');
  const sourceClient = postgresSource;

  const resolveContext = async (clerkUserId, firebaseIdentity) => {
    const appUser = await userRepository.findByClerkUserId(clerkUserId);
    if (!appUser) throw serviceError('profile_not_synced', 'Application user identity is not synchronized.', 404);
    const firebaseLink = await firebaseLinkRepository.findByAppUserId(appUser.id);
    if (!firebaseLink) throw serviceError('legacy_link_not_found', 'Firebase legacy identity has not been linked.', 404);
    const memberAccount = await memberRepository.findByAppUserId(appUser.id);
    if (!memberAccount) throw serviceError('member_account_not_found', 'Member account has not been synchronized.', 404);
    const tokenUid = normalizeText(firebaseIdentity?.uid);
    if (!tokenUid) throw serviceError('firebase_identity_missing', 'Verified identity bridge UID is required.', 401);
    if (tokenUid !== firebaseLink.firebaseUid) throw serviceError('legacy_link_token_mismatch', 'Firebase token does not match the linked legacy identity.', 409);
    const tokenEmail = normalizeEmail(firebaseIdentity?.email);
    const linkedEmail = normalizeEmail(firebaseLink.firebaseEmail);
    if (tokenEmail && linkedEmail && tokenEmail !== linkedEmail) throw serviceError('firebase_link_email_mismatch', 'Firebase token email does not match the linked identity.', 409);
    if (normalizeText(memberAccount.status) !== 'active') throw serviceError('rental_request_member_inactive', 'Only active member accounts can create rental requests.', 403);
    return { appUser, firebaseLink, memberAccount };
  };

  const normalizeInput = (input = {}) => {
    const requestId = normalizeText(input.requestId);
    const idempotencyKey = normalizeText(input.idempotencyKey || requestId);
    const laptopId = normalizeText(input.laptopId);
    const startDate = normalizeText(input.startDate);
    const dueDate = normalizeText(input.dueDate);
    const purpose = normalizeText(input.purpose);
    if (!REQUEST_ID_PATTERN.test(requestId)) throw serviceError('rental_request_id_invalid', 'Rental request ID has an invalid format.', 400);
    if (!idempotencyKey || idempotencyKey.length > 160) throw serviceError('rental_request_idempotency_invalid', 'Rental request idempotency key is invalid.', 400);
    if (!laptopId || laptopId.length > 160) throw serviceError('rental_request_asset_invalid', 'Rental asset ID is required.', 400);
    if (purpose.length > 2000) throw serviceError('rental_request_purpose_too_long', 'Rental request purpose is too long.', 400);
    return Object.freeze({ requestId, idempotencyKey, laptopId, startDate, dueDate, purpose });
  };

  return Object.freeze({
    async createCurrent(clerkUserId, firebaseIdentity, input) {
      const normalized = normalizeInput(input);
      const { appUser, firebaseLink, memberAccount } = await resolveContext(clerkUserId, firebaseIdentity);

      const [publicConfigDocument, assetDocument] = await Promise.all([
        sourceClient.getPublicConfig(),
        sourceClient.getRentalAsset({ assetId: normalized.laptopId }),
      ]);
      if (!assetDocument) throw serviceError('rental_request_asset_not_found', 'Selected rental asset was not found.', 404);
      if (!publicConfigDocument) throw serviceError('rental_request_public_config_not_found', 'Rental public configuration was not found.', 503);

      const settings = publicConfigDocument.fields?.settings && typeof publicConfigDocument.fields.settings === 'object'
        ? publicConfigDocument.fields.settings
        : {};
      const period = validateRequestedPeriod({
        startDate: normalized.startDate,
        dueDate: normalized.dueDate,
        settings,
        today: koreaToday(),
      });

      const assetFields = assetDocument.fields || {};
      const assetId = requestIdFromDocument(assetDocument) || normalized.laptopId;
      if (assetId !== normalized.laptopId) throw serviceError('rental_request_asset_identity_mismatch', 'Rental asset identity does not match the requested asset.', 409);
      if (normalizeText(assetFields.status) === '대여불가') throw serviceError('rental_request_asset_unavailable', 'Selected rental asset is unavailable.', 409);
      const sourceReservations = normalizeAssetReservationsForWrite(assetFields.reservations || []);
      const sourceConflict = findBlockingReservation({
        reservations: sourceReservations,
        laptopId: assetId,
        startDate: period.startDate,
        dueDate: period.dueDate,
        settings,
      });
      if (sourceConflict) {
        const conflict = serviceError('rental_request_asset_conflict', 'Selected rental asset is already reserved.', 409);
        conflict.blockingRequest = sourceConflict;
        throw conflict;
      }

      const requesterEmail = normalizeText(firebaseIdentity.email || memberAccount.email || firebaseLink.firebaseEmail);
      const requesterName = normalizeText(memberAccount.name);
      const requesterTeam = normalizeText(memberAccount.team);
      if (!requesterEmail || !requesterName || !requesterTeam) {
        throw serviceError('rental_request_member_profile_incomplete', 'Member email, name, and team are required.', 409);
      }

      const assetCategory = normalizeText(assetFields.category || '노트북') || '노트북';
      const assetNo = normalizeText(assetFields.assetNo);
      if (!assetNo) throw serviceError('rental_request_asset_number_missing', 'Selected rental asset is missing its asset number.', 409);
      const requestedAtText = koreaRequestedAtText();
      const availability = Object.freeze({
        id: normalized.requestId,
        laptopId: assetId,
        assetCategory,
        assetNo,
        startDate: period.startDate,
        dueDate: period.dueDate,
        status: '신청중',
      });
      const result = await rentalRequestWriteRepository.createAuthoritative({
        appUserId: appUser.id,
        firebaseUid: firebaseLink.firebaseUid,
        requesterEmail,
        requesterName,
        requesterTeam,
        requestId: normalized.requestId,
        idempotencyKey: normalized.idempotencyKey,
        laptopId: assetId,
        assetCategory,
        assetNo,
        startDate: period.startDate,
        dueDate: period.dueDate,
        purpose: normalized.purpose,
        requestedAtText,
        allowNonOverlappingSameAssetRequests: Boolean(settings.allowNonOverlappingSameAssetRequests ?? false),
        referenceDate: koreaToday(),
        overdueRentalBlockEnabled: Boolean(settings.overdueRentalBlockEnabled ?? false),
        postOverduePenaltyEnabled: Boolean(settings.postOverduePenaltyEnabled ?? false),
      });

      return Object.freeze({
        request: result.request,
        availability,
        reused: result.reused,
        shadowSynchronized: true,
        authority: 'postgresql',
        transactionSource: 'postgresql',
        firestoreMirror: 'retired',
      });
    },
  });
};
