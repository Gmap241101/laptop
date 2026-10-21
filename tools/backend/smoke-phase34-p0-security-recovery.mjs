import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClerkDeviceTrustService } from '../../server/src/clerk/clerk-device-trust-service.mjs';
import { createSystemDataRepository } from '../../server/src/settings/system-data-repository.mjs';
import { describeResetBackupProof } from '../../server/src/settings/system-reset-backup-proof.mjs';

const makeFixture = (initialCount = 10) => {
  const store = new Map([['device-trust-policy', { deviceTrustEmailVerificationEnabled: true }]]);
  const users = new Map(Array.from({ length: initialCount }, (_, i) => [`user_${i}`, false]));
  let owner = false;
  let failedOnEnable = false;
  let failRollbacks = false;
  const systemConfigService = {
    async withDeviceTrustLock(work) {
      if (owner) throw Object.assign(new Error('busy'), { code: 'clerk_device_trust_change_in_progress', status: 409 });
      owner = true;
      try { return await work(); } finally { owner = false; }
    },
    async get(key) { return { payload: store.get(key) || {} }; },
    async put({ key, payload }) { store.set(key, payload); return { payload }; },
    async getDeviceTrustSyncState() { return store.get('device-trust-sync-state') || {}; },
    async putDeviceTrustSyncState(payload) { store.set('device-trust-sync-state', payload); },
    async appendDeviceTrustAudit(entry) { return entry; },
    async listDeviceTrustAudit() { return []; },
  };
  const client = {
    async getUser(id) {
      if (!users.has(id)) throw Object.assign(new Error('not found'), { status: 404 });
      return { bypassClientTrust: users.get(id) };
    },
    async updateUser(id, { bypass_client_trust }) {
      // Simulate an update succeeding remotely but the client response failing.
      if (id === 'user_3' && bypass_client_trust === true && !failedOnEnable) {
        failedOnEnable = true;
        users.set(id, true);
        throw Object.assign(new Error('timeout after commit'), { status: 422 });
      }
      if (id === 'user_3' && bypass_client_trust === false && failRollbacks) {
        throw Object.assign(new Error('rollback refused'), { status: 422 });
      }
      users.set(id, bypass_client_trust);
      return { bypassClientTrust: bypass_client_trust };
    },
  };
  const service = createClerkDeviceTrustService({ clerkClient: client, systemConfigService,
    adminIdentityRepository: { async listActive() { return users.has('user_0') ? [{ clerkUserId: 'user_0' }] : []; } },
    userAuthRepository: { async listActiveClerkUsers() { return [...users.keys()].map((clerkUserId) => ({ clerkUserId })); } },
  });
  return { users, store, service, systemConfigService, setFailRollbacks(value) { failRollbacks = value; } };
};

const fail = makeFixture(10);
fail.setFailRollbacks(true);
await assert.rejects(() => fail.service.setEnabled(false, { actorClerkUserId: 'admin' }),
  (error) => error.code === 'clerk_device_trust_recovery_required');
assert.equal(fail.store.get('device-trust-policy').deviceTrustEmailVerificationEnabled, true);
assert.equal(fail.store.get('device-trust-sync-state').status, 'recovery_required');
assert.equal(fail.users.get('user_3'), true, 'the test must leave an actual inconsistent Clerk account');
const redacted = await fail.service.get();
assert.equal(redacted.sync.recoveryRequired, true);
assert.equal('failedClerkUserIds' in redacted.sync, false, 'Clerk user identifiers must not be exposed in GET');
fail.setFailRollbacks(false);
assert.equal((await fail.service.reconcile({ actorClerkUserId: 'admin' })).sync.status, 'synchronized');
assert.equal(fail.users.get('user_3'), false);
assert.equal((await fail.service.get()).sync.recoveryRequired, false);
const normal = makeFixture(1);
assert.equal((await normal.service.setEnabled(false)).enabled, false);
assert.equal(normal.users.get('user_0'), true);
const thousand = makeFixture(1000);
assert.equal((await thousand.service.setEnabled(true)).syncedAccountCount, 1000);
const busy = makeFixture(1);
let releaseLock;
const held = busy.systemConfigService.withDeviceTrustLock(() => new Promise((resolve) => { releaseLock = resolve; }));
await assert.rejects(() => busy.service.setEnabled(false),
  (error) => error.code === 'clerk_device_trust_change_in_progress' && error.status === 409);
releaseLock();
await held;
const empty = makeFixture(0);
assert.equal((await empty.service.setEnabled(false)).syncedAccountCount, 0);

const valid = {
  type: 'full-pg-dump-isolated-restore-v1', databaseName: 'production',
  verifiedAt: new Date().toISOString(), dumpSha256: 'a'.repeat(64),
  tableCountsSha256: 'b'.repeat(64), verifiedTableCount: 35,
};
assert.equal(describeResetBackupProof(valid, 'production').valid, true);
assert.equal(describeResetBackupProof(valid, 'staging').valid, false);
assert.equal(describeResetBackupProof({ ...valid, verifiedAt: new Date(Date.now()-2*3600000).toISOString() }, 'production').valid, false);
assert.equal(describeResetBackupProof({ ...valid, dumpSha256: 'invalid' }, 'production').valid, false);

const queries = [];
let validProof = false;
const makeClient = () => ({
  async query(sql, params) {
    queries.push(String(sql));
    if (/SELECT value, current_database\(\)/.test(sql)) {
      return { rows: [{ value: validProof ? valid : {}, database_name: 'production' }] };
    }
    return { rows: [{}] };
  }, release() {},
});
const repository = createSystemDataRepository({
  async query(sql, params) {
    queries.push(String(sql));
    if (/SELECT m\.value, current_database\(\)/.test(sql)) {
      return { rows: [{ value: validProof ? valid : {}, database_name: 'production' }] };
    }
    return { rows: [{}] };
  },
  async connect() { return makeClient(); },
});
await assert.rejects(() => repository.resetScopes({ scopes: ['settings'] }),
  (error) => error.code === 'system_data_verified_restore_required');
assert.equal(queries.some((query) => query.includes('DELETE FROM app_system_configuration')), false,
  'invalid backup proof must stop reset before DELETE');
validProof = true;
await repository.resetScopes({ scopes: ['settings'], actorClerkUserId: 'admin' });
assert.ok(queries.some((query) => query.includes("config_key NOT IN ('device-trust-policy','device-trust-sync-state','system-settings-audit')")),
  'site settings reset must preserve Device Trust policy and reconciliation record');
assert.ok(queries.some((query) => query.includes('DELETE FROM app_runtime_metadata WHERE key=$1')),
  'restore proof must be one-time and consumed with reset transaction');

const src = readFileSync('src/admin/AdminSettingsPanel.jsx', 'utf8');
assert.match(src, /조회용 JSON/, 'admin UI must not claim JSON is a full DB restorable backup');
const client = readFileSync('src/clerk/clerkStagingClient.js', 'utf8');
assert.match(client, /reconcileAdminClerkDeviceTrust/, 'admin frontend must support reconciliation');
console.log('[phase34-p0-security-recovery-smoke] PASS');
