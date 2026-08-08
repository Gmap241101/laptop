import { createServer } from 'node:http';
import { createRequestHandler } from './app.mjs';
import { createClerkSessionAuthenticator } from './auth/clerk-session.mjs';
import { createClerkBackendClient } from './clerk/clerk-api.mjs';
import { readServerConfig } from './config/env.mjs';
import { createFirebaseIdTokenVerifier, extractFirebaseBearerToken } from './firebase/firebase-id-token.mjs';
import { createFirestoreUserAccountClient } from './firestore/firestore-user-account.mjs';
import { createFirestoreRentalRestrictionClient } from './firestore/firestore-rental-restriction.mjs';
import { createFirestoreRentalRequestsClient } from './firestore/firestore-rental-requests.mjs';
import { createFirestoreRentalRequestWriteClient } from './firestore/firestore-rental-request-write.mjs';
import { createFirestoreAdminRentalRequestsClient } from './firestore/firestore-admin-rental-requests.mjs';
import { checkDatabase, closePool, getPool } from './db/pool.mjs';
import { createUserRepository } from './users/user-repository.mjs';
import { createUserIdentityService } from './users/user-service.mjs';
import { createFirebaseLinkRepository } from './legacy/firebase-link-repository.mjs';
import { createFirebaseLinkService } from './legacy/firebase-link-service.mjs';
import { createMemberShadowRepository } from './legacy/member-shadow-repository.mjs';
import { createMemberShadowService } from './legacy/member-shadow-service.mjs';
import { createRentalRestrictionRepository } from './restrictions/rental-restriction-repository.mjs';
import { createRentalRestrictionService } from './restrictions/rental-restriction-service.mjs';
import { createRentalRequestRepository } from './rentals/rental-request-repository.mjs';
import { createRentalRequestService } from './rentals/rental-request-service.mjs';
import { createRentalRequestWriteRepository } from './rentals/rental-request-write-repository.mjs';
import { createRentalRequestWriteService } from './rentals/rental-request-write-service.mjs';
import { createRentalRequestUserActionRepository } from './rentals/rental-request-user-action-repository.mjs';
import { createRentalRequestUserActionService } from './rentals/rental-request-user-action-service.mjs';
import { createAdminRentalRequestRepository } from './rentals/admin-rental-request-repository.mjs';
import { createAdminRentalRequestService } from './rentals/admin-rental-request-service.mjs';
import { createFirestoreAssetClient } from './firestore/firestore-assets.mjs';
import { createAssetRepository } from './assets/asset-repository.mjs';
import { createAssetService } from './assets/asset-service.mjs';

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
const memberShadowRepository = createMemberShadowRepository(pool);
const firestoreUserAccountClient = config.firebaseProjectId
  ? createFirestoreUserAccountClient({
      projectId: config.firebaseProjectId,
      timeoutMs: config.firestoreRestTimeoutMs,
    })
  : {
      async getUserAccount() {
        const error = new Error('Firestore legacy member read is not configured.');
        error.code = 'firestore_user_account_not_configured';
        throw error;
      },
    };
const memberShadowService = createMemberShadowService({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  firestoreUserAccountClient,
});
const rentalRestrictionRepository = createRentalRestrictionRepository(pool);
const firestoreRentalRestrictionClient = config.firebaseProjectId
  ? createFirestoreRentalRestrictionClient({
      projectId: config.firebaseProjectId,
      timeoutMs: config.firestoreRestTimeoutMs,
    })
  : {
      async getRentalRestriction() {
        const error = new Error('Firestore rental restriction read is not configured.');
        error.code = 'firestore_rental_restriction_not_configured';
        throw error;
      },
    };
const rentalRestrictionService = createRentalRestrictionService({
  firebaseLinkRepository,
  rentalRestrictionRepository,
  firestoreRentalRestrictionClient,
});
const rentalRequestRepository = createRentalRequestRepository(pool);
const firestoreRentalRequestsClient = config.firebaseProjectId
  ? createFirestoreRentalRequestsClient({
      projectId: config.firebaseProjectId,
      timeoutMs: config.firestoreRestTimeoutMs,
    })
  : {
      async listOwnRentalRequests() {
        const error = new Error('Firestore rental request read is not configured.');
        error.code = 'firestore_rental_requests_not_configured';
        throw error;
      },
    };
const rentalRequestService = createRentalRequestService({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  rentalRequestRepository,
  firestoreRentalRequestsClient,
});
const rentalRequestWriteRepository = createRentalRequestWriteRepository(pool);
const firestoreRentalRequestWriteClient = config.firebaseProjectId
  ? createFirestoreRentalRequestWriteClient({
      projectId: config.firebaseProjectId,
      timeoutMs: config.firestoreRestTimeoutMs,
    })
  : {
      async getPublicConfig() {
        const error = new Error('Firestore rental request write compatibility bridge is not configured.');
        error.code = 'firestore_rental_request_write_not_configured';
        throw error;
      },
      async getRentalAsset() {
        const error = new Error('Firestore rental request write compatibility bridge is not configured.');
        error.code = 'firestore_rental_request_write_not_configured';
        throw error;
      },
      async getRentalRequest() {
        const error = new Error('Firestore rental request user action bridge is not configured.');
        error.code = 'firestore_rental_request_write_not_configured';
        throw error;
      },
      async commitUserRequestEdit() {
        const error = new Error('Firestore rental request user action bridge is not configured.');
        error.code = 'firestore_rental_request_write_not_configured';
        throw error;
      },
      async commitUserRequestCancel() {
        const error = new Error('Firestore rental request user action bridge is not configured.');
        error.code = 'firestore_rental_request_write_not_configured';
        throw error;
      },
      async commitUserExtension() {
        const error = new Error('Firestore rental request user action bridge is not configured.');
        error.code = 'firestore_rental_request_write_not_configured';
        throw error;
      },
      async commitRentalRequestCreate() {
        const error = new Error('Firestore rental request write compatibility bridge is not configured.');
        error.code = 'firestore_rental_request_write_not_configured';
        throw error;
      },
    };
const rentalRequestWriteService = createRentalRequestWriteService({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  rentalRestrictionService,
  rentalRequestService,
  rentalRequestWriteRepository,
  firestoreRentalRequestWriteClient,
});
const rentalRequestUserActionRepository = createRentalRequestUserActionRepository(pool);
const rentalRequestUserActionService = createRentalRequestUserActionService({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  rentalRestrictionService,
  rentalRequestService,
  repository: rentalRequestUserActionRepository,
  firestoreClient: firestoreRentalRequestWriteClient,
});
const adminRentalRequestRepository = createAdminRentalRequestRepository(pool);
const firestoreAdminRentalRequestsClient = config.firebaseProjectId
  ? createFirestoreAdminRentalRequestsClient({
      projectId: config.firebaseProjectId,
      timeoutMs: config.firestoreRestTimeoutMs,
    })
  : {
      async verifyAdmin() { const error = new Error('Firestore admin rental request bridge is not configured.'); error.code = 'firestore_admin_rental_request_not_configured'; throw error; },
    };
const adminRentalRequestService = createAdminRentalRequestService({
  repository: adminRentalRequestRepository,
  firestoreClient: firestoreAdminRentalRequestsClient,
});
const assetRepository = createAssetRepository(pool);
const firestoreAssetClient = config.firebaseProjectId
  ? createFirestoreAssetClient({ projectId: config.firebaseProjectId, timeoutMs: config.firestoreRestTimeoutMs })
  : {
      async verifyAdmin() { const error = new Error('Firestore asset bridge is not configured.'); error.code = 'firestore_asset_not_configured'; throw error; },
    };
const assetService = createAssetService({ repository: assetRepository, firestoreClient: firestoreAssetClient });
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
  const identity = await verifyFirebaseIdToken(idToken);
  return Object.freeze({ ...identity, idToken });
};
const server = createServer(
  createRequestHandler({
    config,
    databaseCheck: checkDatabase,
    authenticateRequest,
    authenticateFirebaseRequest,
    userIdentityService,
    firebaseLinkService,
    memberShadowService,
    rentalRestrictionService,
    rentalRequestService,
    rentalRequestWriteService,
    rentalRequestUserActionService,
    adminRentalRequestService,
    assetService,
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
    firestoreMemberShadow: config.firebaseProjectId ? 'user-token-security-rules' : 'disabled',
    rentalRestrictionShadow: config.firebaseProjectId ? 'postgresql-user-token-security-rules' : 'disabled',
    rentalRequestShadow: config.firebaseProjectId ? 'normalized-postgresql-user-token-security-rules' : 'disabled',
    rentalRequestWrite: config.firebaseProjectId ? 'postgresql-authoritative-firestore-compatibility-mirror' : 'disabled',
    rentalRequestUserActions: config.firebaseProjectId ? 'postgresql-authoritative-user-actions-firestore-compatibility-mirror' : 'disabled',
    adminRentalRequests: config.firebaseProjectId ? 'postgresql-read-admin-mutations-audit-firestore-compatibility-mirror' : 'disabled',
    assetDomain: config.firebaseProjectId ? 'postgresql-read-write-firestore-compatibility-mirror' : 'disabled',
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
