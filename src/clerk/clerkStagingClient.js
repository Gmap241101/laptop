const CLERK_UI_MAJOR = '1';
const CLERK_JS_MAJOR = '6';

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeBoolean = (value) => trim(value).toLowerCase() === 'true';

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
  const response = await fetchImpl(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    cache: 'no-store',
    ...(body === undefined ? {} : { body }),
  });
  return { response, payload: await parseJsonResponse(response) };
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
  if (!token) throw new Error('Firebase admin sign-in is required before synchronizing admin rental requests.');
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
  if (!token) throw new Error('Firebase admin sign-in is required before reading PostgreSQL rental requests.');
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
  if (!token) throw new Error('Firebase admin sign-in is required before reading the PostgreSQL rental dashboard.');
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
  if (!token) throw new Error('Firebase admin sign-in is required before changing a PostgreSQL rental request.');
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
  if (!token || !id) throw new Error('Firebase admin sign-in and rental request ID are required.');
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
  if (!token || !id) throw new Error('Firebase admin sign-in and rental request ID are required.');
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
  if (!token) throw new Error('Firebase admin sign-in is required before changing a PostgreSQL rental request.');
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

export const requestRentalRequestCreate = async ({ clerk, apiBaseUrl, fetchImpl, firebaseIdToken, request }) => {
  const token = trim(firebaseIdToken);
  if (!token) throw new Error('Firebase sign-in is required before creating a PostgreSQL rental request.');
  const { response, payload } = await requestWithSession({
    clerk,
    apiBaseUrl,
    fetchImpl,
    path: '/api/users/me/rental-requests',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Authorization': `Bearer ${token}`,
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
  if (!payload?.authenticated || payload?.rentalRequestCandidate?.source !== 'postgresql-shadow' || !Array.isArray(payload?.rentalRequestCandidate?.requests)) {
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
      });
