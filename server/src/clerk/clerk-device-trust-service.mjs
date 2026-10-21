import { randomUUID } from 'node:crypto';

const POLICY_KEY = 'device-trust-policy';
const DEFAULT_ENABLED = true;
const MAX_PARALLEL = 8;

const serviceError = (code, message, status = 503) =>
  Object.assign(new Error(message), { code, status });
const trim = (value) => String(value ?? '').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isMissing = (error) => Number(error?.status || 0) === 404 || error?.code === 'clerk_user_not_found';
const transient = (error) => [408, 429, 500, 502, 503, 504].includes(Number(error?.status || 0)) ||
  ['ETIMEDOUT', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT', 'AbortError', 'clerk_api_timeout', 'clerk_api_unavailable'].includes(String(error?.code || error?.name || ''));
const retryAfterMs = (error) => {
  const value = error?.retryAfter ?? error?.headers?.['retry-after'] ?? error?.headers?.get?.('retry-after');
  if (value == null) return 0;
  const seconds = Number(value);
  const millis = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(millis) ? Math.max(0, millis) : 0;
};
const withRetry = async (work) => {
  for (let attempt = 0; ; attempt += 1) {
    try { return await work(); }
    catch (error) {
      if (attempt >= 2 || !transient(error)) throw error;
      const exponential = Math.min(1500, 200 * 2 ** attempt);
      const delay = Math.max(retryAfterMs(error), exponential + Math.floor(Math.random() * 75));
      // A long Retry-After must not be violated or hold the Heroku request indefinitely.
      if (delay > 5000) throw error;
      await sleep(delay);
    }
  }
};

// Wait for every in-flight Clerk operation before rollback. Promise.all() would
// reject early and let other updates continue *after* compensation had started.
const settleConcurrent = async (items, work) => {
  const input = Array.isArray(items) ? items : [];
  const results = new Array(input.length);
  let cursor = 0;
  const runner = async () => {
    while (true) {
      const index = cursor++;
      if (index >= input.length) return;
      try { results[index] = { ok: true, value: await work(input[index], index) }; }
      catch (error) { results[index] = { ok: false, error }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, input.length) }, runner));
  return results;
};

export const readDeviceTrustPolicy = async (systemConfigService) => {
  if (!systemConfigService || typeof systemConfigService.get !== 'function') {
    throw serviceError('device_trust_policy_unavailable', 'Account security configuration is unavailable.', 503);
  }
  // The configuration service distinguishes a genuinely absent row from an
  // unreadable or malformed PostgreSQL policy. A database failure is never an
  // implicit instruction to overwrite a user's existing security policy.
  let result;
  try { result = await systemConfigService.get(POLICY_KEY); }
  catch (error) {
    throw serviceError('device_trust_policy_read_failed', 'Account security configuration could not be read.', 503);
  }
  if (!result || result.present === false || (result.present == null &&
      result?.payload && Object.keys(result.payload).length === 0)) {
    return Object.freeze({ enabled: DEFAULT_ENABLED, revision: 0, source: 'secure-default' });
  }
  const value = result?.payload?.deviceTrustEmailVerificationEnabled;
  const revision = result?.payload?.policyRevision ?? 0;
  if (typeof value !== 'boolean' || !Number.isSafeInteger(revision) || revision < 0) {
    throw serviceError('device_trust_policy_invalid', 'Account security configuration is invalid.', 503);
  }
  return Object.freeze({ enabled: value, revision, source: 'postgresql' });
};

export const readDeviceTrustBypass = async (systemConfigService) =>
  !(await readDeviceTrustPolicy(systemConfigService)).enabled;

export const createClerkDeviceTrustService = ({
  clerkClient, systemConfigService, adminIdentityRepository, userAuthRepository,
} = {}) => {
  const configured = Boolean(
    clerkClient && typeof clerkClient.getUser === 'function' && typeof clerkClient.updateUser === 'function' &&
    systemConfigService && typeof systemConfigService.get === 'function' &&
    typeof systemConfigService.put === 'function' &&
    typeof systemConfigService.withDeviceTrustLock === 'function' &&
    typeof systemConfigService.getDeviceTrustSyncState === 'function' &&
    typeof systemConfigService.putDeviceTrustSyncState === 'function' &&
    typeof systemConfigService.appendDeviceTrustAudit === 'function' &&
    typeof systemConfigService.listDeviceTrustAudit === 'function' &&
    adminIdentityRepository && typeof adminIdentityRepository.listActive === 'function' &&
    userAuthRepository && typeof userAuthRepository.listActiveClerkUsers === 'function'
  );
  const configurationStatus = Object.freeze({
    configured, source: 'postgresql-clerk-backend-api',
    authority: 'clerk-user-device-trust-policy', requiredEnvironment: Object.freeze(['CLERK_SECRET_KEY']),
  });
  const ensureConfigured = () => {
    if (!configured) throw serviceError('clerk_backend_device_trust_not_configured', 'Clerk Device Trust is not configured.', 503);
  };
  const collectTargets = async () => {
    const [admins, users] = await Promise.all([
      adminIdentityRepository.listActive(), userAuthRepository.listActiveClerkUsers(),
    ]);
    return [...new Set([...(admins || []), ...(users || [])]
      .map((item) => trim(item?.clerkUserId)).filter(Boolean))];
  };
  const readUser = async (id) => {
    try { return { id, user: await withRetry(() => clerkClient.getUser(id)) }; }
    catch (error) {
      if (!isMissing(error)) throw error;
      // A 404 for a still-active PostgreSQL identity is not a successful skip.
      const active = await collectTargets();
      if (active.includes(id)) throw serviceError('clerk_device_trust_orphaned_active', 'An active account is missing in Clerk.', 503);
      return { id, missing: true };
    }
  };
  const updateUser = async (id, bypass) => {
    await withRetry(() => clerkClient.updateUser(id, { bypass_client_trust: bypass }));
    // A PATCH response may omit the field; only a separate Clerk GET proves
    // the authoritative value. Neither missing nor null is equivalent to false.
    const confirmed = await readUser(id);
    if (confirmed.missing || confirmed.user?.bypassClientTrust !== bypass) {
      throw serviceError('clerk_device_trust_user_sync_not_confirmed', 'Clerk did not confirm the requested Device Trust state.', 502);
    }
    return confirmed.user;
  };
  const applyAndVerify = async (ids, bypass, onFirstPass = null) => {
    const first = await settleConcurrent(ids, async (id) => {
      const inspected = await readUser(id);
      if (inspected.missing) return 'missing';
      if (inspected.user?.bypassClientTrust !== bypass) await updateUser(id, bypass);
      return 'updated';
    });
    if (onFirstPass) await onFirstPass({ failedIds: first.flatMap((r,i) => r.ok ? [] : [ids[i]]),
      accountResults: first.map((r,i) => ({ id: ids[i], status: r.ok ? 'applied' : 'uncertain',
        errorCode: r.ok ? '' : trim(r.error?.code || r.error?.status || 'clerk_failed') })) });
    // Re-read the authoritative account list: an account could have been created
    // during a long-running bulk update. Never claim success until verified.
    const latestIds = await collectTargets();
    const checked = await settleConcurrent(latestIds, async (id) => {
      const inspected = await readUser(id);
      if (inspected.missing) return 'missing';
      if (inspected.user?.bypassClientTrust !== bypass) {
        // Missing/null fields and mismatching values are never treated as false.
        await updateUser(id, bypass);
      }
      const confirmed = await readUser(id);
      if (confirmed.missing || confirmed.user?.bypassClientTrust !== bypass) {
        throw serviceError('clerk_device_trust_verify_mismatch', 'Clerk Device Trust account state differs from policy.', 503);
      }
      return 'verified';
    });
    const failed = [...first.map((result, i) => result.ok ? null : ids[i]),
      ...checked.map((result, i) => result.ok ? null : latestIds[i])].filter(Boolean);
    return {
      failedIds: [...new Set(failed)],
      accountCount: latestIds.length,
      accountResults: checked.map((r,i) => ({ id: latestIds[i], status: r.ok ? 'verified' : 'uncertain',
        errorCode: r.ok ? '' : trim(r.error?.code || r.error?.status || 'clerk_failed') })),
      orphanedActiveAccountCount: [...first, ...checked].filter(
        (result) => !result.ok && result.error?.code === 'clerk_device_trust_orphaned_active').length,
      skippedAccountCount: checked.filter((result) => result.ok && result.value === 'missing').length,
    };
  };
  const audit = async (eventType, { operationId = '', actorClerkUserId = '', policyRevision = 0,
    previousEnabled = null, requestedEnabled = null, finalEnabled = null,
    status = 'pending', accountCount = 0, failedAccountCount = 0,
    skippedAccountCount = 0, errorCode = '' } = {}) => {
    return systemConfigService.appendDeviceTrustAudit({ eventType, operationId, actorClerkUserId,
      policyRevision, previousEnabled, requestedEnabled, finalEnabled, status,
      accountCount, failedAccountCount, skippedAccountCount, errorCode });
  };
  const saveState = async (state, actorClerkUserId) => systemConfigService.putDeviceTrustSyncState({
    ...state, updatedAt: new Date().toISOString(), actorClerkUserId: trim(actorClerkUserId),
  });
  const redactedState = (state) => ({
    status: state?.status || 'not_checked',
    operationId: state?.operationId || null,
    failedAccountCount: Number(state?.failedAccountCount || 0),
    accountCount: Number(state?.accountCount || 0),
    updatedAt: state?.updatedAt || null,
    verifiedAt: state?.verifiedAt || null,
    policyRevision: Number(state?.policyRevision || 0),
    orphanedActiveAccountCount: Number(state?.orphanedActiveAccountCount || 0),
    recoveryRequired: ['recovery_required', 'applying'].includes(state?.status),
    recoveryErrorCode: trim(state?.recoveryErrorCode || ''),
  });

  // W02 durable checkpoints. Legacy in-memory smoke fixtures omit these hooks,
  // while the production system-config repository implements all of them.
  const journal = async (method, payload) => {
    if (typeof systemConfigService[method] === 'function') return systemConfigService[method](payload);
  };
  const checkpoint = async (operationId, status, checkpointName, outcome = {}, errorCode = '') => {
    await journal('updateDeviceTrustOperation', { operationId, status, checkpoint: checkpointName,
      errorCode, failedIds: outcome.failedIds || [], accountResults: outcome.accountResults || [] });
  };
  const pendingOperations = async () =>
    typeof systemConfigService.listPendingDeviceTrustOperations === 'function'
      ? systemConfigService.listPendingDeviceTrustOperations() : [];
  const beginOperation = async ({ operationId, kind, revision, previousPolicyPresent,
    previousPolicy, requestedEnabled, targetIds }) =>
    journal('startDeviceTrustOperation', { operationId, kind, policyRevision: revision,
      previousPolicyPresent, previousPolicy, requestedEnabled, targetIds });
  const reconcileUnderLock = async (enabled, actorClerkUserId, operationId, revision = 0) => {
    const desired = !enabled;
    const ids = await collectTargets();
    const outcome = await applyAndVerify(ids, desired);
    const status = outcome.failedIds.length ? 'recovery_required' : 'synchronized';
    await saveState({
      status, operationId, policyEnabled: enabled, policyRevision: revision,
      verifiedAt: status === 'synchronized' ? new Date().toISOString() : null,
      accountCount: outcome.accountCount,
      skippedAccountCount: outcome.skippedAccountCount,
      orphanedActiveAccountCount: outcome.orphanedActiveAccountCount,
      failedAccountCount: outcome.failedIds.length, failedClerkUserIds: outcome.failedIds,
    }, actorClerkUserId);
    return { ...outcome, status };
  };

  return Object.freeze({
    async listAudit({ limit = 50 } = {}) {
      ensureConfigured();
      return systemConfigService.listDeviceTrustAudit({ limit });
    },
    getConfigurationStatus() { return configurationStatus; },
    async get() {
      ensureConfigured();
      const [policy, syncState] = await Promise.all([
        readDeviceTrustPolicy(systemConfigService), systemConfigService.getDeviceTrustSyncState(),
      ]);
      const pending = await pendingOperations();
      const sync = redactedState(syncState);
      const stale = pending.some(op => op.status === 'recovery_required' ||
        !Number.isFinite(Date.parse(op.updatedAt)) || Date.now() - Date.parse(op.updatedAt) >= 90000);
      return Object.freeze({ ...configurationStatus, enabled: policy.enabled,
        bypassClientTrust: !policy.enabled, policySource: policy.source,
        sync: pending.length ? { ...sync, status: stale ? 'recovery_required' : 'applying',
          recoveryRequired: stale, pendingOperationCount: pending.length,
          recoveryErrorCode: pending[0]?.errorCode || sync.recoveryErrorCode } : sync });
    },
    async reconcile({ actorClerkUserId = '' } = {}) {
      ensureConfigured();
      return systemConfigService.withDeviceTrustLock(async () => {
        // Fail rather than interpreting a PostgreSQL outage as the default policy.
        const policy = await readDeviceTrustPolicy(systemConfigService);
        const { enabled, revision } = policy;
        const operationId = randomUUID();
        const targetIds = await collectTargets();
        await beginOperation({ operationId, kind: 'reconcile', revision,
          previousPolicyPresent: policy.source === 'postgresql', previousPolicy: null,
          requestedEnabled: enabled, targetIds });
        await audit('reconcile_started', { operationId, actorClerkUserId, policyRevision: revision,
          requestedEnabled: enabled, status: 'applying' });
        let result;
        try {
          result = await reconcileUnderLock(enabled, actorClerkUserId, operationId, revision);
          await checkpoint(operationId, result.status, 'verified', result);
          if (result.status === 'synchronized') {
            await journal('markRecoveredDeviceTrustOperations', operationId);
          }
          await audit('reconcile_finished', { operationId, actorClerkUserId, policyRevision: revision,
            finalEnabled: enabled, status: result.status, accountCount: result.accountCount,
            failedAccountCount: result.failedIds.length, skippedAccountCount: result.skippedAccountCount,
            errorCode: result.orphanedActiveAccountCount ? 'clerk_device_trust_orphaned_active' : '' });
        } catch (error) {
          const failure = result || {};
          await checkpoint(operationId, 'recovery_required', 'reconcile_failed', failure,
            trim(error?.code || 'reconciliation_failed'));
          await saveState({ status: 'recovery_required', operationId, policyEnabled: enabled,
            policyRevision: revision, accountCount: failure.accountCount || 0,
            failedAccountCount: failure.failedIds?.length || 0,
            failedClerkUserIds: failure.failedIds || [],
            recoveryErrorCode: trim(error?.code || 'reconciliation_failed') }, actorClerkUserId);
          await audit('reconcile_failed', { operationId, actorClerkUserId, policyRevision: revision,
            finalEnabled: enabled, status: 'recovery_required', accountCount: failure.accountCount || 0,
            failedAccountCount: failure.failedIds?.length || 0,
            errorCode: trim(error?.code || 'reconciliation_failed') });
          throw error;
        }
        if (result.status !== 'synchronized') {
          throw serviceError('clerk_device_trust_reconciliation_incomplete', 'Some Clerk accounts still need synchronization.', 503);
        }
        return Object.freeze({ ...configurationStatus, enabled, bypassClientTrust: !enabled,
          sync: { ...redactedState({ ...result, operationId, status: result.status }), updatedAt: new Date().toISOString() } });
      }).catch(async (error) => {
        if (error?.code === 'clerk_device_trust_change_in_progress') {
          await audit('reconcile_conflict', { actorClerkUserId, status: 'conflict', errorCode: error.code });
        }
        throw error;
      });
    },
    async setEnabled(enabledValue, { actorClerkUserId = '' } = {}) {
      ensureConfigured();
      if (typeof enabledValue !== 'boolean') {
        throw serviceError('clerk_device_trust_enabled_invalid', 'Device Trust enabled must be a boolean.', 400);
      }
      return systemConfigService.withDeviceTrustLock(async () => {
        const pending = await pendingOperations();
        if (pending.length) throw serviceError('clerk_device_trust_recovery_required',
          'Finish the pending Device Trust recovery before changing policy.', 409);
        const policy = await readDeviceTrustPolicy(systemConfigService);
        const previousEnabled = policy.enabled;
        const revision = policy.revision + 1;
        const existing = await systemConfigService.get(POLICY_KEY);
        const operationId = randomUUID();
        const targets = await collectTargets();
        const previousPolicyPresent = policy.source === 'postgresql';
        await beginOperation({ operationId, kind: 'policy_change', revision,
          previousPolicyPresent, previousPolicy: previousPolicyPresent ? existing.payload : null,
          requestedEnabled: enabledValue, targetIds: targets });
        await audit('policy_change_started', { operationId, actorClerkUserId, policyRevision: revision,
          previousEnabled, requestedEnabled: enabledValue, status: 'applying', accountCount: targets.length });
        await saveState({ status: 'applying', operationId, policyEnabled: previousEnabled,
          policyRevision: policy.revision, requestedEnabled: enabledValue,
          accountCount: targets.length, failedAccountCount: 0 }, actorClerkUserId);
        try {
          const result = await applyAndVerify(targets, !enabledValue, (first) =>
            checkpoint(operationId, 'applying', 'initial_clerk_pass', first));
          await checkpoint(operationId, result.failedIds.length ? 'recovery_required' : 'applying',
            'verified_clerk_accounts', result);
          if (result.failedIds.length) {
            throw serviceError('clerk_device_trust_user_sync_partial_failure', 'Some Clerk account updates failed.', 503);
          }
          await systemConfigService.put({ key: POLICY_KEY, actorClerkUserId: trim(actorClerkUserId),
            payload: { deviceTrustEmailVerificationEnabled: enabledValue,
              clerkBypassClientTrust: !enabledValue, policyRevision: revision, syncedAt: new Date().toISOString(),
              syncedAccountCount: result.accountCount, skippedAccountCount: result.skippedAccountCount },
          });
          // Persist verified state before returning success to the administrator.
          await saveState({ status: 'synchronized', operationId, policyEnabled: enabledValue,
            policyRevision: revision, verifiedAt: new Date().toISOString(),
            accountCount: result.accountCount, failedAccountCount: 0,
            skippedAccountCount: result.skippedAccountCount,
            orphanedActiveAccountCount: result.orphanedActiveAccountCount }, actorClerkUserId);
          await checkpoint(operationId, 'synchronized', 'committed', result);
          await audit('policy_change_finished', { operationId, actorClerkUserId, policyRevision: revision,
            previousEnabled, requestedEnabled: enabledValue, finalEnabled: enabledValue,
            status: 'synchronized', accountCount: result.accountCount,
            skippedAccountCount: result.skippedAccountCount,
            errorCode: result.orphanedActiveAccountCount ? 'clerk_device_trust_orphaned_active' : '' });
          return Object.freeze({ ...configurationStatus, enabled: enabledValue,
            bypassClientTrust: !enabledValue, policySource: 'postgresql',
            syncedAccountCount: result.accountCount, skippedAccountCount: result.skippedAccountCount,
            sync: redactedState({ status: 'synchronized', operationId,
              policyRevision: revision, verifiedAt: new Date().toISOString(),
              accountCount: result.accountCount }) });
        } catch (error) {
          // Roll back *all* candidates, not only the operations that returned a
          // success response. Clerk may apply a change and then time out.
          let recovery = { status: 'recovery_required', failedIds: targets, accountCount: targets.length };
          let compensationError = null;
          try {
            // If the previous policy was the secure default, restore ABSENCE,
            // never create an invalid empty JSON object as a bogus policy.
            if (previousPolicyPresent) {
              await systemConfigService.put({ key: POLICY_KEY,
                actorClerkUserId: trim(actorClerkUserId), payload: existing.payload });
            } else {
              if (typeof systemConfigService.deleteDeviceTrustPolicy !== 'function') {
                throw serviceError('device_trust_policy_delete_unavailable', 'Cannot restore default policy.', 503);
              }
              await systemConfigService.deleteDeviceTrustPolicy();
            }
            recovery = await reconcileUnderLock(previousEnabled, actorClerkUserId, operationId, policy.revision);
          } catch (rollbackError) {
            compensationError = rollbackError;
          }
          const recoverNeeded = Boolean(compensationError || recovery.failedIds?.length);
          const recoveryStatus = recoverNeeded ? 'recovery_required' : 'failed_recovered';
          const recoveryCode = trim(compensationError?.code || error?.code || 'policy_change_failed');
          // A durable operation checkpoint is recorded even when the normal
          // sync-state record fails; it can be inspected after a dyno restart.
          await checkpoint(operationId, recoveryStatus, compensationError ? 'compensation_failed' : recovery.failedIds?.length ? 'compensation_partial' : 'compensation_verified',
            recovery, recoveryCode);
          try {
            await saveState({ status: recoveryStatus, operationId,
              policyEnabled: previousEnabled, policyRevision: policy.revision,
              accountCount: recovery.accountCount,
              failedAccountCount: recoverNeeded ? Math.max(1, recovery.failedIds?.length || 0) : 0,
              failedClerkUserIds: recovery.failedIds || [], recoveryErrorCode: recoveryCode }, actorClerkUserId);
          } catch {
            throw serviceError('clerk_device_trust_recovery_record_failed', 'Device Trust recovery and audit status could not be saved.', 503);
          }
          await audit('policy_change_failed', { operationId, actorClerkUserId,
            policyRevision: revision, previousEnabled, requestedEnabled: enabledValue,
            finalEnabled: previousEnabled, status: recoveryStatus,
            accountCount: recovery.accountCount, failedAccountCount: recoverNeeded ? Math.max(1, recovery.failedIds?.length || 0) : 0,
            errorCode: recoveryCode });
          if (recoverNeeded) {
            throw serviceError('clerk_device_trust_recovery_required', 'Device Trust synchronization failed; reconciliation is required.', 503);
          }
          throw serviceError(error?.code || 'clerk_device_trust_write_failed', 'Device Trust update failed; the previous policy has been restored.', error?.status || 503);
        }
      }).catch(async (error) => {
        if (error?.code === 'clerk_device_trust_change_in_progress') {
          await audit('policy_change_conflict', { actorClerkUserId, requestedEnabled: enabledValue,
            status: 'conflict', errorCode: error.code });
        }
        throw error;
      });
    },
  });
};
