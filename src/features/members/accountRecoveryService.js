import { doc, getDoc } from 'firebase/firestore';

import {
  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
} from '../../firebase.js';
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

export const createDefaultAccountRecoveryForm = (initialValues = {}) => ({
  name: String(initialValues.name || ''),
  team: String(initialValues.team || ''),
  phonePrefix: String(initialValues.phonePrefix || '010'),
  phoneMiddle: String(initialValues.phoneMiddle || ''),
  phoneLast: String(initialValues.phoneLast || ''),
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

  return {
    found,
    maskedEmail: found ? maskedEmail : '',
  };
};

export const verifyPasswordResetIdentity = async ({
  email,
  name,
  team,
  phone,
}) => {
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
    };
  }

  const storedEmailVerifier = String(recoveryData.emailVerifier || '');

  if (!storedEmailVerifier) {
    return {
      verified: false,
      verifierMissing: true,
    };
  }

  return {
    verified: storedEmailVerifier === emailVerifier,
    verifierMissing: false,
  };
};
