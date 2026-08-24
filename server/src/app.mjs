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
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Request-Id',
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

const readGuestInquiryToken = (request) => {
  const authorization = String(request?.headers?.authorization || '').trim();
  const match = authorization.match(/^Guest\s+(.+)$/i);
  return match ? String(match[1] || '').trim() : '';
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

const sanitizeRentalRestrictionRecord = (record) => ({
  firebaseUid: record.firebaseUid,
  appUserId: record.appUserId,
  exists: Boolean(record.exists),
  restriction: record.exists ? record.restriction : null,
  sourceHash: record.sourceHash,
  sourceUpdatedAt: record.sourceUpdatedAt,
  authorityMode: record.authorityMode || 'postgresql-authoritative',
  mirrorState: record.mirrorState || 'retired',
  lastMutationId: record.lastMutationId || '',
  authoritativeUpdatedAt: record.authoritativeUpdatedAt || null,
  syncedAt: record.syncedAt,
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

const sanitizeRentalRequestCandidate = ({ requests, syncState }) => ({
  source: 'postgresql-authoritative',
  authoritative: true,
  requests: requests.map(sanitizeRentalRequest),
  count: requests.length,
  sourceHash: syncState?.sourceHash || 'postgresql-authoritative',
  syncedAt: syncState?.syncedAt || null,
});

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

const sanitizeMemberProfileReadCandidate = (profile, { source = 'postgresql-authoritative', authoritative = true } = {}) => ({
  source,
  authoritative: authoritative == null ? profile.authorityMode === 'postgresql-authoritative' : Boolean(authoritative),
  firebaseUid: profile.firebaseUid || profile.uid,
  profile: {
    uid: profile.uid || profile.firebaseUid,
    email: profile.email,
    maskedEmail: profile.maskedEmail,
    name: profile.name,
    team: profile.team,
    phone: profile.phone,
    status: profile.status,
    directoryMemberId: profile.directoryMemberId,
    directoryVerifiedVersion: profile.directoryVerifiedVersion,
    profileRequiredReason: profile.profileRequiredReason,
    rejoinedAccount: profile.rejoinedAccount,
    termsConsentRevision: profile.termsConsentRevision,
    termsConsentPolicyVersion: profile.termsConsentPolicyVersion,
    identityKey: profile.identityKey,
    recoveryKey: profile.recoveryKey,
    previousAccountUids: profile.previousAccountUids,
  },
  sourceHash: profile.sourceHash || '',
  sourceUpdatedAt: profile.sourceUpdatedAt || profile.updatedAt || null,
  shadowSyncedAt: profile.syncedAt || null,
});

export const createRequestHandler = ({
  config,
  databaseCheck,
  authenticateRequest,
  userIdentityService,
  firebaseLinkService,
  memberAuthorityService = {
    async getCurrentByFirebaseIdentity() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async editSelf() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async editAdmin() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async changeStatusAdmin() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async getAdminMemberRentalHistory() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async syncMemberDirectoryAdmin() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async auditMemberDirectoryAdmin() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async restoreDirectoryMismatchAdmin() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
    async bootstrapAdminRegistry() { const error = new Error('Member authority service is not configured.'); error.code = 'member_authority_not_configured'; throw error; },
  },
  accountRecoveryService = {
    async findEmail() { const error = new Error('Account recovery service is not configured.'); error.code = 'account_recovery_not_configured'; throw error; },
    async verifyPasswordReset() { const error = new Error('Account recovery service is not configured.'); error.code = 'account_recovery_not_configured'; throw error; },
  },
  accountLifecycleService = {
    async signup() { const error = new Error('Account lifecycle service is not configured.'); error.code = 'account_lifecycle_not_configured'; throw error; },
    async getTerms() { const error = new Error('Account lifecycle service is not configured.'); error.code = 'account_lifecycle_not_configured'; throw error; },
    async bootstrapTerms() { const error = new Error('Account lifecycle service is not configured.'); error.code = 'account_lifecycle_not_configured'; throw error; },
    async saveTerms() { const error = new Error('Account lifecycle service is not configured.'); error.code = 'account_lifecycle_not_configured'; throw error; },
  },
  adminClerkAuthService = {
    async getCurrent() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async authorizeCurrent() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async list() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async create() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async update() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async changePassword() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async setLock() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async retire() { const error = new Error('Admin Clerk auth service is not configured.'); error.code = 'admin_clerk_auth_not_configured'; throw error; },
    async migrateCurrent() { const error = new Error('Admin migration is retired.'); error.code = 'admin_migration_retired'; error.status = 410; throw error; },
    async provisionTarget() { const error = new Error('Admin legacy provisioning is retired.'); error.code = 'admin_provision_retired'; error.status = 410; throw error; },
  },
  systemConfigService = {
    async get() { const error = new Error('System configuration service is not configured.'); error.code = 'system_config_not_configured'; throw error; },
    async put() { const error = new Error('System configuration service is not configured.'); error.code = 'system_config_not_configured'; throw error; },
    async listAudit() { const error = new Error('System configuration service is not configured.'); error.code = 'system_config_not_configured'; throw error; },
    async appendAudit() { const error = new Error('System configuration service is not configured.'); error.code = 'system_config_not_configured'; throw error; },
  },
  clerkDeviceTrustService = {
    getConfigurationStatus() {
      return Object.freeze({
        configured: false,
        source: 'clerk-platform-api',
        authority: 'clerk-device-trust',
        requiredEnvironment: Object.freeze([
          'CLERK_PLATFORM_API_KEY',
          'CLERK_APPLICATION_ID',
          'CLERK_INSTANCE_ID',
        ]),
      });
    },
    async get() {
      return Object.freeze({
        configured: false,
        source: 'clerk-platform-api',
        authority: 'clerk-device-trust',
        enabled: null,
      });
    },
    async setEnabled() {
      const error = new Error('Clerk Platform API configuration is not available.');
      error.code = 'clerk_platform_config_not_configured';
      error.status = 503;
      throw error;
    },
  },
  systemDataService = {
    async getOverview() { const error = new Error('System data service is not configured.'); error.code = 'system_data_not_configured'; throw error; },
    async checkIntegrity() { const error = new Error('System data service is not configured.'); error.code = 'system_data_not_configured'; throw error; },
    async repairAssetReferences() { const error = new Error('System data service is not configured.'); error.code = 'system_data_not_configured'; throw error; },
    async reconcileAssetCatalogMetadata() { const error = new Error('System data service is not configured.'); error.code = 'system_data_not_configured'; throw error; },
    async exportSnapshot() { const error = new Error('System data service is not configured.'); error.code = 'system_data_not_configured'; throw error; },
  },
  userClerkAuthService = {
    async createAdminManagedMember() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async changeAdminManagedMemberPassword() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async rejectAdminPendingMember() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async retireAdminMember() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async purgeAdminRetiredMember() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async signupNative() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async signupVerifiedCurrent() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async ensureRecoveryClerkIdentity() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async getCurrent() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async migrateCurrent() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async provisionCurrent() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async verifyPassword() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async changePassword() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
    async finalizeWithdrawal() { const error = new Error('User Clerk auth service is not configured.'); error.code = 'user_clerk_auth_not_configured'; throw error; },
  },
  rentalRestrictionService = {
    async getCurrentByFirebaseIdentity() { const error = new Error('Rental restriction service is not configured.'); error.code = 'rental_restriction_not_configured'; throw error; },
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
    async getHomeBootstrap() { const error = new Error('Site content service is not configured.'); error.code = 'site_content_not_configured'; throw error; },
    async getSignupTermContents() { const error = new Error('Site content service is not configured.'); error.code = 'site_content_not_configured'; throw error; },
    async syncDomain() { const error = new Error('Site content service is not configured.'); error.code = 'site_content_not_configured'; throw error; },
    async replaceAdminDomain() { const error = new Error('Site content service is not configured.'); error.code = 'site_content_not_configured'; throw error; },
    async patchRentalConfigSettings() { const error = new Error('Site content service is not configured.'); error.code = 'site_content_not_configured'; throw error; },
    async patchSignupPolicy() { const error = new Error('Site content service is not configured.'); error.code = 'site_content_not_configured'; throw error; },
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

  inquiryService = {
    async getPublicConfig() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async createMember() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async listMember() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async getMember() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async updateMember() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async deleteMember() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async createGuest() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async verifyGuestAccess() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async listGuest() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async getGuest() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async updateGuest() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async deleteGuest() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async listAdmin() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async getAdmin() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async addAnswer() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async updateAnswer() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async deleteAnswer() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async deleteAdmin() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async getAdminSettings() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async saveAdminSettings() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async saveCategory() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async deleteCategory() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async saveInquiryTerm() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
    async deleteInquiryTerm() { const error = new Error('Inquiry service is not configured.'); error.code = 'inquiry_service_not_configured'; throw error; },
  },
  secureAttachmentService = {
    async getDownloadRecord() { const error = new Error('Secure attachment service is not configured.'); error.code = 'secure_attachment_not_configured'; throw error; },
    async streamDownload() { const error = new Error('Secure attachment service is not configured.'); error.code = 'secure_attachment_not_configured'; throw error; },
  },

}) => {
  if (typeof databaseCheck !== 'function') {
    throw new TypeError('databaseCheck must be a function.');
  }
  if (typeof authenticateRequest !== 'function') {
    throw new TypeError('authenticateRequest must be a function.');
  }
  if (!userIdentityService || typeof userIdentityService.getCurrent !== 'function' || typeof userIdentityService.syncCurrent !== 'function') {
    throw new TypeError('userIdentityService getCurrent/syncCurrent methods are required.');
  }
  if (!firebaseLinkService || typeof firebaseLinkService.getCurrent !== 'function' || typeof firebaseLinkService.linkCurrent !== 'function') {
    throw new TypeError('firebaseLinkService getCurrent/linkCurrent methods are required.');
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
  if (config.memberProfileWriteMirrorDisabled && (
    typeof memberAuthorityService.syncMemberDirectoryAdmin !== 'function' ||
    typeof memberAuthorityService.auditMemberDirectoryAdmin !== 'function' ||
    typeof memberAuthorityService.restoreDirectoryMismatchAdmin !== 'function' ||
    typeof memberAuthorityService.getCurrentByFirebaseIdentity !== 'function'
  )) {
    throw new TypeError('memberAuthorityService Phase 31 canonical profile read/syncMemberDirectoryAdmin methods are required when member profile identity authority is enabled.');
  }
  if (
    !accountRecoveryService ||
    typeof accountRecoveryService.findEmail !== 'function' ||
    typeof accountRecoveryService.verifyPasswordReset !== 'function'
  ) {
    throw new TypeError('accountRecoveryService Phase 22 methods are required.');
  }
  if (config.accountLifecycleCompatibilityDisabled && (
    !accountLifecycleService ||
    typeof accountLifecycleService.signup !== 'function' ||
    typeof accountLifecycleService.provisionAdminMember !== 'function' ||
    typeof accountLifecycleService.getTerms !== 'function' ||
    typeof accountLifecycleService.bootstrapTerms !== 'function' ||
    typeof accountLifecycleService.saveTerms !== 'function'
  )) {
    throw new TypeError('accountLifecycleService Phase 32 methods are required when account lifecycle authority is enabled.');
  }
  if (
    !adminClerkAuthService ||
    typeof adminClerkAuthService.getCurrent !== 'function' ||
    typeof adminClerkAuthService.authorizeCurrent !== 'function' ||
    typeof adminClerkAuthService.list !== 'function' ||
    typeof adminClerkAuthService.create !== 'function' ||
    typeof adminClerkAuthService.update !== 'function' ||
    typeof adminClerkAuthService.setLock !== 'function' ||
    typeof adminClerkAuthService.retire !== 'function'
  ) {
    throw new TypeError('Clerk/PostgreSQL administrator lifecycle methods are required.');
  }
  if (config.userFirebaseAuthCompatibilityDisabled && (typeof userClerkAuthService.createAdminManagedMember !== 'function' || typeof userClerkAuthService.rejectAdminPendingMember !== 'function' || typeof userClerkAuthService.retireAdminMember !== 'function' || typeof userClerkAuthService.purgeAdminRetiredMember !== 'function')) {
    throw new TypeError('Clerk/PostgreSQL administrator member provisioning method is required.');
  }
  if (!systemConfigService || typeof systemConfigService.get !== 'function' || typeof systemConfigService.put !== 'function' || typeof systemConfigService.listAudit !== 'function' || typeof systemConfigService.appendAudit !== 'function') {
    throw new TypeError('PostgreSQL system configuration service methods are required.');
  }
  if (!systemDataService || typeof systemDataService.getOverview !== 'function' || typeof systemDataService.checkIntegrity !== 'function' || typeof systemDataService.repairAssetReferences !== 'function' || typeof systemDataService.reconcileAssetCatalogMetadata !== 'function' || typeof systemDataService.exportSnapshot !== 'function') {
    throw new TypeError('PostgreSQL system data management service methods are required.');
  }
  if (!rentalRestrictionService || typeof rentalRestrictionService.getCurrentByFirebaseIdentity !== 'function') {
    throw new TypeError('rentalRestrictionService getCurrentByFirebaseIdentity method is required.');
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
    || typeof siteContentService.replaceAdminDomain !== 'function') {
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
  if (!inquiryService
    || typeof inquiryService.getPublicConfig !== 'function'
    || typeof inquiryService.createMember !== 'function'
    || typeof inquiryService.createGuest !== 'function'
    || typeof inquiryService.listAdmin !== 'function'
    || typeof inquiryService.addAnswer !== 'function'
    || typeof inquiryService.saveAdminSettings !== 'function') {
    throw new TypeError('inquiryService Phase 34 private inquiry methods are required.');
  }
  if (!secureAttachmentService
    || typeof secureAttachmentService.getDownloadRecord !== 'function'
    || typeof secureAttachmentService.streamDownload !== 'function') {
    throw new TypeError('secureAttachmentService Phase 34 methods are required.');
  }


  const basePayload = {
    service: config.serviceName,
    environment: config.appEnv,
    version: config.serviceVersion,
    runtimeRevision: 'phase34-clerk-postgresql-runtime-authority-20260813-1438',
    publicContentVisibilityRevision: 'phase33-public-content-visibility-hotfix-20260812-0105',
    publicContentSyncRevision: 'phase33-public-content-full-server-sync-hotfix-20260812-0117',
    adminContentAuthorityRevision: 'phase34-admin-content-postgresql-authority-20260812-1200',
    phase34RuntimeRevision: 'phase34-clerk-postgresql-runtime-authority-20260813-1438',
    phase34PolicyBootstrapRevision: 'phase34-rental-config-postgresql-bootstrap-hotfix-20260812-1545',
    phase34SystemDataRevision: 'phase34-postgresql-data-management-asset-integrity-20260812-1700',
    phase34RuntimeRegressionRevision: 'phase34-rental-request-restriction-content-reset-hotfix-20260812-1740',
    phase34AdminNavigationHolidayRevision: 'phase34-admin-navigation-holiday-hotfix-20260812-1810',
    phase34SettingsRepositoryMemberRevision: 'phase34-settings-repository-member-createdat-hotfix-20260812-1835',
    authority: {
      userAuthentication: 'clerk-postgresql',
      adminAuthentication: 'clerk-postgresql',
      memberProfile: 'postgresql',
      memberStatus: 'postgresql',
      rentalTransactions: 'postgresql',
      signup: 'postgresql',
      terms: 'postgresql',
      passwordReset: 'clerk-email-code',
      siteContent: 'postgresql',
      policyContent: 'postgresql',
      boardContent: 'postgresql',
      privateInquiry: 'postgresql',
      assets: 'postgresql',
      systemConfiguration: 'postgresql',
    },
    compatibility: {
      assetBoardWriteMirrorDisabled: Boolean(config.assetBoardWriteMirrorDisabled),
      retiredWriteMirrorDomains: [
        ...(config.assetBoardWriteMirrorDisabled ? ['assets', 'notice', 'faq'] : []),
        ...(config.rentalRequestWriteMirrorDisabled ? ['rental-requests'] : []),
        ...(config.memberStatusRestrictionWriteMirrorDisabled ? ['member-status', 'rental-restriction-status'] : []),
        ...(config.memberProfileWriteMirrorDisabled ? ['member-profile', 'member-identity', 'account-recovery-key'] : []),
      ],
      rentalRequestWriteMirrorDisabled: Boolean(config.rentalRequestWriteMirrorDisabled),
      rentalTransactionSource: config.rentalRequestWriteMirrorDisabled ? 'postgresql' : 'firestore-compatibility-source',
      memberStatusRestrictionWriteMirrorDisabled: Boolean(config.memberStatusRestrictionWriteMirrorDisabled),
      memberStatusSource: config.memberStatusRestrictionWriteMirrorDisabled ? 'postgresql' : 'firestore-compatibility-source',
      memberProfileWriteMirrorDisabled: Boolean(config.memberProfileWriteMirrorDisabled),
      memberProfileSource: config.memberProfileWriteMirrorDisabled ? 'postgresql' : 'firestore-compatibility-source',
      memberIdentitySource: config.memberProfileWriteMirrorDisabled ? 'postgresql' : 'firestore-compatibility-source',
      accountLifecycleCompatibilityDisabled: Boolean(config.accountLifecycleCompatibilityDisabled),
      signupProfileSource: config.accountLifecycleCompatibilityDisabled ? 'postgresql' : 'firestore-compatibility-source',
      termsConsentSource: config.accountLifecycleCompatibilityDisabled ? 'postgresql' : 'firestore',
      userFirebaseAuthCompatibilityDisabled: Boolean(config.userFirebaseAuthCompatibilityDisabled),
      userAuthenticationSource: 'clerk-postgresql',
      userLegacyMemberKeySource: 'postgresql-compatibility-key',
      passwordResetDelivery: 'clerk-email-code',
      adminFirebaseAuthCompatibility: 'retired',
      firebaseRuntime: 'retired',
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


  const authenticateCompatibilityIdentity = async (request, response, headers, requestId) => {
    const auth = await authenticate(request, response, headers, requestId);
    if (!auth) return null;
    try {
      const adminAuth = await adminClerkAuthService.getCurrent({ clerkUserId: auth.userId });
      return Object.freeze({
        uid: String(adminAuth.admin.firebaseUid || adminAuth.admin.id || ''),
        email: String(adminAuth.admin.authEmail || ''),
        emailVerified: true,
        signInProvider: 'clerk-postgresql-admin',
        authTime: Number(auth.issuedAt || 0),
        idToken: '',
        source: 'clerk-postgresql',
        clerkUserId: auth.userId,
      });
    } catch (adminError) {
      try {
        const userAuth = await userClerkAuthService.getCurrent({ clerkUserId: auth.userId });
        const account = userAuth?.account || {};
        return Object.freeze({
          uid: String(account.firebaseUid || account.legacyMemberKey || ''),
          email: String(account.firebaseEmail || account.primaryEmail || ''),
          emailVerified: true,
          signInProvider: 'clerk-postgresql',
          authTime: Number(auth.issuedAt || 0),
          idToken: '',
          source: 'clerk-postgresql',
          clerkUserId: auth.userId,
        });
      } catch (userError) {
        console.warn('[auth] Clerk/PostgreSQL compatibility identity rejected', { requestId, adminCode: adminError?.code, userCode: userError?.code });
        writeJson(response, userError?.status || adminError?.status || 403, { ...basePayload, authenticated: true, error: 'postgresql_identity_unauthorized' }, headers);
        return null;
      }
    }
  };

  const authenticateAdminPostgresqlIdentity = async (request, response, headers, requestId, existingAuth = null) => {
    const auth = existingAuth || await authenticate(request, response, headers, requestId);
    if (!auth) return null;
    try {
      const adminAuth = await adminClerkAuthService.authorizeCurrent({ clerkUserId: auth.userId });
      const admin = adminAuth?.admin || adminAuth?.account || {};
      return Object.freeze({
        uid: String(admin.legacyAdminKey || admin.firebaseUid || admin.id || ''),
        email: String(admin.authEmail || admin.email || ''),
        adminId: String(admin.adminLoginId || ''),
        name: String(admin.userName || ''),
        emailVerified: true,
        signInProvider: 'clerk-postgresql-admin',
        authTime: Number(auth.issuedAt || 0),
        idToken: '',
        source: 'clerk-postgresql',
        clerkUserId: auth.userId,
      });
    } catch (error) {
      console.warn('[auth] Clerk/PostgreSQL administrator identity rejected', {
        requestId,
        code: error?.code || 'admin_postgresql_identity_unauthorized',
      });
      writeJson(response, error?.status || 403, {
        ...basePayload,
        authenticated: true,
        error: error?.code || 'admin_postgresql_identity_unauthorized',
      }, headers);
      return null;
    }
  };

  const authenticateUserAuthority = async (request, response, headers, requestId) => {
    const auth = await authenticate(request, response, headers, requestId);
    if (!auth) return null;
    if (!config.userFirebaseAuthCompatibilityDisabled) {
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
      if (!firebaseIdentity) return null;
      return Object.freeze({ auth, firebaseIdentity, userAuth: null });
    }
    try {
      const userAuth = await userClerkAuthService.getCurrent({ clerkUserId: auth.userId });
      const account = userAuth?.account || {};
      const clerkUser = userAuth?.clerkUser || {};
      const firebaseIdentity = Object.freeze({
        uid: String(account.firebaseUid || ''),
        email: String(account.firebaseEmail || account.primaryEmail || clerkUser.primaryEmail || ''),
        emailVerified: true,
        signInProvider: 'clerk-postgresql',
        idToken: '',
        source: 'clerk-postgresql',
      });
      if (!firebaseIdentity.uid) {
        const error = new Error('PostgreSQL compatibility member key is missing.');
        error.code = 'user_legacy_member_key_missing';
        error.status = 409;
        throw error;
      }
      return Object.freeze({ auth, firebaseIdentity, userAuth });
    } catch (error) {
      console.warn('[user-auth] PostgreSQL user authority rejected', { requestId, code: error?.code, name: error?.name });
      writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'user_authority_unavailable' }, headers);
      return null;
    }
  };

  const authenticateAdminAuthority = async (request, response, headers, requestId) => {
    const auth = await authenticate(request, response, headers, requestId);
    if (!auth) return null;
    try {
      const adminAuth = await adminClerkAuthService.authorizeCurrent({ clerkUserId: auth.userId });
      const firebaseIdentity = config.firebaseRuntimeDisabled
        ? Object.freeze({
            uid: String(adminAuth.admin.firebaseUid || adminAuth.admin.id || ''),
            email: String(adminAuth.admin.authEmail || ''),
            emailVerified: true,
            signInProvider: 'clerk-postgresql-admin',
            authTime: Number(auth.issuedAt || 0),
            idToken: '',
            source: 'clerk-postgresql',
            clerkUserId: auth.userId,
          })
        : await authenticateCompatibilityIdentity(request, response, headers, requestId);
      if (!firebaseIdentity) return null;
      if (!config.firebaseRuntimeDisabled && adminAuth.admin.firebaseUid !== firebaseIdentity.uid) {
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

    const secureAttachmentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/download$/);
    if (request.method === 'GET' && secureAttachmentMatch) {
      try {
        const record = await secureAttachmentService.getDownloadRecord(decodeURIComponent(secureAttachmentMatch[1]));
        if (!record.publicAccess) {
          let authorized = false;
          const guestToken = readGuestInquiryToken(request);
          if (guestToken && record.inquiryPublicId) {
            try {
              await inquiryService.getGuest({ token: guestToken, publicId: record.inquiryPublicId });
              authorized = true;
            } catch {
              authorized = false;
            }
          } else {
            const auth = await authenticate(request, response, headers, requestId);
            if (!auth) return;
            if (record.inquiryPublicId) {
              try {
                await inquiryService.getMember({ clerkUserId: auth.userId, publicId: record.inquiryPublicId });
                authorized = true;
              } catch {
                try {
                  const adminAuth = await adminClerkAuthService.getCurrent({ clerkUserId: auth.userId });
                  await inquiryService.getAdmin({ admin: adminAuth?.admin, publicId: record.inquiryPublicId });
                  authorized = true;
                } catch {
                  authorized = false;
                }
              }
            }
          }
          if (!authorized) {
            writeJson(response, 404, { ...basePayload, error: 'attachment_not_found' }, headers);
            return;
          }
        }
        await secureAttachmentService.streamDownload({ record, response, headers });
      } catch (error) {
        if (!response.headersSent) writeJson(response, error?.status || 502, { ...basePayload, error: error?.code || 'attachment_download_failed' }, headers);
        else if (!response.destroyed) response.destroy();
      }
      return;
    }

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
          memberProfileReadCandidate: '/api/users/me/member-profile-candidate',
          memberProfileCutoverCandidate: '/api/legacy/member-profile-cutover-candidate',
          memberProfileAuthority: '/api/users/me/member-profile',
          adminMembers: '/api/admin/members',
          adminMemberDirectory: '/api/admin/member-directory',
          adminMemberDirectoryAudit: '/api/admin/member-directory/audit',
          adminMemberDirectoryRestore: '/api/admin/member-directory/restore-mismatches',
          adminMemberSignupPolicy: '/api/admin/member-signup-policy',
          adminMemberProfileAuthority: '/api/admin/members/:uid/profile',
          adminMemberPasswordAuthority: '/api/admin/members/:uid/password',
          adminMemberStatusAuthority: '/api/admin/members/:uid/status',
          adminMemberRentalHistory: '/api/admin/members/:uid/rental-history',
          adminPendingMemberReject: '/api/admin/members/:uid/reject',
          adminMemberRetire: '/api/admin/members/:uid/retire',
          adminRetiredMemberPurge: '/api/admin/members/:uid',
          inquiryConfig: '/api/inquiries/config',
          memberInquiries: '/api/inquiries/member',
          guestInquiries: '/api/inquiries/guest',
          adminInquiries: '/api/admin/inquiries',
          adminAccountPasswordAuthority: '/api/admin/accounts/:id/password',
          adminIdentityRegistryBootstrap: '/api/admin/identity-registry/bootstrap',
          accountRecoveryEmail: '/api/account-recovery/email',
          accountRecoveryPasswordResetVerify: '/api/account-recovery/password-reset/verify',
          accountLifecycleSignup: '/api/users/signup/bootstrap',
          accountLifecycleNativeSignup: '/api/users/signup/clerk',
          accountLifecycleVerifiedSignup: '/api/users/signup/clerk-verified',
          userTermsConsent: '/api/users/me/terms-consent',
          userTermsConsentBootstrap: '/api/users/me/terms-consent/bootstrap',
          adminClerkSession: '/api/admin/auth/session',
          adminClerkDeviceTrust: '/api/admin/clerk-device-trust',
          adminClerkMigration: '/api/admin/auth/migrate',
          adminClerkProvision: '/api/admin/identity-registry/:uid/provision',
          rentalRestrictionCurrent: '/api/users/me/rental-restriction',
          rentalRestrictionCandidate: '/api/legacy/rental-restriction-candidate',
          rentalRestrictionFallback: '/api/legacy/rental-restriction-firestore-fallback',
          rentalRestrictionWriteThrough: '/api/legacy/rental-restriction-shadow/write-through',
          rentalRequestCandidate: '/api/users/me/rental-requests',
          rentalRequestCreate: '/api/users/me/rental-requests',
          rentalRequestUserEdit: '/api/users/me/rental-requests/:id/edit',
          rentalRequestUserCancel: '/api/users/me/rental-requests/:id/cancel',
          rentalRequestUserExtend: '/api/users/me/rental-requests/:id/extend',
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
          userHomeBootstrap: '/api/user/home-bootstrap',
          adminAssetBootstrap: '/api/admin/assets/bootstrap',
          adminAssets: '/api/admin/assets',
          adminAssetBulk: '/api/admin/assets/bulk',
          adminAssetCategories: '/api/admin/assets/categories',
          siteContent: '/api/site-content/:domain',
          signupTermsPolicy: '/api/signup/terms-policy',
          signupTermsContentBatch: '/api/signup/terms-content?ids=termA,termB',
          adminSiteContentSync: '/api/admin/site-content/:domain/sync',
          adminSiteContentDirect: '/api/admin/site-content/:domain',
          adminRentalConfigSettings: '/api/admin/site-content/rental-config/settings',
          noticeBoard: '/api/boards/notice',
          noticePost: '/api/boards/notice/:id',
          noticeView: '/api/boards/notice/:id/view',
          faqBoard: '/api/boards/faq',
          adminBoardBootstrap: '/api/admin/boards/bootstrap',
          adminNoticeBoard: '/api/admin/boards/notice/*',
          adminFaqBoard: '/api/admin/boards/faq/*',
          adminSystemDataOverview: '/api/admin/system-data/overview',
          adminSystemDataIntegrity: '/api/admin/system-data/integrity',
          adminSystemDataCatalogMetadataReconcile: '/api/admin/system-data/reconcile-asset-catalog-metadata',
          adminSystemDataAssetRepair: '/api/admin/system-data/repair-asset-references',
          adminSystemDataExport: '/api/admin/system-data/export',
          adminSystemDataResetScan: '/api/admin/system-data/reset/scan',
          adminSystemDataReset: '/api/admin/system-data/reset',
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
        let recoveryClerk = null;
        if (result.verified && config.userFirebaseAuthCompatibilityDisabled) {
          recoveryClerk = await userClerkAuthService.ensureRecoveryClerkIdentity({
            firebaseUid: result.firebaseUid,
            email: result.email,
          });
        }
        writeJson(response, 200, {
          ...basePayload,
          accountRecovery: {
            source: result.source || 'postgresql',
            verified: Boolean(result.verified),
            passwordResetDelivery: 'clerk-email-code',
            clerkReady: config.userFirebaseAuthCompatibilityDisabled ? Boolean(recoveryClerk?.ready) : false,
          },
        }, headers);
      } catch (error) {
        console.warn('[account-recovery] password reset verification failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'account_recovery_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/signup/clerk') {
      if (!config.userFirebaseAuthCompatibilityDisabled) {
        writeJson(response, 409, { ...basePayload, error: 'user_native_signup_not_enabled' }, headers);
        return;
      }
      try {
        const body = await readJsonBody(request);
        const { password = '', ...input } = body || {};
        const result = await userClerkAuthService.signupNative({ input, password: String(password) });
        writeJson(response, 201, {
          ...basePayload,
          signupLifecycle: {
            source: 'postgresql',
            authority: 'clerk-postgresql',
            firestoreBootstrap: 'retired',
            firebaseAuthCompatibility: 'retired',
            legacyMemberKeySource: 'postgresql-compatibility-key',
            status: result.signup?.status || result.account?.memberStatus || '',
            clerkUserId: result.clerkUser?.clerkUserId || '',
          },
        }, headers);
      } catch (error) {
        console.warn('[user-auth] native Clerk/PostgreSQL signup failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'user_native_signup_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/signup/clerk-verified') {
      if (!config.userFirebaseAuthCompatibilityDisabled) {
        writeJson(response, 409, { ...basePayload, error: 'user_verified_signup_not_enabled' }, headers);
        return;
      }
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const body = await readJsonBody(request);
        const result = await userClerkAuthService.signupVerifiedCurrent({
          clerkUserId: auth.userId,
          input: body || {},
        });
        writeJson(response, 201, {
          ...basePayload,
          authenticated: true,
          signupLifecycle: {
            source: 'postgresql',
            authority: 'clerk-postgresql',
            firestoreBootstrap: 'retired',
            firebaseAuthCompatibility: 'retired',
            legacyMemberKeySource: 'postgresql-compatibility-key',
            emailVerification: result.emailVerification || 'clerk-email-code',
            status: result.status || result.account?.memberStatus || '',
            clerkUserId: result.clerkUser?.clerkUserId || auth.userId,
          },
        }, headers);
      } catch (error) {
        console.warn('[user-auth] verified Clerk/PostgreSQL signup failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'user_verified_signup_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/signup/bootstrap') {
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const body = await readJsonBody(request);
        const result = await accountLifecycleService.signup({ firebaseIdentity, input: body || {} });
        writeJson(response, 200, {
          ...basePayload,
          signupLifecycle: {
            source: result.source || 'postgresql',
            authority: result.authority || 'postgresql',
            firestoreBootstrap: result.firestoreBootstrap || 'retired',
            status: result.status || '',
          },
        }, headers);
      } catch (error) {
        console.warn('[account-lifecycle] PostgreSQL signup bootstrap failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'account_lifecycle_signup_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users/me/terms-consent') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const result = await accountLifecycleService.getTerms({
          clerkUserId: auth.userId,
          includeLogs: url.searchParams.get('includeLogs') !== '0',
        });
        writeJson(response, 200, { ...basePayload, termsConsent: result }, headers);
      } catch (error) {
        console.warn('[account-lifecycle] terms consent read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'terms_consent_read_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/terms-consent/bootstrap') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
      if (!firebaseIdentity) return;
      try {
        const result = await accountLifecycleService.bootstrapTerms({ clerkUserId: auth.userId, firebaseIdentity });
        writeJson(response, 200, { ...basePayload, termsConsent: result }, headers);
      } catch (error) {
        console.warn('[account-lifecycle] terms consent bootstrap failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'terms_consent_bootstrap_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && /^\/api\/admin\/members\/[^/]+\/terms-consent$/.test(url.pathname)) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      const memberKey = decodeURIComponent(url.pathname.split('/')[4] || '');
      try {
        const result = await accountLifecycleService.getTermsByMemberKey({ memberKey });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, termsConsent: result }, headers);
      } catch (error) {
        console.warn('[phase34] admin member terms consent read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'admin_member_terms_consent_read_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/terms-consent') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const body = await readJsonBody(request);
        const result = await accountLifecycleService.saveTerms({ clerkUserId: auth.userId, input: body || {} });
        writeJson(response, 200, { ...basePayload, termsConsent: result }, headers);
      } catch (error) {
        console.warn('[account-lifecycle] terms consent save failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'terms_consent_save_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users/auth/session') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const [result, signupTermsPolicy] = await Promise.all([
          userClerkAuthService.getCurrent({ clerkUserId: auth.userId }),
          siteContentService.getSignupTermsPolicy().catch((error) => {
            console.warn('[user-auth] signup terms policy bundle unavailable', {
              requestId,
              code: error?.code,
              name: error?.name,
            });
            return null;
          }),
        ]);
        const account = result.account || {};
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          ...(signupTermsPolicy ? { signupTermsPolicy } : {}),
          userAuthentication: {
            authority: result.authority,
            clerkUserId: result.clerkUser?.clerkUserId || auth.userId,
            firebaseUid: account.firebaseUid || '',
            legacyMemberKey: account.firebaseUid || '',
            legacyMemberKeySource: config.userFirebaseAuthCompatibilityDisabled ? 'postgresql-compatibility-key' : 'firebase-uid',
            email: account.firebaseEmail || account.primaryEmail || result.clerkUser?.primaryEmail || '',
            displayName: result.clerkUser?.displayName || account.name || '',
            firebaseAuthCompatibility: config.userFirebaseAuthCompatibilityDisabled ? 'retired' : 'signed-in-required',
            memberStatus: account.memberStatus || '',
            authAuthorityMode: account.authAuthorityMode || '',
            lifecycleAuthorityMode: account.lifecycleAuthorityMode || '',
            memberProfile: {
              uid: account.firebaseUid || '',
              email: account.email || account.firebaseEmail || account.primaryEmail || '',
              maskedEmail: account.maskedEmail || '',
              name: account.name || '',
              team: account.team || '',
              phone: account.phone || '',
              status: account.status || account.memberStatus || '',
              directoryMemberId: account.directoryMemberId || '',
              directoryVerifiedVersion: Number(account.directoryVerifiedVersion || 0),
              profileRequiredReason: account.profileRequiredReason || '',
              rejoinedAccount: Boolean(account.rejoinedAccount),
              termsConsentRevision: Number(account.termsConsentRevision || 0),
              termsConsentPolicyVersion: Number(account.termsConsentPolicyVersion || 0),
              identityKey: account.identityKey || '',
              recoveryKey: account.recoveryKey || '',
              previousAccountUids: Array.isArray(account.previousAccountUids) ? account.previousAccountUids : [],
            },
          },
        }, headers);
      } catch (error) {
        console.warn('[user-auth] Clerk user session rejected', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'user_clerk_auth_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/auth/migrate') {
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const userAuthority = await authenticateUserAuthority(request, response, headers, requestId);
      if (!userAuthority) return;
      const { auth, firebaseIdentity } = userAuthority;
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
      const userAuthority = await authenticateUserAuthority(request, response, headers, requestId);
      if (!userAuthority) return;
      const { auth, firebaseIdentity } = userAuthority;
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

    if (request.method === 'GET' && url.pathname === '/api/user/home-bootstrap') {
      try {
        const homeBootstrap = await siteContentService.getHomeBootstrap();
        writeJson(response, 200, { ...basePayload, userHomeBootstrap: homeBootstrap }, headers);
      } catch (error) {
        console.warn('[home] PostgreSQL user home bootstrap read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'user_home_bootstrap_read_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/signup/terms-policy') {
      try {
        const policy = await siteContentService.getSignupTermsPolicy();
        writeJson(response, 200, { ...basePayload, signupTermsPolicy: policy }, headers);
      } catch (error) {
        console.warn('[terms] PostgreSQL signup terms policy read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'signup_terms_policy_read_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/signup/terms-content') {
      try {
        const termIds = String(url.searchParams.get('ids') || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        const termContents = await siteContentService.getSignupTermContents(termIds);
        writeJson(response, 200, { ...basePayload, signupTermContents: termContents }, headers);
      } catch (error) {
        console.warn('[terms] PostgreSQL signup term batch content read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'signup_term_contents_read_failed' }, headers);
      }
      return;
    }

    const signupTermContentMatch = url.pathname.match(/^\/api\/signup\/terms\/([^/]+)\/content$/);
    if (request.method === 'GET' && signupTermContentMatch) {
      try {
        const termContent = await siteContentService.getSignupTermContent(
          decodeURIComponent(signupTermContentMatch[1]),
        );
        writeJson(response, 200, { ...basePayload, signupTermContent: termContent }, headers);
      } catch (error) {
        console.warn('[terms] PostgreSQL signup term content read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'signup_term_content_read_failed' }, headers);
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

    const adminSiteContentCatalogMatch = url.pathname.match(/^\/api\/admin\/site-content-catalog\/(popup|footer)$/);
    if (request.method === 'GET' && adminSiteContentCatalogMatch) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const catalog = await siteContentService.getAdminSiteContentCatalog(
          decodeURIComponent(adminSiteContentCatalogMatch[1]),
        );
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminSiteContentCatalog: catalog,
        }, headers);
      } catch (error) {
        console.warn('[site-content] PostgreSQL administrator lightweight catalog read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          error: error?.code || 'admin_site_content_catalog_read_failed',
        }, headers);
      }
      return;
    }

    const adminSiteContentDocumentMatch = url.pathname.match(/^\/api\/admin\/site-content-catalog\/(popup|footer)\/([^/]+)\/content$/);
    if (request.method === 'GET' && adminSiteContentDocumentMatch) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const document = await siteContentService.getAdminSiteContentDocument(
          decodeURIComponent(adminSiteContentDocumentMatch[1]),
          decodeURIComponent(adminSiteContentDocumentMatch[2]),
        );
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminSiteContentDocument: document,
        }, headers);
      } catch (error) {
        console.warn('[site-content] PostgreSQL administrator site-content document read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          error: error?.code || 'admin_site_content_document_read_failed',
        }, headers);
      }
      return;
    }

    const adminSiteContentSyncMatch = url.pathname.match(/^\/api\/admin\/site-content\/([^/]+)\/sync$/);
    if (request.method === 'POST' && adminSiteContentSyncMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      writeJson(response, 410, {
        ...basePayload,
        authenticated: true,
        error: 'firebase_site_content_sync_retired',
        replacement: '/api/admin/site-content/:domain PUT',
      }, headers);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/signup-terms/catalog') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const catalog = await siteContentService.getAdminSignupTermsCatalog();
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          signupTermsCatalog: catalog,
        }, headers);
      } catch (error) {
        console.warn('[terms] PostgreSQL administrator signup terms catalog read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'signup_terms_admin_catalog_read_failed' }, headers);
      }
      return;
    }

    const adminSignupTermContentMatch = url.pathname.match(/^\/api\/admin\/signup-terms\/([^/]+)\/content$/);
    if (request.method === 'GET' && adminSignupTermContentMatch) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const termContent = await siteContentService.getAdminSignupTermContent(
          decodeURIComponent(adminSignupTermContentMatch[1]),
        );
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          signupTermContent: termContent,
        }, headers);
      } catch (error) {
        console.warn('[terms] PostgreSQL administrator signup term content read failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'signup_terms_admin_content_read_failed' }, headers);
      }
      return;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/admin/member-signup-policy') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const policy = await siteContentService.patchSignupPolicy({
          policyPatch: body?.policy,
          actorClerkUserId: authority.auth.userId,
        });
        let directoryRestore = { restoredCount: 0, failed: 0 };
        if (!policy.settings.requireRegisteredMemberForSignup) {
          directoryRestore = await memberAuthorityService.restoreDirectoryMismatchAdmin({ firebaseIdentity: authority.firebaseIdentity });
        }
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          signupPolicyMutation: {
            authority: 'postgresql',
            operation: 'signup-policy-patch',
            settings: policy.settings,
            termsPolicy: policy.termsPolicy,
            directoryRestore,
          },
        }, headers);
      } catch (error) {
        console.error('[phase34] PostgreSQL signup policy patch failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'signup_policy_postgresql_write_failed' }, headers);
      }
      return;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/admin/site-content/rental-config/settings') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const adminAuth = await adminClerkAuthService.getCurrent({ clerkUserId: auth.userId });
        const body = await readJsonBody(request, { maxBytes: 512 * 1024 });
        const content = await siteContentService.patchRentalConfigSettings({
          settingsPatch: body?.settings,
          actorClerkUserId: adminAuth.admin.clerkUserId || auth.userId,
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          siteContent: content,
          rentalConfigMutation: { authority: 'postgresql', operation: 'settings-patch' },
        }, headers);
      } catch (error) {
        console.warn('[site-content] PostgreSQL rental configuration settings patch failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'rental_config_settings_patch_failed' }, headers);
      }
      return;
    }

    const adminSiteContentDirectMatch = url.pathname.match(/^\/api\/admin\/site-content\/([^/]+)$/);
    if (request.method === 'PATCH' && adminSiteContentDirectMatch) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      const domain = decodeURIComponent(adminSiteContentDirectMatch[1]);
      let body;
      try {
        body = await readJsonBody(request, { maxBytes: ['terms', 'footer'].includes(domain) ? 2 * 1024 * 1024 : 256 * 1024 });
      } catch (error) {
        writeJson(response, error?.status || 400, { ...basePayload, authenticated: true, error: error?.code || 'invalid_json_body' }, headers);
        return;
      }
      try {
        const content = await siteContentService.patchAdminDomain({
          domain,
          upserts: body?.upserts,
          deletes: body?.deletes,
          addressClaims: body?.addressClaims,
          actorClerkUserId: authority.auth.userId,
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          siteContent: content,
          siteContentMutation: { authority: 'postgresql', sourceMode: 'postgresql-admin-patch' },
        }, headers);
      } catch (error) {
        console.warn('[site-content] PostgreSQL administrator partial mutation failed', { requestId, domain, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'site_content_admin_patch_failed' }, headers);
      }
      return;
    }
    if (request.method === 'PUT' && adminSiteContentDirectMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        const adminAuth = await adminClerkAuthService.getCurrent({ clerkUserId: auth.userId });
        const body = await readJsonBody(request);
        const content = await siteContentService.replaceAdminDomain({
          domain: decodeURIComponent(adminSiteContentDirectMatch[1]),
          documents: body?.documents,
          actorClerkUserId: adminAuth.admin.clerkUserId || auth.userId,
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          siteContent: content,
          siteContentMutation: { authority: 'postgresql', sourceMode: 'postgresql-admin-direct' },
        }, headers);
      } catch (error) {
        console.warn('[site-content] PostgreSQL administrator direct replacement failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'site_content_admin_replace_failed' }, headers);
      }
      return;
    }


    if (request.method === 'GET' && url.pathname === '/api/inquiries/config') {
      try {
        const configPayload = await inquiryService.getPublicConfig({
          includeGuestTerms: url.searchParams.get('includeGuestTerms') === '1',
          includeCategories: url.searchParams.get('includeCategories') !== '0',
        });
        writeJson(response, 200, { ...basePayload, inquiryConfig: configPayload }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'inquiry_config_unavailable' }, headers);
      }
      return;
    }

    if (url.pathname === '/api/inquiries/member' && ['GET', 'POST'].includes(request.method)) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      try {
        if (request.method === 'GET') {
          const result = await inquiryService.listMember({
            clerkUserId: auth.userId,
            search: url.searchParams.get('search') || '',
            page: url.searchParams.get('page') || '1',
            pageSize: url.searchParams.get('pageSize') || undefined,
          });
          writeJson(response, 200, { ...basePayload, authenticated: true, inquiryList: result }, headers);
        } else {
          const body = await readJsonBody(request, { maxBytes: 256 * 1024 });
          const inquiry = await inquiryService.createMember({ clerkUserId: auth.userId, input: body || {} });
          writeJson(response, 201, { ...basePayload, authenticated: true, inquiry }, headers);
        }
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'member_inquiry_unavailable' }, headers);
      }
      return;
    }

    const memberInquiryMatch = url.pathname.match(/^\/api\/inquiries\/member\/([^/]+)$/);
    if (memberInquiryMatch && ['GET', 'PATCH', 'DELETE'].includes(request.method)) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const publicId = decodeURIComponent(memberInquiryMatch[1]);
      try {
        if (request.method === 'GET') {
          const inquiry = await inquiryService.getMember({ clerkUserId: auth.userId, publicId });
          writeJson(response, 200, { ...basePayload, authenticated: true, inquiry }, headers);
        } else if (request.method === 'PATCH') {
          const body = await readJsonBody(request, { maxBytes: 256 * 1024 });
          const inquiry = await inquiryService.updateMember({ clerkUserId: auth.userId, publicId, input: body || {} });
          writeJson(response, 200, { ...basePayload, authenticated: true, inquiry }, headers);
        } else {
          const result = await inquiryService.deleteMember({ clerkUserId: auth.userId, publicId });
          writeJson(response, 200, { ...basePayload, authenticated: true, inquiryDelete: result }, headers);
        }
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'member_inquiry_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/inquiries/guest') {
      try {
        const body = await readJsonBody(request, { maxBytes: 256 * 1024 });
        const inquiry = await inquiryService.createGuest({ input: body || {} });
        writeJson(response, 201, { ...basePayload, inquiry }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'guest_inquiry_create_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/inquiries/guest/prepare') {
      try {
        const body = await readJsonBody(request, { maxBytes: 32 * 1024 });
        const preparation = await inquiryService.prepareGuestCreate({ input: body || {} });
        writeJson(response, 200, { ...basePayload, guestInquiryPreparation: preparation }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'guest_inquiry_prepare_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/inquiries/guest/verify') {
      try {
        const body = await readJsonBody(request, { maxBytes: 32 * 1024 });
        const access = await inquiryService.verifyGuestAccess({ input: body || {} });
        writeJson(response, 200, { ...basePayload, guestInquiryAccess: access }, headers);
      } catch (error) {
        const exposedCode = error?.code === 'guest_inquiry_verification_failed'
          ? 'guest_inquiry_verification_failed'
          : (error?.code || 'guest_inquiry_verification_unavailable');
        writeJson(response, error?.status || 503, { ...basePayload, error: exposedCode }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/inquiries/guest') {
      try {
        const result = await inquiryService.listGuest({
          token: readGuestInquiryToken(request),
          search: url.searchParams.get('search') || '',
          page: url.searchParams.get('page') || '1',
          pageSize: url.searchParams.get('pageSize') || undefined,
        });
        writeJson(response, 200, { ...basePayload, inquiryList: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'guest_inquiry_unavailable' }, headers);
      }
      return;
    }

    const guestInquiryMatch = url.pathname.match(/^\/api\/inquiries\/guest\/([^/]+)$/);
    if (guestInquiryMatch && ['GET', 'PATCH', 'DELETE'].includes(request.method)) {
      const publicId = decodeURIComponent(guestInquiryMatch[1]);
      const token = readGuestInquiryToken(request);
      try {
        if (request.method === 'GET') {
          const inquiry = await inquiryService.getGuest({ token, publicId });
          writeJson(response, 200, { ...basePayload, inquiry }, headers);
        } else if (request.method === 'PATCH') {
          const body = await readJsonBody(request, { maxBytes: 256 * 1024 });
          const inquiry = await inquiryService.updateGuest({ token, publicId, input: body || {} });
          writeJson(response, 200, { ...basePayload, inquiry }, headers);
        } else {
          const result = await inquiryService.deleteGuest({ token, publicId });
          writeJson(response, 200, { ...basePayload, inquiryDelete: result }, headers);
        }
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'guest_inquiry_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/inquiries/settings') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const settings = await inquiryService.getAdminSettings({ admin: authority.adminAuth?.admin });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquiryAdminSettings: settings }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_settings_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/api/admin/inquiries/settings') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const body = await readJsonBody(request, { maxBytes: 128 * 1024 });
        const settings = await inquiryService.saveAdminSettings({ admin: authority.adminAuth?.admin, input: body || {} });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquirySettings: settings }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_settings_save_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/inquiries/categories') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const body = await readJsonBody(request);
        const category = await inquiryService.saveCategory({ admin: authority.adminAuth?.admin, input: body || {} });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquiryCategory: category }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_category_save_failed', inquiryCount: Number(error?.inquiryCount || 0) }, headers);
      }
      return;
    }

    const adminInquiryCategoryDeleteMatch = request.method === 'DELETE'
      ? url.pathname.match(/^\/api\/admin\/inquiries\/categories\/([^/]+)$/)
      : null;
    if (adminInquiryCategoryDeleteMatch) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await inquiryService.deleteCategory({ admin: authority.adminAuth?.admin, categoryId: decodeURIComponent(adminInquiryCategoryDeleteMatch[1]) });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquiryCategoryDelete: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_category_delete_failed', inquiryCount: Number(error?.inquiryCount || 0) }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/inquiries/terms') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const body = await readJsonBody(request, { maxBytes: 256 * 1024 });
        const term = await inquiryService.saveInquiryTerm({ admin: authority.adminAuth?.admin, input: body || {} });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquiryTerm: term }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_term_save_failed' }, headers);
      }
      return;
    }

    const adminInquiryTermDeleteMatch = request.method === 'DELETE'
      ? url.pathname.match(/^\/api\/admin\/inquiries\/terms\/([^/]+)$/)
      : null;
    if (adminInquiryTermDeleteMatch) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await inquiryService.deleteInquiryTerm({ admin: authority.adminAuth?.admin, termId: decodeURIComponent(adminInquiryTermDeleteMatch[1]) });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquiryTermDelete: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_term_delete_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/inquiries') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await inquiryService.listAdmin({
          admin: authority.adminAuth?.admin,
          query: {
            search: url.searchParams.get('search') || '',
            status: url.searchParams.get('status') || 'all',
            categoryId: url.searchParams.get('categoryId') || 'all',
            page: url.searchParams.get('page') || '1',
            pageSize: url.searchParams.get('pageSize') || '10',
          },
        });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquiryList: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_list_unavailable' }, headers);
      }
      return;
    }

    const adminInquiryAnswerCreateMatch = request.method === 'POST'
      ? url.pathname.match(/^\/api\/admin\/inquiries\/([^/]+)\/answers$/)
      : null;
    if (adminInquiryAnswerCreateMatch) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const body = await readJsonBody(request, { maxBytes: 256 * 1024 });
        const inquiry = await inquiryService.addAnswer({ admin: authority.adminAuth?.admin, publicId: decodeURIComponent(adminInquiryAnswerCreateMatch[1]), input: body || {} });
        writeJson(response, 201, { ...basePayload, authenticated: true, authorized: true, inquiry }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_answer_create_failed' }, headers);
      }
      return;
    }

    const adminInquiryAnswerMatch = url.pathname.match(/^\/api\/admin\/inquiries\/([^/]+)\/answers\/([^/]+)$/);
    if (adminInquiryAnswerMatch && ['PATCH', 'DELETE'].includes(request.method)) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      const publicId = decodeURIComponent(adminInquiryAnswerMatch[1]);
      const answerId = decodeURIComponent(adminInquiryAnswerMatch[2]);
      try {
        const inquiry = request.method === 'PATCH'
          ? await inquiryService.updateAnswer({ admin: authority.adminAuth?.admin, publicId, answerId, input: await readJsonBody(request, { maxBytes: 256 * 1024 }) })
          : await inquiryService.deleteAnswer({ admin: authority.adminAuth?.admin, publicId, answerId });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquiry }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_answer_mutation_failed' }, headers);
      }
      return;
    }

    const adminInquiryDetailMatch = url.pathname.match(/^\/api\/admin\/inquiries\/([^/]+)$/);
    if (adminInquiryDetailMatch && ['GET', 'DELETE'].includes(request.method)) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      const publicId = decodeURIComponent(adminInquiryDetailMatch[1]);
      try {
        if (request.method === 'GET') {
          const inquiry = await inquiryService.getAdmin({ admin: authority.adminAuth?.admin, publicId });
          writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquiry }, headers);
        } else {
          const result = await inquiryService.deleteAdmin({ admin: authority.adminAuth?.admin, publicId });
          writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, inquiryDelete: result }, headers);
        }
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'admin_inquiry_unavailable' }, headers);
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
          pageSize: home ? 6 : url.searchParams.get('pageSize') || undefined,
          pinnedLimit: home ? 6 : 20,
          summaryOnly: url.searchParams.get('summary') === '1',
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
          pageSize: url.searchParams.get('pageSize') || undefined,
          categoryId: url.searchParams.get('categoryId') || '',
          searchWithinCategory: url.searchParams.get('searchWithinCategory') === '1',
          pinnedLimit: 20,
          summaryOnly: url.searchParams.get('summary') === '1',
        });
        writeJson(response, 200, { ...basePayload, board: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'faq_board_unavailable' }, headers);
      }
      return;
    }

    const faqPostReadMatch = request.method === 'GET' ? url.pathname.match(/^\/api\/boards\/faq\/([^/]+)$/) : null;
    if (faqPostReadMatch) {
      try {
        const post = await boardService.getFaq(decodeURIComponent(faqPostReadMatch[1]));
        writeJson(response, 200, { ...basePayload, boardPost: post }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'faq_post_unavailable' }, headers);
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

    if (request.method === 'POST' && url.pathname === '/api/admin/auth/resolve-login') {
      let body;
      try { body = await readJsonBody(request); }
      catch (error) { writeJson(response, error?.status || 400, { ...basePayload, authenticated: false, error: error?.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await adminClerkAuthService.resolveLoginIdentifier({
          identifier: String(body?.identifier || ''),
          password: String(body?.password || ''),
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: false,
          adminLoginResolution: { authority: result.authority, authEmail: result.authEmail },
        }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, {
          ...basePayload,
          authenticated: false,
          error: error?.code || 'admin_login_resolution_failed',
        }, headers);
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

    if (request.method === 'GET' && url.pathname === '/api/admin/accounts') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await adminClerkAuthService.list({ actorClerkUserId: authority.auth.userId });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminAccounts: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'admin_accounts_read_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/accounts') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await adminClerkAuthService.create({ actorClerkUserId: authority.auth.userId, input: body });
        writeJson(response, 201, { ...basePayload, authenticated: true, authorized: true, adminAccountMutation: { operation: 'create', ...result } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'admin_account_create_failed' }, headers);
      }
      return;
    }

    const adminAccountPasswordMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/password$/) : null;
    if (adminAccountPasswordMatch) {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await adminClerkAuthService.changePassword({ actorClerkUserId: authority.auth.userId, targetKey: decodeURIComponent(adminAccountPasswordMatch[1]), newPassword: String(body?.newPassword || '') });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminAccountPasswordChange: { operation: 'password-change', ...result } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'admin_account_password_change_failed' }, headers);
      }
      return;
    }

    const adminAccountMutationMatch = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/);
    if (adminAccountMutationMatch && request.method === 'PUT') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await adminClerkAuthService.update({ actorClerkUserId: authority.auth.userId, targetKey: decodeURIComponent(adminAccountMutationMatch[1]), input: body });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminAccountMutation: { operation: 'update', ...result } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'admin_account_update_failed' }, headers);
      }
      return;
    }
    if (adminAccountMutationMatch && request.method === 'DELETE') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await adminClerkAuthService.retire({ actorClerkUserId: authority.auth.userId, targetKey: decodeURIComponent(adminAccountMutationMatch[1]) });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminAccountMutation: { operation: 'delete', ...result } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'admin_account_delete_failed' }, headers);
      }
      return;
    }
    const adminAccountLockMatch = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/lock$/);
    if (adminAccountLockMatch && request.method === 'POST') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await adminClerkAuthService.setLock({ actorClerkUserId: authority.auth.userId, targetKey: decodeURIComponent(adminAccountLockMatch[1]), locked: Boolean(body?.locked) });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminAccountMutation: { operation: body?.locked ? 'lock' : 'unlock', ...result } }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'admin_account_lock_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/system-config/user-session-policy') {
      try {
        const result = await systemConfigService.get('user-session-policy');
        writeJson(response, 200, { ...basePayload, systemConfiguration: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, error: error?.code || 'system_config_read_failed' }, headers);
      }
      return;
    }
    const adminSystemConfigMatch = url.pathname.match(/^\/api\/admin\/system-config\/(admin-security|user-session-policy)$/);
    if (adminSystemConfigMatch && request.method === 'GET') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await systemConfigService.get(adminSystemConfigMatch[1]);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemConfiguration: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'system_config_read_failed' }, headers);
      }
      return;
    }
    if (adminSystemConfigMatch && request.method === 'PUT') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await systemConfigService.put({ key: adminSystemConfigMatch[1], payload: body?.payload || body || {}, actorClerkUserId: authority.auth.userId });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemConfiguration: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'system_config_write_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/system-settings-audit') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await systemConfigService.listAudit({ limit: url.searchParams.get('limit') || 50 });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemSettingsAudit: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'system_settings_audit_read_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/system-settings-audit') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body = {};
      try {
        body = await readJsonBody(request, { maxBytes: 256 * 1024 });
      } catch (error) {
        writeJson(response, error.status || 400, { ...basePayload, authenticated: true, authorized: true, error: error.code || 'invalid_json_body' }, headers);
        return;
      }
      try {
        const result = await systemConfigService.appendAudit({
          input: body?.audit || body || {},
          actorClerkUserId: authority.auth.userId,
          admin: authority.adminAuth?.admin || null,
        });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemSettingsAuditMutation: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'system_settings_audit_write_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/clerk-device-trust') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await clerkDeviceTrustService.get();
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          clerkDeviceTrust: result,
        }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          error: error?.code || 'clerk_device_trust_read_failed',
        }, headers);
      }
      return;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/admin/clerk-device-trust') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      if ((authority.adminAuth?.admin?.adminRole || 'admin') !== 'owner') {
        writeJson(response, 403, {
          ...basePayload,
          authenticated: true,
          authorized: false,
          error: 'admin_owner_required',
        }, headers);
        return;
      }
      let body = {};
      try {
        body = await readJsonBody(request);
      } catch (error) {
        writeJson(response, error.status || 400, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          error: error.code || 'invalid_json_body',
        }, headers);
        return;
      }
      if (typeof body?.enabled !== 'boolean') {
        writeJson(response, 400, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          error: 'clerk_device_trust_enabled_invalid',
        }, headers);
        return;
      }
      try {
        const result = await clerkDeviceTrustService.setEnabled(body.enabled);
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          clerkDeviceTrust: result,
        }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          error: error?.code || 'clerk_device_trust_write_failed',
        }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/system-data/overview') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await systemDataService.getOverview(authority.adminAuth?.admin);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemDataOverview: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'system_data_overview_failed' }, headers);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/system-data/integrity') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await systemDataService.checkIntegrity(authority.adminAuth?.admin);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemDataIntegrity: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'system_data_integrity_failed' }, headers);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/system-data/repair-asset-references') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await systemDataService.repairAssetReferences(authority.adminAuth?.admin);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemDataRepair: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'system_data_repair_failed' }, headers);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/system-data/reconcile-asset-catalog-metadata') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await systemDataService.reconcileAssetCatalogMetadata(authority.adminAuth?.admin);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemDataCatalogMetadataReconcile: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'system_data_catalog_metadata_reconcile_failed' }, headers);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/system-data/reset/scan') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body = {};
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await systemDataService.getResetCounts(authority.adminAuth?.admin, body?.scopes || []);
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemDataResetScan: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'system_data_reset_scan_failed' }, headers);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/system-data/reset') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body = {};
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await systemDataService.resetScopes(authority.adminAuth?.admin, body || {});
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemDataReset: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'system_data_reset_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/system-data/export') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      let body = {};
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await systemDataService.exportSnapshot(authority.adminAuth?.admin, body || {});
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, systemDataExport: result }, headers);
      } catch (error) {
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'system_data_export_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/auth/migrate') {
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
        const errorCode = error?.code || 'asset_catalog_postgresql_read_failed';
        console.error('[assets] public PostgreSQL catalog read failed', {
          requestId,
          code: errorCode,
          name: error?.name || '',
        });
        writeJson(response, error?.status || 503, { ...basePayload, error: errorCode }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/assets/bootstrap') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await adminRentalRequestService.list(authority.firebaseIdentity, {
          tab: url.searchParams.get('tab') || 'pending',
          quickFilter: url.searchParams.get('quickFilter') || 'all',
          query: url.searchParams.get('query') || '',
          page: url.searchParams.get('page') || '1',
          pageSize: url.searchParams.get('pageSize') || undefined,
          referenceDate: url.searchParams.get('referenceDate') || '',
          includeCounts: url.searchParams.get('includeCounts') !== 'false',
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
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await adminRentalRequestService.getDashboard(
          authority.firebaseIdentity,
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
        const firebaseIdentity = await authenticateAdminPostgresqlIdentity(
          request, response, headers, requestId, auth
        );
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
      const firebaseIdentity = await authenticateAdminPostgresqlIdentity(
        request, response, headers, requestId, auth
      );
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
      const firebaseIdentity = await authenticateAdminPostgresqlIdentity(
        request, response, headers, requestId, auth
      );
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
      const userAuthority = await authenticateUserAuthority(request, response, headers, requestId);
      if (!userAuthority) return;
      const { auth, firebaseIdentity } = userAuthority;
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
      const userAuthority = await authenticateUserAuthority(request, response, headers, requestId);
      if (!userAuthority) return;
      const { auth, firebaseIdentity } = userAuthority;
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
            : ['rental_request_asset_not_found', 'profile_not_synced', 'legacy_link_not_found', 'member_account_not_found'].includes(errorCode) ? 404
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
        const statusCode = ['profile_not_synced', 'legacy_link_not_found', 'member_account_not_found', 'rental_request_shadow_not_synced'].includes(errorCode) ? 404 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: errorCode }, headers);
      }
      return;
    }

    if (
      request.method === 'POST' &&
      ['/api/users/me/legacy/rental-request-shadows/sync', '/api/users/me/legacy/rental-request-shadows/compare'].includes(url.pathname)
    ) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      writeJson(response, 410, {
        ...basePayload,
        authenticated: true,
        error: 'rental_request_shadow_runtime_retired',
        authority: 'postgresql-rental-requests',
      }, headers);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users/me/rental-restriction') {
      const userAuthority = await authenticateUserAuthority(request, response, headers, requestId);
      if (!userAuthority) return;
      try {
        const account = userAuthority.userAuth?.account || {};
        const shadow = await rentalRestrictionService.getCurrentForAppUser({
          appUserId: account.appUserId,
          legacyMemberKey: account.firebaseUid || '',
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          rentalRestriction: {
            source: 'postgresql-authoritative',
            authoritative: true,
            ...sanitizeRentalRestrictionRecord(shadow),
          },
        }, headers);
      } catch (error) {
        console.error('[restriction-read] PostgreSQL authority lookup failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: false, error: error?.code || 'rental_restriction_postgresql_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/legacy/rental-restriction-candidate') {
      const userAuthority = config.userFirebaseAuthCompatibilityDisabled
        ? await authenticateUserAuthority(request, response, headers, requestId)
        : null;
      const firebaseIdentity = userAuthority?.firebaseIdentity || (!config.userFirebaseAuthCompatibilityDisabled
        ? await authenticateCompatibilityIdentity(request, response, headers, requestId)
        : null);
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
          authentication: config.userFirebaseAuthCompatibilityDisabled ? 'clerk-postgresql' : 'retired',
          restrictionCandidate: {
            source: shadow?.authorityMode === 'postgresql-authoritative' ? 'postgresql-authoritative' : 'postgresql-shadow',
            authoritative: shadow?.authorityMode === 'postgresql-authoritative',
            ...sanitizeRentalRestrictionRecord(shadow),
          },
        }, headers);
      } catch (error) {
        console.error('[restriction-read] PostgreSQL candidate lookup failed', { requestId, code: error?.code, name: error?.name });
        writeJson(response, 503, { ...basePayload, authenticated: true, error: error?.code || 'rental_restriction_candidate_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/legacy/rental-restriction-firestore-fallback') {
      writeJson(response, 410, {
        ...basePayload,
        authenticated: false,
        error: 'legacy_rental_restriction_source_retired',
        authority: 'postgresql',
      }, headers);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/legacy/rental-restriction-shadow/write-through') {
      writeJson(response, 410, {
        ...basePayload,
        authenticated: false,
        error: 'legacy_rental_restriction_write_through_retired',
        authority: 'postgresql',
      }, headers);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/members') {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers);
        return;
      }
      try {
        const result = await userClerkAuthService.createAdminManagedMember({
          actorClerkUserId: admin.auth.userId,
          input: body || {},
          password: String(body?.password || ''),
        });
        writeJson(response, 201, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          adminMemberCreate: {
            authority: result.authority || 'clerk-postgresql',
            source: result.source || 'postgresql',
            provisionedBy: 'admin',
            emailVerification: 'not-requested',
            termsConsent: 'required-on-first-login',
            status: result.status || '',
            account: result.account || null,
          },
        }, headers);
      } catch (error) {
        console.error('[phase34] admin member provisioning failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 409, {
          ...basePayload,
          authenticated: true,
          authorized: true,
          error: error?.code || 'admin_member_provision_failed',
        }, headers);
      }
      return;
    }

    const adminMemberRentalHistoryMatch = request.method === 'GET' ? url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/rental-history$/) : null;
    if (adminMemberRentalHistoryMatch) {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await memberAuthorityService.getAdminMemberRentalHistory({
          firebaseIdentity: admin.firebaseIdentity,
          targetUid: decodeURIComponent(adminMemberRentalHistoryMatch[1]),
        });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminMemberRentalHistory: result }, headers);
      } catch (error) {
        console.error('[phase34] admin member rental history read failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'admin_member_rental_history_read_failed' }, headers);
      }
      return;
    }

    const adminMemberPasswordMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/password$/) : null;
    if (adminMemberPasswordMatch) {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      let body;
      try { body = await readJsonBody(request); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await userClerkAuthService.changeAdminManagedMemberPassword({ actorClerkUserId: admin.auth.userId, targetUid: decodeURIComponent(adminMemberPasswordMatch[1]), newPassword: String(body?.newPassword || '') });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminMemberPasswordChange: result }, headers);
      } catch (error) {
        console.error('[phase34] admin member password change failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 409, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'admin_member_password_change_failed' }, headers);
      }
      return;
    }

    const adminMemberRejectMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/reject$/) : null;
    if (adminMemberRejectMatch) {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await userClerkAuthService.rejectAdminPendingMember({ actorClerkUserId: admin.auth.userId, targetUid: decodeURIComponent(adminMemberRejectMatch[1]) });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminMemberLifecycle: result }, headers);
      } catch (error) {
        console.error('[phase34] admin pending member rejection failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 409, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'admin_member_reject_failed' }, headers);
      }
      return;
    }

    const adminMemberRetireMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/retire$/) : null;
    if (adminMemberRetireMatch) {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await userClerkAuthService.retireAdminMember({ actorClerkUserId: admin.auth.userId, targetUid: decodeURIComponent(adminMemberRetireMatch[1]) });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminMemberLifecycle: result }, headers);
      } catch (error) {
        console.error('[phase34] admin member retirement failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 409, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'admin_member_retire_failed' }, headers);
      }
      return;
    }

    const adminMemberPurgeMatch = request.method === 'DELETE' ? url.pathname.match(/^\/api\/admin\/members\/([^/]+)$/) : null;
    if (adminMemberPurgeMatch) {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await userClerkAuthService.purgeAdminRetiredMember({ actorClerkUserId: admin.auth.userId, targetUid: decodeURIComponent(adminMemberPurgeMatch[1]) });
        try {
          await systemConfigService.appendAudit({
            input: {
              action: 'retired-member-permanent-delete',
              section: 'member-lifecycle',
              summary: '탈퇴 회원 1건의 회원정보와 연결 업무기록을 완전 삭제했습니다.',
              beforeValues: {},
              afterValues: {},
            },
            actorClerkUserId: admin.auth.userId,
            admin: admin.adminAuth?.admin || null,
          });
        } catch (auditError) {
          console.warn('[phase34] retired member purge audit metadata write failed after successful deletion', { requestId, code: auditError?.code || auditError?.message });
        }
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, adminMemberLifecycle: result }, headers);
      } catch (error) {
        console.error('[phase34] retired member permanent deletion failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 409, { ...basePayload, authenticated: true, authorized: true, error: error?.code || 'admin_member_purge_failed' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/members') {
      const authority = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!authority) return;
      try {
        const result = await memberAuthorityService.listAdminMembers({
          firebaseIdentity: authority.firebaseIdentity,
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


    if (request.method === 'GET' && url.pathname === '/api/admin/member-directory') {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await memberAuthorityService.listAdminDirectory({ firebaseIdentity: admin.firebaseIdentity });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, memberDirectory: result }, headers);
      } catch (error) {
        console.error('[phase34] member directory PostgreSQL read failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'member_directory_postgresql_read_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/member-directory/audit') {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await memberAuthorityService.auditMemberDirectoryAdmin({ firebaseIdentity: admin.firebaseIdentity });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, memberDirectoryAudit: result }, headers);
      } catch (error) {
        console.error('[phase34] PostgreSQL member directory audit failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'member_directory_postgresql_audit_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/member-directory/restore-mismatches') {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      try {
        const result = await memberAuthorityService.restoreDirectoryMismatchAdmin({ firebaseIdentity: admin.firebaseIdentity });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, memberDirectoryRestore: result }, headers);
      } catch (error) {
        console.error('[phase34] PostgreSQL member directory restore failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'member_directory_postgresql_restore_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/member-directory/sync') {
      const admin = await authenticateAdminAuthority(request, response, headers, requestId);
      if (!admin) return;
      let body;
      try { body = await readJsonBody(request, { maxBytes: 2 * 1024 * 1024 }); } catch (error) { writeJson(response, error.status || 400, { ...basePayload, authenticated: true, error: error.code || 'invalid_json_body' }, headers); return; }
      try {
        const result = await memberAuthorityService.syncMemberDirectoryAdmin({
          firebaseIdentity: admin.firebaseIdentity,
          entries: Array.isArray(body?.entries) ? body.entries : [],
          version: Number(body?.version || 0),
          teams: Object.prototype.hasOwnProperty.call(body || {}, 'teams') && Array.isArray(body?.teams) ? body.teams : null,
          settings: Object.prototype.hasOwnProperty.call(body || {}, 'settings') && body?.settings && typeof body.settings === 'object' && !Array.isArray(body.settings) ? body.settings : null,
        });
        writeJson(response, 200, { ...basePayload, authenticated: true, authorized: true, memberDirectorySync: result }, headers);
      } catch (error) {
        console.error('[phase34] member directory PostgreSQL synchronization failed', { requestId, code: error?.code });
        writeJson(response, error?.status || 503, { ...basePayload, authenticated: true, error: error?.code || 'member_directory_postgresql_sync_failed' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/member-profile') {
      const userAuthority = await authenticateUserAuthority(request, response, headers, requestId);
      if (!userAuthority) return;
      const { auth, firebaseIdentity } = userAuthority;
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

    if (request.method === 'POST' && url.pathname === '/api/users/me/member-directory/verify') {
      const userAuthority = await authenticateUserAuthority(request, response, headers, requestId);
      if (!userAuthority) return;
      const { auth, firebaseIdentity } = userAuthority;
      try {
        const result = await memberAuthorityService.verifySelfDirectory({
          clerkUserId: auth.userId,
          firebaseIdentity,
        });
        writeJson(response, 200, {
          ...basePayload,
          authenticated: true,
          memberDirectoryVerification: result,
        }, headers);
      } catch (error) {
        console.error('[phase32] member directory PostgreSQL verification failed', {
          requestId,
          code: error?.code,
        });
        writeJson(response, error?.status || 409, {
          ...basePayload,
          authenticated: true,
          error: error?.code || 'member_directory_postgresql_verification_failed',
          details: error?.details || null,
        }, headers);
      }
      return;
    }

    const adminMemberProfileMatch = request.method === 'POST' ? url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/profile$/) : null;
    if (adminMemberProfileMatch) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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
      const firebaseIdentity = await authenticateCompatibilityIdentity(request, response, headers, requestId);
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

    if (
      request.method === 'GET' &&
      ['/api/legacy/member-profile-cutover-candidate', '/api/users/me/member-profile-candidate'].includes(url.pathname)
    ) {
      const userAuthority = await authenticateUserAuthority(request, response, headers, requestId);
      if (!userAuthority?.firebaseIdentity) return;
      try {
        const canonical = await memberAuthorityService.getCurrentByFirebaseIdentity({
          firebaseIdentity: userAuthority.firebaseIdentity,
        });
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            authentication: 'clerk-postgresql',
            readCandidate: sanitizeMemberProfileReadCandidate(canonical.profile, {
              source: canonical.source || 'postgresql-authoritative',
              authoritative: true,
            }),
          },
          headers,
        );
      } catch (error) {
        console.error('[member-read] PostgreSQL authoritative profile lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = ['legacy_link_not_found', 'firebase_link_email_mismatch', 'profile_not_synced'].includes(error?.code) ? 409 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'member_profile_postgresql_authority_unavailable' }, headers);
      }
      return;
    }

    const retiredMemberShadowRoutes = new Set([
      'GET /api/legacy/member-profile-firestore-fallback',
      'POST /api/legacy/member-shadow/write-through',
      'GET /api/users/me/legacy/member-shadow',
      'POST /api/users/me/legacy/member-shadow/sync',
      'POST /api/users/me/legacy/member-shadow/compare',
    ]);
    if (retiredMemberShadowRoutes.has(`${request.method} ${url.pathname}`)) {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      writeJson(response, 410, {
        ...basePayload,
        authenticated: true,
        error: 'member_shadow_runtime_retired',
        authority: 'postgresql-member-accounts',
      }, headers);
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
