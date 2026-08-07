import { useEffect, useMemo, useState } from 'react';

import { clerkStagingClient } from './clerkStagingClient.js';

const panelStyle = {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  zIndex: 99999,
  width: 'min(360px, calc(100vw - 32px))',
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
  const [state, setState] = useState({
    phase: requested ? 'loading' : 'hidden',
    signedIn: false,
    userId: null,
    sessionId: null,
    backendUserId: null,
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

  if (!requested) return null;

  const run = async (operation) => {
    setState((current) => ({ ...current, error: null }));
    try {
      await operation();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message || 'Clerk test action failed.' }));
    }
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

  return (
    <aside style={panelStyle} aria-label="Clerk staging diagnostics">
      <div style={{ fontWeight: 800, marginBottom: '8px' }}>Clerk Staging Test</div>
      <div>SDK: {state.phase === 'loading' ? 'loading' : state.phase}</div>
      <div>Signed in: {state.signedIn ? 'yes' : 'no'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Clerk user: {state.userId || '-'}</div>
      <div style={{ overflowWrap: 'anywhere' }}>Backend user: {state.backendUserId || '-'}</div>

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
            <button type="button" style={buttonStyle} onClick={() => run(() => clerkStagingClient.signOut())}>
              Clerk 로그아웃
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
