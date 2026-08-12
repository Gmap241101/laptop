import { doc, getDoc } from '../../platform/retiredLegacyDataCompat.js';

import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import {
  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
} from '../../platform/appDataRefs.js';
import {
  buildDomesticPhoneNumber,
  createAccountRecoveryEmailVerifier,
  createAccountRecoveryKey,
  isValidDomesticPhoneNumber,
  isValidEmailAddress,
  isValidMemberName,
  normalizeEmailAddress,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';
import { readUserFirebaseAuthRetirementConfig } from '../auth/userFirebaseAuthRetirement.js';
import {
  publishAccountAuthObservation,
  readAccountAuthCutoverConfig,
} from '../auth/accountAuthCutover.js';

export const createDefaultAccountRecoveryForm = (initialValues = {}) => ({
  name: String(initialValues.name || ''),
  team: String(initialValues.team || ''),
  phonePrefix: String(initialValues.phonePrefix || '010'),
  phoneMiddle: String(initialValues.phoneMiddle || ''),
  phoneLast: String(initialValues.phoneLast || ''),
  resetCode: String(initialValues.resetCode || ''),
  newPassword: String(initialValues.newPassword || ''),
  newPasswordConfirm: String(initialValues.newPasswordConfirm || ''),
});

export const createDefaultPasswordResetForm = (initialValues = {}) => ({
  email: String(initialValues.email || ''),
  name: String(initialValues.name || ''),
  team: String(initialValues.team || ''),
  phonePrefix: String(initialValues.phonePrefix || '010'),
  phoneMiddle: String(initialValues.phoneMiddle || ''),
  phoneLast: String(initialValues.phoneLast || ''),
});

export const normalizeAccountRecoveryIdentity = (form = {}) => {
  const name = normalizeMemberName(form.name || '');
  const team = normalizeMemberTeam(form.team || '');
  const phoneParts = {
    prefix: form.phonePrefix,
    middle: form.phoneMiddle,
    last: form.phoneLast,
  };
  const phone = buildDomesticPhoneNumber(phoneParts);

  return {
    name,
    team,
    phone,
    phoneParts,
  };
};

export const validateAccountRecoveryIdentity = ({
  email = '',
  form = {},
  requireEmail = false,
} = {}) => {
  const identity = normalizeAccountRecoveryIdentity(form);
  const normalizedEmail = normalizeEmailAddress(email);

  if (requireEmail && !isValidEmailAddress(normalizedEmail)) {
    return {
      valid: false,
      errorMessage: '올바른 이메일 주소를 입력해 주세요.',
    };
  }

  if (!isValidMemberName(identity.name)) {
    return {
      valid: false,
      errorMessage: '이름은 공백 없이 한글 또는 영문 2~30자로 입력해 주세요.',
    };
  }

  if (!identity.team) {
    return {
      valid: false,
      errorMessage: '부서 / 팀을 선택해 주세요.',
    };
  }

  if (!isValidDomesticPhoneNumber(identity.phoneParts)) {
    return {
      valid: false,
      errorMessage: '올바른 국내 연락처를 입력해 주세요.',
    };
  }

  return {
    valid: true,
    email: normalizedEmail,
    ...identity,
  };
};

export const findAccountRecoveryEmail = async ({
  name,
  team,
  phone,
}) => {
  const cutover = readAccountAuthCutoverConfig();
  if (cutover.accountRecoveryRequested) {
    try {
      const payload = await clerkStagingClient.findAccountRecoveryEmail({ name, team, phone });
      const result = payload?.accountRecovery || {};
      publishAccountAuthObservation({
        accountRecoveryRequested: true,
        accountRecoverySource: 'postgresql',
        accountRecoveryFallback: false,
        accountRecoveryError: '',
      });
      return {
        found: Boolean(result.found),
        maskedEmail: result.found ? String(result.maskedEmail || '') : '',
        source: 'postgresql',
      };
    } catch (error) {
      if (readUserFirebaseAuthRetirementConfig().requested) throw error;
      console.warn('PostgreSQL account recovery lookup failed; using Firestore compatibility fallback.', {
        code: error?.code,
        status: error?.status,
      });
      publishAccountAuthObservation({
        accountRecoveryRequested: true,
        accountRecoverySource: 'firestore-fallback',
        accountRecoveryFallback: true,
        accountRecoveryError: error?.code || error?.message || 'account-recovery-postgresql-failed',
      });
    }
  }

  const recoveryKey = await createAccountRecoveryKey({ team, name, phone });
  const recoverySnapshot = await getDoc(
    doc(ACCOUNT_RECOVERY_KEYS_COLLECTION_REF, recoveryKey)
  );
  const recoveryData = recoverySnapshot.exists()
    ? recoverySnapshot.data()
    : null;
  const maskedEmail = String(recoveryData?.maskedEmail || '');
  const found = Boolean(
    recoveryData &&
      recoveryData.enabled !== false &&
      maskedEmail
  );

  if (!cutover.accountRecoveryRequested) {
    publishAccountAuthObservation({
      accountRecoveryRequested: false,
      accountRecoverySource: 'firestore',
      accountRecoveryFallback: false,
      accountRecoveryError: '',
    });
  }

  return {
    found,
    maskedEmail: found ? maskedEmail : '',
    source: cutover.accountRecoveryRequested ? 'firestore-fallback' : 'firestore',
  };
};

export const verifyPasswordResetIdentity = async ({
  email,
  name,
  team,
  phone,
}) => {
  const cutover = readAccountAuthCutoverConfig();
  if (cutover.accountRecoveryRequested) {
    try {
      const payload = await clerkStagingClient.verifyPasswordResetIdentity({ email, name, team, phone });
      publishAccountAuthObservation({
        accountRecoveryRequested: true,
        accountRecoverySource: 'postgresql',
        accountRecoveryFallback: false,
        accountRecoveryOperation: 'password-reset-identity-verify',
        accountRecoveryError: '',
      });
      return {
        verified: Boolean(payload?.accountRecovery?.verified),
        verifierMissing: false,
        source: 'postgresql',
        passwordResetDelivery: String(payload?.accountRecovery?.passwordResetDelivery || ''),
        clerkReady: Boolean(payload?.accountRecovery?.clerkReady),
      };
    } catch (error) {
      if (readUserFirebaseAuthRetirementConfig().requested) throw error;
      console.warn('PostgreSQL password reset verification failed; using Firestore compatibility fallback.', {
        code: error?.code,
        status: error?.status,
      });
      publishAccountAuthObservation({
        accountRecoveryRequested: true,
        accountRecoverySource: 'firestore-fallback',
        accountRecoveryFallback: true,
        accountRecoveryOperation: 'password-reset-identity-verify',
        accountRecoveryError: error?.code || error?.message || 'password-reset-postgresql-failed',
      });
    }
  }

  const recoveryKey = await createAccountRecoveryKey({ team, name, phone });
  const emailVerifier = await createAccountRecoveryEmailVerifier({
    email,
    team,
    name,
    phone,
  });
  const recoverySnapshot = await getDoc(
    doc(ACCOUNT_RECOVERY_KEYS_COLLECTION_REF, recoveryKey)
  );
  const recoveryData = recoverySnapshot.exists()
    ? recoverySnapshot.data()
    : null;

  if (!recoveryData || recoveryData.enabled === false) {
    return {
      verified: false,
      verifierMissing: false,
      source: cutover.accountRecoveryRequested ? 'firestore-fallback' : 'firestore',
    };
  }

  const storedEmailVerifier = String(recoveryData.emailVerifier || '');

  if (!storedEmailVerifier) {
    return {
      verified: false,
      verifierMissing: true,
      source: cutover.accountRecoveryRequested ? 'firestore-fallback' : 'firestore',
    };
  }

  if (!cutover.accountRecoveryRequested) {
    publishAccountAuthObservation({
      accountRecoveryRequested: false,
      accountRecoverySource: 'firestore',
      accountRecoveryFallback: false,
      accountRecoveryOperation: 'password-reset-identity-verify',
      accountRecoveryError: '',
    });
  }

  return {
    verified: storedEmailVerifier === emailVerifier,
    verifierMissing: false,
    source: cutover.accountRecoveryRequested ? 'firestore-fallback' : 'firestore',
  };
};
