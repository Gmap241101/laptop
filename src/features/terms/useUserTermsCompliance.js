import { useEffect, useMemo, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

import { SIGNUP_TERMS_POLICY_DOC_REF } from '../../firebase.js';
import {
  isTermsConsentRequiredForAccount,
  normalizeTermsPolicy,
} from './termsConstants.js';

export default function useUserTermsCompliance({ account, enabled = true } = {}) {
  const [policy, setPolicy] = useState(() => normalizeTermsPolicy({}));
  const [ready, setReady] = useState(!enabled);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      setErrorMessage('');
      return undefined;
    }

    setReady(false);
    const unsubscribe = onSnapshot(
      SIGNUP_TERMS_POLICY_DOC_REF,
      (snapshot) => {
        setPolicy(normalizeTermsPolicy(snapshot.exists() ? snapshot.data() : {}));
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
  }, [enabled]);

  const consentRequired = useMemo(
    () => ready && !errorMessage && isTermsConsentRequiredForAccount({ policy, account }),
    [account, errorMessage, policy, ready]
  );

  return {
    consentRequired,
    errorMessage,
    policy,
    ready,
  };
}
