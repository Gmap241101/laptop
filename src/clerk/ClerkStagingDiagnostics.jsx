import { useEffect, useMemo, useState } from 'react';

import { clerkStagingClient } from './clerkStagingClient.js';
import { readSiteContentCutoverConfig } from '../features/content/siteContentCutover.js';
import { readPolicyContentCutoverConfig } from '../features/content/policyContentCutover.js';

const PHASE34_ADMIN_NAVIGATION_HOLIDAY_REVISION = 'phase34-admin-navigation-holiday-hotfix-20260812-1810';
const PHASE34_SETTINGS_REPOSITORY_MEMBER_REVISION = 'phase34-settings-repository-member-createdat-hotfix-20260812-1835';
const PHASE34_ADMIN_SURFACE_ISOLATION_REVISION = 'phase34-admin-surface-isolation-hotfix-20260812-2122';
const PHASE34_RUNTIME_REVISION = 'phase34-clerk-postgresql-runtime-authority-20260813-1438';
const PHASE34_POLICY_BOOTSTRAP_REVISION = 'phase34-rental-config-postgresql-bootstrap-hotfix-20260812-1545';
const PHASE34_FRONTEND_MAPPING_REVISION = 'phase34-postgresql-payload-mapping-hotfix-20260812-1635';
const PHASE34_RUNTIME_REGRESSION_REVISION = 'phase34-rental-request-restriction-content-reset-hotfix-20260812-1740';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());

const panelStyle = {
  position: 'fixed',
  top: '184px',
  right: '16px',
  bottom: '16px',
  zIndex: 9999,
  width: 'min(420px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 200px)',
  overflowY: 'auto',
  border: '1px solid #cbd5e1',
  borderRadius: '12px',
  background: 'rgba(255,255,255,0.97)',
  boxShadow: '0 12px 30px rgba(15,23,42,0.18)',
  padding: '14px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '11px',
  lineHeight: 1.55,
  color: '#0f172a',
};
const buttonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  background: '#fff',
  padding: '6px 9px',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
};

const yesNo = (value) => (value ? 'yes' : 'no');
const valueOrDash = (value) => {
  const normalized = trim(value);
  return normalized || '-';
};

export default function ClerkStagingDiagnostics({ runtimeSurface = 'user' }) {
  const enabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search || '');
    return params.get('clerkTest') === '1';
  }, []);
  const [state, setState] = useState({ loading: true, error: '', clerkReady: false, signedIn: false, clerkUserId: '', backend: null });

  const refresh = async () => {
    if (!enabled) return;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const clerk = await clerkStagingClient.initialize();
      const siteConfig = readSiteContentCutoverConfig();
      const policyConfig = readPolicyContentCutoverConfig();
      const apiBaseUrl = siteConfig.apiBaseUrl || policyConfig.apiBaseUrl;
      if (!apiBaseUrl) throw Object.assign(new Error('VITE_API_URL is missing.'), { code: 'api_base_url_missing' });
      const response = await fetch(`${apiBaseUrl}/health`, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
      const backend = await response.json().catch(() => null);
      if (!response.ok) throw Object.assign(new Error(`Backend health failed with HTTP ${response.status}.`), { code: backend?.error || 'backend_health_failed' });
      setState({
        loading: false,
        error: '',
        clerkReady: Boolean(clerk),
        signedIn: Boolean(clerk?.session),
        clerkUserId: trim(clerk?.user?.id || clerk?.session?.user?.id),
        backend,
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.code || error?.message || 'diagnostics_failed' }));
    }
  };

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  if (!enabled) return null;

  const authority = state.backend?.authority || {};
  return (
    <aside style={panelStyle} aria-label="Phase 34 staging diagnostics">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <strong>Clerk Staging Test · Phase 34</strong>
        <button type="button" style={buttonStyle} onClick={() => void refresh()} disabled={state.loading}>새로고침</button>
      </div>
      <div style={{ marginTop: '10px' }}>Runtime revision: {PHASE34_RUNTIME_REVISION}</div>
      <div>Policy bootstrap revision: {PHASE34_POLICY_BOOTSTRAP_REVISION}</div>
      <div>Frontend mapping revision: {PHASE34_FRONTEND_MAPPING_REVISION}</div>
      <div>Runtime regression hotfix revision: {PHASE34_RUNTIME_REGRESSION_REVISION}</div>
              <div>Admin navigation / holiday hotfix revision: {PHASE34_ADMIN_NAVIGATION_HOLIDAY_REVISION}</div>
              <div>Settings repository / member createdAt hotfix revision: {PHASE34_SETTINGS_REPOSITORY_MEMBER_REVISION}</div>
      <div>Admin surface isolation revision: {PHASE34_ADMIN_SURFACE_ISOLATION_REVISION}</div>
      <div>Document surface: {runtimeSurface}</div>
      <div>Backend regression revision: {valueOrDash(state.backend?.phase34RuntimeRegressionRevision)}</div>
      <div>Backend policy bootstrap revision: {valueOrDash(state.backend?.phase34PolicyBootstrapRevision)}</div>
      <div>SDK: {state.clerkReady ? 'ready' : state.loading ? 'loading' : 'unavailable'}</div>
      <div>Signed in: {yesNo(state.signedIn)}</div>
      <div>Clerk user: {valueOrDash(state.clerkUserId)}</div>
      <div>Backend service: {valueOrDash(state.backend?.service)}</div>
      <div>Backend version: {valueOrDash(state.backend?.version)}</div>
      <div>Backend environment: {valueOrDash(state.backend?.environment)}</div>
      <div style={{ marginTop: '10px', fontWeight: 800 }}>Phase 34 runtime authority</div>
      <div>User authentication: {valueOrDash(authority.userAuthentication || 'clerk-postgresql')}</div>
      <div>Admin authentication: clerk-postgresql</div>
      <div>Member source: {valueOrDash(authority.memberProfile || 'postgresql')}</div>
      <div>Member status source: {valueOrDash(authority.memberStatus || 'postgresql')}</div>
      <div>Rental transaction source: {valueOrDash(authority.rentalTransactions || 'postgresql')}</div>
      <div>Signup source: {valueOrDash(authority.signup || 'postgresql')}</div>
      <div>Terms source: {valueOrDash(authority.terms || 'postgresql')}</div>
      <div>Password reset: {valueOrDash(authority.passwordReset || 'clerk-email-code')}</div>
      <div>Site content source: postgresql</div>
      <div>Policy content source: postgresql</div>
      <div>Board source: postgresql</div>
      <div>Asset source: postgresql</div>
      <div>System configuration: postgresql</div>
      {state.error ? <div style={{ marginTop: '10px', color: '#b91c1c', fontWeight: 800 }}>Diagnostics error: {state.error}</div> : null}
    </aside>
  );
}
