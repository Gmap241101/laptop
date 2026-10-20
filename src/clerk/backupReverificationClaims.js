/**
 * UI-only readiness check for Clerk's short-lived session token after an
 * explicitly completed email reverification. The token is NOT trusted here:
 * the backend remains the sole RS256 verifier and the one-use authority.
 */
const errorWithCode = (code) => Object.assign(new Error(code), { code });
const REVERIFICATION_ID = /^[a-zA-Z0-9_-]{10,180}$/;

export const checkBackupReverificationToken = (token, maxAgeMinutes = 5) => {
  let payload;
  try {
    if (typeof token !== 'string' || token.split('.').length !== 3) throw new Error('token_shape');
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
  } catch {
    return 'backup_verification_session_token_invalid';
  }
  if (!REVERIFICATION_ID.test(payload?.reverification_id || '')) {
    return 'backup_verification_reverification_claim_missing';
  }
  const age = payload?.fva?.[0];
  if (!Number.isInteger(age) || age < 0 || age >= maxAgeMinutes) {
    return 'backup_verification_reauthentication_not_reflected';
  }
  if (typeof payload?.sid !== 'string' || !payload.sid.trim()) {
    return 'backup_verification_session_token_invalid';
  }
  return null;
};

export const waitForBackupReverificationClaims = async (getFreshToken, options = {}) => {
  const delay = typeof options.delay === 'function'
    ? options.delay
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const intervals = Array.isArray(options.intervals) ? options.intervals : [0, 250, 500, 750, 1000];
  let lastCode = 'backup_verification_session_token_invalid';
  for (const ms of intervals) {
    if (ms > 0) await delay(ms);
    const token = await getFreshToken();
    const code = checkBackupReverificationToken(token);
    if (!code) return token;
    lastCode = code;
  }
  throw errorWithCode(lastCode);
};
