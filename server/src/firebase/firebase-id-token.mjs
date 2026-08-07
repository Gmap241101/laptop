import { createPublicKey, verify as verifySignature } from 'node:crypto';

const DEFAULT_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const DEFAULT_CERT_CACHE_SECONDS = 300;
const DEFAULT_CLOCK_SKEW_SECONDS = 5;

const createAuthError = (code, message) => {
  const error = new Error(message);
  error.name = 'FirebaseIdTokenError';
  error.code = code;
  return error;
};

const decodeBase64Url = (value) => {
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    throw createAuthError('firebase_token_malformed', 'Firebase ID token contains invalid base64url data.');
  }
};

const decodeJsonSegment = (segment, label) => {
  try {
    return JSON.parse(decodeBase64Url(segment).toString('utf8'));
  } catch (error) {
    if (error?.code === 'firebase_token_malformed') throw error;
    throw createAuthError('firebase_token_malformed', `Firebase ID token ${label} is not valid JSON.`);
  }
};

const readMaxAgeSeconds = (cacheControl) => {
  const match = String(cacheControl || '').match(/(?:^|,)\s*max-age=(\d+)/i);
  if (!match) return DEFAULT_CERT_CACHE_SECONDS;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CERT_CACHE_SECONDS;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const extractFirebaseBearerToken = (request) => {
  const raw = String(request?.headers?.['x-firebase-authorization'] || '').trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw createAuthError('firebase_authorization_missing', 'Firebase authorization token is required.');
  }
  return match[1].trim();
};

export const createFirebaseIdTokenVerifier = ({
  projectId,
  fetchImpl = fetch,
  certsUrl = DEFAULT_CERTS_URL,
  clock = () => Date.now(),
  clockSkewSeconds = DEFAULT_CLOCK_SKEW_SECONDS,
  timeoutMs = 8000,
} = {}) => {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  let cachedCertificates = null;
  let certificateExpiresAt = 0;
  let certificatePromise = null;

  const loadCertificates = async (forceRefresh = false) => {
    if (forceRefresh) {
      cachedCertificates = null;
      certificateExpiresAt = 0;
    }
    const now = clock();
    if (cachedCertificates && now < certificateExpiresAt) return cachedCertificates;
    if (certificatePromise) return certificatePromise;

    certificatePromise = (async () => {
      let response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetchImpl(certsUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });
      } catch {
        throw createAuthError('firebase_certificates_unavailable', 'Firebase signing certificates could not be fetched.');
      } finally {
        clearTimeout(timer);
      }

      if (!response?.ok) {
        throw createAuthError('firebase_certificates_unavailable', `Firebase signing certificates returned HTTP ${response?.status || 0}.`);
      }

      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw createAuthError('firebase_certificates_invalid', 'Firebase signing certificates response is invalid.');
      }

      const certificates = new Map(
        Object.entries(payload)
          .map(([kid, pem]) => [String(kid), String(pem || '').trim()])
          .filter(([kid, pem]) => kid && pem),
      );
      if (!certificates.size) {
        throw createAuthError('firebase_certificates_invalid', 'Firebase signing certificates response is empty.');
      }

      const maxAgeSeconds = readMaxAgeSeconds(response.headers?.get?.('cache-control'));
      cachedCertificates = certificates;
      certificateExpiresAt = clock() + maxAgeSeconds * 1000;
      return certificates;
    })();

    try {
      return await certificatePromise;
    } finally {
      certificatePromise = null;
    }
  };

  return async (idToken) => {
    const token = String(idToken || '').trim();
    const segments = token.split('.');
    if (segments.length !== 3 || segments.some((segment) => !segment)) {
      throw createAuthError('firebase_token_malformed', 'Firebase ID token must contain three JWT segments.');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = segments;
    const header = decodeJsonSegment(encodedHeader, 'header');
    const payload = decodeJsonSegment(encodedPayload, 'payload');

    if (header.alg !== 'RS256') {
      throw createAuthError('firebase_algorithm_invalid', 'Firebase ID token must use RS256.');
    }
    const kid = String(header.kid || '').trim();
    if (!kid) throw createAuthError('firebase_kid_missing', 'Firebase ID token kid is required.');

    const nowSeconds = Math.floor(clock() / 1000);
    const skew = Number(clockSkewSeconds) || 0;
    const exp = Number(payload.exp);
    const iat = Number(payload.iat);
    const authTime = Number(payload.auth_time);
    if (!Number.isFinite(exp) || exp <= nowSeconds - skew) {
      throw createAuthError('firebase_token_expired', 'Firebase ID token has expired.');
    }
    if (!Number.isFinite(iat) || iat > nowSeconds + skew) {
      throw createAuthError('firebase_token_iat_invalid', 'Firebase ID token iat is invalid.');
    }
    if (!Number.isFinite(authTime) || authTime > nowSeconds + skew) {
      throw createAuthError('firebase_token_auth_time_invalid', 'Firebase ID token auth_time is invalid.');
    }
    if (payload.aud !== normalizedProjectId) {
      throw createAuthError('firebase_audience_invalid', 'Firebase ID token audience does not match this project.');
    }
    if (payload.iss !== `https://securetoken.google.com/${normalizedProjectId}`) {
      throw createAuthError('firebase_issuer_invalid', 'Firebase ID token issuer does not match this project.');
    }

    const uid = String(payload.sub || '').trim();
    if (!uid) throw createAuthError('firebase_subject_missing', 'Firebase ID token subject is required.');

    let certificates = await loadCertificates();
    let certificate = certificates.get(kid);
    if (!certificate) {
      certificates = await loadCertificates(true);
      certificate = certificates.get(kid);
    }
    if (!certificate) {
      throw createAuthError('firebase_kid_unknown', 'Firebase ID token signing key is unknown.');
    }

    let verified = false;
    try {
      verified = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        createPublicKey(certificate),
        decodeBase64Url(encodedSignature),
      );
    } catch {
      throw createAuthError('firebase_signature_invalid', 'Firebase ID token signature could not be verified.');
    }
    if (!verified) throw createAuthError('firebase_signature_invalid', 'Firebase ID token signature is invalid.');

    return Object.freeze({
      uid,
      email: normalizeEmail(payload.email),
      emailVerified: payload.email_verified === true,
      signInProvider: String(payload.firebase?.sign_in_provider || '').trim(),
      authTime,
      issuedAt: iat,
      expiresAt: exp,
    });
  };
};
