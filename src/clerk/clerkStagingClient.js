const CLERK_UI_MAJOR = '1';
const CLERK_JS_MAJOR = '6';

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeBoolean = (value) => trim(value).toLowerCase() === 'true';
const firebaseRuntimeRetired = () => normalizeBoolean(import.meta.env?.VITE_FIREBASE_RUNTIME_DISABLED);

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

  const token = await session.getToken();
  if (!token) throw new Error('Clerk did not return a session token.');
  return token;
};

const requestWithSession = async ({ clerk, apiBaseUrl, fetchImpl, path, method = 'GET', headers = {}, body }) => {
  const token = await getSessionToken(clerk);
  const authorityHeaders = { ...headers };
  if (firebaseRuntimeRetired()) delete authorityHeaders['X-Firebase-Authorization'];
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

const optionalFirebaseAuthorizationHeader = (firebaseIdToken) => {
  if (firebaseRuntimeRetired()) return {};
  const token = trim(firebaseIdToken);
  return token ? { 'X-Firebase-Authorization': `Bearer ${token}` } : {};
};

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

const requestWithFirebaseAuthorization = async ({ apiBaseUrl, fetchImpl, path, firebaseIdToken, body }) => {
  const token = trim(firebaseIdToken);
  if (!token) throw new Error('Firebase administrator sign-in is required for this compatibility operation.');
  const response = await fetchImpl(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...optionalFirebaseAuthorizationHeader(token),
    },
    cache: 'no-store',
    body: JSON.stringify(body || {}),
  });
  return { response, payload: await parseJsonResponse(response) };
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

export const requestUserTermsConsent = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/users/me/terms-consent' });
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
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
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
    headers: {
      'Content-Type': 'application/json',
      ...optionalFirebaseAuthorizationHeader(token),
    },
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
      'X-Firebase-Authorization': `Bearer ${token}`,
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
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
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

  if (response.status === 404 && payload?.error === 'member_shadow_not_found') return null;
  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Member profile read candidate lookup failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (
    !payload?.authenticated ||
    payload?.readCandidate?.source !== 'postgresql-shadow' ||
    !payload?.readCandidate?.profile?.uid
  ) {
    throw new Error('Backend returned an invalid member profile read candidate response.');
  }
  return payload;
};

export const requestMemberShadowStatus = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/legacy/member-shadow',
  });

  if (response.status === 404 && payload?.error === 'member_shadow_not_found') return null;
  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Legacy member shadow lookup failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.memberShadow?.firebaseUid) {
    throw new Error('Backend returned an invalid legacy member-shadow response.');
  }
  return payload;
};

export const requestMemberShadowSync = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token) throw new Error('Firebase sign-in is required before synchronizing the legacy member shadow.');

  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/legacy/member-shadow/sync',
    method: 'POST',
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Legacy member shadow synchronization failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.synchronized || !payload?.memberShadow?.firebaseUid) {
    throw new Error('Backend returned an invalid member-shadow synchronization response.');
  }
  return payload;
};

export const requestMemberShadowComparison = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token) throw new Error('Firebase sign-in is required before comparing the legacy member shadow.');

  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/legacy/member-shadow/compare',
    method: 'POST',
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
  });

  if (response.status === 404 && payload?.error === 'member_shadow_not_found') return null;
  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Legacy member shadow comparison failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || typeof payload?.comparison?.equivalent !== 'boolean') {
    throw new Error('Backend returned an invalid member-shadow comparison response.');
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
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
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
  const query = params.toString();
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: `/api/admin/rental-requests${query ? `?${query}` : ''}`,
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
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
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
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
      'X-Firebase-Authorization': `Bearer ${token}`,
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
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
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
  return payload;
};

export const requestAdminRentalRequestEvents = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, requestId }) => {
  const token = trim(firebaseIdToken);
  const id = trim(requestId);
  if ((!token && !firebaseRuntimeRetired()) || !id) throw new Error('Firebase admin sign-in and rental request ID are required.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl,
    path: `/api/admin/rental-requests/${encodeURIComponent(id)}/events`,
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
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
      'X-Firebase-Authorization': `Bearer ${token}`,
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
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
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

export const requestAdminMemberProfileAuthorityWrite = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, firebaseUid, profile }) => {
  const token = trim(firebaseIdToken); const uid = trim(firebaseUid);
  if ((!token && !firebaseRuntimeRetired()) || !uid) throw new Error('Firebase admin sign-in and member UID are required.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: `/api/admin/members/${encodeURIComponent(uid)}/profile`, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Firebase-Authorization': `Bearer ${token}` },
    body: JSON.stringify(profile || {}),
  });
  if (!response.ok) { const error = new Error(`Admin PostgreSQL member profile write failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminMemberProfileWrite?.authority !== 'postgresql') throw new Error('Backend returned an invalid admin member profile write response.');
  return payload;
};

export const requestAdminMemberDirectoryPostgresqlSync = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before synchronizing the PostgreSQL member directory.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: '/api/admin/member-directory/sync', method: 'POST',
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
  });
  if (!response.ok) { const error = new Error(`Admin PostgreSQL member directory sync failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.memberDirectorySync?.target !== 'postgresql-member-directory') throw new Error('Backend returned an invalid member directory synchronization response.');
  return payload;
};

export const requestAdminMemberStatusAuthorityWrite = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, firebaseUid, status }) => {
  const token = trim(firebaseIdToken); const uid = trim(firebaseUid);
  if ((!token && !firebaseRuntimeRetired()) || !uid) throw new Error('Firebase admin sign-in and member UID are required.');
  const { response, payload } = await requestWithSession({
    clerk, apiBaseUrl, fetchImpl, path: `/api/admin/members/${encodeURIComponent(uid)}/status`, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Firebase-Authorization': `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) { const error = new Error(`Admin PostgreSQL member status write failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminMemberStatusWrite?.authority !== 'postgresql') throw new Error('Backend returned an invalid admin member status write response.');
  return payload;
};

export const requestAdminIdentityRegistryBootstrap = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before synchronizing the PostgreSQL admin identity registry.');
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/identity-registry/bootstrap', method: 'POST', headers: { 'X-Firebase-Authorization': `Bearer ${token}` } });
  if (!response.ok) { const error = new Error(`Admin identity registry bootstrap failed with HTTP ${response.status}.`); error.status=response.status; error.code=payload?.error||null; throw error; }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminIdentityRegistry?.target !== 'postgresql-admin-registry') throw new Error('Backend returned an invalid admin identity registry response.');
  return payload;
};

export const requestAssetCatalog = async ({ apiBaseUrl, fetchImpl }) => {
  const response = await fetchImpl(`${apiBaseUrl}/api/assets/catalog`, {
    method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store',
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const error = new Error(`PostgreSQL asset catalog read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (payload?.assetCatalog?.source !== 'postgresql' || !Array.isArray(payload?.assetCatalog?.assets) || !Array.isArray(payload?.assetCatalog?.categories)) {
    throw new Error('Backend returned an invalid PostgreSQL asset catalog response.');
  }
  return payload;
};

export const requestAdminAssetBootstrap = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before synchronizing PostgreSQL assets.');
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path: '/api/admin/assets/bootstrap', method: 'POST', headers: { 'X-Firebase-Authorization': `Bearer ${token}` } });
  if (!response.ok) {
    const error = new Error(`Admin asset bootstrap failed with HTTP ${response.status}.`); error.status = response.status; error.code = payload?.error || null; throw error;
  }
  if (!payload?.authenticated || !payload?.authorized || payload?.adminAssetBootstrap?.target !== 'postgresql') throw new Error('Backend returned an invalid admin asset bootstrap response.');
  return payload;
};

const requestAdminAssetMutation = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, path, body = {}, expectedOperation }) => {
  const token = trim(firebaseIdToken);
  if (!token && !firebaseRuntimeRetired()) throw new Error('Firebase admin sign-in is required before changing PostgreSQL assets.');
  const { response, payload } = await requestWithSession({ clerk, apiBaseUrl, fetchImpl, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Firebase-Authorization': `Bearer ${token}` }, body: JSON.stringify(body) });
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

export const requestRentalRequestCreate = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, request }) => {
  const token = trim(firebaseIdToken);
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/rental-requests',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...optionalFirebaseAuthorizationHeader(token),
    },
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
  if (!payload?.authenticated || !['postgresql-shadow', 'postgresql-authoritative'].includes(candidateSource) || !Array.isArray(payload?.rentalRequestCandidate?.requests)) {
    throw new Error('Backend returned an invalid rental request read candidate response.');
  }
  return payload;
};

export const requestRentalRequestShadowSync = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token) throw new Error('Firebase sign-in is required before synchronizing rental requests.');
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/legacy/rental-request-shadows/sync',
    method: 'POST',
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Rental request shadow synchronization failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || !payload?.synchronized || payload?.rentalRequestCandidate?.source !== 'postgresql-shadow' || !Array.isArray(payload?.rentalRequestCandidate?.requests)) {
    throw new Error('Backend returned an invalid rental request shadow synchronization response.');
  }
  return payload;
};

export const requestRentalRequestShadowComparison = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken }) => {
  const token = trim(firebaseIdToken);
  if (!token) throw new Error('Firebase sign-in is required before comparing rental request shadows.');
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/legacy/rental-request-shadows/compare',
    method: 'POST',
    headers: { 'X-Firebase-Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    const code = payload?.error ? ` (${payload.error})` : '';
    const error = new Error(`Rental request shadow comparison failed with HTTP ${response.status}${code}.`);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }
  if (!payload?.authenticated || typeof payload?.comparison?.equivalent !== 'boolean') {
    throw new Error('Backend returned an invalid rental request shadow comparison response.');
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

  const createAdminClientTrustError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };

  const selectAdminClientTrustFactor = (signIn) => {
    const factors = Array.isArray(signIn?.supportedSecondFactors)
      ? signIn.supportedSecondFactors
      : [];
    return factors.find((factor) => factor?.strategy === 'email_code')
      || factors.find((factor) => factor?.strategy === 'phone_code')
      || factors.find((factor) => factor?.strategy === 'email_link')
      || null;
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
    async openSignIn() {
      const clerk = await initialize();
      await clerk.openSignIn();
    },
    async signOut() {
      const clerk = await initialize();
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
      if (clerk.session) await clerk.signOut();
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
              'Clerk administrator sign-in requires Client Trust but did not return a supported verification factor.'
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
      return requestUserClerkSession({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
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
    async getUserTermsConsent() {
      const clerk = await initialize();
      return requestUserTermsConsent({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
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
    async getMemberShadow() {
      const clerk = await initialize();
      return requestMemberShadowStatus({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
    async syncMemberShadow(firebaseIdToken) {
      const clerk = await initialize();
      return requestMemberShadowSync({
        clerk,
        apiBaseUrl: config.apiBaseUrl,
        fetchImpl,
        firebaseIdToken,
      });
    },
    async compareMemberShadow(firebaseIdToken) {
      const clerk = await initialize();
      return requestMemberShadowComparison({
        clerk,
        apiBaseUrl: config.apiBaseUrl,
        fetchImpl,
        firebaseIdToken,
      });
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
    async writeAdminMemberProfile(firebaseIdToken, firebaseUid, profile) {
      const clerk = await initialize();
      return requestAdminMemberProfileAuthorityWrite({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, firebaseUid, profile });
    },
    async writeAdminMemberStatus(firebaseIdToken, firebaseUid, status) {
      const clerk = await initialize();
      return requestAdminMemberStatusAuthorityWrite({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken, firebaseUid, status });
    },
    async syncAdminMemberDirectory(firebaseIdToken) {
      const clerk = await initialize();
      return requestAdminMemberDirectoryPostgresqlSync({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl, firebaseIdToken });
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
    async createRentalRequest(firebaseIdToken, request) {
      const clerk = await initialize();
      return requestRentalRequestCreate({
        clerk,
        apiBaseUrl: config.apiBaseUrl,
        fetchImpl,
        firebaseIdToken,
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
    async syncRentalRequestShadow(firebaseIdToken) {
      const clerk = await initialize();
      return requestRentalRequestShadowSync({
        clerk,
        apiBaseUrl: config.apiBaseUrl,
        fetchImpl,
        firebaseIdToken,
      });
    },
    async compareRentalRequestShadow(firebaseIdToken) {
      const clerk = await initialize();
      return requestRentalRequestShadowComparison({
        clerk,
        apiBaseUrl: config.apiBaseUrl,
        fetchImpl,
        firebaseIdToken,
      });
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
        getAdminClerkSession: async () => { throw new Error('Clerk browser client is unavailable.'); },
        migrateAdminToClerk: async () => { throw new Error('Clerk browser client is unavailable.'); },
        provisionAdminClerkIdentity: async () => { throw new Error('Clerk browser client is unavailable.'); },
        findAccountRecoveryEmail: async () => { throw new Error('Clerk browser client is unavailable.'); },
        verifyPasswordResetIdentity: async () => { throw new Error('Clerk browser client is unavailable.'); },
      });
