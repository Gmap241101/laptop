import { createServer } from 'node:http';
import { createRequestHandler } from '../../server/src/app.mjs';

const allowedOrigin = 'https://staging.example.vercel.app';
const config = {
  serviceName: 'rental-api',
  appEnv: 'test',
  serviceVersion: 'phase11-smoke',
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

const server = createServer(
  createRequestHandler({
    config,
    databaseCheck,
    authenticateRequest,
    authenticateFirebaseRequest,
    userIdentityService,
    firebaseLinkService,
    memberShadowService,
    rentalRequestWriteService,
    rentalRequestUserActionService,
    adminRentalRequestService,
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
if (ready.headers.get('access-control-allow-origin') !== allowedOrigin) {
  throw new Error('Allowed CORS origin was not reflected.');
}

const authHeaders = { Authorization: 'Bearer smoke-token', Origin: allowedOrigin };
const session = await fetch(`${baseUrl}/api/auth/session`, { headers: authHeaders });
if (session.status !== 200) throw new Error(`/api/auth/session returned ${session.status}`);
const sessionBody = await session.json();
if (sessionBody.session?.userId !== 'user_smoke') throw new Error('Auth session payload is invalid.');

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

const invalidFirebase = await fetch(`${baseUrl}/api/users/me/legacy/firebase`, {
  method: 'POST',
  headers: { ...authHeaders, 'X-Firebase-Authorization': 'Bearer wrong-token' },
});
if (invalidFirebase.status !== 401) throw new Error(`Invalid Firebase token returned ${invalidFirebase.status}`);

const missing = await fetch(`${baseUrl}/missing`);
if (missing.status !== 404) throw new Error(`/missing returned ${missing.status}`);

await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
console.log('[server-smoke] PASS (/health, Clerk auth, identity GET/POST, Firebase legacy link, member shadow sync/compare, Phase 9 PostgreSQL cutover candidate, Phase 10 one-time Firestore fallback, Phase 11 member write-through, Phase 16 rental-request POST, Phase 17 admin bootstrap/list/dashboard/status + Phase 18 sync/events/edit/memo/restore + Phase 19 user edit/cancel/extend/admin-review, CORS, 404)');
