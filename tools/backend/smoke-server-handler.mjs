import { createServer } from 'node:http';
import { createRequestHandler } from '../../server/src/app.mjs';

const allowedOrigin = 'https://staging.example.vercel.app';
const config = {
  serviceName: 'rental-api',
  appEnv: 'test',
  serviceVersion: 'phase32-smoke',
  assetBoardWriteMirrorDisabled: true,
  rentalRequestWriteMirrorDisabled: true,
  memberStatusRestrictionWriteMirrorDisabled: true,
  memberProfileWriteMirrorDisabled: true,
  accountLifecycleCompatibilityDisabled: true,
  corsAllowedOrigins: [allowedOrigin],
};

const databaseCheck = async () => ({ latencyMs: 1, databaseTime: new Date() });
const authenticateRequest = async () => ({
  userId: 'user_smoke',
  sessionId: 'sess_smoke',
  authorizedParty: allowedOrigin,
  issuedAt: 1,
  expiresAt: 2,
  status: 'active',
});
const authenticateFirebaseRequest = async (request) => {
  if (request.headers['x-firebase-authorization'] !== 'Bearer firebase-smoke-token') {
    const error = new Error('Invalid Firebase smoke token.');
    error.code = 'firebase_signature_invalid';
    throw error;
  }
  return {
    uid: 'firebase_uid_smoke',
    email: 'smoke@example.com',
    emailVerified: false,
    signInProvider: 'password',
    authTime: Math.floor(Date.now() / 1000),
    idToken: 'firebase-smoke-token',
  };
};
let currentIdentity = null;
const userIdentityService = {
  async getCurrent(userId) {
    if (userId !== 'user_smoke') throw new Error('Unexpected user ID.');
    return currentIdentity;
  },
  async syncCurrent(userId) {
    if (userId !== 'user_smoke') throw new Error('Unexpected user ID.');
    currentIdentity = {
      id: '42',
      clerkUserId: userId,
      primaryEmail: 'smoke@example.com',
      primaryEmailVerified: true,
      displayName: 'Smoke User',
      firstName: 'Smoke',
      lastName: 'User',
      imageUrl: null,
      lastSyncedAt: new Date('2026-08-07T00:00:00.000Z'),
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      updatedAt: new Date('2026-08-07T00:00:00.000Z'),
    };
    return currentIdentity;
  },
};
let firebaseLink = null;
const firebaseLinkService = {
  async getCurrent(userId) {
    if (userId !== 'user_smoke') throw new Error('Unexpected Firebase-link user ID.');
    return firebaseLink;
  },
  async linkCurrent(userId, firebaseIdentity) {
    if (userId !== 'user_smoke') throw new Error('Unexpected Firebase-link user ID.');
    firebaseLink = {
      appUserId: '42',
      firebaseUid: firebaseIdentity.uid,
      firebaseEmail: firebaseIdentity.email,
      firebaseEmailVerified: firebaseIdentity.emailVerified,
      firebaseSignInProvider: firebaseIdentity.signInProvider,
      linkedAt: new Date('2026-08-07T00:00:00.000Z'),
      lastVerifiedAt: new Date('2026-08-07T00:00:00.000Z'),
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      updatedAt: new Date('2026-08-07T00:00:00.000Z'),
    };
    return firebaseLink;
  },
};

let memberShadow = null;
const memberShadowService = {
  async getCurrent(userId) {
    if (userId !== 'user_smoke') throw new Error('Unexpected member-shadow user ID.');
    return memberShadow;
  },
  async getCurrentByFirebaseIdentity(firebaseIdentity) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected Firebase cutover identity.');
    return memberShadow;
  },
  async readCurrentSourceByFirebaseIdentity(firebaseIdentity) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected Firebase fallback identity.');
    return {
      uid: 'firebase_uid_smoke',
      email: 'smoke@example.com',
      maskedEmail: 's***@example.com',
      name: 'Smoke User Firestore',
      team: 'QA',
      phone: '010-0000-0000',
      status: 'active',
      directoryMemberId: '',
      directoryVerifiedVersion: 0,
      profileRequiredReason: '',
      rejoinedAccount: false,
      termsConsentRevision: 0,
      termsConsentPolicyVersion: 0,
      identityKey: 'identity_smoke',
      recoveryKey: 'recovery_smoke',
      previousAccountUids: ['firebase_uid_old'],
      sourceHash: 'f'.repeat(64),
      sourceUpdatedAt: new Date('2026-08-07T01:00:00.000Z'),
    };
  },
  async syncLinkedFirebaseUid(firebaseIdentity, targetFirebaseUid = '') {
    const firebaseUid = targetFirebaseUid || firebaseIdentity.uid;
    if (firebaseIdentity.uid !== 'firebase_uid_smoke' || firebaseUid !== 'firebase_uid_smoke') {
      throw new Error('Unexpected member write-through identity.');
    }
    return {
      status: 'synced',
      reason: '',
      firebaseUid,
      actorUid: firebaseIdentity.uid,
      appUserId: '42',
      shadow: memberShadow,
    };
  },
  async syncCurrent(userId, firebaseIdentity) {
    if (userId !== 'user_smoke' || firebaseIdentity.uid !== 'firebase_uid_smoke') {
      throw new Error('Unexpected member-shadow sync identity.');
    }
    memberShadow = {
      appUserId: '42',
      firebaseUid: 'firebase_uid_smoke',
      uid: 'firebase_uid_smoke',
      email: 'smoke@example.com',
      maskedEmail: 's***@example.com',
      name: 'Smoke User',
      team: 'QA',
      phone: '010-0000-0000',
      status: 'active',
      directoryMemberId: '',
      directoryVerifiedVersion: 0,
      profileRequiredReason: '',
      rejoinedAccount: false,
      termsConsentRevision: 0,
      termsConsentPolicyVersion: 0,
      identityKey: 'identity_smoke',
      recoveryKey: 'recovery_smoke',
      previousAccountUids: ['firebase_uid_old'],
      sourceHash: 'a'.repeat(64),
      sourceCreatedAt: new Date('2026-08-07T00:00:00.000Z'),
      sourceUpdatedAt: new Date('2026-08-07T00:00:00.000Z'),
      syncedAt: new Date('2026-08-07T00:00:00.000Z'),
      updatedAt: new Date('2026-08-07T00:00:00.000Z'),
    };
    return memberShadow;
  },
  async compareCurrent(userId, firebaseIdentity) {
    if (userId !== 'user_smoke' || firebaseIdentity.uid !== 'firebase_uid_smoke' || !memberShadow) {
      throw new Error('Unexpected member-shadow comparison state.');
    }
    return {
      equivalent: true,
      sourceHash: memberShadow.sourceHash,
      shadowHash: memberShadow.sourceHash,
      changedFields: [],
      sourceUpdatedAt: memberShadow.sourceUpdatedAt,
      shadowSyncedAt: memberShadow.syncedAt,
    };
  },
};


const memberAuthorityService = {
  async getCurrentByFirebaseIdentity({ firebaseIdentity }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected Phase 31 canonical member profile identity.');
    return {
      source: 'postgresql-authoritative',
      authority: 'postgresql',
      profile: {
        uid: 'firebase_uid_smoke',
        email: 'smoke@example.com',
        maskedEmail: 's***@example.com',
        name: 'Smoke User',
        team: 'Canonical QA',
        phone: '010-9999-8888',
        status: 'active',
        directoryMemberId: 'directory-smoke',
        directoryVerifiedVersion: 8,
        profileRequiredReason: '',
        rejoinedAccount: false,
        termsConsentRevision: 5,
        termsConsentPolicyVersion: 5,
        identityKey: 'identity_smoke',
        recoveryKey: 'recovery_smoke',
        previousAccountUids: ['firebase_uid_old'],
      },
      updatedAt: new Date('2026-08-11T11:54:00.000Z'),
      syncedAt: new Date('2026-08-11T11:54:00.000Z'),
    };
  },
  async listAdminMembers({ firebaseIdentity, status, search, page, pageSize }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected Phase 30 admin member read identity.');
    return { admin: { uid: firebaseIdentity.uid, role: 'owner' }, source: 'postgresql', accounts: [{ uid: 'member-target', email: 'target@example.com', name: 'Target', team: 'QA', phone: '010-1111-2222', status: status === 'all' ? 'active' : status }], page, pageSize, totalCount: 1, hasNextPage: false, statusCounts: { pending: 0, active: 1, profileRequired: 0, blocked: 0, retired: 0 }, search };
  },
  async editSelf({ clerkUserId, firebaseIdentity, input }) {
    if (clerkUserId !== 'user_smoke' || firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected Phase 21 self member authority identity.');
    return { authority: 'postgresql', source: 'postgresql-authoritative', firestoreMirror: 'retired', identitySource: 'postgresql', recoverySource: 'postgresql', mutationId: 'member-self-smoke', profile: { uid: firebaseIdentity.uid, email: 'smoke@example.com', name: input.name, team: input.team, phone: input.phone, status: 'active' } };
  },
  async editAdmin({ firebaseIdentity, targetUid, input }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke' || targetUid !== 'member-target') throw new Error('Unexpected Phase 21 admin member profile identity.');
    return { admin: { uid: firebaseIdentity.uid, role: 'owner' }, authority: 'postgresql', source: 'postgresql-authoritative', firestoreMirror: 'retired', identitySource: 'postgresql', recoverySource: 'postgresql', mutationId: 'member-admin-smoke', profile: { uid: targetUid, email: 'target@example.com', name: input.name, team: input.team, phone: input.phone, status: 'active' } };
  },
  async changeStatusAdmin({ firebaseIdentity, targetUid, nextStatus }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke' || targetUid !== 'member-target' || nextStatus !== 'blocked') throw new Error('Unexpected Phase 21 admin member status input.');
    return { admin: { uid: firebaseIdentity.uid, role: 'owner' }, authority: 'postgresql', firestoreMirror: 'retired', restrictionAuthority: 'unchanged', mutationId: 'member-status-smoke', profile: { uid: targetUid, status: nextStatus } };
  },
  async syncMemberDirectoryAdmin({ firebaseIdentity }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected Phase 31 member directory sync identity.');
    return { admin: { uid: firebaseIdentity.uid, role: 'owner' }, source: 'firestore-admin-sync-compatibility', target: 'postgresql-member-directory', count: 2, version: 7 };
  },
  async bootstrapAdminRegistry({ firebaseIdentity }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected Phase 21 admin registry identity.');
    return { admin: { uid: firebaseIdentity.uid }, source: 'firestore-bootstrap', target: 'postgresql-admin-registry', count: 2, registry: [] };
  },
};

const accountRecoveryService = {
  async findEmail(input) {
    if (input.name !== 'Smoke User' || input.team !== 'QA' || input.phone !== '010-0000-0000') throw new Error('Unexpected Phase 22 account recovery lookup.');
    return { source: 'postgresql', found: true, maskedEmail: 's***@example.com' };
  },
  async verifyPasswordReset(input) {
    if (input.email !== 'smoke@example.com') throw new Error('Unexpected Phase 22 password reset verification.');
    return { source: 'postgresql', verified: true };
  },
};

const accountLifecycleService = {
  async signup({ firebaseIdentity, input }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke' || input.email !== 'smoke@example.com') throw new Error('Unexpected Phase 32 signup lifecycle input.');
    return { source: 'postgresql', authority: 'postgresql', firestoreBootstrap: 'retired', status: 'active' };
  },
  async getTerms({ clerkUserId }) {
    if (clerkUserId !== 'user_smoke') throw new Error('Unexpected Phase 32 terms read user.');
    return { source: 'postgresql', policy: { enabled: true, revision: 5, activeTerms: [] }, states: {}, logs: [], bootstrapCompleted: false, bootstrapRequired: true };
  },
  async bootstrapTerms({ clerkUserId, firebaseIdentity }) {
    if (clerkUserId !== 'user_smoke' || firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected Phase 32 terms bootstrap identity.');
    return { source: 'postgresql', policy: { enabled: true, revision: 5, activeTerms: [] }, states: {}, logs: [], bootstrapCompleted: true, bootstrapRequired: false, legacyBootstrap: 'imported' };
  },
  async saveTerms({ clerkUserId, input }) {
    if (clerkUserId !== 'user_smoke' || Number(input.policyRevision) !== 5) throw new Error('Unexpected Phase 32 terms save input.');
    return { source: 'postgresql', authority: 'postgresql', firestoreMirror: 'retired', policy: { enabled: true, revision: 5, activeTerms: [] }, states: {}, logs: [], bootstrapCompleted: true, bootstrapRequired: false };
  },
};

const adminClerkAuthService = {
  async getCurrent({ clerkUserId }) {
    if (clerkUserId !== 'user_smoke') throw new Error('Unexpected Phase 22 Clerk administrator.');
    return { authority: 'clerk', admin: { firebaseUid: 'firebase_uid_smoke', adminLoginId: 'smoke-admin', authEmail: 'smoke@example.com', adminRole: 'owner', clerkUserId: 'user_smoke', clerkLinkState: 'linked', authAuthorityMode: 'clerk-authoritative-firebase-compatibility' } };
  },
  async migrateCurrent({ firebaseIdentity, password }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke' || password !== 'legacy6') throw new Error('Unexpected Phase 22 admin migration input.');
    return { authority: 'clerk', migration: 'firebase-admin-to-clerk', admin: { firebaseUid: firebaseIdentity.uid, adminLoginId: 'smoke-admin', authEmail: 'smoke@example.com', adminRole: 'owner', clerkUserId: 'user_smoke', clerkLinkState: 'linked', authAuthorityMode: 'clerk-authoritative-firebase-compatibility' } };
  },
  async provisionTarget({ actorClerkUserId, firebaseIdentity, targetFirebaseUid, password }) {
    if (actorClerkUserId !== 'user_smoke' || firebaseIdentity.uid !== 'firebase_uid_smoke' || targetFirebaseUid !== 'firebase_admin_target' || password !== 'newpass88') throw new Error('Unexpected Phase 22 admin provision input.');
    return { authority: 'clerk', provisioned: true, admin: { firebaseUid: targetFirebaseUid, adminLoginId: 'target-admin', authEmail: 'target@example.com', adminRole: 'admin', clerkUserId: 'clerk_target', clerkLinkState: 'linked', authAuthorityMode: 'clerk-authoritative-firebase-compatibility' } };
  },
};

const userClerkAuthService = {
  async getCurrent({ clerkUserId }) {
    if (clerkUserId !== 'user_smoke') throw new Error('Unexpected Phase 23 Clerk user.');
    return { authority: 'clerk', account: { firebaseUid: 'firebase_uid_smoke', memberStatus: 'active', authAuthorityMode: 'clerk-authoritative', lifecycleAuthorityMode: 'clerk-auth-firestore-profile-compatibility' }, clerkUser: { clerkUserId: 'user_smoke' } };
  },
  async migrateCurrent({ firebaseIdentity, password }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke' || password !== 'legacy888') throw new Error('Unexpected Phase 23 user migration input.');
    return { authority: 'clerk', migration: 'firebase-user-to-clerk', account: { firebaseUid: firebaseIdentity.uid, memberStatus: 'active' }, clerkUser: { clerkUserId: 'user_smoke' } };
  },
  async provisionCurrent({ firebaseIdentity, password }) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke' || password !== 'newpass88') throw new Error('Unexpected Phase 23 user provision input.');
    return { authority: 'clerk', provisioned: true, account: { firebaseUid: firebaseIdentity.uid, memberStatus: 'active' }, clerkUser: { clerkUserId: 'user_smoke' } };
  },
  async verifyPassword({ clerkUserId, password }) {
    if (clerkUserId !== 'user_smoke' || password !== 'legacy888') throw new Error('Unexpected Phase 23 user password verification input.');
    return { authority: 'clerk', verified: true, account: { firebaseUid: 'firebase_uid_smoke' } };
  },
  async changePassword({ clerkUserId, firebaseIdentity, currentPassword, newPassword }) {
    if (clerkUserId !== 'user_smoke' || firebaseIdentity.uid !== 'firebase_uid_smoke' || currentPassword !== 'legacy888' || newPassword !== 'newpass88') throw new Error('Unexpected Phase 23 user password change input.');
    return { authority: 'clerk', changed: true, account: { firebaseUid: firebaseIdentity.uid } };
  },
  async finalizeWithdrawal({ clerkUserId, firebaseIdentity, password }) {
    if (clerkUserId !== 'user_smoke' || firebaseIdentity.uid !== 'firebase_uid_smoke' || password !== 'newpass88') throw new Error('Unexpected Phase 23 withdrawal finalize input.');
    return { authority: 'postgresql', withdrawn: true, clerkDeleted: true, clerkCleanupError: '', account: { firebaseUid: firebaseIdentity.uid } };
  },
};

const rentalRequestWriteService = {
  async createCurrent(userId, firebaseIdentity, input) {
    if (userId !== 'user_smoke' || firebaseIdentity.uid !== 'firebase_uid_smoke') {
      throw new Error('Unexpected rental-request write identity.');
    }
    if (input.requestId !== 'REQ-Phase16HandlerSmoke001' || input.laptopId !== 'ASSET-SMOKE-1') {
      throw new Error('Unexpected rental-request write body.');
    }
    return {
      authority: 'postgresql',
      reused: false,
      firestoreMirror: 'synced',
      shadowSynchronized: true,
      request: {
        id: input.requestId,
        requesterUid: firebaseIdentity.uid,
        requesterEmail: firebaseIdentity.email,
        requesterName: 'Smoke User',
        requesterTeam: 'QA',
        team: 'QA',
        borrower: 'Smoke User',
        laptopId: input.laptopId,
        assetCategory: '노트북',
        assetNo: 'NB-SMOKE',
        startDate: input.startDate,
        dueDate: input.dueDate,
        purpose: input.purpose,
        status: '신청중',
      },
      availability: {
        id: input.requestId,
        laptopId: input.laptopId,
        assetCategory: '노트북',
        assetNo: 'NB-SMOKE',
        startDate: input.startDate,
        dueDate: input.dueDate,
        status: '신청중',
      },
    };
  },
};

const rentalRequestUserActionService = {
  async editCurrent(userId, firebaseIdentity, input) {
    return {
      authority: 'postgresql', operation: 'edit', firestoreMirror: 'synced', shadowSynchronized: true,
      request: { id: input.requestId, requesterUid: firebaseIdentity.uid, laptopId: 'ASSET-SMOKE-1', startDate: input.startDate, dueDate: input.dueDate, purpose: input.purpose, status: '신청중' },
      availability: { id: input.requestId, laptopId: 'ASSET-SMOKE-1', startDate: input.startDate, dueDate: input.dueDate, status: '신청중' },
      asset: { id: 'ASSET-SMOKE-1', reservations: [], status: '신청중', currentRequestId: input.requestId },
    };
  },
  async cancelCurrent(userId, firebaseIdentity, input) {
    return { authority: 'postgresql', operation: 'cancel', firestoreMirror: 'synced', shadowSynchronized: true, deleted: true, request: { id: input.requestId }, asset: { id: 'ASSET-SMOKE-1', reservations: [] } };
  },
  async extendCurrent(userId, firebaseIdentity, input) {
    return {
      authority: 'postgresql', operation: 'extend', approvalMode: 'manual', firestoreMirror: 'synced', shadowSynchronized: true,
      request: { id: input.requestId, requesterUid: firebaseIdentity.uid, laptopId: 'ASSET-SMOKE-1', startDate: '2026-08-10', dueDate: '2026-08-14', status: '대여중', userActionRequest: { type: 'extend', status: 'pending' } },
    };
  },
};

const assetCatalogSmoke = {
  source: 'postgresql', authoritative: true, synchronized: true, categories: ['노트북'],
  assets: [{ id: 'ASSET-SMOKE-1', category: '노트북', assetNo: 'NB-SMOKE', model: 'Smoke Model', baseStatus: '대여가능', status: '대여가능', reservations: [] }],
  availability: [], metrics: { totalAssetCount: 1, availableCount: 1, unavailableCount: 0, reservedOrRentedCount: 0 },
  sync: { assetCount: 1, categoryCount: 1, sourceHash: 'asset-smoke', sourceMode: 'test', syncedAt: '2026-08-09T00:00:00Z' },
};
const assetService = {
  async getPublicCatalog() { return assetCatalogSmoke; },
  async bootstrap(firebaseIdentity) { return { admin: { uid: firebaseIdentity.uid }, target: 'postgresql', assetCount: 1, categoryCount: 1, catalog: assetCatalogSmoke }; },
  async create(firebaseIdentity, asset) { return { admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced', asset: { id: 'ASSET-CREATED', ...asset }, catalog: assetCatalogSmoke }; },
  async edit(firebaseIdentity, assetId, asset) { return { admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced', asset: { id: assetId, ...asset }, catalog: assetCatalogSmoke }; },
  async delete(firebaseIdentity, assetId) { return { admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced', deletedAsset: { id: assetId }, catalog: assetCatalogSmoke }; },
  async bulkCreate(firebaseIdentity, assets) { return { admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced', assets: assets.map((asset, index) => ({ id: `ASSET-BULK-${index+1}`, ...asset })), duplicateAssetNumbers: [], invalidCategories: [], catalog: assetCatalogSmoke }; },
  async saveCategories(firebaseIdentity) { return { admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced', catalog: assetCatalogSmoke }; },
};


const firestoreSiteContentClient = {
  async readDomain({ domain, firebaseIdToken }) {
    if (firebaseIdToken !== 'firebase-smoke-token') throw new Error('Unexpected Firebase site-content token.');
    if (domain === 'home') return [{ key: 'homePage/config', payload: { heroTitle: 'Updated Smoke Home' }, enabled: true, sortOrder: 0, sourceUpdatedAt: '2026-08-10T00:00:00.000Z' }];
    if (domain === 'terms') return [{ key: 'signupTermsPolicy/current', payload: { enabled: true, revision: 1, activeTerms: [] }, enabled: true, sortOrder: 0, sourceUpdatedAt: '2026-08-10T00:00:00.000Z' }];
    if (domain === 'rental-config') return [{ key: 'rentalSystem/publicConfig', payload: { settings: { maxRentalDays: 7 } }, enabled: true, sortOrder: 0, sourceUpdatedAt: '2026-08-10T00:00:00.000Z' }];
    throw new Error(`Unexpected Firestore site-content domain: ${domain}`);
  },
};

const siteContentService = {
  async getDomain(domain) {
    if (!['home', 'rental-config', 'terms'].includes(domain)) throw new Error('Unexpected site-content read domain.');
    const documents = domain === 'home'
      ? [
          { documentKey: 'homePage/config', payload: { heroTitle: 'Smoke Home' }, enabled: true, sortOrder: 0 },
          { documentKey: 'homeBanners/banner-smoke', payload: { title: 'Smoke Banner' }, enabled: true, sortOrder: 1 },
        ]
      : domain === 'rental-config'
        ? [{ documentKey: 'rentalSystem/publicConfig', payload: { settings: { maxRentalDays: 7 } }, enabled: true, sortOrder: 0 }]
        : [{ documentKey: 'signupTermsPolicy/current', payload: { enabled: true, revision: 1, activeTerms: [] }, enabled: true, sortOrder: 0 }];
    return {
      source: 'postgresql',
      domain,
      synchronized: true,
      documentCount: documents.length,
      documents,
      sync: { sourceMode: 'firestore-write-through', sourceHash: 'content-smoke', documentCount: documents.length, syncedAt: '2026-08-10T00:00:00.000Z' },
    };
  },
  async syncDomain({ domain, documents, actorClerkUserId }) {
    if (!['home', 'rental-config', 'terms'].includes(domain) || actorClerkUserId !== 'user_smoke' || !Array.isArray(documents) || documents.length !== 1) {
      throw new Error('Unexpected site-content sync input.');
    }
    return {
      source: 'postgresql',
      domain,
      synchronized: true,
      documentCount: documents.length,
      documents,
      sync: { sourceMode: 'firestore-write-through', sourceHash: 'content-sync-smoke', documentCount: documents.length, syncedAt: '2026-08-10T00:00:01.000Z' },
    };
  },
  async replaceAdminDomain({ domain, documents, actorClerkUserId }) {
    if (domain !== 'home' || actorClerkUserId !== 'user_smoke' || !Array.isArray(documents) || documents.length !== 2) {
      throw new Error('Unexpected direct PostgreSQL administrator content input.');
    }
    return {
      source: 'postgresql',
      domain,
      authoritative: true,
      sourceMode: 'postgresql-admin-direct',
      documentCount: documents.length,
      documents,
      syncedAt: '2026-08-12T03:00:00.000Z',
    };
  },
};

const adminRentalRequestService = {
  async bootstrap(firebaseIdentity) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected admin bootstrap identity.');
    return { admin: { uid: firebaseIdentity.uid }, synchronized: 1, sourceCount: 1 };
  },
  async list(firebaseIdentity, options) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected admin list identity.');
    return {
      admin: { uid: firebaseIdentity.uid }, referenceDate: options.referenceDate || '2026-08-08',
      page: Number(options.page || 1), pageSize: Number(options.pageSize || 10), totalCount: 1,
      counts: { pending: 1, rental: 0, closed: 0, returned: 0 },
      requests: [{
        id: 'REQ-Phase17HandlerSmoke001', requesterUid: 'firebase_uid_smoke', requesterEmail: 'smoke@example.com',
        requesterName: 'Smoke User', requesterTeam: 'QA', laptopId: 'ASSET-SMOKE-1', assetCategory: '노트북',
        assetNo: 'NB-SMOKE', startDate: '2026-08-10', dueDate: '2026-08-14', purpose: 'Admin handler smoke', status: '신청중',
      }],
    };
  },
  async getDashboard(firebaseIdentity, referenceDate) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke') throw new Error('Unexpected admin dashboard identity.');
    return { admin: { uid: firebaseIdentity.uid }, referenceDate: referenceDate || '2026-08-08', counts: { pending: 1, rental: 0, closed: 0, returned: 0 } };
  },
  async syncRequest(firebaseIdentity, requestId) {
    return { admin: { uid: firebaseIdentity.uid }, synchronized: 1, eventCount: 1, request: { id: requestId } };
  },
  async getEvents(firebaseIdentity, requestId) {
    return { admin: { uid: firebaseIdentity.uid }, events: [{ id: 'PG-EVT-1', requestId, action: 'status-changed' }] };
  },
  async editRequest(firebaseIdentity, input) {
    return {
      admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced', dueDateAdjusted: false,
      request: { id: input.requestId, laptopId: 'ASSET-SMOKE-1', startDate: '2026-08-10', dueDate: '2026-08-14', status: '신청중', purpose: input.form?.purpose || '' },
      availability: { id: input.requestId, laptopId: 'ASSET-SMOKE-1', startDate: '2026-08-10', dueDate: '2026-08-14', status: '신청중' },
      asset: { id: 'ASSET-SMOKE-1', reservations: [], status: '신청중', currentRequestId: input.requestId },
    };
  },
  async saveMemo(firebaseIdentity, input) {
    return {
      admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced', changed: true,
      request: { id: input.requestId, laptopId: 'ASSET-SMOKE-1', startDate: '2026-08-10', dueDate: '2026-08-14', status: '신청중', adminMemo: input.memo || '' },
    };
  },
  async restoreStatus(firebaseIdentity, input) {
    return {
      admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced',
      request: { id: input.requestId, laptopId: 'ASSET-SMOKE-1', startDate: '2026-08-10', dueDate: '2026-08-14', status: input.nextStatus },
      availability: { id: input.requestId, laptopId: 'ASSET-SMOKE-1', startDate: '2026-08-10', dueDate: '2026-08-14', status: input.nextStatus },
      asset: { id: 'ASSET-SMOKE-1', reservations: [], status: input.nextStatus, currentRequestId: input.requestId },
    };
  },
  async reviewUserAction(firebaseIdentity, input) {
    return {
      admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced', operation: 'user-action-review',
      actionType: 'extend', approved: Boolean(input.approved), restrictionUpdated: false,
      request: { id: input.requestId, laptopId: 'ASSET-SMOKE-1', startDate: '2026-08-10', dueDate: '2026-08-16', status: '대여중', userActionRequest: { type: 'extend', status: input.approved ? 'approved' : 'denied' } },
      availability: input.approved ? { id: input.requestId, laptopId: 'ASSET-SMOKE-1', startDate: '2026-08-10', dueDate: '2026-08-16', status: '대여중' } : null,
      asset: input.approved ? { id: 'ASSET-SMOKE-1', reservations: [], status: '대여중', currentRequestId: input.requestId } : null,
    };
  },
  async changeStatus(firebaseIdentity, input) {
    if (firebaseIdentity.uid !== 'firebase_uid_smoke' || input.requestId !== 'REQ-Phase17HandlerSmoke001' || input.nextStatus !== '대여중') {
      throw new Error('Unexpected admin status input.');
    }
    return {
      admin: { uid: firebaseIdentity.uid }, authority: 'postgresql', firestoreMirror: 'synced', restrictionUpdated: false,
      request: {
        id: input.requestId, requesterUid: 'firebase_uid_smoke', requesterEmail: 'smoke@example.com', requesterName: 'Smoke User', requesterTeam: 'QA',
        laptopId: 'ASSET-SMOKE-1', assetCategory: '노트북', assetNo: 'NB-SMOKE', startDate: '2026-08-10', dueDate: '2026-08-14',
        purpose: 'Admin handler smoke', status: input.nextStatus,
      },
      availability: { id: input.requestId, laptopId: 'ASSET-SMOKE-1', startDate: '2026-08-10', dueDate: '2026-08-14', status: input.nextStatus },
      asset: { id: 'ASSET-SMOKE-1', status: input.nextStatus, currentRequestId: input.requestId, reservations: [] },
    };
  },
};

const boardService = {
  async getStatus() { return { source: 'postgresql', synchronized: true, noticeCount: 1, faqCount: 1, faqCategoryCount: 1, syncedAt: '2026-08-11T00:00:00.000Z' }; },
  async listNotice(options) { return { source: 'postgresql', config: { postsPerPage: 10 }, pinnedPosts: [], regularPosts: [{ id: 'NOTICE-SMOKE-1', title: 'Smoke Notice', contentText: 'Body', isPinned: false, viewCount: 1 }], totalRegularCount: 1, hasNextPage: false, syncedAt: '2026-08-11T00:00:00.000Z', options }; },
  async getNotice(postId) { return { id: postId, title: 'Smoke Notice', contentText: 'Body', isPinned: false, viewCount: 1 }; },
  async incrementNoticeView(postId) { if (postId !== 'NOTICE-SMOKE-1') throw new Error('Unexpected notice view ID.'); return 2; },
  async listFaq(options) { return { source: 'postgresql', config: { postsPerPage: 10 }, categories: [{ id: 'FAQ-CAT-1', name: 'General', order: 1 }], pinnedPosts: [], regularPosts: [{ id: 'FAQ-SMOKE-1', categoryId: 'FAQ-CAT-1', title: 'Smoke FAQ', contentText: 'Answer', isPinned: false }], totalRegularCount: 1, hasNextPage: false, syncedAt: '2026-08-11T00:00:00.000Z', options }; },
  async bootstrap(firebaseIdentity, actorClerkUserId) { if (firebaseIdentity.uid !== 'firebase_uid_smoke' || actorClerkUserId !== 'user_smoke') throw new Error('Unexpected board bootstrap identity.'); return { noticeCount: 1, faqCount: 1, faqCategoryCount: 1, status: { source: 'postgresql', synchronized: true, syncedAt: '2026-08-11T00:00:00.000Z' } }; },
  async saveNotice(firebaseIdentity, actorClerkUserId, post) { return { authority: 'postgresql', firestoreMirror: 'synced', post: { id: post.id || 'NOTICE-NEW', ...post, actorClerkUserId } }; },
  async deleteNotice(firebaseIdentity, postId) { return { authority: 'postgresql', firestoreMirror: 'synced', deletedPost: { id: postId } }; },
  async saveFaq(firebaseIdentity, actorClerkUserId, post) { return { authority: 'postgresql', firestoreMirror: 'synced', post: { id: post.id || 'FAQ-NEW', ...post, actorClerkUserId } }; },
  async deleteFaq(firebaseIdentity, postId) { return { authority: 'postgresql', firestoreMirror: 'synced', deletedPost: { id: postId } }; },
  async saveConfig(firebaseIdentity, boardType, postsPerPage) { return { authority: 'postgresql', firestoreMirror: 'synced', config: { boardType, postsPerPage: Number(postsPerPage) } }; },
  async saveFaqCategory(firebaseIdentity, actorClerkUserId, category) { return { authority: 'postgresql', firestoreMirror: 'synced', category: { id: category.id || 'FAQ-CAT-NEW', name: category.name, order: 2, actorClerkUserId } }; },
  async deleteFaqCategory(firebaseIdentity, categoryId) { return { authority: 'postgresql', firestoreMirror: 'synced', deletedCategory: { id: categoryId } }; },
};

const server = createServer(
  createRequestHandler({
    config,
    databaseCheck,
    authenticateRequest,
    authenticateFirebaseRequest,
    userIdentityService,
    firebaseLinkService,
    memberShadowService,
    memberAuthorityService,
    accountRecoveryService,
    accountLifecycleService,
    adminClerkAuthService,
    userClerkAuthService,
    rentalRequestWriteService,
    rentalRequestUserActionService,
    adminRentalRequestService,
    assetService,
    siteContentService,
    firestoreSiteContentClient,
    boardService,
  }),
);

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve smoke-test port.');
const baseUrl = `http://127.0.0.1:${address.port}`;

const live = await fetch(`${baseUrl}/health/live`);
if (live.status !== 200) throw new Error(`/health/live returned ${live.status}`);
const liveBody = await live.json();
if (liveBody.status !== 'ok') throw new Error('/health/live payload is invalid.');

const ready = await fetch(`${baseUrl}/health`, {
  headers: { Origin: allowedOrigin },
});
if (ready.status !== 200) throw new Error(`/health returned ${ready.status}`);
const readyBody = await ready.json();
if (readyBody.database?.status !== 'ok') throw new Error('/health database payload is invalid.');
if (readyBody.compatibility?.assetBoardWriteMirrorDisabled !== true) throw new Error('/health Phase 28 write-mirror retirement payload is invalid.');
if (readyBody.compatibility?.rentalRequestWriteMirrorDisabled !== true) throw new Error('/health Phase 29 rental-request mirror retirement payload is invalid.');
if (readyBody.compatibility?.rentalTransactionSource !== 'postgresql') throw new Error('/health Phase 29 rental transaction source payload is invalid.');
if (readyBody.compatibility?.memberStatusRestrictionWriteMirrorDisabled !== true) throw new Error('/health Phase 30 member status/restriction mirror retirement payload is invalid.');
if (readyBody.compatibility?.memberStatusSource !== 'postgresql') throw new Error('/health Phase 30 member status source payload is invalid.');
if (readyBody.compatibility?.memberProfileWriteMirrorDisabled !== true) throw new Error('/health Phase 31 member profile mirror retirement payload is invalid.');
if (readyBody.compatibility?.memberProfileSource !== 'postgresql') throw new Error('/health Phase 31 member profile source payload is invalid.');
if (readyBody.compatibility?.memberIdentitySource !== 'postgresql') throw new Error('/health Phase 31 member identity source payload is invalid.');
if (readyBody.compatibility?.accountLifecycleCompatibilityDisabled !== true) throw new Error('/health Phase 32 account lifecycle authority payload is invalid.');
if (readyBody.compatibility?.signupProfileSource !== 'postgresql') throw new Error('/health Phase 32 signup profile source payload is invalid.');
if (readyBody.compatibility?.termsConsentSource !== 'postgresql') throw new Error('/health Phase 32 terms consent source payload is invalid.');
if (readyBody.compatibility?.passwordResetDelivery !== 'firebase-auth-compatibility-preserved') throw new Error('/health Phase 32 password reset compatibility payload is invalid.');
if (!Array.isArray(readyBody.compatibility?.retiredWriteMirrorDomains) || !readyBody.compatibility.retiredWriteMirrorDomains.includes('assets') || !readyBody.compatibility.retiredWriteMirrorDomains.includes('notice') || !readyBody.compatibility.retiredWriteMirrorDomains.includes('faq') || !readyBody.compatibility.retiredWriteMirrorDomains.includes('rental-requests') || !readyBody.compatibility.retiredWriteMirrorDomains.includes('member-status') || !readyBody.compatibility.retiredWriteMirrorDomains.includes('rental-restriction-status') || !readyBody.compatibility.retiredWriteMirrorDomains.includes('member-profile') || !readyBody.compatibility.retiredWriteMirrorDomains.includes('member-identity') || !readyBody.compatibility.retiredWriteMirrorDomains.includes('account-recovery-key')) throw new Error('/health Phase 31 retired domain list is invalid.');
if (ready.headers.get('access-control-allow-origin') !== allowedOrigin) {
  throw new Error('Allowed CORS origin was not reflected.');
}

const authHeaders = { Authorization: 'Bearer smoke-token', Origin: allowedOrigin };
const session = await fetch(`${baseUrl}/api/auth/session`, { headers: authHeaders });
if (session.status !== 200) throw new Error(`/api/auth/session returned ${session.status}`);
const sessionBody = await session.json();
if (sessionBody.session?.userId !== 'user_smoke') throw new Error('Auth session payload is invalid.');

const phase32Signup = await fetch(`${baseUrl}/api/users/signup/bootstrap`, {
  method: 'POST',
  headers: { Origin: allowedOrigin, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ email: 'smoke@example.com' }),
});
if (phase32Signup.status !== 200 || (await phase32Signup.json()).signupLifecycle?.firestoreBootstrap !== 'retired') throw new Error('Phase 32 signup lifecycle HTTP response is invalid.');
const phase32Terms = await fetch(`${baseUrl}/api/users/me/terms-consent`, { headers: authHeaders });
if (phase32Terms.status !== 200 || (await phase32Terms.json()).termsConsent?.bootstrapRequired !== true) throw new Error('Phase 32 terms read HTTP response is invalid.');
const phase32TermsBootstrap = await fetch(`${baseUrl}/api/users/me/terms-consent/bootstrap`, {
  method: 'POST',
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
if (phase32TermsBootstrap.status !== 200 || (await phase32TermsBootstrap.json()).termsConsent?.legacyBootstrap !== 'imported') throw new Error('Phase 32 terms bootstrap HTTP response is invalid.');
const phase32TermsSave = await fetch(`${baseUrl}/api/users/me/terms-consent`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ policyRevision: 5, decisions: [] }),
});
if (phase32TermsSave.status !== 200 || (await phase32TermsSave.json()).termsConsent?.firestoreMirror !== 'retired') throw new Error('Phase 32 terms save HTTP response is invalid.');

const beforeSync = await fetch(`${baseUrl}/api/users/me`, { headers: authHeaders });
if (beforeSync.status !== 404) throw new Error(`/api/users/me before sync returned ${beforeSync.status}`);
const beforeSyncBody = await beforeSync.json();
if (beforeSyncBody.error !== 'profile_not_synced') throw new Error('Unsynced user response is invalid.');

const preflight = await fetch(`${baseUrl}/api/users/me/sync`, {
  method: 'OPTIONS',
  headers: {
    Origin: allowedOrigin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization',
  },
});
if (preflight.status !== 204) throw new Error(`POST preflight returned ${preflight.status}`);
if (!preflight.headers.get('access-control-allow-methods')?.includes('POST')) {
  throw new Error('POST is missing from CORS allow methods.');
}

const adminContentPutPreflight = await fetch(`${baseUrl}/api/admin/site-content/popup`, {
  method: 'OPTIONS',
  headers: {
    Origin: allowedOrigin,
    'Access-Control-Request-Method': 'PUT',
    'Access-Control-Request-Headers': 'authorization,content-type',
  },
});
if (adminContentPutPreflight.status !== 204) {
  throw new Error(`Administrator content PUT preflight returned ${adminContentPutPreflight.status}`);
}
if (!adminContentPutPreflight.headers.get('access-control-allow-methods')?.includes('PUT')) {
  throw new Error('PUT is missing from CORS allow methods.');
}

const sync = await fetch(`${baseUrl}/api/users/me/sync`, { method: 'POST', headers: authHeaders });
if (sync.status !== 200) throw new Error(`/api/users/me/sync returned ${sync.status}`);
const syncBody = await sync.json();
if (!syncBody.synchronized || syncBody.user?.id !== '42' || syncBody.user?.clerkUserId !== 'user_smoke') {
  throw new Error('User synchronization payload is invalid.');
}

const afterSync = await fetch(`${baseUrl}/api/users/me`, { headers: authHeaders });
if (afterSync.status !== 200) throw new Error(`/api/users/me after sync returned ${afterSync.status}`);
const afterSyncBody = await afterSync.json();
if (afterSyncBody.user?.primaryEmail !== 'smoke@example.com') throw new Error('Synced user lookup is invalid.');

const beforeLink = await fetch(`${baseUrl}/api/users/me/legacy/firebase`, { headers: authHeaders });
if (beforeLink.status !== 404) throw new Error(`/api/users/me/legacy/firebase before link returned ${beforeLink.status}`);

const firebasePreflight = await fetch(`${baseUrl}/api/users/me/legacy/firebase`, {
  method: 'OPTIONS',
  headers: {
    Origin: allowedOrigin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,x-firebase-authorization',
  },
});
if (firebasePreflight.status !== 204) throw new Error(`Firebase link preflight returned ${firebasePreflight.status}`);
if (!firebasePreflight.headers.get('access-control-allow-headers')?.includes('X-Firebase-Authorization')) {
  throw new Error('Firebase authorization header is missing from CORS allow headers.');
}

const link = await fetch(`${baseUrl}/api/users/me/legacy/firebase`, {
  method: 'POST',
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
if (link.status !== 200) throw new Error(`/api/users/me/legacy/firebase link returned ${link.status}`);
const linkBody = await link.json();
if (!linkBody.linked || linkBody.firebaseLink?.firebaseUid !== 'firebase_uid_smoke') {
  throw new Error('Firebase legacy link response is invalid.');
}

const afterLink = await fetch(`${baseUrl}/api/users/me/legacy/firebase`, { headers: authHeaders });
if (afterLink.status !== 200) throw new Error(`/api/users/me/legacy/firebase lookup returned ${afterLink.status}`);
const afterLinkBody = await afterLink.json();
if (afterLinkBody.firebaseLink?.appUserId !== '42') throw new Error('Firebase legacy link lookup is invalid.');


const beforeMemberShadow = await fetch(`${baseUrl}/api/users/me/legacy/member-shadow`, { headers: authHeaders });
if (beforeMemberShadow.status !== 404) throw new Error(`/api/users/me/legacy/member-shadow before sync returned ${beforeMemberShadow.status}`);

const syncMemberShadow = await fetch(`${baseUrl}/api/users/me/legacy/member-shadow/sync`, {
  method: 'POST',
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
if (syncMemberShadow.status !== 200) throw new Error(`/api/users/me/legacy/member-shadow/sync returned ${syncMemberShadow.status}`);
const syncMemberShadowBody = await syncMemberShadow.json();
if (!syncMemberShadowBody.synchronized || syncMemberShadowBody.memberShadow?.name !== 'Smoke User') {
  throw new Error('Member shadow synchronization response is invalid.');
}

const readMemberShadow = await fetch(`${baseUrl}/api/users/me/legacy/member-shadow`, { headers: authHeaders });
if (readMemberShadow.status !== 200) throw new Error(`/api/users/me/legacy/member-shadow lookup returned ${readMemberShadow.status}`);

const readCandidate = await fetch(`${baseUrl}/api/users/me/member-profile-candidate`, { headers: authHeaders });
if (readCandidate.status !== 200) throw new Error(`/api/users/me/member-profile-candidate returned ${readCandidate.status}`);
const readCandidateBody = await readCandidate.json();
if (
  readCandidateBody.readCandidate?.source !== 'postgresql-shadow' ||
  readCandidateBody.readCandidate?.authoritative !== false ||
  readCandidateBody.readCandidate?.profile?.uid !== 'firebase_uid_smoke' ||
  readCandidateBody.readCandidate?.profile?.name !== 'Smoke User'
) {
  throw new Error('Member profile read candidate response is invalid.');
}

const firebaseCutoverCandidate = await fetch(`${baseUrl}/api/legacy/member-profile-cutover-candidate`, {
  headers: {
    Origin: allowedOrigin,
    'X-Firebase-Authorization': 'Bearer firebase-smoke-token',
  },
});
if (firebaseCutoverCandidate.status !== 200) {
  throw new Error(`/api/legacy/member-profile-cutover-candidate returned ${firebaseCutoverCandidate.status}`);
}
const firebaseCutoverBody = await firebaseCutoverCandidate.json();
if (
  firebaseCutoverBody.authentication !== 'firebase-id-token' ||
  firebaseCutoverBody.readCandidate?.source !== 'postgresql-authoritative' ||
  firebaseCutoverBody.readCandidate?.authoritative !== true ||
  firebaseCutoverBody.readCandidate?.profile?.team !== 'Canonical QA' ||
  firebaseCutoverBody.readCandidate?.profile?.phone !== '010-9999-8888' ||
  firebaseCutoverBody.readCandidate?.profile?.identityKey !== 'identity_smoke' ||
  firebaseCutoverBody.readCandidate?.profile?.recoveryKey !== 'recovery_smoke' ||
  firebaseCutoverBody.readCandidate?.profile?.previousAccountUids?.[0] !== 'firebase_uid_old'
) {
  throw new Error('Firebase-authenticated member cutover candidate response is invalid.');
}

const firestoreFallback = await fetch(`${baseUrl}/api/legacy/member-profile-firestore-fallback`, {
  headers: {
    Origin: allowedOrigin,
    'X-Firebase-Authorization': 'Bearer firebase-smoke-token',
  },
});
if (firestoreFallback.status !== 200) {
  throw new Error(`/api/legacy/member-profile-firestore-fallback returned ${firestoreFallback.status}`);
}
const firestoreFallbackBody = await firestoreFallback.json();
if (
  firestoreFallbackBody.readFallback?.source !== 'firestore-one-time-fallback' ||
  firestoreFallbackBody.readFallback?.authoritative !== true ||
  firestoreFallbackBody.readFallback?.profile?.name !== 'Smoke User Firestore'
) {
  throw new Error('One-time Firestore fallback response is invalid.');
}

const writeThrough = await fetch(`${baseUrl}/api/legacy/member-shadow/write-through?firebaseUid=firebase_uid_smoke`, {
  method: 'POST',
  headers: {
    Origin: allowedOrigin,
    'X-Firebase-Authorization': 'Bearer firebase-smoke-token',
  },
});
if (writeThrough.status !== 200) {
  throw new Error(`/api/legacy/member-shadow/write-through returned ${writeThrough.status}`);
}
const writeThroughBody = await writeThrough.json();
if (
  writeThroughBody.writeThrough?.status !== 'synced' ||
  writeThroughBody.writeThrough?.firebaseUid !== 'firebase_uid_smoke' ||
  writeThroughBody.writeThrough?.actorUid !== 'firebase_uid_smoke'
) {
  throw new Error('Member write-through response is invalid.');
}

const compareMemberShadow = await fetch(`${baseUrl}/api/users/me/legacy/member-shadow/compare`, {
  method: 'POST',
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
if (compareMemberShadow.status !== 200) throw new Error(`/api/users/me/legacy/member-shadow/compare returned ${compareMemberShadow.status}`);
const compareMemberShadowBody = await compareMemberShadow.json();
if (compareMemberShadowBody.comparison?.equivalent !== true) {
  throw new Error('Member shadow comparison response is invalid.');
}


const rentalRequestCreate = await fetch(`${baseUrl}/api/users/me/rental-requests`, {
  method: 'POST',
  headers: {
    ...authHeaders,
    'Content-Type': 'application/json',
    'X-Firebase-Authorization': 'Bearer firebase-smoke-token',
  },
  body: JSON.stringify({
    requestId: 'REQ-Phase16HandlerSmoke001',
    idempotencyKey: 'REQ-Phase16HandlerSmoke001',
    laptopId: 'ASSET-SMOKE-1',
    startDate: '2026-08-10',
    dueDate: '2026-08-14',
    purpose: 'Handler smoke',
  }),
});
if (rentalRequestCreate.status !== 201) {
  throw new Error(`/api/users/me/rental-requests POST returned ${rentalRequestCreate.status}`);
}
const rentalRequestCreateBody = await rentalRequestCreate.json();
if (
  rentalRequestCreateBody.created !== true ||
  rentalRequestCreateBody.rentalRequestWrite?.authority !== 'postgresql' ||
  rentalRequestCreateBody.rentalRequestWrite?.firestoreMirror !== 'synced' ||
  rentalRequestCreateBody.rentalRequestWrite?.shadowSynchronized !== true ||
  rentalRequestCreateBody.rentalRequestWrite?.request?.id !== 'REQ-Phase16HandlerSmoke001'
) {
  throw new Error('Phase 16 rental request create HTTP response is invalid.');
}

const userEdit = await fetch(`${baseUrl}/api/users/me/rental-requests/REQ-Phase19HandlerSmoke001/edit`, {
  method: 'POST',
  headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ startDate: '2026-08-11', dueDate: '2026-08-15', purpose: 'phase19 edit' }),
});
const userEditBody = await userEdit.json();
if (userEdit.status !== 200 || userEditBody.rentalRequestUserAction?.authority !== 'postgresql' || userEditBody.rentalRequestUserAction?.operation !== 'edit') {
  throw new Error('Phase 19 user edit HTTP response is invalid.');
}
const userExtend = await fetch(`${baseUrl}/api/users/me/rental-requests/REQ-Phase19HandlerSmoke001/extend`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: '{}',
});
const userExtendBody = await userExtend.json();
if (userExtend.status !== 200 || userExtendBody.rentalRequestUserAction?.approvalMode !== 'manual' || userExtendBody.rentalRequestUserAction?.request?.userActionRequest?.status !== 'pending') {
  throw new Error('Phase 19 user extension HTTP response is invalid.');
}
const userCancel = await fetch(`${baseUrl}/api/users/me/rental-requests/REQ-Phase19HandlerSmoke001/cancel`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: '{}',
});
const userCancelBody = await userCancel.json();
if (userCancel.status !== 200 || userCancelBody.rentalRequestUserAction?.operation !== 'cancel' || userCancelBody.rentalRequestUserAction?.deleted !== true) {
  throw new Error('Phase 19 user cancel HTTP response is invalid.');
}

const adminBootstrap = await fetch(`${baseUrl}/api/admin/rental-requests/bootstrap`, {
  method: 'POST',
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
if (adminBootstrap.status !== 200 || (await adminBootstrap.json()).adminRentalRequestBootstrap?.synchronized !== 1) {
  throw new Error('Phase 17 admin rental request bootstrap HTTP response is invalid.');
}
const adminList = await fetch(`${baseUrl}/api/admin/rental-requests?tab=pending&page=1&pageSize=10&referenceDate=2026-08-08`, {
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
const adminListBody = await adminList.json();
if (adminList.status !== 200 || adminListBody.adminRentalRequests?.source !== 'postgresql' || adminListBody.adminRentalRequests?.totalCount !== 1) {
  throw new Error('Phase 17 admin rental request list HTTP response is invalid.');
}
const adminDashboard = await fetch(`${baseUrl}/api/admin/rental-dashboard?referenceDate=2026-08-08`, {
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
const adminDashboardBody = await adminDashboard.json();
if (adminDashboard.status !== 200 || adminDashboardBody.adminRentalDashboard?.source !== 'postgresql' || adminDashboardBody.adminRentalDashboard?.counts?.pending !== 1) {
  throw new Error('Phase 17 admin rental dashboard HTTP response is invalid.');
}
const adminStatus = await fetch(`${baseUrl}/api/admin/rental-requests/REQ-Phase17HandlerSmoke001/status`, {
  method: 'POST',
  headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ status: '대여중' }),
});
const adminStatusBody = await adminStatus.json();
if (adminStatus.status !== 200 || adminStatusBody.adminRentalRequestMutation?.authority !== 'postgresql' || adminStatusBody.adminRentalRequestMutation?.firestoreMirror !== 'synced') {
  throw new Error('Phase 17 admin rental status HTTP response is invalid.');
}

const adminSync = await fetch(`${baseUrl}/api/admin/rental-requests/REQ-Phase17HandlerSmoke001/sync`, {
  method: 'POST', headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
if (adminSync.status !== 200 || (await adminSync.json()).adminRentalRequestSync?.target !== 'postgresql') {
  throw new Error('Phase 18 admin targeted sync HTTP response is invalid.');
}
const adminEvents = await fetch(`${baseUrl}/api/admin/rental-requests/REQ-Phase17HandlerSmoke001/events`, {
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
if (adminEvents.status !== 200 || !Array.isArray((await adminEvents.json()).adminRentalRequestEvents?.events)) {
  throw new Error('Phase 18 admin event read HTTP response is invalid.');
}
const adminEdit = await fetch(`${baseUrl}/api/admin/rental-requests/REQ-Phase17HandlerSmoke001/edit`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ form: { startDate: '2026-08-10', dueDate: '2026-08-14', purpose: 'edited' } }),
});
if (adminEdit.status !== 200 || (await adminEdit.json()).adminRentalRequestMutation?.operation !== 'edit') {
  throw new Error('Phase 18 admin edit HTTP response is invalid.');
}
const adminMemo = await fetch(`${baseUrl}/api/admin/rental-requests/REQ-Phase17HandlerSmoke001/memo`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ memo: 'phase18 memo' }),
});
if (adminMemo.status !== 200 || (await adminMemo.json()).adminRentalRequestMutation?.operation !== 'memo') {
  throw new Error('Phase 18 admin memo HTTP response is invalid.');
}
const adminRestore = await fetch(`${baseUrl}/api/admin/rental-requests/REQ-Phase17HandlerSmoke001/restore`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ status: '신청중', restoreReason: 'smoke restore' }),
});
if (adminRestore.status !== 200 || (await adminRestore.json()).adminRentalRequestMutation?.operation !== 'restore') {
  throw new Error('Phase 18 admin restore HTTP response is invalid.');
}

const adminUserActionReview = await fetch(`${baseUrl}/api/admin/rental-requests/REQ-Phase17HandlerSmoke001/user-action-review`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ approved: true }),
});
const adminUserActionReviewBody = await adminUserActionReview.json();
if (adminUserActionReview.status !== 200 || adminUserActionReviewBody.adminRentalRequestMutation?.authority !== 'postgresql' || adminUserActionReviewBody.adminRentalRequestMutation?.operation !== 'user-action-review') {
  throw new Error('Phase 19 admin user action review HTTP response is invalid.');
}

const assetCatalog = await fetch(`${baseUrl}/api/assets/catalog`);
const assetCatalogBody = await assetCatalog.json();
if (assetCatalog.status !== 200 || assetCatalogBody.assetCatalog?.source !== 'postgresql' || assetCatalogBody.assetCatalog?.assets?.length !== 1) {
  throw new Error('Phase 20 public asset catalog HTTP response is invalid.');
}
const assetBootstrap = await fetch(`${baseUrl}/api/admin/assets/bootstrap`, { method: 'POST', headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' } });
if (assetBootstrap.status !== 200 || (await assetBootstrap.json()).adminAssetBootstrap?.target !== 'postgresql') throw new Error('Phase 20 admin asset bootstrap HTTP response is invalid.');
const assetCreate = await fetch(`${baseUrl}/api/admin/assets`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: JSON.stringify({ asset: { category: '노트북', assetNo: 'A-NEW', model: 'New' } }) });
if (assetCreate.status !== 201 || (await assetCreate.json()).adminAssetMutation?.operation !== 'create') throw new Error('Phase 20 admin asset create HTTP response is invalid.');
const assetEdit = await fetch(`${baseUrl}/api/admin/assets/ASSET-SMOKE-1/edit`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: JSON.stringify({ asset: { category: '노트북', assetNo: 'NB-SMOKE', model: 'Edited' } }) });
if (assetEdit.status !== 200 || (await assetEdit.json()).adminAssetMutation?.operation !== 'edit') throw new Error('Phase 20 admin asset edit HTTP response is invalid.');
const assetBulk = await fetch(`${baseUrl}/api/admin/assets/bulk`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: JSON.stringify({ assets: [{ category: '노트북', assetNo: 'B-1' }] }) });
if (assetBulk.status !== 200 || (await assetBulk.json()).adminAssetMutation?.operation !== 'bulk-create') throw new Error('Phase 20 admin asset bulk HTTP response is invalid.');
const assetCategories = await fetch(`${baseUrl}/api/admin/assets/categories`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: JSON.stringify({ categories: ['노트북'] }) });
if (assetCategories.status !== 200 || (await assetCategories.json()).adminAssetMutation?.operation !== 'categories') throw new Error('Phase 20 admin asset categories HTTP response is invalid.');
const assetDelete = await fetch(`${baseUrl}/api/admin/assets/ASSET-SMOKE-1/delete`, { method: 'POST', headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' } });
if (assetDelete.status !== 200 || (await assetDelete.json()).adminAssetMutation?.operation !== 'delete') throw new Error('Phase 20 admin asset delete HTTP response is invalid.');


const memberProfileWrite = await fetch(`${baseUrl}/api/users/me/member-profile`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ name: 'Smoke User', team: 'QA', phone: '010-0000-0000' }),
});
const memberProfileWriteBody = await memberProfileWrite.json();
if (memberProfileWrite.status !== 200 || memberProfileWriteBody.memberProfileWrite?.authority !== 'postgresql' || memberProfileWriteBody.memberProfileWrite?.firestoreMirror !== 'retired') {
  throw new Error('Phase 21 self member profile authority HTTP response is invalid.');
}
const adminMembersRead = await fetch(`${baseUrl}/api/admin/members?status=all&page=1&pageSize=10&q=target`, {
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
const adminMembersReadBody = await adminMembersRead.json();
if (adminMembersRead.status !== 200 || adminMembersReadBody.adminMembers?.source !== 'postgresql' || !Array.isArray(adminMembersReadBody.adminMembers?.accounts) || adminMembersReadBody.adminMembers?.totalCount !== 1) {
  throw new Error('Phase 30 admin member PostgreSQL read HTTP response is invalid.');
}

const adminMemberProfileWrite = await fetch(`${baseUrl}/api/admin/members/member-target/profile`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ name: 'Target User', team: 'Ops', phone: '010-1111-2222' }),
});
const adminMemberProfileWriteBody = await adminMemberProfileWrite.json();
if (adminMemberProfileWrite.status !== 200 || adminMemberProfileWriteBody.adminMemberProfileWrite?.authority !== 'postgresql' || adminMemberProfileWriteBody.adminMemberProfileWrite?.firestoreMirror !== 'retired') {
  throw new Error('Phase 21 admin member profile authority HTTP response is invalid.');
}
const adminMemberStatusWrite = await fetch(`${baseUrl}/api/admin/members/member-target/status`, {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ status: 'blocked' }),
});
const adminMemberStatusWriteBody = await adminMemberStatusWrite.json();
if (adminMemberStatusWrite.status !== 200 || adminMemberStatusWriteBody.adminMemberStatusWrite?.profile?.status !== 'blocked') {
  throw new Error('Phase 21 admin member status authority HTTP response is invalid.');
}
const adminIdentityRegistry = await fetch(`${baseUrl}/api/admin/identity-registry/bootstrap`, {
  method: 'POST', headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
});
const adminIdentityRegistryBody = await adminIdentityRegistry.json();
if (adminIdentityRegistry.status !== 200 || adminIdentityRegistryBody.adminIdentityRegistry?.target !== 'postgresql-admin-registry' || adminIdentityRegistryBody.adminIdentityRegistry?.count !== 2) {
  throw new Error('Phase 21 admin identity registry HTTP response is invalid.');
}

const accountRecoveryEmail = await fetch(baseUrl + '/api/account-recovery/email', {
  method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Smoke User', team: 'QA', phone: '010-0000-0000' }),
});
const accountRecoveryEmailBody = await accountRecoveryEmail.json();
if (accountRecoveryEmail.status !== 200 || accountRecoveryEmailBody.accountRecovery?.source !== 'postgresql' || accountRecoveryEmailBody.accountRecovery?.maskedEmail !== 's***@example.com') throw new Error('Phase 22 account recovery email HTTP response is invalid.');
const accountRecoveryVerify = await fetch(baseUrl + '/api/account-recovery/password-reset/verify', {
  method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'smoke@example.com', name: 'Smoke User', team: 'QA', phone: '010-0000-0000' }),
});
const accountRecoveryVerifyBody = await accountRecoveryVerify.json();
if (accountRecoveryVerify.status !== 200 || accountRecoveryVerifyBody.accountRecovery?.source !== 'postgresql' || accountRecoveryVerifyBody.accountRecovery?.verified !== true) throw new Error('Phase 22 password reset verification HTTP response is invalid.');
const adminClerkSession = await fetch(baseUrl + '/api/admin/auth/session', { headers: authHeaders });
const adminClerkSessionBody = await adminClerkSession.json();
if (adminClerkSession.status !== 200 || adminClerkSessionBody.adminAuthentication?.authority !== 'clerk' || adminClerkSessionBody.adminAuthentication?.clerkLinkState !== 'linked') throw new Error('Phase 22 administrator Clerk session HTTP response is invalid.');
const adminClerkMigration = await fetch(baseUrl + '/api/admin/auth/migrate', {
  method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ password: 'legacy6' }),
});
const adminClerkMigrationBody = await adminClerkMigration.json();
if (adminClerkMigration.status !== 200 || adminClerkMigrationBody.adminAuthentication?.migration !== 'firebase-admin-to-clerk' || adminClerkMigrationBody.adminAuthentication?.authority !== 'clerk') throw new Error('Phase 22 administrator migration HTTP response is invalid.');
const adminClerkProvision = await fetch(baseUrl + '/api/admin/identity-registry/firebase_admin_target/provision', {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ password: 'newpass88' }),
});
const adminClerkProvisionBody = await adminClerkProvision.json();
if (adminClerkProvision.status !== 200 || adminClerkProvisionBody.adminAuthentication?.provisioned !== true || adminClerkProvisionBody.adminAuthentication?.firebaseUid !== 'firebase_admin_target') throw new Error('Phase 22 administrator provision HTTP response is invalid.');

const userClerkSession = await fetch(baseUrl + '/api/users/auth/session', { headers: authHeaders });
const userClerkSessionBody = await userClerkSession.json();
if (userClerkSession.status !== 200 || userClerkSessionBody.userAuthentication?.authority !== 'clerk' || userClerkSessionBody.userAuthentication?.firebaseUid !== 'firebase_uid_smoke') throw new Error('Phase 23 user Clerk session HTTP response is invalid.');
const userClerkMigration = await fetch(baseUrl + '/api/users/auth/migrate', {
  method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ password: 'legacy888' }),
});
const userClerkMigrationBody = await userClerkMigration.json();
if (userClerkMigration.status !== 200 || userClerkMigrationBody.userAuthentication?.migration !== 'firebase-user-to-clerk') throw new Error('Phase 23 user Clerk migration HTTP response is invalid.');
const userClerkProvision = await fetch(baseUrl + '/api/users/auth/provision', {
  method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ password: 'newpass88' }),
});
const userClerkProvisionBody = await userClerkProvision.json();
if (userClerkProvision.status !== 200 || userClerkProvisionBody.userAuthentication?.provisioned !== true) throw new Error('Phase 23 user Clerk provision HTTP response is invalid.');
const userPasswordVerify = await fetch(baseUrl + '/api/users/me/password/verify', {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'legacy888' }),
});
const userPasswordVerifyBody = await userPasswordVerify.json();
if (userPasswordVerify.status !== 200 || userPasswordVerifyBody.passwordVerification?.authority !== 'clerk' || userPasswordVerifyBody.passwordVerification?.verified !== true) throw new Error('Phase 23 user password verification HTTP response is invalid.');
const userPasswordChange = await fetch(baseUrl + '/api/users/me/password/change', {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ currentPassword: 'legacy888', newPassword: 'newpass88' }),
});
const userPasswordChangeBody = await userPasswordChange.json();
if (userPasswordChange.status !== 200 || userPasswordChangeBody.passwordChange?.authority !== 'clerk' || userPasswordChangeBody.passwordChange?.changed !== true) throw new Error('Phase 23 user password change HTTP response is invalid.');
const userWithdrawalFinalize = await fetch(baseUrl + '/api/users/me/withdrawal/finalize', {
  method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ password: 'newpass88' }),
});
const userWithdrawalFinalizeBody = await userWithdrawalFinalize.json();
if (userWithdrawalFinalize.status !== 200 || userWithdrawalFinalizeBody.withdrawal?.authority !== 'postgresql' || userWithdrawalFinalizeBody.withdrawal?.withdrawn !== true || userWithdrawalFinalizeBody.withdrawal?.clerkDeleted !== true) throw new Error('Phase 23 user withdrawal finalization HTTP response is invalid.');

const siteContentRead = await fetch(baseUrl + '/api/site-content/home', { headers: { Origin: allowedOrigin } });
const siteContentReadBody = await siteContentRead.json();
if (siteContentRead.status !== 200 || siteContentReadBody.siteContent?.source !== 'postgresql' || siteContentReadBody.siteContent?.domain !== 'home' || siteContentReadBody.siteContent?.documentCount !== 2) {
  throw new Error('Phase 24 site-content public read HTTP response is invalid.');
}
const siteContentSync = await fetch(baseUrl + '/api/admin/site-content/home/sync', {
  method: 'POST',
  headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ documents: [{ documentKey: 'homePage/config', payload: { heroTitle: 'Updated Smoke Home' }, enabled: true, sortOrder: 0 }] }),
});
const siteContentSyncBody = await siteContentSync.json();
if (siteContentSync.status !== 200 || siteContentSyncBody.authorized !== true || siteContentSyncBody.siteContent?.source !== 'postgresql' || siteContentSyncBody.siteContent?.documentCount !== 1 || siteContentSyncBody.siteContentSource?.mode !== 'firestore-server-backend-full-domain' || siteContentSyncBody.siteContentSource?.documentCount !== 1) {
  throw new Error('Phase 24 administrator site-content sync HTTP response is invalid.');
}
const siteContentDirect = await fetch(baseUrl + '/api/admin/site-content/home', {
  method: 'PUT',
  headers: { ...authHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ documents: [
    { key: 'homePage/config', payload: { heroTitle: 'Phase 34 Home' }, enabled: true, sortOrder: 0 },
    { key: 'homeBanners/phase34', payload: { title: 'Phase 34 Banner' }, enabled: true, sortOrder: 1 },
  ] }),
});
const siteContentDirectBody = await siteContentDirect.json();
if (siteContentDirect.status !== 200 || siteContentDirectBody.authorized !== true ||
  siteContentDirectBody.siteContentMutation?.authority !== 'postgresql' ||
  siteContentDirectBody.siteContentMutation?.sourceMode !== 'postgresql-admin-direct' ||
  siteContentDirectBody.siteContent?.documentCount !== 2) {
  throw new Error('Phase 34 administrator direct PostgreSQL content replacement HTTP response is invalid.');
}
const policyContentRead = await fetch(baseUrl + '/api/site-content/rental-config', { headers: { Origin: allowedOrigin } });
const policyContentReadBody = await policyContentRead.json();
if (policyContentRead.status !== 200 || policyContentReadBody.siteContent?.domain !== 'rental-config' || policyContentReadBody.siteContent?.source !== 'postgresql') {
  throw new Error('Phase 25 rental-config PostgreSQL read HTTP response is invalid.');
}
const termsContentSync = await fetch(baseUrl + '/api/admin/site-content/terms/sync', {
  method: 'POST',
  headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' },
  body: JSON.stringify({ documents: [{ documentKey: 'signupTermsPolicy/current', payload: { enabled: true, revision: 1, activeTerms: [] }, enabled: true, sortOrder: 0 }] }),
});
const termsContentSyncBody = await termsContentSync.json();
if (termsContentSync.status !== 200 || termsContentSyncBody.authorized !== true || termsContentSyncBody.siteContent?.domain !== 'terms' || termsContentSyncBody.siteContentSource?.mode !== 'firestore-server-backend-full-domain') {
  throw new Error('Phase 25 terms PostgreSQL sync HTTP response is invalid.');
}


const boardStatus = await fetch(baseUrl + '/api/boards/status', { headers: { Origin: allowedOrigin } });
if (boardStatus.status !== 200 || (await boardStatus.json()).boardStatus?.source !== 'postgresql') throw new Error('Phase 26 board status HTTP response is invalid.');
const noticeBoard = await fetch(baseUrl + '/api/boards/notice?page=1&pageSize=10', { headers: { Origin: allowedOrigin } });
const noticeBoardBody = await noticeBoard.json();
if (noticeBoard.status !== 200 || noticeBoardBody.board?.source !== 'postgresql' || noticeBoardBody.board?.regularPosts?.[0]?.id !== 'NOTICE-SMOKE-1') throw new Error('Phase 26 notice list HTTP response is invalid.');
const noticeDetail = await fetch(baseUrl + '/api/boards/notice/NOTICE-SMOKE-1', { headers: { Origin: allowedOrigin } });
if (noticeDetail.status !== 200 || (await noticeDetail.json()).boardPost?.id !== 'NOTICE-SMOKE-1') throw new Error('Phase 26 notice detail HTTP response is invalid.');
const noticeView = await fetch(baseUrl + '/api/boards/notice/NOTICE-SMOKE-1/view', { method: 'POST', headers: { Origin: allowedOrigin } });
if (noticeView.status !== 200 || (await noticeView.json()).noticeView?.viewCount !== 2) throw new Error('Phase 26 notice view-count HTTP response is invalid.');
const faqBoard = await fetch(baseUrl + '/api/boards/faq?page=1&pageSize=10&categoryId=all', { headers: { Origin: allowedOrigin } });
const faqBoardBody = await faqBoard.json();
if (faqBoard.status !== 200 || faqBoardBody.board?.source !== 'postgresql' || faqBoardBody.board?.categories?.length !== 1) throw new Error('Phase 26 FAQ list HTTP response is invalid.');
const boardBootstrap = await fetch(baseUrl + '/api/admin/boards/bootstrap', { method: 'POST', headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' } });
if (boardBootstrap.status !== 200 || (await boardBootstrap.json()).adminBoardBootstrap?.noticeCount !== 1) throw new Error('Phase 26 board bootstrap HTTP response is invalid.');
const boardNoticeSave = await fetch(baseUrl + '/api/admin/boards/notice/posts', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: JSON.stringify({ post: { title: 'New notice', contentText: 'Body', authorUid: 'firebase_uid_smoke', authorName: 'Smoke Admin' } }) });
const boardNoticeSaveBody = await boardNoticeSave.json();
if (boardNoticeSave.status !== 201 || boardNoticeSaveBody.adminBoardMutation?.authority !== 'postgresql' || boardNoticeSaveBody.adminBoardMutation?.firestoreMirror !== 'synced') throw new Error('Phase 26 notice authoritative save HTTP response is invalid.');
const boardFaqSave = await fetch(baseUrl + '/api/admin/boards/faq/posts', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: JSON.stringify({ post: { categoryId: 'FAQ-CAT-1', title: 'New FAQ', contentText: 'Answer', authorUid: 'firebase_uid_smoke', authorName: 'Smoke Admin' } }) });
if (boardFaqSave.status !== 201 || (await boardFaqSave.json()).adminBoardMutation?.authority !== 'postgresql') throw new Error('Phase 26 FAQ authoritative save HTTP response is invalid.');
const boardConfigSave = await fetch(baseUrl + '/api/admin/boards/notice/config', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: JSON.stringify({ postsPerPage: 20 }) });
if (boardConfigSave.status !== 200 || (await boardConfigSave.json()).adminBoardMutation?.operation !== 'config') throw new Error('Phase 26 board config HTTP response is invalid.');
const boardCategorySave = await fetch(baseUrl + '/api/admin/boards/faq/categories', { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', 'X-Firebase-Authorization': 'Bearer firebase-smoke-token' }, body: JSON.stringify({ category: { name: 'More' } }) });
if (boardCategorySave.status !== 201 || (await boardCategorySave.json()).adminBoardMutation?.operation !== 'category-create') throw new Error('Phase 26 FAQ category HTTP response is invalid.');

const invalidFirebase = await fetch(`${baseUrl}/api/users/me/legacy/firebase`, {
  method: 'POST',
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer wrong-token' },
});
if (invalidFirebase.status !== 401) throw new Error(`Invalid Firebase token returned ${invalidFirebase.status}`);

const missing = await fetch(`${baseUrl}/missing`);
if (missing.status !== 404) throw new Error(`/missing returned ${missing.status}`);

await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
console.log('[server-smoke] PASS (/health, Clerk auth, identity GET/POST, Firebase legacy link, member shadow sync/compare, Phase 9 PostgreSQL cutover candidate, Phase 10 one-time Firestore fallback, Phase 11 member write-through, Phase 16 rental-request POST, Phase 17 admin bootstrap/list/dashboard/status + Phase 18 sync/events/edit/memo/restore + Phase 19 user edit/cancel/extend/admin-review + Phase 20 asset catalog/bootstrap/CRUD/bulk/categories + Phase 21 member profile/status authority/admin registry + Phase 22 account recovery/admin Clerk session/migration/provision + Phase 23 user Clerk session/migration/provision/password/withdrawal authority + Phase 24 site-content + Phase 25 rental-config/terms read/sync + Phase 26 notice/FAQ public/admin authority + Phase 28 asset/board + Phase 29 rental-request + Phase 30 member-status/restriction + Phase 31 member-profile + Phase 32 signup/terms lifecycle authority health/routes, CORS, 404)');
