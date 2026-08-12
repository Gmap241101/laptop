import { createServer } from 'node:http';
import { createRequestHandler } from './app.mjs';
import { createClerkSessionAuthenticator } from './auth/clerk-session.mjs';
import { createClerkBackendClient } from './clerk/clerk-api.mjs';
import { readServerConfig } from './config/env.mjs';
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
import { createRentalPostgresqlSource } from './rentals/rental-postgresql-source.mjs';
import { createMemberAuthorityRepository } from './members/member-authority-repository.mjs';
import { createMemberAuthorityService } from './members/member-authority-service.mjs';
import { createAssetRepository } from './assets/asset-repository.mjs';
import { createAssetService } from './assets/asset-service.mjs';
import { createAccountRecoveryRepository } from './accounts/account-recovery-repository.mjs';
import { createAccountRecoveryService } from './accounts/account-recovery-service.mjs';
import { createAccountLifecycleRepository } from './accounts/account-lifecycle-repository.mjs';
import { createAccountLifecycleService } from './accounts/account-lifecycle-service.mjs';
import { createAdminIdentityRepository } from './auth/admin-identity-repository.mjs';
import { createAdminClerkAuthService } from './auth/admin-clerk-auth-service.mjs';
import { createUserClerkAuthRepository } from './auth/user-clerk-auth-repository.mjs';
import { createUserClerkAuthService } from './auth/user-clerk-auth-service.mjs';
import { createSiteContentRepository } from './content/site-content-repository.mjs';
import { createSiteContentService } from './content/site-content-service.mjs';
import { createBoardRepository } from './boards/board-repository.mjs';
import { createBoardService } from './boards/board-service.mjs';
import { createSystemConfigRepository } from './settings/system-config-repository.mjs';
import { createSystemConfigService } from './settings/system-config-service.mjs';
import { createSystemDataRepository } from './settings/system-data-repository.mjs';
import { createSystemDataService } from './settings/system-data-service.mjs';

const config = readServerConfig();
const authenticateRequest = createClerkSessionAuthenticator(config);
const clerkClient = config.clerkSecretKey
  ? createClerkBackendClient({
      secretKey: config.clerkSecretKey,
      apiUrl: config.clerkApiUrl,
      timeoutMs: config.clerkApiTimeoutMs,
    })
  : {
      async getUser() { const error = new Error('Clerk Backend API is not configured.'); error.code = 'clerk_backend_not_configured'; throw error; },
      async findUserByEmail() { const error = new Error('Clerk Backend API is not configured.'); error.code = 'clerk_backend_not_configured'; throw error; },
      async createUser() { const error = new Error('Clerk Backend API is not configured.'); error.code = 'clerk_backend_not_configured'; throw error; },
      async updateUser() { const error = new Error('Clerk Backend API is not configured.'); error.code = 'clerk_backend_not_configured'; throw error; },
      async updateUserMetadata() { const error = new Error('Clerk Backend API is not configured.'); error.code = 'clerk_backend_not_configured'; throw error; },
      async verifyPassword() { const error = new Error('Clerk Backend API is not configured.'); error.code = 'clerk_backend_not_configured'; throw error; },
      async deleteUser() { const error = new Error('Clerk Backend API is not configured.'); error.code = 'clerk_backend_not_configured'; throw error; },
    };
const pool = getPool();
const userRepository = createUserRepository(pool);
const accountRecoveryRepository = createAccountRecoveryRepository(pool);
const accountRecoveryService = createAccountRecoveryService({ repository: accountRecoveryRepository });
const accountLifecycleRepository = createAccountLifecycleRepository(pool);
const adminIdentityRepository = createAdminIdentityRepository(pool);
const userIdentityService = createUserIdentityService({ clerkClient, userRepository });
const firebaseLinkRepository = createFirebaseLinkRepository(pool);
const firebaseLinkService = createFirebaseLinkService({ userRepository, firebaseLinkRepository });
const memberShadowRepository = createMemberShadowRepository(pool);
const memberShadowService = createMemberShadowService({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
});

const memberAuthorityRepository = createMemberAuthorityRepository(pool);
const rentalRestrictionRepository = createRentalRestrictionRepository(pool);
const userClerkAuthRepository = createUserClerkAuthRepository(pool);
const siteContentRepository = createSiteContentRepository(pool);
const systemConfigRepository = createSystemConfigRepository(pool);
const systemConfigService = createSystemConfigService({ repository: systemConfigRepository });
const systemDataRepository = createSystemDataRepository(pool);
const systemDataService = createSystemDataService({ repository: systemDataRepository });
const siteContentService = createSiteContentService({ repository: siteContentRepository });
const assetRepository = createAssetRepository(pool);
const boardRepository = createBoardRepository(pool);
const boardService = createBoardService({
  repository: boardRepository,
  writeMirrorEnabled: !config.assetBoardWriteMirrorDisabled,
});
const accountLifecycleService = createAccountLifecycleService({
  repository: accountLifecycleRepository,
  siteContentRepository,
  userAuthRepository: userClerkAuthRepository,
  authorityEnabled: config.accountLifecycleCompatibilityDisabled,
});
const userClerkAuthService = createUserClerkAuthService({
      repository: userClerkAuthRepository,
      clerkClient,
      userRepository,
      firebaseLinkRepository,
          memberRepository: memberAuthorityRepository,
      adminIdentityRepository,
      accountLifecycleService,
      accountLifecycleCompatibilityDisabled: config.accountLifecycleCompatibilityDisabled,
      userFirebaseAuthCompatibilityDisabled: config.userFirebaseAuthCompatibilityDisabled,
    });
const adminClerkAuthService = createAdminClerkAuthService({
      repository: adminIdentityRepository,
      clerkClient,
    });
const memberAuthorityService = createMemberAuthorityService({
      repository: memberAuthorityRepository,
      firebaseLinkRepository,
      userRepository,
          rentalRestrictionRepository,
      siteContentRepository,
      writeMirrorEnabled: !config.memberStatusRestrictionWriteMirrorDisabled,
      profileWriteMirrorEnabled: !config.memberProfileWriteMirrorDisabled,
      userFirebaseAuthCompatibilityDisabled: config.userFirebaseAuthCompatibilityDisabled,
    });

const rentalRestrictionService = createRentalRestrictionService({
  firebaseLinkRepository,
  rentalRestrictionRepository,
  firebaseCompatibilityRequired: !config.userFirebaseAuthCompatibilityDisabled,
});
const rentalRequestRepository = createRentalRequestRepository(pool);
const adminRentalRequestRepository = createAdminRentalRequestRepository(pool);
const rentalPostgresqlSource = createRentalPostgresqlSource({
  assetRepository,
  siteContentRepository,
  adminRentalRequestRepository,
  rentalRestrictionRepository,
});
const rentalRequestService = createRentalRequestService({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  rentalRequestRepository,
  useAuthoritativeSource: config.rentalRequestWriteMirrorDisabled,
});
const rentalRequestWriteRepository = createRentalRequestWriteRepository(pool);
const rentalRequestWriteService = createRentalRequestWriteService({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  rentalRestrictionService,
  rentalRequestService,
  rentalRequestWriteRepository,
  postgresSource: rentalPostgresqlSource,
  writeMirrorEnabled: !config.rentalRequestWriteMirrorDisabled,
});
const rentalRequestUserActionRepository = createRentalRequestUserActionRepository(pool);
const rentalRequestUserActionService = createRentalRequestUserActionService({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  rentalRestrictionService,
  rentalRequestService,
  repository: rentalRequestUserActionRepository,
  postgresSource: rentalPostgresqlSource,
  writeMirrorEnabled: !config.rentalRequestWriteMirrorDisabled,
});
const adminRentalRequestService = createAdminRentalRequestService({
  repository: adminRentalRequestRepository,
  restrictionAuthorityRepository: memberAuthorityRepository,
  postgresSource: rentalPostgresqlSource,
  writeMirrorEnabled: !config.rentalRequestWriteMirrorDisabled,
});
const assetService = createAssetService({
  repository: assetRepository,
});
const server = createServer(
  createRequestHandler({
    config,
    databaseCheck: checkDatabase,
    authenticateRequest,
    userIdentityService,
    firebaseLinkService,
    memberShadowService,
    memberAuthorityService,
    accountRecoveryService,
    accountLifecycleService,
    adminClerkAuthService,
    userClerkAuthService,
    rentalRestrictionService,
    rentalRequestService,
    rentalRequestWriteService,
    rentalRequestUserActionService,
    adminRentalRequestService,
    assetService,
    siteContentService,
    boardService,
    memberAuthorityRepository,
    systemConfigService,
    systemDataService,
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
    firebaseRuntime: config.firebaseRuntimeDisabled ? 'retired' : 'compatibility',
    userIdentityStore: 'postgresql',
    firebaseIdentityBridge: 'retired',
    firestoreMemberShadow: 'retired',
    rentalRestrictionShadow: 'retired',
    rentalRequestShadow: 'retired',
    rentalRequestWrite: 'postgresql-authoritative',
    rentalRequestUserActions: 'postgresql-authoritative',
    adminRentalRequests: 'postgresql-authoritative',
    memberAuthority: 'postgresql-authoritative',
    adminIdentityRegistry: 'postgresql-clerk-authority',
    accountRecovery: 'postgresql-preferred',
    userClerkAuthentication: 'clerk-postgresql',
    adminAuthentication: 'clerk-postgresql',
    assetDomain: 'postgresql-authoritative',
    siteContent: 'postgresql-authoritative',
    noticeFaqBoards: 'postgresql-authoritative',
    phase28WriteMirrorRetirement: config.assetBoardWriteMirrorDisabled ? 'assets-and-boards' : 'disabled',
    phase29RentalTransactionAuthority: config.rentalRequestWriteMirrorDisabled ? 'postgresql-source-and-write-mirror-retired' : 'disabled',
    phase30MemberStatusRestrictionAuthority: config.memberStatusRestrictionWriteMirrorDisabled ? 'postgresql-source-and-write-mirror-retired' : 'disabled',
    phase32AccountLifecycleAuthority: config.accountLifecycleCompatibilityDisabled ? 'postgresql-signup-consent-firebase-reset-preserved' : 'disabled',
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
