import { createHash } from 'node:crypto';

const normalizeText = (value) => String(value ?? '').trim();
const normalizeEmail = (value) => normalizeText(value).toLowerCase();
const asArray = (value) => (Array.isArray(value) ? value : []);
const asObjectOrNull = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const asTimestamp = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
};
const hashPayload = (value) => createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
const serviceError = (code, message) => {
  const error = new Error(message);
  error.name = 'RentalRequestServiceError';
  error.code = code;
  return error;
};

const requestIdFromDocument = (document) => {
  const path = normalizeText(document?.name);
  return path ? decodeURIComponent(path.split('/').at(-1) || '') : '';
};

const normalizeSourceRequest = (document) => {
  const payload = { ...(document?.fields || {}) };
  const id = normalizeText(payload.id) || requestIdFromDocument(document);
  if (!id) throw serviceError('rental_request_source_id_missing', 'Firestore rental request is missing its request ID.');

  const normalized = {
    id,
    requesterUid: normalizeText(payload.requesterUid),
    requesterEmail: normalizeEmail(payload.requesterEmail),
    requesterName: normalizeText(payload.requesterName),
    requesterTeam: normalizeText(payload.requesterTeam),
    team: normalizeText(payload.team),
    borrower: normalizeText(payload.borrower),
    laptopId: normalizeText(payload.laptopId),
    assetCategory: normalizeText(payload.assetCategory),
    assetNo: normalizeText(payload.assetNo),
    startDate: normalizeText(payload.startDate),
    dueDate: normalizeText(payload.dueDate),
    purpose: normalizeText(payload.purpose),
    status: normalizeText(payload.status),
    adminMemo: normalizeText(payload.adminMemo),
    extensionCount: Number.isFinite(Number(payload.extensionCount)) ? Number(payload.extensionCount) : 0,
    lastExtensionApprovedDate: normalizeText(payload.lastExtensionApprovedDate),
    nextExtensionRequestDate: normalizeText(payload.nextExtensionRequestDate),
    extensionHistory: asArray(payload.extensionHistory),
    userActionRequest: asObjectOrNull(payload.userActionRequest),
    requestedAt: normalizeText(payload.requestedAt),
    returnedAt: asTimestamp(payload.returnedAt),
    overduePenaltyPending: Boolean(payload.overduePenaltyPending),
    overduePenaltyBatchId: normalizeText(payload.overduePenaltyBatchId),
    syncedAt: asTimestamp(payload.syncedAt),
    createdAt: asTimestamp(payload.createdAt || document?.createTime),
    updatedAt: asTimestamp(payload.updatedAt || document?.updateTime),
    sourceDocumentPath: normalizeText(document?.name),
  };

  if (!normalized.requesterUid) {
    throw serviceError('rental_request_requester_uid_missing', `Rental request ${id} is missing requesterUid.`);
  }

  return Object.freeze({ ...normalized, sourceHash: hashPayload(normalized) });
};

const sortRequests = (requests) => [...requests].sort((left, right) => {
  const leftTime = Date.parse(left.createdAt || '') || 0;
  const rightTime = Date.parse(right.createdAt || '') || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(right.id || '').localeCompare(String(left.id || ''));
});

const collectionHash = (requests) => hashPayload(sortRequests(requests).map((request) => ({ id: request.id, sourceHash: request.sourceHash })));

export const createRentalRequestService = ({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  rentalRequestRepository,
  firestoreRentalRequestsClient,
  useAuthoritativeSource = false,
}) => {
  if (!userRepository || typeof userRepository.findByClerkUserId !== 'function') throw new TypeError('userRepository is required.');
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.findByAppUserId !== 'function') throw new TypeError('firebaseLinkRepository is required.');
  if (!memberShadowRepository || typeof memberShadowRepository.findByAppUserId !== 'function') throw new TypeError('memberShadowRepository is required.');
  if (!rentalRequestRepository || typeof rentalRequestRepository.listByAppUserId !== 'function' || typeof rentalRequestRepository.replaceForAppUser !== 'function' || typeof rentalRequestRepository.getSyncState !== 'function') throw new TypeError('rentalRequestRepository is required.');
  if (useAuthoritativeSource && typeof rentalRequestRepository.listAuthoritativeByAppUserId !== 'function') throw new TypeError('rentalRequestRepository.listAuthoritativeByAppUserId is required when PostgreSQL authoritative read is enabled.');
  if (!useAuthoritativeSource && (!firestoreRentalRequestsClient || typeof firestoreRentalRequestsClient.listOwnRentalRequests !== 'function')) throw new TypeError('Legacy rental request source client is required only when PostgreSQL authoritative read is disabled.');

  const context = async (clerkUserId, { requireMemberShadow = true } = {}) => {
    const appUser = await userRepository.findByClerkUserId(clerkUserId);
    if (!appUser) throw serviceError('profile_not_synced', 'Application user identity is not synchronized.');
    const firebaseLink = await firebaseLinkRepository.findByAppUserId(appUser.id);
    if (!firebaseLink) throw serviceError('legacy_link_not_found', 'Firebase legacy identity has not been linked.');
    if (!requireMemberShadow) return { appUser, firebaseLink, memberShadow: null };
    const memberShadow = await memberShadowRepository.findByAppUserId(appUser.id);
    if (!memberShadow) throw serviceError('member_shadow_not_found', 'Member profile shadow has not been synchronized.');
    return { appUser, firebaseLink, memberShadow };
  };

  const verifyFirebaseIdentity = ({ firebaseIdentity, firebaseLink }) => {
    const tokenUid = normalizeText(firebaseIdentity?.uid);
    if (!tokenUid || !firebaseIdentity?.idToken) throw serviceError('firebase_identity_missing', 'Verified Firebase identity is required.');
    if (tokenUid !== firebaseLink.firebaseUid) throw serviceError('legacy_link_token_mismatch', 'Firebase token does not match the linked legacy identity.');
    const tokenEmail = normalizeEmail(firebaseIdentity?.email);
    const linkedEmail = normalizeEmail(firebaseLink.firebaseEmail);
    if (tokenEmail && linkedEmail && tokenEmail !== linkedEmail) throw serviceError('firebase_link_email_mismatch', 'Firebase token email does not match the linked identity.');
  };

  const readSource = async ({ firebaseIdentity, firebaseLink, memberShadow }) => {
    verifyFirebaseIdentity({ firebaseIdentity, firebaseLink });
    const requesterUids = [...new Set([
      firebaseLink.firebaseUid,
      ...asArray(memberShadow.previousAccountUids).map(normalizeText).filter(Boolean),
    ])];
    const requesterEmail = normalizeEmail(firebaseIdentity.email || memberShadow.email || firebaseLink.firebaseEmail);
    const documents = await firestoreRentalRequestsClient.listOwnRentalRequests({
      requesterUids,
      requesterEmail,
      firebaseIdToken: firebaseIdentity.idToken,
    });
    const requests = sortRequests(documents.map(normalizeSourceRequest));
    return Object.freeze({ requests, requesterUids, requesterEmail, sourceHash: collectionHash(requests) });
  };

  const readAuthoritativeCurrent = async (appUser, firebaseLink) => {
    const requests = await rentalRequestRepository.listAuthoritativeByAppUserId(appUser.id);
    return Object.freeze({
      appUser,
      firebaseLink,
      syncState: Object.freeze({
        appUserId: String(appUser.id),
        firebaseUid: firebaseLink.firebaseUid,
        sourceRequestCount: requests.length,
        sourceHash: 'postgresql-authoritative',
        syncedAt: requests[0]?.updatedAt || null,
        sourceMode: 'postgresql-authoritative',
      }),
      requests: sortRequests(requests),
    });
  };

  return Object.freeze({
    async getCurrent(clerkUserId) {
      const { appUser, firebaseLink } = await context(clerkUserId, {
        requireMemberShadow: !useAuthoritativeSource,
      });
      if (useAuthoritativeSource) {
        return readAuthoritativeCurrent(appUser, firebaseLink);
      }
      const syncState = await rentalRequestRepository.getSyncState(appUser.id);
      if (!syncState) throw serviceError('rental_request_shadow_not_synced', 'Rental request shadow has not been synchronized yet.');
      const requests = await rentalRequestRepository.listByAppUserId(appUser.id);
      return Object.freeze({ appUser, firebaseLink, syncState, requests: sortRequests(requests) });
    },

    async syncCurrent(clerkUserId, firebaseIdentity) {
      const { appUser, firebaseLink, memberShadow } = await context(clerkUserId, {
        requireMemberShadow: !useAuthoritativeSource,
      });
      if (useAuthoritativeSource) {
        return readAuthoritativeCurrent(appUser, firebaseLink);
      }
      const source = await readSource({ firebaseIdentity, firebaseLink, memberShadow });
      const syncState = await rentalRequestRepository.replaceForAppUser({
        appUserId: appUser.id,
        firebaseUid: firebaseLink.firebaseUid,
        requests: source.requests,
        sourceHash: source.sourceHash,
      });
      const requests = await rentalRequestRepository.listByAppUserId(appUser.id);
      return Object.freeze({ appUser, firebaseLink, syncState, requests: sortRequests(requests), source });
    },

    async compareCurrent(clerkUserId, firebaseIdentity) {
      if (useAuthoritativeSource) {
        const { appUser, firebaseLink } = await context(clerkUserId, { requireMemberShadow: false });
        const current = await readAuthoritativeCurrent(appUser, firebaseLink);
        return Object.freeze({
          equivalent: true,
          sourceCount: current.requests.length,
          shadowCount: current.requests.length,
          sourceHash: 'postgresql-authoritative',
          shadowHash: 'postgresql-authoritative',
          syncHash: 'postgresql-authoritative',
          changedRequestIds: [],
          syncedAt: current.syncState.syncedAt,
          source: 'postgresql-authoritative',
        });
      }
      const { appUser, firebaseLink, memberShadow } = await context(clerkUserId);
      const syncState = await rentalRequestRepository.getSyncState(appUser.id);
      if (!syncState) throw serviceError('rental_request_shadow_not_synced', 'Rental request shadow has not been synchronized yet.');
      const source = await readSource({ firebaseIdentity, firebaseLink, memberShadow });
      const shadow = sortRequests(await rentalRequestRepository.listByAppUserId(appUser.id));
      const shadowHash = collectionHash(shadow);
      const sourceIds = source.requests.map((request) => request.id);
      const shadowIds = shadow.map((request) => request.id);
      const changedRequestIds = [];
      const shadowById = new Map(shadow.map((request) => [request.id, request]));
      for (const request of source.requests) {
        if (shadowById.get(request.id)?.sourceHash !== request.sourceHash) changedRequestIds.push(request.id);
      }
      for (const id of shadowIds) {
        if (!sourceIds.includes(id)) changedRequestIds.push(id);
      }
      return Object.freeze({
        equivalent: source.sourceHash === syncState.sourceHash && changedRequestIds.length === 0,
        sourceCount: source.requests.length,
        shadowCount: shadow.length,
        sourceHash: source.sourceHash,
        shadowHash,
        syncHash: syncState.sourceHash,
        changedRequestIds: [...new Set(changedRequestIds)],
        syncedAt: syncState.syncedAt,
      });
    },
  });
};
