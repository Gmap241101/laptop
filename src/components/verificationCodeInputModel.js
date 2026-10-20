/**
 * Six-digit email verification input model.
 * Keep the same digit-only, paste-all and keyboard-navigation behavior
 * as the existing login/device-trust code field.
 */
export const VERIFICATION_CODE_LENGTH = 6;

export const normalizeVerificationCode = (value) =>
  String(value ?? '').replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);

export const splitVerificationCode = (value) => {
  const normalized = normalizeVerificationCode(value);
  return Array.from({ length: VERIFICATION_CODE_LENGTH }, (_, index) => normalized[index] || '');
};

export function updateVerificationCodeDigit(currentCode, index, rawValue) {
  if (!Number.isInteger(index) || index < 0 || index >= VERIFICATION_CODE_LENGTH) {
    return { code: normalizeVerificationCode(currentCode), focusIndex: null };
  }
  const digits = splitVerificationCode(currentCode);
  const incoming = normalizeVerificationCode(rawValue);
  if (!incoming) {
    digits[index] = '';
    return { code: normalizeVerificationCode(digits.join('')), focusIndex: null };
  }
  for (let offset = 0; offset < incoming.length && index + offset < VERIFICATION_CODE_LENGTH; offset += 1) {
    digits[index + offset] = incoming[offset];
  }
  return {
    code: normalizeVerificationCode(digits.join('')),
    focusIndex: Math.min(index + incoming.length, VERIFICATION_CODE_LENGTH - 1),
  };
}

export const isCompleteVerificationCode = (value) =>
  /^\d{6}$/.test(String(value ?? ''));
