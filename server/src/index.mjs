import { createServer } from 'node:http';
import { createRequestHandler } from './app.mjs';
import { createClerkSessionAuthenticator } from './auth/clerk-session.mjs';
import { createClerkBackendClient } from './clerk/clerk-api.mjs';
import { readServerConfig } from './config/env.mjs';
import { createFirebaseIdTokenVerifier, extractFirebaseBearerToken } from './firebase/firebase-id-token.mjs';
import { checkDatabase, closePool, getPool } from './db/pool.mjs';
import { createUserRepository } from './users/user-repository.mjs';
import { createUserIdentityService } from './users/user-service.mjs';
import { createFirebaseLinkRepository } from './legacy/firebase-link-repository.mjs';
import { createFirebaseLinkService } from './legacy/firebase-link-service.mjs';

const config = readServerConfig();
const authenticateRequest = createClerkSessionAuthenticator(config);
const clerkClient = config.clerkSecretKey
  ? createClerkBackendClient({
      secretKey: config.clerkSecretKey,
      apiUrl: config.clerkApiUrl,
      timeoutMs: config.clerkApiTimeoutMs,
    })
  : {
      async getUser() {
        const error = new Error('Clerk Backend API is not configured.');
        error.code = 'clerk_backend_not_configured';
        throw error;
      },
    };
const pool = getPool();
const userRepository = createUserRepository(pool);
const userIdentityService = createUserIdentityService({ clerkClient, userRepository });
const firebaseLinkRepository = createFirebaseLinkRepository(pool);
const firebaseLinkService = createFirebaseLinkService({ userRepository, firebaseLinkRepository });
const verifyFirebaseIdToken = config.firebaseProjectId
  ? createFirebaseIdTokenVerifier({
      projectId: config.firebaseProjectId,
      timeoutMs: config.firebaseCertTimeoutMs,
    })
  : async () => {
      const error = new Error('Firebase ID token verification is not configured.');
      error.code = 'firebase_verification_not_configured';
      throw error;
    };
const authenticateFirebaseRequest = async (request) => {
  const idToken = extractFirebaseBearerToken(request);
  return verifyFirebaseIdToken(idToken);
};
const server = createServer(
  createRequestHandler({
    config,
    databaseCheck: checkDatabase,
    authenticateRequest,
    authenticateFirebaseRequest,
    userIdentityService,
    firebaseLinkService,
  }),
);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] ${config.serviceName} listening on port ${config.port}`, {
    environment: config.appEnv,
    corsOrigins: config.corsAllowedOrigins,
    clerkAuthorizedParties: config.clerkAuthorizedParties,
    databaseConfigured: true,
    clerkJwtVerification: 'RS256-public-key',
    clerkBackendApi: config.clerkSecretKey ? 'configured' : 'disabled',
    userIdentityStore: 'postgresql',
    firebaseIdentityBridge: config.firebaseProjectId ? 'configured' : 'disabled',
  });
});

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}; shutting down`);

  const hardStop = setTimeout(() => {
    console.error('[server] graceful shutdown timeout exceeded');
    process.exit(1);
  }, 10000);
  hardStop.unref();

  server.close(async (error) => {
    try {
      await closePool();
    } finally {
      clearTimeout(hardStop);
      if (error) {
        console.error('[server] shutdown error', { name: error.name, code: error.code });
        process.exit(1);
      }
      process.exit(0);
    }
  });
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
