import { useEffect, useMemo, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { firebaseAuth, SIGNUP_TERMS_POLICY_DOC_REF } from '../../firebase.js';
import {
  publishAccountLifecycleAuthorityObservation,
  readAccountLifecycleAuthorityConfig,
  readAccountLifecycleAuthorityFromPayload,
} from '../auth/accountLifecycleAuthority.js';
import {
  isTermsConsentRequiredForAccount,
  normalizeTermsPolicy,
} from './termsConstants.js';

export default function useUserTermsCompliance({
  account,
  enabled = true,
  refreshKey = 0,
} = {}) {
  const [policy, setPolicy] = useState(() => normalizeTermsPolicy({}));
  const [consentRevision, setConsentRevision] = useState(() =>
    Math.max(0, Number(account?.termsConsentRevision) || 0)
  );
  const [ready, setReady] = useState(!enabled);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      setErrorMessage('');
      return undefined;
    }

    const lifecycleConfig = readAccountLifecycleAuthorityConfig();
    if (!lifecycleConfig.requested) {
      setReady(false);
      const unsubscribe = onSnapshot(
        SIGNUP_TERMS_POLICY_DOC_REF,
        (snapshot) => {
          setPolicy(normalizeTermsPolicy(snapshot.exists() ? snapshot.data() : {}));
          setConsentRevision(Math.max(0, Number(account?.termsConsentRevision) || 0));
          setReady(true);
          setErrorMessage('');
        },
        (error) => {
          console.error('User terms compliance policy error:', error);
          setReady(true);
          setErrorMessage('약관 적용 상태를 확인하지 못했습니다.');
        }
      );
      return unsubscribe;
    }

    let active = true;
    setReady(false);
    setErrorMessage('');

    const loadPostgresCompliance = async () => {
      try {
        let payload = await clerkStagingClient.getUserTermsConsent();
        let legacyBootstrap = 'not-required';
        if (payload?.termsConsent?.bootstrapRequired) {
          const firebaseUser = firebaseAuth.currentUser;
          if (!firebaseUser) {
            throw new Error('terms-consent-firebase-compatibility-required');
          }
          const firebaseIdToken = await firebaseUser.getIdToken();
          payload = await clerkStagingClient.bootstrapUserTermsConsent(firebaseIdToken);
          legacyBootstrap = payload?.termsConsent?.legacyBootstrap || 'imported';
        } else {
          legacyBootstrap = payload?.termsConsent?.legacyBootstrap || 'not-required';
        }
        if (!active) return;
        setPolicy(normalizeTermsPolicy(payload?.termsConsent?.policy || {}));
        setConsentRevision(
          Math.max(0, Number(payload?.termsConsent?.termsConsentRevision) || 0)
        );
        setReady(true);
        setErrorMessage('');
        publishAccountLifecycleAuthorityObservation({
          ...readAccountLifecycleAuthorityFromPayload(payload, { requested: true }),
          termsConsentMirror: payload?.termsConsent?.firestoreMirror || 'retired',
          termsConsentBootstrap: legacyBootstrap,
          error: null,
        });
      } catch (error) {
        if (!active) return;
        console.error('User PostgreSQL terms compliance error:', error);
        setReady(true);
        setErrorMessage('약관 적용 상태를 PostgreSQL에서 확인하지 못했습니다.');
        publishAccountLifecycleAuthorityObservation({
          requested: true,
          error: error?.code || error?.message || 'terms-compliance-postgres-unavailable',
        });
      }
    };

    void loadPostgresCompliance();
    return () => {
      active = false;
    };
  }, [account?.termsConsentRevision, enabled, refreshKey]);

  const consentRequired = useMemo(
    () => ready && !errorMessage && isTermsConsentRequiredForAccount({
      policy,
      account: {
        ...(account || {}),
        termsConsentRevision: consentRevision,
      },
    }),
    [account, consentRevision, errorMessage, policy, ready]
  );

  return {
    consentRequired,
    errorMessage,
    policy,
    ready,
  };
}
