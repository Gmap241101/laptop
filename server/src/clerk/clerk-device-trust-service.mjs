import { randomUUID } from 'node:crypto';

const POLICY_KEY = 'device-trust-policy';
const DEFAULT_ENABLED = true;
const MAX_PARALLEL = 8;

const serviceError = (code, message, status = 503) =>
  Object.assign(new Error(message), { code, status });
const trim = (value) => String(value ?? '').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isMissing = (error) => Number(error?.status || 0) === 404 || error?.code === 'clerk_user_not_found';
const transient = (error) => [429, 500, 502, 503, 504].includes(Number(error?.status || 0));
const withRetry = async (work) => {
  for (let attempt = 0; ; attempt += 1) {
    try { return await work(); }
    catch (error) {
      if (attempt >= 2 || !transient(error)) throw error;
      await sleep((attempt + 1) * 200);
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
    return Object.freeze({ enabled: DEFAULT_ENABLED, source: 'secure-default' });
  }
  try {
    const result = await systemConfigService.get(POLICY_KEY);
    const value = result?.payload?.deviceTrustEmailVerificationEnabled;
    return Object.freeze({
      enabled: typeof value === 'boolean' ? value : DEFAULT_ENABLED,
      source: typeof value === 'boolean' ? 'postgresql' : 'secure-default',
    });
  } catch {
    return Object.freeze({ enabled: DEFAULT_ENABLED, source: 'secure-default' });
  }
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
    catch (error) { if (isMissing(error)) return { id, missing: true }; throw error; }
  };
  const updateUser = async (id, bypass) => {
    const updated = await withRetry(() => clerkClient.updateUser(id, { bypass_client_trust: bypass }));
    if (Boolean(updated?.bypassClientTrust) !== bypass) {
      throw serviceError('clerk_device_trust_user_sync_not_confirmed', 'Clerk did not confirm the requested Device Trust state.', 502);
    }
    return updated;
  };
  const applyAndVerify = async (ids, bypass) => {
    const first = await settleConcurrent(ids, async (id) => {
      const inspected = await readUser(id);
      if (inspected.missing) return 'missing';
      if (Boolean(inspected.user?.bypassClientTrust) !== bypass) await updateUser(id, bypass);
      return 'updated';
    });
    // Re-read the authoritative account list: an account could have been created
    // during a long-running bulk update. Never claim success until verified.
    const latestIds = await collectTargets();
    const checked = await settleConcurrent(latestIds, async (id) => {
      const inspected = await readUser(id);
      if (inspected.missing) return 'missing';
      if (Boolean(inspected.user?.bypassClientTrust) !== bypass) {
        // Newly created accounts also inherit the canonical policy.
        await updateUser(id, bypass);
        const confirmed = await readUser(id);
        if (!confirmed.missing && Boolean(confirmed.user?.bypassClientTrust) !== bypass) {
          throw serviceError('clerk_device_trust_verify_mismatch', 'Clerk Device Trust account state differs from policy.', 503);
        }
      }
      return 'verified';
    });
    const failed = [...first.map((result, i) => result.ok ? null : ids[i]),
      ...checked.map((result, i) => result.ok ? null : latestIds[i])].filter(Boolean);
    return {
      failedIds: [...new Set(failed)],
      accountCount: latestIds.length,
      skippedAccountCount: checked.filter((result) => result.ok && result.value === 'missing').length,
    };
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
    recoveryRequired: ['recovery_required', 'applying'].includes(state?.status),
  });

  const reconcileUnderLock = async (enabled, actorClerkUserId, operationId) => {
    const desired = !enabled;
    const ids = await collectTargets();
    const outcome = await applyAndVerify(ids, desired);
    const status = outcome.failedIds.length ? 'recovery_required' : 'synchronized';
    await saveState({
      status, operationId, policyEnabled: enabled, accountCount: outcome.accountCount,
      skippedAccountCount: outcome.skippedAccountCount,
      failedAccountCount: outcome.failedIds.length, failedClerkUserIds: outcome.failedIds,
    }, actorClerkUserId);
    return { ...outcome, status };
  };

  return Object.freeze({
    getConfigurationStatus() { return configurationStatus; },
    async get() {
      ensureConfigured();
      const [policy, syncState] = await Promise.all([
        readDeviceTrustPolicy(systemConfigService), systemConfigService.getDeviceTrustSyncState(),
      ]);
      return Object.freeze({ ...configurationStatus, enabled: policy.enabled,
        bypassClientTrust: !policy.enabled, policySource: policy.source,
        sync: redactedState(syncState) });
    },
    async reconcile({ actorClerkUserId = '' } = {}) {
      ensureConfigured();
      return systemConfigService.withDeviceTrustLock(async () => {
        // Fail rather than interpreting a PostgreSQL outage as the default policy.
        const config = await systemConfigService.get(POLICY_KEY);
        const enabled = typeof config?.payload?.deviceTrustEmailVerificationEnabled === 'boolean'
          ? config.payload.deviceTrustEmailVerificationEnabled : DEFAULT_ENABLED;
        const operationId = randomUUID();
        let result;
        try {
          result = await reconcileUnderLock(enabled, actorClerkUserId, operationId);
        } catch (error) {
          await saveState({ status: 'recovery_required', operationId, policyEnabled: enabled,
            failedAccountCount: 0, recoveryErrorCode: trim(error?.code || 'reconciliation_failed') }, actorClerkUserId);
          throw error;
        }
        if (result.status !== 'synchronized') {
          throw serviceError('clerk_device_trust_reconciliation_incomplete', 'Some Clerk accounts still need synchronization.', 503);
        }
        return Object.freeze({ ...configurationStatus, enabled, bypassClientTrust: !enabled,
          sync: { ...redactedState({ ...result, operationId, status: result.status }), updatedAt: new Date().toISOString() } });
      });
    },
    async setEnabled(enabledValue, { actorClerkUserId = '' } = {}) {
      ensureConfigured();
      if (typeof enabledValue !== 'boolean') {
        throw serviceError('clerk_device_trust_enabled_invalid', 'Device Trust enabled must be a boolean.', 400);
      }
      return systemConfigService.withDeviceTrustLock(async () => {
        const existing = await systemConfigService.get(POLICY_KEY);
        const previousEnabled = typeof existing?.payload?.deviceTrustEmailVerificationEnabled === 'boolean'
          ? existing.payload.deviceTrustEmailVerificationEnabled : DEFAULT_ENABLED;
        const operationId = randomUUID();
        const targets = await collectTargets();
        await saveState({ status: 'applying', operationId, policyEnabled: previousEnabled,
          requestedEnabled: enabledValue, accountCount: targets.length, failedAccountCount: 0 }, actorClerkUserId);
        try {
          const result = await applyAndVerify(targets, !enabledValue);
          if (result.failedIds.length) {
            throw serviceError('clerk_device_trust_user_sync_partial_failure', 'Some Clerk account updates failed.', 503);
          }
          await systemConfigService.put({ key: POLICY_KEY, actorClerkUserId: trim(actorClerkUserId),
            payload: { deviceTrustEmailVerificationEnabled: enabledValue,
              clerkBypassClientTrust: !enabledValue, syncedAt: new Date().toISOString(),
              syncedAccountCount: result.accountCount, skippedAccountCount: result.skippedAccountCount },
          });
          // Persist verified state before returning success to the administrator.
          await saveState({ status: 'synchronized', operationId, policyEnabled: enabledValue,
            accountCount: result.accountCount, failedAccountCount: 0,
            skippedAccountCount: result.skippedAccountCount }, actorClerkUserId);
          return Object.freeze({ ...configurationStatus, enabled: enabledValue,
            bypassClientTrust: !enabledValue, policySource: 'postgresql',
            syncedAccountCount: result.accountCount, skippedAccountCount: result.skippedAccountCount,
            sync: redactedState({ status: 'synchronized', operationId, accountCount: result.accountCount }) });
        } catch (error) {
          // Roll back *all* candidates, not only the operations that returned a
          // success response. Clerk may apply a change and then time out.
          let recovery = { status: 'recovery_required', failedIds: targets, accountCount: targets.length };
          try {
            await systemConfigService.put({ key: POLICY_KEY,
              actorClerkUserId: trim(actorClerkUserId), payload: existing?.payload || {} });
            recovery = await reconcileUnderLock(previousEnabled, actorClerkUserId, operationId);
          } catch { /* an error never means compensation succeeded */ }
          try {
            await saveState({ status: recovery.failedIds?.length ? 'recovery_required' : 'failed_recovered',
              operationId, policyEnabled: previousEnabled, accountCount: recovery.accountCount,
              failedAccountCount: recovery.failedIds?.length || 0,
              failedClerkUserIds: recovery.failedIds || [] }, actorClerkUserId);
          } catch {
            throw serviceError('clerk_device_trust_recovery_record_failed', 'Device Trust recovery and audit status could not be saved.', 503);
          }
          if (recovery.failedIds?.length) {
            throw serviceError('clerk_device_trust_recovery_required', 'Device Trust synchronization failed; reconciliation is required.', 503);
          }
          throw serviceError(error?.code || 'clerk_device_trust_write_failed', 'Device Trust update failed; the previous policy has been restored.', error?.status || 503);
        }
      });
    },
  });
};
