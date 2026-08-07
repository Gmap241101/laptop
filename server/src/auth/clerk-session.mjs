import { createPublicKey, verify as verifySignature } from 'node:crypto';

const REQUIRED_STRING_CLAIMS = ['sub', 'sid'];

const decodeJsonSegment = (segment, label) => {
  try {
    const decoded = Buffer.from(segment, 'base64url').toString('utf8');
    const value = JSON.parse(decoded);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    return value;
  } catch (error) {
    const wrapped = new Error(`Invalid Clerk JWT ${label}.`);
    wrapped.code = 'invalid_token';
    wrapped.cause = error;
    throw wrapped;
  }
};

const normalizeBearerToken = (authorization) => {
  if (typeof authorization !== 'string' || authorization.trim() === '') {
    const error = new Error('Authorization header is required.');
    error.code = 'missing_token';
    throw error;
  }

  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    const error = new Error('Authorization header must use Bearer authentication.');
    error.code = 'invalid_authorization_header';
    throw error;
  }

  return match[1];
};

const parseJwt = (token) => {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    const error = new Error('Clerk session token must be a three-part JWT.');
    error.code = 'invalid_token';
    throw error;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  return {
    encodedHeader,
    encodedPayload,
    encodedSignature,
    header: decodeJsonSegment(encodedHeader, 'header'),
    payload: decodeJsonSegment(encodedPayload, 'payload'),
  };
};

const requireNumericDate = (payload, claim) => {
  const value = payload[claim];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    const error = new Error(`Clerk JWT ${claim} claim is required.`);
    error.code = 'invalid_token';
    throw error;
  }
  return value;
};

const requireStringClaims = (payload) => {
  for (const claim of REQUIRED_STRING_CLAIMS) {
    if (typeof payload[claim] !== 'string' || payload[claim].trim() === '') {
      const error = new Error(`Clerk JWT ${claim} claim is required.`);
      error.code = 'invalid_token';
      throw error;
    }
  }
};

const createAuthError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export const createClerkSessionAuthenticator = (config) => {
  if (!config.clerkJwtKey) {
    throw new Error('CLERK_JWT_KEY is required to enable Clerk session authentication.');
  }
  if (!Array.isArray(config.clerkAuthorizedParties) || config.clerkAuthorizedParties.length === 0) {
    throw new Error('CLERK_AUTHORIZED_PARTIES must contain at least one origin.');
  }

  let publicKey;
  try {
    publicKey = createPublicKey(config.clerkJwtKey);
  } catch (error) {
    const wrapped = new Error('CLERK_JWT_KEY is not a valid public key.');
    wrapped.cause = error;
    throw wrapped;
  }

  const clockSkewSeconds = config.clerkClockSkewSeconds;

  return async (request) => {
    const token = normalizeBearerToken(request.headers.authorization);
    const parsed = parseJwt(token);

    if (parsed.header.alg !== 'RS256') {
      throw createAuthError('invalid_algorithm', 'Clerk session token must use RS256.');
    }

    let signature;
    try {
      signature = Buffer.from(parsed.encodedSignature, 'base64url');
    } catch {
      throw createAuthError('invalid_token', 'Clerk session token signature is malformed.');
    }

    const signingInput = Buffer.from(`${parsed.encodedHeader}.${parsed.encodedPayload}`, 'ascii');
    const signatureIsValid = verifySignature('RSA-SHA256', signingInput, publicKey, signature);
    if (!signatureIsValid) {
      throw createAuthError('invalid_signature', 'Clerk session token signature is invalid.');
    }

    requireStringClaims(parsed.payload);
    const exp = requireNumericDate(parsed.payload, 'exp');
    const nbf = requireNumericDate(parsed.payload, 'nbf');
    const now = Math.floor(Date.now() / 1000);

    if (exp <= now - clockSkewSeconds) {
      throw createAuthError('token_expired', 'Clerk session token has expired.');
    }
    if (nbf > now + clockSkewSeconds) {
      throw createAuthError('token_not_yet_valid', 'Clerk session token is not yet valid.');
    }

    if (parsed.payload.azp && !config.clerkAuthorizedParties.includes(parsed.payload.azp)) {
      throw createAuthError('invalid_authorized_party', 'Clerk session token authorized party is not allowed.');
    }

    if (config.clerkRejectPendingSession && parsed.payload.sts === 'pending') {
      throw createAuthError('pending_session', 'Clerk session is pending and cannot access the API.');
    }

    return Object.freeze({
      userId: parsed.payload.sub,
      sessionId: parsed.payload.sid,
      authorizedParty: typeof parsed.payload.azp === 'string' ? parsed.payload.azp : null,
      issuedAt: typeof parsed.payload.iat === 'number' ? parsed.payload.iat : null,
      expiresAt: exp,
      status: typeof parsed.payload.sts === 'string' ? parsed.payload.sts : null,
    });
  };
};
