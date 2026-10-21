import assert from 'node:assert/strict';
import { createClerkDeviceTrustService } from '../../server/src/clerk/clerk-device-trust-service.mjs';

let checks = 0;
const ok = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const match = (value, predicate, message) => { assert.ok(predicate(value), message); checks += 1; };
const makeFixture = ({ n = 10, initial = true, startPolicy = true, missingId = null } = {}) => {
  const state = new Map(startPolicy ? [['device-trust-policy', { deviceTrustEmailVerificationEnabled: initial, policyRevision: 4 }]] : []);
  const active = new Set(Array.from({ length: n }, (_, i) => `user_${i}`));
  const clerk = new Map([...active].map(id => [id, !initial]));
  if (missingId) clerk.delete(missingId);
  const ops = new Map();
  const audit = [];
  let locked = false;
  let failureRule = null;
  let patchCount = 0;
  let getCount = 0;
  const cfg = {
    async withDeviceTrustLock(fn) {
      if (locked) throw Object.assign(new Error('busy'), { status: 409, code: 'clerk_device_trust_change_in_progress' });
      locked = true;
      try { return await fn(); } finally { locked = false; }
    },
    async get(key) { return { present: state.has(key), payload: state.get(key) || {} }; },
    async put({key, payload}) { state.set(key, payload); return { payload }; },
    async deleteDeviceTrustPolicy() { state.delete('device-trust-policy'); },
    async getDeviceTrustSyncState() { return state.get('device-trust-sync-state') || {}; },
    async putDeviceTrustSyncState(data) { state.set('device-trust-sync-state', data); },
    async appendDeviceTrustAudit(data) { audit.push(data); },
    async listDeviceTrustAudit() { return audit; },
    async startDeviceTrustOperation({ operationId, ...rest }) { ops.set(operationId, { operationId, status: 'applying', ...rest, updatedAt: new Date().toISOString() }); },
    async updateDeviceTrustOperation({ operationId, ...rest }) {
      assert.ok(ops.has(operationId), 'journal must exist before checkpoint');
      ops.set(operationId, { ...ops.get(operationId), ...rest, updatedAt: new Date().toISOString() });
    },
    async listPendingDeviceTrustOperations() { return [...ops.values()].filter(op => ['applying', 'recovery_required'].includes(op.status)); },
    async markRecoveredDeviceTrustOperations(exceptId) {
      for (const [id, op] of ops) if (id !== exceptId && ['applying', 'recovery_required'].includes(op.status)) ops.set(id, { ...op, status: 'recovered' });
    },
  };
  const client = {
    async getUser(id) {
      getCount++;
      if (!clerk.has(id)) throw Object.assign(new Error('not found'), { status: 404 });
      return { bypassClientTrust: clerk.get(id) };
    },
    async updateUser(id, { bypass_client_trust }) {
      patchCount++;
      if (failureRule) {
        const action = await failureRule({ id, bypass: bypass_client_trust, patchCount });
        if (action) {
          if (action.apply) clerk.set(id, bypass_client_trust);
          throw Object.assign(new Error('mocked upstream error'), { status: action.status || 503, code: action.code || 'clerk_mock_failed', retryAfter: action.retryAfter });
        }
      }
      clerk.set(id, bypass_client_trust);
      return { bypassClientTrust: bypass_client_trust };
    },
  };
  const service = createClerkDeviceTrustService({ clerkClient: client, systemConfigService: cfg,
    adminIdentityRepository: { async listActive() { return []; } },
    userAuthRepository: { async listActiveClerkUsers() { return [...active].map(clerkUserId => ({ clerkUserId })); } },
  });
  return { service, cfg, state, clerk, active, ops, audit,
    fail(rule) { failureRule = rule; }, get patches() { return patchCount; }, get gets() { return getCount; } };
};

const failureOne = async (targetIndex, rollbackFailure = false) => {
  const f = makeFixture();
  f.fail(({id, bypass}) => (id === `user_${targetIndex}` && bypass === true) || (rollbackFailure && id === 'user_0' && bypass === false) ? {status: 422, code: 'clerk_mock_rejected'} : null);
  await assert.rejects(f.service.setEnabled(false), error => {
    match(error.code, c => ['clerk_device_trust_user_sync_partial_failure', 'clerk_device_trust_recovery_required'].includes(c), 'failure must not be reported as success');
    return true;
  });
  const op = [...f.ops.values()][0];
  ok(f.state.get('device-trust-policy').deviceTrustEmailVerificationEnabled, true, 'old policy retained');
  ok(f.state.get('device-trust-policy').policyRevision, 4, 'old revision retained');
  ok(op.status, rollbackFailure ? 'recovery_required' : 'failed_recovered', 'durable compensation state');
  ok(f.state.get('device-trust-sync-state').status, op.status, 'sync-state and journal agree');
  match(f.audit, entries => entries.some(x => x.eventType === 'policy_change_failed'), 'audited failure');
  if (rollbackFailure) {
    await assert.rejects(f.service.setEnabled(true), e => e.code === 'clerk_device_trust_recovery_required' && e.status === 409);
    checks++;
    f.fail(null);
    ok((await f.service.reconcile()).sync.status, 'synchronized', 'explicit owner recovery');
    match([...f.ops.values()], entries => entries.every(op => !['applying', 'recovery_required'].includes(op.status)), 'no outstanding journals');
  } else {
    match([...f.clerk.values()], values => values.every(v => v === false), 'full compensation to old value');
  }
  return f;
};
await failureOne(4);
await failureOne(9, true);

// An upstream 503 followed by a successful retry must never need a new policy revision.
const transient = makeFixture();
let injected503 = false;
transient.fail(({id, bypass}) => {
  if (!injected503 && id === 'user_5' && bypass === true) { injected503 = true; return { status: 503, code: 'upstream_unavailable' }; }
  return null;
});
ok((await transient.service.setEnabled(false)).enabled, false, '503 retry commits desired policy');
match([...transient.clerk.values()], values => values.every(x => x === true), 'all 10 accounts converged');
ok([...transient.ops.values()][0].status, 'synchronized', 'journal synchronized after transient retry');

// A timeout can occur after Clerk applied PATCH; a subsequent GET is authoritative.
const timeout = makeFixture();
let timedOutOnce = false;
timeout.fail(({id, bypass}) => {
  if (!timedOutOnce && id === 'user_6' && bypass === true) { timedOutOnce = true; return {status: 503, code: 'ETIMEDOUT', apply: true}; }
  return null;
});
ok((await timeout.service.setEnabled(false)).enabled, false, 'PATCH applied/response lost recovers');
match([...timeout.clerk.values()], values => values.every(x => x === true), 'timeout GET verification converged');

// A 404 for still-active account may not be silently skipped.
const orphan = makeFixture({missingId: 'user_9'});
await assert.rejects(orphan.service.setEnabled(false), e => e.code === 'clerk_device_trust_recovery_required');
checks++;
ok([...orphan.ops.values()][0].status, 'recovery_required', 'active orphan retains pending journal');
match(orphan.audit, entries => entries.some(x => x.eventType === 'policy_change_failed'), 'orphan failure audited');
orphan.active.delete('user_9'); // simulate explicit retirement from PostgreSQL active set
ok((await orphan.service.reconcile()).sync.status, 'synchronized', 'retired missing account safely excluded');
match([...orphan.ops.values()], entries => entries.every(op => !['applying', 'recovery_required'].includes(op.status)), 'orphan reconciled after retirement');

// Default ON policy without a row must restore row ABSENCE, not invalid '{}'.
const absent = makeFixture({startPolicy:false});
absent.fail(({id, bypass}) => id === 'user_9' && bypass === true ? {status:422, code:'cannot_patch'} : null);
await assert.rejects(absent.service.setEnabled(false));
checks++;
ok(absent.state.has('device-trust-policy'), false, 'default policy row absence preserved');
ok((await absent.service.get()).enabled, true, 'secure default still available');

// Interrupted operation: blocking new mutations until deliberate reconciliation.
const crash = makeFixture();
await crash.cfg.startDeviceTrustOperation({operationId:'00000000-0000-4000-8000-000000000001',kind:'policy_change',policyRevision:5});
await assert.rejects(crash.service.setEnabled(false), e => e.code === 'clerk_device_trust_recovery_required' && e.status === 409);
checks++;
ok((await crash.service.reconcile()).sync.status, 'synchronized', 'recovered interrupted work');
ok([...crash.ops.values()].some(op => op.status === 'recovered'), true, 'interrupted journal finalized');

// Concurrent policy decisions: one live request, any competing 2 or 10 must conflict.
for (const concurrency of [2,10]) {
  const f = makeFixture({n:1});
  let release;
  const hold = new Promise(r => { release = r; });
  let entered;
  const started = new Promise(r => { entered = r; });
  let intercepted = false;
  f.fail(async ({id,bypass}) => {
    if (!intercepted && id === 'user_0' && bypass === true) {
      intercepted = true;
      entered();
      await hold;
    }
    return null;
  });
  const leader = f.service.setEnabled(false);
  await started;
  const competing = await Promise.allSettled(Array.from({length: concurrency}, () => f.service.setEnabled(true)));
  ok(competing.length, concurrency, `${concurrency} competing requests considered`);
  match(competing, values => values.every(r => r.status === 'rejected' && r.reason.status === 409 && r.reason.code === 'clerk_device_trust_change_in_progress'), `${concurrency} lock conflicts`);
  release();
  ok((await leader).enabled, false, 'sole leader commits policy');
  ok(f.clerk.get('user_0'), true, 'Clerk remains winner value');
  ok(f.state.get('device-trust-policy').policyRevision, 5, 'single increment under conflict');
  match([...f.ops.values()], ops => ops.length === 1 && ops[0].status === 'synchronized', 'one journal committed');
}

// If the winning request times out while others collide, no ghost success permitted.
const collidedTimeout = makeFixture({n:1});
let release;
const hold = new Promise(r => { release = r; });
let entered;
const started = new Promise(r => { entered = r; });
let intercepted = false;
collidedTimeout.fail(async ({id,bypass}) => {
  if (!intercepted && id === 'user_0' && bypass === true) {
    intercepted = true;
    entered();
    await hold;
    return {status: 422, code:'response_lost', apply:true};
  }
  return null;
});
const leader = collidedTimeout.service.setEnabled(false);
await started;
const competing = await Promise.allSettled([collidedTimeout.service.setEnabled(true), collidedTimeout.service.setEnabled(false)]);
match(competing, results => results.every(r => r.status === 'rejected' && r.reason.status === 409), 'conflicts rejected during uncertain winner');
release();
await assert.rejects(leader, e => e.code === 'clerk_device_trust_user_sync_partial_failure');
checks++;
ok([...collidedTimeout.ops.values()][0].status, 'failed_recovered', 'uncertain winning request compensated, no success');
ok(collidedTimeout.state.get('device-trust-policy').policyRevision, 4, 'failed winner does not commit revision');
ok(collidedTimeout.clerk.get('user_0'), false, 'Clerk restored to old state');

// Existing owner-only policy/recovery endpoints share an auth gate; no mutation is invoked here.
import { readFileSync } from 'node:fs';
const appSource = readFileSync('server/src/app.mjs', 'utf8');
for (const endpoint of [
  "request.method === 'POST' && url.pathname === '/api/admin/clerk-device-trust/reconcile'",
  "request.method === 'PATCH' && url.pathname === '/api/admin/clerk-device-trust'",
  "request.method === 'GET' && url.pathname === '/api/admin/clerk-device-trust/audit'",
]) {
  const pos = appSource.indexOf(endpoint);
  match(pos, n => n >= 0, `endpoint exists ${endpoint}`);
  match(appSource.slice(pos, pos + 500), s => s.includes("adminRole || 'admin') !== 'owner'"), 'owner gate before service call');
}
console.log(`[phase34-w02-acceptance-matrix] PASS (${checks} checks; AC-S02/AC-S03 boundary fixtures; no DB/Clerk writes)`);
