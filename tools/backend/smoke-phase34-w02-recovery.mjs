import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClerkDeviceTrustService } from '../../server/src/clerk/clerk-device-trust-service.mjs';
import { createClerkBackendClient } from '../../server/src/clerk/clerk-api.mjs';

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
function fixture({ n = 4, existing = true, initial = true } = {}) {
  const state = new Map(existing ? [['device-trust-policy', { deviceTrustEmailVerificationEnabled: initial, policyRevision: 3 }]] : []);
  const users = new Map(Array.from({ length: n }, (_, i) => [`user_${i}`, !initial]));
  const operations = new Map();
  const audit = [];
  const config = {
    held: false, writes: 0, deletes: 0,
    async withDeviceTrustLock(fn) {
      if (this.held) throw Object.assign(new Error('busy'), { code: 'clerk_device_trust_change_in_progress', status: 409 });
      this.held = true;
      try { return await fn(); } finally { this.held = false; }
    },
    async get(k) { return { present: state.has(k), payload: state.get(k) || {} }; },
    async put({ key, payload }) { state.set(key, payload); this.writes++; return { payload }; },
    async deleteDeviceTrustPolicy() { state.delete('device-trust-policy'); this.deletes++; },
    async getDeviceTrustSyncState() { return state.get('device-trust-sync-state') || {}; },
    async putDeviceTrustSyncState(p) { state.set('device-trust-sync-state', p); },
    async appendDeviceTrustAudit(e) { audit.push(e); },
    async listDeviceTrustAudit() { return audit; },
    async startDeviceTrustOperation({ operationId, ...params }) { operations.set(operationId, { ...params, operationId, status: 'applying' }); },
    async updateDeviceTrustOperation({ operationId, status, ...params }) {
      check(operations.has(operationId), 'journal update requires preexisting operation');
      operations.set(operationId, { ...operations.get(operationId), ...params, status });
    },
    async listPendingDeviceTrustOperations() { return [...operations.values()].filter(op => ['applying', 'recovery_required'].includes(op.status)); },
    async markRecoveredDeviceTrustOperations(exceptId) {
      for (const [id, op] of operations) if (id !== exceptId && ['applying', 'recovery_required'].includes(op.status)) {
        operations.set(id, { ...op, status: 'recovered' });
      }
    },
  };
  let updateFailure = null;
  let rollbackFailure = false;
  let delayResolve = null;
  const client = {
    async getUser(id) {
      if (!users.has(id)) throw Object.assign(new Error('missing'), { status: 404 });
      return { bypassClientTrust: users.get(id) };
    },
    async updateUser(id, { bypass_client_trust }) {
      if (delayResolve && id === 'user_0') await delayResolve;
      if (updateFailure && id === 'user_1' && bypass_client_trust === initial) {
        const failure = updateFailure; updateFailure = null;
        users.set(id, bypass_client_trust);
        throw Object.assign(new Error('response lost'), failure);
      }
      if (rollbackFailure && id === 'user_1' && bypass_client_trust === !initial) {
        throw Object.assign(new Error('rollback failed'), { code: 'clerk_rollback_rejected', status: 422 });
      }
      users.set(id, bypass_client_trust);
      return { bypassClientTrust: bypass_client_trust };
    },
  };
  const service = createClerkDeviceTrustService({ clerkClient: client, systemConfigService: config,
    adminIdentityRepository: { async listActive() { return []; } },
    userAuthRepository: { async listActiveClerkUsers() { return [...users.keys()].map(clerkUserId => ({ clerkUserId })); } },
  });
  return { service, config, state, users, operations, audit,
    failUpdate(err = { status: 422, code: 'clerk_response_lost' }) { updateFailure = err; },
    failRollback(value = true) { rollbackFailure = value; },
    delayUser0(p) { delayResolve = p; },
  };
}

const baseline = fixture({ existing: false });
baseline.failUpdate();
await assert.rejects(() => baseline.service.setEnabled(false), e => e.code === 'clerk_device_trust_user_sync_partial_failure');
check(!baseline.state.has('device-trust-policy'), 'default ON rollback must DELETE not write empty JSON');
check((await baseline.service.get()).enabled === true, 'secure default remains readable');
check(baseline.config.deletes === 1, 'restored policy absence');
check([...baseline.operations.values()][0].status === 'failed_recovered', 'durable recovered status');

const partial = fixture();
partial.failUpdate();
partial.failRollback();
await assert.rejects(() => partial.service.setEnabled(false), e => e.code === 'clerk_device_trust_recovery_required');
check(partial.state.get('device-trust-policy').deviceTrustEmailVerificationEnabled === true, 'policy remains previous value');
check([...partial.operations.values()][0].status === 'recovery_required', 'compensation failure journal');
check([...partial.operations.values()][0].checkpoint === 'compensation_partial', 'partial rollback checkpoint persists');
await assert.rejects(() => partial.service.setEnabled(false), e => e.code === 'clerk_device_trust_recovery_required' && e.status === 409);
partial.failRollback(false);
check((await partial.service.reconcile()).sync.status === 'synchronized', 'explicit recovery succeeds');
check([...partial.operations.values()].every(op => !['applying','recovery_required'].includes(op.status)), 'orphaned operations resolved');

const crashed = fixture();
await crashed.config.startDeviceTrustOperation({ operationId: 'crash-1', kind:'policy_change', requestedEnabled:false });
check((await crashed.service.get()).sync.recoveryRequired, 'GET exposes orphaned operation without Clerk IDs');
await assert.rejects(() => crashed.service.setEnabled(false), e => e.code === 'clerk_device_trust_recovery_required');
check((await crashed.service.reconcile()).sync.status === 'synchronized', 'reconcile final policy');
check(crashed.operations.get('crash-1').status === 'recovered', 'abandoned journal reclaimed');

// A successful remote PATCH followed by a transient 429 must be retried and
// verified by a separate GET; Retry-After support remains bounded.
const throttled = fixture({ n: 2 });
throttled.failUpdate({ status: 429, code: 'rate_limit', retryAfter: '0' });
const throttledResult = await throttled.service.setEnabled(false);
check(throttledResult.enabled === false, '429 transient PATCH completes after bounded retry');
check(throttled.users.get('user_1') === true, 'authoritative Clerk state confirmed after 429');
check([...throttled.operations.values()][0].status === 'synchronized', 'durable journal finalized after retry');

// An unmodified policy is idempotent with respect to remote Clerk values.
const idem = fixture({ n: 1 });
check((await idem.service.reconcile()).sync.status === 'synchronized', 'no-op reconciliation is safe');
check(idem.users.get('user_0') === false, 'no-op leaves remote bypass unchanged');

// 10 opposite requests cannot both modify policy during one held lock.
const race = fixture({ n: 1 });
let unblock;
const gate = new Promise(resolve => { unblock = resolve; });
race.delayUser0(gate);
const first = race.service.setEnabled(false);
await new Promise(resolve => setTimeout(resolve, 0));
const opposite = await Promise.allSettled(Array.from({ length: 10 }, () => race.service.setEnabled(true)));
check(opposite.every(r => r.status === 'rejected' && r.reason.code === 'clerk_device_trust_change_in_progress'),
  'all competing owners get conflict');
unblock();
check((await first).enabled === false, 'one winner');
check(race.users.get('user_0') === true, 'remote state matches winner');

// The real Clerk adapter must retain the Retry-After header so the retry
// policy can honor it rather than discarding HTTP metadata.
const realAdapter = createClerkBackendClient({ secretKey: 'sk_test_mocked_not_real',
  fetchImpl: async () => new Response(JSON.stringify({ errors: [] }),
    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '1' } }) });
await assert.rejects(() => realAdapter.getUser('test_user'), e => {
  check(e.status === 429, 'Clerk adapter preserves 429');
  check(e.retryAfter === '1', 'Clerk adapter preserves Retry-After');
  return true;
});

// No direct DB or network calls: migration and permission guard are statically checked.
const migration = readFileSync('server/migrations/043_phase34_w02_device_trust_operation_recovery.sql', 'utf8');
check(migration.includes('CREATE TABLE IF NOT EXISTS app_device_trust_operations'), 'same DB journal');
check(!/CREATE DATABASE|CREATE EXTENSION|CREATE ROLE/i.test(migration), 'no new database/extension/role');
const app = readFileSync('server/src/app.mjs', 'utf8');
check(app.includes("admin_owner_required"), 'owner guard retained');
console.log(`[phase34-w02-recovery] PASS (${checks} assertions, no external services)`);
