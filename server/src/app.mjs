import { randomUUID } from 'node:crypto';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const writeJson = (response, statusCode, payload, extraHeaders = {}) => {
  response.writeHead(statusCode, { ...JSON_HEADERS, ...extraHeaders });
  response.end(JSON.stringify(payload));
};


const readJsonBody = async (request, { maxBytes = 32 * 1024 } = {}) => {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body is too large.');
      error.code = 'request_body_too_large';
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must contain valid JSON.');
    error.code = 'invalid_json_body';
    error.status = 400;
    throw error;
  }
};

const buildCorsHeaders = (request, allowedOrigins) => {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) {
    return { Vary: 'Origin' };
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Request-Id,X-Firebase-Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
};

const writeUnauthorized = (response, basePayload, headers) => {
  writeJson(
    response,
    401,
    {
      ...basePayload,
      authenticated: false,
      error: 'unauthorized',
    },
    { ...headers, 'WWW-Authenticate': 'Bearer' },
  );
};

const sanitizeUserIdentity = (user) => ({
  id: user.id,
  clerkUserId: user.clerkUserId,
  primaryEmail: user.primaryEmail,
  primaryEmailVerified: user.primaryEmailVerified,
  displayName: user.displayName,
  firstName: user.firstName,
  lastName: user.lastName,
  imageUrl: user.imageUrl,
  lastSyncedAt: user.lastSyncedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const sanitizeFirebaseLink = (link) => ({
  appUserId: link.appUserId,
  firebaseUid: link.firebaseUid,
  firebaseEmail: link.firebaseEmail,
  firebaseEmailVerified: link.firebaseEmailVerified,
  firebaseSignInProvider: link.firebaseSignInProvider,
  linkedAt: link.linkedAt,
  lastVerifiedAt: link.lastVerifiedAt,
  updatedAt: link.updatedAt,
});

const sanitizeMemberShadow = (shadow) => ({
  appUserId: shadow.appUserId,
  firebaseUid: shadow.firebaseUid,
  uid: shadow.uid,
  email: shadow.email,
  maskedEmail: shadow.maskedEmail,
  name: shadow.name,
  team: shadow.team,
  phone: shadow.phone,
  status: shadow.status,
  directoryMemberId: shadow.directoryMemberId,
  directoryVerifiedVersion: shadow.directoryVerifiedVersion,
  profileRequiredReason: shadow.profileRequiredReason,
  rejoinedAccount: shadow.rejoinedAccount,
  termsConsentRevision: shadow.termsConsentRevision,
  termsConsentPolicyVersion: shadow.termsConsentPolicyVersion,
  identityKey: shadow.identityKey,
  recoveryKey: shadow.recoveryKey,
  previousAccountUids: shadow.previousAccountUids,
  authorityMode: shadow.authorityMode || 'firestore-shadow',
  mirrorState: shadow.mirrorState || 'synced',
  lastMutationId: shadow.lastMutationId || '',
  authoritativeUpdatedAt: shadow.authoritativeUpdatedAt || null,
  sourceHash: shadow.sourceHash,
  sourceCreatedAt: shadow.sourceCreatedAt,
  sourceUpdatedAt: shadow.sourceUpdatedAt,
  syncedAt: shadow.syncedAt,
  updatedAt: shadow.updatedAt,
});

const sanitizeMemberComparison = (comparison) => ({
  equivalent: Boolean(comparison.equivalent),
  sourceHash: comparison.sourceHash,
  shadowHash: comparison.shadowHash,
  changedFields: comparison.changedFields,
  sourceUpdatedAt: comparison.sourceUpdatedAt,
  shadowSyncedAt: comparison.shadowSyncedAt,
});

const sanitizeRentalRestrictionShadow = (shadow) => ({
  firebaseUid: shadow.firebaseUid,
  appUserId: shadow.appUserId,
  exists: Boolean(shadow.exists),
  restriction: shadow.exists ? shadow.restriction : null,
  sourceHash: shadow.sourceHash,
  sourceUpdatedAt: shadow.sourceUpdatedAt,
  authorityMode: shadow.authorityMode || 'firestore-shadow',
  mirrorState: shadow.mirrorState || 'synced',
  lastMutationId: shadow.lastMutationId || '',
  authoritativeUpdatedAt: shadow.authoritativeUpdatedAt || null,
  syncedAt: shadow.syncedAt,
});

const sanitizeRentalRequest = (request) => ({
  id: request.id,
  requesterUid: request.requesterUid,
  requesterEmail: request.requesterEmail,
  requesterName: request.requesterName,
  requesterTeam: request.requesterTeam,
  laptopId: request.laptopId,
  assetCategory: request.assetCategory,
  assetNo: request.assetNo,
  team: request.team,
  borrower: request.borrower,
  startDate: request.startDate,
  dueDate: request.dueDate,
  purpose: request.purpose,
  status: request.status,
  adminMemo: request.adminMemo,
  extensionCount: request.extensionCount,
  lastExtensionApprovedDate: request.lastExtensionApprovedDate,
  nextExtensionRequestDate: request.nextExtensionRequestDate,
  extensionHistory: request.extensionHistory,
  userActionRequest: request.userActionRequest,
  requestedAt: request.requestedAt,
  returnedAt: request.returnedAt,
  actualReturnDate: request.actualReturnDate || '',
  overdueDaysAtReturn: Number(request.overdueDaysAtReturn || 0),
  overduePenaltyPending: Boolean(request.overduePenaltyPending),
  overduePenaltyBatchId: request.overduePenaltyBatchId,
  syncedAt: request.syncedAt,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

const sanitizeRentalRequestCandidate = ({ requests, syncState }) => {
  const authoritative = syncState?.sourceMode === 'postgresql-authoritative';
  return {
    source: authoritative ? 'postgresql-authoritative' : 'postgresql-shadow',
    authoritative,
    requests: requests.map(sanitizeRentalRequest),
    count: requests.length,
    sourceHash: syncState.sourceHash,
    shadowSyncedAt: syncState.syncedAt,
  };
};

const sanitizeAssetCatalog = (catalog = {}) => ({
  source: catalog.source || 'postgresql',
  authoritative: Boolean(catalog.authoritative),
  synchronized: Boolean(catalog.synchronized),
  categories: Array.isArray(catalog.categories) ? catalog.categories : [],
  assets: Array.isArray(catalog.assets) ? catalog.assets : [],
  availability: Array.isArray(catalog.availability) ? catalog.availability : [],
  metrics: catalog.metrics || {},
  sync: catalog.sync || null,
});

const sanitizeMemberProfileReadCandidate = (shadow) => ({
  source: 'postgresql-shadow',
  authoritative: shadow.authorityMode === 'postgresql-authoritative',
  firebaseUid: shadow.firebaseUid,
  profile: {
    uid: shadow.uid,
    email: shadow.email,
    maskedEmail: shadow.maskedEmail,
    name: shadow.name,
    team: shadow.team,
    phone: shadow.phone,
    status: shadow.status,
    directoryMemberId: shadow.directoryMemberId,
    directoryVerifiedVersion: shadow.directoryVerifiedVersion,
    profileRequiredReason: shadow.profileRequiredReason,
    rejoinedAccount: shadow.rejoinedAccount,
    termsConsentRevision: shadow.termsConsentRevision,
    termsConsentPolicyVersion: shadow.termsConsentPolicyVersion,
    identityKey: shadow.identityKey,
    recoveryKey: shadow.recoveryKey,
    previousAccountUids: shadow.previousAccountUids,
  },
  sourceHash: shadow.sourceHash,
  sourceUpdatedAt: shadow.sourceUpdatedAt,
  shadowSyncedAt: shadow.syncedAt,
});

export const createRequestHandler = ({
  config,
  databaseCheck,
  authenticateRequest,
  authenticateFirebaseRequest,
  userIdentityService,
  firebaseLinkService,
  memberShadowService,
  memberAuthorityService = {
    async editSelf() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async editAdmin() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async changeStatusAdmin() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async bootstrapAdminRegistry() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
  },
  accountRecoveryService = {
    async findEmail() { const error = new Error('Account recovery service is not configured.'); error.code = 'account_recovery_not_configured'; throw error; },
    async verifyPasswordReset() { const error = new Error('Account recovery service is not configured.'); error.code = 'account_recovery_not_configured'; throw error; },
  },
  adminClerkAuthService = {
    async getCurrent() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async migrateCurrent() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async provisionTarget() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
  },
  userClerkAuthService = {
    async getCurrent() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async migrateCurrent() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async provisionCurrent() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async verifyPassword() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async changePassword() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async finalizeWithdrawal() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
  },
  rentalRestrictionService = {
    async getCurrentByFirebaseIdentity() { const error = new Error('Rental restriction service is not configured.'); error.code = 'rental_restriction_not_configured'; throw error; },
    async readCurrentSourceByFirebaseIdentity() { const error = new Error('Rental restriction service is not configured.'); error.code = 'rental_restriction_not_configured'; throw error; },
    async syncLinkedFirebaseUid() { const error = new Error('Rental restriction service is not configured.'); error.code = 'rental_restriction_not_configured'; throw error; },
  },
  rentalRequestService = {
    async getCurrent() { const error = new Error('Rental request service is not configured.'); error.code = 'rental_request_not_configured'; throw error; },
    async syncCurrent() { const error = new Error('Rental request service is not configured.'); error.code = 'rental_request_not_configured'; throw error; },
    async compareCurrent() { const error = new Error('Rental request service is not configured.'); error.code = 'rental_request_not_configured'; throw error; },
  },
  rentalRequestWriteService = {
    async createCurrent() { const error = new Error('Rental request write service is not configured.'); error.code = 'rental_request_write_not_configured'; throw error; },
  },
  rentalRequestUserActionService = {
    async editCurrent() { const error = new Error('Rental request user action service is not configured.'); error.code = 'rental_request_user_action_not_configured'; throw error; },
    async cancelCurrent() { const error = new Error('Rental request user action service is not configured.'); error.code = 'rental_request_user_action_not_configured'; throw error; },
    async extendCurrent() { const error = new Error('Rental request user action service is not configured.'); error.code = 'rental_request_user_action_not_configured'; throw error; },
  },
  adminRentalRequestService = {
    async bootstrap() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
    async list() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
    async getDashboard() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
    async syncRequest() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
    async getEvents() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
    async editRequest() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
    async saveMemo() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
    async restoreStatus() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
    async reviewUserAction() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
    async changeStatus() { const error = new Error('Admin rental request service is not configured.'); error.code = 'admin_rental_request_not_configured'; throw error; },
  },
  assetService = {
    async getPublicCatalog() { const error = new Error('Asset service is not configured.'); error.code = 'asset_service_not_configured'; throw error; },
    async bootstrap() { const error = new Error('Asset service is not configured.'); error.code = 'asset_service_not_configured'; throw error; },
    async create() { const error = new Error('Asset service is not configured.'); error.code = 'asset_service_not_configured'; throw error; },
    async edit() { const error = new Error('Asset service is not configured.'); error.code = 'asset_service_not_configured'; throw error; },
    async delete() { const error = new Error('Asset service is not configured.'); error.code = 'asset_service_not_configured'; throw error; },
    async bulkCreate() { const error = new Error('Asset service is not configured.'); error.code = 'asset_service_not_configured'; throw error; },
    async saveCategories() { const error = new Error('Asset service is not configured.'); error.code = 'asset_service_not_configured'; throw error; },
  },
  siteContentService = {
    async getDomain() { const error = new Error('Site content service is not configured.'); error.code = 'site_content_not_configured'; throw error; },
    async syncDomain() { const error = new Error('Site content service is not configured.'); error.code = 'site_content_not_configured'; throw error; },
  },
  boardService = {
    async getStatus() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async listNotice() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async getNotice() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async incrementNoticeView() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async listFaq() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async bootstrap() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async saveNotice() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async deleteNotice() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async saveFaq() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async deleteFaq() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async saveConfig() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async saveFaqCategory() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
    async deleteFaqCategory() { const error = new Error('Board service is not configured.'); error.code = 'board_service_not_configured'; throw error; },
  },
}) => {
  if (typeof databaseCheck !== 'function') {
    throw new TypeError('databaseCheck must be a function.');
  }
  if (typeof authenticateRequest !== 'function') {
    throw new TypeError('authenticateRequest must be a function.');
  }
  if (typeof authenticateFirebaseRequest !== 'function') {
    throw new TypeError('authenticateFirebaseRequest must be a function.');
  }
  if (!userIdentityService || typeof userIdentityService.getCurrent !== 'function' || typeof userIdentityService.syncCurrent !== 'function') {
    throw new TypeError('userIdentityService getCurrent/syncCurrent methods are required.');
  }
  if (!firebaseLinkService || typeof firebaseLinkService.getCurrent !== 'function' || typeof firebaseLinkService.linkCurrent !== 'function') {
    throw new TypeError('firebaseLinkService getCurrent/linkCurrent methods are required.');
  }
  if (
    !memberShadowService ||
    typeof memberShadowService.getCurrent !== 'function' ||
    typeof memberShadowService.getCurrentByFirebaseIdentity !== 'function' ||
    typeof memberShadowService.readCurrentSourceByFirebaseIdentity !== 'function' ||
    typeof memberShadowService.syncLinkedFirebaseUid !== 'function' ||
    typeof memberShadowService.syncCurrent !== 'function' ||
    typeof memberShadowService.compareCurrent !== 'function'
  ) {
    throw new TypeError('memberShadowService getCurrent/getCurrentByFirebaseIdentity/readCurrentSourceByFirebaseIdentity/syncLinkedFirebaseUid/syncCurrent/compareCurrent methods are required.');
  }
  if (
    !memberAuthorityService ||
    typeof memberAuthorityService.editSelf !== 'function' ||
    typeof memberAuthorityService.editAdmin !== 'function' ||
    typeof memberAuthorityService.changeStatusAdmin !== 'function' ||
    typeof memberAuthorityService.bootstrapAdminRegistry !== 'function'
  ) {
    throw new TypeError('memberAuthorityService Phase 21 methods are required.');
  }
  if (config.memberStatusRestrictionWriteMirrorDisabled && typeof memberAuthorityService.listAdminMembers !== 'function') {
    throw new TypeError('memberAuthorityService Phase 30 listAdminMembers method is required when member status authority is enabled.');
  }
  if (
    !accountRecoveryService ||
    typeof accountRecoveryService.findEmail !== 'function' ||
    typeof accountRecoveryService.verifyPasswordReset !== 'function'
  ) {
    throw new TypeError('accountRecoveryService Phase 22 methods are required.');
  }
  if (
    !adminClerkAuthService ||
    typeof adminClerkAuthService.getCurrent !== 'function' ||
    typeof adminClerkAuthService.migrateCurrent !== 'function' ||
    typeof adminClerkAuthService.provisionTarget !== 'function'
  ) {
    throw new TypeError('adminClerkAuthService Phase 22 methods are required.');
  }
  if (
    !rentalRestrictionService ||
    typeof rentalRestrictionService.getCurrentByFirebaseIdentity !== 'function' ||
    typeof rentalRestrictionService.readCurrentSourceByFirebaseIdentity !== 'function' ||
    typeof rentalRestrictionService.syncLinkedFirebaseUid !== 'function'
  ) {
    throw new TypeError('rentalRestrictionService getCurrentByFirebaseIdentity/readCurrentSourceByFirebaseIdentity/syncLinkedFirebaseUid methods are required.');
  }
  if (
    !rentalRequestService ||
    typeof rentalRequestService.getCurrent !== 'function' ||
    typeof rentalRequestService.syncCurrent !== 'function' ||
    typeof rentalRequestService.compareCurrent !== 'function'
  ) {
    throw new TypeError('rentalRequestService getCurrent/syncCurrent/compareCurrent methods are required.');
  }
  if (!rentalRequestWriteService || typeof rentalRequestWriteService.createCurrent !== 'function') {
    throw new TypeError('rentalRequestWriteService createCurrent method is required.');
  }
  if (!rentalRequestUserActionService
    || typeof rentalRequestUserActionService.editCurrent !== 'function'
    || typeof rentalRequestUserActionService.cancelCurrent !== 'function'
    || typeof rentalRequestUserActionService.extendCurrent !== 'function') {
    throw new TypeError('rentalRequestUserActionService Phase 19 methods are required.');
  }
  if (
    !adminRentalRequestService ||
    typeof adminRentalRequestService.bootstrap !== 'function' ||
    typeof adminRentalRequestService.list !== 'function' ||
    typeof adminRentalRequestService.getDashboard !== 'function' ||
    typeof adminRentalRequestService.syncRequest !== 'function' ||
    typeof adminRentalRequestService.getEvents !== 'function' ||
    typeof adminRentalRequestService.editRequest !== 'function' ||
    typeof adminRentalRequestService.saveMemo !== 'function' ||
    typeof adminRentalRequestService.restoreStatus !== 'function' ||
    typeof adminRentalRequestService.reviewUserAction !== 'function' ||
    typeof adminRentalRequestService.changeStatus !== 'function'
  ) {
    throw new TypeError('adminRentalRequestService Phase 19 methods are required.');
  }
  if (!assetService
    || typeof assetService.getPublicCatalog !== 'function'
    || typeof assetService.bootstrap !== 'function'
    || typeof assetService.create !== 'function'
    || typeof assetService.edit !== 'function'
    || typeof assetService.delete !== 'function'
    || typeof assetService.bulkCreate !== 'function'
    || typeof assetService.saveCategories !== 'function') {
    throw new TypeError('assetService Phase 20 methods are required.');
  }
  if (!siteContentService
    || typeof siteContentService.getDomain !== 'function'
    || typeof siteContentService.syncDomain !== 'function') {
    throw new TypeError('siteContentService Phase 24 methods are required.');
  }
  if (!boardService
    || typeof boardService.getStatus !== 'function'
    || typeof boardService.listNotice !== 'function'
    || typeof boardService.getNotice !== 'function'
    || typeof boardService.incrementNoticeView !== 'function'
    || typeof boardService.listFaq !== 'function'
    || typeof boardService.bootstrap !== 'function'
    || typeof boardService.saveNotice !== 'function'
    || typeof boardService.deleteNotice !== 'function'
    || typeof boardService.saveFaq !== 'function'
    || typeof boardService.deleteFaq !== 'function'
    || typeof boardService.saveConfig !== 'function'
    || typeof boardService.saveFaqCategory !== 'function'
    || typeof boardService.deleteFaqCategory !== 'function') {
    throw new TypeError('boardService Phase 26 methods are required.');
  }


  const basePayload = {
    service: config.serviceName,
    environment: config.appEnv,
    version: config.serviceVersion,
    compatibility: {
      assetBoardWriteMirrorDisabled: Boolean(config.assetBoardWriteMirrorDisabled),
      retiredWriteMirrorDomains: [
        ...(config.assetBoardWriteMirrorDisabled ? ['assets', 'notice', 'faq'] : []),
        ...(config.rentalRequestWriteMirrorDisabled ? ['rental-requests'] : []),
        ...(config.memberStatusRestrictionWriteMirrorDisabled ? ['member-status', 'rental-restriction-status'] : []),
      ],
      rentalRequestWriteMirrorDisabled: Boolean(config.rentalRequestWriteMirrorDisabled),
      rentalTransactionSource: config.rentalRequestWriteMirrorDisabled ? 'postgresql' : 'firestore-compatibility-source',
      memberStatusRestrictionWriteMirrorDisabled: Boolean(config.memberStatusRestrictionWriteMirrorDisabled),
      memberStatusSource: config.memberStatusRestrictionWriteMirrorDisabled ? 'postgresql' : 'firestore-compatibility-source',
    },
  };

  const authenticate = async (request, response, headers, requestId) => {
    try {
      return await authenticateRequest(request);
    } catch (error) {
      console.warn('[auth] Clerk session rejected', {
        requestId,
        code: error?.code || 'authentication_failed',
      });
      writeUnauthorized(response, basePayload, headers);
      return null;
    }
  };


  const authenticateFirebase = async (request, response, headers, requestId) => {
    try {
      return await authenticateFirebaseRequest(request);
    } catch (error) {
      console.warn('[auth] Firebase session rejected', {
        requestId,
        code: error?.code || 'firebase_authentication_failed',
      });
      if (['firebase_certificates_unavailable', 'firebase_certificates_invalid'].includes(error?.code)) {
        writeJson(response, 503, { ...basePayload, error: 'legacy_firebase_verification_unavailable' }, headers);
      } else {
        writeJson(response, 401, { ...basePayload, authenticated: true, error: 'legacy_firebase_unauthorized' }, headers);
      }
      return null;
    }
  };

  const authenticateAdminAuthority = async (request, response, headers, requestId) => {
    const auth = await authenticate(request, response, headers, requestId);
    if (!auth) return null;
    const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
    if (!firebaseIdentity) return null;
    try {
      const adminAuth = await adminClerkAuthService.getCurrent({ clerkUserId: auth.userId });
      if (adminAuth.admin.firebaseUid !== firebaseIdentity.uid) {
        writeJson(response, 409, { ...basePayload, authenticated: true, error: 'admin_identity_mismatch' }, headers);
        return null;
      }
      return Object.freeze({ auth, firebaseIdentity, adminAuth });
    } catch (error) {
      writeJson(response, error?.status || 403, { ...basePayload, authenticated: true, error: error?.code || 'admin_authority_required' }, headers);
      return null;
    }
  };

  return async (request, response) => {
    const requestId = request.headers['x-request-id'] || randomUUID();
    const corsHeaders = buildCorsHeaders(request, config.corsAllowedOrigins);
    const headers = { ...corsHeaders, 'X-Request-Id': requestId };

    if (request.method === 'OPTIONS') {
      response.writeHead(204, headers);
      response.end();
      return;
    }

    const url = new URL(request.url || '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/') {
      writeJson(
        response,
        200,
        {
          ...basePayload,
          status: 'running',
          health: '/health',
          liveness: '/health/live',
          authSession: '/api/auth/session',
          currentUser: '/api/users/me',
          syncCurrentUser: '/api/users/me/sync',
          firebaseLink: '/api/users/me/legacy/firebase',
          memberShadow: '/api/users/me/legacy/member-shadow',
          memberProfileReadCandidate: '/api/users/me/member-profile-candidate',
          memberProfileCutoverCandidate: '/api/legacy/member-profile-cutover-candidate',
          memberProfileFirestoreFallback: '/api/legacy/member-profile-firestore-fallback',
          memberProfileWriteThrough: '/api/legacy/member-shadow/write-through',
          memberProfileAuthority: '/api/users/me/member-profile',
          adminMembers: '/api/admin/members',
          adminMemberProfileAuthority: '/api/admin/members/:uid/profile',
          adminMemberStatusAuthority: '/api/admin/members/:uid/status',
          adminIdentityRegistryBootstrap: '/api/admin/identity-registry/bootstrap',
          accountRecoveryEmail: '/api/account-recovery/email',
          accountRecoveryPasswordResetVerify: '/api/account-recovery/password-reset/verify',
          adminClerkSession: '/api/admin/auth/session',
          adminClerkMigration: '/api/admin/auth/migrate',
          adminClerkProvision: '/api/admin/identity-registry/:uid/provision',
          rentalRestrictionCandidate: '/api/legacy/rental-restriction-candidate',
          rentalRestrictionFallback: '/api/legacy/rental-restriction-firestore-fallback',
          rentalRestrictionWriteThrough: '/api/legacy/rental-restriction-shadow/write-through',
          rentalRequestCandidate: '/api/users/me/rental-requests',
          rentalRequestCreate: '/api/users/me/rental-requests',
          rentalRequestUserEdit: '/api/users/me/rental-requests/:id/edit',
          rentalRequestUserCancel: '/api/users/me/rental-requests/:id/cancel',
          rentalRequestUserExtend: '/api/users/me/rental-requests/:id/extend',
          rentalRequestShadowSync: '/api/users/me/legacy/rental-request-shadows/sync',
          rentalRequestShadowCompare: '/api/users/me/legacy/rental-request-shadows/compare',
          adminRentalRequestBootstrap: '/api/admin/rental-requests/bootstrap',
          adminRentalRequests: '/api/admin/rental-requests',
          adminRentalDashboard: '/api/admin/rental-dashboard',
          adminRentalRequestEvents: '/api/admin/rental-requests/:id/events',
          adminRentalRequestSync: '/api/admin/rental-requests/:id/sync',
          adminRentalRequestEdit: '/api/admin/rental-requests/:id/edit',
          adminRentalRequestMemo: '/api/admin/rental-requests/:id/memo',
          adminRentalRequestRestore: '/api/admin/rental-requests/:id/restore',
          adminRentalUserActionReview: '/api/admin/rental-requests/:id/user-action-review',
          assetCatalog: '/api/assets/catalog',
          adminAssetBootstrap: '/api/admin/assets/bootstrap',
          adminAssets: '/api/admin/assets',
          adminAssetBulk: '/api/admin/assets/bulk',
          adminAssetCategories: '/api/admin/assets/categories',
          siteContent: '/api/site-content/:domain',
          adminSiteContentSync: '/api/admin/site-content/:domain/sync',
          noticeBoard: '/api/boards/notice',
          noticePost: '/api/boards/notice/:id',
          noticeView: '/api/boards/notice/:id/view',
          faqBoard: '/api/boards/faq',
          adminBoardBootstrap: '/api/admin/boards/bootstrap',
          adminNoticeBoard: '/api/admin/boards/notice/*',
          adminFaqBoard: '/api/admin/boards/faq/*',
        },
        headers,
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health/live') {
      writeJson(
        response,
        200,
        {
          ...basePayload,
          status: 'ok',
          timestamp: new Date().toISOString(),
        },
        headers,
      );
      return;
    }

    if (
      request.method === 'GET' &&
      (url.pathname === '/health' || url.pathname === '/health/ready')
    ) {
      try {
        const database = await databaseCheck();
        writeJson(
          response,
          200,
          {
            ...basePayload,
            status: 'ok',
            database: {
              status: 'ok',
              latencyMs: database.latencyMs,
            },
            timestamp: new Date().toISOString(),
          },
          headers,
        );
      } catch (error) {
        console.error('[health] database readiness check failed', {
          requestId,
          name: error?.name,
          code: error?.code,
        });

        writeJson(
          response,
          503,
          {
            ...basePayload,
            status: 'unavailable',
            database: { status: 'unavailable' },
            timestamp: new Date().toISOString(),
          },
          headers,
        );
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/account-recovery/email') {
      let body;
      try {
        body = await readJsonBody(request);
        const result = await accountRecoveryService.findEmail(body || {});
        writeJson(response, 200, {
          ...basePayload,
          accountRecovery: {
            source: result.source || 'postgresql',
            found: Boolean(result.found),
            maskedEmail: result.found ? String(result.maskedEmail || '') : '',
          },
        }, headers);
      } catch (error) {
        console.warn('[account-recovery] email lookup failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'account_recovery_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/account-recovery/password-reset/verify') {
      let body;
      try {
        body = await readJsonBody(request);
        const result = await accountRecoveryService.verifyPasswordReset(body || {});
        writeJson(response, 200, {
          ...basePayload,
          accountRecovery: {
            source: result.source || 'postgresql',
            verified: Boolean(result.verified),
          },
        }, headers);
      } catch (error) {
        console.warn('[account-recovery] password reset verification failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'account_recovery_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users/auth/session') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const result = await userClerkAuthService.getCurrent({ clerkUserId: auth.userId });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          userAuthentication: {
            authority: result.authority,
            clerkUserId: result.clerkUser?.clerkUserId || auth.userId,
            firebaseUid: result.account?.firebaseUid || '',
            memberStatus: result.account?.memberStatus || '',
            authAuthorityMode: result.account?.authAuthorityMode || '',
            lifecycleAuthorityMode: result.account?.lifecycleAuthorityMode || '',
          },
        }, headers);
      } catch (error) {
        console.warn('[user-auth] Clerk user session rejected', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'user_clerk_auth_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/auth/migrate') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const body = await readJsonBody(request);
        const result = await userClerkAuthService.migrateCurrent({ firebaseIdentity, password: String(body?.password || '') });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          userAuthentication: {
            authority: result.authority,
            migration: result.migration,
            clerkUserId: result.clerkUser?.clerkUserId || '',
            firebaseUid: result.account?.firebaseUid || firebaseIdentity.uid,
            memberStatus: result.account?.memberStatus || '',
          },
        }, headers);
      } catch (error) {
        console.warn('[user-auth] Firebase user migration failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'user_clerk_migration_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/auth/provision') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const body = await readJsonBody(request);
        const result = await userClerkAuthService.provisionCurrent({ firebaseIdentity, password: String(body?.password || '') });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          userAuthentication: {
            authority: result.authority,
            provisioned: Boolean(result.provisioned),
            clerkUserId: result.clerkUser?.clerkUserId || '',
            firebaseUid: result.account?.firebaseUid || firebaseIdentity.uid,
            memberStatus: result.account?.memberStatus || '',
          },
        }, headers);
      } catch (error) {
        console.warn('[user-auth] signup Clerk provision failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'user_clerk_provision_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/password/verify') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const body = await readJsonBody(request);
        const result = await userClerkAuthService.verifyPassword({ clerkUserId: auth.userId, password: String(body?.password || '') });
        writeJson(response, 200, { ...basePayload, authenticated: true, passwordVerification: { authority: result.authority, verified: Boolean(result.verified) } }, headers);
      } catch (error) {
        console.warn('[user-auth] password verification failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 401, { ...basePayload, authenticated: true, error: error?.code || 'user_password_verification_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/password/change') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const body = await readJsonBody(request);
        const result = await userClerkAuthService.changePassword({
          clerkUserId: auth.userId,
          firebaseIdentity,
          currentPassword: String(body?.currentPassword || ''),
          newPassword: String(body?.newPassword || ''),
        });
        writeJson(response, 200, { ...basePayload, authenticated: true, passwordChange: { authority: result.authority, changed: Boolean(result.changed), firebaseUid: result.account?.firebaseUid || '' } }, headers);
      } catch (error) {
        console.warn('[user-auth] password authority change failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'user_password_change_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/withdrawal/finalize') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const body = await readJsonBody(request);
        const result = await userClerkAuthService.finalizeWithdrawal({ clerkUserId: auth.userId, firebaseIdentity, password: String(body?.password || '') });
        writeJson(response, 200, { ...basePayload, authenticated: true, withdrawal: { authority: result.authority, withdrawn: Boolean(result.withdrawn), clerkDeleted: Boolean(result.clerkDeleted), clerkCleanupError: result.clerkCleanupError || '', firebaseUid: result.account?.firebaseUid || firebaseIdentity.uid } }, headers);
      } catch (error) {
        console.warn('[user-auth] withdrawal finalization failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'user_withdrawal_finalize_failed' }, headers);
      }
      return;
    }

    const siteContentReadMatch = url.pathname.match(/^\/api\/site-content\/([^/]+)$/);
    if (request.method === 'GET' && siteContentReadMatch) {
      try {
        const content = await siteContentService.getDomain(decodeURIComponent(siteContentReadMatch[1]));
        writeJson(response, 200, { ...basePayload, siteContent: content }, headers);
      } catch (error) {
        console.warn('[site-content] PostgreSQL content read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'site_content_read_failed' }, headers);
      }
      return;
    }

    const adminSiteContentSyncMatch = url.pathname.match(/^\/api\/admin\/site-content\/([^/]+)\/sync$/);
    if (request.method === 'POST' && adminSiteContentSyncMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const adminAuth = await adminClerkAuthService.getCurrent({ clerkUserId: auth.userId });
        if (adminAuth.admin.firebaseUid !== firebaseIdentity.uid) {
          const mismatch = new Error('Firebase administrator compatibility identity does not match the Clerk registry.');
          mismatch.code = 'site_content_admin_identity_mismatch';
          mismatch.status = 409;
          throw mismatch;
        }
        const body = await readJsonBody(request, { maxBytes: 512 * 1024 });
        const content = await siteContentService.syncDomain({
          domain: decodeURIComponent(adminSiteContentSyncMatch[1]),
          documents: body?.documents,
          actorClerkUserId: auth.userId,
        });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, siteContent: content }, headers);
      } catch (error) {
        console.warn('[site-content] PostgreSQL content sync failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'site_content_sync_failed' }, headers);
      }
      return;
    }


    if (request.method === 'GET' && url.pathname === '/api/boards/status') {
      try {
        const status = await boardService.getStatus();
        if (!status) {
          writeJson(response, 404, { ...basePayload, error: 'board_not_bootstrapped' }, headers);
        } else {
          writeJson(response, 200, { ...basePayload, boardStatus: status }, headers);
        }
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'board_status_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/boards/notice') {
      try {
        const home = url.searchParams.get('home') === '1';
        const result = await boardService.listNotice({
          search: home ? '' : url.searchParams.get('search') || '',
          page: home ? 1 : url.searchParams.get('page') || '1',
          pageSize: home ? 6 : url.searchParams.get('pageSize') || '10',
          pinnedLimit: home ? 6 : 20,
        });
        writeJson(response, 200, { ...basePayload, board: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'notice_board_unavailable' }, headers);
      }
      return;
    }

    const noticePostReadMatch = request.method === 'GET' ? url.pathname.match(/^\/api\/boards\/notice\/([^/]+)$/) : null;
    if (noticePostReadMatch) {
      try {
        const post = await boardService.getNotice(decodeURIComponent(noticePostReadMatch[1]));
        writeJson(response, 200, { ...basePayload, boardPost: post }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'notice_post_unavailable' }, headers);
      }
      return;
    }

    const noticeViewMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/boards\/notice\/([^/]+)\/view$/) : null;
    if (noticeViewMatch) {
      try {
        const viewCount = await boardService.incrementNoticeView(decodeURIComponent(noticeViewMatch[1]));
        writeJson(response, 200, { ...basePayload, noticeView: { authority: 'postgresql', viewCount } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'notice_view_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/boards/faq') {
      try {
        const result = await boardService.listFaq({
          search: url.searchParams.get('search') || '',
          page: url.searchParams.get('page') || '1',
          pageSize: url.searchParams.get('pageSize') || '10',
          categoryId: url.searchParams.get('categoryId') || '',
          searchWithinCategory: url.searchParams.get('searchWithinCategory') === '1',
          pinnedLimit: 20,
        });
        writeJson(response, 200, { ...basePayload, board: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'faq_board_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/boards/bootstrap') {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await boardService.bootstrap(admin.firebaseIdentity, admin.auth.userId);
        writeJson(response, 200, {
          ...basePayload, authenticated: true, authorized: true,
          adminBoardBootstrap: {
            target: 'postgresql',
            noticeCount: result.noticeCount,
            faqCount: result.faqCount,
            faqCategoryCount: result.faqCategoryCount,
            status: result.status,
          },
        }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_board_bootstrap_unavailable' }, headers);
      }
      return;
    }

    const adminBoardConfigMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/boards\/(notice|faq)\/config$/) : null;
    if (adminBoardConfigMatch) {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      let body;
      try { body = await readJsonBody(request); }
      catch (error) { writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await boardService.saveConfig(admin.firebaseIdentity, adminBoardConfigMatch[1], body?.postsPerPage);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true,
          adminBoardMutation: { authority: result.authority, operation: 'config', boardType: adminBoardConfigMatch[1], firestoreMirror: result.firestoreMirror, config: result.config } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_board_config_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/boards/notice/posts') {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      let body;
      try { body = await readJsonBody(request, { maxBytes: 256 * 1024 }); }
      catch (error) { writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await boardService.saveNotice(admin.firebaseIdentity, admin.auth.userId, body?.post || body || {});
        writeJson(response, body?.post?.id || body?.id ? 200 : 201, { ...basePayload, authenticated: true, authorized: true,
          adminBoardMutation: { authority: result.authority, operation: body?.post?.id || body?.id ? 'edit' : 'create', boardType: 'notice', firestoreMirror: result.firestoreMirror, post: result.post } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_notice_save_unavailable' }, headers);
      }
      return;
    }

    const adminNoticeDeleteMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/boards\/notice\/posts\/([^/]+)\/delete$/) : null;
    if (adminNoticeDeleteMatch) {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await boardService.deleteNotice(admin.firebaseIdentity, decodeURIComponent(adminNoticeDeleteMatch[1]));
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true,
          adminBoardMutation: { authority: result.authority, operation: 'delete', boardType: 'notice', firestoreMirror: result.firestoreMirror, deletedPost: result.deletedPost } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_notice_delete_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/boards/faq/posts') {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      let body;
      try { body = await readJsonBody(request, { maxBytes: 256 * 1024 }); }
      catch (error) { writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await boardService.saveFaq(admin.firebaseIdentity, admin.auth.userId, body?.post || body || {});
        writeJson(response, body?.post?.id || body?.id ? 200 : 201, { ...basePayload, authenticated: true, authorized: true,
          adminBoardMutation: { authority: result.authority, operation: body?.post?.id || body?.id ? 'edit' : 'create', boardType: 'faq', firestoreMirror: result.firestoreMirror, post: result.post } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_faq_save_unavailable' }, headers);
      }
      return;
    }

    const adminFaqDeleteMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/boards\/faq\/posts\/([^/]+)\/delete$/) : null;
    if (adminFaqDeleteMatch) {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await boardService.deleteFaq(admin.firebaseIdentity, decodeURIComponent(adminFaqDeleteMatch[1]));
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true,
          adminBoardMutation: { authority: result.authority, operation: 'delete', boardType: 'faq', firestoreMirror: result.firestoreMirror, deletedPost: result.deletedPost } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_faq_delete_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/boards/faq/categories') {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      let body;
      try { body = await readJsonBody(request); }
      catch (error) { writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await boardService.saveFaqCategory(admin.firebaseIdentity, admin.auth.userId, body?.category || body || {});
        writeJson(response, body?.category?.id || body?.id ? 200 : 201, { ...basePayload, authenticated: true, authorized: true,
          adminBoardMutation: { authority: result.authority, operation: body?.category?.id || body?.id ? 'category-edit' : 'category-create', boardType: 'faq', firestoreMirror: result.firestoreMirror, category: result.category } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_faq_category_save_unavailable' }, headers);
      }
      return;
    }

    const adminFaqCategoryDeleteMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/boards\/faq\/categories\/([^/]+)\/delete$/) : null;
    if (adminFaqCategoryDeleteMatch) {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await boardService.deleteFaqCategory(admin.firebaseIdentity, decodeURIComponent(adminFaqCategoryDeleteMatch[1]));
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true,
          adminBoardMutation: { authority: result.authority, operation: 'category-delete', boardType: 'faq', firestoreMirror: result.firestoreMirror, deletedCategory: result.deletedCategory } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_faq_category_delete_unavailable', postCount: Number(error?.postCount || 0) }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/auth/session') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const result = await adminClerkAuthService.getCurrent({ clerkUserId: auth.userId });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminAuthentication: {
            authority: result.authority,
            firebaseUid: result.admin.firebaseUid,
            adminLoginId: result.admin.adminLoginId,
            authEmail: result.admin.authEmail,
            adminRole: result.admin.adminRole,
            clerkUserId: result.admin.clerkUserId,
            clerkLinkState: result.admin.clerkLinkState,
            authAuthorityMode: result.admin.authAuthorityMode,
          },
        }, headers);
      } catch (error) {
        console.warn('[admin-auth] Clerk administrator session rejected', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, {
          ...basePayload,
          authenticated: true,
          authorized: false,
          error: error?.code || 'admin_clerk_auth_unavailable',
        }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/auth/migrate') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try {
        body = await readJsonBody(request);
        const result = await adminClerkAuthService.migrateCurrent({
          firebaseIdentity,
          password: String(body?.password || ''),
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminAuthentication: {
            authority: result.authority,
            migration: result.migration,
            firebaseUid: result.admin.firebaseUid,
            adminLoginId: result.admin.adminLoginId,
            authEmail: result.admin.authEmail,
            adminRole: result.admin.adminRole,
            clerkUserId: result.admin.clerkUserId,
            clerkLinkState: result.admin.clerkLinkState,
            authAuthorityMode: result.admin.authAuthorityMode,
          },
        }, headers);
      } catch (error) {
        console.warn('[admin-auth] Firebase administrator migration failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_clerk_migration_failed' }, headers);
      }
      return;
    }

    const adminClerkProvisionMatch = url.pathname.match(/^\/api\/admin\/identity-registry\/([^/]+)\/provision$/);
    if (request.method === 'POST' && adminClerkProvisionMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try {
        body = await readJsonBody(request);
        const result = await adminClerkAuthService.provisionTarget({
          actorClerkUserId: auth.userId,
          firebaseIdentity,
          targetFirebaseUid: decodeURIComponent(adminClerkProvisionMatch[1]),
          password: String(body?.password || ''),
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminAuthentication: {
            authority: result.authority,
            provisioned: Boolean(result.provisioned),
            firebaseUid: result.admin.firebaseUid,
            adminLoginId: result.admin.adminLoginId,
            authEmail: result.admin.authEmail,
            adminRole: result.admin.adminRole,
            clerkUserId: result.admin.clerkUserId,
            clerkLinkState: result.admin.clerkLinkState,
            authAuthorityMode: result.admin.authAuthorityMode,
          },
        }, headers);
      } catch (error) {
        console.warn('[admin-auth] administrator provision failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_clerk_provision_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/session') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      writeJson(
        response,
        200,
        {
          ...basePayload,
          authenticated: true,
          session: {
            userId: auth.userId,
            sessionId: auth.sessionId,
            authorizedParty: auth.authorizedParty,
            status: auth.status,
            issuedAt: auth.issuedAt,
            expiresAt: auth.expiresAt,
          },
        },
        headers,
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users/me') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const user = await userIdentityService.getCurrent(auth.userId);
        if (!user) {
          writeJson(
            response,
            404,
            {
              ...basePayload,
              authenticated: true,
              error: 'profile_not_synced',
            },
            headers,
          );
          return;
        }

        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            user: sanitizeUserIdentity(user),
          },
          headers,
        );
      } catch (error) {
        console.error('[users] current identity lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        writeJson(response, 503, { ...basePayload, error: 'identity_store_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/sync') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const user = await userIdentityService.syncCurrent(auth.userId);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            synchronized: true,
            user: sanitizeUserIdentity(user),
          },
          headers,
        );
      } catch (error) {
        console.error('[users] Clerk identity synchronization failed', {
          requestId,
          code: error?.code,
          status: error?.status,
          name: error?.name,
        });
        const statusCode = ['clerk_api_timeout', 'clerk_api_unavailable', 'clerk_backend_not_configured'].includes(error?.code) ? 503 : 502;
        writeJson(response, statusCode, { ...basePayload, error: 'identity_sync_failed' }, headers);
      }
      return;
    }


    if (request.method === 'GET' && url.pathname === '/api/users/me/legacy/firebase') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const link = await firebaseLinkService.getCurrent(auth.userId);
        if (!link) {
          writeJson(
            response,
            404,
            { ...basePayload, authenticated: true, error: 'legacy_link_not_found' },
            headers,
          );
          return;
        }
        writeJson(
          response,
          200,
          { ...basePayload, authenticated: true, firebaseLink: sanitizeFirebaseLink(link) },
          headers,
        );
      } catch (error) {
        console.error('[legacy] Firebase link lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = error?.code === 'profile_not_synced' ? 409 : 503;
        const errorCode = error?.code === 'profile_not_synced' ? 'profile_not_synced' : 'legacy_link_store_unavailable';
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: errorCode }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/legacy/firebase') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const link = await firebaseLinkService.linkCurrent(auth.userId, firebaseIdentity);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            linked: true,
            firebaseLink: sanitizeFirebaseLink(link),
          },
          headers,
        );
      } catch (error) {
        console.warn('[legacy] Firebase identity link rejected', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        if (
          ['profile_not_synced', 'firebase_email_mismatch', 'firebase_link_user_conflict', 'firebase_link_uid_conflict'].includes(error?.code)
        ) {
          writeJson(response, 409, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        writeJson(response, 503, { ...basePayload, authenticated: true, error: 'legacy_link_store_unavailable' }, headers);
      }
      return;
    }






    if (request.method === 'GET' && url.pathname === '/api/assets/catalog') {
      try {
        const catalog = await assetService.getPublicCatalog();
        writeJson(response, 200, { ...basePayload, assetCatalog: sanitizeAssetCatalog(catalog) }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'asset_catalog_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/assets/bootstrap') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const result = await assetService.bootstrap(firebaseIdentity);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true,
          adminAssetBootstrap: { target: 'postgresql', assetCount: result.assetCount, categoryCount: result.categoryCount, catalog: sanitizeAssetCatalog(result.catalog) } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_asset_bootstrap_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/assets') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try { body = await readJsonBody(request); }
      catch (error) { writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await assetService.create(firebaseIdentity, body?.asset || body || {});
        writeJson(response, 201, { ...basePayload, authenticated: true, authorized: true,
          adminAssetMutation: { authority: result.authority, operation: 'create', firestoreMirror: result.firestoreMirror, asset: result.asset, catalog: sanitizeAssetCatalog(result.catalog) } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_asset_create_unavailable', assetNo: error?.assetNo || '', category: error?.category || '', blockingRequest: error?.blockingRequest || null }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/assets/bulk') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try { body = await readJsonBody(request, { maxBytes: 1024 * 1024 }); }
      catch (error) { writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await assetService.bulkCreate(firebaseIdentity, body?.assets || []);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true,
          adminAssetMutation: { authority: result.authority, operation: 'bulk-create', firestoreMirror: result.firestoreMirror, assets: result.assets, duplicateAssetNumbers: result.duplicateAssetNumbers, invalidCategories: result.invalidCategories, catalog: sanitizeAssetCatalog(result.catalog) } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_asset_bulk_unavailable', duplicateAssetNumbers: error?.duplicateAssetNumbers || [], invalidCategories: error?.invalidCategories || [] }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/assets/categories') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try { body = await readJsonBody(request); }
      catch (error) { writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await assetService.saveCategories(firebaseIdentity, body || {});
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true,
          adminAssetMutation: { authority: result.authority, operation: 'categories', firestoreMirror: result.firestoreMirror, catalog: sanitizeAssetCatalog(result.catalog) } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_asset_categories_unavailable', assetNo: error?.assetNo || '', category: error?.category || '', blockingRequest: error?.blockingRequest || null }, headers);
      }
      return;
    }

    const adminAssetActionMatch = request.method === 'POST'
      ? url.pathname.match(/^\/api\/admin\/assets\/([^/]+)\/(edit|delete)$/)
      : null;
    if (adminAssetActionMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body = {};
      if (adminAssetActionMatch[2] === 'edit') {
        try { body = await readJsonBody(request); }
        catch (error) { writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers); return; }
      }
      try {
        const assetId = decodeURIComponent(adminAssetActionMatch[1]);
        const result = adminAssetActionMatch[2] === 'edit'
          ? await assetService.edit(firebaseIdentity, assetId, body?.asset || body || {})
          : await assetService.delete(firebaseIdentity, assetId);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true,
          adminAssetMutation: { authority: result.authority, operation: adminAssetActionMatch[2], firestoreMirror: result.firestoreMirror,
            asset: result.asset || null, deletedAsset: result.deletedAsset || null, catalog: sanitizeAssetCatalog(result.catalog) } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || `admin_asset_${adminAssetActionMatch[2]}_unavailable`, assetNo: error?.assetNo || '', category: error?.category || '', blockingRequest: error?.blockingRequest || null }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/rental-requests/bootstrap') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const result = await adminRentalRequestService.bootstrap(firebaseIdentity);
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminRentalRequestBootstrap: {
            source: 'firestore-admin-security-rules',
            target: 'postgresql',
            synchronized: result.synchronized,
            sourceCount: result.sourceCount,
            adminUid: result.admin.uid,
          },
        }, headers);
      } catch (error) {
        const code = error?.code || 'admin_rental_request_bootstrap_unavailable';
        const statusCode = error?.status || (String(code).includes('admin_') ? 403 : 503);
        console.warn('[admin-rental-request] bootstrap failed', { requestId, code });
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: code }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/rental-requests') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const result = await adminRentalRequestService.list(firebaseIdentity, {
          tab: url.searchParams.get('tab') || 'pending',
          quickFilter: url.searchParams.get('quickFilter') || 'all',
          query: url.searchParams.get('query') || '',
          page: url.searchParams.get('page') || '1',
          pageSize: url.searchParams.get('pageSize') || '10',
          referenceDate: url.searchParams.get('referenceDate') || '',
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminRentalRequests: {
            source: 'postgresql',
            requests: result.requests.map(sanitizeRentalRequest),
            totalCount: result.totalCount,
            counts: result.counts,
            page: result.page,
            pageSize: result.pageSize,
            referenceDate: result.referenceDate,
          },
        }, headers);
      } catch (error) {
        const code = error?.code || 'admin_rental_request_read_unavailable';
        const statusCode = error?.status || 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: code }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/rental-dashboard') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const result = await adminRentalRequestService.getDashboard(
          firebaseIdentity,
          url.searchParams.get('referenceDate') || undefined,
        );
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminRentalDashboard: {
            source: 'postgresql',
            referenceDate: result.referenceDate,
            counts: result.counts,
          },
        }, headers);
      } catch (error) {
        const code = error?.code || 'admin_rental_dashboard_unavailable';
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: code }, headers);
      }
      return;
    }

    const adminRequestActionMatch = url.pathname.match(/^\/api\/admin\/rental-requests\/([^/]+)\/(sync|events|edit|memo|restore)$/);
    if (adminRequestActionMatch) {
      const action = adminRequestActionMatch[2];
      const isGet = request.method === 'GET' && action === 'events';
      const isPost = request.method === 'POST' && action !== 'events';
      if (isGet || isPost) {
        const auth = await authenticate(request, response, headers, requestId);
        if (!auth) return;
        const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
        if (!firebaseIdentity) return;
        const rentalRequestId = decodeURIComponent(adminRequestActionMatch[1]);
        let body = {};
        if (isPost && action !== 'sync') {
          try {
            body = await readJsonBody(request);
          } catch (error) {
            writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers);
            return;
          }
        }
        try {
          if (action === 'sync') {
            const result = await adminRentalRequestService.syncRequest(firebaseIdentity, rentalRequestId);
            writeJson(response, 200, {
              ...basePayload, authenticated: true, authorized: true,
              adminRentalRequestSync: {
                target: 'postgresql', synchronized: result.synchronized,
                eventCount: result.eventCount, request: sanitizeRentalRequest(result.request),
              },
            }, headers);
            return;
          }
          if (action === 'events') {
            const result = await adminRentalRequestService.getEvents(firebaseIdentity, rentalRequestId);
            writeJson(response, 200, {
              ...basePayload, authenticated: true, authorized: true,
              adminRentalRequestEvents: { source: 'postgresql', events: result.events },
            }, headers);
            return;
          }
          if (action === 'edit') {
            const result = await adminRentalRequestService.editRequest(firebaseIdentity, {
              requestId: rentalRequestId,
              form: body?.form || body || {},
            });
            writeJson(response, 200, {
              ...basePayload, authenticated: true, authorized: true,
              adminRentalRequestMutation: {
                authority: result.authority, operation: 'edit', firestoreMirror: result.firestoreMirror,
                request: sanitizeRentalRequest(result.request), availability: result.availability,
                asset: result.asset, dueDateAdjusted: result.dueDateAdjusted,
              },
            }, headers);
            return;
          }
          if (action === 'memo') {
            const result = await adminRentalRequestService.saveMemo(firebaseIdentity, {
              requestId: rentalRequestId, memo: body?.memo,
            });
            writeJson(response, 200, {
              ...basePayload, authenticated: true, authorized: true,
              adminRentalRequestMutation: {
                authority: result.authority, operation: 'memo', firestoreMirror: result.firestoreMirror,
                request: sanitizeRentalRequest(result.request), changed: result.changed,
              },
            }, headers);
            return;
          }
          if (action === 'restore') {
            const result = await adminRentalRequestService.restoreStatus(firebaseIdentity, {
              requestId: rentalRequestId, nextStatus: body?.status, restoreReason: body?.restoreReason,
            });
            writeJson(response, 200, {
              ...basePayload, authenticated: true, authorized: true,
              adminRentalRequestMutation: {
                authority: result.authority, operation: 'restore', firestoreMirror: result.firestoreMirror,
                request: sanitizeRentalRequest(result.request), availability: result.availability, asset: result.asset,
              },
            }, headers);
            return;
          }
        } catch (error) {
          const code = error?.code || `admin_rental_request_${action}_unavailable`;
          const statusCode = error?.status
            || (['invalid_rental_status_transition', 'rental_period_conflict'].includes(code) ? 409
              : ['rental_request_not_found', 'rental_asset_not_found'].includes(code) ? 404
              : ['required_rental_edit_fields_missing', 'invalid_rental_edit_period', 'restore_reason_missing'].includes(code) ? 400
              : 503);
          writeJson(response, statusCode, {
            ...basePayload, authenticated: true, error: code,
            blockingRequest: error?.blockingRequest || null,
            previousStatus: error?.previousStatus || null,
            nextStatus: error?.nextStatus || null,
          }, headers);
          return;
        }
      }
    }

    const adminUserActionReviewMatch = request.method === 'POST'
      ? url.pathname.match(/^\/api\/admin\/rental-requests\/([^/]+)\/user-action-review$/)
      : null;
    if (adminUserActionReviewMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers);
        return;
      }
      try {
        const result = await adminRentalRequestService.reviewUserAction(firebaseIdentity, {
          requestId: decodeURIComponent(adminUserActionReviewMatch[1]),
          approved: Boolean(body?.approved),
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminRentalRequestMutation: {
            authority: result.authority,
            operation: result.operation,
            userActionType: result.actionType,
            approved: result.approved,
            firestoreMirror: result.firestoreMirror,
            request: sanitizeRentalRequest(result.request),
            availability: result.availability,
            asset: result.asset,
            restrictionUpdated: result.restrictionUpdated,
          },
        }, headers);
      } catch (error) {
        const code = error?.code || 'admin_rental_user_action_review_unavailable';
        const statusCode = error?.status || (['user_action_request_not_pending','invalid_user_action_request_status','user_action_period_conflict','rental_extension_period_conflict','rental_extension_count_exceeded','rental_extension_too_early','rental_extension_disabled'].includes(code) ? 409 : 503);
        writeJson(response, statusCode, {
          ...basePayload, authenticated: true, error: code,
          blockingRequest: error?.blockingRequest || null,
          availableDate: error?.availableDate || null,
        }, headers);
      }
      return;
    }

    const adminStatusMatch = request.method === 'POST'
      ? url.pathname.match(/^\/api\/admin\/rental-requests\/([^/]+)\/status$/)
      : null;
    if (adminStatusMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers);
        return;
      }
      try {
        const result = await adminRentalRequestService.changeStatus(firebaseIdentity, {
          requestId: decodeURIComponent(adminStatusMatch[1]),
          nextStatus: body?.status,
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminRentalRequestMutation: {
            authority: result.authority,
            firestoreMirror: result.firestoreMirror,
            request: sanitizeRentalRequest(result.request),
            availability: result.availability,
            asset: result.asset,
            restrictionUpdated: result.restrictionUpdated,
          },
        }, headers);
      } catch (error) {
        const code = error?.code || 'admin_rental_status_change_unavailable';
        const statusCode = error?.status
          || (['invalid_rental_status_transition', 'rental_period_conflict'].includes(code) ? 409
            : ['rental_request_not_found', 'rental_asset_not_found'].includes(code) ? 404
            : 503);
        writeJson(response, statusCode, {
          ...basePayload,
          authenticated: true,
          error: code,
          blockingRequest: error?.blockingRequest || null,
          previousStatus: error?.previousStatus || null,
          nextStatus: error?.nextStatus || null,
        }, headers);
      }
      return;
    }

    const userRentalActionMatch = request.method === 'POST'
      ? url.pathname.match(/^\/api\/users\/me\/rental-requests\/([^/]+)\/(edit|cancel|extend)$/)
      : null;
    if (userRentalActionMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body = {};
      try {
        body = await readJsonBody(request);
      } catch (error) {
        writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers);
        return;
      }
      const rentalRequestId = decodeURIComponent(userRentalActionMatch[1]);
      const action = userRentalActionMatch[2];
      try {
        const result = action === 'edit'
          ? await rentalRequestUserActionService.editCurrent(auth.userId, firebaseIdentity, { requestId: rentalRequestId, ...body })
          : action === 'cancel'
            ? await rentalRequestUserActionService.cancelCurrent(auth.userId, firebaseIdentity, { requestId: rentalRequestId })
            : await rentalRequestUserActionService.extendCurrent(auth.userId, firebaseIdentity, { requestId: rentalRequestId });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          rentalRequestUserAction: {
            authority: result.authority,
            operation: result.operation,
            approvalMode: result.approvalMode || '',
            firestoreMirror: result.firestoreMirror,
            shadowSynchronized: Boolean(result.shadowSynchronized),
            deleted: Boolean(result.deleted),
            request: result.deleted ? null : sanitizeRentalRequest(result.request),
            availability: result.availability || null,
            asset: result.asset || null,
          },
        }, headers);
      } catch (error) {
        const code = error?.code || `rental_request_user_${action}_unavailable`;
        const statusCode = error?.status
          || (['direct_edit_period_conflict','rental_extension_period_conflict','invalid_direct_edit_status','invalid_direct_cancel_status','rental_extension_count_exceeded','rental_extension_too_early'].includes(code) ? 409
            : ['rental_request_owner_mismatch','rental_request_member_inactive','rental_extension_restriction_blocked'].includes(code) ? 403
            : ['rental_request_not_found','rental_asset_not_found'].includes(code) ? 404
            : 503);
        writeJson(response, statusCode, {
          ...basePayload, authenticated: true, error: code,
          blockingRequest: error?.blockingRequest || null,
          availableDate: error?.availableDate || null,
        }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/rental-requests') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers);
        return;
      }
      try {
        const result = await rentalRequestWriteService.createCurrent(auth.userId, firebaseIdentity, body);
        writeJson(response, result.reused ? 200 : 201, {
          ...basePayload,
          authenticated: true,
          created: !result.reused,
          reused: Boolean(result.reused),
          rentalRequestWrite: {
            authority: result.authority,
            firestoreMirror: result.firestoreMirror,
            shadowSynchronized: Boolean(result.shadowSynchronized),
            request: sanitizeRentalRequest(result.request),
            availability: result.availability,
          },
        }, headers);
      } catch (error) {
        const errorCode = error?.code || 'rental_request_create_unavailable';
        const statusCode = error?.status
          || (['rental_request_asset_conflict', 'rental_request_asset_unavailable', 'firestore_rental_asset_write_conflict'].includes(errorCode) ? 409
            : ['rental_request_member_inactive', 'rental_request_current_overdue_blocked', 'rental_request_penalty_blocked'].includes(errorCode) ? 403
            : ['rental_request_asset_not_found', 'profile_not_synced', 'legacy_link_not_found', 'member_shadow_not_found'].includes(errorCode) ? 404
            : 503);
        console.warn('[rental-request-write] create failed', { requestId, code: errorCode, name: error?.name });
        writeJson(response, statusCode, {
          ...basePayload,
          authenticated: true,
          error: errorCode,
          blockingRequest: error?.blockingRequest || null,
        }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users/me/rental-requests') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const result = await rentalRequestService.getCurrent(auth.userId);
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          rentalRequestCandidate: sanitizeRentalRequestCandidate(result),
        }, headers);
      } catch (error) {
        const errorCode = error?.code || 'rental_request_candidate_unavailable';
        const statusCode = ['profile_not_synced', 'legacy_link_not_found', 'member_shadow_not_found', 'rental_request_shadow_not_synced'].includes(errorCode) ? 404 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: errorCode }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/legacy/rental-request-shadows/sync') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const result = await rentalRequestService.syncCurrent(auth.userId, firebaseIdentity);
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          synchronized: true,
          rentalRequestCandidate: sanitizeRentalRequestCandidate(result),
        }, headers);
      } catch (error) {
        const errorCode = error?.code || 'rental_request_shadow_sync_unavailable';
        const statusCode = ['profile_not_synced', 'legacy_link_not_found', 'member_shadow_not_found'].includes(errorCode) ? 404
          : ['legacy_link_token_mismatch', 'firebase_link_email_mismatch'].includes(errorCode) ? 409
          : error?.status === 403 ? 403
          : error?.status === 401 ? 401
          : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: errorCode }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/legacy/rental-request-shadows/compare') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const comparison = await rentalRequestService.compareCurrent(auth.userId, firebaseIdentity);
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          comparison,
        }, headers);
      } catch (error) {
        const errorCode = error?.code || 'rental_request_shadow_compare_unavailable';
        const statusCode = ['profile_not_synced', 'legacy_link_not_found', 'member_shadow_not_found', 'rental_request_shadow_not_synced'].includes(errorCode) ? 404
          : ['legacy_link_token_mismatch', 'firebase_link_email_mismatch'].includes(errorCode) ? 409
          : error?.status === 403 ? 403
          : error?.status === 401 ? 401
          : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: errorCode }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/legacy/rental-restriction-candidate') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const shadow = await rentalRestrictionService.getCurrentByFirebaseIdentity(firebaseIdentity);
        if (!shadow) {
          writeJson(response, 404, { ...basePayload, authenticated: true, error: 'rental_restriction_shadow_not_found' }, headers);
          return;
        }
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authentication: 'firebase-id-token',
          restrictionCandidate: { source: 'postgresql-shadow', authoritative: false, ...sanitizeRentalRestrictionShadow(shadow) },
        }, headers);
      } catch (error) {
        console.error('[restriction-read] PostgreSQL candidate lookup failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, 503, { ...basePayload, authenticated: true, error: error?.code || 'rental_restriction_candidate_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/legacy/rental-restriction-firestore-fallback') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const result = await rentalRestrictionService.syncLinkedFirebaseUid(firebaseIdentity, firebaseIdentity.uid);
        const shadow = result.shadow;
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authentication: 'firebase-id-token',
          restrictionFallback: {
            source: 'firestore-one-time-fallback',
            authoritative: true,
            seededPostgresShadow: true,
            firebaseUid: firebaseIdentity.uid,
            exists: shadow.exists,
            restriction: shadow.exists ? shadow.restriction : null,
            sourceHash: shadow.sourceHash,
            sourceUpdatedAt: shadow.sourceUpdatedAt,
          },
        }, headers);
      } catch (error) {
        console.error('[restriction-read] one-time Firestore fallback failed', { requestId, code: error?.code, name: error?.name });
        const statusCode = error?.code === 'firestore_rental_restriction_forbidden' ? 403 : error?.code === 'firestore_rental_restriction_unauthorized' ? 401 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'rental_restriction_fallback_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/legacy/rental-restriction-shadow/write-through') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      const targetFirebaseUid = String(url.searchParams.get('firebaseUid') || '').trim();
      try {
        const result = await rentalRestrictionService.syncLinkedFirebaseUid(firebaseIdentity, targetFirebaseUid);
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authentication: 'firebase-id-token',
          restrictionWriteThrough: {
            status: result.status,
            firebaseUid: result.firebaseUid,
            actorUid: result.actorUid,
            shadow: sanitizeRentalRestrictionShadow(result.shadow),
          },
        }, headers);
      } catch (error) {
        console.warn('[restriction-write-through] synchronization failed', { requestId, code: error?.code, targetFirebaseUid: targetFirebaseUid || firebaseIdentity.uid });
        if (error?.code === 'firestore_rental_restriction_forbidden') {
          writeJson(response, 403, { ...basePayload, authenticated: true, error: 'rental_restriction_source_forbidden' }, headers);
          return;
        }
        if (error?.code === 'firestore_rental_restriction_unauthorized') {
          writeJson(response, 401, { ...basePayload, authenticated: true, error: 'legacy_firebase_unauthorized' }, headers);
          return;
        }
        writeJson(response, 503, { ...basePayload, authenticated: true, error: error?.code || 'rental_restriction_write_through_unavailable' }, headers);
      }
      return;
    }


    if (request.method === 'GET' && url.pathname === '/api/admin/members') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const result = await memberAuthorityService.listAdminMembers({
          firebaseIdentity,
          status: url.searchParams.get('status') || 'all',
          search: url.searchParams.get('q') || '',
          page: Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1),
          pageSize: Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10)),
        });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminMembers: result }, headers);
      } catch (error) {
        console.error('[phase30] admin member PostgreSQL read failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_member_postgresql_read_failed' }, headers);
      }
      return;
    }


    if (request.method === 'POST' && url.pathname === '/api/users/me/member-profile') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await memberAuthorityService.editSelf({ clerkUserId: auth.userId, firebaseIdentity, input: body });
        writeJson(response, 200, { ...basePayload, authenticated: true, memberProfileWrite: result }, headers);
      } catch (error) {
        console.error('[phase21] member profile authoritative write failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 409, { ...basePayload, authenticated: true, error: error?.code || 'member_profile_authority_failed' }, headers);
      }
      return;
    }

    const adminMemberProfileMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/profile$/) : null;
    if (adminMemberProfileMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await memberAuthorityService.editAdmin({ firebaseIdentity, targetUid: decodeURIComponent(adminMemberProfileMatch[1]), input: body });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminMemberProfileWrite: result }, headers);
      } catch (error) {
        console.error('[phase21] admin member profile authoritative write failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 409, { ...basePayload, authenticated: true, error: error?.code || 'admin_member_profile_authority_failed' }, headers);
      }
      return;
    }

    const adminMemberStatusMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/status$/) : null;
    if (adminMemberStatusMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await memberAuthorityService.changeStatusAdmin({ firebaseIdentity, targetUid: decodeURIComponent(adminMemberStatusMatch[1]), nextStatus: body?.status });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminMemberStatusWrite: result }, headers);
      } catch (error) {
        console.error('[phase21] admin member status authoritative write failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 409, { ...basePayload, authenticated: true, error: error?.code || 'admin_member_status_authority_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/identity-registry/bootstrap') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const result = await memberAuthorityService.bootstrapAdminRegistry({ firebaseIdentity });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminIdentityRegistry: result }, headers);
      } catch (error) {
        console.error('[phase21] admin identity registry bootstrap failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 409, { ...basePayload, authenticated: true, error: error?.code || 'admin_identity_registry_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/legacy/member-profile-cutover-candidate') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const shadow = await memberShadowService.getCurrentByFirebaseIdentity(firebaseIdentity);
        if (!shadow) {
          writeJson(
            response,
            404,
            { ...basePayload, authenticated: true, error: 'member_shadow_not_found' },
            headers,
          );
          return;
        }
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            authentication: 'firebase-id-token',
            readCandidate: sanitizeMemberProfileReadCandidate(shadow),
          },
          headers,
        );
      } catch (error) {
        console.error('[member-read] Firebase-authenticated cutover candidate lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = ['legacy_link_not_found', 'firebase_link_email_mismatch'].includes(error?.code) ? 409 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'member_read_cutover_candidate_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/legacy/member-profile-firestore-fallback') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const source = await memberShadowService.readCurrentSourceByFirebaseIdentity(firebaseIdentity);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            authentication: 'firebase-id-token',
            readFallback: {
              source: 'firestore-one-time-fallback',
              authoritative: true,
              firebaseUid: source.uid,
              profile: {
                uid: source.uid,
                email: source.email,
                maskedEmail: source.maskedEmail,
                name: source.name,
                team: source.team,
                phone: source.phone,
                status: source.status,
                directoryMemberId: source.directoryMemberId,
                directoryVerifiedVersion: source.directoryVerifiedVersion,
                profileRequiredReason: source.profileRequiredReason,
                rejoinedAccount: source.rejoinedAccount,
                termsConsentRevision: source.termsConsentRevision,
                termsConsentPolicyVersion: source.termsConsentPolicyVersion,
                identityKey: source.identityKey,
                recoveryKey: source.recoveryKey,
                previousAccountUids: source.previousAccountUids,
              },
              sourceHash: source.sourceHash,
              sourceUpdatedAt: source.sourceUpdatedAt,
            },
          },
          headers,
        );
      } catch (error) {
        console.error('[member-read] one-time Firestore fallback failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = ['legacy_link_not_found', 'firebase_link_email_mismatch', 'member_source_email_mismatch'].includes(error?.code)
          ? 409
          : error?.code === 'member_source_not_found'
            ? 404
            : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'member_profile_firestore_fallback_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/legacy/member-shadow/write-through') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      const targetFirebaseUid = String(url.searchParams.get('firebaseUid') || '').trim();

      try {
        const result = await memberShadowService.syncLinkedFirebaseUid(firebaseIdentity, targetFirebaseUid);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            authentication: 'firebase-id-token',
            writeThrough: {
              status: result.status,
              reason: result.reason || '',
              firebaseUid: result.firebaseUid,
              actorUid: result.actorUid,
              appUserId: result.appUserId || null,
              memberShadow: result.shadow ? sanitizeMemberShadow(result.shadow) : null,
            },
          },
          headers,
        );
      } catch (error) {
        console.warn('[member-write-through] shadow synchronization failed', {
          requestId,
          code: error?.code,
          status: error?.status,
          name: error?.name,
          targetFirebaseUid: targetFirebaseUid || firebaseIdentity.uid,
        });
        if (error?.code === 'firestore_user_account_forbidden') {
          writeJson(response, 403, { ...basePayload, authenticated: true, error: 'member_source_forbidden' }, headers);
          return;
        }
        if (error?.code === 'firestore_user_account_unauthorized') {
          writeJson(response, 401, { ...basePayload, authenticated: true, error: 'legacy_firebase_unauthorized' }, headers);
          return;
        }
        if (['member_source_uid_mismatch', 'member_source_email_mismatch', 'member_shadow_uid_conflict'].includes(error?.code)) {
          writeJson(response, 409, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        writeJson(response, 503, { ...basePayload, authenticated: true, error: error?.code || 'member_write_through_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users/me/member-profile-candidate') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const shadow = await memberShadowService.getCurrent(auth.userId);
        if (!shadow) {
          writeJson(
            response,
            404,
            { ...basePayload, authenticated: true, error: 'member_shadow_not_found' },
            headers,
          );
          return;
        }
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            readCandidate: sanitizeMemberProfileReadCandidate(shadow),
          },
          headers,
        );
      } catch (error) {
        console.error('[member-read] PostgreSQL candidate lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = ['profile_not_synced', 'legacy_link_not_found'].includes(error?.code) ? 409 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'member_read_candidate_unavailable' }, headers);
      }
      return;
    }


    if (request.method === 'GET' && url.pathname === '/api/users/me/legacy/member-shadow') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const shadow = await memberShadowService.getCurrent(auth.userId);
        if (!shadow) {
          writeJson(
            response,
            404,
            { ...basePayload, authenticated: true, error: 'member_shadow_not_found' },
            headers,
          );
          return;
        }
        writeJson(
          response,
          200,
          { ...basePayload, authenticated: true, memberShadow: sanitizeMemberShadow(shadow) },
          headers,
        );
      } catch (error) {
        console.error('[legacy] member shadow lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = ['profile_not_synced', 'legacy_link_not_found'].includes(error?.code) ? 409 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'member_shadow_store_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/legacy/member-shadow/sync') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const shadow = await memberShadowService.syncCurrent(auth.userId, firebaseIdentity);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            synchronized: true,
            authoritativeSource: 'firestore',
            memberShadow: sanitizeMemberShadow(shadow),
          },
          headers,
        );
      } catch (error) {
        console.warn('[legacy] member shadow synchronization rejected', {
          requestId,
          code: error?.code,
          status: error?.status,
          name: error?.name,
        });
        if (['profile_not_synced', 'legacy_link_not_found', 'legacy_link_token_mismatch', 'member_source_uid_mismatch', 'member_source_email_mismatch', 'member_shadow_uid_conflict'].includes(error?.code)) {
          writeJson(response, 409, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        if (error?.code === 'member_source_not_found') {
          writeJson(response, 404, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        if (error?.code === 'firestore_user_account_forbidden') {
          writeJson(response, 403, { ...basePayload, authenticated: true, error: 'member_source_forbidden' }, headers);
          return;
        }
        if (error?.code === 'firestore_user_account_unauthorized') {
          writeJson(response, 401, { ...basePayload, authenticated: true, error: 'legacy_firebase_unauthorized' }, headers);
          return;
        }
        writeJson(response, 503, { ...basePayload, authenticated: true, error: 'member_shadow_sync_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/legacy/member-shadow/compare') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const comparison = await memberShadowService.compareCurrent(auth.userId, firebaseIdentity);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            authoritativeSource: 'firestore',
            comparison: sanitizeMemberComparison(comparison),
          },
          headers,
        );
      } catch (error) {
        console.warn('[legacy] member shadow comparison failed', {
          requestId,
          code: error?.code,
          status: error?.status,
          name: error?.name,
        });
        if (['profile_not_synced', 'legacy_link_not_found', 'legacy_link_token_mismatch', 'member_source_uid_mismatch', 'member_source_email_mismatch'].includes(error?.code)) {
          writeJson(response, 409, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        if (error?.code === 'member_shadow_not_found' || error?.code === 'member_source_not_found') {
          writeJson(response, 404, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        if (error?.code === 'firestore_user_account_forbidden') {
          writeJson(response, 403, { ...basePayload, authenticated: true, error: 'member_source_forbidden' }, headers);
          return;
        }
        if (error?.code === 'firestore_user_account_unauthorized') {
          writeJson(response, 401, { ...basePayload, authenticated: true, error: 'legacy_firebase_unauthorized' }, headers);
          return;
        }
        writeJson(response, 503, { ...basePayload, authenticated: true, error: 'member_shadow_compare_unavailable' }, headers);
      }
      return;
    }

    writeJson(
      response,
      404,
      {
        ...basePayload,
        status: 'not_found',
      },
      headers,
    );
  };
};
