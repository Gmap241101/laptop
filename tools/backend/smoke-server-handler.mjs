import { createServer } from 'node:http';
import { createRequestHandler } from '../../server/src/app.mjs';

const allowedOrigin = 'https://staging.example.vercel.app';
const config = {
  serviceName: 'rental-api',
  appEnv: 'test',
  serviceVersion: 'phase34-smoke',
  assetBoardWriteMirrorDisabled: true,
  rentalRequestWriteMirrorDisabled: true,
  memberStatusRestrictionWriteMirrorDisabled: true,
  memberProfileWriteMirrorDisabled: true,
  accountLifecycleCompatibilityDisabled: true,
  userFirebaseAuthCompatibilityDisabled: true,
  firebaseRuntimeDisabled: true,
  corsAllowedOrigins: [allowedOrigin],
};

const databaseCheck = async () => ({ latencyMs: 1, databaseTime: new Date() });
const authenticateRequest = async (request) => {
  if (request.headers.authorization !== 'Bearer smoke-token') {
    const error = new Error('Missing Clerk smoke token.');
    error.code = 'unauthorized';
    error.status = 401;
    throw error;
  }
  return {
    userId: 'user_smoke',
    sessionId: 'sess_smoke',
    authorizedParty: allowedOrigin,
    issuedAt: 1,
    expiresAt: 9999999999,
    status: 'active',
  };
};

const adminRecord = {
  id: 'admin:smoke',
  firebaseUid: 'admin:smoke',
  adminLoginId: 'smoke-admin',
  authEmail: 'smoke@example.com',
  adminRole: 'owner',
  clerkUserId: 'user_smoke',
  clerkLinkState: 'linked',
  authAuthorityMode: 'clerk-postgresql',
  status: 'active',
};
const userAccount = {
  id: '42',
  firebaseUid: 'member:smoke',
  legacyMemberKey: 'member:smoke',
  primaryEmail: 'smoke@example.com',
  firebaseEmail: 'smoke@example.com',
  memberStatus: 'active',
  authAuthorityMode: 'clerk-authoritative',
  lifecycleAuthorityMode: 'postgresql-authoritative',
};

let userIdentity = null;
const userIdentityService = {
  async getCurrent() { return userIdentity; },
  async syncCurrent(userId) {
    userIdentity = {
      id: '42', clerkUserId: userId, primaryEmail: 'smoke@example.com', primaryEmailVerified: true,
      displayName: 'Smoke User', firstName: 'Smoke', lastName: 'User', imageUrl: null,
      lastSyncedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    };
    return userIdentity;
  },
};
let legacyLink = null;
const firebaseLinkService = {
  async getCurrent() { return legacyLink; },
  async linkCurrent(_userId, identity) {
    legacyLink = { appUserId: '42', firebaseUid: identity.uid, firebaseEmail: identity.email, linkedAt: new Date() };
    return legacyLink;
  },
};
const memberShadowProfile = {
  uid: 'member:smoke', name: 'Smoke User', team: 'QA', phone: '010-0000-0000', status: 'active',
  email: 'smoke@example.com', sourceHash: 'f'.repeat(64), sourceUpdatedAt: new Date(),
};
const memberShadowService = {
  async getCurrent() { return memberShadowProfile; },
  async getCurrentByFirebaseIdentity() { return memberShadowProfile; },
  async readCurrentSourceByFirebaseIdentity() { return memberShadowProfile; },
  async syncLinkedFirebaseUid() { return memberShadowProfile; },
  async syncCurrent() { return memberShadowProfile; },
  async compareCurrent() { return { equivalent: true, changedFields: [], source: memberShadowProfile, shadow: memberShadowProfile }; },
};
let memberDirectorySyncInput = null;
const memberAuthorityService = {
  async getCurrentByFirebaseIdentity() { return { ...memberShadowProfile, source: 'postgresql-authoritative' }; },
  async editSelf() { return { authority: 'postgresql', member: memberShadowProfile }; },
  async editAdmin() { return { authority: 'postgresql', member: memberShadowProfile }; },
  async changeStatusAdmin() { return { authority: 'postgresql', member: memberShadowProfile }; },
  async syncMemberDirectoryAdmin(input) { memberDirectorySyncInput = input; return { authority: 'postgresql', target: 'postgresql-member-directory', count: 1, version: 1 }; },
  async auditMemberDirectoryAdmin() { return { authority: 'postgresql', source: 'postgresql-authoritative', audit: { total: 1, normal: 1, profileRequired: 0, duplicates: 0, missing: 0, failed: 0, directoryVersion: 1 } }; },
  async restoreDirectoryMismatchAdmin() { return { authority: 'postgresql', source: 'postgresql-authoritative', restoredCount: 1, failed: 0 }; },
  async bootstrapAdminRegistry() { return { authority: 'postgresql', count: 1 }; },
  async listAdminMembers() { return { source: 'postgresql', items: [{ ...memberShadowProfile, firebaseUid: 'member:smoke' }], totalCount: 1, counts: { active: 1 } }; },
};
const accountRecoveryService = {
  async findEmail() { return { source: 'postgresql', found: true, email: 'smoke@example.com' }; },
  async verifyPasswordReset() { return { source: 'postgresql', verified: true, email: 'smoke@example.com' }; },
};
let termsSaved = false;
const accountLifecycleService = {
  async signup() { return { source: 'postgresql', authority: 'postgresql', firestoreBootstrap: 'retired', status: 'active' }; },
  async getTerms() { return { source: 'postgresql', policy: { enabled: true, revision: 5, activeTerms: [] }, states: {}, logs: [], bootstrapCompleted: true, bootstrapRequired: false }; },
  async bootstrapTerms() { return { source: 'postgresql', policy: { enabled: true, revision: 5, activeTerms: [] }, states: {}, logs: [], bootstrapCompleted: true, bootstrapRequired: false, legacyBootstrap: 'retired' }; },
  async saveTerms() { termsSaved = true; return { source: 'postgresql', authority: 'postgresql', firestoreMirror: 'retired', policy: { enabled: true, revision: 5, activeTerms: [] }, states: {}, logs: [], bootstrapCompleted: true, bootstrapRequired: false }; },
  async getTermsByMemberKey() { return { source: 'postgresql', memberKey: 'member:smoke', states: {}, logs: [] }; },
};
const adminClerkAuthService = {
  async authorizeCurrent({ clerkUserId }) {
    if (clerkUserId !== 'user_smoke') { const error = new Error('Admin not found.'); error.code = 'admin_not_found'; error.status = 404; throw error; }
    return { authority: 'clerk-postgresql-session', admin: adminRecord };
  },
  async getCurrent({ clerkUserId }) {
    if (clerkUserId !== 'user_smoke') { const error = new Error('Admin not found.'); error.code = 'admin_not_found'; error.status = 404; throw error; }
    return { authority: 'clerk-postgresql', admin: adminRecord };
  },
  async list() { return { source: 'postgresql', items: [adminRecord], totalCount: 1 }; },
  async create({ input }) { return { source: 'clerk-postgresql', admin: { ...adminRecord, id: 'admin:new', adminLoginId: input?.adminLoginId || 'new-admin' } }; },
  async update({ targetKey, input }) { return { source: 'clerk-postgresql', admin: { ...adminRecord, id: targetKey, ...input } }; },
  async setLock({ targetKey, locked }) { return { source: 'postgresql', admin: { ...adminRecord, id: targetKey, locked } }; },
  async retire({ targetKey }) { return { source: 'clerk-postgresql', retired: true, admin: { ...adminRecord, id: targetKey, status: 'retired' } }; },
  async migrateCurrent() { const error = new Error('Retired.'); error.code = 'admin_migration_retired'; error.status = 410; throw error; },
  async provisionTarget() { const error = new Error('Retired.'); error.code = 'admin_provision_retired'; error.status = 410; throw error; },
};
const systemConfig = new Map([
  ['admin-security', { sessionTimeoutMinutes: 60 }],
  ['user-session-policy', { sessionTimeoutMinutes: 120 }],
]);
const systemAuditLogs = [];
const systemConfigService = {
  async get(key) { return { source: 'postgresql', key, payload: systemConfig.get(key) || {} }; },
  async put({ key, payload }) { systemConfig.set(key, payload); return { source: 'postgresql', key, payload }; },
  async listAudit({ limit = 50 } = {}) { return { source: 'postgresql', logs: systemAuditLogs.slice(0, Number(limit) || 50) }; },
  async appendAudit({ input = {}, actorClerkUserId = '', admin = null } = {}) {
    const entry = { id: `AUDIT-${systemAuditLogs.length + 1}`, ...input, adminUid: actorClerkUserId, adminName: admin?.userName || 'Smoke Admin', createdAt: new Date().toISOString() };
    systemAuditLogs.unshift(entry);
    return { source: 'postgresql', entry };
  },
};
const userClerkAuthService = {
  async signupNative({ input }) { return { signup: { status: 'pending' }, account: { ...userAccount, memberStatus: 'pending', primaryEmail: input?.email || userAccount.primaryEmail }, clerkUser: { clerkUserId: 'clerk_native_smoke' } }; },
  async ensureRecoveryClerkIdentity() { return { ready: true, clerkUserId: 'user_smoke' }; },
  async getCurrent({ clerkUserId }) {
    if (clerkUserId !== 'user_smoke') { const error = new Error('User not found.'); error.code = 'user_not_found'; error.status = 404; throw error; }
    return { authority: 'clerk-postgresql', account: userAccount, clerkUser: { clerkUserId, primaryEmail: userAccount.primaryEmail, displayName: 'Smoke User' } };
  },
  async migrateCurrent() { const error = new Error('Legacy migration retired.'); error.code = 'legacy_user_migration_retired'; error.status = 410; throw error; },
  async provisionCurrent() { const error = new Error('Legacy provisioning retired.'); error.code = 'legacy_user_provision_retired'; error.status = 410; throw error; },
  async verifyPassword() { return { authority: 'clerk', verified: true, account: userAccount }; },
  async changePassword() { return { authority: 'clerk', changed: true, account: userAccount }; },
  async finalizeWithdrawal() { return { authority: 'postgresql', withdrawn: true, clerkDeleted: true, clerkCleanupError: '', account: userAccount }; },
};
const rentalRestrictionService = {
  async getCurrentByFirebaseIdentity() { return { source: 'postgresql-authoritative', exists: false, restriction: null }; },
  async readCurrentSourceByFirebaseIdentity() { return { source: 'postgresql-authoritative', exists: false, restriction: null }; },
  async syncLinkedFirebaseUid() { return { source: 'postgresql-authoritative', exists: false, restriction: null }; },
};
const rentalRequestService = {
  async getCurrent() { return { source: 'postgresql-authoritative', requests: [], count: 0 }; },
  async syncCurrent() { return { source: 'postgresql-authoritative', requests: [], count: 0, synchronized: true }; },
  async compareCurrent() { return { source: 'postgresql-authoritative', equivalent: true, changedRequestIds: [], changedFields: [] }; },
};
const rentalRequestWriteService = { async createCurrent() { return { authority: 'postgresql', request: { id: 'REQ-1', status: 'pending' }, firestoreMirror: 'retired' }; } };
const rentalRequestUserActionService = {
  async editCurrent() { return { authority: 'postgresql', operation: 'edit' }; },
  async cancelCurrent() { return { authority: 'postgresql', operation: 'cancel' }; },
  async extendCurrent() { return { authority: 'postgresql', operation: 'extend' }; },
};
const adminRentalRequestService = {
  async bootstrap() { return { source: 'postgresql', synchronized: 0 }; },
  async list() { return { source: 'postgresql', requests: [], items: [], totalCount: 0, counts: {} }; },
  async getDashboard() { return { source: 'postgresql', summary: { pending: 0, renting: 0, overdue: 0 }, counts: {} }; },
  async syncRequest() { return { source: 'postgresql', synchronized: true }; },
  async getEvents() { return { source: 'postgresql', events: [] }; },
  async editRequest() { return { authority: 'postgresql', request: { id: 'REQ-1' } }; },
  async saveMemo() { return { authority: 'postgresql', request: { id: 'REQ-1' } }; },
  async restoreStatus() { return { authority: 'postgresql', request: { id: 'REQ-1' } }; },
  async reviewUserAction() { return { authority: 'postgresql', request: { id: 'REQ-1' } }; },
  async changeStatus() { return { authority: 'postgresql', request: { id: 'REQ-1' } }; },
};
const assetService = {
  async getPublicCatalog() { return { source: 'postgresql', assets: [{ id: 'ASSET-1', assetNo: 'NB-001', status: 'available' }], categories: ['노트북'], availability: [] }; },
  async bootstrap() { return { source: 'postgresql', synchronized: 0 }; },
  async create() { return { authority: 'postgresql', asset: { id: 'ASSET-NEW' } }; },
  async edit() { return { authority: 'postgresql', asset: { id: 'ASSET-1' } }; },
  async delete() { return { authority: 'postgresql', deleted: true }; },
  async bulkCreate() { return { authority: 'postgresql', createdCount: 1 }; },
  async saveCategories() { return { authority: 'postgresql', categories: ['노트북'] }; },
};
const siteDomains = new Map([
  ['home', { source: 'postgresql', domain: 'home', documents: [{ key: 'homePage/config', payload: { enabled: true } }], count: 1 }],
  ['popup', { source: 'postgresql', domain: 'popup', documents: [], count: 0 }],
  ['site-settings', { source: 'postgresql', domain: 'site-settings', documents: [{ key: 'siteSettings/config', payload: { siteName: 'Smoke' } }], count: 1 }],
]);
let rentalConfigSettingsPatch = null;
let signupPolicyPatch = null;
let partialContentPatch = null;
const siteContentService = {
  async getDomain(domain) { return siteDomains.get(domain) || { source: 'postgresql', domain, documents: [], count: 0 }; },
  async syncDomain(domain) { return { ...(siteDomains.get(domain) || { domain, documents: [], count: 0 }), source: 'postgresql', synchronized: true }; },
  async replaceAdminDomain({ domain, documents }) { const result = { source: 'postgresql', domain, documents: documents || [], count: (documents || []).length, synchronized: true }; siteDomains.set(domain, result); return result; },
  async patchAdminDomain({ domain, upserts, deletes }) {
    partialContentPatch = { domain, upserts: upserts || [], deletes: deletes || [] };
    const existing = siteDomains.get(domain) || { source: 'postgresql', domain, documents: [], count: 0 };
    const byKey = new Map((existing.documents || []).map((document) => [document.key, document]));
    for (const key of deletes || []) byKey.delete(key);
    for (const document of upserts || []) byKey.set(document.key, document);
    const documents = [...byKey.values()];
    const result = { source: 'postgresql', domain, documents, documentCount: documents.length, count: documents.length, synchronized: true };
    siteDomains.set(domain, result);
    return result;
  },
  async patchRentalConfigSettings({ settingsPatch }) {
    rentalConfigSettingsPatch = settingsPatch || {};
    return {
      source: 'postgresql',
      domain: 'rental-config',
      documents: [{ key: 'rentalSystem/publicConfig', payload: { settings: rentalConfigSettingsPatch } }],
      count: 1,
      synchronized: true,
    };
  },
  async patchSignupPolicy({ policyPatch }) {
    signupPolicyPatch = policyPatch || {};
    return {
      authority: 'postgresql',
      operation: 'signup-policy-patch',
      settings: { ...signupPolicyPatch, memberDirectoryVersion: 2 },
      termsPolicy: { enabled: Boolean(signupPolicyPatch.signupTermsEnabled), activeTerms: [{ id: 't1', title: 'Terms' }] },
    };
  },
};
const boardService = {
  async getStatus() { return { source: 'postgresql', synchronized: true, noticeCount: 1, faqCount: 1, faqCategoryCount: 1 }; },
  async listNotice() { return { source: 'postgresql', config: { postsPerPage: 10 }, pinnedPosts: [], regularPosts: [{ id: 'NOTICE-1', title: 'Smoke notice' }], totalRegularCount: 1, hasNextPage: false }; },
  async getNotice(postId) { return { id: postId, title: 'Smoke notice', viewCount: 1 }; },
  async incrementNoticeView() { return 2; },
  async listFaq() { return { source: 'postgresql', config: { postsPerPage: 10 }, categories: [], pinnedPosts: [], regularPosts: [], totalRegularCount: 0, hasNextPage: false }; },
  async bootstrap() { return { source: 'postgresql', synchronized: 0 }; },
  async saveNotice() { return { authority: 'postgresql', firestoreMirror: 'retired', post: { id: 'NOTICE-NEW' } }; },
  async deleteNotice() { return { authority: 'postgresql', firestoreMirror: 'retired', deletedPost: { id: 'NOTICE-1' } }; },
  async saveFaq() { return { authority: 'postgresql', firestoreMirror: 'retired', post: { id: 'FAQ-NEW' } }; },
  async deleteFaq() { return { authority: 'postgresql', firestoreMirror: 'retired', deletedPost: { id: 'FAQ-1' } }; },
  async saveConfig() { return { authority: 'postgresql', firestoreMirror: 'retired', config: { postsPerPage: 20 } }; },
  async saveFaqCategory() { return { authority: 'postgresql', firestoreMirror: 'retired', category: { id: 'CAT-1' } }; },
  async deleteFaqCategory() { return { authority: 'postgresql', firestoreMirror: 'retired', deletedCategory: { id: 'CAT-1' } }; },
};

const server = createServer(createRequestHandler({
  config,
  databaseCheck,
  authenticateRequest,
  userIdentityService,
  firebaseLinkService,
  memberShadowService,
  memberAuthorityService,
  accountRecoveryService,
  accountLifecycleService,
  adminClerkAuthService,
  systemConfigService,
  userClerkAuthService,
  rentalRestrictionService,
  rentalRequestService,
  rentalRequestWriteService,
  rentalRequestUserActionService,
  adminRentalRequestService,
  assetService,
  siteContentService,
  boardService,
}));

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve smoke-test port.');
const baseUrl = `http://127.0.0.1:${address.port}`;
const authHeaders = { Authorization: 'Bearer smoke-token', Origin: allowedOrigin };

try {
  const live = await fetch(`${baseUrl}/health/live`);
  if (live.status !== 200 || (await live.json()).status !== 'ok') throw new Error('Liveness endpoint failed.');

  const ready = await fetch(`${baseUrl}/health`, { headers: { Origin: allowedOrigin } });
  if (ready.status !== 200) throw new Error(`/health returned ${ready.status}`);
  const health = await ready.json();
  if (health.database?.status !== 'ok') throw new Error('Database health is invalid.');
  if (health.authority?.userAuthentication !== 'clerk-postgresql') throw new Error('User authentication authority is not Clerk/PostgreSQL.');
  if (health.authority?.passwordReset !== 'clerk-email-code') throw new Error('Password reset delivery is not Clerk email code.');
  if (health.phase34RuntimeRevision !== 'phase34-clerk-postgresql-runtime-authority-20260813-1438') throw new Error('Phase 34 runtime revision is invalid.');
  if (ready.headers.get('access-control-allow-origin') !== allowedOrigin) throw new Error('Allowed CORS origin was not reflected.');
  const allowedHeaders = ready.headers.get('access-control-allow-headers') || '';
  if (!allowedHeaders.includes('Authorization') || allowedHeaders.includes('X-Firebase-Authorization')) throw new Error('Phase 34 CORS headers are invalid.');

  const preflight = await fetch(`${baseUrl}/api/admin/site-content/rental-config/settings`, {
    method: 'OPTIONS',
    headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' },
  });
  if (preflight.status !== 204) throw new Error(`Administrator rental-config PATCH preflight returned ${preflight.status}`);
  if (!(preflight.headers.get('access-control-allow-methods') || '').includes('PATCH')) throw new Error('Administrator rental-config preflight does not allow PATCH.');

  const largeHolidayList = Array.from({ length: 700 }, (_, index) => ({
    date: `2027-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
    name: `Smoke holiday ${index} ${'x'.repeat(72)}`,
    type: 'holiday',
    enabled: true,
  }));
  const largeHolidayBody = JSON.stringify({ settings: { holidays: largeHolidayList } });
  if (Buffer.byteLength(largeHolidayBody, 'utf8') <= 32 * 1024) throw new Error('Large holiday smoke payload must exceed the former 32KB body limit.');
  if (Buffer.byteLength(largeHolidayBody, 'utf8') >= 512 * 1024) throw new Error('Large holiday smoke payload must remain below the endpoint safety limit.');
  const largeHolidaySave = await fetch(`${baseUrl}/api/admin/site-content/rental-config/settings`, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: largeHolidayBody,
  });
  if (largeHolidaySave.status !== 200) {
    const failureBody = await largeHolidaySave.text();
    throw new Error(`Large administrator holiday save returned ${largeHolidaySave.status}: ${failureBody}`);
  }
  const largeHolidaySaveBody = await largeHolidaySave.json();
  if (largeHolidaySaveBody.rentalConfigMutation?.operation !== 'settings-patch') throw new Error('Large administrator holiday save did not use the PostgreSQL settings-patch authority.');
  if (rentalConfigSettingsPatch?.holidays?.length !== largeHolidayList.length) throw new Error('Large administrator holiday payload was not delivered intact to the PostgreSQL settings service.');

  const session = await fetch(`${baseUrl}/api/auth/session`, { headers: authHeaders });
  if (session.status !== 200 || (await session.json()).session?.userId !== 'user_smoke') throw new Error('Clerk session endpoint failed.');

  const nativeSignup = await fetch(`${baseUrl}/api/users/signup/clerk`, {
    method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'native@example.com', password: 'SmokePassword!1', name: 'Native Smoke', team: 'QA', phone: '010-1111-2222' }),
  });
  const nativeSignupBody = await nativeSignup.json();
  if (nativeSignup.status !== 201 || nativeSignupBody.signupLifecycle?.authority !== 'clerk-postgresql' || nativeSignupBody.signupLifecycle?.firebaseAuthCompatibility !== 'retired') throw new Error('Native Clerk/PostgreSQL signup failed.');

  const userSession = await fetch(`${baseUrl}/api/users/auth/session`, { headers: authHeaders });
  const userSessionBody = await userSession.json();
  if (userSession.status !== 200 || userSessionBody.userAuthentication?.authority !== 'clerk-postgresql' || userSessionBody.userAuthentication?.firebaseAuthCompatibility !== 'retired') throw new Error('User authority session failed.');

  const terms = await fetch(`${baseUrl}/api/users/me/terms-consent`, { headers: authHeaders });
  if (terms.status !== 200 || (await terms.json()).termsConsent?.source !== 'postgresql') throw new Error('PostgreSQL terms read failed.');
  const termsSave = await fetch(`${baseUrl}/api/users/me/terms-consent`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ policyRevision: 5, decisions: [] }) });
  if (termsSave.status !== 200 || !termsSaved) throw new Error('PostgreSQL terms save failed.');

  const publicContent = await fetch(`${baseUrl}/api/site-content/home`, { headers: { Origin: allowedOrigin } });
  const publicContentBody = await publicContent.json();
  if (publicContent.status !== 200 || publicContentBody.siteContent?.source !== 'postgresql') throw new Error('Public PostgreSQL site content failed.');

  const adminSession = await fetch(`${baseUrl}/api/admin/auth/session`, { headers: authHeaders });
  const adminSessionBody = await adminSession.json();
  if (adminSession.status !== 200 || adminSessionBody.adminAuthentication?.authority !== 'clerk-postgresql') throw new Error('Administrator Clerk/PostgreSQL session failed.');

  const signupPolicy = await fetch(`${baseUrl}/api/admin/member-signup-policy`, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy: { requireRegisteredMemberForSignup: true, autoApproveNewMembers: true, signupTermsEnabled: true, signupTermsRequireReconsentOnChange: true, signupTermsApplyToExistingMembers: false } }),
  });
  const signupPolicyBody = await signupPolicy.json();
  if (signupPolicy.status !== 200 || signupPolicyBody.signupPolicyMutation?.authority !== 'postgresql') throw new Error('PostgreSQL signup policy patch failed.');
  if (signupPolicyPatch?.requireRegisteredMemberForSignup !== true) throw new Error('Signup policy payload did not reach the PostgreSQL policy service.');

  const directoryAudit = await fetch(`${baseUrl}/api/admin/member-directory/audit`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: '{}' });
  const directoryAuditBody = await directoryAudit.json();
  if (directoryAudit.status !== 200 || directoryAuditBody.memberDirectoryAudit?.authority !== 'postgresql' || directoryAuditBody.memberDirectoryAudit?.audit?.normal !== 1) throw new Error('PostgreSQL member directory audit failed.');

  const directoryRestore = await fetch(`${baseUrl}/api/admin/member-directory/restore-mismatches`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: '{}' });
  const directoryRestoreBody = await directoryRestore.json();
  if (directoryRestore.status !== 200 || directoryRestoreBody.memberDirectoryRestore?.authority !== 'postgresql' || directoryRestoreBody.memberDirectoryRestore?.restoredCount !== 1) throw new Error('PostgreSQL member directory restore failed.');

  const largeDirectoryEntries = Array.from({ length: 220 }, (_, index) => ({
    id: `directory-smoke-${index + 1}`,
    name: `대용량 명부 사용자 ${index + 1}`,
    team: `부서-${index % 12}`,
    phone: `010${String(index).padStart(8, '0')}`,
    email: `directory-smoke-${index + 1}@example.com`,
    note: 'member-directory-body-limit-smoke-'.repeat(8),
    enabled: true,
  }));
  const largeDirectoryBody = JSON.stringify({ entries: largeDirectoryEntries, version: 2, teams: ['부서-0', '부서-1'], settings: { memberDirectoryVersion: 2, requireRegisteredMemberForSignup: true } });
  if (Buffer.byteLength(largeDirectoryBody, 'utf8') <= 32 * 1024) throw new Error('Large member-directory smoke payload must exceed the former 32KB generic body limit.');
  if (Buffer.byteLength(largeDirectoryBody, 'utf8') >= 2 * 1024 * 1024) throw new Error('Large member-directory smoke payload must remain below the dedicated 2MB safety limit.');
  const directorySync = await fetch(`${baseUrl}/api/admin/member-directory/sync`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: largeDirectoryBody,
  });
  const directorySyncBody = await directorySync.json();
  if (directorySync.status !== 200 || directorySyncBody.memberDirectorySync?.authority !== 'postgresql' || directorySyncBody.memberDirectorySync?.target !== 'postgresql-member-directory') throw new Error('Large PostgreSQL member directory synchronization failed.');
  if (!Array.isArray(memberDirectorySyncInput?.teams) || memberDirectorySyncInput.teams[0] !== '부서-0' || Number(memberDirectorySyncInput?.settings?.memberDirectoryVersion || 0) !== 2) throw new Error('Member-directory synchronization did not forward organization configuration into the authoritative server mutation.');

  const accounts = await fetch(`${baseUrl}/api/admin/accounts`, { headers: authHeaders });
  if (accounts.status !== 200 || (await accounts.json()).adminAccounts?.totalCount !== 1) throw new Error('PostgreSQL administrator account list failed.');
  const createAdmin = await fetch(`${baseUrl}/api/admin/accounts`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ adminLoginId: 'new-admin', authEmail: 'new@example.com', adminRole: 'admin' }) });
  if (createAdmin.status !== 201) throw new Error('Clerk/PostgreSQL administrator create failed.');
  const updateAdmin = await fetch(`${baseUrl}/api/admin/accounts/admin%3Anew`, { method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ adminRole: 'viewer' }) });
  if (updateAdmin.status !== 200) throw new Error('Clerk/PostgreSQL administrator update failed.');
  const lockAdmin = await fetch(`${baseUrl}/api/admin/accounts/admin%3Anew/lock`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ locked: true }) });
  if (lockAdmin.status !== 200) throw new Error('PostgreSQL administrator lock failed.');
  const deleteAdmin = await fetch(`${baseUrl}/api/admin/accounts/admin%3Anew`, { method: 'DELETE', headers: authHeaders });
  if (deleteAdmin.status !== 200) throw new Error('Clerk/PostgreSQL administrator retire failed.');

  const userPolicy = await fetch(`${baseUrl}/api/system-config/user-session-policy`, { headers: { Origin: allowedOrigin } });
  if (userPolicy.status !== 200 || (await userPolicy.json()).systemConfiguration?.source !== 'postgresql') throw new Error('Public PostgreSQL session policy failed.');
  const adminPolicySave = await fetch(`${baseUrl}/api/admin/system-config/admin-security`, { method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: { sessionTimeoutMinutes: 30 } }) });
  if (adminPolicySave.status !== 200 || (await adminPolicySave.json()).systemConfiguration?.payload?.sessionTimeoutMinutes !== 30) throw new Error('Administrator PostgreSQL security setting save failed.');

  const systemAuditWrite = await fetch(`${baseUrl}/api/admin/system-settings-audit`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audit: { action: 'smoke-setting-update', section: 'Smoke Settings', summary: 'Audit history smoke write', beforeValues: { enabled: false }, afterValues: { enabled: true } } }),
  });
  const systemAuditWriteBody = await systemAuditWrite.json();
  if (systemAuditWrite.status !== 200 || systemAuditWriteBody.systemSettingsAuditMutation?.source !== 'postgresql' || !systemAuditWriteBody.systemSettingsAuditMutation?.entry?.id) throw new Error('Administrator system settings audit write failed.');
  const systemAuditRead = await fetch(`${baseUrl}/api/admin/system-settings-audit?limit=50`, { headers: authHeaders });
  const systemAuditReadBody = await systemAuditRead.json();
  if (systemAuditRead.status !== 200 || systemAuditReadBody.systemSettingsAudit?.source !== 'postgresql' || systemAuditReadBody.systemSettingsAudit?.logs?.[0]?.action !== 'smoke-setting-update') throw new Error('Administrator system settings audit read failed.');

  const dashboard = await fetch(`${baseUrl}/api/admin/rental-dashboard`, { headers: authHeaders });
  if (dashboard.status !== 200 || (await dashboard.json()).adminRentalDashboard?.source !== 'postgresql') throw new Error('PostgreSQL administrator dashboard failed.');
  const members = await fetch(`${baseUrl}/api/admin/members`, { headers: authHeaders });
  if (members.status !== 200 || (await members.json()).adminMembers?.source !== 'postgresql') throw new Error('PostgreSQL administrator members endpoint failed.');
  const assets = await fetch(`${baseUrl}/api/assets/catalog`, { headers: { Origin: allowedOrigin } });
  if (assets.status !== 200 || (await assets.json()).assetCatalog?.source !== 'postgresql') throw new Error('PostgreSQL asset catalog failed.');

  const largeTermHtml = `<p>${'Large terms body '.repeat(4500)}</p>`;
  const largeTermsPatchBody = JSON.stringify({
    upserts: [{
      key: 'signupTerms/terms-smoke-large',
      payload: { id: 'terms-smoke-large', title: 'Large terms', contentHtml: largeTermHtml, enabled: true },
      enabled: true,
      sortOrder: 0,
    }],
    deletes: [],
  });
  if (Buffer.byteLength(largeTermsPatchBody, 'utf8') <= 32 * 1024) throw new Error('Large terms patch smoke payload must exceed the former 32KB generic body limit.');
  if (Buffer.byteLength(largeTermsPatchBody, 'utf8') >= 2 * 1024 * 1024) throw new Error('Large terms patch smoke payload must remain below the dedicated safety limit.');
  const largeTermsPatch = await fetch(`${baseUrl}/api/admin/site-content/terms`, {
    method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: largeTermsPatchBody,
  });
  if (largeTermsPatch.status !== 200) {
    const failureBody = await largeTermsPatch.text();
    throw new Error(`Large PostgreSQL terms patch returned ${largeTermsPatch.status}: ${failureBody}`);
  }
  const largeTermsPatchPayload = await largeTermsPatch.json();
  if (largeTermsPatchPayload.siteContentMutation?.sourceMode !== 'postgresql-admin-patch') throw new Error('Large terms mutation did not use PostgreSQL partial patch authority.');
  if (partialContentPatch?.domain !== 'terms' || partialContentPatch?.upserts?.length !== 1) throw new Error('Large terms patch did not reach the PostgreSQL partial content service.');

  const largeFooterHtml = `<p>${'Large footer common body '.repeat(4500)}</p>`;
  const largeFooterPatchBody = JSON.stringify({
    upserts: [{
      key: 'siteFooter/config',
      payload: { enabled: true, contentHtml: largeFooterHtml, contentFormat: 'rich-html-v1' },
      enabled: true,
    }],
    deletes: [],
  });
  if (Buffer.byteLength(largeFooterPatchBody, 'utf8') <= 32 * 1024) throw new Error('Large footer patch smoke payload must exceed the former 32KB generic body limit.');
  if (Buffer.byteLength(largeFooterPatchBody, 'utf8') >= 2 * 1024 * 1024) throw new Error('Large footer patch smoke payload must remain below the dedicated safety limit.');
  const largeFooterPatch = await fetch(`${baseUrl}/api/admin/site-content/footer`, {
    method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: largeFooterPatchBody,
  });
  if (largeFooterPatch.status !== 200) {
    const failureBody = await largeFooterPatch.text();
    throw new Error(`Large PostgreSQL footer patch returned ${largeFooterPatch.status}: ${failureBody}`);
  }
  const largeFooterPatchPayload = await largeFooterPatch.json();
  if (largeFooterPatchPayload.siteContentMutation?.sourceMode !== 'postgresql-admin-patch') throw new Error('Large footer mutation did not use PostgreSQL partial patch authority.');
  if (partialContentPatch?.domain !== 'footer' || partialContentPatch?.upserts?.length !== 1 || partialContentPatch.upserts[0]?.key !== 'siteFooter/config') throw new Error('Large footer patch did not reach the PostgreSQL partial content service as a config-only mutation.');

  const replaceContent = await fetch(`${baseUrl}/api/admin/site-content/home`, {
    method: 'PUT', headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: [{ key: 'homePage/config', payload: { enabled: true, title: 'Updated' } }] }),
  });
  if (replaceContent.status !== 200 || (await replaceContent.json()).siteContent?.source !== 'postgresql') throw new Error('PostgreSQL administrator content write failed.');

  const notices = await fetch(`${baseUrl}/api/boards/notice`, { headers: { Origin: allowedOrigin } });
  if (notices.status !== 200 || (await notices.json()).board?.source !== 'postgresql') throw new Error('PostgreSQL notice board read failed.');

  const unauthenticatedAdmin = await fetch(`${baseUrl}/api/admin/accounts`, { headers: { Origin: allowedOrigin } });
  if (unauthenticatedAdmin.status !== 401) throw new Error('Unauthenticated administrator request was not rejected.');

  console.log('[server-smoke] PASS (Phase 34 Clerk/PostgreSQL HTTP runtime; retired external authorization headers removed)');
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
