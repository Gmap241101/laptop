import assert from 'node:assert/strict';

import {
  createFirestoreUserAccountClient,
  decodeFirestoreDocument,
} from '../../server/src/firestore/firestore-user-account.mjs';
import { createMemberShadowRepository } from '../../server/src/legacy/member-shadow-repository.mjs';
import { createMemberShadowService } from '../../server/src/legacy/member-shadow-service.mjs';

const firestoreDocument = {
  name: 'projects/laptop-system-mk/databases/(default)/documents/userAccounts/firebase_uid_phase7',
  createTime: '2026-08-01T00:00:00.000Z',
  updateTime: '2026-08-07T00:00:00.000Z',
  fields: {
    uid: { stringValue: 'firebase_uid_phase7' },
    email: { stringValue: 'phase7@example.com' },
    maskedEmail: { stringValue: 'p***@example.com' },
    name: { stringValue: 'Phase Seven' },
    team: { stringValue: 'QA' },
    phone: { stringValue: '010-1234-5678' },
    status: { stringValue: 'active' },
    identityKey: { stringValue: 'identity_phase7' },
    recoveryKey: { stringValue: 'recovery_phase7' },
    directoryMemberId: { stringValue: 'directory_phase7' },
    directoryVerifiedVersion: { integerValue: '3' },
    profileRequiredReason: { stringValue: '' },
    rejoinedAccount: { booleanValue: false },
    previousAccountUids: { arrayValue: { values: [{ stringValue: 'old_uid' }] } },
    inheritedRestriction: { mapValue: { fields: { blocked: { booleanValue: false } } } },
    termsConsentRevision: { integerValue: '4' },
    termsConsentPolicyVersion: { integerValue: '4' },
    createdAt: { timestampValue: '2026-08-01T00:00:00.000Z' },
    updatedAt: { timestampValue: '2026-08-07T00:00:00.000Z' },
  },
};

const decoded = decodeFirestoreDocument(firestoreDocument);
assert.equal(decoded.fields.uid, 'firebase_uid_phase7');
assert.equal(decoded.fields.directoryVerifiedVersion, 3);
assert.deepEqual(decoded.fields.previousAccountUids, ['old_uid']);
assert.deepEqual(decoded.fields.inheritedRestriction, { blocked: false });

let requestedUrl = '';
let requestedAuthorization = '';
const firestoreClient = createFirestoreUserAccountClient({
  projectId: 'laptop-system-mk',
  fetchImpl: async (url, options) => {
    requestedUrl = url;
    requestedAuthorization = options.headers.Authorization;
    return {
      ok: true,
      status: 200,
      async json() { return firestoreDocument; },
    };
  },
});
const fetched = await firestoreClient.getUserAccount({
  firebaseUid: 'firebase_uid_phase7',
  firebaseIdToken: 'firebase-token-phase7',
});
assert.equal(fetched.fields.email, 'phase7@example.com');
assert.match(requestedUrl, /userAccounts\/firebase_uid_phase7$/);
assert.equal(requestedAuthorization, 'Bearer firebase-token-phase7');

let shadowRow = null;
const pool = {
  async query(sql, params) {
    if (sql.includes('FROM app_user_member_shadows') && sql.includes('WHERE app_user_id = $1')) {
      return { rows: shadowRow && String(shadowRow.app_user_id) === String(params[0]) ? [shadowRow] : [] };
    }
    if (sql.includes('INSERT INTO app_user_member_shadows')) {
      shadowRow = {
        app_user_id: String(params[0]),
        firebase_uid: params[1],
        source_collection: 'userAccounts',
        source_document_path: params[2],
        uid: params[3],
        email: params[4],
        masked_email: params[5],
        name: params[6],
        team: params[7],
        phone: params[8],
        status: params[9],
        directory_member_id: params[10],
        directory_verified_version: params[11],
        profile_required_reason: params[12],
        rejoined_account: params[13],
        terms_consent_revision: params[14],
        terms_consent_policy_version: params[15],
        identity_key: params[16],
        recovery_key: params[17],
        previous_account_uids: JSON.parse(params[18]),
        source_created_at: params[19],
        source_updated_at: params[20],
        source_hash: params[21],
        synced_at: new Date('2026-08-07T00:00:00.000Z'),
        created_at: new Date('2026-08-07T00:00:00.000Z'),
        updated_at: new Date('2026-08-07T00:00:00.000Z'),
      };
      return { rows: [shadowRow] };
    }
    throw new Error(`Unexpected Phase 7 SQL: ${sql}`);
  },
};

const userRepository = {
  async findByClerkUserId(clerkUserId) {
    return clerkUserId === 'user_phase7'
      ? { id: '9', clerkUserId, primaryEmail: 'phase7@example.com' }
      : null;
  },
};
const firebaseLinkRepository = {
  async findByAppUserId(appUserId) {
    return String(appUserId) === '9'
      ? { appUserId: '9', firebaseUid: 'firebase_uid_phase7', firebaseEmail: 'phase7@example.com' }
      : null;
  },
  async findByFirebaseUid(firebaseUid) {
    return firebaseUid === 'firebase_uid_phase7'
      ? { appUserId: '9', firebaseUid, firebaseEmail: 'phase7@example.com' }
      : null;
  },
};
const memberShadowRepository = createMemberShadowRepository(pool);
let liveDocument = structuredClone(firestoreDocument);
const service = createMemberShadowService({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  firestoreUserAccountClient: {
    async getUserAccount({ firebaseUid, firebaseIdToken }) {
      assert.equal(firebaseUid, 'firebase_uid_phase7');
      assert.equal(firebaseIdToken, 'verified-firebase-token');
      return decodeFirestoreDocument(liveDocument);
    },
  },
});

assert.equal(await service.getCurrent('user_phase7'), null);
const firebaseIdentity = {
  uid: 'firebase_uid_phase7',
  email: 'phase7@example.com',
  idToken: 'verified-firebase-token',
};
const shadow = await service.syncCurrent('user_phase7', firebaseIdentity);
assert.equal(shadow.appUserId, '9');
assert.equal(shadow.name, 'Phase Seven');
assert.equal(shadow.status, 'active');
assert.equal(shadow.identityKey, 'identity_phase7');
assert.equal(shadow.recoveryKey, 'recovery_phase7');
assert.deepEqual(shadow.previousAccountUids, ['old_uid']);
assert.equal(shadow.sourceHash.length, 64);
const firebaseLookup = await service.getCurrentByFirebaseIdentity({
  uid: 'firebase_uid_phase7',
  email: 'phase7@example.com',
});
assert.equal(firebaseLookup?.appUserId, '9');

const equalComparison = await service.compareCurrent('user_phase7', firebaseIdentity);
assert.equal(equalComparison.equivalent, true);
assert.deepEqual(equalComparison.changedFields, []);

liveDocument.fields.team = { stringValue: 'Platform' };
liveDocument.fields.updatedAt = { timestampValue: '2026-08-07T01:00:00.000Z' };
const changedComparison = await service.compareCurrent('user_phase7', firebaseIdentity);
assert.equal(changedComparison.equivalent, false);
assert.ok(changedComparison.changedFields.includes('team'));
assert.notEqual(changedComparison.sourceHash, changedComparison.shadowHash);

await assert.rejects(
  () => service.syncCurrent('user_phase7', { ...firebaseIdentity, uid: 'other_uid' }),
  (error) => error.code === 'legacy_link_token_mismatch',
);

liveDocument = structuredClone(firestoreDocument);
liveDocument.fields.email = { stringValue: 'other@example.com' };
await assert.rejects(
  () => service.syncCurrent('user_phase7', firebaseIdentity),
  (error) => error.code === 'member_source_email_mismatch',
);

console.log('[member-profile-shadow-smoke] PASS (Firestore REST decode/auth, PostgreSQL shadow upsert, equality and drift detection)');
