import { randomUUID } from 'node:crypto';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const writeJson = (response, statusCode, payload, extraHeaders = {}) => {
  response.writeHead(statusCode, { ...JSON_HEADERS, ...extraHeaders });
  response.end(JSON.stringify(payload));
};

const buildCorsHeaders = (request, allowedOrigins) => {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) {
    return { Vary: 'Origin' };
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Request-Id,X-Firebase-Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
};

const writeUnauthorized = (response, basePayload, headers) => {
  writeJson(
    response,
    401,
    {
      ...basePayload,
      authenticated: false,
      error: 'unauthorized',
    },
    { ...headers, 'WWW-Authenticate': 'Bearer' },
  );
};

const sanitizeUserIdentity = (user) => ({
  id: user.id,
  clerkUserId: user.clerkUserId,
  primaryEmail: user.primaryEmail,
  primaryEmailVerified: user.primaryEmailVerified,
  displayName: user.displayName,
  firstName: user.firstName,
  lastName: user.lastName,
  imageUrl: user.imageUrl,
  lastSyncedAt: user.lastSyncedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const sanitizeFirebaseLink = (link) => ({
  appUserId: link.appUserId,
  firebaseUid: link.firebaseUid,
  firebaseEmail: link.firebaseEmail,
  firebaseEmailVerified: link.firebaseEmailVerified,
  firebaseSignInProvider: link.firebaseSignInProvider,
  linkedAt: link.linkedAt,
  lastVerifiedAt: link.lastVerifiedAt,
  updatedAt: link.updatedAt,
});

const sanitizeMemberShadow = (shadow) => ({
  appUserId: shadow.appUserId,
  firebaseUid: shadow.firebaseUid,
  uid: shadow.uid,
  email: shadow.email,
  maskedEmail: shadow.maskedEmail,
  name: shadow.name,
  team: shadow.team,
  phone: shadow.phone,
  status: shadow.status,
  directoryMemberId: shadow.directoryMemberId,
  directoryVerifiedVersion: shadow.directoryVerifiedVersion,
  profileRequiredReason: shadow.profileRequiredReason,
  rejoinedAccount: shadow.rejoinedAccount,
  termsConsentRevision: shadow.termsConsentRevision,
  termsConsentPolicyVersion: shadow.termsConsentPolicyVersion,
  identityKey: shadow.identityKey,
  recoveryKey: shadow.recoveryKey,
  previousAccountUids: shadow.previousAccountUids,
  sourceHash: shadow.sourceHash,
  sourceCreatedAt: shadow.sourceCreatedAt,
  sourceUpdatedAt: shadow.sourceUpdatedAt,
  syncedAt: shadow.syncedAt,
  updatedAt: shadow.updatedAt,
});

const sanitizeMemberComparison = (comparison) => ({
  equivalent: Boolean(comparison.equivalent),
  sourceHash: comparison.sourceHash,
  shadowHash: comparison.shadowHash,
  changedFields: comparison.changedFields,
  sourceUpdatedAt: comparison.sourceUpdatedAt,
  shadowSyncedAt: comparison.shadowSyncedAt,
});

const sanitizeMemberProfileReadCandidate = (shadow) => ({
  source: 'postgresql-shadow',
  authoritative: false,
  firebaseUid: shadow.firebaseUid,
  profile: {
    uid: shadow.uid,
    email: shadow.email,
    maskedEmail: shadow.maskedEmail,
    name: shadow.name,
    team: shadow.team,
    phone: shadow.phone,
    status: shadow.status,
    directoryMemberId: shadow.directoryMemberId,
    directoryVerifiedVersion: shadow.directoryVerifiedVersion,
    profileRequiredReason: shadow.profileRequiredReason,
    rejoinedAccount: shadow.rejoinedAccount,
    termsConsentRevision: shadow.termsConsentRevision,
    termsConsentPolicyVersion: shadow.termsConsentPolicyVersion,
    identityKey: shadow.identityKey,
    recoveryKey: shadow.recoveryKey,
    previousAccountUids: shadow.previousAccountUids,
  },
  sourceHash: shadow.sourceHash,
  sourceUpdatedAt: shadow.sourceUpdatedAt,
  shadowSyncedAt: shadow.syncedAt,
});

export const createRequestHandler = ({
  config,
  databaseCheck,
  authenticateRequest,
  authenticateFirebaseRequest,
  userIdentityService,
  firebaseLinkService,
  memberShadowService,
}) => {
  if (typeof databaseCheck !== 'function') {
    throw new TypeError('databaseCheck must be a function.');
  }
  if (typeof authenticateRequest !== 'function') {
    throw new TypeError('authenticateRequest must be a function.');
  }
  if (typeof authenticateFirebaseRequest !== 'function') {
    throw new TypeError('authenticateFirebaseRequest must be a function.');
  }
  if (!userIdentityService || typeof userIdentityService.getCurrent !== 'function' || typeof userIdentityService.syncCurrent !== 'function') {
    throw new TypeError('userIdentityService getCurrent/syncCurrent methods are required.');
  }
  if (!firebaseLinkService || typeof firebaseLinkService.getCurrent !== 'function' || typeof firebaseLinkService.linkCurrent !== 'function') {
    throw new TypeError('firebaseLinkService getCurrent/linkCurrent methods are required.');
  }
  if (
    !memberShadowService ||
    typeof memberShadowService.getCurrent !== 'function' ||
    typeof memberShadowService.getCurrentByFirebaseIdentity !== 'function' ||
    typeof memberShadowService.readCurrentSourceByFirebaseIdentity !== 'function' ||
    typeof memberShadowService.syncCurrent !== 'function' ||
    typeof memberShadowService.compareCurrent !== 'function'
  ) {
    throw new TypeError('memberShadowService getCurrent/getCurrentByFirebaseIdentity/readCurrentSourceByFirebaseIdentity/syncCurrent/compareCurrent methods are required.');
  }

  const basePayload = {
    service: config.serviceName,
    environment: config.appEnv,
    version: config.serviceVersion,
  };

  const authenticate = async (request, response, headers, requestId) => {
    try {
      return await authenticateRequest(request);
    } catch (error) {
      console.warn('[auth] Clerk session rejected', {
        requestId,
        code: error?.code || 'authentication_failed',
      });
      writeUnauthorized(response, basePayload, headers);
      return null;
    }
  };


  const authenticateFirebase = async (request, response, headers, requestId) => {
    try {
      return await authenticateFirebaseRequest(request);
    } catch (error) {
      console.warn('[auth] Firebase session rejected', {
        requestId,
        code: error?.code || 'firebase_authentication_failed',
      });
      if (['firebase_certificates_unavailable', 'firebase_certificates_invalid'].includes(error?.code)) {
        writeJson(response, 503, { ...basePayload, error: 'legacy_firebase_verification_unavailable' }, headers);
      } else {
        writeJson(response, 401, { ...basePayload, authenticated: true, error: 'legacy_firebase_unauthorized' }, headers);
      }
      return null;
    }
  };

  return async (request, response) => {
    const requestId = request.headers['x-request-id'] || randomUUID();
    const corsHeaders = buildCorsHeaders(request, config.corsAllowedOrigins);
    const headers = { ...corsHeaders, 'X-Request-Id': requestId };

    if (request.method === 'OPTIONS') {
      response.writeHead(204, headers);
      response.end();
      return;
    }

    const url = new URL(request.url || '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/') {
      writeJson(
        response,
        200,
        {
          ...basePayload,
          status: 'running',
          health: '/health',
          liveness: '/health/live',
          authSession: '/api/auth/session',
          currentUser: '/api/users/me',
          syncCurrentUser: '/api/users/me/sync',
          firebaseLink: '/api/users/me/legacy/firebase',
          memberShadow: '/api/users/me/legacy/member-shadow',
          memberProfileReadCandidate: '/api/users/me/member-profile-candidate',
          memberProfileCutoverCandidate: '/api/legacy/member-profile-cutover-candidate',
          memberProfileFirestoreFallback: '/api/legacy/member-profile-firestore-fallback',
        },
        headers,
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health/live') {
      writeJson(
        response,
        200,
        {
          ...basePayload,
          status: 'ok',
          timestamp: new Date().toISOString(),
        },
        headers,
      );
      return;
    }

    if (
      request.method === 'GET' &&
      (url.pathname === '/health' || url.pathname === '/health/ready')
    ) {
      try {
        const database = await databaseCheck();
        writeJson(
          response,
          200,
          {
            ...basePayload,
            status: 'ok',
            database: {
              status: 'ok',
              latencyMs: database.latencyMs,
            },
            timestamp: new Date().toISOString(),
          },
          headers,
        );
      } catch (error) {
        console.error('[health] database readiness check failed', {
          requestId,
          name: error?.name,
          code: error?.code,
        });

        writeJson(
          response,
          503,
          {
            ...basePayload,
            status: 'unavailable',
            database: { status: 'unavailable' },
            timestamp: new Date().toISOString(),
          },
          headers,
        );
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/session') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      writeJson(
        response,
        200,
        {
          ...basePayload,
          authenticated: true,
          session: {
            userId: auth.userId,
            sessionId: auth.sessionId,
            authorizedParty: auth.authorizedParty,
            status: auth.status,
            issuedAt: auth.issuedAt,
            expiresAt: auth.expiresAt,
          },
        },
        headers,
      );
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users/me') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const user = await userIdentityService.getCurrent(auth.userId);
        if (!user) {
          writeJson(
            response,
            404,
            {
              ...basePayload,
              authenticated: true,
              error: 'profile_not_synced',
            },
            headers,
          );
          return;
        }

        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            user: sanitizeUserIdentity(user),
          },
          headers,
        );
      } catch (error) {
        console.error('[users] current identity lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        writeJson(response, 503, { ...basePayload, error: 'identity_store_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/sync') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const user = await userIdentityService.syncCurrent(auth.userId);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            synchronized: true,
            user: sanitizeUserIdentity(user),
          },
          headers,
        );
      } catch (error) {
        console.error('[users] Clerk identity synchronization failed', {
          requestId,
          code: error?.code,
          status: error?.status,
          name: error?.name,
        });
        const statusCode = ['clerk_api_timeout', 'clerk_api_unavailable', 'clerk_backend_not_configured'].includes(error?.code) ? 503 : 502;
        writeJson(response, statusCode, { ...basePayload, error: 'identity_sync_failed' }, headers);
      }
      return;
    }


    if (request.method === 'GET' && url.pathname === '/api/users/me/legacy/firebase') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const link = await firebaseLinkService.getCurrent(auth.userId);
        if (!link) {
          writeJson(
            response,
            404,
            { ...basePayload, authenticated: true, error: 'legacy_link_not_found' },
            headers,
          );
          return;
        }
        writeJson(
          response,
          200,
          { ...basePayload, authenticated: true, firebaseLink: sanitizeFirebaseLink(link) },
          headers,
        );
      } catch (error) {
        console.error('[legacy] Firebase link lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = error?.code === 'profile_not_synced' ? 409 : 503;
        const errorCode = error?.code === 'profile_not_synced' ? 'profile_not_synced' : 'legacy_link_store_unavailable';
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: errorCode }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/legacy/firebase') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const link = await firebaseLinkService.linkCurrent(auth.userId, firebaseIdentity);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            linked: true,
            firebaseLink: sanitizeFirebaseLink(link),
          },
          headers,
        );
      } catch (error) {
        console.warn('[legacy] Firebase identity link rejected', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        if (
          ['profile_not_synced', 'firebase_email_mismatch', 'firebase_link_user_conflict', 'firebase_link_uid_conflict'].includes(error?.code)
        ) {
          writeJson(response, 409, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        writeJson(response, 503, { ...basePayload, authenticated: true, error: 'legacy_link_store_unavailable' }, headers);
      }
      return;
    }



    if (request.method === 'GET' && url.pathname === '/api/legacy/member-profile-cutover-candidate') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const shadow = await memberShadowService.getCurrentByFirebaseIdentity(firebaseIdentity);
        if (!shadow) {
          writeJson(
            response,
            404,
            { ...basePayload, authenticated: true, error: 'member_shadow_not_found' },
            headers,
          );
          return;
        }
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            authentication: 'firebase-id-token',
            readCandidate: sanitizeMemberProfileReadCandidate(shadow),
          },
          headers,
        );
      } catch (error) {
        console.error('[member-read] Firebase-authenticated cutover candidate lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = ['legacy_link_not_found', 'firebase_link_email_mismatch'].includes(error?.code) ? 409 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'member_read_cutover_candidate_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/legacy/member-profile-firestore-fallback') {
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const source = await memberShadowService.readCurrentSourceByFirebaseIdentity(firebaseIdentity);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            authentication: 'firebase-id-token',
            readFallback: {
              source: 'firestore-one-time-fallback',
              authoritative: true,
              firebaseUid: source.uid,
              profile: {
                uid: source.uid,
                email: source.email,
                maskedEmail: source.maskedEmail,
                name: source.name,
                team: source.team,
                phone: source.phone,
                status: source.status,
                directoryMemberId: source.directoryMemberId,
                directoryVerifiedVersion: source.directoryVerifiedVersion,
                profileRequiredReason: source.profileRequiredReason,
                rejoinedAccount: source.rejoinedAccount,
                termsConsentRevision: source.termsConsentRevision,
                termsConsentPolicyVersion: source.termsConsentPolicyVersion,
                identityKey: source.identityKey,
                recoveryKey: source.recoveryKey,
                previousAccountUids: source.previousAccountUids,
              },
              sourceHash: source.sourceHash,
              sourceUpdatedAt: source.sourceUpdatedAt,
            },
          },
          headers,
        );
      } catch (error) {
        console.error('[member-read] one-time Firestore fallback failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = ['legacy_link_not_found', 'firebase_link_email_mismatch', 'member_source_email_mismatch'].includes(error?.code)
          ? 409
          : error?.code === 'member_source_not_found'
            ? 404
            : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'member_profile_firestore_fallback_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users/me/member-profile-candidate') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const shadow = await memberShadowService.getCurrent(auth.userId);
        if (!shadow) {
          writeJson(
            response,
            404,
            { ...basePayload, authenticated: true, error: 'member_shadow_not_found' },
            headers,
          );
          return;
        }
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            readCandidate: sanitizeMemberProfileReadCandidate(shadow),
          },
          headers,
        );
      } catch (error) {
        console.error('[member-read] PostgreSQL candidate lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = ['profile_not_synced', 'legacy_link_not_found'].includes(error?.code) ? 409 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'member_read_candidate_unavailable' }, headers);
      }
      return;
    }


    if (request.method === 'GET' && url.pathname === '/api/users/me/legacy/member-shadow') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;

      try {
        const shadow = await memberShadowService.getCurrent(auth.userId);
        if (!shadow) {
          writeJson(
            response,
            404,
            { ...basePayload, authenticated: true, error: 'member_shadow_not_found' },
            headers,
          );
          return;
        }
        writeJson(
          response,
          200,
          { ...basePayload, authenticated: true, memberShadow: sanitizeMemberShadow(shadow) },
          headers,
        );
      } catch (error) {
        console.error('[legacy] member shadow lookup failed', {
          requestId,
          code: error?.code,
          name: error?.name,
        });
        const statusCode = ['profile_not_synced', 'legacy_link_not_found'].includes(error?.code) ? 409 : 503;
        writeJson(response, statusCode, { ...basePayload, authenticated: true, error: error?.code || 'member_shadow_store_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/legacy/member-shadow/sync') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const shadow = await memberShadowService.syncCurrent(auth.userId, firebaseIdentity);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            synchronized: true,
            authoritativeSource: 'firestore',
            memberShadow: sanitizeMemberShadow(shadow),
          },
          headers,
        );
      } catch (error) {
        console.warn('[legacy] member shadow synchronization rejected', {
          requestId,
          code: error?.code,
          status: error?.status,
          name: error?.name,
        });
        if (['profile_not_synced', 'legacy_link_not_found', 'legacy_link_token_mismatch', 'member_source_uid_mismatch', 'member_source_email_mismatch', 'member_shadow_uid_conflict'].includes(error?.code)) {
          writeJson(response, 409, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        if (error?.code === 'member_source_not_found') {
          writeJson(response, 404, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        if (error?.code === 'firestore_user_account_forbidden') {
          writeJson(response, 403, { ...basePayload, authenticated: true, error: 'member_source_forbidden' }, headers);
          return;
        }
        if (error?.code === 'firestore_user_account_unauthorized') {
          writeJson(response, 401, { ...basePayload, authenticated: true, error: 'legacy_firebase_unauthorized' }, headers);
          return;
        }
        writeJson(response, 503, { ...basePayload, authenticated: true, error: 'member_shadow_sync_unavailable' }, headers);
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users/me/legacy/member-shadow/compare') {
      const auth = await authenticate(request, response, headers, requestId);
      if (!auth) return;
      const firebaseIdentity = await authenticateFirebase(request, response, headers, requestId);
      if (!firebaseIdentity) return;

      try {
        const comparison = await memberShadowService.compareCurrent(auth.userId, firebaseIdentity);
        writeJson(
          response,
          200,
          {
            ...basePayload,
            authenticated: true,
            authoritativeSource: 'firestore',
            comparison: sanitizeMemberComparison(comparison),
          },
          headers,
        );
      } catch (error) {
        console.warn('[legacy] member shadow comparison failed', {
          requestId,
          code: error?.code,
          status: error?.status,
          name: error?.name,
        });
        if (['profile_not_synced', 'legacy_link_not_found', 'legacy_link_token_mismatch', 'member_source_uid_mismatch', 'member_source_email_mismatch'].includes(error?.code)) {
          writeJson(response, 409, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        if (error?.code === 'member_shadow_not_found' || error?.code === 'member_source_not_found') {
          writeJson(response, 404, { ...basePayload, authenticated: true, error: error.code }, headers);
          return;
        }
        if (error?.code === 'firestore_user_account_forbidden') {
          writeJson(response, 403, { ...basePayload, authenticated: true, error: 'member_source_forbidden' }, headers);
          return;
        }
        if (error?.code === 'firestore_user_account_unauthorized') {
          writeJson(response, 401, { ...basePayload, authenticated: true, error: 'legacy_firebase_unauthorized' }, headers);
          return;
        }
        writeJson(response, 503, { ...basePayload, authenticated: true, error: 'member_shadow_compare_unavailable' }, headers);
      }
      return;
    }

    writeJson(
      response,
      404,
      {
        ...basePayload,
        status: 'not_found',
      },
      headers,
    );
  };
};
