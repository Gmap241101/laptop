import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDeviceTrustPolicy, createClerkDeviceTrustService } from '../../server/src/clerk/clerk-device-trust-service.mjs';
import { normalizeClerkBackendUser } from '../../server/src/clerk/clerk-api.mjs';
import { createSystemConfigService } from '../../server/src/settings/system-config-service.mjs';

let passes = 0;
const pass = () => { passes++; };
assert.equal(normalizeClerkBackendUser({ id: 'user_test' }).bypassClientTrust, null); pass();
assert.equal(normalizeClerkBackendUser({ id: 'user_test', bypass_client_trust: 'false' }).bypassClientTrust, null); pass();
assert.equal(normalizeClerkBackendUser({ id: 'user_test', bypass_client_trust: false }).bypassClientTrust, false); pass();
await assert.rejects(() => readDeviceTrustPolicy({ async get() { throw new Error('database unavailable'); } }),
  e => e.code === 'device_trust_policy_read_failed' && e.status === 503); pass();
await assert.rejects(() => readDeviceTrustPolicy({ async get() { return { present: true, payload: { deviceTrustEmailVerificationEnabled: 'false' } }; } }),
  e => e.code === 'device_trust_policy_invalid'); pass();
assert.equal((await readDeviceTrustPolicy({ async get() { return { present: false, payload: {} }; } })).enabled, true); pass();

function fixture(size, { enabled = true, bypass = !enabled, orphan = null, omitted = null } = {}) {
  let held = false;
  const policy = { deviceTrustEmailVerificationEnabled: enabled, policyRevision: 3 };
  const state = new Map([['device-trust-policy', policy]]);
  const users = new Map(Array.from({ length: size }, (_, i) => [`user_${i}`, bypass]));
  const audit = []; let updates = 0; let reads = 0;
  const repository = {
    async withDeviceTrustLock(work) {
      if (held) throw Object.assign(new Error('busy'), { status: 409, code: 'clerk_device_trust_change_in_progress' });
      held = true;
      try { return await work(); } finally { held = false; }
    },
    async get(key) { return state.has(key) ? { payload: state.get(key) } : null; },
    async put({ key, payload }) { state.set(key, payload); return { payload }; },
    async appendDeviceTrustAudit(event) { audit.push(event); return event; },
    async listDeviceTrustAudit() { return audit; },
    async listAudit() { return []; },
    async appendAudit() {},
  };
  const config = createSystemConfigService({ repository });
  const client = {
    async getUser(id) {
      reads++;
      if (!users.has(id) || id === orphan) throw Object.assign(new Error('missing'), { status: 404 });
      return omitted === id ? {} : { bypassClientTrust: users.get(id) };
    },
    async updateUser(id, update) {
      updates++;
      if (!users.has(id) || id === orphan) throw Object.assign(new Error('missing'), { status: 404 });
      users.set(id, update.bypass_client_trust);
      return { bypassClientTrust: update.bypass_client_trust };
    },
  };
  const ids = () => [...users.keys()];
  const service = createClerkDeviceTrustService({ clerkClient: client, systemConfigService: config,
    adminIdentityRepository: { async listActive() { return []; } },
    userAuthRepository: { async listActiveClerkUsers() { return ids().map(clerkUserId => ({ clerkUserId })); } },
  });
  return { config, service, client, users, audit, state, get updates() { return updates; }, get reads() { return reads; },
    async enrollment(work) { return config.withDeviceTrustEnrollment(work); } };
}
const bulk = fixture(1000, { enabled: true, bypass: true });
const saved = await bulk.service.setEnabled(true, { actorClerkUserId: 'owner' });
assert.equal(saved.syncedAccountCount, 1000);
assert.equal(bulk.updates, 1000, 'all 1,000 accounts must receive a real PATCH');
assert.ok(bulk.reads >= 2000, 'all accounts must also be independently GET verified');
assert.ok([...bulk.users.values()].every(value => value === false));
assert.equal(bulk.state.get('device-trust-policy').policyRevision, 4);
assert.equal(bulk.audit[0].eventType, 'policy_change_started');
assert.equal(bulk.audit.at(-1).eventType, 'policy_change_finished'); pass();
const orphaned = fixture(2, { enabled: true, bypass: false, orphan: 'user_1' });
await assert.rejects(() => orphaned.service.reconcile({ actorClerkUserId: 'owner' }),
  e => e.code === 'clerk_device_trust_reconciliation_incomplete');
assert.equal(orphaned.state.get('device-trust-sync-state').status, 'recovery_required'); pass();
const omitted = fixture(1, { enabled: true, bypass: true, omitted: 'user_0' });
await assert.rejects(() => omitted.service.setEnabled(true, { actorClerkUserId: 'owner' }),
  e => ['clerk_device_trust_recovery_required', 'clerk_device_trust_user_sync_not_confirmed'].includes(e.code));
assert.notEqual(omitted.state.get('device-trust-sync-state').status, 'synchronized'); pass();
const concurrent = fixture(1, { enabled: true, bypass: false });
let release;
const activePolicy = concurrent.config.withDeviceTrustLock(() => new Promise(r => { release = r; }));
await assert.rejects(() => concurrent.enrollment(async () => true), e => e.status === 409);
release(); await activePolicy;
await concurrent.service.setEnabled(false, { actorClerkUserId: 'owner' });
const enrollment = await concurrent.enrollment(async policy => {
  assert.equal(policy.enabled, false); assert.equal(policy.revision, 4);
  concurrent.users.set('new_user', !policy.enabled);
  return true;
});
assert.equal(enrollment, true);
assert.equal(concurrent.users.get('new_user'), true);
pass();
const sql = readFileSync('server/src/settings/system-data-repository.mjs', 'utf8');
assert.match(sql, /'device-trust-policy','device-trust-sync-state','system-settings-audit'/); pass();
const migration = readFileSync('server/migrations/042_phase34_w01_device_trust_security_audit.sql', 'utf8');
assert.match(migration, /CREATE TABLE IF NOT EXISTS app_device_trust_audit_events/); pass();
const authUser = readFileSync('server/src/auth/user-clerk-auth-service.mjs', 'utf8');
assert.equal((authUser.match(/return withEnrollment\(async/g) || []).length, 5);
assert.equal((authUser.match(/verifyEnrollment\(clerkUser\.clerkUserId, !enabled\)/g) || []).length, 5);
const authAdmin = readFileSync('server/src/auth/admin-clerk-auth-service.mjs', 'utf8');
assert.match(authAdmin, /withDeviceTrustEnrollment/); pass();
console.log(`[phase34-w01-device-trust-consistency] PASS (${passes} focused assertions, 1000 real mock updates + GET)`);
