const CLERK_UI_MAJOR = '1';
const CLERK_JS_MAJOR = '6';

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeBoolean = (value) => trim(value).toLowerCase() === 'true';
const firebaseRuntimeRetired = () => true;
const ADMIN_RENTAL_REQUEST_CACHE_TTL_MS = 5000;
const USER_SESSION_VERIFICATION_CACHE_TTL_MS = 3000;
const adminRentalRequestReadCache = new Map();
const clerkSessionTokenPending = new WeakMap();

const clearAdminRentalRequestReadCache = () => adminRentalRequestReadCache.clear();

const normalizeApiBaseUrl = (value) => {
  const raw = trim(value);
  if (!raw) throw new Error('VITE_API_URL is required when Clerk staging diagnostics are enabled.');

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('VITE_API_URL must be an absolute http(s) URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('VITE_API_URL must use http:// or https://.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('VITE_API_URL must not include credentials, query, or hash.');
  }
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (!localHost && parsed.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use https:// outside local development.');
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
};

export const decodeClerkFrontendApiDomain = (publishableKey, decodeBase64) => {
  const key = trim(publishableKey);
  if (!key.startsWith('pk_test_')) {
    throw new Error('Staging Clerk integration requires a Development publishable key (pk_test_...).');
  }

  const encoded = key.split('_')[2];
  if (!encoded) throw new Error('VITE_CLERK_PUBLISHABLE_KEY has an invalid format.');

  let decoded;
  try {
    decoded = decodeBase64(encoded);
  } catch {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY could not be decoded.');
  }

  const domain = trim(decoded).replace(/\$$/, '');
  if (!domain || domain.includes('/') || domain.includes(' ')) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY decoded to an invalid Frontend API domain.');
  }

  return domain;
};

export const readClerkStagingConfig = (env, decodeBase64) => {
  const mode = trim(env?.MODE || 'production').toLowerCase();
  const enabled = normalizeBoolean(env?.VITE_CLERK_STAGING_ENABLED);

  if (!enabled) {
    return Object.freeze({ enabled: false, mode });
  }

  const publishableKey = trim(env?.VITE_CLERK_PUBLISHABLE_KEY);
  if (!publishableKey) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required when Clerk staging diagnostics are enabled.');
  }

  return Object.freeze({
    enabled: true,
    mode,
    publishableKey,
    frontendApiDomain: decodeClerkFrontendApiDomain(publishableKey, decodeBase64),
    apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
  });
};

const parseJsonResponse = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const getSessionToken = async (clerk) => {
  const session = clerk?.session;
  if (!session || typeof session.getToken !== 'function') {
    throw new Error('Clerk sign-in is required before calling the backend.');
  }

  const existing = clerkSessionTokenPending.get(session);
  if (existing) return existing;

  const pending = Promise.resolve()
    .then(() => session.getToken())
    .then((token) => {
      if (!token) throw new Error('Clerk did not return a session token.');
      return token;
    });
  clerkSessionTokenPending.set(session, pending);

  try {
    return await pending;
  } finally {
    if (clerkSessionTokenPending.get(session) === pending) {
      clerkSessionTokenPending.delete(session);
    }
  }
};

const endActiveClerkSessionWithoutNavigation = async (clerk) => {
  const activeSession = clerk?.session;
  if (!activeSession) return;

  if (typeof activeSession.end === 'function') {
    await activeSession.end();
    if (clerk.session && typeof clerk.setActive === 'function') {
      await clerk.setActive({ session: null });
    }
    return;
  }

  if (typeof clerk?.client?.removeSessions === 'function') {
    await clerk.client.removeSessions();
    return;
  }

  const error = new Error(
    'Clerk cannot clear the active session without navigating away from the current application surface.'
  );
  error.code = 'clerk_non_navigating_session_clear_unavailable';
  throw error;
};

const requestWithSession = async ({ clerk, apiBaseUrl, fetchImpl, path, method = 'GET', headers = {}, body }) => {
  const token = await getSessionToken(clerk);
  const authorityHeaders = { ...headers };
  const response = await fetchImpl(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...authorityHeaders,
    },
    cache: 'no-store',
    ...(body === undefined ? {} : { body }),
  });
  return { response, payload: await parseJsonResponse(response) };
};

const requestPublicJson = async ({ apiBaseUrl, fetchImpl, path, body }) => {
  const response = await fetchImpl(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body || {}),
  });
  return { response, payload: await parseJsonResponse(response) };
};

const optionalFirebaseAuthorizationHeader = () => ({});

export const requestNativeUserSignup = async ({ apiBaseUrl, fetchImpl, password, input }) => {
  const { response, payload } = await requestPublicJson({
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/signup/clerk',
    body: { ...(input || {}), password },
  });
  if (!response.ok) {
    const error = new Error(`Native Clerk/PostgreSQL signup failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.signupLifecycle?.source !== 'postgresql' || payload?.signupLifecycle?.firebaseAuthCompatibility !== 'retired') {
    throw new Error('Backend returned an invalid native Clerk/PostgreSQL signup response.');
  }
  return payload;
};

export const requestVerifiedUserSignup = async ({ clerk, apiBaseUrl, fetchImpl, input }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/signup/clerk-verified',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });
  if (!response.ok) {
    const error = new Error(`Verified Clerk/PostgreSQL signup failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.signupLifecycle?.source !== 'postgresql' || payload?.signupLifecycle?.emailVerification !== 'clerk-email-code') {
    const error = new Error('Backend returned an invalid verified Clerk/PostgreSQL signup response.');
    error.code = 'user_verified_signup_payload_invalid';
    throw error;
  }
  return payload;
};

const requestWithFirebaseAuthorization = async () => {
  const error = new Error('Firebase authorization bridge has been removed.');
  error.code = 'firebase_runtime_removed';
  error.status = 410;
  throw error;
};

export const requestAccountRecoveryEmail = async ({ apiBaseUrl, fetchImpl, identity }) => {
  const { response, payload } = await requestPublicJson({
    apiBaseUrl,
    fetchImpl,
    path: '/api/account-recovery/email',
    body: identity,
  });
  if (!response.ok) {
    const error = new Error(`PostgreSQL account recovery lookup failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.accountRecovery?.source !== 'postgresql') throw new Error('Backend returned an invalid account recovery response.');
  return payload;
};

export const requestPasswordResetVerification = async ({ apiBaseUrl, fetchImpl, identity }) => {
  const { response, payload } = await requestPublicJson({
    apiBaseUrl,
    fetchImpl,
    path: '/api/account-recovery/password-reset/verify',
    body: identity,
  });
  if (!response.ok) {
    const error = new Error(`PostgreSQL password reset identity verification failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.accountRecovery?.source !== 'postgresql') throw new Error('Backend returned an invalid password reset verification response.');
  return payload;
};

export const requestAccountLifecycleSignup = async ({ apiBaseUrl, fetchImpl, firebaseIdToken, input }) => {
  const { response, payload } = await requestWithFirebaseAuthorization({
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/signup/bootstrap',
    firebaseIdToken,
    body: input || {},
  });
  if (!response.ok) {
    const error = new Error(`PostgreSQL account lifecycle signup failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.signupLifecycle?.source !== 'postgresql' || payload?.signupLifecycle?.firestoreBootstrap !== 'retired') {
    throw new Error('Backend returned an invalid PostgreSQL signup lifecycle response.');
  }
  return payload;
};

export const requestUserTermsConsent = async ({ clerk, apiBaseUrl, fetchImpl, includeLogs = true }) => {
  const path = includeLogs ? '/api/users/me/terms-consent' : '/api/users/me/terms-consent?includeLogs=0';
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path });
  if (!response.ok) {
    const error = new Error(`PostgreSQL terms consent read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.termsConsent?.source !== 'postgresql') throw new Error('Backend returned an invalid PostgreSQL terms consent response.');
  return payload;
};

export const requestUserTermsConsentBootstrap = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token) throw new Error('Firebase compatibility sign-in is required for the one-time terms consent bootstrap.');
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/terms-consent/bootstrap',
    method: 'POST',
    headers: { },
  });
  if (!response.ok) {
    const error = new Error(`Terms consent legacy bootstrap failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.termsConsent?.source !== 'postgresql' || payload?.termsConsent?.bootstrapRequired === true) {
    throw new Error('Backend returned an invalid PostgreSQL terms consent bootstrap response.');
  }
  return payload;
};

export const requestUserTermsConsentSave = async ({ clerk, apiBaseUrl, fetchImpl, input }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/terms-consent',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });
  if (!response.ok) {
    const error = new Error(`PostgreSQL terms consent save failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.termsConsent?.source !== 'postgresql' || payload?.termsConsent?.firestoreMirror !== 'retired') {
    throw new Error('Backend returned an invalid PostgreSQL terms consent save response.');
  }
  return payload;
};

export const requestUserClerkSession = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/users/auth/session' });
  if (!response.ok) {
    const error = new Error(`Backend user Clerk session verification failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.userAuthentication?.authority !== 'clerk') {
    throw new Error('Backend returned an invalid user Clerk session response.');
  }
  return payload;
};

export const requestUserClerkMigration = async ({ apiBaseUrl, fetchImpl, firebaseIdToken, password }) => {
  const { response, payload } = await requestWithFirebaseAuthorization({
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/auth/migrate',
    firebaseIdToken,
    body: { password },
  });
  if (!response.ok) {
    const error = new Error(`User Clerk migration failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.userAuthentication?.authority !== 'clerk') {
    throw new Error('Backend returned an invalid user Clerk migration response.');
  }
  return payload;
};

export const requestUserClerkProvision = async ({ apiBaseUrl, fetchImpl, firebaseIdToken, password }) => {
  const { response, payload } = await requestWithFirebaseAuthorization({
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/auth/provision',
    firebaseIdToken,
    body: { password },
  });
  if (!response.ok) {
    const error = new Error(`User Clerk provision failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.userAuthentication?.authority !== 'clerk') {
    throw new Error('Backend returned an invalid user Clerk provision response.');
  }
  return payload;
};

export const requestUserPasswordVerification = async ({ clerk, apiBaseUrl, fetchImpl, password }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/password/verify',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const error = new Error(`User Clerk password verification failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.passwordVerification?.verified || payload?.passwordVerification?.authority !== 'clerk') {
    throw new Error('Backend returned an invalid user password verification response.');
  }
  return payload;
};

export const requestUserPasswordChange = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, currentPassword, newPassword }) => {
  const token = trim(firebaseIdToken);
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/password/change',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    const error = new Error(`User Clerk password change failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.passwordChange?.changed || payload?.passwordChange?.authority !== 'clerk') {
    throw new Error('Backend returned an invalid user password change response.');
  }
  return payload;
};

export const requestUserWithdrawalFinalize = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, password }) => {
  const token = trim(firebaseIdToken);
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/withdrawal/finalize',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...optionalFirebaseAuthorizationHeader(token),
    },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const error = new Error(`User withdrawal authority finalization failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.withdrawal?.withdrawn || payload?.withdrawal?.authority !== 'postgresql') {
    throw new Error('Backend returned an invalid user withdrawal finalization response.');
  }
  return payload;
};

export const requestAdminLoginIdentifierResolve = async ({ apiBaseUrl, fetchImpl, identifier, password }) => {
  const { response, payload } = await requestPublicJson({
    apiBaseUrl,
    fetchImpl,
    path: '/api/admin/auth/resolve-login',
    body: { identifier, password },
  });
  if (!response.ok) {
    const error = new Error(`Administrator login identifier resolution failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.adminLoginResolution?.authority !== 'clerk-postgresql-login-resolver' || !trim(payload?.adminLoginResolution?.authEmail)) {
    const error = new Error('Backend returned an invalid administrator login identifier response.');
    error.code = 'admin_login_resolution_payload_invalid';
    throw error;
  }
  return payload.adminLoginResolution;
};

export const requestAdminClerkSession = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/auth/session' });
  if (!response.ok) {
    const error = new Error(`Backend administrator Clerk session verification failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminAuthentication?.authority !== 'clerk') {
    throw new Error('Backend returned an invalid administrator Clerk session response.');
  }
  return payload;
};

export const requestAdminClerkMigration = async ({ apiBaseUrl, fetchImpl, firebaseIdToken, password }) => {
  const { response, payload } = await requestWithFirebaseAuthorization({
    apiBaseUrl,
    fetchImpl,
    path: '/api/admin/auth/migrate',
    firebaseIdToken,
    body: { password },
  });
  if (!response.ok) {
    const error = new Error(`Administrator Clerk migration failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminAuthentication?.authority !== 'clerk') {
    throw new Error('Backend returned an invalid administrator Clerk migration response.');
  }
  return payload;
};

export const requestAdminClerkProvision = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, targetFirebaseUid, password }) => {
  const token = trim(firebaseIdToken);
  const target = trim(targetFirebaseUid);
  if (!token || !target) throw new Error('Administrator compatibility identity and target UID are required.');
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: `/api/admin/identity-registry/${encodeURIComponent(target)}/provision`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const error = new Error(`Administrator Clerk provision failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || !payload?.adminAuthentication?.provisioned) {
    throw new Error('Backend returned an invalid administrator Clerk provision response.');
  }
  return payload;
};

export const requestAuthenticatedSession = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/auth/session',
  });

  if (!response.ok) {
    const error = new Error(`Backend Clerk session verification failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  if (!payload?.authenticated || !payload?.session?.userId) {
    throw new Error('Backend returned an invalid authenticated-session response.');
  }

  return payload;
};

export const requestCurrentUserIdentity = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me',
  });

  if (response.status === 404 && payload?.error === 'profile_not_synced') return null;
  if (!response.ok) {
    const error = new Error(`Backend user lookup failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  if (!payload?.authenticated || !payload?.user?.id || !payload?.user?.clerkUserId) {
    throw new Error('Backend returned an invalid current-user response.');
  }
  return payload;
};

export const requestCurrentUserIdentitySync = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/sync',
    method: 'POST',
  });

  if (!response.ok) {
    const error = new Error(`Backend user synchronization failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  if (!payload?.authenticated || !payload?.synchronized || !payload?.user?.id || !payload?.user?.clerkUserId) {
    throw new Error('Backend returned an invalid user-synchronization response.');
  }
  return payload;
};


export const requestFirebaseLegacyLink = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token) throw new Error('Firebase sign-in is required before linking the legacy account.');

  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/legacy/firebase',
    method: 'POST',
    headers: { },
  });

  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Firebase legacy account link failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.linked || !payload?.firebaseLink?.firebaseUid) {
    throw new Error('Backend returned an invalid Firebase legacy-link response.');
  }
  return payload;
};

export const requestFirebaseLegacyLinkStatus = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/legacy/firebase',
  });

  if (response.status === 404 && payload?.error === 'legacy_link_not_found') return null;
  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Firebase legacy account lookup failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.firebaseLink?.firebaseUid) {
    throw new Error('Backend returned an invalid Firebase legacy-link lookup response.');
  }
  return payload;
};


export const requestMemberProfileReadCandidate = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/member-profile-candidate',
  });

  if (response.status === 404 && payload?.error === 'member_account_not_synchronized') return null;
  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Member profile read candidate lookup failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (
    !payload?.authenticated ||
    payload?.readCandidate?.source !== 'postgresql-authoritative' ||
    !payload?.readCandidate?.profile?.uid
  ) {
    throw new Error('Backend returned an invalid member profile read candidate response.');
  }
  return payload;
};


export const requestAdminRentalRequestBootstrap = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before synchronizing admin rental requests.');
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/admin/rental-requests/bootstrap',
    method: 'POST',
    headers: { },
  });
  if (!response.ok) {
    const error = new Error(`Admin rental request bootstrap failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminRentalRequestBootstrap?.target !== 'postgresql') {
    throw new Error('Backend returned an invalid admin rental request bootstrap response.');
  }
  return payload;
};

export const requestAdminRentalRequests = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, options = {} }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before reading PostgreSQL rental requests.');
  const params = new URLSearchParams();
  ['tab', 'quickFilter', 'query', 'page', 'pageSize', 'referenceDate'].forEach((key) => {
    const value = options?.[key];
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  });
  if (options?.includeCounts === false) params.set('includeCounts', 'false');
  const query = params.toString();
  const path = `/api/admin/rental-requests${query ? `?${query}` : ''}`;
  const cacheKey = path;
  const now = Date.now();
  const cached = adminRentalRequestReadCache.get(cacheKey);
  if (cached?.promise && (cached.pending || cached.expiresAt > now)) return cached.promise;

  const entry = { pending: true, expiresAt: 0, promise: null };
  entry.promise = (async () => {
    const { response, payload } = await requestWithSession({
      clerk,
      apiBaseUrl,
      fetchImpl,
      path,
      headers: { },
    });
    if (!response.ok) {
      const error = new Error(`Admin PostgreSQL rental request read failed with HTTP ${response.status}.`);
      error.status = response.status;
      error.code = payload?.error || null;
      throw error;
    }
    if (!payload?.authenticated || !payload?.authorized || payload?.adminRentalRequests?.source !== 'postgresql' || !Array.isArray(payload?.adminRentalRequests?.requests)) {
      throw new Error('Backend returned an invalid admin rental request response.');
    }
    return payload;
  })()
    .then((payload) => {
      entry.pending = false;
      entry.expiresAt = Date.now() + ADMIN_RENTAL_REQUEST_CACHE_TTL_MS;
      return payload;
    })
    .catch((error) => {
      adminRentalRequestReadCache.delete(cacheKey);
      throw error;
    });

  adminRentalRequestReadCache.set(cacheKey, entry);
  return entry.promise;
};

export const requestAdminRentalDashboard = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, referenceDate = '' }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before reading the PostgreSQL rental dashboard.');
  const query = referenceDate ? `?referenceDate=${encodeURIComponent(referenceDate)}` : '';
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: `/api/admin/rental-dashboard${query}`,
    headers: { },
  });
  if (!response.ok) {
    const error = new Error(`Admin PostgreSQL rental dashboard read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminRentalDashboard?.source !== 'postgresql') {
    throw new Error('Backend returned an invalid admin rental dashboard response.');
  }
  return payload;
};

const requestAdminRentalRequestMutationAction = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, requestId, action, body = {} }) => {
  const token = trim(firebaseIdToken);
  const id = trim(requestId);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before changing a PostgreSQL rental request.');
  if (!id) throw new Error('Rental request ID is required.');
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: `/api/admin/rental-requests/${encodeURIComponent(id)}/${action}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) {
    const error = new Error(`Admin PostgreSQL rental request ${action} failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    error.blockingRequest = payload?.blockingRequest || null;
    error.previousStatus = payload?.previousStatus || null;
    error.nextStatus = payload?.nextStatus || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminRentalRequestMutation?.authority !== 'postgresql' || !payload?.adminRentalRequestMutation?.request?.id) {
    throw new Error(`Backend returned an invalid admin rental request ${action} response.`);
  }
  clearAdminRentalRequestReadCache();
  return payload;
};

export const requestAdminRentalRequestSync = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, requestId }) => {
  const token = trim(firebaseIdToken);
  const id = trim(requestId);
  if ((!token && !firebaseRuntimeRetired()) || !id) throw new Error('Firebase admin sign-in and rental request ID are required.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl,
    path: `/api/admin/rental-requests/${encodeURIComponent(id)}/sync`,
    method: 'POST',
    headers: { },
  });
  if (!response.ok) {
    const error = new Error(`Admin rental request targeted sync failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminRentalRequestSync?.target !== 'postgresql') {
    throw new Error('Backend returned an invalid targeted admin rental request sync response.');
  }
  clearAdminRentalRequestReadCache();
  return payload;
};

export const requestAdminRentalRequestEvents = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, requestId }) => {
  void firebaseIdToken;
  const id = trim(requestId);
  if (!id) throw new Error('Rental request ID is required.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl,
    path: `/api/admin/rental-requests/${encodeURIComponent(id)}/events`,
    headers: { },
  });
  if (!response.ok) {
    const error = new Error(`Admin rental request event read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminRentalRequestEvents?.source !== 'postgresql' || !Array.isArray(payload?.adminRentalRequestEvents?.events)) {
    throw new Error('Backend returned an invalid admin rental request event response.');
  }
  return payload;
};

export const requestAdminRentalRequestEdit = async (args) => requestAdminRentalRequestMutationAction({ ...args, action: 'edit', body: { form: args.form || {} } });
export const requestAdminRentalRequestMemo = async (args) => requestAdminRentalRequestMutationAction({ ...args, action: 'memo', body: { memo: args.memo || '' } });
export const requestAdminRentalRequestRestore = async (args) => requestAdminRentalRequestMutationAction({ ...args, action: 'restore', body: { status: args.status, restoreReason: args.restoreReason } });

export const requestAdminRentalRequestStatusChange = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, requestId, status }) => {
  const token = trim(firebaseIdToken);
  const id = trim(requestId);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before changing a PostgreSQL rental request.');
  if (!id) throw new Error('Rental request ID is required.');
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: `/api/admin/rental-requests/${encodeURIComponent(id)}/status`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const error = new Error(`Admin PostgreSQL rental request status change failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    error.blockingRequest = payload?.blockingRequest || null;
    error.previousStatus = payload?.previousStatus || null;
    error.nextStatus = payload?.nextStatus || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminRentalRequestMutation?.authority !== 'postgresql' || !payload?.adminRentalRequestMutation?.request?.id) {
    throw new Error('Backend returned an invalid admin rental request mutation response.');
  }
  clearAdminRentalRequestReadCache();
  return payload;
};



export const requestMemberProfileAuthorityWrite = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, profile }) => {
  const token = trim(firebaseIdToken);
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: '/api/users/me/member-profile', method: 'POST',
    headers: { 'Content-Type': 'application/json', ...optionalFirebaseAuthorizationHeader(token) },
    body: JSON.stringify(profile || {}),
  });
  if (!response.ok) {
    const error = new Error(`PostgreSQL member profile write failed with HTTP ${response.status}.`);
    error.status = response.status; error.code = payload?.error || null; throw error;
  }
  if (!payload?.authenticated || payload?.memberProfileWrite?.authority !== 'postgresql' || !['synced','retired'].includes(payload?.memberProfileWrite?.firestoreMirror)) {
    throw new Error('Backend returned an invalid PostgreSQL member profile write response.');
  }
  return payload;
};

export const requestMemberDirectoryAuthorityVerification = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/member-directory/verify',
    method: 'POST',
    headers: optionalFirebaseAuthorizationHeader(token),
  });
  if (!response.ok) {
    const error = new Error(`PostgreSQL member directory verification failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    error.details = payload?.details || null;
    throw error;
  }
  if (
    !payload?.authenticated ||
    payload?.memberDirectoryVerification?.authority !== 'postgresql' ||
    payload?.memberDirectoryVerification?.source !== 'postgresql-authoritative' ||
    payload?.memberDirectoryVerification?.firestoreMirror !== 'retired'
  ) {
    throw new Error('Backend returned an invalid PostgreSQL member directory verification response.');
  }
  return payload;
};

export const requestAdminMembersPostgresql = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, options = {} }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before reading PostgreSQL members.');
  const params = new URLSearchParams();
  ['status', 'q', 'page', 'pageSize'].forEach((key) => {
    const value = options?.[key];
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  });
  const query = params.toString();
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: `/api/admin/members${query ? `?${query}` : ''}`,
    headers: { },
  });
  if (!response.ok) {
    const error = new Error(`Admin PostgreSQL member read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminMembers?.source !== 'postgresql' || !Array.isArray(payload?.adminMembers?.accounts)) {
    throw new Error('Backend returned an invalid admin PostgreSQL member response.');
  }
  return payload;
};

export const requestAdminMemberRentalHistory = async ({ clerk, apiBaseUrl, fetchImpl, uid }) => {
  const targetUid = trim(uid);
  if (!targetUid) throw Object.assign(new Error('Member UID is required.'), { code: 'admin_member_rental_history_uid_missing' });
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: `/api/admin/members/${encodeURIComponent(targetUid)}/rental-history`,
    method: 'GET',
    headers: {},
  });
  if (!response.ok) {
    const error = new Error(`Admin PostgreSQL member rental history read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminMemberRentalHistory?.source !== 'postgresql' || !Array.isArray(payload?.adminMemberRentalHistory?.requests)) {
    throw Object.assign(new Error('Backend returned an invalid admin member rental history response.'), { code: 'admin_member_rental_history_payload_invalid' });
  }
  return payload;
};

export const requestAdminMemberCreatePostgresql = async ({ clerk, apiBaseUrl, fetchImpl, input = {} }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/admin/members',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });
  if (!response.ok) {
    const error = new Error(`Admin PostgreSQL member create failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (
    !payload?.authenticated ||
    !payload?.authorized ||
    payload?.adminMemberCreate?.authority !== 'clerk-postgresql' ||
    payload?.adminMemberCreate?.source !== 'postgresql'
  ) {
    throw new Error('Backend returned an invalid administrator member provisioning response.');
  }
  return payload;
};

export const requestAdminMemberProfileAuthorityWrite = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, firebaseUid, profile }) => {
  const token = trim(firebaseIdToken); const uid = trim(firebaseUid);
  if ((!token && !firebaseRuntimeRetired()) || !uid) throw new Error('Firebase admin sign-in and member UID are required.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: `/api/admin/members/${encodeURIComponent(uid)}/profile`, method: 'POST',
    headers: { 'Content-Type': 'application/json', },
    body: JSON.stringify(profile || {}),
  });
  if (!response.ok) { const error = new Error(`Admin PostgreSQL member profile write failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminMemberProfileWrite?.authority !== 'postgresql') throw new Error('Backend returned an invalid admin member profile write response.');
  return payload;
};

export const requestAdminMemberTermsConsent = async ({ clerk, apiBaseUrl, fetchImpl, memberKey }) => {
  const key = trim(memberKey);
  if (!key) throw new Error('Member key is required.');
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: `/api/admin/members/${encodeURIComponent(key)}/terms-consent`,
    method: 'GET',
  });
  if (!response.ok) {
    const error = new Error(`Admin PostgreSQL member terms read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.termsConsent?.source !== 'postgresql') {
    throw new Error('Backend returned an invalid admin member terms consent payload.');
  }
  return payload;
};

export const requestAdminMemberDirectoryPostgresql = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: '/api/admin/member-directory', method: 'GET',
  });
  if (!response.ok) {
    const error = new Error(`Admin PostgreSQL member directory read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.memberDirectory?.source !== 'postgresql' || !Array.isArray(payload?.memberDirectory?.entries)) {
    throw new Error('Backend returned an invalid PostgreSQL member directory payload.');
  }
  return payload;
};

export const requestAdminMemberDirectoryPostgresqlSync = async ({ clerk, apiBaseUrl, fetchImpl, entries = [], version = 0, teams = [], settings = {} }) => {
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: '/api/admin/member-directory/sync', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries, version, teams, settings }),
  });
  if (!response.ok) { const error = new Error(`Admin PostgreSQL member directory sync failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.memberDirectorySync?.authority !== 'postgresql' || payload?.memberDirectorySync?.target !== 'postgresql-member-directory') {
    throw Object.assign(new Error('Backend returned an invalid member directory synchronization response.'), { code: 'member_directory_sync_payload_invalid' });
  }
  return payload;
};

export const requestAdminMemberDirectoryAuditPostgresql = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: '/api/admin/member-directory/audit', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) { const error = new Error(`Admin PostgreSQL member directory audit failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.memberDirectoryAudit?.authority !== 'postgresql' || !payload?.memberDirectoryAudit?.audit) throw new Error('Backend returned an invalid PostgreSQL member directory audit response.');
  return payload;
};

export const requestAdminMemberDirectoryRestorePostgresql = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: '/api/admin/member-directory/restore-mismatches', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) { const error = new Error(`Admin PostgreSQL member directory restore failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.memberDirectoryRestore?.authority !== 'postgresql') throw new Error('Backend returned an invalid PostgreSQL member directory restore response.');
  return payload;
};

export const requestAdminSignupPolicyPatch = async ({ clerk, apiBaseUrl, fetchImpl, policy = {} }) => {
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: '/api/admin/member-signup-policy', method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy: policy || {} }),
  });
  if (!response.ok) { const error = new Error(`Admin PostgreSQL signup policy write failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.signupPolicyMutation?.authority !== 'postgresql' || payload?.signupPolicyMutation?.operation !== 'signup-policy-patch') throw new Error('Backend returned an invalid PostgreSQL signup policy response.');
  return payload;
};

export const requestAdminMemberPasswordChange = async ({ clerk, apiBaseUrl, fetchImpl, firebaseUid, newPassword }) => {
  const uid = trim(firebaseUid);
  if (!uid) throw new Error('Member UID is required.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: `/api/admin/members/${encodeURIComponent(uid)}/password`, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: String(newPassword || '') }),
  });
  if (!response.ok) { const error = new Error(`Admin member password change failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminMemberPasswordChange?.authority !== 'clerk' || payload?.adminMemberPasswordChange?.operation !== 'admin-member-password-change' || payload?.adminMemberPasswordChange?.changed !== true) throw new Error('Backend returned an invalid admin member password change response.');
  return payload;
};

export const requestAdminMemberLifecycleMutation = async ({ clerk, apiBaseUrl, fetchImpl, firebaseUid, operation }) => {
  const uid = trim(firebaseUid);
  const operationConfig = {
    reject: { method: 'POST', path: `/api/admin/members/${encodeURIComponent(uid)}/reject`, expected: 'signup-reject' },
    retire: { method: 'POST', path: `/api/admin/members/${encodeURIComponent(uid)}/retire`, expected: 'member-retire' },
    purge: { method: 'DELETE', path: `/api/admin/members/${encodeURIComponent(uid)}`, expected: 'retired-purge' },
  }[operation];
  if (!uid || !operationConfig) throw new Error('Member UID and lifecycle operation are required.');
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: operationConfig.path, method: operationConfig.method });
  if (!response.ok) { const error = new Error(`Admin member lifecycle mutation failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminMemberLifecycle?.authority !== 'clerk-postgresql' || payload?.adminMemberLifecycle?.operation !== operationConfig.expected) throw new Error('Backend returned an invalid admin member lifecycle response.');
  return payload;
};

export const requestAdminMemberStatusAuthorityWrite = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, firebaseUid, status }) => {
  const token = trim(firebaseIdToken); const uid = trim(firebaseUid);
  if ((!token && !firebaseRuntimeRetired()) || !uid) throw new Error('Firebase admin sign-in and member UID are required.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: `/api/admin/members/${encodeURIComponent(uid)}/status`, method: 'POST',
    headers: { 'Content-Type': 'application/json', },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) { const error = new Error(`Admin PostgreSQL member status write failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminMemberStatusWrite?.authority !== 'postgresql') throw new Error('Backend returned an invalid admin member status write response.');
  return payload;
};

export const requestAdminIdentityRegistryBootstrap = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before synchronizing the PostgreSQL admin identity registry.');
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/identity-registry/bootstrap', method: 'POST', headers: { } });
  if (!response.ok) { const error = new Error(`Admin identity registry bootstrap failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminIdentityRegistry?.target !== 'postgresql-admin-registry') throw new Error('Backend returned an invalid admin identity registry response.');
  return payload;
};

export const requestAdminAccountPasswordChange = async ({ clerk, apiBaseUrl, fetchImpl, key, newPassword }) => {
  const accountKey = trim(key);
  if (!accountKey) throw new Error('Administrator account key is required.');
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: `/api/admin/accounts/${encodeURIComponent(accountKey)}/password`, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: String(newPassword || '') }) });
  if (!response.ok) { const error = new Error(`Administrator password change failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminAccountPasswordChange?.operation !== 'password-change' || payload?.adminAccountPasswordChange?.changed !== true) throw new Error('Backend returned an invalid administrator password change payload.');
  return payload;
};

export const requestAdminAccountsPostgresql = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/accounts', method: 'GET' });
  if (!response.ok) { const error = new Error(`Administrator accounts read failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminAccounts?.source !== 'postgresql' || !Array.isArray(payload?.adminAccounts?.accounts)) throw new Error('Backend returned an invalid administrator accounts payload.');
  return payload;
};

const requestAdminAccountMutation = async ({ clerk, apiBaseUrl, fetchImpl, method, path, body, expectedOperation }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path, method, headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) { const error = new Error(`Administrator account mutation failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminAccountMutation?.operation !== expectedOperation || !payload?.adminAccountMutation?.account) throw new Error('Backend returned an invalid administrator account mutation payload.');
  return payload;
};

export const requestAdminRentalConfigSettingsPatch = async ({ clerk, apiBaseUrl, fetchImpl, settings = {} }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/admin/site-content/rental-config/settings',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: settings || {} }),
  });
  if (!response.ok) {
    const error = new Error(`Rental configuration settings write failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.rentalConfigMutation?.authority !== 'postgresql' || payload?.rentalConfigMutation?.operation !== 'settings-patch') {
    throw new Error('Backend returned an invalid PostgreSQL rental configuration settings response.');
  }
  return payload;
};

export const requestAdminSystemSettingsAudit = async ({ clerk, apiBaseUrl, fetchImpl, limit = 50 }) => {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: `/api/admin/system-settings-audit?limit=${safeLimit}`,
    method: 'GET',
  });
  if (!response.ok) {
    const error = new Error(`System settings audit read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemSettingsAudit?.source !== 'postgresql' || !Array.isArray(payload?.systemSettingsAudit?.logs)) {
    throw Object.assign(new Error('Backend returned an invalid system settings audit payload.'), { code: 'system_settings_audit_payload_invalid' });
  }
  return payload;
};

export const requestAdminSystemSettingsAuditWrite = async ({ clerk, apiBaseUrl, fetchImpl, audit = {} }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/admin/system-settings-audit',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audit }),
  });
  if (!response.ok) {
    const error = new Error(`System settings audit write failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemSettingsAuditMutation?.source !== 'postgresql' || !payload?.systemSettingsAuditMutation?.entry?.id) {
    throw Object.assign(new Error('Backend returned an invalid system settings audit mutation payload.'), { code: 'system_settings_audit_mutation_payload_invalid' });
  }
  return payload;
};

export const requestAdminClerkDeviceTrust = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/admin/clerk-device-trust',
    method: 'GET',
  });
  if (!response.ok) {
    const error = new Error(`Clerk Device Trust read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  const state = payload?.clerkDeviceTrust;
  if (
    !payload?.authenticated ||
    !payload?.authorized ||
    state?.source !== 'clerk-platform-api' ||
    state?.authority !== 'clerk-device-trust' ||
    typeof state?.configured !== 'boolean' ||
    (state.configured && typeof state.enabled !== 'boolean')
  ) {
    throw Object.assign(
      new Error('Backend returned an invalid Clerk Device Trust payload.'),
      { code: 'clerk_device_trust_payload_invalid' },
    );
  }
  return payload;
};

export const requestAdminClerkDeviceTrustWrite = async ({ clerk, apiBaseUrl, fetchImpl, enabled }) => {
  if (typeof enabled !== 'boolean') {
    throw Object.assign(
      new Error('Clerk Device Trust enabled must be a boolean.'),
      { code: 'clerk_device_trust_enabled_invalid' },
    );
  }
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/admin/clerk-device-trust',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    const error = new Error(`Clerk Device Trust write failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  const state = payload?.clerkDeviceTrust;
  if (
    !payload?.authenticated ||
    !payload?.authorized ||
    state?.source !== 'clerk-platform-api' ||
    state?.authority !== 'clerk-device-trust' ||
    state?.configured !== true ||
    typeof state.enabled !== 'boolean' ||
    state.enabled !== enabled
  ) {
    throw Object.assign(
      new Error('Backend returned an invalid Clerk Device Trust mutation payload.'),
      { code: 'clerk_device_trust_mutation_payload_invalid' },
    );
  }
  return payload;
};

export const requestSystemConfiguration = async ({ clerk = null, apiBaseUrl, fetchImpl, key, admin = false }) => {
  const path = admin ? `/api/admin/system-config/${encodeURIComponent(key)}` : `/api/system-config/${encodeURIComponent(key)}`;
  if (admin) {
    const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path, method: 'GET' });
    if (!response.ok) { const error = new Error(`System configuration read failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
    if (payload?.systemConfiguration?.source !== 'postgresql') throw new Error('Backend returned an invalid system configuration payload.');
    return payload;
  }
  const response = await fetchImpl(`${apiBaseUrl}${path}`, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
  const payload = await parseJsonResponse(response);
  if (!response.ok) { const error = new Error(`System configuration read failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (payload?.systemConfiguration?.source !== 'postgresql') throw new Error('Backend returned an invalid system configuration payload.');
  return payload;
};

export const requestSystemConfigurationWrite = async ({ clerk, apiBaseUrl, fetchImpl, key, payload: configPayload }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: `/api/admin/system-config/${encodeURIComponent(key)}`, method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: configPayload || {} }) });
  if (!response.ok) { const error = new Error(`System configuration write failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemConfiguration?.source !== 'postgresql') throw new Error('Backend returned an invalid system configuration write payload.');
  return payload;
};

export const requestAdminSystemDataOverview = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/system-data/overview', method: 'GET' });
  if (!response.ok) { const error = new Error(`System data overview failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemDataOverview?.authority !== 'postgresql') throw new Error('Backend returned an invalid PostgreSQL system data overview.');
  return payload;
};

export const requestAdminSystemDataIntegrity = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/system-data/integrity', method: 'POST' });
  if (!response.ok) { const error = new Error(`System data integrity check failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemDataIntegrity?.authority !== 'postgresql') throw new Error('Backend returned an invalid PostgreSQL integrity result.');
  return payload;
};

export const requestAdminSystemDataAssetRepair = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/system-data/repair-asset-references', method: 'POST' });
  if (!response.ok) { const error = new Error(`System data asset repair failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemDataRepair?.authority !== 'postgresql') throw new Error('Backend returned an invalid PostgreSQL asset repair result.');
  return payload;
};

export const requestAdminSystemDataCatalogMetadataReconcile = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/system-data/reconcile-asset-catalog-metadata', method: 'POST' });
  if (!response.ok) { const error = new Error(`System data asset catalog metadata reconcile failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemDataCatalogMetadataReconcile?.authority !== 'postgresql') throw new Error('Backend returned an invalid PostgreSQL asset catalog metadata reconcile result.');
  return payload;
};

export const requestAdminSystemDataResetScan = async ({ clerk, apiBaseUrl, fetchImpl, scopes = [] }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/system-data/reset/scan', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopes }) });
  if (!response.ok) { const error = new Error(`System data reset scan failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemDataResetScan?.authority !== 'postgresql') throw new Error('Backend returned an invalid PostgreSQL reset scan payload.');
  return payload;
};

export const requestAdminSystemDataReset = async ({ clerk, apiBaseUrl, fetchImpl, scopes = [], confirmText = '', backupConfirmed = false }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/system-data/reset', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopes, confirmText, backupConfirmed }) });
  if (!response.ok) { const error = new Error(`System data reset failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemDataReset?.authority !== 'postgresql') throw new Error('Backend returned an invalid PostgreSQL reset result.');
  return payload;
};

export const requestAdminSystemDataExport = async ({ clerk, apiBaseUrl, fetchImpl, options = {} }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/system-data/export', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options || {}) });
  if (!response.ok) { const error = new Error(`System data export failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.systemDataExport?.authority !== 'postgresql') throw new Error('Backend returned an invalid PostgreSQL export payload.');
  return payload;
};

export const requestAssetCatalog = async ({ apiBaseUrl, fetchImpl }) => {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/assets/catalog`, {
        method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store',
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        const error = new Error(`PostgreSQL asset catalog read failed with HTTP ${response.status}.`);
        error.status = response.status;
        error.code = payload?.error || 'asset_catalog_unavailable';
        throw error;
      }
      if (payload?.assetCatalog?.source !== 'postgresql' || !Array.isArray(payload?.assetCatalog?.assets) || !Array.isArray(payload?.assetCatalog?.categories)) {
        const error = new Error('Backend returned an invalid PostgreSQL asset catalog response.');
        error.code = 'asset_catalog_payload_invalid';
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      const retryable = Number(error?.status || 0) >= 500 || ['TypeError', 'AbortError'].includes(error?.name);
      if (attempt >= 1 || !retryable) break;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  throw lastError || Object.assign(new Error('PostgreSQL asset catalog read failed.'), { code: 'asset_catalog_unavailable' });
};

export const requestAdminAssetBootstrap = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before synchronizing PostgreSQL assets.');
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/assets/bootstrap', method: 'POST', headers: { } });
  if (!response.ok) {
    const error = new Error(`Admin asset bootstrap failed with HTTP ${response.status}.`); error.status = response.status; error.code = payload?.error || null; throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminAssetBootstrap?.target !== 'postgresql') throw new Error('Backend returned an invalid admin asset bootstrap response.');
  return payload;
};

const requestAdminAssetMutation = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, path, body = {}, expectedOperation }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before changing PostgreSQL assets.');
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path, method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(body) });
  if (!response.ok) {
    const error = new Error(`Admin PostgreSQL asset ${expectedOperation} failed with HTTP ${response.status}.`);
    error.status = response.status; error.code = payload?.error || null; error.assetNo = payload?.assetNo || ''; error.category = payload?.category || ''; error.blockingRequest = payload?.blockingRequest || null;
    error.duplicateAssetNumbers = payload?.duplicateAssetNumbers || []; error.invalidCategories = payload?.invalidCategories || [];
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminAssetMutation?.authority !== 'postgresql') throw new Error(`Backend returned an invalid admin asset ${expectedOperation} response.`);
  return payload;
};

export const requestAdminAssetCreate = (args) => requestAdminAssetMutation({ ...args, path: '/api/admin/assets', body: { asset: args.asset || {} }, expectedOperation: 'create' });
export const requestAdminAssetEdit = (args) => requestAdminAssetMutation({ ...args, path: `/api/admin/assets/${encodeURIComponent(trim(args.assetId))}/edit`, body: { asset: args.asset || {} }, expectedOperation: 'edit' });
export const requestAdminAssetDelete = (args) => requestAdminAssetMutation({ ...args, path: `/api/admin/assets/${encodeURIComponent(trim(args.assetId))}/delete`, body: {}, expectedOperation: 'delete' });
export const requestAdminAssetBulkCreate = (args) => requestAdminAssetMutation({ ...args, path: '/api/admin/assets/bulk', body: { assets: args.assets || [] }, expectedOperation: 'bulk-create' });
export const requestAdminAssetCategories = (args) => requestAdminAssetMutation({ ...args, path: '/api/admin/assets/categories', body: { categories: args.categories || [], renameMap: args.renameMap || {} }, expectedOperation: 'categories' });

export const requestCurrentUserRentalRestriction = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/rental-restriction',
    method: 'GET',
  });
  if (!response.ok) {
    const error = new Error(`PostgreSQL rental restriction read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'rental_restriction_postgresql_unavailable';
    throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.rentalRestriction?.source !== 'postgresql-authoritative') {
    const error = new Error('Backend returned an invalid PostgreSQL rental restriction response.');
    error.code = 'rental_restriction_payload_invalid';
    throw error;
  }
  return payload;
};

export const requestRentalRequestCreate = async ({ clerk, apiBaseUrl, fetchImpl, request }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/rental-requests',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request || {}),
  });
  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`PostgreSQL rental request creation failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    error.blockingRequest = payload?.blockingRequest || null;
    throw error;
  }
  if (
    !payload?.authenticated ||
    payload?.rentalRequestWrite?.authority !== 'postgresql' ||
    !payload?.rentalRequestWrite?.request?.id ||
    !payload?.rentalRequestWrite?.availability?.id
  ) {
    throw new Error('Backend returned an invalid PostgreSQL rental request creation response.');
  }
  return payload;
};

const requestRentalRequestUserAction = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, requestId, action, body = {} }) => {
  const token = trim(firebaseIdToken);
  const id = trim(requestId);
  if (!id) throw new Error('Rental request ID is required.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl,
    path: `/api/users/me/rental-requests/${encodeURIComponent(id)}/${action}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...optionalFirebaseAuthorizationHeader(token) },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) {
    const error = new Error(payload?.error || `rental_request_user_${action}_unavailable`);
    error.status = response.status;
    error.code = payload?.error || null;
    error.blockingRequest = payload?.blockingRequest || null;
    error.availableDate = payload?.availableDate || '';
    throw error;
  }
  if (!payload?.authenticated || payload?.rentalRequestUserAction?.authority !== 'postgresql') {
    throw new Error(`Backend returned an invalid rental request user ${action} response.`);
  }
  if (action !== 'cancel' && !payload?.rentalRequestUserAction?.request?.id) {
    throw new Error(`Backend returned no rental request after user ${action}.`);
  }
  return payload;
};

export const requestRentalRequestUserEdit = async (args) => requestRentalRequestUserAction({ ...args, action: 'edit', body: { startDate: args.startDate, dueDate: args.dueDate, purpose: args.purpose || '' } });
export const requestRentalRequestUserCancel = async (args) => requestRentalRequestUserAction({ ...args, action: 'cancel' });
export const requestRentalRequestUserExtend = async (args) => requestRentalRequestUserAction({ ...args, action: 'extend' });

export const requestRentalRequestReadCandidate = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/rental-requests',
  });
  if (response.status === 404 && payload?.error === 'rental_request_shadow_not_synced') return null;
  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Rental request read candidate lookup failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  const candidateSource = String(payload?.rentalRequestCandidate?.source || '');
  if (!payload?.authenticated || candidateSource !== 'postgresql-authoritative' || !Array.isArray(payload?.rentalRequestCandidate?.requests)) {
    throw new Error('Backend returned an invalid rental request read candidate response.');
  }
  return payload;
};


const createScriptLoader = (documentRef) => (id, src, attributes = {}) =>
  new Promise((resolve, reject) => {
    const existing = documentRef.getElementById(id);
    if (existing?.dataset?.loaded === 'true') {
      resolve(existing);
      return;
    }

    const script = existing || documentRef.createElement('script');
    if (!existing) {
      script.id = id;
      script.src = src;
      script.defer = true;
      script.async = false;
      script.crossOrigin = 'anonymous';
      Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
      documentRef.head.appendChild(script);
    }

    const handleLoad = () => {
      script.dataset.loaded = 'true';
      cleanup();
      resolve(script);
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Failed to load Clerk script: ${src}`));
    };
    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
  });

export const createClerkStagingClient = ({ env, windowRef, documentRef, fetchImpl }) => {
  const decodeBase64 = (value) => windowRef.atob(value);
  const config = readClerkStagingConfig(env, decodeBase64);
  let initializePromise = null;
  let pendingAdminClientTrust = null;
  let pendingUserPasswordReset = null;
  let pendingUserSignupEmailVerification = null;
  let userSessionVerificationCache = null;
  let userSessionVerificationPending = null;

  const clearUserSessionVerificationCache = () => {
    userSessionVerificationCache = null;
    userSessionVerificationPending = null;
  };

  const createAdminClientTrustError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };

  const selectAdminClientTrustFactor = (signIn) => {
    const factors = Array.isArray(signIn?.supportedSecondFactors)
      ? signIn.supportedSecondFactors
      : [];
    return factors.find((factor) => factor?.strategy === 'email_code') || null;
  };

  const sendAdminClientTrustChallenge = async (signIn, factor) => {
    if (!signIn || signIn.status !== 'needs_client_trust' || !factor?.strategy) {
      throw createAdminClientTrustError(
        'admin_clerk_client_trust_unavailable',
        'Clerk administrator Client Trust challenge is unavailable.'
      );
    }

    if (factor.strategy === 'email_code') {
      if (typeof signIn.mfa?.sendEmailCode === 'function') {
        await signIn.mfa.sendEmailCode();
      } else if (typeof signIn.prepareSecondFactor === 'function') {
        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: factor.emailAddressId,
        });
      } else {
        throw createAdminClientTrustError(
          'admin_clerk_client_trust_unavailable',
          'ClerkJS does not expose an email Client Trust challenge API.'
        );
      }
      return;
    }

    if (factor.strategy === 'phone_code') {
      if (typeof signIn.mfa?.sendPhoneCode === 'function') {
        await signIn.mfa.sendPhoneCode();
      } else if (typeof signIn.prepareSecondFactor === 'function') {
        await signIn.prepareSecondFactor({
          strategy: 'phone_code',
          phoneNumberId: factor.phoneNumberId,
        });
      } else {
        throw createAdminClientTrustError(
          'admin_clerk_client_trust_unavailable',
          'ClerkJS does not expose a phone Client Trust challenge API.'
        );
      }
      return;
    }

    throw createAdminClientTrustError(
      'admin_clerk_client_trust_link_unsupported',
      'Clerk administrator Client Trust is configured for an email-link challenge, which this administrator login screen does not support.'
    );
  };

  const finalizeAdminClerkSignIn = async (clerk, signIn, fallbackEmail = '') => {
    if (signIn?.status !== 'complete' || !signIn?.createdSessionId) {
      throw createAdminClientTrustError(
        'admin_clerk_signin_incomplete',
        `Clerk administrator sign-in is incomplete (${signIn?.status || 'unknown'}).`
      );
    }
    await clerk.setActive({ session: signIn.createdSessionId });
    pendingAdminClientTrust = null;
    return Object.freeze({
      status: 'complete',
      clerkUserId: clerk.user?.id || '',
      email: clerk.user?.primaryEmailAddress?.emailAddress || fallbackEmail,
      sessionId: clerk.session?.id || signIn.createdSessionId,
    });
  };

  const initialize = async () => {
    if (!config.enabled) return null;
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      if (!windowRef.Clerk?.load) {
        const loadScript = createScriptLoader(documentRef);
        const base = `https://${config.frontendApiDomain}/npm`;

        await loadScript(
          'clerk-staging-ui',
          `${base}/@clerk/ui@${CLERK_UI_MAJOR}/dist/ui.browser.js`,
        );
        await loadScript(
          'clerk-staging-js',
          `${base}/@clerk/clerk-js@${CLERK_JS_MAJOR}/dist/clerk.browser.js`,
          { 'data-clerk-publishable-key': config.publishableKey },
        );
      }

      if (!windowRef.Clerk?.load) {
        throw new Error('ClerkJS did not initialize after its script loaded.');
      }

      if (!windowRef.Clerk.loaded) {
        await windowRef.Clerk.load({
          ui: { ClerkUI: windowRef.__internal_ClerkUICtor },
        });
      }

      return windowRef.Clerk;
    })();

    try {
      return await initializePromise;
    } catch (error) {
      initializePromise = null;
      throw error;
    }
  };

  return Object.freeze({
    config,
    isDiagnosticsRequested() {
      if (!config.enabled) return false;
      return new URLSearchParams(windowRef.location.search).get('clerkTest') === '1';
    },
    async initialize() {
      return initialize();
    },
    async getSessionToken() {
      const clerk = await initialize();
      return getSessionToken(clerk);
    },
    async openSignIn() {
      const clerk = await initialize();
      await clerk.openSignIn();
    },
    async signOut(options = undefined) {
      const clerk = await initialize();
      clearUserSessionVerificationCache();
      if (options && typeof options === 'object') {
        await clerk.signOut(options);
        return;
      }
      await clerk.signOut();
    },
    async signInWithPassword(identifier, password) {
      const email = trim(identifier).toLowerCase();
      if (!email || typeof password !== 'string' || !password) {
        const error = new Error('Clerk administrator email and password are required.');
        error.code = 'admin_clerk_credentials_required';
        throw error;
      }
      const clerk = await initialize();
      if (!clerk?.client?.signIn || typeof clerk.client.signIn.create !== 'function') {
        const error = new Error('ClerkJS password sign-in API is not available.');
        error.code = 'admin_clerk_signin_unavailable';
        throw error;
      }
      await endActiveClerkSessionWithoutNavigation(clerk);
      pendingAdminClientTrust = null;
      try {
        const signIn = await clerk.client.signIn.create({
          strategy: 'password',
          identifier: email,
          password,
        });
        if (signIn?.status === 'needs_client_trust') {
          const factor = selectAdminClientTrustFactor(signIn);
          if (!factor) {
            throw createAdminClientTrustError(
              'admin_clerk_client_trust_factor_missing',
              'Clerk administrator sign-in requires Device Trust but did not return an email verification-code factor.'
            );
          }
          await sendAdminClientTrustChallenge(signIn, factor);
          pendingAdminClientTrust = {
            signIn,
            factor,
            strategy: factor.strategy,
            destination: factor.safeIdentifier || email,
            email,
          };
          return Object.freeze({
            status: 'needs_client_trust',
            clientTrustStrategy: factor.strategy,
            clientTrustDestination: factor.safeIdentifier || email,
          });
        }
        if (signIn?.status === 'needs_second_factor') {
          throw createAdminClientTrustError(
            'admin_clerk_second_factor_required',
            'Clerk administrator sign-in requires configured multi-factor authentication.'
          );
        }
        return finalizeAdminClerkSignIn(clerk, signIn, email);
      } catch (error) {
        pendingAdminClientTrust = null;
        clerk.client?.resetSignIn?.();
        throw error;
      }
    },
    async signInUserWithPassword(identifier, password) {
      return this.signInWithPassword(identifier, password);
    },
    async verifyUserClientTrust(code) {
      return this.verifyAdminClientTrust(code);
    },
    async resendUserClientTrust() {
      return this.resendAdminClientTrust();
    },
    async verifyAdminClientTrust(code) {
      const verificationCode = trim(code);
      if (!verificationCode) {
        throw createAdminClientTrustError(
          'admin_clerk_client_trust_code_required',
          'Clerk administrator Client Trust verification code is required.'
        );
      }
      const clerk = await initialize();
      const pending = pendingAdminClientTrust;
      const signIn = pending?.signIn;
      if (!pending || !signIn || signIn.status !== 'needs_client_trust') {
        throw createAdminClientTrustError(
          'admin_clerk_client_trust_expired',
          'Clerk administrator Client Trust challenge is no longer active. Sign in again.'
        );
      }

      let result = signIn;
      if (pending.strategy === 'email_code') {
        if (typeof signIn.mfa?.verifyEmailCode === 'function') {
          await signIn.mfa.verifyEmailCode({ code: verificationCode });
        } else if (typeof signIn.attemptSecondFactor === 'function') {
          result = await signIn.attemptSecondFactor({ strategy: 'email_code', code: verificationCode });
        } else {
          throw createAdminClientTrustError(
            'admin_clerk_client_trust_unavailable',
            'ClerkJS does not expose an email Client Trust verification API.'
          );
        }
      } else if (pending.strategy === 'phone_code') {
        if (typeof signIn.mfa?.verifyPhoneCode === 'function') {
          await signIn.mfa.verifyPhoneCode({ code: verificationCode });
        } else if (typeof signIn.attemptSecondFactor === 'function') {
          result = await signIn.attemptSecondFactor({ strategy: 'phone_code', code: verificationCode });
        } else {
          throw createAdminClientTrustError(
            'admin_clerk_client_trust_unavailable',
            'ClerkJS does not expose a phone Client Trust verification API.'
          );
        }
      } else {
        throw createAdminClientTrustError(
          'admin_clerk_client_trust_strategy_unsupported',
          `Unsupported Clerk administrator Client Trust strategy (${pending.strategy || 'unknown'}).`
        );
      }

      const completed = result?.status === 'complete' ? result : signIn;
      return finalizeAdminClerkSignIn(clerk, completed, pending.email);
    },
    async resendAdminClientTrust() {
      const pending = pendingAdminClientTrust;
      if (!pending?.signIn || pending.signIn.status !== 'needs_client_trust') {
        throw createAdminClientTrustError(
          'admin_clerk_client_trust_expired',
          'Clerk administrator Client Trust challenge is no longer active. Sign in again.'
        );
      }
      await sendAdminClientTrustChallenge(pending.signIn, pending.factor);
      return Object.freeze({
        status: 'needs_client_trust',
        clientTrustStrategy: pending.strategy,
        clientTrustDestination: pending.destination,
      });
    },
    async startUserSignupEmailVerification(identifier) {
      const email = trim(identifier).toLowerCase();
      if (!email) {
        const error = new Error('Signup email is required.');
        error.code = 'signup_email_required';
        throw error;
      }
      const clerk = await initialize();
      if (!clerk?.client?.signUp || typeof clerk.client.signUp.create !== 'function') {
        const error = new Error('Clerk signup email verification API is unavailable.');
        error.code = 'signup_email_verification_unavailable';
        throw error;
      }
      if (clerk.session) await clerk.signOut();
      clerk.client?.resetSignUp?.();
      pendingUserSignupEmailVerification = null;
      const signUp = await clerk.client.signUp.create({ emailAddress: email });
      if (typeof signUp?.prepareEmailAddressVerification !== 'function') {
        const error = new Error('Clerk signup email code preparation API is unavailable.');
        error.code = 'signup_email_verification_unavailable';
        throw error;
      }
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      pendingUserSignupEmailVerification = { signUp, email, verified: false };
      return Object.freeze({ status: 'verification_required', email });
    },
    async resendUserSignupEmailVerification() {
      const pending = pendingUserSignupEmailVerification;
      if (!pending?.signUp || typeof pending.signUp.prepareEmailAddressVerification !== 'function') {
        const error = new Error('Signup email verification challenge expired.');
        error.code = 'signup_email_verification_expired';
        throw error;
      }
      await pending.signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      return Object.freeze({ status: 'verification_required', email: pending.email });
    },
    async verifyUserSignupEmailVerification(code) {
      const verificationCode = trim(code);
      if (!/^\d{6}$/.test(verificationCode)) {
        const error = new Error('A 6-digit signup email verification code is required.');
        error.code = 'signup_email_verification_code_required';
        throw error;
      }
      const pending = pendingUserSignupEmailVerification;
      if (!pending?.signUp || typeof pending.signUp.attemptEmailAddressVerification !== 'function') {
        const error = new Error('Signup email verification challenge expired.');
        error.code = 'signup_email_verification_expired';
        throw error;
      }
      const result = await pending.signUp.attemptEmailAddressVerification({ code: verificationCode });
      const verification = result?.verifications?.emailAddress || pending.signUp?.verifications?.emailAddress || null;
      const unverifiedFields = Array.isArray(result?.unverifiedFields) ? result.unverifiedFields : [];
      const verified = verification?.status === 'verified' || (!unverifiedFields.includes('email_address') && !unverifiedFields.includes('emailAddress'));
      if (!verified) {
        const error = new Error('Clerk did not verify the signup email address.');
        error.code = 'signup_email_verification_incomplete';
        throw error;
      }
      pendingUserSignupEmailVerification = { ...pending, signUp: result || pending.signUp, verified: true };
      return Object.freeze({ status: 'verified', email: pending.email });
    },
    async completeUserSignupEmailVerification({ email: identifier, password, name = '' } = {}) {
      const email = trim(identifier).toLowerCase();
      const pending = pendingUserSignupEmailVerification;
      if (!pending?.signUp || !pending.verified || pending.email !== email) {
        const error = new Error('Signup email must be verified before account creation.');
        error.code = 'signup_email_verification_required';
        throw error;
      }
      if (typeof password !== 'string' || !password) {
        const error = new Error('Signup password is required.');
        error.code = 'signup_password_required';
        throw error;
      }
      const clerk = await initialize();
      if (typeof pending.signUp.update !== 'function') {
        const error = new Error('Clerk signup completion API is unavailable.');
        error.code = 'signup_completion_unavailable';
        throw error;
      }
      const result = await pending.signUp.update({
        password,
        ...(trim(name) ? { firstName: trim(name) } : {}),
      });
      if (result?.status !== 'complete' || !result?.createdSessionId || !result?.createdUserId) {
        const error = new Error(`Clerk signup is incomplete (${result?.status || 'unknown'}).`);
        error.code = 'signup_clerk_incomplete';
        error.missingFields = Array.isArray(result?.missingFields) ? result.missingFields : [];
        throw error;
      }
      await clerk.setActive({ session: result.createdSessionId });
      pendingUserSignupEmailVerification = null;
      return Object.freeze({
        status: 'complete',
        clerkUserId: result.createdUserId,
        sessionId: result.createdSessionId,
        email,
      });
    },
    async cancelUserSignupEmailVerification() {
      pendingUserSignupEmailVerification = null;
      const clerk = await initialize();
      clerk.client?.resetSignUp?.();
      return Object.freeze({ cancelled: true });
    },
    async signupVerifiedUser(input) {
      const clerk = await initialize();
      return requestVerifiedUserSignup({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, input });
    },
    async signupUserNative(password, input) {
      return requestNativeUserSignup({ apiBaseUrl: config.apiBaseUrl, fetchImpl, password, input });
    },
    async startUserPasswordReset(identifier) {
      const email = trim(identifier).toLowerCase();
      if (!email) throw new Error('Password reset email is required.');
      const clerk = await initialize();
      if (!clerk?.client?.signIn || typeof clerk.client.signIn.create !== 'function') throw new Error('Clerk password reset API is unavailable.');
      if (clerk.session) await clerk.signOut();
      pendingUserPasswordReset = null;
      clerk.client?.resetSignIn?.();
      const signIn = await clerk.client.signIn.create({ strategy: 'reset_password_email_code', identifier: email });
      pendingUserPasswordReset = { signIn, email };
      return Object.freeze({ status: signIn?.status || 'needs_first_factor', email });
    },
    async completeUserPasswordReset({ code, password }) {
      const verificationCode = trim(code);
      if (!verificationCode || typeof password !== 'string' || !password) throw new Error('Password reset code and new password are required.');
      const clerk = await initialize();
      const pending = pendingUserPasswordReset;
      if (!pending?.signIn || typeof pending.signIn.attemptFirstFactor !== 'function') {
        const error = new Error('Clerk password reset challenge expired.');
        error.code = 'user_password_reset_challenge_expired';
        throw error;
      }
      try {
        const result = await pending.signIn.attemptFirstFactor({
          strategy: 'reset_password_email_code',
          code: verificationCode,
          password,
        });
        if (result?.status !== 'complete') {
          const error = new Error(`Clerk password reset is incomplete (${result?.status || 'unknown'}).`);
          error.code = result?.status === 'needs_second_factor' ? 'user_password_reset_second_factor_required' : 'user_password_reset_incomplete';
          throw error;
        }
        if (clerk.session) await clerk.signOut().catch(() => {});
        pendingUserPasswordReset = null;
        clerk.client?.resetSignIn?.();
        return Object.freeze({ changed: true, status: 'complete', email: pending.email });
      } catch (error) {
        if (error?.code !== 'form_code_incorrect') {
          // keep the active challenge for code retry unless Clerk reset it.
        }
        throw error;
      }
    },
    async getUserClerkSession() {
      const clerk = await initialize();
      const sessionKey = trim(clerk?.session?.id);
      if (
        sessionKey &&
        userSessionVerificationCache?.sessionKey === sessionKey &&
        Date.now() < userSessionVerificationCache.expiresAt
      ) {
        return userSessionVerificationCache.payload;
      }
      if (
        sessionKey &&
        userSessionVerificationPending?.sessionKey === sessionKey
      ) {
        return userSessionVerificationPending.promise;
      }

      const promise = requestUserClerkSession({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl })
        .then((payload) => {
          if (sessionKey && trim(clerk?.session?.id) === sessionKey) {
            userSessionVerificationCache = {
              sessionKey,
              payload,
              expiresAt: Date.now() + USER_SESSION_VERIFICATION_CACHE_TTL_MS,
            };
          }
          return payload;
        })
        .finally(() => {
          if (userSessionVerificationPending?.promise === promise) {
            userSessionVerificationPending = null;
          }
        });

      if (sessionKey) {
        userSessionVerificationPending = { sessionKey, promise };
      }
      return promise;
    },
    async migrateUserToClerk(firebaseIdToken, password) {
      return requestUserClerkMigration({ apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, password });
    },
    async provisionUserClerkIdentity(firebaseIdToken, password) {
      return requestUserClerkProvision({ apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, password });
    },
    async verifyUserPassword(password) {
      const clerk = await initialize();
      return requestUserPasswordVerification({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, password });
    },
    async changeUserPassword(firebaseIdToken, currentPassword, newPassword) {
      const clerk = await initialize();
      return requestUserPasswordChange({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, currentPassword, newPassword });
    },
    async finalizeUserWithdrawal(firebaseIdToken, password) {
      const clerk = await initialize();
      return requestUserWithdrawalFinalize({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, password });
    },
    async resolveAdminLoginIdentifier(identifier, password) {
      return requestAdminLoginIdentifierResolve({ apiBaseUrl: config.apiBaseUrl, fetchImpl, identifier, password });
    },
    async getAdminClerkSession() {
      const clerk = await initialize();
      return requestAdminClerkSession({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async migrateAdminToClerk(firebaseIdToken, password) {
      return requestAdminClerkMigration({ apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, password });
    },
    async provisionAdminClerkIdentity(firebaseIdToken, targetFirebaseUid, password) {
      const clerk = await initialize();
      return requestAdminClerkProvision({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, targetFirebaseUid, password });
    },
    async findAccountRecoveryEmail(identity) {
      return requestAccountRecoveryEmail({ apiBaseUrl: config.apiBaseUrl, fetchImpl, identity });
    },
    async verifyPasswordResetIdentity(identity) {
      return requestPasswordResetVerification({ apiBaseUrl: config.apiBaseUrl, fetchImpl, identity });
    },
    async bootstrapUserSignup(firebaseIdToken, input) {
      return requestAccountLifecycleSignup({ apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, input });
    },
    async getUserTermsConsent({ includeLogs = true } = {}) {
      const clerk = await initialize();
      return requestUserTermsConsent({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, includeLogs });
    },
    async bootstrapUserTermsConsent(firebaseIdToken) {
      const clerk = await initialize();
      return requestUserTermsConsentBootstrap({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken });
    },
    async saveUserTermsConsent(input) {
      const clerk = await initialize();
      return requestUserTermsConsentSave({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, input });
    },
    async verifyBackendSession() {
      const clerk = await initialize();
      return requestAuthenticatedSession({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async getBackendUserIdentity() {
      const clerk = await initialize();
      return requestCurrentUserIdentity({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async syncBackendUserIdentity() {
      const clerk = await initialize();
      return requestCurrentUserIdentitySync({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async linkFirebaseLegacyAccount(firebaseIdToken) {
      const clerk = await initialize();
      return requestFirebaseLegacyLink({
        clerk,
        apiBaseUrl: config.apiBaseUrl,
        fetchImpl,
        firebaseIdToken,
      });
    },
    async getFirebaseLegacyLink() {
      const clerk = await initialize();
      return requestFirebaseLegacyLinkStatus({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async getMemberProfileReadCandidate() {
      const clerk = await initialize();
      return requestMemberProfileReadCandidate({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async writeMemberProfile(firebaseIdToken, profile) {
      const clerk = await initialize();
      return requestMemberProfileAuthorityWrite({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, profile });
    },
    async verifyMemberDirectory(firebaseIdToken) {
      const clerk = await initialize();
      return requestMemberDirectoryAuthorityVerification({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken });
    },
    async getAdminMembers(firebaseIdToken, options = {}) {
      const clerk = await initialize();
      return requestAdminMembersPostgresql({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, options });
    },
    async getAdminMemberRentalHistory(uid) {
      const clerk = await initialize();
      return requestAdminMemberRentalHistory({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, uid });
    },
    async createAdminMember(input = {}) {
      const clerk = await initialize();
      return requestAdminMemberCreatePostgresql({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, input });
    },
    async writeAdminMemberProfile(firebaseIdToken, firebaseUid, profile) {
      const clerk = await initialize();
      return requestAdminMemberProfileAuthorityWrite({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, firebaseUid, profile });
    },
    async writeAdminMemberStatus(firebaseIdToken, firebaseUid, status) {
      const clerk = await initialize();
      return requestAdminMemberStatusAuthorityWrite({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, firebaseUid, status });
    },
    async changeAdminMemberPassword(firebaseUid, newPassword) {
      const clerk = await initialize();
      return requestAdminMemberPasswordChange({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseUid, newPassword });
    },
    async rejectAdminPendingMember(firebaseUid) {
      const clerk = await initialize();
      return requestAdminMemberLifecycleMutation({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseUid, operation: 'reject' });
    },
    async retireAdminMember(firebaseUid) {
      const clerk = await initialize();
      return requestAdminMemberLifecycleMutation({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseUid, operation: 'retire' });
    },
    async purgeAdminRetiredMember(firebaseUid) {
      const clerk = await initialize();
      return requestAdminMemberLifecycleMutation({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseUid, operation: 'purge' });
    },
    async getAdminMemberDirectory() {
      const clerk = await initialize();
      return requestAdminMemberDirectoryPostgresql({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async syncAdminMemberDirectory({ entries = [], version = 0, teams = [], settings = {} } = {}) {
      const clerk = await initialize();
      return requestAdminMemberDirectoryPostgresqlSync({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, entries, version, teams, settings });
    },
    async auditAdminMemberDirectory() {
      const clerk = await initialize();
      return requestAdminMemberDirectoryAuditPostgresql({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async restoreAdminMemberDirectoryMismatches() {
      const clerk = await initialize();
      return requestAdminMemberDirectoryRestorePostgresql({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async getAdminMemberTermsConsent(memberKey) {
      const clerk = await initialize();
      return requestAdminMemberTermsConsent({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, memberKey });
    },
    async bootstrapAdminIdentityRegistry(firebaseIdToken) {
      const clerk = await initialize();
      return requestAdminIdentityRegistryBootstrap({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken });
    },
    async bootstrapAdminRentalRequests(firebaseIdToken) {
      const clerk = await initialize();
      return requestAdminRentalRequestBootstrap({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken });
    },
    async getAdminRentalRequests(firebaseIdToken, options) {
      const clerk = await initialize();
      return requestAdminRentalRequests({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, options });
    },
    async getAdminRentalDashboard(firebaseIdToken, referenceDate) {
      const clerk = await initialize();
      return requestAdminRentalDashboard({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, referenceDate });
    },
    async getAdminAccountsPostgresql() {
      const clerk = await initialize();
      return requestAdminAccountsPostgresql({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async createAdminAccountPostgresql(input) {
      const clerk = await initialize();
      return requestAdminAccountMutation({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, method: 'POST', path: '/api/admin/accounts', body: input, expectedOperation: 'create' });
    },
    async updateAdminAccountPostgresql(key, input) {
      const clerk = await initialize();
      return requestAdminAccountMutation({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, method: 'PUT', path: `/api/admin/accounts/${encodeURIComponent(key)}`, body: input, expectedOperation: 'update' });
    },
    async changeAdminAccountPasswordPostgresql(key, newPassword) {
      const clerk = await initialize();
      return requestAdminAccountPasswordChange({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, key, newPassword });
    },
    async setAdminAccountLockPostgresql(key, locked) {
      const clerk = await initialize();
      return requestAdminAccountMutation({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, method: 'POST', path: `/api/admin/accounts/${encodeURIComponent(key)}/lock`, body: { locked }, expectedOperation: locked ? 'lock' : 'unlock' });
    },
    async deleteAdminAccountPostgresql(key) {
      const clerk = await initialize();
      return requestAdminAccountMutation({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, method: 'DELETE', path: `/api/admin/accounts/${encodeURIComponent(key)}`, expectedOperation: 'delete' });
    },
    async getUserSessionPolicyPostgresql() {
      return requestSystemConfiguration({ apiBaseUrl: config.apiBaseUrl, fetchImpl, key: 'user-session-policy', admin: false });
    },
    async saveAdminRentalConfigSettings(settings = {}) {
      const clerk = await initialize();
      const payload = await requestAdminRentalConfigSettingsPatch({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, settings });
      const { publishSiteContentInvalidation } = await import('../features/content/siteContentCutover.js');
      publishSiteContentInvalidation('rental-config');
      return payload;
    },
    async saveAdminSignupPolicy(policy = {}) {
      const clerk = await initialize();
      return requestAdminSignupPolicyPatch({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, policy });
    },
    async getAdminSystemSettingsAudit(limit = 50) {
      const clerk = await initialize();
      return requestAdminSystemSettingsAudit({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, limit });
    },
    async appendAdminSystemSettingsAudit(audit = {}) {
      const clerk = await initialize();
      return requestAdminSystemSettingsAuditWrite({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, audit });
    },
    async getAdminClerkDeviceTrust() {
      const clerk = await initialize();
      return requestAdminClerkDeviceTrust({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async saveAdminClerkDeviceTrust(enabled) {
      const clerk = await initialize();
      return requestAdminClerkDeviceTrustWrite({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, enabled });
    },
    async getAdminSystemConfiguration(key) {
      const clerk = await initialize();
      return requestSystemConfiguration({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, key, admin: true });
    },
    async saveAdminSystemConfiguration(key, payload) {
      const clerk = await initialize();
      return requestSystemConfigurationWrite({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, key, payload });
    },
    async getAdminSystemDataOverview() {
      const clerk = await initialize();
      return requestAdminSystemDataOverview({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async runAdminSystemDataIntegrity() {
      const clerk = await initialize();
      return requestAdminSystemDataIntegrity({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async repairAdminSystemDataAssetReferences() {
      const clerk = await initialize();
      return requestAdminSystemDataAssetRepair({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async reconcileAdminSystemDataAssetCatalogMetadata() {
      const clerk = await initialize();
      return requestAdminSystemDataCatalogMetadataReconcile({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async exportAdminSystemData(options = {}) {
      const clerk = await initialize();
      return requestAdminSystemDataExport({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, options });
    },
    async scanAdminSystemDataReset(scopes = []) {
      const clerk = await initialize();
      return requestAdminSystemDataResetScan({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, scopes });
    },
    async resetAdminSystemData({ scopes = [], confirmText = '', backupConfirmed = false } = {}) {
      const clerk = await initialize();
      return requestAdminSystemDataReset({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, scopes, confirmText, backupConfirmed });
    },
    async getAssetCatalog() {
      return requestAssetCatalog({ apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async bootstrapAdminAssets(firebaseIdToken) {
      const clerk = await initialize();
      return requestAdminAssetBootstrap({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken });
    },
    async createAdminAsset(firebaseIdToken, asset) {
      const clerk = await initialize();
      return requestAdminAssetCreate({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, asset });
    },
    async editAdminAsset(firebaseIdToken, assetId, asset) {
      const clerk = await initialize();
      return requestAdminAssetEdit({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, assetId, asset });
    },
    async deleteAdminAsset(firebaseIdToken, assetId) {
      const clerk = await initialize();
      return requestAdminAssetDelete({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, assetId });
    },
    async bulkCreateAdminAssets(firebaseIdToken, assets) {
      const clerk = await initialize();
      return requestAdminAssetBulkCreate({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, assets });
    },
    async saveAdminAssetCategories(firebaseIdToken, categories, renameMap) {
      const clerk = await initialize();
      return requestAdminAssetCategories({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, categories, renameMap });
    },
    async syncAdminRentalRequest(firebaseIdToken, requestId) {
      const clerk = await initialize();
      return requestAdminRentalRequestSync({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId });
    },
    async getAdminRentalRequestEvents(firebaseIdToken, requestId) {
      const clerk = await initialize();
      return requestAdminRentalRequestEvents({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId });
    },
    async editAdminRentalRequest(firebaseIdToken, requestId, form) {
      const clerk = await initialize();
      return requestAdminRentalRequestEdit({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId, form });
    },
    async saveAdminRentalRequestMemo(firebaseIdToken, requestId, memo) {
      const clerk = await initialize();
      return requestAdminRentalRequestMemo({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId, memo });
    },
    async restoreAdminRentalRequestStatus(firebaseIdToken, requestId, status, restoreReason) {
      const clerk = await initialize();
      return requestAdminRentalRequestRestore({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId, status, restoreReason });
    },
    async changeAdminRentalRequestStatus(firebaseIdToken, requestId, status) {
      const clerk = await initialize();
      return requestAdminRentalRequestStatusChange({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId, status });
    },
    async getCurrentUserRentalRestriction() {
      const clerk = await initialize();
      return requestCurrentUserRentalRestriction({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async createRentalRequest(request) {
      const clerk = await initialize();
      return requestRentalRequestCreate({
        clerk,
        apiBaseUrl: config.apiBaseUrl,
        fetchImpl,
        request,
      });
    },
    async editRentalRequest(firebaseIdToken, requestId, form) {
      const clerk = await initialize();
      return requestRentalRequestUserEdit({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId, ...form });
    },
    async cancelRentalRequest(firebaseIdToken, requestId) {
      const clerk = await initialize();
      return requestRentalRequestUserCancel({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId });
    },
    async extendRentalRequest(firebaseIdToken, requestId) {
      const clerk = await initialize();
      return requestRentalRequestUserExtend({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId });
    },
    async reviewAdminRentalUserAction(firebaseIdToken, requestId, approved) {
      const clerk = await initialize();
      return requestAdminRentalRequestMutationAction({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, requestId, action: 'user-action-review', body: { approved: Boolean(approved) } });
    },
    async getRentalRequestReadCandidate() {
      const clerk = await initialize();
      return requestRentalRequestReadCandidate({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
  });
};

const browserEnv = import.meta.env || {};

export const clerkStagingClient =
  typeof window !== 'undefined' && typeof document !== 'undefined'
    ? createClerkStagingClient({
        env: browserEnv,
        windowRef: window,
        documentRef: document,
        fetchImpl: window.fetch.bind(window),
      })
    : Object.freeze({
        config: Object.freeze({ enabled: false, mode: 'server' }),
        isDiagnosticsRequested: () => false,
        initialize: async () => null,
        signOut: async () => {},
        signInWithPassword: async () => { throw new Error('Clerk browser client is unavailable.'); },
        signInUserWithPassword: async () => { throw new Error('Clerk browser client is unavailable.'); },
        bootstrapUserSignup: async () => { throw new Error('Clerk browser client is unavailable.'); },
        startUserSignupEmailVerification: async () => { throw new Error('Clerk browser client is unavailable.'); },
        resendUserSignupEmailVerification: async () => { throw new Error('Clerk browser client is unavailable.'); },
        verifyUserSignupEmailVerification: async () => { throw new Error('Clerk browser client is unavailable.'); },
        completeUserSignupEmailVerification: async () => { throw new Error('Clerk browser client is unavailable.'); },
        cancelUserSignupEmailVerification: async () => ({ cancelled: true }),
        signupVerifiedUser: async () => { throw new Error('Clerk browser client is unavailable.'); },
        signupUserNative: async () => { throw new Error('Clerk browser client is unavailable.'); },
        startUserPasswordReset: async () => { throw new Error('Clerk browser client is unavailable.'); },
        completeUserPasswordReset: async () => { throw new Error('Clerk browser client is unavailable.'); },
        getUserTermsConsent: async () => { throw new Error('Clerk browser client is unavailable.'); },
        bootstrapUserTermsConsent: async () => { throw new Error('Clerk browser client is unavailable.'); },
        saveUserTermsConsent: async () => { throw new Error('Clerk browser client is unavailable.'); },
        verifyUserClientTrust: async () => { throw new Error('Clerk browser client is unavailable.'); },
        resendUserClientTrust: async () => { throw new Error('Clerk browser client is unavailable.'); },
        verifyAdminClientTrust: async () => { throw new Error('Clerk browser client is unavailable.'); },
        resendAdminClientTrust: async () => { throw new Error('Clerk browser client is unavailable.'); },
        getUserClerkSession: async () => { throw new Error('Clerk browser client is unavailable.'); },
        migrateUserToClerk: async () => { throw new Error('Clerk browser client is unavailable.'); },
        provisionUserClerkIdentity: async () => { throw new Error('Clerk browser client is unavailable.'); },
        verifyUserPassword: async () => { throw new Error('Clerk browser client is unavailable.'); },
        changeUserPassword: async () => { throw new Error('Clerk browser client is unavailable.'); },
        finalizeUserWithdrawal: async () => { throw new Error('Clerk browser client is unavailable.'); },
        resolveAdminLoginIdentifier: async () => { throw new Error('Clerk browser client is unavailable.'); },
        getAdminClerkSession: async () => { throw new Error('Clerk browser client is unavailable.'); },
        migrateAdminToClerk: async () => { throw new Error('Clerk browser client is unavailable.'); },
        provisionAdminClerkIdentity: async () => { throw new Error('Clerk browser client is unavailable.'); },
        findAccountRecoveryEmail: async () => { throw new Error('Clerk browser client is unavailable.'); },
        verifyPasswordResetIdentity: async () => { throw new Error('Clerk browser client is unavailable.'); },
      });
