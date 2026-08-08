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
import { clerkStagingClient } from './clerkStagingClient.js';

const panelStyle = {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  zIndex: 99999,
  width: 'min(380px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 32px)',
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
        throw new Error('The application Firestore member profile has not been observed yet.');
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
      <div style={{ fontWeight: 800, marginBottom: '8px' }}>Clerk Staging Test · Phase 20</div>
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
              disabled={!state.firebaseSignedIn || !state.legacyFirebaseUid}
              onClick={compareMemberShadow}
            >
              회원 Shadow 비교
            </button>
            <button type="button" style={buttonStyle} disabled={state.firestoreWatcherDisabled} onClick={verifyMemberReadParity}>
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
            <button type="button" style={buttonStyle} onClick={() => run(() => clerkStagingClient.signOut())}>
              Clerk 로그아웃
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
