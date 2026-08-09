const DEFAULT_CLERK_API_URL = 'https://api.clerk.com/v1';
const DEFAULT_TIMEOUT_MS = 8000;

const createClerkApiError = (code, message, status = null) => {
  const error = new Error(message);
  error.code = code;
  if (status !== null) error.status = status;
  return error;
};

const readTimestamp = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const readPrimaryEmail = (user) => {
  const emailAddresses = Array.isArray(user?.email_addresses)
    ? user.email_addresses
    : Array.isArray(user?.emailAddresses)
      ? user.emailAddresses
      : [];
  const primaryId = user?.primary_email_address_id || user?.primaryEmailAddressId || null;
  const primary = emailAddresses.find((email) => email?.id === primaryId) || emailAddresses[0] || null;
  const emailAddress = primary?.email_address || primary?.emailAddress || null;
  const verificationStatus = primary?.verification?.status || null;

  return {
    email: typeof emailAddress === 'string' && emailAddress.trim() ? emailAddress.trim() : null,
    verified: verificationStatus === 'verified',
  };
};

export const normalizeClerkBackendUser = (user) => {
  const id = user?.id;
  if (typeof id !== 'string' || !id.trim()) {
    throw createClerkApiError('invalid_clerk_user', 'Clerk Backend API returned a user without an ID.');
  }

  const firstName = user?.first_name ?? user?.firstName ?? null;
  const lastName = user?.last_name ?? user?.lastName ?? null;
  const fullName = [firstName, lastName]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .join(' ');
  const primaryEmail = readPrimaryEmail(user);

  return Object.freeze({
    clerkUserId: id.trim(),
    primaryEmail: primaryEmail.email,
    primaryEmailVerified: primaryEmail.verified,
    displayName: fullName || null,
    firstName: typeof firstName === 'string' && firstName.trim() ? firstName.trim() : null,
    lastName: typeof lastName === 'string' && lastName.trim() ? lastName.trim() : null,
    imageUrl: typeof (user?.image_url ?? user?.imageUrl) === 'string'
      ? (user.image_url ?? user.imageUrl).trim() || null
      : null,
    publicMetadata: user?.public_metadata || user?.publicMetadata || {},
    privateMetadata: user?.private_metadata || user?.privateMetadata || {},
    clerkCreatedAt: readTimestamp(user?.created_at ?? user?.createdAt),
    clerkUpdatedAt: readTimestamp(user?.updated_at ?? user?.updatedAt),
  });
};

export const createClerkBackendClient = ({ secretKey, apiUrl = DEFAULT_CLERK_API_URL, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }) => {
  if (typeof secretKey !== 'string' || !secretKey.trim()) {
    throw new Error('CLERK_SECRET_KEY is required to create the Clerk Backend API client.');
  }

  const baseUrl = apiUrl.replace(/\/+$/, '');

  const requestJson = async ({ path, method = 'GET', body = undefined }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${secretKey}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw createClerkApiError('clerk_api_timeout', 'Clerk Backend API request timed out.');
      }
      const wrapped = createClerkApiError('clerk_api_unavailable', 'Clerk Backend API request failed.');
      wrapped.cause = error;
      throw wrapped;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let details = null;
      try { details = await response.clone().json(); } catch { /* ignore */ }
      if (response.status === 404) {
        throw createClerkApiError('clerk_user_not_found', 'Clerk user was not found.', 404);
      }
      const error = createClerkApiError('clerk_api_error', `Clerk Backend API returned HTTP ${response.status}.`, response.status);
      error.details = details;
      throw error;
    }

    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch (error) {
      const wrapped = createClerkApiError('invalid_clerk_response', 'Clerk Backend API returned invalid JSON.');
      wrapped.cause = error;
      throw wrapped;
    }
  };

  return Object.freeze({
    async getUser(userId) {
      if (typeof userId !== 'string' || !userId.trim()) {
        throw createClerkApiError('invalid_user_id', 'A Clerk user ID is required.');
      }
      return normalizeClerkBackendUser(await requestJson({ path: `/users/${encodeURIComponent(userId.trim())}` }));
    },

    async findUserByEmail(email) {
      const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!normalized) throw createClerkApiError('invalid_email', 'An email address is required.');
      const params = new URLSearchParams();
      params.append('email_address', normalized);
      params.set('limit', '10');
      const body = await requestJson({ path: `/users?${params.toString()}` });
      const users = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      const exact = users.find((item) => readPrimaryEmail(item).email?.toLowerCase() === normalized) || null;
      return exact ? normalizeClerkBackendUser(exact) : null;
    },

    async createUser({
      email,
      password,
      firstName = '',
      publicMetadata = {},
      privateMetadata = {},
      externalId = '',
      skipPasswordChecks = false,
    }) {
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!normalizedEmail || typeof password !== 'string' || !password) {
        throw createClerkApiError('invalid_create_user', 'Email and password are required to create a Clerk user.');
      }
      const body = {
        email_address: [normalizedEmail],
        password,
        ...(firstName ? { first_name: firstName } : {}),
        ...(externalId ? { external_id: externalId } : {}),
        public_metadata: publicMetadata,
        private_metadata: privateMetadata,
        ...(skipPasswordChecks ? { skip_password_checks: true } : {}),
      };
      return normalizeClerkBackendUser(await requestJson({ path: '/users', method: 'POST', body }));
    },

    async updateUser(userId, updates = {}) {
      if (typeof userId !== 'string' || !userId.trim()) {
        throw createClerkApiError('invalid_user_id', 'A Clerk user ID is required.');
      }
      return normalizeClerkBackendUser(await requestJson({
        path: `/users/${encodeURIComponent(userId.trim())}`,
        method: 'PATCH',
        body: updates,
      }));
    },

    async updateUserMetadata(userId, { publicMetadata = {}, privateMetadata = {} } = {}) {
      if (typeof userId !== 'string' || !userId.trim()) {
        throw createClerkApiError('invalid_user_id', 'A Clerk user ID is required.');
      }
      return normalizeClerkBackendUser(await requestJson({
        path: `/users/${encodeURIComponent(userId.trim())}/metadata`,
        method: 'PATCH',
        body: {
          public_metadata: publicMetadata,
          private_metadata: privateMetadata,
        },
      }));
    },

    async deleteUser(userId) {
      if (typeof userId !== 'string' || !userId.trim()) {
        throw createClerkApiError('invalid_user_id', 'A Clerk user ID is required.');
      }
      const body = await requestJson({ path: `/users/${encodeURIComponent(userId.trim())}`, method: 'DELETE' });
      return body ? normalizeClerkBackendUser(body) : null;
    },
  });
};
