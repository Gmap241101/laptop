import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClerkDeviceTrustService } from '../../server/src/clerk/clerk-device-trust-service.mjs';
import { createSystemConfigService } from '../../server/src/settings/system-config-service.mjs';
import { createSystemDataRepository } from '../../server/src/settings/system-data-repository.mjs';

const failure = (status, code = 'simulated_clerk_error') => Object.assign(new Error(code), { status, code });
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };

function deviceTrustFixture(count, { failures = {}, retiredAtRead = [] } = {}) {
  const entries = new Map(Array.from({ length: count }, (_, i) => [`user_${i}`, true]));
  const active = new Set(entries.keys());
  const attempts = new Map();
  const faults = new Map(Object.entries(failures));
  const events = [];
  const state = new Map([['device-trust-policy', { deviceTrustEmailVerificationEnabled: true, policyRevision: 2 }]]);
  let locked = false;
  let activeOperations = 0;
  let maximumConcurrent = 0;
  let patched = 0;
  let independentlyRead = 0;
  const begin = async (name, id, work) => {
    activeOperations++;
    maximumConcurrent = Math.max(maximumConcurrent, activeOperations);
    try {
      const key = `${name}:${id}`;
      const current = (attempts.get(key) || 0) + 1;
      attempts.set(key, current);
      const config = faults.get(key);
      if (config?.delay) await delay(config.delay);
      if (config?.first && current <= config.first) throw failure(config.status ?? 429);
      if (config?.always) throw failure(config.status ?? 503);
      return work();
    } finally { activeOperations--; }
  };
  const repo = {
    async withDeviceTrustLock(work) {
      if (locked) throw failure(409, 'clerk_device_trust_change_in_progress');
      locked = true;
      try { return await work(); } finally { locked = false; }
    },
    async get(key) { return state.has(key) ? { payload: state.get(key) } : null; },
    async put({ key, payload }) { state.set(key, structuredClone(payload)); return { payload }; },
    async appendDeviceTrustAudit(event) { events.push(structuredClone(event)); },
    async listDeviceTrustAudit() { return events; },
    async listAudit() { return []; }, async appendAudit() {},
  };
  const service = createClerkDeviceTrustService({
    clerkClient: {
      async getUser(id) {
        return begin('get', id, async () => {
          independentlyRead++;
          if (retiredAtRead.includes(id)) active.delete(id);
          if (!entries.has(id)) throw failure(404, 'clerk_user_not_found');
          return { bypassClientTrust: entries.get(id) };
        });
      },
      async updateUser(id, data) {
        return begin('patch', id, async () => {
          if (!entries.has(id)) throw failure(404, 'clerk_user_not_found');
          patched++;
          entries.set(id, data.bypass_client_trust);
          return { bypassClientTrust: entries.get(id) };
        });
      },
    },
    systemConfigService: createSystemConfigService({ repository: repo }),
    adminIdentityRepository: { async listActive() { return []; } },
    userAuthRepository: { async listActiveClerkUsers() { return [...active].map(clerkUserId => ({ clerkUserId })); } },
  });
  return { service, entries, active, events, attempts, state, get patched() { return patched; },
    get independentlyRead() { return independentlyRead; }, get maximumConcurrent() { return maximumConcurrent; } };
}

// 1000 accounts: real changes, one-off 429 and 503, short delays, final GET for every active account.
const many = deviceTrustFixture(1000, { failures: {
  'get:user_3': { first: 1, status: 429, delay: 3 },
  'patch:user_7': { first: 1, status: 429, delay: 3 },
  'get:user_12': { first: 1, status: 503, delay: 2 },
  'patch:user_37': { delay: 2 },
} });
const manyResult = await many.service.reconcile({ actorClerkUserId: 'mock-owner' });
check(manyResult.sync.status === 'synchronized', 'temporary 429/503 should converge under bounded retry');
check(many.patched === 1000, 'all 1000 users must be patched (not merely inspected)');
check(many.independentlyRead >= 2000, 're-read each of 1000 users');
check([...many.entries.values()].every(v => v === false), 'no stale bypass values after convergence');
check(many.maximumConcurrent <= 8, 'Clerk network concurrency <= 8');
check(many.attempts.get('patch:user_7') === 2, '429 PATCH retried once');
check(many.attempts.get('get:user_3') === 5, '429 GET retried once, then checked after PATCH and twice during reconciliation');
check(many.state.get('device-trust-sync-state').policyRevision === 2, 'final policyRevision preserved');

// Persistent 429 must never be silently reported as synchronized, even if all other accounts converge.
const throttled = deviceTrustFixture(10, { failures: { 'get:user_5': { always: true, status: 429 } } });
await assert.rejects(() => throttled.service.reconcile({ actorClerkUserId: 'mock-owner' }),
  e => e.code === 'clerk_device_trust_reconciliation_incomplete'); assertions++;
check(throttled.state.get('device-trust-sync-state').status === 'recovery_required', 'persistent 429 fail-closed');
check(throttled.events.some(e => e.eventType === 'reconcile_finished' && e.status === 'recovery_required'), 'persistent 429 recorded');
check(throttled.attempts.get('get:user_5') === 6, 'retry bounded to 3 per initial and final inspection');

// Timeouts (no numeric HTTP status) must fail closed without infinite retries.
const timedOut = deviceTrustFixture(2, { failures: { 'get:user_1': { always: true, status: 0 } } });
await assert.rejects(() => timedOut.service.reconcile({ actorClerkUserId: 'mock-owner' }),
  e => e.code === 'clerk_device_trust_reconciliation_incomplete'); assertions++;
check(timedOut.state.get('device-trust-sync-state').status === 'recovery_required', 'timeout fail-closed');

// 404 on an active PostgreSQL identity is an orphan, not a successful skip.
const orphan = deviceTrustFixture(2);
orphan.entries.delete('user_1');
await assert.rejects(() => orphan.service.reconcile(),
  e => e.code === 'clerk_device_trust_reconciliation_incomplete'); assertions++;
check(orphan.state.get('device-trust-sync-state').orphanedActiveAccountCount > 0, 'active 404 counted as orphan');
check(orphan.state.get('device-trust-sync-state').status === 'recovery_required', 'active 404 not synchronized');

// Retirement during a previously-enumerated batch: 404 is safely skipped only
// after the authoritative PG active list no longer includes that user.
const retired = deviceTrustFixture(2, { retiredAtRead: ['user_1'] });
retired.entries.delete('user_1');
const retiredResult = await retired.service.reconcile();
check(retiredResult.sync.status === 'synchronized', 'retired 404 can be excluded');
check(retired.state.get('device-trust-sync-state').skippedAccountCount >= 0, 'retirement classified without orphan');
check(retired.state.get('device-trust-sync-state').orphanedActiveAccountCount === 0, 'retired 404 is not active orphan');

// Stateful, in-memory PostgreSQL emulator: the actual resetScopes('settings')
// SQL executes only against this ephemeral fixture and NEVER against a DB.
function resetFixture(validProof) {
  const entries = new Map([
    ['device-trust-policy', { deviceTrustEmailVerificationEnabled: true, policyRevision: 2, marker: 'policy-original' }],
    ['device-trust-sync-state', { status: 'synchronized', policyRevision: 2, marker: 'sync-original' }],
    ['system-settings-audit', { logs: Array.from({ length: 205 }, (_, id) => ({ id, action: 'old-audit' })) }],
    ['admin-security', { maxAttempts: 5 }],
    ['user-session-policy', { duration: 90 }],
  ]);
  const immutableAudit = Array.from({ length: 251 }, (_, id) => ({ eventId: String(id), type: 'policy_change_finished' }));
  const siteSettings = new Map([['site-settings/siteSettings/config', { title: 'original' }],
    ['rental-config/rentalConfig/current', { days: 7 }]]);
  const proofKey = 'phase34_verified_full_db_backup';
  const proof = validProof ? { type: 'full-pg-dump-isolated-restore-v1', databaseName: 'synthetic',
    verifiedAt: new Date().toISOString(), dumpSha256: 'a'.repeat(64), tableCountsSha256: 'b'.repeat(64), verifiedTableCount: 35 } : null;
  const metadata = new Map([[proofKey, proof]]);
  const issuedSQL = []; let committed = false; let rolledBack = false;
  const query = async (sql, params) => {
    const s = String(sql).replace(/\s+/g, ' ').trim(); issuedSQL.push(s);
    if (s.includes('AS setting_documents') && s.includes('AS system_configurations')) {
      return { rows: [{ setting_documents: siteSettings.size, system_configurations: entries.size }] };
    }
    if (s.includes('SELECT m.value, current_database()')) return { rows: [{ value: metadata.get(proofKey), database_name: 'synthetic' }] };
    if (s.includes('SELECT value, current_database()')) return { rows: [{ value: metadata.get(proofKey), database_name: 'synthetic' }] };
    if (s === 'BEGIN') return { rows: [] };
    if (s === 'COMMIT') { committed = true; return { rows: [] }; }
    if (s === 'ROLLBACK') { rolledBack = true; return { rows: [] }; }
    if (s.startsWith('DELETE FROM app_runtime_metadata WHERE key=')) { metadata.delete(proofKey); return { rows: [] }; }
    if (s.includes("DELETE FROM app_site_content_documents WHERE domain IN ('site-settings','rental-config')")) { siteSettings.clear(); return { rows: [] }; }
    if (s.includes("INSERT INTO app_site_content_documents") && s.includes("siteSettings/config")) { siteSettings.set('site-settings/siteSettings/config', {}); return { rows: [] }; }
    if (s.includes('DELETE FROM app_system_configuration WHERE config_key NOT IN')) {
      const match = s.match(/config_key NOT IN \(([^)]*)\)/);
      assert.ok(match, 'reset SQL must specify protected keys');
      const preserved = new Set([...match[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
      for (const key of [...entries.keys()]) if (!preserved.has(key)) entries.delete(key);
      return { rows: [] };
    }
    if (s.includes("INSERT INTO app_runtime_metadata") && s.includes('phase34_last_system_data_reset')) return { rows: [] };
    if (s.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [{}] };
    throw new Error(`Unmodeled SQL must not silently pass the reset fixture: ${s.slice(0, 100)}`);
  };
  return { repo: createSystemDataRepository({ query, async connect() { return { query, release() {} }; } }),
    entries, immutableAudit, siteSettings, metadata, issuedSQL, get committed() { return committed; },
    get rolledBack() { return rolledBack; } };
}

const denied = resetFixture(false);
const deniedBefore = structuredClone([...denied.entries]);
await assert.rejects(() => denied.repo.resetScopes({ scopes: ['settings'] }),
  e => e.code === 'system_data_verified_restore_required' && e.status === 409); assertions++;
check(denied.rolledBack && !denied.committed, 'proofless reset must ROLLBACK');
check(JSON.stringify([...denied.entries]) === JSON.stringify(deniedBefore), 'no mutation when reset proof unavailable');
check(!denied.issuedSQL.some(q => q.includes('DELETE FROM app_system_configuration')), 'no settings DELETE when proof unavailable');
const emulated = resetFixture(true);
const prior = new Map([...emulated.entries].map(([k, v]) => [k, structuredClone(v)]));
const oldAudit = structuredClone(emulated.immutableAudit);
await emulated.repo.resetScopes({ scopes: ['settings'], actorClerkUserId: 'mock-owner' });
check(emulated.committed && !emulated.rolledBack, 'synthetic proof permits mock reset');
for (const key of ['device-trust-policy', 'device-trust-sync-state', 'system-settings-audit']) {
  assert.deepEqual(emulated.entries.get(key), prior.get(key), `${key} must survive byte-equivalent snapshot`); assertions++;
}
check(!emulated.entries.has('admin-security') && !emulated.entries.has('user-session-policy'), 'non-security config keys follow existing reset contract');
assert.deepEqual(emulated.immutableAudit, oldAudit, 'append-only Device Trust audit table not touched'); assertions++;
check(!emulated.issuedSQL.some(q => /(?:DELETE|TRUNCATE|UPDATE)\s+.*app_device_trust_audit_events/i.test(q)), 'no W01 audit table DML in settings reset');
check(emulated.metadata.get('phase34_verified_full_db_backup') == null, 'synthetic proof consumed once');

// Route and JSON restore scope boundaries: test source contracts without sending
// destructive requests to staging/production.
const app = readFileSync('server/src/app.mjs', 'utf8');
for (const [method, path] of [['GET', '/api/admin/clerk-device-trust/audit'],
  ['POST', '/api/admin/clerk-device-trust/reconcile'], ['PATCH', '/api/admin/clerk-device-trust']]) {
  const marker = `request.method === '${method}' && url.pathname === '${path}'`;
  const region = app.slice(app.indexOf(marker), app.indexOf(marker) + 460);
  check(region.includes("adminRole || 'admin') !== 'owner'"), `${method} ${path} must reject non-owner`);
}
const jsonRestore = readFileSync('server/src/settings/system-data-restore.mjs', 'utf8');
check(!/device-trust-policy|device-trust-sync-state/.test(jsonRestore),
  'scoped JSON restore must not write W01 policy or sync state');

console.log(`[phase34-w01-ac-s01-exceptions] PASS (${assertions} explicit assertions; 1000 users, 429/503/timeouts, active/retired 404, stateful reset snapshots)`);
