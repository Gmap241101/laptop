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
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Request-Id',
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

export const createRequestHandler = ({ config, databaseCheck, authenticateRequest, userIdentityService }) => {
  if (typeof databaseCheck !== 'function') {
    throw new TypeError('databaseCheck must be a function.');
  }
  if (typeof authenticateRequest !== 'function') {
    throw new TypeError('authenticateRequest must be a function.');
  }
  if (!userIdentityService || typeof userIdentityService.getCurrent !== 'function' || typeof userIdentityService.syncCurrent !== 'function') {
    throw new TypeError('userIdentityService getCurrent/syncCurrent methods are required.');
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
