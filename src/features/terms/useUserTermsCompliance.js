import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  isTermsConsentRequiredForAccount,
  normalizeTermsPolicy,
} from './termsConstants.js';
import {
  getCachedSignupTermsPolicy,
  preloadSignupTermContents,
  preloadSignupTermsPolicy,
} from './termsService.js';

export default function useUserTermsCompliance({
  account,
  enabled = true,
  refreshKey = 0,
} = {}) {
  const cachedPolicy = getCachedSignupTermsPolicy();
  const [policy, setPolicy] = useState(() =>
    cachedPolicy || normalizeTermsPolicy({})
  );
  const [ready, setReady] = useState(() => !enabled || Boolean(cachedPolicy));
  const [resolvedRefreshKey, setResolvedRefreshKey] = useState(() => cachedPolicy ? refreshKey : -1);
  const [errorMessage, setErrorMessage] = useState('');
  const accountKey = String(account?.uid || account?.firebaseUid || account?.legacyMemberKey || '');
  const accountConsentRevision = Math.max(0, Number(account?.termsConsentRevision) || 0);
  const [revisionOverride, setRevisionOverride] = useState(() => ({ accountKey: '', revision: 0 }));
  const effectiveConsentRevision = revisionOverride.accountKey === accountKey
    ? Math.max(accountConsentRevision, revisionOverride.revision)
    : accountConsentRevision;
  const markConsentRevision = useCallback((nextRevision) => {
    const revision = Math.max(0, Number(nextRevision) || 0);
    setRevisionOverride({ accountKey, revision });
  }, [accountKey]);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      setResolvedRefreshKey(refreshKey);
      setErrorMessage('');
      return undefined;
    }

    let active = true;
    const immediatelyCachedPolicy = getCachedSignupTermsPolicy();
    if (immediatelyCachedPolicy) {
      setPolicy(immediatelyCachedPolicy);
      setReady(true);
      setResolvedRefreshKey(refreshKey);
      setErrorMessage('');
    } else {
      setReady(false);
      setResolvedRefreshKey(-1);
      setErrorMessage('');
    }

    void preloadSignupTermsPolicy({ force: refreshKey > 0 })
      .then((nextPolicy) => {
        if (!active) return;
        setPolicy(nextPolicy);
        setReady(true);
        setResolvedRefreshKey(refreshKey);
        setErrorMessage('');
      })
      .catch((error) => {
        if (!active) return;
        console.error('User PostgreSQL terms compliance policy error:', error);
        setReady(true);
        setResolvedRefreshKey(refreshKey);
        setErrorMessage('약관 적용 상태를 PostgreSQL에서 확인하지 못했습니다.');
      });

    return () => {
      active = false;
    };
  }, [enabled, refreshKey]);

  const latestCachedPolicy = getCachedSignupTermsPolicy();
  const effectivePolicy = latestCachedPolicy || policy;
  const effectiveReady = !enabled || Boolean(latestCachedPolicy) || (ready && resolvedRefreshKey === refreshKey);

  const consentRequired = useMemo(
    () => effectiveReady && !errorMessage && isTermsConsentRequiredForAccount({
      policy: effectivePolicy,
      account: { ...(account || {}), termsConsentRevision: effectiveConsentRevision },
    }),
    [account, effectiveConsentRevision, effectivePolicy, effectiveReady, errorMessage]
  );

  useEffect(() => {
    if (!enabled || !effectiveReady || errorMessage || !consentRequired || effectivePolicy.activeTerms.length === 0) {
      return undefined;
    }

    let cancelled = false;
    const preload = () => {
      if (cancelled) return;
      void preloadSignupTermContents(effectivePolicy.activeTerms).catch(() => {});
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(preload, { timeout: 300 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(handle);
      };
    }

    preload();
    return () => {
      cancelled = true;
    };
  }, [consentRequired, effectivePolicy, effectiveReady, enabled, errorMessage]);

  return {
    consentRequired,
    errorMessage,
    policy: effectivePolicy,
    ready: effectiveReady,
    markConsentRevision,
  };
}
