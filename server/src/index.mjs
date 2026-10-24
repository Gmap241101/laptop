import { createServer } from 'node:http';
import { createRequestHandler } from './app.mjs';
import { createClerkSessionAuthenticator } from './auth/clerk-session.mjs';
import { createClerkBackendClient } from './clerk/clerk-api.mjs';
import { createClerkDeviceTrustService } from './clerk/clerk-device-trust-service.mjs';
import { readServerConfig } from './config/env.mjs';
import { checkDatabase, closePool, getPool } from './db/pool.mjs';
import { createUserRepository } from './users/user-repository.mjs';
import { createUserIdentityService } from './users/user-service.mjs';
import { createFirebaseLinkRepository } from './legacy/firebase-link-repository.mjs';
import { createFirebaseLinkService } from './legacy/firebase-link-service.mjs';
import { createRentalRestrictionRepository } from './restrictions/rental-restriction-repository.mjs';
import { createRentalRestrictionService } from './restrictions/rental-restriction-service.mjs';
import { createRentalRequestRepository } from './rentals/rental-request-repository.mjs';
import { createRentalRequestService } from './rentals/rental-request-service.mjs';
import { createMemberRentalStatusRepository } from './rentals/member-rental-status-repository.mjs';
import { createMemberRentalStatusService } from './rentals/member-rental-status-service.mjs';
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
import { createInquiryRepository } from './inquiries/inquiry-repository.mjs';
import { createInquiryService } from './inquiries/inquiry-service.mjs';
import { createSecureAttachmentRepository } from './attachments/attachment-repository.mjs';
import { createSecureAttachmentService } from './attachments/attachment-service.mjs';
import { createSystemConfigRepository } from './settings/system-config-repository.mjs';
import { createSystemConfigService } from './settings/system-config-service.mjs';
import { createMailNotificationSettingsService } from './mail/mail-notification-settings-service.mjs';
import { createMailQueueOperations } from './mail/mail-queue-operations.mjs';
import { createMailPreflightControl } from './mail/mail-p108-preflight-control.mjs';
import { createG5OwnerReadOnlyAcceptance } from './mail/mail-p108-g5-owner-readonly-acceptance.mjs';
import { createG6SandboxReadiness } from './mail/mail-p108-g6-brevo-readiness.mjs';
import { createG6C050OwnerReadOnlyStatus } from './mail/mail-p108-g6c-postmigration-readonly.mjs';
import { createG6C050HeldReservationApi } from './mail/mail-p108-g6c050-held-reservation-api.mjs';
import { loadP101MailConfig } from './mail/mail-provider-config.mjs';
import { createP106ScheduledEnqueue, createP106ScheduledPreview, startP106ScheduledLoop } from './mail/mail-scheduled-enqueue.mjs';
import { createSystemDataRepository } from './settings/system-data-repository.mjs';
import { createSystemDataService } from './settings/system-data-service.mjs';
import { createBackupVerificationJobs } from './settings/backup-verification-jobs.mjs';
import { createSingleDbVerificationJobs } from './settings/backup-verification-single-db.mjs';

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
const backupVerificationJobs = process.env.BACKUP_VERIFY_MODE === 'single-db'
  ? createSingleDbVerificationJobs(pool) : createBackupVerificationJobs(pool);
const userRepository = createUserRepository(pool);
const accountRecoveryRepository = createAccountRecoveryRepository(pool);
const accountRecoveryService = createAccountRecoveryService({ repository: accountRecoveryRepository });
const accountLifecycleRepository = createAccountLifecycleRepository(pool);
const adminIdentityRepository = createAdminIdentityRepository(pool);
const userIdentityService = createUserIdentityService({ clerkClient, userRepository });
const firebaseLinkRepository = createFirebaseLinkRepository(pool);
const firebaseLinkService = createFirebaseLinkService({ userRepository, firebaseLinkRepository });
const memberAuthorityRepository = createMemberAuthorityRepository(pool);
const rentalRestrictionRepository = createRentalRestrictionRepository(pool);
const userClerkAuthRepository = createUserClerkAuthRepository(pool);
const siteContentRepository = createSiteContentRepository(pool);
const systemConfigRepository = createSystemConfigRepository(pool);
const systemConfigService = createSystemConfigService({ repository: systemConfigRepository });
const mailNotificationSettingsService = createMailNotificationSettingsService(pool);
const mailQueueOperations = createMailQueueOperations(pool);
const mailPreflightControl = createMailPreflightControl(pool,{environment:config.appEnv});
const mailSchedulePreview = createP106ScheduledPreview(pool);
// Explicitly OFF until later Staging acceptance. Real provider sending remains locked.
const scheduledMailLoop = startP106ScheduledLoop({
  runner:createP106ScheduledEnqueue(pool),
  enabled:process.env.P106_SCHEDULED_ENQUEUE_ENABLED === 'true',
});
scheduledMailLoop.start();
const clerkDeviceTrustService = createClerkDeviceTrustService({
  clerkClient: config.clerkSecretKey ? clerkClient : null,
  systemConfigService,
  adminIdentityRepository,
  userAuthRepository: userClerkAuthRepository,
});
const systemDataRepository = createSystemDataRepository(pool);
const systemDataService = createSystemDataService({ repository: systemDataRepository });
const siteContentService = createSiteContentService({ repository: siteContentRepository });
const assetRepository = createAssetRepository(pool);
const secureAttachmentRepository = createSecureAttachmentRepository(pool);
const secureAttachmentService = createSecureAttachmentService({ repository: secureAttachmentRepository });
queueMicrotask(() => {
  void secureAttachmentService.backfillMissingMetadata({ limit: 25, concurrency: 3 }).catch(() => null);
});
const boardRepository = createBoardRepository(pool, { attachmentRepository: secureAttachmentRepository });
const boardService = createBoardService({ repository: boardRepository, attachmentService: secureAttachmentService });
const inquiryRepository = createInquiryRepository(pool, { attachmentRepository: secureAttachmentRepository });
const inquiryService = createInquiryService({ repository: inquiryRepository, attachmentService: secureAttachmentService });
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
      systemConfigService,
    });
const adminClerkAuthService = createAdminClerkAuthService({
      repository: adminIdentityRepository,
      clerkClient,
      systemConfigService,
    });
// Only an explicit Staging opt-in exposes a read-only G5 owner check.
// The default remains OFF; neither Production nor a vendor dispatch uses it.
const g5OwnerReadOnlyAcceptance = config.appEnv === 'staging' &&
  process.env.P108_G5_OWNER_READONLY_ENABLED === 'true'
    ? createG5OwnerReadOnlyAcceptance({config,adminClerkAuthService}) : null;
// G6 owner-only read-only preview; independently opted-in, no Brevo API traffic.
const g6SandboxReadiness = config.appEnv === 'staging' &&
  process.env.P108_G6_SANDBOX_READINESS_ENABLED === 'true'
    ? createG6SandboxReadiness({config,adminClerkAuthService,
        getServerMailConfig:()=>loadP101MailConfig(process.env)}) : null;
// After operator-applied schema 050: a separate default-OFF GET-only status check.
// No approval, provider request, dispatch, Outbox mutation, or DB write.
const g6c050OwnerReadOnlyStatus = config.appEnv === 'staging' &&
  process.env.P108_G6C_050_READONLY_ENABLED === 'true'
    ? createG6C050OwnerReadOnlyStatus({config,adminClerkAuthService,pool,
        getServerMailConfig:()=>loadP101MailConfig(process.env)}) : null;
// Independent explicit opt-in for a HELD-ONLY write. This flag must remain
// unset on Staging until operator-only acceptance; never allowed on Production.
const g6c050HeldReservationApi = config.appEnv === 'staging' &&
  process.env.P108_G6C_050_HELD_WRITE_ENABLED === 'true'
    ? createG6C050HeldReservationApi({config,adminClerkAuthService,pool,
        getServerMailConfig:()=>loadP101MailConfig(process.env)}) : null;
const memberAuthorityService = createMemberAuthorityService({
  repository: memberAuthorityRepository,
  firebaseLinkRepository,
  userRepository,
  rentalRestrictionRepository,
  siteContentRepository,
});

const rentalRestrictionService = createRentalRestrictionService({
  firebaseLinkRepository,
  rentalRestrictionRepository,
});
const rentalRequestRepository = createRentalRequestRepository(pool);
const memberRentalStatusRepository = createMemberRentalStatusRepository(pool);
const memberRentalStatusService = createMemberRentalStatusService({ repository: memberRentalStatusRepository });
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
  rentalRequestRepository,
});
const rentalRequestWriteRepository = createRentalRequestWriteRepository(pool);
const rentalRequestWriteService = createRentalRequestWriteService({
  userRepository,
  firebaseLinkRepository,
  memberRepository: memberAuthorityRepository,
  rentalRequestWriteRepository,
  postgresSource: rentalPostgresqlSource,
});
const rentalRequestUserActionRepository = createRentalRequestUserActionRepository(pool);
const rentalRequestUserActionService = createRentalRequestUserActionService({
  userRepository,
  firebaseLinkRepository,
  memberRepository: memberAuthorityRepository,
  rentalRestrictionService,
  rentalRequestService,
  repository: rentalRequestUserActionRepository,
  postgresSource: rentalPostgresqlSource,
});
const adminRentalRequestService = createAdminRentalRequestService({
  repository: adminRentalRequestRepository,
  restrictionAuthorityRepository: memberAuthorityRepository,
  postgresSource: rentalPostgresqlSource,
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
    memberAuthorityService,
    accountRecoveryService,
    accountLifecycleService,
    adminClerkAuthService,
    userClerkAuthService,
    rentalRestrictionService,
    rentalRequestService,
    memberRentalStatusService,
    rentalRequestWriteService,
    rentalRequestUserActionService,
    adminRentalRequestService,
    assetService,
    siteContentService,
    boardService,
    inquiryService,
    secureAttachmentService,
    memberAuthorityRepository,
    systemConfigService,
    mailNotificationSettingsService,
    mailQueueOperations,
    mailPreflightControl,
    g5OwnerReadOnlyAcceptance,
    g6SandboxReadiness,
    g6c050OwnerReadOnlyStatus,
    g6c050HeldReservationApi,
    mailSchedulePreview,
    clerkDeviceTrustService,
    systemDataService,
    backupVerificationJobs,
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
    clerkUserDeviceTrustPolicy: clerkDeviceTrustService.getConfigurationStatus().configured ? 'configured' : 'disabled',
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
    privateInquiry: 'postgresql-authoritative',
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
