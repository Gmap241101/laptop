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
import { clerkStagingClient } from './clerkStagingClient.js';

const panelStyle = {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  zIndex: 99999,
  width: 'min(380px, calc(100vw - 32px))',
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


  return (
    <aside style={panelStyle} aria-label="Clerk staging diagnostics">
      <div style={{ fontWeight: 800, marginBottom: '8px' }}>Clerk Staging Test · Phase 11</div>
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
            <button type="button" style={buttonStyle} onClick={() => run(() => clerkStagingClient.signOut())}>
              Clerk 로그아웃
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
