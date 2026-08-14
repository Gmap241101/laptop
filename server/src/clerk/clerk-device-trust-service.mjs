const DEFAULT_PLATFORM_API_URL = 'https://api.clerk.com';
const DEFAULT_TIMEOUT_MS = 8000;

const createServiceError = (code, message, status = 503) =>
  Object.assign(new Error(message), { code, status });

const trim = (value) => String(value ?? '').trim();

const readResponsePayload = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const readDeviceTrustEnabled = (payload) => {
  const enabled = payload?.auth_password?.device_trust?.enabled;
  if (typeof enabled !== 'boolean') {
    throw createServiceError(
      'clerk_device_trust_config_missing',
      'Clerk Platform API response did not include auth_password.device_trust.enabled.',
      502,
    );
  }
  return enabled;
};

export const createClerkDeviceTrustService = ({
  platformApiKey = '',
  applicationId = '',
  instanceId = '',
  platformApiUrl = DEFAULT_PLATFORM_API_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) => {
  const normalizedPlatformApiKey = trim(platformApiKey);
  const normalizedApplicationId = trim(applicationId);
  const normalizedInstanceId = trim(instanceId);
  const normalizedPlatformApiUrl = trim(platformApiUrl || DEFAULT_PLATFORM_API_URL).replace(/\/+$/, '');
  const configured = Boolean(
    normalizedPlatformApiKey && normalizedApplicationId && normalizedInstanceId
  );

  const configurationStatus = Object.freeze({
    configured,
    source: 'clerk-platform-api',
    authority: 'clerk-device-trust',
    requiredEnvironment: Object.freeze([
      'CLERK_PLATFORM_API_KEY',
      'CLERK_APPLICATION_ID',
      'CLERK_INSTANCE_ID',
    ]),
  });

  const request = async (method, { body = null, keys = [] } = {}) => {
    if (!configured) {
      throw createServiceError(
        'clerk_platform_config_not_configured',
        'Clerk Platform API configuration is not available.',
        503,
      );
    }

    const url = new URL(
      `/v1/platform/applications/${encodeURIComponent(normalizedApplicationId)}/instances/${encodeURIComponent(normalizedInstanceId)}/config`,
      normalizedPlatformApiUrl,
    );
    for (const key of keys) {
      const normalizedKey = trim(key);
      if (normalizedKey) url.searchParams.append('keys', normalizedKey);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${normalizedPlatformApiKey}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const payload = await readResponsePayload(response);
      if (!response.ok) {
        const clerkError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
        const fallbackCode = response.status === 401 || response.status === 403
          ? 'clerk_platform_api_unauthorized'
          : response.status === 404
            ? 'clerk_platform_target_not_found'
            : response.status === 429
              ? 'clerk_platform_api_rate_limited'
              : `clerk_platform_http_${response.status}`;
        throw createServiceError(
          trim(clerkError?.code || payload?.error || fallbackCode) || fallbackCode,
          trim(clerkError?.long_message || clerkError?.message || payload?.message) ||
            `Clerk Platform API request failed with HTTP ${response.status}.`,
          response.status,
        );
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw createServiceError(
          'clerk_platform_api_timeout',
          'Clerk Platform API request timed out.',
          504,
        );
      }
      if (error?.code) throw error;
      throw createServiceError(
        'clerk_platform_api_request_failed',
        error?.message || 'Clerk Platform API request failed.',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  return Object.freeze({
    getConfigurationStatus() {
      return configurationStatus;
    },
    async get() {
      if (!configured) {
        return Object.freeze({
          ...configurationStatus,
          enabled: null,
        });
      }
      const payload = await request('GET', { keys: ['auth_password'] });
      return Object.freeze({
        ...configurationStatus,
        enabled: readDeviceTrustEnabled(payload),
      });
    },
    async setEnabled(enabledValue) {
      if (typeof enabledValue !== 'boolean') {
        throw createServiceError(
          'clerk_device_trust_enabled_invalid',
          'Device Trust enabled must be a boolean.',
          400,
        );
      }
      const payload = await request('PATCH', {
        body: {
          auth_password: {
            device_trust: {
              enabled: enabledValue,
            },
          },
        },
      });
      const enabled = readDeviceTrustEnabled(payload);
      if (enabled !== enabledValue) {
        throw createServiceError(
          'clerk_device_trust_write_not_confirmed',
          'Clerk Platform API did not confirm the requested Device Trust setting.',
          502,
        );
      }
      return Object.freeze({
        ...configurationStatus,
        enabled,
      });
    },
  });
};
