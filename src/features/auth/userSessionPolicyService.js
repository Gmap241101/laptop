import { getDoc } from 'firebase/firestore';

import { USER_SESSION_POLICY_DOC_REF } from '../../firebase.js';
import { normalizeUserSessionPolicy } from '../../utils/systemSettings.js';

export const resolveEffectiveUserSessionPolicy = async ({
  policy,
  policyReady,
}) => {
  if (policyReady) {
    return normalizeUserSessionPolicy(policy);
  }

  const policySnapshot = await getDoc(USER_SESSION_POLICY_DOC_REF).catch(
    () => null
  );

  return normalizeUserSessionPolicy(
    policySnapshot?.exists() ? policySnapshot.data() : policy
  );
};
