import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

import { firebaseAuth } from '../firebase.js';
import {
  compareMemberProfileReads,
  getLatestMemberProfileReadObservation,
  subscribeMemberProfileReadObservation,
} from '../features/members/memberProfileReadObservation.js';
import {
  getLatestMemberProfileCutoverObservation,
  subscribeMemberProfileCutoverObservation,
} from '../features/members/memberProfileReadCutover.js';
import {
  getLatestMemberProfileWriteThroughObservation,
  readMemberProfileWriteThroughConfig,
  subscribeMemberProfileWriteThroughObservation,
} from '../features/members/memberProfileWriteThrough.js';
import {
  getLatestRentalRestrictionCutoverObservation,
  getLatestRentalRestrictionWriteThroughObservation,
  subscribeRentalRestrictionCutoverObservation,
  subscribeRentalRestrictionWriteThroughObservation,
} from '../features/requests/rentalRestrictionReadCutover.js';
import {
  compareRentalRequestReads,
  getLatestRentalRequestReadObservation,
  readRentalRequestParityConfig,
  subscribeRentalRequestReadObservation,
} from '../features/requests/rentalRequestReadParity.js';
import {
  getLatestRentalRequestCutoverObservation,
  readRentalRequestCutoverConfig,
  subscribeRentalRequestCutoverObservation,
} from '../features/requests/rentalRequestReadCutover.js';
import {
  getLatestRentalRequestWriteObservation,
  readRentalRequestWriteCutoverConfig,
  subscribeRentalRequestWriteObservation,
} from '../features/requests/rentalRequestWriteCutover.js';
import {
  getLatestAdminRentalRequestCutoverObservation,
  readAdminRentalRequestCutoverConfig,
  subscribeAdminRentalRequestCutoverObservation,
} from '../features/requests/adminRentalRequestCutover.js';
import {
  getLatestRentalRequestUserActionObservation,
  readRentalRequestUserActionCutoverConfig,
  subscribeRentalRequestUserActionObservation,
} from '../features/requests/rentalRequestUserActionCutover.js';
import {
  getLatestAssetDomainCutoverObservation,
  readAssetDomainCutoverConfig,
  subscribeAssetDomainCutoverObservation,
} from '../features/assets/assetDomainCutover.js';
import {
  getLatestMemberAuthorityObservation,
  readMemberAuthorityCutoverConfig,
  subscribeMemberAuthorityObservation,
} from '../features/members/memberAuthorityCutover.js';
import {
  getLatestAccountAuthObservation,
  readAccountAuthCutoverConfig,
  subscribeAccountAuthObservation,
} from '../features/auth/accountAuthCutover.js';
import {
  getLatestUserAccountLifecycleObservation,
  readUserAccountLifecycleCutoverConfig,
  subscribeUserAccountLifecycleObservation,
} from '../features/auth/userAccountLifecycleCutover.js';
import {
  readUserAuthSessionTrace,
  subscribeUserAuthSessionTrace,
} from '../features/auth/authSessionService.js';
import {
  getLatestSiteContentObservation,
  readSiteContentCutoverConfig,
  subscribeSiteContentObservation,
  syncAllSiteContentDomainsFromFirestore,
} from '../features/content/siteContentCutover.js';
import {
  getLatestPolicyContentObservation,
  readPolicyContentCutoverConfig,
  subscribePolicyContentObservation,
  syncAllPolicyContentDomainsFromFirestore,
} from '../features/content/policyContentCutover.js';
import {
  bootstrapBoardContent,
  getLatestBoardContentObservation,
  readBoardContentCutoverConfig,
  subscribeBoardContentObservation,
} from '../features/boards/boardContentCutover.js';
import {
  getLatestLegacyFirestoreReadFallbackObservation,
  readLegacyFirestoreReadFallbackConfig,
  subscribeLegacyFirestoreReadFallbackObservation,
} from '../features/compatibility/legacyFirestoreReadFallbackCutover.js';
import {
  readFirestoreWriteMirrorRetirementConfig,
  requestFirestoreWriteMirrorRetirementStatus,
} from '../features/compatibility/firestoreWriteMirrorRetirement.js';
import {
  readRentalRequestWriteMirrorRetirementConfig,
  requestRentalRequestWriteMirrorRetirementStatus,
} from '../features/compatibility/rentalRequestWriteMirrorRetirement.js';
import {
  readMemberStatusRestrictionWriteMirrorRetirementConfig,
  requestMemberStatusRestrictionWriteMirrorRetirementStatus,
} from '../features/compatibility/memberStatusRestrictionWriteMirrorRetirement.js';
import {
  readMemberProfileIdentityAuthorityConfig,
  requestMemberProfileIdentityAuthorityStatus,
} from '../features/compatibility/memberProfileIdentityAuthority.js';
import {
  getLatestAccountLifecycleAuthorityObservation,
  readAccountLifecycleAuthorityConfig,
  requestAccountLifecycleAuthorityStatus,
  subscribeAccountLifecycleAuthorityObservation,
} from '../features/auth/accountLifecycleAuthority.js';
import {
  getLatestUserFirebaseAuthRetirementObservation,
  readUserFirebaseAuthRetirementConfig,
  subscribeUserFirebaseAuthRetirementObservation,
} from '../features/auth/userFirebaseAuthRetirement.js';
import { clerkStagingClient } from './clerkStagingClient.js';

const PHASE32_RUNTIME_REVISION = 'phase32-new-member-runtime-authority-20260811-2108';
const PHASE33_RUNTIME_REVISION = 'phase33-user-clerk-content-authority-20260811-2210';
const PHASE33_FRONTEND_HOTFIX_REVISION = 'phase33-public-content-cache-invalidation-hotfix-20260812-0045';

const panelStyle = {
  position: 'fixed',
  right: '16px',
  top: '184px',
  bottom: '16px',
  zIndex: 99999,
  width: 'min(380px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 200px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
  WebkitOverflowScrolling: 'touch',
  padding: '14px',
  border: '1px solid #cbd5e1',
  borderRadius: '12px',
  background: '#ffffff',
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18)',
  color: '#0f172a',
  fontFamily: 'Arial, sans-serif',
  fontSize: '13px',
  lineHeight: 1.45,
};

const buttonStyle = {
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  background: '#f8fafc',
  color: '#0f172a',
  fontWeight: 700,
  cursor: 'pointer',
};

const getClerkSnapshot = (clerk) => ({
  signedIn: Boolean(clerk?.isSignedIn && clerk?.session),
  userId: clerk?.user?.id || clerk?.session?.user?.id || null,
  sessionId: clerk?.session?.id || null,
});

export default function ClerkStagingDiagnostics() {
  const requested = useMemo(() => clerkStagingClient.isDiagnosticsRequested(), []);
  const writeThroughConfig = useMemo(() => readMemberProfileWriteThroughConfig(), []);
  const rentalRequestParityConfig = useMemo(() => readRentalRequestParityConfig(), []);
  const rentalRequestCutoverConfig = useMemo(() => readRentalRequestCutoverConfig(), []);
  const rentalRequestWriteConfig = useMemo(() => readRentalRequestWriteCutoverConfig(), []);
  const adminRentalRequestCutoverConfig = useMemo(() => readAdminRentalRequestCutoverConfig(), []);
  const rentalRequestUserActionConfig = useMemo(() => readRentalRequestUserActionCutoverConfig(), []);
  const assetDomainCutoverConfig = useMemo(() => readAssetDomainCutoverConfig(), []);
  const memberAuthorityConfig = useMemo(() => readMemberAuthorityCutoverConfig(), []);
  const accountAuthConfig = useMemo(() => readAccountAuthCutoverConfig(), []);
  const userLifecycleConfig = useMemo(() => readUserAccountLifecycleCutoverConfig(), []);
  const siteContentConfig = useMemo(() => readSiteContentCutoverConfig(), []);
  const policyContentConfig = useMemo(() => readPolicyContentCutoverConfig(), []);
  const boardContentConfig = useMemo(() => readBoardContentCutoverConfig(), []);
  const legacyReadFallbackConfig = useMemo(() => readLegacyFirestoreReadFallbackConfig(), []);
  const writeMirrorRetirementConfig = useMemo(() => readFirestoreWriteMirrorRetirementConfig(), []);
  const rentalWriteMirrorRetirementConfig = useMemo(() => readRentalRequestWriteMirrorRetirementConfig(), []);
  const memberStatusRestrictionRetirementConfig = useMemo(() => readMemberStatusRestrictionWriteMirrorRetirementConfig(), []);
  const memberProfileIdentityAuthorityConfig = useMemo(() => readMemberProfileIdentityAuthorityConfig(), []);
  const accountLifecycleAuthorityConfig = useMemo(() => readAccountLifecycleAuthorityConfig(), []);
  const userFirebaseRetirementConfig = useMemo(() => readUserFirebaseAuthRetirementConfig(), []);
  const [state, setState] = useState({
    phase: requested ? 'loading' : 'hidden',
    signedIn: false,
    userId: null,
    sessionId: null,
    backendUserId: null,
    postgresUserId: null,
    primaryEmail: null,
    primaryEmailVerified: false,
    firebaseSignedIn: Boolean(firebaseAuth.currentUser),
    firebaseUserId: firebaseAuth.currentUser?.uid || null,
    legacyFirebaseUid: null,
    legacyFirebaseEmail: null,
    legacyFirebaseEmailVerified: false,
    legacyFirebaseSignInProvider: null,
    memberShadowFirebaseUid: null,
    memberShadowName: null,
    memberShadowTeam: null,
    memberShadowStatus: null,
    memberShadowSourceHash: null,
    memberShadowSyncedAt: null,
    memberShadowEquivalent: null,
    memberShadowChangedFields: [],
    appReadFirebaseUid: null,
    appReadProfile: null,
    memberReadCandidateSource: null,
    memberReadCandidateProfile: null,
    memberReadCandidateEquivalent: null,
    memberReadCandidateChangedFields: [],
    cutoverRequested: false,
    cutoverActiveSource: null,
    cutoverEquivalent: null,
    cutoverChangedFields: [],
    cutoverFallbackReason: null,
    firestoreWatcherDisabled: false,
    firestoreFallbackReads: 0,
    writeThroughRequested: writeThroughConfig.requested,
    writeThroughStatus: null,
    writeThroughReason: null,
    writeThroughFirebaseUid: null,
    writeThroughBackendReason: null,
    writeThroughErrorCode: null,
    writeThroughCounters: { attempted: 0, synced: 0, skipped: 0, failed: 0 },
    restrictionCutoverRequested: false,
    restrictionActiveSource: null,
    restrictionWatcherDisabled: false,
    restrictionFallbackReads: 0,
    restrictionFallbackReason: null,
    restrictionWriteStatus: null,
    restrictionWriteReason: null,
    restrictionWriteFirebaseUid: null,
    restrictionWriteCounters: { attempted: 0, synced: 0, failed: 0 },
    rentalRequestParityRequested: rentalRequestParityConfig.requested,
    rentalRequestFirestoreCount: 0,
    rentalRequestPostgresCount: 0,
    rentalRequestEquivalent: null,
    rentalRequestChangedRequestIds: [],
    rentalRequestChangedFields: [],
    rentalRequestCandidateSource: null,
    rentalRequestShadowSyncedAt: null,
    rentalRequestBackendEquivalent: null,
    rentalRequestCutoverRequested: rentalRequestCutoverConfig.requested,
    rentalRequestActiveSource: null,
    rentalRequestCutoverEquivalent: null,
    rentalRequestCutoverChangedRequestIds: [],
    rentalRequestCutoverChangedFields: [],
    rentalRequestCutoverFallbackReason: null,
    rentalRequestWatcherDisabled: rentalRequestCutoverConfig.firestoreWatcherDisabled,
    rentalRequestFallbackReads: 0,
    rentalRequestCutoverShadowSyncedAt: null,
    rentalRequestSourceRefreshes: 0,
    rentalRequestWriteRequested: rentalRequestWriteConfig.requested,
    rentalRequestWriteSource: null,
    rentalRequestWriteRequestId: null,
    rentalRequestWriteMirror: null,
    rentalRequestWriteShadowSynchronized: null,
    rentalRequestWriteReused: false,
    rentalRequestWriteError: null,
    rentalRequestUserActionRequested: rentalRequestUserActionConfig.requested,
    rentalRequestUserActionSource: null,
    rentalRequestUserActionOperation: null,
    rentalRequestUserActionRequestId: null,
    rentalRequestUserActionApprovalMode: null,
    rentalRequestUserActionMirror: null,
    rentalRequestUserActionShadowSynchronized: null,
    rentalRequestUserActionError: null,
    adminRentalRequestReadRequested: adminRentalRequestCutoverConfig.readRequested,
    adminRentalRequestReadSource: adminRentalRequestCutoverConfig.readRequested ? 'awaiting-admin-view' : null,
    adminRentalRequestWatcherDisabled: adminRentalRequestCutoverConfig.readRequested,
    adminRentalRequestBootstrapCount: null,
    adminRentalRequestTotalCount: null,
    adminRentalRequestAuditSource: null,
    adminRentalRequestAuditCount: null,
    adminRentalRequestWriteRequested: adminRentalRequestCutoverConfig.writeRequested,
    adminRentalRequestWriteSource: null,
    adminRentalRequestWriteRequestId: null,
    adminRentalRequestWriteOperation: null,
    adminRentalRequestWriteNextStatus: null,
    adminRentalRequestWriteMirror: null,
    adminRentalRequestError: null,
    assetReadRequested: assetDomainCutoverConfig.readRequested,
    assetWriteRequested: assetDomainCutoverConfig.writeRequested,
    assetActiveSource: assetDomainCutoverConfig.readRequested ? 'awaiting-asset-view' : null,
    assetWatcherDisabled: assetDomainCutoverConfig.readRequested,
    assetAvailabilityWatcherDisabled: assetDomainCutoverConfig.readRequested,
    assetCount: null,
    assetCategoryCount: null,
    assetAvailabilityCount: null,
    assetFirestoreFallbackReads: 0,
    assetBootstrapped: false,
    assetSyncAt: null,
    assetWriteSource: null,
    assetFirestoreMirror: null,
    assetError: null,
    memberAuthorityWriteRequested: memberAuthorityConfig.memberRequested,
    memberAuthorityWriteSource: null,
    memberAuthorityMirror: null,
    memberAuthorityMutationId: null,
    memberAuthorityOperation: null,
    adminMemberReadSource: null,
    adminMemberReadCount: null,
    restrictionAuthorityWriteRequested: memberAuthorityConfig.restrictionRequested,
    restrictionAuthorityWriteSource: null,
    adminIdentityRegistryRequested: memberAuthorityConfig.adminRegistryRequested,
    adminIdentityRegistrySource: null,
    adminIdentityRegistryCount: null,
    adminIdentityRegistryError: null,
    memberAuthorityError: null,
    accountRecoveryRequested: accountAuthConfig.accountRecoveryRequested,
    accountRecoverySource: accountAuthConfig.accountRecoveryRequested ? 'awaiting-recovery-action' : null,
    accountRecoveryFallback: false,
    accountRecoveryOperation: null,
    accountRecoveryError: null,
    adminClerkAuthRequested: accountAuthConfig.adminClerkAuthRequested,
    adminAuthSource: accountAuthConfig.adminClerkAuthRequested ? 'awaiting-admin-login' : null,
    adminFirebaseCompatibility: null,
    adminClerkMigration: null,
    adminClerkUserId: null,
    adminClientTrustStatus: null,
    adminClientTrustStrategy: null,
    adminClientTrustDestination: null,
    adminProvisionOperation: null,
    adminProvisionTargetUid: null,
    adminProvisionClerkUserId: null,
    adminAuthError: null,
    userClerkAuthRequested: userLifecycleConfig.userAuthRequested,
    userLifecycleRequested: userLifecycleConfig.userLifecycleRequested,
    userAuthSource: userLifecycleConfig.userAuthRequested ? 'awaiting-user-login' : null,
    userFirebaseCompatibility: null,
    userClerkMigration: null,
    userClerkUserId: null,
    userClientTrustStatus: null,
    userClientTrustStrategy: null,
    userClientTrustDestination: null,
    signupClerkProvision: null,
    passwordVerificationSource: null,
    passwordAuthoritySource: null,
    passwordFirebaseCompatibility: null,
    withdrawalAuthority: null,
    withdrawalClerkDeleted: null,
    withdrawalClerkCleanupError: null,
    withdrawalFirebaseCleanup: null,
    userLifecycleError: null,
    userSessionTrace: readUserAuthSessionTrace(),
    siteContentReadRequested: siteContentConfig.readRequested,
    siteContentWriteRequested: siteContentConfig.writeThroughRequested,
    siteContentReadSource: siteContentConfig.readRequested ? 'awaiting-content-view' : null,
    siteContentLastDomain: null,
    siteContentDocumentCount: null,
    siteContentPostgresDocumentCount: null,
    siteContentFirestoreDocumentCount: null,
    siteContentHomeBannerCount: null,
    siteContentHomeActiveHeroCount: null,
    siteContentHomeActivePromotionCount: null,
    siteContentHomeActiveQuickLinkCount: null,
    siteContentPopupPostCount: null,
    siteContentPopupActiveCount: null,
    siteContentPostgresSync: null,
    siteContentSyncAt: null,
    siteContentError: null,
    policyContentReadRequested: policyContentConfig.readRequested,
    policyContentWriteRequested: policyContentConfig.writeThroughRequested,
    policyContentReadSource: policyContentConfig.readRequested ? 'awaiting-policy-view' : null,
    policyContentLastDomain: null,
    policyContentDocumentCount: null,
    policyContentPostgresSync: null,
    policyContentSyncAt: null,
    policyContentError: null,
    boardContentReadRequested: boardContentConfig.readRequested,
    boardContentWriteRequested: boardContentConfig.writeRequested,
    boardContentReadSource: boardContentConfig.readRequested ? 'awaiting-board-view' : null,
    boardContentWriteSource: null,
    boardContentLastBoard: null,
    boardContentOperation: null,
    boardContentItemCount: null,
    boardContentTotalCount: null,
    boardContentCategoryCount: null,
    boardContentFirestoreMirror: null,
    boardContentSyncAt: null,
    boardContentError: null,
    legacyReadFallbackRetirementRequested: legacyReadFallbackConfig.requested,
    legacyReadFallbackAllowed: !legacyReadFallbackConfig.requested,
    legacyReadFallbackBlockedCount: 0,
    legacyReadFallbackLastDomain: null,
    legacyReadFallbackLastReason: null,
    writeMirrorRetirementRequested: writeMirrorRetirementConfig.enabled,
    writeMirrorRetirementBackendApplied: false,
    writeMirrorRetirementDomains: [],
    writeMirrorRetirementError: null,
    rentalWriteMirrorRetirementRequested: rentalWriteMirrorRetirementConfig.enabled,
    rentalWriteMirrorRetirementBackendApplied: false,
    rentalTransactionSource: null,
    rentalWriteMirrorRetirementError: null,
    memberStatusRestrictionRetirementRequested: memberStatusRestrictionRetirementConfig.enabled,
    memberStatusRestrictionRetirementBackendApplied: false,
    memberStatusRestrictionSource: null,
    memberStatusRestrictionRetiredDomains: [],
    memberStatusRestrictionRetirementError: null,
    memberProfileIdentityAuthorityRequested: memberProfileIdentityAuthorityConfig.requested,
    memberProfileIdentityAuthorityBackendApplied: false,
    memberProfileIdentitySource: null,
    memberProfileIdentityRetiredDomains: [],
    memberProfileIdentityAuthorityError: null,
    accountLifecycleAuthorityRequested: accountLifecycleAuthorityConfig.requested,
    accountLifecycleAuthorityBackendApplied: false,
    accountLifecycleSignupSource: null,
    accountLifecycleSignupFirestoreBootstrap: null,
    accountLifecycleTermsConsentSource: null,
    accountLifecycleTermsConsentMirror: null,
    accountLifecycleTermsConsentBootstrap: null,
    accountLifecyclePasswordResetDelivery: null,
    accountLifecyclePasswordResetStatus: null,
    accountLifecycleRecoverySource: null,
    accountLifecycleAuthorityError: null,
    userFirebaseRetirementRequested: userFirebaseRetirementConfig.requested,
    userFirebaseRetirementBackendApplied: false,
    userFirebaseRuntimeSource: null,
    userLegacyMemberKeySource: null,
    phase33PasswordResetDelivery: null,
    phase33SiteContentAuthorityRequested: Boolean(siteContentConfig.authorityRequested),
    phase33PolicyContentAuthorityRequested: Boolean(policyContentConfig.authorityRequested),
    phase33Error: null,
    error: null,
  });

  useEffect(() => {
    if (!requested) return undefined;

    let active = true;
    let unsubscribe = null;

    clerkStagingClient
      .initialize()
      .then((clerk) => {
        if (!active) return;
        const applySnapshot = (snapshot) => {
          if (!active) return;
          setState((current) => ({
            ...current,
            phase: 'ready',
            ...snapshot,
            backendUserId: snapshot.signedIn ? current.backendUserId : null,
            postgresUserId: snapshot.signedIn ? current.postgresUserId : null,
            primaryEmail: snapshot.signedIn ? current.primaryEmail : null,
            primaryEmailVerified: snapshot.signedIn ? current.primaryEmailVerified : false,
            memberShadowFirebaseUid: snapshot.signedIn ? current.memberShadowFirebaseUid : null,
            memberShadowName: snapshot.signedIn ? current.memberShadowName : null,
            memberShadowTeam: snapshot.signedIn ? current.memberShadowTeam : null,
            memberShadowStatus: snapshot.signedIn ? current.memberShadowStatus : null,
            memberShadowSourceHash: snapshot.signedIn ? current.memberShadowSourceHash : null,
            memberShadowSyncedAt: snapshot.signedIn ? current.memberShadowSyncedAt : null,
            memberShadowEquivalent: snapshot.signedIn ? current.memberShadowEquivalent : null,
            memberShadowChangedFields: snapshot.signedIn ? current.memberShadowChangedFields : [],
            error: null,
          }));
        };

        applySnapshot(getClerkSnapshot(clerk));
        unsubscribe = clerk.addListener(({ session, user }) =>
          applySnapshot({
            signedIn: Boolean(session && user),
            userId: user?.id || null,
            sessionId: session?.id || null,
          }),
        );
      })
      .catch((error) => {
        if (!active) return;
        setState((current) => ({ ...current, phase: 'error', error: error.message }));
      });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyTrace = (trace) => {
      setState((current) => ({
        ...current,
        userSessionTrace: Array.isArray(trace) ? trace : [],
      }));
    };
    applyTrace(readUserAuthSessionTrace());
    return subscribeUserAuthSessionTrace(applyTrace);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    return onAuthStateChanged(firebaseAuth, (user) => {
      setState((current) => ({
        ...current,
        firebaseSignedIn: Boolean(user),
        firebaseUserId: user?.uid || null,
        legacyFirebaseUid: user ? current.legacyFirebaseUid : null,
        legacyFirebaseEmail: user ? current.legacyFirebaseEmail : null,
        legacyFirebaseEmailVerified: user ? current.legacyFirebaseEmailVerified : false,
        legacyFirebaseSignInProvider: user ? current.legacyFirebaseSignInProvider : null,
      }));
    });
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;

    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        appReadFirebaseUid: observation?.firebaseUid || null,
        appReadProfile: observation?.profile || null,
        memberReadCandidateEquivalent: null,
        memberReadCandidateChangedFields: [],
      }));
    };

    applyObservation(getLatestMemberProfileReadObservation());
    return subscribeMemberProfileReadObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyCutover = (observation) => {
      setState((current) => ({
        ...current,
        cutoverRequested: Boolean(observation?.requested),
        cutoverActiveSource: observation?.activeSource || null,
        cutoverEquivalent:
          typeof observation?.equivalent === 'boolean' ? observation.equivalent : null,
        cutoverChangedFields: observation?.changedFields || [],
        cutoverFallbackReason: observation?.fallbackReason || null,
        firestoreWatcherDisabled: Boolean(observation?.firestoreWatcherDisabled),
        firestoreFallbackReads: Number(observation?.firestoreFallbackReads) || 0,
      }));
    };
    applyCutover(getLatestMemberProfileCutoverObservation());
    return subscribeMemberProfileCutoverObservation(applyCutover);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyWriteThrough = (observation) => {
      setState((current) => ({
        ...current,
        writeThroughStatus: observation?.status || null,
        writeThroughReason: observation?.reason || null,
        writeThroughFirebaseUid: observation?.firebaseUid || null,
        writeThroughBackendReason: observation?.backendReason || null,
        writeThroughErrorCode: observation?.errorCode || null,
        writeThroughCounters: observation?.counters || current.writeThroughCounters,
      }));
    };
    applyWriteThrough(getLatestMemberProfileWriteThroughObservation());
    return subscribeMemberProfileWriteThroughObservation(applyWriteThrough);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        restrictionCutoverRequested: Boolean(observation?.requested),
        restrictionActiveSource: observation?.activeSource || null,
        restrictionWatcherDisabled: Boolean(observation?.firestoreWatcherDisabled),
        restrictionFallbackReads: Number(observation?.firestoreFallbackReads) || 0,
        restrictionFallbackReason: observation?.fallbackReason || null,
      }));
    };
    applyObservation(getLatestRentalRestrictionCutoverObservation());
    return subscribeRentalRestrictionCutoverObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      if (!observation) return;
      setState((current) => ({
        ...current,
        userFirebaseRetirementRequested: Object.prototype.hasOwnProperty.call(observation, 'requested')
          ? Boolean(observation.requested)
          : current.userFirebaseRetirementRequested,
        userFirebaseRuntimeSource: observation?.userAuthSource || observation?.source || current.userFirebaseRuntimeSource,
        phase33Error: observation?.error || '',
      }));
    };
    applyObservation(getLatestUserFirebaseAuthRetirementObservation());
    return subscribeUserFirebaseAuthRetirementObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        restrictionWriteStatus: observation?.status || null,
        restrictionWriteReason: observation?.reason || null,
        restrictionWriteFirebaseUid: observation?.firebaseUid || null,
        restrictionWriteCounters: observation?.counters || current.restrictionWriteCounters,
      }));
    };
    applyObservation(getLatestRentalRestrictionWriteThroughObservation());
    return subscribeRentalRestrictionWriteThroughObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested || !rentalRequestParityConfig.requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        rentalRequestFirestoreCount: Number(observation?.count) || 0,
        rentalRequestEquivalent: null,
        rentalRequestChangedRequestIds: [],
        rentalRequestChangedFields: [],
      }));
    };
    applyObservation(getLatestRentalRequestReadObservation());
    return subscribeRentalRequestReadObservation(applyObservation);
  }, [requested, rentalRequestParityConfig.requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        rentalRequestCutoverRequested: Boolean(observation?.requested),
        rentalRequestActiveSource: observation?.activeSource || null,
        rentalRequestCutoverEquivalent:
          typeof observation?.equivalent === 'boolean' ? observation.equivalent : null,
        rentalRequestCutoverChangedRequestIds: observation?.changedRequestIds || [],
        rentalRequestCutoverChangedFields: observation?.changedFields || [],
        rentalRequestCutoverFallbackReason: observation?.fallbackReason || null,
        rentalRequestWatcherDisabled: Boolean(observation?.firestoreWatcherDisabled),
        rentalRequestFallbackReads: Number(observation?.firestoreFallbackReads) || 0,
        rentalRequestCutoverShadowSyncedAt: observation?.shadowSyncedAt || null,
        rentalRequestSourceRefreshes: Number(observation?.sourceRefreshes) || 0,
      }));
    };
    applyObservation(getLatestRentalRequestCutoverObservation());
    return subscribeRentalRequestCutoverObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        rentalRequestWriteRequested: observation ? Boolean(observation.requested) : rentalRequestWriteConfig.requested,
        rentalRequestWriteSource: observation?.activeWriteSource || null,
        rentalRequestWriteRequestId: observation?.requestId || null,
        rentalRequestWriteMirror: observation?.firestoreMirror || null,
        rentalRequestWriteShadowSynchronized:
          observation && typeof observation.shadowSynchronized === 'boolean'
            ? observation.shadowSynchronized
            : null,
        rentalRequestWriteReused: Boolean(observation?.reused),
        rentalRequestWriteError: observation?.error || null,
      }));
    };
    applyObservation(getLatestRentalRequestWriteObservation());
    return subscribeRentalRequestWriteObservation(applyObservation);
  }, [requested, rentalRequestWriteConfig.requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        rentalRequestUserActionRequested: observation
          ? Boolean(observation.requested)
          : rentalRequestUserActionConfig.requested,
        rentalRequestUserActionSource: observation?.source || null,
        rentalRequestUserActionOperation: observation?.operation || null,
        rentalRequestUserActionRequestId: observation?.requestId || null,
        rentalRequestUserActionApprovalMode: observation?.approvalMode || null,
        rentalRequestUserActionMirror: observation?.firestoreMirror || null,
        rentalRequestUserActionShadowSynchronized:
          observation && typeof observation.shadowSynchronized === 'boolean'
            ? observation.shadowSynchronized
            : null,
        rentalRequestUserActionError: observation?.error || null,
      }));
    };
    applyObservation(getLatestRentalRequestUserActionObservation());
    return subscribeRentalRequestUserActionObservation(applyObservation);
  }, [requested, rentalRequestUserActionConfig.requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        adminRentalRequestReadRequested:
          observation && Object.prototype.hasOwnProperty.call(observation, 'readRequested')
            ? Boolean(observation.readRequested)
            : current.adminRentalRequestReadRequested,
        adminRentalRequestReadSource: observation?.readSource || current.adminRentalRequestReadSource,
        adminRentalRequestWatcherDisabled:
          observation?.firestoreWatcher
            ? observation.firestoreWatcher === 'disabled'
            : current.adminRentalRequestWatcherDisabled,
        adminRentalRequestBootstrapCount:
          observation && Object.prototype.hasOwnProperty.call(observation, 'bootstrapCount')
            ? observation.bootstrapCount
            : current.adminRentalRequestBootstrapCount,
        adminRentalRequestTotalCount:
          observation && Object.prototype.hasOwnProperty.call(observation, 'totalCount')
            ? observation.totalCount
            : current.adminRentalRequestTotalCount,
        adminRentalRequestAuditSource: observation?.auditSource || current.adminRentalRequestAuditSource,
        adminRentalRequestAuditCount:
          observation && Object.prototype.hasOwnProperty.call(observation, 'auditCount')
            ? observation.auditCount
            : current.adminRentalRequestAuditCount,
        adminRentalRequestWriteRequested:
          observation && Object.prototype.hasOwnProperty.call(observation, 'writeRequested')
            ? Boolean(observation.writeRequested)
            : current.adminRentalRequestWriteRequested,
        adminRentalRequestWriteSource: observation?.writeSource || current.adminRentalRequestWriteSource,
        adminRentalRequestWriteRequestId: observation?.requestId || current.adminRentalRequestWriteRequestId,
        adminRentalRequestWriteOperation: observation?.operation || current.adminRentalRequestWriteOperation,
        adminRentalRequestWriteNextStatus: observation?.nextStatus || current.adminRentalRequestWriteNextStatus,
        adminRentalRequestWriteMirror: observation?.firestoreMirror || current.adminRentalRequestWriteMirror,
        adminRentalRequestError:
          observation && Object.prototype.hasOwnProperty.call(observation, 'error')
            ? observation.error || null
            : current.adminRentalRequestError,
      }));
    };
    applyObservation(getLatestAdminRentalRequestCutoverObservation());
    return subscribeAdminRentalRequestCutoverObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        assetReadRequested:
          observation && Object.prototype.hasOwnProperty.call(observation, 'readRequested')
            ? Boolean(observation.readRequested)
            : current.assetReadRequested,
        assetWriteRequested:
          observation && Object.prototype.hasOwnProperty.call(observation, 'writeRequested')
            ? Boolean(observation.writeRequested)
            : current.assetWriteRequested,
        assetActiveSource: observation?.activeSource || current.assetActiveSource,
        assetWatcherDisabled:
          observation && Object.prototype.hasOwnProperty.call(observation, 'assetWatcherDisabled')
            ? Boolean(observation.assetWatcherDisabled)
            : current.assetWatcherDisabled,
        assetAvailabilityWatcherDisabled:
          observation && Object.prototype.hasOwnProperty.call(observation, 'availabilityWatcherDisabled')
            ? Boolean(observation.availabilityWatcherDisabled)
            : current.assetAvailabilityWatcherDisabled,
        assetCount:
          observation && Object.prototype.hasOwnProperty.call(observation, 'assetCount')
            ? Number(observation.assetCount) || 0
            : current.assetCount,
        assetCategoryCount:
          observation && Object.prototype.hasOwnProperty.call(observation, 'categoryCount')
            ? Number(observation.categoryCount) || 0
            : current.assetCategoryCount,
        assetAvailabilityCount:
          observation && Object.prototype.hasOwnProperty.call(observation, 'availabilityCount')
            ? Number(observation.availabilityCount) || 0
            : current.assetAvailabilityCount,
        assetFirestoreFallbackReads:
          observation && Object.prototype.hasOwnProperty.call(observation, 'firestoreFallbackReads')
            ? Number(observation.firestoreFallbackReads) || 0
            : current.assetFirestoreFallbackReads,
        assetBootstrapped:
          observation && Object.prototype.hasOwnProperty.call(observation, 'bootstrapped')
            ? Boolean(observation.bootstrapped)
            : current.assetBootstrapped,
        assetSyncAt: observation?.syncAt || current.assetSyncAt,
        assetWriteSource: observation?.writeSource || current.assetWriteSource,
        assetFirestoreMirror: observation?.firestoreMirror || current.assetFirestoreMirror,
        assetError:
          observation && Object.prototype.hasOwnProperty.call(observation, 'error')
            ? observation.error || null
            : current.assetError,
      }));
    };
    applyObservation(getLatestAssetDomainCutoverObservation());
    return subscribeAssetDomainCutoverObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        memberAuthorityWriteRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'memberWriteRequested')
          ? Boolean(observation.memberWriteRequested)
          : current.memberAuthorityWriteRequested,
        memberAuthorityWriteSource: observation?.memberWriteSource || current.memberAuthorityWriteSource,
        memberAuthorityMirror: observation?.memberFirestoreMirror || current.memberAuthorityMirror,
        memberAuthorityMutationId: observation?.memberMutationId || current.memberAuthorityMutationId,
        memberAuthorityOperation: observation?.operation || current.memberAuthorityOperation,
        adminMemberReadSource: observation?.adminMemberReadSource || current.adminMemberReadSource,
        adminMemberReadCount: observation && Object.prototype.hasOwnProperty.call(observation, 'adminMemberReadCount')
          ? Number(observation.adminMemberReadCount || 0)
          : current.adminMemberReadCount,
        restrictionAuthorityWriteRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'restrictionWriteRequested')
          ? Boolean(observation.restrictionWriteRequested)
          : current.restrictionAuthorityWriteRequested,
        restrictionAuthorityWriteSource: observation?.restrictionWriteSource || current.restrictionAuthorityWriteSource,
        adminIdentityRegistryRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'adminRegistryRequested')
          ? Boolean(observation.adminRegistryRequested)
          : current.adminIdentityRegistryRequested,
        adminIdentityRegistrySource: observation?.adminRegistrySource || current.adminIdentityRegistrySource,
        adminIdentityRegistryCount: observation && Object.prototype.hasOwnProperty.call(observation, 'adminRegistryCount')
          ? observation.adminRegistryCount
          : current.adminIdentityRegistryCount,
        adminIdentityRegistryError: observation?.adminRegistryError || '',
        memberAuthorityError: observation?.error || '',
      }));
    };
    applyObservation(getLatestMemberAuthorityObservation());
    return subscribeMemberAuthorityObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        accountRecoveryRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'accountRecoveryRequested')
          ? Boolean(observation.accountRecoveryRequested)
          : current.accountRecoveryRequested,
        accountRecoverySource: observation?.accountRecoverySource || current.accountRecoverySource,
        accountRecoveryFallback: observation && Object.prototype.hasOwnProperty.call(observation, 'accountRecoveryFallback')
          ? Boolean(observation.accountRecoveryFallback)
          : current.accountRecoveryFallback,
        accountRecoveryOperation: observation?.accountRecoveryOperation || current.accountRecoveryOperation,
        accountRecoveryError: observation && Object.prototype.hasOwnProperty.call(observation, 'accountRecoveryError')
          ? observation.accountRecoveryError || null
          : current.accountRecoveryError,
        adminClerkAuthRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'adminClerkAuthRequested')
          ? Boolean(observation.adminClerkAuthRequested)
          : current.adminClerkAuthRequested,
        adminAuthSource: observation?.adminAuthSource || current.adminAuthSource,
        adminFirebaseCompatibility: observation?.adminFirebaseCompatibility || current.adminFirebaseCompatibility,
        adminClerkMigration: observation?.adminClerkMigration || current.adminClerkMigration,
        adminClerkUserId: observation?.adminClerkUserId || current.adminClerkUserId,
        adminClientTrustStatus: observation?.adminClientTrustStatus || current.adminClientTrustStatus,
        adminClientTrustStrategy: observation?.adminClientTrustStrategy || current.adminClientTrustStrategy,
        adminClientTrustDestination: observation?.adminClientTrustDestination || current.adminClientTrustDestination,
        adminProvisionOperation: observation?.adminProvisionOperation || current.adminProvisionOperation,
        adminProvisionTargetUid: observation?.adminProvisionTargetUid || current.adminProvisionTargetUid,
        adminProvisionClerkUserId: observation?.adminProvisionClerkUserId || current.adminProvisionClerkUserId,
        adminAuthError: observation && Object.prototype.hasOwnProperty.call(observation, 'adminAuthError')
          ? observation.adminAuthError || null
          : current.adminAuthError,
      }));
    };
    applyObservation(getLatestAccountAuthObservation());
    return subscribeAccountAuthObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        userClerkAuthRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'userAuthRequested')
          ? Boolean(observation.userAuthRequested)
          : current.userClerkAuthRequested,
        userLifecycleRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'userLifecycleRequested')
          ? Boolean(observation.userLifecycleRequested)
          : current.userLifecycleRequested,
        userAuthSource: observation?.userAuthSource || current.userAuthSource,
        userFirebaseCompatibility: observation?.userFirebaseCompatibility || current.userFirebaseCompatibility,
        userClerkMigration: observation?.userClerkMigration || current.userClerkMigration,
        userClerkUserId: observation?.userClerkUser || current.userClerkUserId,
        userClientTrustStatus: observation?.userClientTrustStatus || current.userClientTrustStatus,
        userClientTrustStrategy: observation?.userClientTrustStrategy || current.userClientTrustStrategy,
        userClientTrustDestination: observation?.userClientTrustDestination || current.userClientTrustDestination,
        signupClerkProvision: observation?.signupClerkProvision || current.signupClerkProvision,
        passwordVerificationSource: observation?.passwordVerificationSource || current.passwordVerificationSource,
        passwordAuthoritySource: observation?.passwordAuthoritySource || current.passwordAuthoritySource,
        passwordFirebaseCompatibility: observation?.passwordFirebaseCompatibility || current.passwordFirebaseCompatibility,
        withdrawalAuthority: observation?.withdrawalAuthority || current.withdrawalAuthority,
        withdrawalClerkDeleted: observation?.withdrawalClerkDeleted || current.withdrawalClerkDeleted,
        withdrawalClerkCleanupError: observation && Object.prototype.hasOwnProperty.call(observation, 'withdrawalClerkCleanupError')
          ? observation.withdrawalClerkCleanupError || null
          : current.withdrawalClerkCleanupError,
        withdrawalFirebaseCleanup: observation?.withdrawalFirebaseCleanup || current.withdrawalFirebaseCleanup,
        userLifecycleError: observation && Object.prototype.hasOwnProperty.call(observation, 'error')
          ? observation.error || null
          : current.userLifecycleError,
      }));
    };
    applyObservation(getLatestUserAccountLifecycleObservation());
    return subscribeUserAccountLifecycleObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        siteContentReadRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'readRequested')
          ? Boolean(observation.readRequested)
          : current.siteContentReadRequested,
        siteContentWriteRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'writeThroughRequested')
          ? Boolean(observation.writeThroughRequested)
          : current.siteContentWriteRequested,
        siteContentReadSource: observation?.readSource || current.siteContentReadSource,
        siteContentLastDomain: observation?.domain || current.siteContentLastDomain,
        siteContentDocumentCount: observation && Object.prototype.hasOwnProperty.call(observation, 'documentCount')
          ? observation.documentCount
          : current.siteContentDocumentCount,
        siteContentPostgresDocumentCount: observation && Object.prototype.hasOwnProperty.call(observation, 'postgresDocumentCount')
          ? observation.postgresDocumentCount
          : current.siteContentPostgresDocumentCount,
        siteContentFirestoreDocumentCount: observation && Object.prototype.hasOwnProperty.call(observation, 'firestoreDocumentCount')
          ? observation.firestoreDocumentCount
          : current.siteContentFirestoreDocumentCount,
        siteContentHomeBannerCount: observation && Object.prototype.hasOwnProperty.call(observation, 'homeBannerCount')
          ? observation.homeBannerCount
          : current.siteContentHomeBannerCount,
        siteContentHomeActiveHeroCount: observation && Object.prototype.hasOwnProperty.call(observation, 'homeActiveHeroCount')
          ? observation.homeActiveHeroCount
          : current.siteContentHomeActiveHeroCount,
        siteContentHomeActivePromotionCount: observation && Object.prototype.hasOwnProperty.call(observation, 'homeActivePromotionCount')
          ? observation.homeActivePromotionCount
          : current.siteContentHomeActivePromotionCount,
        siteContentHomeActiveQuickLinkCount: observation && Object.prototype.hasOwnProperty.call(observation, 'homeActiveQuickLinkCount')
          ? observation.homeActiveQuickLinkCount
          : current.siteContentHomeActiveQuickLinkCount,
        siteContentPopupPostCount: observation && Object.prototype.hasOwnProperty.call(observation, 'popupPostCount')
          ? observation.popupPostCount
          : current.siteContentPopupPostCount,
        siteContentPopupActiveCount: observation && Object.prototype.hasOwnProperty.call(observation, 'popupActiveCount')
          ? observation.popupActiveCount
          : current.siteContentPopupActiveCount,
        siteContentPostgresSync: observation?.postgresSync || current.siteContentPostgresSync,
        siteContentSyncAt: observation?.syncAt || current.siteContentSyncAt,
        siteContentError: observation && Object.prototype.hasOwnProperty.call(observation, 'error')
          ? observation.error || null
          : current.siteContentError,
      }));
    };
    applyObservation(getLatestSiteContentObservation());
    return subscribeSiteContentObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        policyContentReadRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'readRequested')
          ? Boolean(observation.readRequested)
          : current.policyContentReadRequested,
        policyContentWriteRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'writeThroughRequested')
          ? Boolean(observation.writeThroughRequested)
          : current.policyContentWriteRequested,
        policyContentReadSource: observation?.readSource || current.policyContentReadSource,
        policyContentLastDomain: observation?.domain || current.policyContentLastDomain,
        policyContentDocumentCount: observation && Object.prototype.hasOwnProperty.call(observation, 'documentCount')
          ? observation.documentCount
          : current.policyContentDocumentCount,
        policyContentPostgresSync: observation?.postgresSync || current.policyContentPostgresSync,
        policyContentSyncAt: observation?.syncAt || current.policyContentSyncAt,
        policyContentError: observation && Object.prototype.hasOwnProperty.call(observation, 'error')
          ? observation.error || null
          : current.policyContentError,
      }));
    };
    applyObservation(getLatestPolicyContentObservation());
    return subscribePolicyContentObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        boardContentReadRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'readRequested')
          ? Boolean(observation.readRequested)
          : current.boardContentReadRequested,
        boardContentWriteRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'writeRequested')
          ? Boolean(observation.writeRequested)
          : current.boardContentWriteRequested,
        boardContentReadSource: observation?.readSource || current.boardContentReadSource,
        boardContentWriteSource: observation?.writeSource || current.boardContentWriteSource,
        boardContentLastBoard: observation?.boardType || current.boardContentLastBoard,
        boardContentOperation: observation?.operation || current.boardContentOperation,
        boardContentItemCount: observation && Object.prototype.hasOwnProperty.call(observation, 'itemCount')
          ? observation.itemCount
          : current.boardContentItemCount,
        boardContentTotalCount: observation && Object.prototype.hasOwnProperty.call(observation, 'totalCount')
          ? observation.totalCount
          : current.boardContentTotalCount,
        boardContentCategoryCount: observation && Object.prototype.hasOwnProperty.call(observation, 'categoryCount')
          ? observation.categoryCount
          : current.boardContentCategoryCount,
        boardContentFirestoreMirror: observation?.firestoreMirror || current.boardContentFirestoreMirror,
        boardContentSyncAt: observation?.syncAt || current.boardContentSyncAt,
        boardContentError: observation && Object.prototype.hasOwnProperty.call(observation, 'error')
          ? observation.error || null
          : current.boardContentError,
      }));
    };
    applyObservation(getLatestBoardContentObservation());
    return subscribeBoardContentObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      setState((current) => ({
        ...current,
        legacyReadFallbackRetirementRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'requested')
          ? Boolean(observation.requested)
          : current.legacyReadFallbackRetirementRequested,
        legacyReadFallbackAllowed: observation && Object.prototype.hasOwnProperty.call(observation, 'fallbackAllowed')
          ? Boolean(observation.fallbackAllowed)
          : current.legacyReadFallbackAllowed,
        legacyReadFallbackBlockedCount: observation && Object.prototype.hasOwnProperty.call(observation, 'blockedCount')
          ? Number(observation.blockedCount || 0)
          : current.legacyReadFallbackBlockedCount,
        legacyReadFallbackLastDomain: observation?.lastBlockedDomain || current.legacyReadFallbackLastDomain,
        legacyReadFallbackLastReason: observation?.lastBlockedReason || current.legacyReadFallbackLastReason,
      }));
    };
    applyObservation(getLatestLegacyFirestoreReadFallbackObservation());
    return subscribeLegacyFirestoreReadFallbackObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    let active = true;
    requestFirestoreWriteMirrorRetirementStatus({ config: writeMirrorRetirementConfig })
      .then((status) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          writeMirrorRetirementRequested: Boolean(status.requested),
          writeMirrorRetirementBackendApplied: Boolean(status.backendApplied),
          writeMirrorRetirementDomains: Array.isArray(status.retiredDomains) ? status.retiredDomains : [],
          writeMirrorRetirementError: status.error || null,
        }));
      });
    return () => { active = false; };
  }, [requested, writeMirrorRetirementConfig]);

  useEffect(() => {
    if (!requested) return undefined;
    let active = true;
    requestRentalRequestWriteMirrorRetirementStatus({ config: rentalWriteMirrorRetirementConfig })
      .then((status) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          rentalWriteMirrorRetirementRequested: Boolean(status.requested),
          rentalWriteMirrorRetirementBackendApplied: Boolean(status.backendApplied),
          rentalTransactionSource: status.transactionSource || null,
          rentalWriteMirrorRetirementError: status.error || null,
        }));
      });
    return () => { active = false; };
  }, [requested, rentalWriteMirrorRetirementConfig]);


  useEffect(() => {
    if (!requested) return undefined;
    let active = true;
    requestMemberStatusRestrictionWriteMirrorRetirementStatus({ config: memberStatusRestrictionRetirementConfig })
      .then((status) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          memberStatusRestrictionRetirementRequested: Boolean(status.requested),
          memberStatusRestrictionRetirementBackendApplied: Boolean(status.backendApplied),
          memberStatusRestrictionSource: status.source || null,
          memberStatusRestrictionRetiredDomains: Array.isArray(status.retiredDomains) ? status.retiredDomains : [],
          memberStatusRestrictionRetirementError: status.error || null,
        }));
      });
    return () => { active = false; };
  }, [requested, memberStatusRestrictionRetirementConfig]);

  useEffect(() => {
    if (!requested) return undefined;
    const applyObservation = (observation) => {
      if (!observation) return;
      setState((current) => ({
        ...current,
        accountLifecycleAuthorityRequested: observation && Object.prototype.hasOwnProperty.call(observation, 'requested') ? Boolean(observation.requested) : current.accountLifecycleAuthorityRequested,
        accountLifecycleAuthorityBackendApplied: observation && Object.prototype.hasOwnProperty.call(observation, 'backendApplied') ? Boolean(observation.backendApplied) : current.accountLifecycleAuthorityBackendApplied,
        accountLifecycleSignupSource: observation?.signupSource || current.accountLifecycleSignupSource,
        accountLifecycleSignupFirestoreBootstrap: observation?.signupFirestoreBootstrap || current.accountLifecycleSignupFirestoreBootstrap,
        accountLifecycleTermsConsentSource: observation?.termsConsentSource || current.accountLifecycleTermsConsentSource,
        accountLifecycleTermsConsentMirror: observation?.termsConsentMirror || current.accountLifecycleTermsConsentMirror,
        accountLifecycleTermsConsentBootstrap: observation?.termsConsentBootstrap || current.accountLifecycleTermsConsentBootstrap,
        accountLifecyclePasswordResetDelivery: observation?.passwordResetDelivery || current.accountLifecyclePasswordResetDelivery,
        accountLifecyclePasswordResetStatus: observation?.passwordResetStatus || current.accountLifecyclePasswordResetStatus,
        accountLifecycleRecoverySource: observation?.accountRecoverySource || current.accountLifecycleRecoverySource,
        accountLifecycleAuthorityError: observation?.error || '',
      }));
    };
    applyObservation(getLatestAccountLifecycleAuthorityObservation());
    return subscribeAccountLifecycleAuthorityObservation(applyObservation);
  }, [requested]);

  useEffect(() => {
    if (!requested) return undefined;
    let active = true;
    requestMemberProfileIdentityAuthorityStatus({ config: memberProfileIdentityAuthorityConfig })
      .then((status) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          memberProfileIdentityAuthorityRequested: Boolean(status.requested),
          memberProfileIdentityAuthorityBackendApplied: Boolean(status.backendApplied),
          memberProfileIdentitySource: status.identitySource || status.source || null,
          memberProfileIdentityRetiredDomains: Array.isArray(status.retiredDomains) ? status.retiredDomains : [],
          memberProfileIdentityAuthorityError: status.error || null,
        }));
      });
    return () => { active = false; };
  }, [requested, memberProfileIdentityAuthorityConfig]);

  useEffect(() => {
    if (!requested) return undefined;
    let active = true;
    requestAccountLifecycleAuthorityStatus({ config: accountLifecycleAuthorityConfig })
      .then((status) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          accountLifecycleAuthorityRequested: Boolean(status.requested),
          accountLifecycleAuthorityBackendApplied: Boolean(status.backendApplied),
          accountLifecycleSignupSource: status.signupSource || current.accountLifecycleSignupSource,
          accountLifecycleTermsConsentSource: status.termsConsentSource || current.accountLifecycleTermsConsentSource,
          accountLifecyclePasswordResetDelivery: status.passwordResetDelivery || current.accountLifecyclePasswordResetDelivery,
          userFirebaseRetirementBackendApplied: Boolean(status.userFirebaseAuthCompatibilityDisabled),
          userFirebaseRuntimeSource: status.userAuthenticationSource || current.userFirebaseRuntimeSource,
          userLegacyMemberKeySource: status.userLegacyMemberKeySource || current.userLegacyMemberKeySource,
          phase33PasswordResetDelivery: status.passwordResetDelivery || current.phase33PasswordResetDelivery,
          accountLifecycleAuthorityError: status.error || null,
        }));
      });
    return () => { active = false; };
  }, [requested, accountLifecycleAuthorityConfig]);

  if (!requested) return null;

  const run = async (operation) => {
    setState((current) => ({ ...current, error: null }));
    try {
      await operation();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message || 'Clerk test action failed.' }));
    }
  };

  const applyBackendIdentity = (user) => {
    setState((current) => ({
      ...current,
      postgresUserId: user?.id || null,
      primaryEmail: user?.primaryEmail || null,
      primaryEmailVerified: Boolean(user?.primaryEmailVerified),
      error: null,
    }));
  };

  const applyFirebaseLink = (link) => {
    setState((current) => ({
      ...current,
      legacyFirebaseUid: link?.firebaseUid || null,
      legacyFirebaseEmail: link?.firebaseEmail || null,
      legacyFirebaseEmailVerified: Boolean(link?.firebaseEmailVerified),
      legacyFirebaseSignInProvider: link?.firebaseSignInProvider || null,
      error: null,
    }));
  };

  const applyMemberShadow = (shadow) => {
    setState((current) => ({
      ...current,
      memberShadowFirebaseUid: shadow?.firebaseUid || null,
      memberShadowName: shadow?.name || null,
      memberShadowTeam: shadow?.team || null,
      memberShadowStatus: shadow?.status || null,
      memberShadowSourceHash: shadow?.sourceHash || null,
      memberShadowSyncedAt: shadow?.syncedAt || null,
      memberShadowEquivalent: shadow ? current.memberShadowEquivalent : null,
      memberShadowChangedFields: shadow ? current.memberShadowChangedFields : [],
      error: null,
    }));
  };

  const verifyBackend = () =>
    run(async () => {
      const payload = await clerkStagingClient.verifyBackendSession();
      setState((current) => ({
        ...current,
        backendUserId: payload.session.userId,
        error: null,
      }));
    });

  const syncIdentity = () =>
    run(async () => {
      const payload = await clerkStagingClient.syncBackendUserIdentity();
      applyBackendIdentity(payload.user);
    });

  const readIdentity = () =>
    run(async () => {
      const payload = await clerkStagingClient.getBackendUserIdentity();
      if (!payload) {
        setState((current) => ({ ...current, postgresUserId: null, primaryEmail: null }));
        return;
      }
      applyBackendIdentity(payload.user);
    });

  const linkFirebaseIdentity = () =>
    run(async () => {
      const firebaseUser = firebaseAuth.currentUser;
      if (!firebaseUser) throw new Error('기존 Firebase 로그인이 필요합니다. 먼저 홈페이지 계정으로 로그인해 주세요.');
      const firebaseIdToken = await firebaseUser.getIdToken(true);
      const payload = await clerkStagingClient.linkFirebaseLegacyAccount(firebaseIdToken);
      applyFirebaseLink(payload.firebaseLink);
    });

  const readFirebaseLink = () =>
    run(async () => {
      const payload = await clerkStagingClient.getFirebaseLegacyLink();
      if (!payload) {
        applyFirebaseLink(null);
        return;
      }
      applyFirebaseLink(payload.firebaseLink);
    });


  const readMemberShadow = () =>
    run(async () => {
      const payload = await clerkStagingClient.getMemberShadow();
      if (!payload) {
        applyMemberShadow(null);
        return;
      }
      applyMemberShadow(payload.memberShadow);
    });

  const syncMemberShadow = () =>
    run(async () => {
      const firebaseUser = firebaseAuth.currentUser;
      if (!firebaseUser) throw new Error('기존 Firebase 로그인이 필요합니다. 먼저 홈페이지 계정으로 로그인해 주세요.');
      const firebaseIdToken = await firebaseUser.getIdToken(true);
      const payload = await clerkStagingClient.syncMemberShadow(firebaseIdToken);
      applyMemberShadow(payload.memberShadow);
      setState((current) => ({
        ...current,
        memberShadowEquivalent: true,
        memberShadowChangedFields: [],
        error: null,
      }));
    });

  const compareMemberShadow = () =>
    run(async () => {
      const firebaseUser = firebaseAuth.currentUser;
      if (!firebaseUser) throw new Error('기존 Firebase 로그인이 필요합니다. 먼저 홈페이지 계정으로 로그인해 주세요.');
      const firebaseIdToken = await firebaseUser.getIdToken(true);
      const payload = await clerkStagingClient.compareMemberShadow(firebaseIdToken);
      if (!payload) {
        setState((current) => ({
          ...current,
          memberShadowEquivalent: null,
          memberShadowChangedFields: [],
          error: null,
        }));
        return;
      }
      setState((current) => ({
        ...current,
        memberShadowEquivalent: Boolean(payload.comparison.equivalent),
        memberShadowChangedFields: payload.comparison.changedFields || [],
        error: null,
      }));
    });

  const verifyMemberReadParity = () =>
    run(async () => {
      const observation = getLatestMemberProfileReadObservation();
      if (!observation?.profile) {
        setState((current) => ({ ...current, error: null }));
        return;
      }
      const payload = await clerkStagingClient.getMemberProfileReadCandidate();
      if (!payload?.readCandidate?.profile) {
        throw new Error('PostgreSQL member profile read candidate is not available.');
      }
      const comparison = compareMemberProfileReads(
        observation.profile,
        payload.readCandidate.profile,
      );
      setState((current) => ({
        ...current,
        appReadFirebaseUid: observation.firebaseUid || null,
        appReadProfile: observation.profile,
        memberReadCandidateSource: payload.readCandidate.source || null,
        memberReadCandidateProfile: payload.readCandidate.profile,
        memberReadCandidateEquivalent: comparison.equivalent,
        memberReadCandidateChangedFields: comparison.changedFields,
        error: null,
      }));
    });


  const syncAndVerifyRentalRequestParity = () =>
    run(async () => {
      if (!rentalRequestParityConfig.requested) {
        throw new Error('Phase 14 rental request parity opt-in is not enabled for this session.');
      }
      const observation = getLatestRentalRequestReadObservation();
      if (!observation?.requests) {
        throw new Error('The application Firestore rental request list has not been observed yet. Open 신청내역 first.');
      }
      const firebaseUser = firebaseAuth.currentUser;
      if (!firebaseUser) throw new Error('기존 Firebase 로그인이 필요합니다. 먼저 홈페이지 계정으로 로그인해 주세요.');
      const firebaseIdToken = await firebaseUser.getIdToken(true);
      const syncPayload = await clerkStagingClient.syncRentalRequestShadow(firebaseIdToken);
      const candidate = syncPayload?.rentalRequestCandidate;
      if (!candidate?.requests) throw new Error('PostgreSQL rental request read candidate is not available after synchronization.');
      const comparison = compareRentalRequestReads(observation.requests, candidate.requests);
      const backendPayload = await clerkStagingClient.compareRentalRequestShadow(firebaseIdToken);
      setState((current) => ({
        ...current,
        rentalRequestFirestoreCount: comparison.firestoreCount,
        rentalRequestPostgresCount: comparison.postgresCount,
        rentalRequestEquivalent: comparison.equivalent,
        rentalRequestChangedRequestIds: comparison.changedRequestIds,
        rentalRequestChangedFields: comparison.changedFields,
        rentalRequestCandidateSource: candidate.source || null,
        rentalRequestShadowSyncedAt: candidate.shadowSyncedAt || null,
        rentalRequestBackendEquivalent: Boolean(backendPayload?.comparison?.equivalent),
        error: null,
      }));
    });


  return (
    <aside style={panelStyle} aria-label="Clerk staging diagnostics">
      <div style={{ fontWeight: 800, marginBottom: '8px' }}>Clerk Staging Test · Phase 33</div>
      <div>SDK: {state.phase === 'loading' ? 'loading' : state.phase}</div>
      <div>Signed in: {state.signedIn ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Clerk user: {state.userId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Backend user: {state.backendUserId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Postgres user: {state.postgresUserId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Email: {state.primaryEmail || '-'}</div>
      <div>Email verified: {state.primaryEmail ? (state.primaryEmailVerified ? 'yes' : 'no') : '-'}</div>
      <div>Firebase signed in: {state.firebaseSignedIn ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Firebase user: {state.firebaseUserId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Linked Firebase: {state.legacyFirebaseUid || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Legacy email: {state.legacyFirebaseEmail || '-'}</div>
      <div>
        Legacy email verified: {state.legacyFirebaseEmail ? (state.legacyFirebaseEmailVerified ? 'yes' : 'no') : '-'}
      </div>
      <div style={{ overflowWrap: 'anywhere' }}>
        Firebase provider: {state.legacyFirebaseSignInProvider || '-'}
      </div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Legacy member shadow</div>
      <div style={{ overflowWrap: 'anywhere' }}>Shadow Firebase: {state.memberShadowFirebaseUid || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Shadow member: {state.memberShadowName || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Shadow team: {state.memberShadowTeam || '-'}</div>
      <div>Shadow status: {state.memberShadowStatus || '-'}</div>
      <div>Shadow equivalent: {state.memberShadowEquivalent === null ? '-' : state.memberShadowEquivalent ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>
        Changed fields: {state.memberShadowChangedFields.length ? state.memberShadowChangedFields.join(', ') : '-'}
      </div>
      <div style={{ overflowWrap: 'anywhere' }}>
        Shadow hash: {state.memberShadowSourceHash ? state.memberShadowSourceHash.slice(0, 16) : '-'}
      </div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Member profile parallel read</div>
      <div style={{ overflowWrap: 'anywhere' }}>
        App read source: {state.firestoreWatcherDisabled ? 'disabled' : state.appReadProfile ? 'firestore-onSnapshot' : '-'}
      </div>
      <div style={{ overflowWrap: 'anywhere' }}>App read Firebase: {state.appReadFirebaseUid || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>App read member: {state.appReadProfile?.name || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>App read team: {state.appReadProfile?.team || '-'}</div>
      <div>App read status: {state.appReadProfile?.status || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Candidate source: {state.memberReadCandidateSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Candidate member: {state.memberReadCandidateProfile?.name || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Candidate team: {state.memberReadCandidateProfile?.team || '-'}</div>
      <div>Candidate status: {state.memberReadCandidateProfile?.status || '-'}</div>
      <div>Read equivalent: {state.memberReadCandidateEquivalent === null ? '-' : state.memberReadCandidateEquivalent ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>
        Read changed fields: {state.memberReadCandidateChangedFields.length ? state.memberReadCandidateChangedFields.join(', ') : '-'}
      </div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Member profile opt-in cutover</div>
      <div>Cutover requested: {state.cutoverRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Active read source: {state.cutoverActiveSource || '-'}</div>
      <div>Cutover equivalent: {state.cutoverEquivalent === null ? '-' : state.cutoverEquivalent ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>
        Cutover changed fields: {state.cutoverChangedFields.length ? state.cutoverChangedFields.join(', ') : '-'}
      </div>
      <div style={{ overflowWrap: 'anywhere' }}>Fallback reason: {state.cutoverFallbackReason || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 10 Firestore read reduction</div>
      <div>Firestore member watcher: {state.firestoreWatcherDisabled ? 'disabled' : 'active'}</div>
      <div>One-time Firestore fallback reads: {state.firestoreFallbackReads}</div>
      <div>
        Expected userAccounts realtime reads: {state.firestoreWatcherDisabled ? '0 while this page session stays on PostgreSQL' : 'existing realtime behavior'}
      </div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 11 member write-through</div>
      <div>Write-through requested: {state.writeThroughRequested ? 'yes' : 'no'}</div>
      <div>Last write-through: {state.writeThroughStatus || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Write reason: {state.writeThroughReason || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Write Firebase: {state.writeThroughFirebaseUid || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Backend reason: {state.writeThroughBackendReason || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Write error: {state.writeThroughErrorCode || '-'}</div>
      <div>
        Write-through counters: attempted {state.writeThroughCounters.attempted} / synced {state.writeThroughCounters.synced} / skipped {state.writeThroughCounters.skipped} / failed {state.writeThroughCounters.failed}
      </div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 12 rental restriction read reduction</div>
      <div>Restriction cutover requested: {state.restrictionCutoverRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Restriction active source: {state.restrictionActiveSource || '-'}</div>
      <div>Restriction watcher: {state.restrictionWatcherDisabled ? 'disabled' : 'active'}</div>
      <div>Restriction one-time Firestore fallback reads: {state.restrictionFallbackReads}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Restriction fallback reason: {state.restrictionFallbackReason || '-'}</div>
      <div>Last restriction write-through: {state.restrictionWriteStatus || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Restriction write reason: {state.restrictionWriteReason || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Restriction write Firebase: {state.restrictionWriteFirebaseUid || '-'}</div>
      <div>Restriction write counters: attempted {state.restrictionWriteCounters.attempted} / synced {state.restrictionWriteCounters.synced} / failed {state.restrictionWriteCounters.failed}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 14 rental request parallel parity</div>
      <div>Rental request parity requested: {state.rentalRequestParityRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Rental request candidate source: {state.rentalRequestCandidateSource || '-'}</div>
      <div>Firestore request count: {state.rentalRequestFirestoreCount}</div>
      <div>PostgreSQL request count: {state.rentalRequestPostgresCount}</div>
      <div>Frontend parity: {state.rentalRequestEquivalent === null ? '-' : state.rentalRequestEquivalent ? 'yes' : 'no'}</div>
      <div>Backend shadow parity: {state.rentalRequestBackendEquivalent === null ? '-' : state.rentalRequestBackendEquivalent ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Changed request IDs: {state.rentalRequestChangedRequestIds.length ? state.rentalRequestChangedRequestIds.join(', ') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Changed request fields: {state.rentalRequestChangedFields.length ? state.rentalRequestChangedFields.join(', ') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Rental shadow synced: {state.rentalRequestShadowSyncedAt || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 15 rental request read cutover</div>
      <div>Rental request cutover requested: {state.rentalRequestCutoverRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Rental request active source: {state.rentalRequestActiveSource || '-'}</div>
      <div>Rental request watcher: {state.rentalRequestWatcherDisabled ? 'disabled' : 'active'}</div>
      <div>Rental request one-time Firestore fallback queries: {state.rentalRequestFallbackReads}</div>
      <div>Cutover equivalent: {state.rentalRequestCutoverEquivalent === null ? '-' : state.rentalRequestCutoverEquivalent ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Cutover changed request IDs: {state.rentalRequestCutoverChangedRequestIds.length ? state.rentalRequestCutoverChangedRequestIds.join(', ') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Cutover changed fields: {state.rentalRequestCutoverChangedFields.length ? state.rentalRequestCutoverChangedFields.join(', ') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Cutover fallback reason: {state.rentalRequestCutoverFallbackReason || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Cutover shadow synced: {state.rentalRequestCutoverShadowSyncedAt || '-'}</div>
      <div>Rental shadow source refreshes this load: {state.rentalRequestSourceRefreshes}</div>
      <div>
        Expected rentalRequests realtime reads: {state.rentalRequestWatcherDisabled ? '0 while this page session stays on PostgreSQL' : 'existing realtime behavior'}
      </div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 16 rental request authoritative write</div>
      <div>Rental request write cutover requested: {state.rentalRequestWriteRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Rental request write source: {state.rentalRequestWriteSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last created request: {state.rentalRequestWriteRequestId || '-'}</div>
      <div>Firestore compatibility mirror: {state.rentalRequestWriteMirror || '-'}</div>
      <div>Post-write shadow synchronized: {state.rentalRequestWriteShadowSynchronized === null ? '-' : state.rentalRequestWriteShadowSynchronized ? 'yes' : 'no'}</div>
      <div>Idempotent reuse: {state.rentalRequestWriteReused ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Write error: {state.rentalRequestWriteError || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 19 rental request user action lifecycle</div>
      <div>User action write cutover requested: {state.rentalRequestUserActionRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User action write source: {state.rentalRequestUserActionSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last user action: {state.rentalRequestUserActionOperation || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last user action request: {state.rentalRequestUserActionRequestId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Extension approval mode: {state.rentalRequestUserActionApprovalMode || '-'}</div>
      <div>Firestore user-action mirror: {state.rentalRequestUserActionMirror || '-'}</div>
      <div>Post-action shadow synchronized: {state.rentalRequestUserActionShadowSynchronized === null ? '-' : state.rentalRequestUserActionShadowSynchronized ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User action error: {state.rentalRequestUserActionError || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 18 admin rental request PostgreSQL mutation completion</div>
      <div>Admin rental request read requested: {state.adminRentalRequestReadRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin rental request active source: {state.adminRentalRequestReadSource || '-'}</div>
      <div>Admin rental request Firestore watcher: {state.adminRentalRequestWatcherDisabled ? 'disabled' : 'active'}</div>
      <div>Admin bootstrap synchronized: {state.adminRentalRequestBootstrapCount === null ? '-' : state.adminRentalRequestBootstrapCount}</div>
      <div>Admin query result count: {state.adminRentalRequestTotalCount === null ? '-' : state.adminRentalRequestTotalCount}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin processing history source: {state.adminRentalRequestAuditSource || '-'}</div>
      <div>Admin processing history count: {state.adminRentalRequestAuditCount === null ? '-' : state.adminRentalRequestAuditCount}</div>
      <div>Admin rental request write requested: {state.adminRentalRequestWriteRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last admin write source: {state.adminRentalRequestWriteSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last admin write request: {state.adminRentalRequestWriteRequestId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last admin operation: {state.adminRentalRequestWriteOperation || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last admin write status: {state.adminRentalRequestWriteNextStatus || '-'}</div>
      <div>Admin Firestore compatibility mirror: {state.adminRentalRequestWriteMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin cutover error: {state.adminRentalRequestError || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 20 asset domain PostgreSQL cutover</div>
      <div>Asset read requested: {state.assetReadRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Asset active source: {state.assetActiveSource || '-'}</div>
      <div>rentalAssets watcher: {state.assetWatcherDisabled ? 'disabled' : 'active'}</div>
      <div>rentalAvailability watcher: {state.assetAvailabilityWatcherDisabled ? 'disabled' : 'active'}</div>
      <div>PostgreSQL asset count: {state.assetCount === null ? '-' : state.assetCount}</div>
      <div>Asset category count: {state.assetCategoryCount === null ? '-' : state.assetCategoryCount}</div>
      <div>Availability count: {state.assetAvailabilityCount === null ? '-' : state.assetAvailabilityCount}</div>
      <div>Asset bootstrap this load: {state.assetBootstrapped ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Asset catalog synced: {state.assetSyncAt || '-'}</div>
      <div>One-time Firestore asset fallback reads: {state.assetFirestoreFallbackReads}</div>
      <div>Asset write requested: {state.assetWriteRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last asset write source: {state.assetWriteSource || '-'}</div>
      <div>Asset Firestore compatibility mirror: {state.assetFirestoreMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Asset cutover error: {state.assetError || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 21 member / restriction authority + admin identity preparation</div>
      <div>Member authoritative write requested: {state.memberAuthorityWriteRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last member write source: {state.memberAuthorityWriteSource || '-'}</div>
      <div>Member Firestore compatibility mirror: {state.memberAuthorityMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last member operation: {state.memberAuthorityOperation || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Member mutation ID: {state.memberAuthorityMutationId || '-'}</div>
      <div>Restriction authoritative write requested: {state.restrictionAuthorityWriteRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Restriction authoritative source: {state.restrictionAuthorityWriteSource || '-'}</div>
      <div>Admin identity registry requested: {state.adminIdentityRegistryRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin identity registry source: {state.adminIdentityRegistrySource || '-'}</div>
      <div>Admin identity registry count: {state.adminIdentityRegistryCount === null ? '-' : state.adminIdentityRegistryCount}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin identity registry error: {state.adminIdentityRegistryError || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Member authority error: {state.memberAuthorityError || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 22 account recovery + admin Clerk authority</div>
      <div>Account recovery PostgreSQL requested: {state.accountRecoveryRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Account recovery active source: {state.accountRecoverySource || '-'}</div>
      <div>Account recovery Firestore fallback: {state.accountRecoveryFallback ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Account recovery operation: {state.accountRecoveryOperation || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Account recovery error: {state.accountRecoveryError || '-'}</div>
      <div>Admin Clerk authority requested: {state.adminClerkAuthRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin auth source: {state.adminAuthSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin Firebase compatibility: {state.adminFirebaseCompatibility || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin Clerk migration: {state.adminClerkMigration || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin Clerk user: {state.adminClerkUserId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin Client Trust: {state.adminClientTrustStatus || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin Client Trust strategy: {state.adminClientTrustStrategy || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin Client Trust destination: {state.adminClientTrustDestination || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin provision operation: {state.adminProvisionOperation || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin provision target: {state.adminProvisionTargetUid || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin provision Clerk user: {state.adminProvisionClerkUserId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin auth error: {state.adminAuthError || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 23 user Clerk authentication + account lifecycle authority</div>
      <div>User Clerk authority requested: {state.userClerkAuthRequested ? 'yes' : 'no'}</div>
      <div>User lifecycle authority requested: {state.userLifecycleRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User auth source: {state.userAuthSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User Firebase compatibility: {state.userFirebaseCompatibility || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User Clerk migration: {state.userClerkMigration || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User Clerk user: {state.userClerkUserId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User Client Trust: {state.userClientTrustStatus || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User Client Trust strategy: {state.userClientTrustStrategy || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User Client Trust destination: {state.userClientTrustDestination || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Signup Clerk provision: {state.signupClerkProvision || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Password verification source: {state.passwordVerificationSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Password authority source: {state.passwordAuthoritySource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Password Firebase compatibility: {state.passwordFirebaseCompatibility || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Withdrawal authority: {state.withdrawalAuthority || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Withdrawal Clerk deleted: {state.withdrawalClerkDeleted || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Withdrawal Clerk cleanup error: {state.withdrawalClerkCleanupError || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Withdrawal Firebase cleanup: {state.withdrawalFirebaseCleanup || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User lifecycle error: {state.userLifecycleError || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>
        User session last event: {state.userSessionTrace.length
          ? `${state.userSessionTrace[state.userSessionTrace.length - 1].event}${state.userSessionTrace[state.userSessionTrace.length - 1].reason ? ` / ${state.userSessionTrace[state.userSessionTrace.length - 1].reason}` : ''}`
          : '-'}
      </div>
      <div style={{ overflowWrap: 'anywhere' }}>
        User session trace: {state.userSessionTrace.length
          ? state.userSessionTrace
              .slice(-6)
              .map((entry) => `${entry.event}${entry.reason ? `:${entry.reason}` : ''}@${entry.route || '/'}`)
              .join(' > ')
          : '-'}
      </div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 24 site shell content PostgreSQL read + write-through</div>
      <div>Site content PostgreSQL requested: {state.siteContentReadRequested ? 'yes' : 'no'}</div>
      <div>Site content write-through requested: {state.siteContentWriteRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Site content active source: {state.siteContentReadSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Site content last domain: {state.siteContentLastDomain || '-'}</div>
      <div>Site content document count: {state.siteContentDocumentCount ?? '-'}</div>
      <div>Site content PostgreSQL enabled count: {state.siteContentPostgresDocumentCount ?? '-'}</div>
      <div>Site content Firestore server enabled count: {state.siteContentFirestoreDocumentCount ?? '-'}</div>
      <div>Home banners from PostgreSQL: {state.siteContentHomeBannerCount ?? '-'}</div>
      <div>Home active hero / promotion / quick-link: {state.siteContentHomeActiveHeroCount ?? '-'} / {state.siteContentHomeActivePromotionCount ?? '-'} / {state.siteContentHomeActiveQuickLinkCount ?? '-'}</div>
      <div>Popup posts from PostgreSQL / active: {state.siteContentPopupPostCount ?? '-'} / {state.siteContentPopupActiveCount ?? '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Site content PostgreSQL sync: {state.siteContentPostgresSync || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Site content synced at: {state.siteContentSyncAt || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Site content error: {state.siteContentError || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 25 rental policy + terms PostgreSQL read + write-through</div>
      <div>Policy content PostgreSQL requested: {state.policyContentReadRequested ? 'yes' : 'no'}</div>
      <div>Policy content write-through requested: {state.policyContentWriteRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Policy content active source: {state.policyContentReadSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Policy content last domain: {state.policyContentLastDomain || '-'}</div>
      <div>Policy content document count: {state.policyContentDocumentCount ?? '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Policy content PostgreSQL sync: {state.policyContentPostgresSync || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Policy content synced at: {state.policyContentSyncAt || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Policy content error: {state.policyContentError || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 26 notice / FAQ PostgreSQL read + CRUD authority</div>
      <div>Board PostgreSQL read requested: {state.boardContentReadRequested ? 'yes' : 'no'}</div>
      <div>Board PostgreSQL write requested: {state.boardContentWriteRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Board active read source: {state.boardContentReadSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Board write source: {state.boardContentWriteSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Board last type: {state.boardContentLastBoard || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Board last operation: {state.boardContentOperation || '-'}</div>
      <div>Board item count: {state.boardContentItemCount ?? '-'}</div>
      <div>Board total regular count: {state.boardContentTotalCount ?? '-'}</div>
      <div>FAQ category count: {state.boardContentCategoryCount ?? '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Board Firestore compatibility mirror: {state.boardContentFirestoreMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Board synced at: {state.boardContentSyncAt || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Board error: {state.boardContentError || '-'}</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 27 validated-domain legacy Firestore read fallback retirement</div>
      <div>Legacy Firestore read fallback retirement requested: {state.legacyReadFallbackRetirementRequested ? 'yes' : 'no'}</div>
      <div>Legacy Firestore read fallback allowed: {state.legacyReadFallbackAllowed ? 'yes' : 'no'}</div>
      <div>Blocked fallback attempts: {state.legacyReadFallbackBlockedCount}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last blocked fallback domain: {state.legacyReadFallbackLastDomain || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last blocked fallback reason: {state.legacyReadFallbackLastReason || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Retired read domains: member-profile / rental-restriction / rental-requests / assets / notice / faq</div>
      <div style={{ overflowWrap: 'anywhere' }}>Preserved compatibility: site-shell parity fallback / policy transaction reads / account recovery / member-rental write mirrors</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 28 asset / board Firestore write mirror retirement</div>
      <div>Write mirror retirement requested: {state.writeMirrorRetirementRequested ? 'yes' : 'no'}</div>
      <div>Backend retirement applied: {state.writeMirrorRetirementBackendApplied ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Retired write mirror domains: {state.writeMirrorRetirementDomains.length ? state.writeMirrorRetirementDomains.join(' / ') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Asset Firestore compatibility mirror: {state.assetFirestoreMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Board Firestore compatibility mirror: {state.boardContentFirestoreMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Write mirror retirement error: {state.writeMirrorRetirementError || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Preserved write mirrors: member / restriction / rental requests / site shell / policy-terms transactions</div>


      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 29 rental transaction PostgreSQL authority + Firestore write mirror retirement</div>
      <div>Rental write mirror retirement requested: {state.rentalWriteMirrorRetirementRequested ? 'yes' : 'no'}</div>
      <div>Rental backend retirement applied: {state.rentalWriteMirrorRetirementBackendApplied ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Rental transaction source: {state.rentalTransactionSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Rental request create mirror: {state.rentalRequestWriteMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Rental user-action mirror: {state.rentalRequestUserActionMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin rental mirror: {state.adminRentalRequestWriteMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Rental mirror retirement error: {state.rentalWriteMirrorRetirementError || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Preserved write mirrors: member / restriction / site shell / policy-terms transactions</div>


      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 30 member status / rental restriction PostgreSQL authority + Firestore write mirror retirement</div>
      <div>Member status/restriction retirement requested: {state.memberStatusRestrictionRetirementRequested ? 'yes' : 'no'}</div>
      <div>Member status/restriction backend applied: {state.memberStatusRestrictionRetirementBackendApplied ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Member status source: {state.memberStatusRestrictionSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Admin member list source: {state.adminMemberReadSource || '-'}</div>
      <div>Admin member list count: {state.adminMemberReadCount ?? '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Phase 30 retired domains: {state.memberStatusRestrictionRetiredDomains.length ? state.memberStatusRestrictionRetiredDomains.filter((domain) => domain === 'member-status' || domain === 'rental-restriction-status').join(' / ') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last member status mirror: {state.memberAuthorityOperation === 'admin-member-status-change' ? (state.memberAuthorityMirror || '-') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last restriction authority: {state.memberAuthorityOperation === 'admin-member-status-change' ? (state.restrictionAuthorityWriteSource || '-') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Phase 30 retirement error: {state.memberStatusRestrictionRetirementError || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Preserved compatibility: member profile edit mirror / rejoined inherited-restriction snapshot fallback / site shell / policy-terms / account recovery</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 31 member profile identity / recovery PostgreSQL authority + Firestore write mirror retirement</div>
      <div>Member profile identity authority requested: {state.memberProfileIdentityAuthorityRequested ? 'yes' : 'no'}</div>
      <div>Member profile identity backend applied: {state.memberProfileIdentityAuthorityBackendApplied ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Member identity source: {state.memberProfileIdentitySource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Phase 31 retired domains: {state.memberProfileIdentityRetiredDomains.length ? state.memberProfileIdentityRetiredDomains.filter((domain) => ['member-profile','member-identity','account-recovery-key'].includes(domain)).join(' / ') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Last profile edit mirror: {['user-profile-edit','admin-profile-edit'].includes(state.memberAuthorityOperation) ? (state.memberAuthorityMirror || '-') : '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Phase 31 authority error: {state.memberProfileIdentityAuthorityError || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Preserved compatibility: Firebase auth session / signup bootstrap / password reset delivery / terms consent / site shell</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 32 signup + terms consent PostgreSQL account lifecycle authority</div>
      <div>Runtime revision: {PHASE32_RUNTIME_REVISION}</div>
      <div>Account lifecycle authority requested: {state.accountLifecycleAuthorityRequested ? 'yes' : 'no'}</div>
      <div>Account lifecycle backend applied: {state.accountLifecycleAuthorityBackendApplied ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Signup profile source: {state.accountLifecycleSignupSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Signup Firestore bootstrap: {state.accountLifecycleSignupFirestoreBootstrap || (state.accountLifecycleAuthorityBackendApplied ? 'retired' : '-')}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Terms consent source: {state.accountLifecycleTermsConsentSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Terms consent Firestore mirror: {state.accountLifecycleTermsConsentMirror || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Terms consent legacy bootstrap: {state.accountLifecycleTermsConsentBootstrap || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Account recovery source: {state.accountLifecycleRecoverySource || (state.accountLifecycleAuthorityBackendApplied ? 'postgresql' : '-')}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Password reset delivery: {state.accountLifecyclePasswordResetDelivery || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Password reset status: {state.accountLifecyclePasswordResetStatus || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Phase 32 authority error: {state.accountLifecycleAuthorityError || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Preserved compatibility: Firebase auth session / Firebase UID bridge / site-shell parity fallback</div>

      <div style={{ marginTop: '6px', fontWeight: 700 }}>Phase 33 user Clerk-only auth + public content PostgreSQL authority</div>
      <div>Runtime revision: {PHASE33_RUNTIME_REVISION}</div>
      <div>Frontend hotfix revision: {PHASE33_FRONTEND_HOTFIX_REVISION}</div>
      <div>User Firebase Auth retirement requested: {state.userFirebaseRetirementRequested ? 'yes' : 'no'}</div>
      <div>User Firebase Auth backend retirement applied: {state.userFirebaseRetirementBackendApplied ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>User authentication source: {state.userFirebaseRuntimeSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Legacy member key source: {state.userLegacyMemberKeySource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Password reset delivery: {state.phase33PasswordResetDelivery || '-'}</div>
      <div>Public site content PostgreSQL authority requested: {state.phase33SiteContentAuthorityRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Public site content active source: {state.siteContentReadSource || '-'}</div>
      <div>Public policy content PostgreSQL authority requested: {state.phase33PolicyContentAuthorityRequested ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Public policy content active source: {state.policyContentReadSource || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Phase 33 authority error: {state.phase33Error || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Preserved admin compatibility: Firebase admin session / Firestore admin settings-policy management until Phase 34</div>

      {state.error ? (
        <div role="alert" style={{ marginTop: '8px', color: '#b91c1c', overflowWrap: 'anywhere' }}>
          {state.error}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
        {!state.signedIn ? (
          <button type="button" style={buttonStyle} onClick={() => run(() => clerkStagingClient.openSignIn())}>
            Clerk 로그인
          </button>
        ) : (
          <>
            <button type="button" style={buttonStyle} onClick={verifyBackend}>
              Backend 검증
            </button>
            <button type="button" style={buttonStyle} onClick={syncIdentity}>
              Postgres 동기화
            </button>
            <button type="button" style={buttonStyle} onClick={readIdentity}>
              Postgres 조회
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={!state.firebaseSignedIn}
              onClick={linkFirebaseIdentity}
            >
              Firebase 계정 연결
            </button>
            <button type="button" style={buttonStyle} onClick={readFirebaseLink}>
              Firebase 연결 조회
            </button>

            <button
              type="button"
              style={buttonStyle}
              disabled={!state.firebaseSignedIn || !state.legacyFirebaseUid}
              onClick={syncMemberShadow}
            >
              회원 Shadow 동기화
            </button>
            <button type="button" style={buttonStyle} onClick={readMemberShadow}>
              회원 Shadow 조회
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={!state.firebaseSignedIn || !state.memberShadowFirebaseUid}
              onClick={compareMemberShadow}
            >
              회원 Shadow 비교
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={state.firestoreWatcherDisabled || !state.appReadProfile}
              onClick={verifyMemberReadParity}
            >
              {'\uc571 \uc77d\uae30 \ubcd1\ud589\uac80\uc99d'}
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={
                !state.firebaseSignedIn ||
                !state.rentalRequestParityRequested ||
                state.rentalRequestWatcherDisabled
              }
              onClick={syncAndVerifyRentalRequestParity}
            >
              {'대여신청 Shadow 동기화·병행검증'}
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={!state.firebaseSignedIn || !state.siteContentWriteRequested}
              onClick={() => run(() => syncAllSiteContentDomainsFromFirestore({ config: siteContentConfig }))}
            >
              Site content 전체 동기화
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={!state.firebaseSignedIn || !state.policyContentWriteRequested}
              onClick={() => run(() => syncAllPolicyContentDomainsFromFirestore({ config: policyContentConfig }))}
            >
              Policy content 전체 동기화
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={!state.firebaseSignedIn || !state.boardContentWriteRequested}
              onClick={() => run(() => bootstrapBoardContent())}
            >
              Notice / FAQ PostgreSQL bootstrap
            </button>
            <button type="button" style={buttonStyle} onClick={() => run(() => clerkStagingClient.signOut())}>
              Clerk 로그아웃
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
