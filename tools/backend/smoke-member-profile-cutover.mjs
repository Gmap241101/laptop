import assert from 'node:assert/strict';

import { createFirebaseLinkRepository } from '../../server/src/legacy/firebase-link-repository.mjs';
import { createMemberShadowRepository } from '../../server/src/legacy/member-shadow-repository.mjs';
import { createMemberShadowService } from '../../server/src/legacy/member-shadow-service.mjs';

const row = {
  app_user_id: '77',
  firebase_uid: 'firebase_phase9',
  source_collection: 'userAccounts',
  source_document_path: 'projects/test/databases/(default)/documents/userAccounts/firebase_phase9',
  uid: 'firebase_phase9',
  email: 'phase9@example.com',
  masked_email: 'p***@example.com',
  name: 'Phase Nine',
  team: 'QA',
  phone: '010-9999-0000',
  status: 'active',
  directory_member_id: 'M9',
  directory_verified_version: 9,
  profile_required_reason: '',
  rejoined_account: false,
  terms_consent_revision: 4,
  terms_consent_policy_version: 4,
  identity_key: 'identity_phase9',
  recovery_key: 'recovery_phase9',
  previous_account_uids: ['firebase_old_phase9'],
  source_created_at: new Date('2026-08-01T00:00:00Z'),
  source_updated_at: new Date('2026-08-07T00:00:00Z'),
  source_hash: 'b'.repeat(64),
  synced_at: new Date('2026-08-07T00:00:00Z'),
  created_at: new Date('2026-08-07T00:00:00Z'),
  updated_at: new Date('2026-08-07T00:00:00Z'),
};
const pool = {
  async query(sql, params) {
    if (sql.includes('FROM app_user_firebase_links') && sql.includes('WHERE firebase_uid = $1')) {
      return { rows: params[0] === 'firebase_phase9' ? [{
        app_user_id: '77', firebase_uid: 'firebase_phase9', firebase_email: 'phase9@example.com',
        firebase_email_verified: true, firebase_sign_in_provider: 'password', linked_at: new Date(),
        last_verified_at: new Date(), created_at: new Date(), updated_at: new Date(),
      }] : [] };
    }
    if (sql.includes('FROM app_user_firebase_links') && sql.includes('WHERE app_user_id = $1')) {
      return { rows: [] };
    }
    if (sql.includes('FROM app_user_member_shadows') && sql.includes('WHERE app_user_id = $1')) {
      return { rows: String(params[0]) === '77' ? [row] : [] };
    }
    throw new Error(`Unexpected SQL in Phase 9 cutover smoke: ${sql}`);
  },
};
const firebaseLinkRepository = createFirebaseLinkRepository(pool);
const memberShadowRepository = createMemberShadowRepository(pool);
const service = createMemberShadowService({
  userRepository: { async findByClerkUserId() { return null; } },
  firebaseLinkRepository,
  memberShadowRepository,
  firestoreUserAccountClient: { async getUserAccount() { throw new Error('not used'); } },
});
const shadow = await service.getCurrentByFirebaseIdentity({ uid: 'firebase_phase9', email: 'phase9@example.com' });
assert.equal(shadow.appUserId, '77');
assert.equal(shadow.identityKey, 'identity_phase9');
assert.equal(shadow.recoveryKey, 'recovery_phase9');
assert.deepEqual(shadow.previousAccountUids, ['firebase_old_phase9']);
await assert.rejects(
  () => service.getCurrentByFirebaseIdentity({ uid: 'firebase_phase9', email: 'other@example.com' }),
  (error) => error.code === 'firebase_link_email_mismatch',
);
assert.equal(await service.getCurrentByFirebaseIdentity({ uid: 'missing', email: '' }).catch((e) => e.code), 'legacy_link_not_found');
console.log('[member-profile-cutover-backend-smoke] PASS (Firebase UID -> linked app user -> full PostgreSQL runtime member shadow)');
