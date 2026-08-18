import assert from 'node:assert/strict';
import { createRentalRestrictionService } from '../../server/src/restrictions/rental-restriction-service.mjs';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';
import { createSiteContentRepository } from '../../server/src/content/site-content-repository.mjs';
import { createBoardRepository } from '../../server/src/boards/board-repository.mjs';
import { createClerkDeviceTrustService } from '../../server/src/clerk/clerk-device-trust-service.mjs';
import { readServerConfig } from '../../server/src/config/env.mjs';
import { createAdminRentalRequestService } from '../../server/src/rentals/admin-rental-request-service.mjs';
import { createAccountLifecycleService } from '../../server/src/accounts/account-lifecycle-service.mjs';
import { createAdminClerkAuthService } from '../../server/src/auth/admin-clerk-auth-service.mjs';
import { createMemberAuthorityService } from '../../server/src/members/member-authority-service.mjs';
import fs from 'node:fs';

let adminPasswordUpdate = null;
const adminPasswordOwner = { legacyAdminKey: 'admin:owner', firebaseUid: 'admin:owner', adminLoginId: 'owner', authEmail: 'owner@example.com', organizationName: '관리팀', userName: '최고관리자', phone: '', adminRole: 'owner', clerkUserId: 'clerk_owner', clerkLinkState: 'linked', status: 'active', lockUntil: null };
const adminPasswordTarget = { legacyAdminKey: 'admin:target', firebaseUid: 'admin:target', adminLoginId: 'target', authEmail: 'target@example.com', organizationName: '관리팀', userName: '대상관리자', phone: '', adminRole: 'admin', clerkUserId: 'clerk_target', clerkLinkState: 'linked', status: 'active', lockUntil: null };
const adminPasswordRegular = { ...adminPasswordOwner, legacyAdminKey: 'admin:regular', firebaseUid: 'admin:regular', adminLoginId: 'regular', authEmail: 'regular@example.com', userName: '일반관리자', adminRole: 'admin', clerkUserId: 'clerk_regular' };
const adminPasswordService = createAdminClerkAuthService({
  repository: {
    async findByClerkUserId(clerkUserId) {
      if (clerkUserId === 'clerk_owner') return adminPasswordOwner;
      if (clerkUserId === 'clerk_regular') return adminPasswordRegular;
      if (clerkUserId === 'clerk_target') return adminPasswordTarget;
      return null;
    },
    async findByFirebaseUid(key) {
      if (key === 'admin:owner') return adminPasswordOwner;
      if (key === 'admin:regular') return adminPasswordRegular;
      if (key === 'admin:target') return adminPasswordTarget;
      return null;
    },
    async listActive() { return [adminPasswordOwner, adminPasswordRegular, adminPasswordTarget]; },
    async findByAdminLoginId(adminLoginId) { return [adminPasswordOwner, adminPasswordRegular, adminPasswordTarget].find((item) => item.adminLoginId.toLowerCase() === String(adminLoginId || '').toLowerCase()) || null; },
  },
  clerkClient: {
    async getUser() { return { primaryEmail: 'owner@example.com' }; },
    async findUserByEmail() { return null; },
    async createUser() { throw new Error('not used'); },
    async updateUser(clerkUserId, input) { adminPasswordUpdate = { clerkUserId, input }; return { clerkUserId }; },
    async updateUserMetadata() {},
    async verifyPassword(clerkUserId, password) {
      if (clerkUserId !== 'clerk_target' || password !== 'TargetPassword1234') {
        const error = new Error('invalid password'); error.status = 422; throw error;
      }
      return { verified: true };
    },
    async deleteUser() {},
  },
});
const resolvedAdminLogin = await adminPasswordService.resolveLoginIdentifier({ identifier: 'target', password: 'TargetPassword1234' });
assert.equal(resolvedAdminLogin.authority, 'clerk-postgresql-login-resolver');
assert.equal(resolvedAdminLogin.authEmail, 'target@example.com');
await assert.rejects(
  () => adminPasswordService.resolveLoginIdentifier({ identifier: 'target', password: 'wrong-password' }),
  (error) => error?.code === 'admin_login_credentials_invalid' && error?.status === 401,
);

const adminPasswordChanged = await adminPasswordService.changePassword({ actorClerkUserId: 'clerk_owner', targetKey: 'admin:target', newPassword: 'AdminChanged1234' });
assert.equal(adminPasswordChanged.changed, true);
assert.deepEqual(adminPasswordUpdate, { clerkUserId: 'clerk_target', input: { password: 'AdminChanged1234' } });
await assert.rejects(
  () => adminPasswordService.changePassword({ actorClerkUserId: 'clerk_regular', targetKey: 'admin:target', newPassword: 'AdminChanged1234' }),
  (error) => error?.code === 'admin_owner_required' && error?.status === 403,
);
const selfPasswordChanged = await adminPasswordService.changePassword({ actorClerkUserId: 'clerk_regular', targetKey: 'admin:regular', newPassword: 'SelfChanged1234' });
assert.equal(selfPasswordChanged.changed, true);
assert.deepEqual(adminPasswordUpdate, { clerkUserId: 'clerk_regular', input: { password: 'SelfChanged1234' } });

let adminStatusMutationArgs = null;
const adminRentalServiceContract = createAdminRentalRequestService({
  repository: {
    async list() { return { requests: [], totalCount: 0, tabCounts: {} }; },
    async changeStatus(args) {
      adminStatusMutationArgs = args;
      return {
        id: args.requestId, requesterUid: 'member-1', requesterEmail: 'member@example.com', requesterName: 'Member',
        requesterTeam: 'QA', laptopId: 'asset-1', assetCategory: '노트북', assetNo: 'A-1', startDate: '2026-08-15',
        dueDate: '2026-08-16', purpose: 'Phase34 admin status contract', status: args.nextStatus,
      };
    },
    async hasOtherCurrentOverdue() { return false; },
  },
  postgresSource: {
    async getRentalRequest() {
      return { name: 'postgresql/app_rental_requests/REQ-BOOT-1', fields: {
        id: 'REQ-BOOT-1', requesterUid: 'member-1', requesterEmail: 'member@example.com', requesterName: 'Member',
        requesterTeam: 'QA', laptopId: 'asset-1', assetCategory: '노트북', assetNo: 'A-1', startDate: '2026-08-15',
        dueDate: '2026-08-16', purpose: 'Phase34 admin status contract', status: '신청중',
      } };
    },
    async getRentalAsset() { return { fields: { id: 'asset-1', status: '대여가능', reservations: [] } }; },
    async getPublicConfig() { return { fields: { settings: { allowNonOverlappingSameAssetRequests: true } } }; },
    async getRentalRestriction() { return null; },
  },
});
assert.equal(typeof adminRentalServiceContract.changeStatus, 'function', 'admin rental request service must expose the Phase 17/19 status mutation contract required at server boot');
const adminStatusMutationResult = await adminRentalServiceContract.changeStatus(
  { uid: 'admin-1', source: 'clerk-postgresql' },
  { requestId: 'REQ-BOOT-1', nextStatus: '대여중' },
);
assert.equal(adminStatusMutationResult.authority, 'postgresql');
assert.equal(adminStatusMutationResult.request.status, '대여중');
assert.equal(adminStatusMutationArgs.requestId, 'REQ-BOOT-1');
assert.equal(adminStatusMutationArgs.nextStatus, '대여중');
assert.equal(adminStatusMutationArgs.allowNonOverlappingSameAssetRequests, true);

let adminUserActionReviewArgs = null;
const adminUserActionReviewService = createAdminRentalRequestService({
  repository: {
    async list() { return { requests: [], totalCount: 0, tabCounts: {} }; },
    async reviewUserAction(args) { adminUserActionReviewArgs = args; return { ...args.nextRequest, id: args.requestId }; },
    async hasOtherCurrentOverdue() { return false; },
  },
  postgresSource: {
    async getRentalRequest() {
      return { name: 'postgresql/app_rental_requests/REQ-ACTION-1', fields: {
        id: 'REQ-ACTION-1', requesterUid: 'member-1', requesterEmail: 'member@example.com', requesterName: 'Member',
        requesterTeam: 'QA', laptopId: 'asset-1', assetCategory: '노트북', assetNo: 'A-1', startDate: '2026-08-15',
        dueDate: '2026-08-16', purpose: 'Phase34 user action contract', status: '신청중',
        userActionRequest: { type: 'cancel', status: 'pending', reason: 'test' },
      } };
    },
    async getRentalAsset() { return { fields: { id: 'asset-1', status: '대여가능', reservations: [
      { id: 'REQ-ACTION-1', laptopId: 'asset-1', startDate: '2026-08-15', dueDate: '2026-08-16', status: '신청중' },
    ] } }; },
    async getPublicConfig() { return { fields: { settings: {} } }; },
    async getRentalRestriction() { return null; },
  },
});
const deniedUserActionResult = await adminUserActionReviewService.reviewUserAction(
  { uid: 'admin-1', source: 'clerk-postgresql' },
  { requestId: 'REQ-ACTION-1', approved: false },
);
assert.equal(deniedUserActionResult.authority, 'postgresql');
assert.equal(deniedUserActionResult.restrictionUpdated, false);
assert.equal(adminUserActionReviewArgs.approved, false);
assert.equal(adminUserActionReviewArgs.nextRequest.userActionRequest.status, 'denied');

const termsPolicyReads = [];
let consentSnapshotOptions = null;
const accountLifecycleTermsService = createAccountLifecycleService({
  authorityEnabled: true,
  repository: {
    async createSignupAccount() { return {}; },
    async findRetiredAccountsByEmail() { return []; },
    async getConsentSnapshot(firebaseUid, options = {}) {
      assert.equal(firebaseUid, 'member-terms-1');
      consentSnapshotOptions = options;
      return { states: {}, logs: [], termsConsentRevision: 3, termsConsentPolicyVersion: 3, bootstrapCompleted: true };
    },
    async importConsents() { return {}; },
    async saveConsents() { return {}; },
  },
  siteContentRepository: {
    async getDocument(domain, key) {
      termsPolicyReads.push(`${domain}:${key}`);
      assert.equal(domain, 'terms');
      assert.equal(key, 'signupTermsPolicy/current');
      return { payload: { enabled: true, revision: 4, requiredRevision: 4, activeTerms: [{ id: 'term-1', title: '테스트 약관', required: true, version: 1, versionId: 'v1', contentHash: 'hash-1' }] } };
    },
  },
  userAuthRepository: {
    async findByClerkUserId(clerkUserId) {
      assert.equal(clerkUserId, 'clerk-user-terms-1');
      return { firebaseUid: 'member-terms-1' };
    },
  },
});
const leanTermsSnapshot = await accountLifecycleTermsService.getTerms({ clerkUserId: 'clerk-user-terms-1', includeLogs: false });
assert.equal(leanTermsSnapshot.source, 'postgresql');
assert.deepEqual(consentSnapshotOptions, { includeLogs: false });
assert.deepEqual(termsPolicyReads, ['terms:signupTermsPolicy/current'], 'reconsent initial read must not fetch unrelated rental-config content');

const rentalRestrictionRepository = {
  async findByFirebaseUid() { return null; },
  async findByAppUserId(appUserId) {
    assert.equal(String(appUserId), '55');
    return null;
  },
  async upsert(value) { return value; },
};
const firebaseLinkRepository = {
  async findByFirebaseUid() { return null; },
};
const service = createRentalRestrictionService({
  firebaseLinkRepository,
  rentalRestrictionRepository,
  firestoreRentalRestrictionClient: null,
  firebaseCompatibilityRequired: false,
});
const current = await service.getCurrentForAppUser({ appUserId: 55, legacyMemberKey: 'clerk-native:test' });
assert.equal(current.exists, false);
assert.equal(current.restriction, null);
assert.equal(current.authorityMode, 'postgresql-authoritative');
assert.equal(current.mirrorState, 'retired');
assert.equal(current.appUserId, '55');
assert.equal(current.firebaseUid, 'clerk-native:test');



let currentRentalConfig = {
  domain: 'rental-config',
  source: 'postgresql',
  authoritative: true,
  synchronized: true,
  sourceMode: 'postgresql-admin-direct',
  sourceHash: 'before',
  syncedAt: new Date().toISOString(),
  documentCount: 1,
  documents: [{
    key: 'rentalSystem/publicConfig',
    payload: {
      storageVersion: 4,
      assetCategories: ['노트북'],
      settings: { maxRentalDays: 10, holidays: [], signupTermsEnabled: true, signupTermsPolicyRevision: 7 },
    },
    enabled: null,
    sortOrder: null,
    sourceUpdatedAt: null,
  }],
};
let replaceArgs = null;
const siteContentService = createSiteContentService({
  repository: {
    async getDomain(domain) {
      assert.equal(domain, 'rental-config');
      return currentRentalConfig;
    },
    async replaceDomain(args) {
      replaceArgs = args;
      currentRentalConfig = {
        ...currentRentalConfig,
        sourceMode: args.sourceMode,
        documents: args.documents,
        documentCount: args.documents.length,
      };
      return currentRentalConfig;
    },
  },
});
const patchedRentalConfig = await siteContentService.patchRentalConfigSettings({
  settingsPatch: { holidays: [{ date: '2026-08-15', enabled: true }] },
  actorClerkUserId: 'clerk-admin-1',
});
assert.equal(replaceArgs.domain, 'rental-config');
assert.equal(replaceArgs.sourceMode, 'postgresql-admin-settings-patch');
assert.equal(replaceArgs.actorClerkUserId, 'clerk-admin-1');
const canonical = patchedRentalConfig.documents.find((document) => document.key === 'rentalSystem/publicConfig');
assert.equal(canonical.payload.assetCategories, undefined, 'settings patch must strip retired rental-config asset-category duplication');
assert.equal(canonical.payload.settings.signupTermsEnabled, undefined, 'settings patch must strip retired rental-config signup-terms duplication');
assert.equal(canonical.payload.settings.signupTermsPolicyRevision, undefined, 'settings patch must strip retired rental-config signup-terms revision duplication');
assert.equal(canonical.payload.settings.maxRentalDays, 10, 'holiday patch must preserve other rental policy settings');
assert.deepEqual(canonical.payload.settings.holidays, [{ date: '2026-08-15', enabled: true }]);

const appSource = fs.readFileSync(new URL('../../server/src/app.mjs', import.meta.url), 'utf8');
const accountLifecycleRepositorySource = fs.readFileSync(new URL('../../server/src/accounts/account-lifecycle-repository.mjs', import.meta.url), 'utf8');
assert.match(appSource, /includeLogs: url\.searchParams\.get\('includeLogs'\) !== '0'/, 'terms-consent endpoint must expose the lean no-history initial read');
assert.match(accountLifecycleRepositorySource, /includeLogs[\s\S]*Promise\.resolve\(\{ rows: \[\] \}\)/, 'lean terms-consent reads must skip the historical log query entirely');
assert.match(appSource, /PATCH' && url\.pathname === '\/api\/admin\/site-content\/rental-config\/settings'/);
assert.match(appSource, /'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'/, 'browser CORS preflight must allow PATCH for administrator rental-config writes');
assert.match(
  appSource,
  /PATCH' && url\.pathname === '\/api\/admin\/site-content\/rental-config\/settings'[\s\S]*?readJsonBody\(request, \{ maxBytes: 512 \* 1024 \}\)/,
  'administrator rental-config settings writes must accept accumulated holiday payloads above the former 32KB request limit'
);
assert.match(
  appSource,
  /PATCH' && url\.pathname === '\/api\/admin\/site-content\/rental-config\/settings'[\s\S]*?readJsonBody\(request, \{ maxBytes: 512 \* 1024 \}\)/,
  'administrator rental-config settings writes must accept accumulated holiday payloads above the former 32KB request limit'
);
assert.match(appSource, /phase34AdminNavigationHolidayRevision/);

const siteContentRepositorySource = fs.readFileSync(new URL('../../server/src/content/site-content-repository.mjs', import.meta.url), 'utf8');
const siteContentServiceSource = fs.readFileSync(new URL('../../server/src/content/site-content-service.mjs', import.meta.url), 'utf8');
assert.match(siteContentRepositorySource, /payload->>'addressId'/, 'PostgreSQL footer patches must inspect persisted public address IDs under the domain advisory lock');
assert.match(siteContentRepositorySource, /footer_page_address_conflict/, 'PostgreSQL must reject duplicate footer address IDs instead of overwriting another page');
assert.match(siteContentServiceSource, /addressClaims/, 'site-content service must pass footer address claims into the transactional repository patch');
assert.match(appSource, /addressClaims: body\?\.addressClaims/, 'administrator site-content PATCH must pass footer address uniqueness claims from the authenticated request');
assert.match(siteContentRepositorySource, /const getAdminSiteContentCatalog = async/, 'PostgreSQL site-content repository must expose a lightweight administrator popup/footer catalog read');
assert.match(siteContentRepositorySource, /payload - 'content' - 'contentText' - 'contentHtml'/, 'administrator popup catalog SQL must strip rich-content bodies before they leave PostgreSQL');
assert.match(siteContentRepositorySource, /document_key LIKE 'footerPages\/%'[\s\S]*payload - 'content' - 'contentText' - 'contentHtml'/, 'administrator footer page catalog SQL must strip rich-content bodies while preserving the common footer config');
assert.match(siteContentRepositorySource, /document_key LIKE 'popupPosts\/%'/, 'administrator popup catalog must exclude unrelated domain documents');
assert.match(siteContentRepositorySource, /document_key = 'siteFooter\/config' OR document_key LIKE 'footerPages\/%'/, 'administrator footer catalog must include only common config and footer pages');
assert.match(siteContentServiceSource, /async getAdminSiteContentDocument\(domainValue, documentIdValue\)/, 'administrator popup/footer editors must hydrate one full content document on demand');
assert.match(appSource, /adminSiteContentCatalogMatch = url\.pathname\.match\(\/\^\\\/api\\\/admin\\\/site-content-catalog/, 'administrator lightweight popup/footer catalog endpoint must be exposed');
assert.match(appSource, /adminSiteContentDocumentMatch = url\.pathname\.match\(\/\^\\\/api\\\/admin\\\/site-content-catalog/, 'administrator popup/footer single-document content endpoint must be exposed');

const footerAddressConflictPool = {
  async connect() {
    return {
      async query(sql) {
        const text = String(sql);
        if (text === 'BEGIN' || text === 'ROLLBACK' || text.includes('pg_advisory_xact_lock')) {
          return { rowCount: 0, rows: [] };
        }
        if (text.includes("payload->>'addressId'")) {
          return {
            rowCount: 1,
            rows: [{ document_key: 'footerPages/internal-existing', address_id: 'privacy-policy' }],
          };
        }
        throw new Error(`Unexpected SQL during footer address conflict smoke: ${text}`);
      },
      release() {},
    };
  },
  async query() {
    throw new Error('pool.query should not run after an address conflict');
  },
};
const footerAddressConflictRepository = createSiteContentRepository(footerAddressConflictPool);
await assert.rejects(
  () => footerAddressConflictRepository.patchDomainDocuments({
    domain: 'footer',
    upserts: [{
      key: 'footerPages/internal-new',
      payload: { id: 'internal-new', pageType: 'content', addressId: 'privacy-policy' },
    }],
    addressClaims: [{ documentKey: 'footerPages/internal-new', addressId: 'privacy-policy' }],
    actorClerkUserId: 'admin-smoke',
  }),
  (error) => error?.code === 'footer_page_address_conflict' && error?.status === 409,
  'duplicate footer address IDs must be rejected transactionally before another page can be overwritten',
);

const assetRepositorySource = fs.readFileSync(new URL('../../server/src/assets/asset-repository.mjs', import.meta.url), 'utf8');
assert.match(assetRepositorySource, /const refreshCatalogMetadata = async/, 'PostgreSQL asset mutations must keep asset catalog metadata current');
assert.ok((assetRepositorySource.match(/await refreshCatalogMetadata\(client\);/g) || []).length >= 5, 'create/edit/delete/bulk/category mutations must refresh catalog metadata transactionally');
const systemDataRepositorySource = fs.readFileSync(new URL('../../server/src/settings/system-data-repository.mjs', import.meta.url), 'utf8');
assert.match(systemDataRepositorySource, /async reconcileAssetCatalogMetadata/, 'data management must provide a dedicated safe catalog metadata reconciliation action');
assert.match(appSource, /\/api\/admin\/system-data\/reconcile-asset-catalog-metadata/, 'catalog metadata reconciliation endpoint must be exposed to administrator data management');

const adminRentalRepositorySource = fs.readFileSync(new URL('../../server/src/rentals/admin-rental-request-repository.mjs', import.meta.url), 'utf8');
assert.match(adminRentalRepositorySource, /includeTabCounts = false/, 'administrator rental-request page reads must support folding lightweight tab counts into the page query only when needed');
assert.match(adminRentalRepositorySource, /WITH page_rows AS \([\s\S]*tab_counts AS \([\s\S]*LEFT JOIN page_rows ON TRUE/, 'administrator rental-request first page and tab counts must resolve in one PostgreSQL round trip');
assert.match(adminRentalRepositorySource, /includeTotalCount = true/, 'administrator rental-request page reads must support skipping a redundant total-count query when tab counts already provide the total');
assert.match(adminRentalRepositorySource, /trim\(query\) \? 'LEFT JOIN app_rental_request_items/, 'administrator request count SQL must avoid the request-item join when search text does not require it');
const adminRentalServiceSource = fs.readFileSync(new URL('../../server/src/rentals/admin-rental-request-service.mjs', import.meta.url), 'utf8');
assert.match(adminRentalServiceSource, /const includeCounts = options\.includeCounts !== false;/, 'dashboard previews must be able to skip duplicate rental tab-count aggregation');
assert.match(adminRentalServiceSource, /const canUseTabCountAsTotal = quickFilter === 'all' && !query;/, 'default administrator request browsing must derive totalCount from lightweight tab counts');
assert.match(adminRentalServiceSource, /includeTabCounts: needsTabCounts/, 'administrator request management must request page rows and tab counts through one repository read');
assert.equal(adminRentalServiceSource.includes('repository.getTabCounts()'), false, 'administrator request management must not open a second PostgreSQL query just for tab counts');
assert.match(appSource, /GET' && url\.pathname === '\/api\/admin\/rental-requests'[\s\S]*authenticateAdminAuthority\(request, response, headers, requestId\)[\s\S]*adminRentalRequestService\.list\(authority\.firebaseIdentity/, 'administrator request reads must authenticate Clerk/PostgreSQL authority once');
assert.match(appSource, /GET' && url\.pathname === '\/api\/admin\/rental-dashboard'[\s\S]*authenticateAdminAuthority\(request, response, headers, requestId\)[\s\S]*authority\.firebaseIdentity/, 'dashboard count reads must use direct Clerk/PostgreSQL administrator authority');
const adminAuthServiceSource = fs.readFileSync(new URL('../../server/src/auth/admin-clerk-auth-service.mjs', import.meta.url), 'utf8');
assert.match(adminAuthServiceSource, /async authorizeCurrent\(\{ clerkUserId \}\)[\s\S]*requireActor\(clerkUserId\)[\s\S]*authority: 'clerk-postgresql-session'/, 'authenticated administrator API reads must authorize from the verified Clerk JWT plus PostgreSQL registry without a remote Clerk Backend API lookup');
assert.match(appSource, /const adminAuth = await adminClerkAuthService\.authorizeCurrent\(\{ clerkUserId: auth\.userId \}\);/, 'administrator API authority must use the lightweight PostgreSQL registry path');
const databasePoolSource = fs.readFileSync(new URL('../../server/src/db/pool.mjs', import.meta.url), 'utf8');
assert.match(databasePoolSource, /max: config\.dbPoolMax,[\s\S]*min: 1,[\s\S]*idleTimeoutMillis: config\.dbIdleTimeoutMs/, 'PostgreSQL pool must retain one warm idle connection so separate administrator first-use reads do not repeatedly pay a database connection handshake');



const boardSqlCalls = [];
const boardPool = {
  async query(sql, params = []) {
    const text = String(sql);
    boardSqlCalls.push({ text, params });
    if (text.includes('WITH board_meta AS')) {
      const boardType = text.includes("config.board_type='faq'") ? 'faq' : 'notice';
      return {
        rowCount: 1,
        rows: [{
          board_synced_at: '2026-08-13T01:00:00.000Z',
          config_posts_per_page: 10,
          config_source_mode: 'postgresql-authoritative',
          config_synced_at: '2026-08-13T01:00:00.000Z',
          config_updated_at: '2026-08-13T01:00:00.000Z',
          effective_page_size: 10,
          categories: boardType === 'faq'
            ? [{ category_id: 'general', name: '일반', sort_order: 0, source_mode: 'postgresql-authoritative' }]
            : undefined,
          pinned_posts: [],
          regular_posts: [{
            post_id: `${boardType}-1`,
            board_type: boardType,
            category_id: boardType === 'faq' ? 'general' : null,
            title: `${boardType} smoke`,
            content_text: 'body',
            content_html: '<p>body</p>',
            content_format: 'rich-html-v1',
            is_pinned: false,
            author_uid: '',
            author_name: '관리자',
            view_count: 0,
            source_mode: 'postgresql-authoritative',
            mirror_state: 'retired',
            created_at: '2026-08-13T01:00:00.000Z',
            updated_at: '2026-08-13T01:00:00.000Z',
          }],
          total_regular_count: 1,
        }],
      };
    }
    if (text.includes("SELECT scope, synced_at FROM app_board_status WHERE scope='all'")) {
      return { rowCount: 1, rows: [{ scope: 'all', synced_at: '2026-08-13T01:00:00.000Z' }] };
    }
    if (text.includes('previous_post_id') && text.includes('next_post_id')) {
      return { rowCount: 1, rows: [{
        post_id: params[0], board_type: 'notice', category_id: null, title: '현재 공지', content_text: '본문', content_html: '<p>본문</p>', content_format: 'rich-html-v1',
        is_pinned: false, author_uid: '', author_name: '관리자', view_count: 7, source_mode: 'postgresql-authoritative', mirror_state: 'retired',
        created_at: '2026-08-13T01:00:00.000Z', updated_at: '2026-08-13T01:00:00.000Z',
        previous_post_id: 'notice-newer', previous_title: '이전 공지', previous_author_name: '관리자1', previous_created_at: '2026-08-14T01:00:00.000Z', previous_view_count: 9,
        next_post_id: 'notice-older', next_title: '다음 공지', next_author_name: '관리자2', next_created_at: '2026-08-12T01:00:00.000Z', next_view_count: 5,
      }] };
    }
    throw new Error(`Unexpected board SQL in Phase 34 regression smoke: ${text}`);
  },
};
const boardRepository = createBoardRepository(boardPool);
const noticeQueryStart = boardSqlCalls.length;
const noticeBoard = await boardRepository.listNotice({ page: 1 });
assert.equal(boardSqlCalls.length - noticeQueryStart, 1, 'notice list entry must resolve configuration, pinned rows, page rows, and total count in one PostgreSQL round trip');
assert.equal(noticeBoard.pageSize, 10, 'notice list without a client pageSize must use the authoritative PostgreSQL board configuration');
assert.equal(noticeBoard.regularPosts[0]?.id, 'notice-1');
const faqQueryStart = boardSqlCalls.length;
const faqBoard = await boardRepository.listFaq({ page: 1, categoryId: 'all' });
assert.equal(boardSqlCalls.length - faqQueryStart, 1, 'FAQ list entry must resolve configuration, categories, page rows, and total count in one PostgreSQL round trip');
assert.equal(faqBoard.pageSize, 10, 'FAQ list without a client pageSize must use the authoritative PostgreSQL board configuration');
assert.equal(faqBoard.categories[0]?.id, 'general');
assert.equal(faqBoard.regularPosts[0]?.id, 'faq-1');
const noticeDetail = await boardRepository.getNoticePost('notice-current');
assert.equal(noticeDetail.id, 'notice-current');
assert.equal(noticeDetail.navigation.previous?.id, 'notice-newer', 'notice detail must expose the row immediately above the current post in canonical list order');
assert.equal(noticeDetail.navigation.next?.id, 'notice-older', 'notice detail must expose the row immediately below the current post in canonical list order');
assert.equal(noticeDetail.navigation.previous?.viewCount, 9);
const boardRepositorySource = fs.readFileSync(new URL('../../server/src/boards/board-repository.mjs', import.meta.url), 'utf8');
const listNoticeStart = boardRepositorySource.indexOf('async listNotice(');
const listNoticeEnd = boardRepositorySource.indexOf('async getNoticePost', listNoticeStart);
const listNoticeBlock = boardRepositorySource.slice(listNoticeStart, listNoticeEnd);
const listFaqStart = boardRepositorySource.indexOf('async listFaq(');
const listFaqEnd = boardRepositorySource.indexOf('async saveNoticePostAuthoritative', listFaqStart);
const listFaqBlock = boardRepositorySource.slice(listFaqStart, listFaqEnd);
assert.equal(listNoticeBlock.includes('pool.connect()'), false, 'public notice list reads must not hold a dedicated PostgreSQL client');
assert.equal(listFaqBlock.includes('pool.connect()'), false, 'public FAQ list reads must not hold a dedicated PostgreSQL client');
assert.equal((listNoticeBlock.match(/await pool\.query\(/g) || []).length, 1, 'notice list must use exactly one PostgreSQL query');
assert.equal((listFaqBlock.match(/await pool\.query\(/g) || []).length, 1, 'FAQ list must use exactly one PostgreSQL query');
assert.match(listNoticeBlock, /jsonb_agg\(to_jsonb\(pinned_posts\)/, 'notice list must aggregate pinned/page rows in one PostgreSQL statement');
assert.match(listFaqBlock, /jsonb_agg\(to_jsonb\(regular_posts\)/, 'FAQ list must aggregate page rows in one PostgreSQL statement');


const repositoryState = {
  documents: [],
};
const fakePool = {
  async connect() {
    return {
      async query(sql, params = []) {
        const text = String(sql);
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK' || text.includes('pg_advisory_xact_lock')) {
          return { rowCount: 0, rows: [] };
        }
        if (text.includes('DELETE FROM app_site_content_documents')) {
          repositoryState.documents = [];
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('INSERT INTO app_site_content_documents')) {
          repositoryState.documents.push({
            document_key: params[1],
            payload: JSON.parse(params[2]),
            enabled: params[3],
            sort_order: params[4],
            source_updated_at: params[6],
            synced_at: '2026-08-12T09:00:00.000Z',
          });
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected transactional SQL in site content repository smoke: ${text}`);
      },
      release() {},
    };
  },
  async query(sql) {
    const text = String(sql);
    if (text.includes('FROM app_site_content_documents') && text.includes('WHERE domain = $1')) {
      return { rowCount: repositoryState.documents.length, rows: repositoryState.documents };
    }
    throw new Error(`Unexpected pool SQL in site content repository smoke: ${text}`);
  },
};
const realRepository = createSiteContentRepository(fakePool);
const realReplaceResult = await realRepository.replaceDomain({
  domain: 'rental-config',
  documents: [{
    key: 'rentalSystem/publicConfig',
    payload: { settings: { maxRentalDays: 12 } },
    enabled: true,
    sortOrder: 0,
    sourceUpdatedAt: '2026-08-12T08:55:00.000Z',
  }],
  actorClerkUserId: 'clerk-admin-repository-smoke',
  sourceMode: 'postgresql-admin-settings-patch',
});
assert.equal(realReplaceResult.source, 'postgresql');
assert.equal(realReplaceResult.documents[0].payload.settings.maxRentalDays, 12);
assert.equal(realReplaceResult.sourceMode, 'postgresql-admin-settings-patch');
const repositorySource = fs.readFileSync(new URL('../../server/src/content/site-content-repository.mjs', import.meta.url), 'utf8');
assert.equal(repositorySource.includes('this.getDomain('), false, 'site-content repository arrow functions must not call this.getDomain');
assert.equal(repositorySource.includes('this.getRentalConfigBootstrapContext('), false, 'site-content repository arrow functions must not call this.getRentalConfigBootstrapContext');
assert.match(repositorySource, /FROM app_site_content_documents[\s\S]*WHERE domain = \$1/, 'site-content domain reads must use canonical documents directly in one PostgreSQL round-trip');
assert.equal(repositorySource.includes('app_site_content_syncs'), false, 'site-content runtime must not persist or read duplicate sync metadata');
assert.equal(repositorySource.includes('const [syncResult, docsResult] = await Promise.all('), false, 'site-content domain reads must not spend two pool queries on one domain response');


const memberAuthoritySource = fs.readFileSync(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8');
assert.match(memberAuthoritySource, /\.\.\.state,[\s\S]*authority:\s*'postgresql',[\s\S]*target:\s*'postgresql-member-directory',[\s\S]*skipped:\s*false/, 'member-directory save responses must preserve the canonical PostgreSQL member-directory target after repository state is spread');
assert.match(memberAuthoritySource, /\.\.\.state,[\s\S]*target:\s*'postgresql-member-directory',[\s\S]*skipped:\s*true/, 'member-directory skipped responses must preserve the canonical PostgreSQL member-directory target after repository state is spread');
const profileProjectionBlock = memberAuthoritySource.match(/const profileFromAccount = \(account = \{\}, firebaseUid = ''\) => \(\{[\s\S]*?\}\);/)?.[0] || '';
assert.match(profileProjectionBlock, /createdAt:\s*account\.createdAt \|\| null/, 'PostgreSQL member edit response must preserve signup timestamp');
assert.match(profileProjectionBlock, /updatedAt:\s*account\.updatedAt \|\| null/, 'PostgreSQL member edit response must preserve update timestamp');


const memberPolicyAppSource = fs.readFileSync(new URL('../../server/src/app.mjs', import.meta.url), 'utf8');
assert.match(memberPolicyAppSource, /\/api\/admin\/member-signup-policy/, 'server must expose a dedicated PostgreSQL signup-policy endpoint');
assert.match(memberPolicyAppSource, /\/api\/admin\/member-directory\/audit/, 'server must expose a PostgreSQL member-directory audit endpoint');
assert.match(memberPolicyAppSource, /\/api\/admin\/member-directory\/restore-mismatches/, 'server must expose a PostgreSQL member-directory restore endpoint');
assert.match(memberPolicyAppSource, /request\.method === 'POST' && url\.pathname === '\/api\/admin\/member-directory\/sync'[\s\S]*readJsonBody\(request, \{ maxBytes: 2 \* 1024 \* 1024 \}\)/, 'administrator member-directory synchronization must accept large authoritative directory payloads above the obsolete 32KB generic body limit');
const memberServiceSource = fs.readFileSync(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8');
const memberRepositorySource = fs.readFileSync(new URL('../../server/src/members/member-authority-repository.mjs', import.meta.url), 'utf8');
assert.match(memberServiceSource, /replaceDirectoryEntries\(normalizedEntries, \{[\s\S]*teams,[\s\S]*settings,[\s\S]*actorClerkUserId: admin\.uid/, 'member-directory synchronization must forward organization config into the same PostgreSQL transaction');
assert.match(memberRepositorySource, /phase31-member-directory[\s\S]*phase24-site-content:rental-config[\s\S]*UPDATE app_site_content_documents[\s\S]*rentalSystem\/publicConfig/, 'member-directory and public organization config writes must share one PostgreSQL transaction');
assert.equal(memberRepositorySource.includes('app_site_content_syncs'), false, 'member-directory writes must not recreate retired site-content sync metadata');
assert.match(memberRepositorySource, /organizationConfigUpdated: shouldUpdateOrganizationConfig/, 'member-directory synchronization must report whether the public organization config joined the transaction');
assert.match(memberServiceSource, /auditMemberDirectoryAdmin/, 'member authority service must own the PostgreSQL directory audit');
assert.match(memberServiceSource, /directoryVersionReconciled/, 'member-directory audit must reconcile legacy policy-version drift against the authoritative PostgreSQL directory state');
assert.match(memberServiceSource, /memberDirectoryVersion: directoryVersion/, 'member-directory audit must persist the reconciled authoritative directory version');
assert.equal(/policyEnabledChanged[\s\S]{0,240}memberDirectoryVersion[\s\S]{0,80}\+ 1/.test(siteContentServiceSource), false, 'signup-policy toggles must not increment the member-directory data version');

let reconciledRentalConfig = null;
const staleDirectoryAuditService = createMemberAuthorityService({
  repository: {
    async mutateProfile() { return { mutationId: 'not-used' }; },
    async findByFirebaseUid() { return null; },
    async findActiveIdentityOwner() { return null; },
    async findDirectoryEntryByIdentityKey() { return null; },
    async getDirectoryBootstrapState() { return { completed: true, version: 4, documentCount: 0 }; },
    async replaceDirectoryEntries() { return { completed: true, version: 4 }; },
    async countBlockingRentalRequestsForUids() { return 0; },
    async listMembersForDirectoryAudit() { return []; },
    async listDirectoryEntries() { return []; },
  },
  firebaseLinkRepository: { async findByFirebaseUid() { return null; }, async findByAppUserId() { return null; } },
  userRepository: { async findByClerkUserId() { return null; } },
  rentalRestrictionRepository: { async findByFirebaseUid() { return { exists: false, restriction: null }; } },
  siteContentRepository: {
    async getDomain() {
      return { domain: 'rental-config', documents: [{ key: 'rentalSystem/publicConfig', payload: { settings: { requireRegisteredMemberForSignup: true, memberDirectoryVersion: 5 } }, enabled: true, sortOrder: 0 }] };
    },
    async replaceDomain({ documents }) {
      reconciledRentalConfig = documents;
      return { domain: 'rental-config', documents };
    },
  },
});
const staleDirectoryAuditResult = await staleDirectoryAuditService.auditMemberDirectoryAdmin({ firebaseIdentity: { source: 'clerk-postgresql', uid: 'clerk-admin-directory-audit', fields: { adminRole: 'owner' } } });
assert.equal(staleDirectoryAuditResult.directoryVersionReconciled, true, 'administrator audit must repair legacy policy/directory version drift instead of failing stale');
assert.equal(staleDirectoryAuditResult.audit.directoryVersion, 4, 'administrator audit must use the actual PostgreSQL directory version');
assert.equal(reconciledRentalConfig?.[0]?.payload?.settings?.memberDirectoryVersion, 4, 'administrator audit must persist the repaired PostgreSQL directory version');
assert.match(memberServiceSource, /restoreDirectoryMismatchAdmin/, 'member authority service must own PostgreSQL mismatch restoration');
const siteServiceSource = fs.readFileSync(new URL('../../server/src/content/site-content-service.mjs', import.meta.url), 'utf8');
assert.match(siteServiceSource, /patchSignupPolicy/, 'site-content service must patch signup policy server-side');
assert.equal(siteServiceSource.includes("readJsonBody(request)"), false, 'site-content service must not depend on browser request-body parsing');
assert.match(siteServiceSource, /patchAdminDomain/, 'site-content service must support partial PostgreSQL document mutation for large rich-content domains');
assert.match(repositorySource, /patchDomainDocuments/, 'site-content repository must patch changed documents without deleting and reinserting the complete domain');
assert.match(repositorySource, /ON CONFLICT \(domain, document_key\) DO UPDATE SET/, 'partial content mutation must upsert individual PostgreSQL content documents atomically');
assert.match(memberPolicyAppSource, /request\.method === 'PATCH' && adminSiteContentDirectMatch[\s\S]*\['terms', 'footer'\]\.includes\(domain\) \? 2 \* 1024 \* 1024/, 'terms/footer rich-content partial writes must have a dedicated body safety limit above the obsolete 32KB generic limit');

const systemConfigRepositorySource = fs.readFileSync(new URL('../../server/src/settings/system-config-repository.mjs', import.meta.url), 'utf8');
const systemConfigServiceSource = fs.readFileSync(new URL('../../server/src/settings/system-config-service.mjs', import.meta.url), 'utf8');
assert.match(memberPolicyAppSource, /request\.method === 'GET' && url\.pathname === '\/api\/admin\/system-settings-audit'/, 'server must expose an authenticated PostgreSQL system-settings audit read endpoint');
assert.match(memberPolicyAppSource, /request\.method === 'POST' && url\.pathname === '\/api\/admin\/system-settings-audit'/, 'server must expose an authenticated PostgreSQL system-settings audit append endpoint');
assert.match(systemConfigRepositorySource, /async listAudit\(/, 'system configuration repository must read persisted audit entries');
assert.match(systemConfigRepositorySource, /async appendAudit\(/, 'system configuration repository must append persisted audit entries');
assert.match(systemConfigRepositorySource, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/, 'system settings audit appends must be serialized under a PostgreSQL advisory transaction lock');
assert.match(systemConfigServiceSource, /const AUDIT_KEY = 'system-settings-audit'/, 'system settings audit history must use a dedicated PostgreSQL configuration record');
assert.match(systemConfigServiceSource, /randomUUID\(\)/, 'system settings audit entries must receive stable unique identifiers');

const optionalPlatformEnvNames = [
  'APP_ENV',
  'DATABASE_URL',
  'CORS_ALLOWED_ORIGINS',
  'CLERK_JWT_KEY',
  'CLERK_AUTHORIZED_PARTIES',
  'CLERK_SECRET_KEY',
  'CLERK_PLATFORM_API_KEY',
  'CLERK_APPLICATION_ID',
  'CLERK_INSTANCE_ID',
  'CLERK_PLATFORM_API_URL',
];
const optionalPlatformEnvSnapshot = Object.fromEntries(
  optionalPlatformEnvNames.map((name) => [name, process.env[name]]),
);
try {
  process.env.APP_ENV = 'local';
  process.env.DATABASE_URL = 'postgres://localhost/phase34_optional_platform_smoke';
  delete process.env.CORS_ALLOWED_ORIGINS;
  delete process.env.CLERK_JWT_KEY;
  delete process.env.CLERK_AUTHORIZED_PARTIES;
  delete process.env.CLERK_SECRET_KEY;
  process.env.CLERK_PLATFORM_API_KEY = 'sk_test_not_a_platform_key';
  process.env.CLERK_APPLICATION_ID = 'app_phase34_smoke';
  process.env.CLERK_INSTANCE_ID = 'ins_phase34_smoke';
  const optionalPlatformConfig = readServerConfig();
  assert.equal(optionalPlatformConfig.clerkPlatformApiKey, null, 'invalid optional Clerk Platform API credentials must not crash core server config');
  assert.equal(optionalPlatformConfig.clerkApplicationId, null, 'invalid optional Clerk Platform API config must be disabled as one unit');
  assert.equal(optionalPlatformConfig.clerkInstanceId, null, 'invalid optional Clerk Platform API config must be disabled as one unit');
  assert.equal(optionalPlatformConfig.clerkPlatformApiUrl, 'https://api.clerk.com', 'disabled optional Platform API config must fall back to a safe inert URL');
} finally {
  for (const name of optionalPlatformEnvNames) {
    const previous = optionalPlatformEnvSnapshot[name];
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

const clerkDeviceTrustRequests = [];
const clerkDeviceTrustService = createClerkDeviceTrustService({
  platformApiKey: 'ak_test_phase34_device_trust',
  applicationId: 'app_phase34_smoke',
  instanceId: 'ins_phase34_smoke',
  fetchImpl: async (url, options = {}) => {
    const href = String(url);
    clerkDeviceTrustRequests.push({ href, options });
    assert.equal(options.headers?.Authorization, 'Bearer ak_test_phase34_device_trust');
    if (options.method === 'GET') {
      assert.match(href, /\/v1\/platform\/applications\/app_phase34_smoke\/instances\/ins_phase34_smoke\/config/);
      assert.match(href, /keys=auth_password/);
      return new Response(JSON.stringify({ auth_password: { device_trust: { enabled: true } } }), { status: 200 });
    }
    if (options.method === 'PATCH') {
      assert.deepEqual(JSON.parse(options.body), { auth_password: { device_trust: { enabled: false } } });
      return new Response(JSON.stringify({ auth_password: { device_trust: { enabled: false } } }), { status: 200 });
    }
    throw new Error(`Unexpected Clerk Platform API smoke method: ${options.method}`);
  },
});
assert.equal((await clerkDeviceTrustService.get()).enabled, true, 'live Clerk Device Trust read must expose auth_password.device_trust.enabled');
assert.equal((await clerkDeviceTrustService.setEnabled(false)).enabled, false, 'live Clerk Device Trust write must PATCH the requested enabled state');
assert.equal(clerkDeviceTrustRequests.length, 2);
const unconfiguredDeviceTrustService = createClerkDeviceTrustService();
assert.equal((await unconfiguredDeviceTrustService.get()).configured, false, 'server must remain bootable when Clerk Platform API credentials are not configured');
await assert.rejects(
  () => unconfiguredDeviceTrustService.setEnabled(true),
  (error) => error?.code === 'clerk_platform_config_not_configured' && error?.status === 503,
  'Device Trust writes must fail explicitly rather than pretending to update Clerk when Platform API credentials are absent',
);

const deviceTrustServiceSource = fs.readFileSync(new URL('../../server/src/clerk/clerk-device-trust-service.mjs', import.meta.url), 'utf8');
assert.match(deviceTrustServiceSource, /auth_password:[\s\S]*device_trust:[\s\S]*enabled: enabledValue/, 'Clerk Device Trust writes must patch the documented auth_password.device_trust.enabled config');
assert.match(appSource, /GET' && url\.pathname === '\/api\/admin\/clerk-device-trust'/, 'server must expose authenticated live Clerk Device Trust reads');
assert.match(appSource, /PATCH' && url\.pathname === '\/api\/admin\/clerk-device-trust'[\s\S]*admin_owner_required/, 'only owner administrators may change the live Clerk Device Trust setting');


const collectRuntimeSourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = `${directory}/${entry.name}`;
  if (entry.isDirectory()) return collectRuntimeSourceFiles(path);
  return entry.isFile() && /\.(?:mjs|js|jsx)$/.test(entry.name) ? [path] : [];
});
const runtimeSourceText = collectRuntimeSourceFiles('server/src')
  .map((path) => fs.readFileSync(path, 'utf8'))
  .join('\n');
for (const retiredDuplicateMarker of [
  'app_user_member_shadows',
  'app_user_rental_request_shadows',
  'app_user_rental_request_item_shadows',
  'app_user_rental_request_shadow_syncs',
  'memberShadowRepository',
  'memberShadowService',
]) {
  assert.equal(runtimeSourceText.includes(retiredDuplicateMarker), false, `runtime must not retain retired duplicate-store logic: ${retiredDuplicateMarker}`);
}
const rentalBootstrapSource = fs.readFileSync(new URL('../../server/src/content/rental-config-bootstrap.mjs', import.meta.url), 'utf8');
assert.equal(rentalBootstrapSource.includes('assetCategories'), false, 'rental-config bootstrap must not recreate the retired asset-category duplicate authority');
for (const retiredTermsField of [
  'signupTermsEnabled',
  'signupTermsRequireReconsentOnChange',
  'signupTermsApplyToExistingMembers',
  'signupTermsPolicyRevision',
  'signupTermsRequiredRevision',
  'signupTermsInitialRevision',
]) {
  assert.equal(rentalBootstrapSource.includes(retiredTermsField), false, `rental-config bootstrap must not recreate terms duplicate field: ${retiredTermsField}`);
}
const consolidationMigrationSource = fs.readFileSync(new URL('../../server/migrations/028_phase34_canonical_data_consolidation.sql', import.meta.url), 'utf8');
for (const marker of [
  'DROP TABLE IF EXISTS app_user_member_shadows',
  'DROP TABLE IF EXISTS app_user_rental_request_shadows',
  'DROP TABLE IF EXISTS app_user_rental_request_item_shadows',
  'DROP TABLE IF EXISTS app_user_rental_request_shadow_syncs',
  "'retainedCanonicalLegacyNamedTable', 'app_user_rental_restriction_shadows'",
]) {
  assert.ok(consolidationMigrationSource.includes(marker), `canonical consolidation migration marker missing: ${marker}`);
}


const globalBannerAuditMigrationSource = fs.readFileSync(new URL('../../server/migrations/030_phase34_transient_global_banner_audit_compaction.sql', import.meta.url), 'utf8');
assert.match(globalBannerAuditMigrationSource, /system-settings-audit/, 'migration 030 must target only the system settings audit record');
assert.match(globalBannerAuditMigrationSource, /- 'systemBannerMessage'/, 'migration 030 must remove historical global banner message values');
assert.match(globalBannerAuditMigrationSource, /- 'systemBannerUrl'/, 'migration 030 must remove historical global banner URL values');
assert.match(globalBannerAuditMigrationSource, /historyPolicy', 'metadata-only'/, 'migration 030 must document metadata-only global banner history policy');

console.log('[phase34-runtime-regressions-backend-smoke] PASS');
