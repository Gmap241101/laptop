const POLICY_KEY = 'device-trust-policy';
const DEFAULT_ENABLED = true;

const serviceError = (code, message, status = 503) =>
  Object.assign(new Error(message), { code, status });

const trim = (value) => String(value ?? '').trim();

const mapConcurrent = async (items, limit, worker) => {
  const input = Array.isArray(items) ? items : [];
  const results = new Array(input.length);
  let cursor = 0;
  const run = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= input.length) return;
      results[index] = await worker(input[index], index);
    }
  };
  const workerCount = Math.max(1, Math.min(Math.trunc(Number(limit) || 1), input.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => run()));
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
  clerkClient,
  systemConfigService,
  adminIdentityRepository,
  userAuthRepository,
} = {}) => {
  const configured = Boolean(
    clerkClient &&
    typeof clerkClient.getUser === 'function' &&
    typeof clerkClient.updateUser === 'function' &&
    systemConfigService &&
    typeof systemConfigService.get === 'function' &&
    typeof systemConfigService.put === 'function' &&
    adminIdentityRepository &&
    typeof adminIdentityRepository.listActive === 'function' &&
    userAuthRepository &&
    typeof userAuthRepository.listActiveClerkUsers === 'function'
  );

  const configurationStatus = Object.freeze({
    configured,
    source: 'postgresql-clerk-backend-api',
    authority: 'clerk-user-device-trust-policy',
    requiredEnvironment: Object.freeze(['CLERK_SECRET_KEY']),
  });

  const ensureConfigured = () => {
    if (!configured) {
      throw serviceError(
        'clerk_backend_device_trust_not_configured',
        'Clerk Backend API device-trust policy integration is not available.',
        503,
      );
    }
  };

  const collectTargets = async () => {
    const [admins, users] = await Promise.all([
      adminIdentityRepository.listActive(),
      userAuthRepository.listActiveClerkUsers(),
    ]);
    const ids = new Set();
    for (const admin of admins || []) {
      const id = trim(admin?.clerkUserId);
      if (id) ids.add(id);
    }
    for (const user of users || []) {
      const id = trim(user?.clerkUserId);
      if (id) ids.add(id);
    }
    return [...ids];
  };

  const setUserBypass = async (clerkUserId, bypassClientTrust) => {
    const updated = await clerkClient.updateUser(clerkUserId, {
      bypass_client_trust: Boolean(bypassClientTrust),
    });
    if (Boolean(updated?.bypassClientTrust) !== Boolean(bypassClientTrust)) {
      throw serviceError(
        'clerk_device_trust_user_sync_not_confirmed',
        'Clerk did not confirm the requested user device-trust bypass state.',
        502,
      );
    }
    return updated;
  };

  return Object.freeze({
    getConfigurationStatus() {
      return configurationStatus;
    },

    async get() {
      ensureConfigured();
      const policy = await readDeviceTrustPolicy(systemConfigService);
      return Object.freeze({
        ...configurationStatus,
        enabled: policy.enabled,
        bypassClientTrust: !policy.enabled,
        policySource: policy.source,
      });
    },

    async setEnabled(enabledValue, { actorClerkUserId = '' } = {}) {
      ensureConfigured();
      if (typeof enabledValue !== 'boolean') {
        throw serviceError(
          'clerk_device_trust_enabled_invalid',
          'Device Trust enabled must be a boolean.',
          400,
        );
      }

      const targetIds = await collectTargets();
      const desiredBypass = !enabledValue;
      const snapshots = [];
      const updatedIds = [];
      const skippedIds = [];

      const inspected = await mapConcurrent(targetIds, 8, async (clerkUserId) => {
        try {
          const user = await clerkClient.getUser(clerkUserId);
          return { clerkUserId, bypassClientTrust: Boolean(user?.bypassClientTrust), missing: false };
        } catch (error) {
          if (Number(error?.status || 0) === 404 || error?.code === 'clerk_user_not_found') {
            return { clerkUserId, missing: true };
          }
          throw error;
        }
      });
      for (const item of inspected) {
        if (item?.missing) skippedIds.push(item.clerkUserId);
        else if (item?.clerkUserId) snapshots.push(item);
      }

      try {
        await mapConcurrent(snapshots, 8, async (snapshot) => {
          if (snapshot.bypassClientTrust === desiredBypass) return;
          await setUserBypass(snapshot.clerkUserId, desiredBypass);
          updatedIds.push(snapshot.clerkUserId);
        });

        await systemConfigService.put({
          key: POLICY_KEY,
          actorClerkUserId: trim(actorClerkUserId),
          payload: {
            deviceTrustEmailVerificationEnabled: enabledValue,
            clerkBypassClientTrust: desiredBypass,
            syncedAt: new Date().toISOString(),
            syncedAccountCount: snapshots.length,
            skippedAccountCount: skippedIds.length,
          },
        });
      } catch (error) {
        await mapConcurrent([...updatedIds].reverse(), 8, async (clerkUserId) => {
          const snapshot = snapshots.find((item) => item.clerkUserId === clerkUserId);
          if (!snapshot) return;
          await setUserBypass(clerkUserId, snapshot.bypassClientTrust).catch(() => {});
        });
        throw error;
      }

      return Object.freeze({
        ...configurationStatus,
        enabled: enabledValue,
        bypassClientTrust: desiredBypass,
        policySource: 'postgresql',
        syncedAccountCount: snapshots.length,
        skippedAccountCount: skippedIds.length,
      });
    },
  });
};
