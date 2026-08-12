const DEFAULT_LOCAL_ORIGIN = 'http://localhost:5173';
const DEFAULT_PORT = 3001;
const DEFAULT_DB_POOL_MAX = 5;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;
const DEFAULT_IDLE_TIMEOUT_MS = 10000;
const DEFAULT_CLERK_CLOCK_SKEW_SECONDS = 5;
const DEFAULT_CLERK_API_URL = 'https://api.clerk.com/v1';
const DEFAULT_CLERK_API_TIMEOUT_MS = 8000;
const DEFAULT_FIREBASE_CERT_TIMEOUT_MS = 8000;
const DEFAULT_FIRESTORE_REST_TIMEOUT_MS = 8000;
const SSL_MODES = new Set(['auto', 'require', 'disable']);

const readInteger = (name, fallback, { min, max }) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  return value;
};

const readBoolean = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${name} must be true or false.`);
};

const normalizeOrigins = (name, raw) => {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error(`${name} must contain at least one origin.`);
  }

  const normalized = origins.map((origin) => {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Unsupported ${name} protocol: ${origin}`);
    }
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error(`${name} entries must be origins only (no credentials, path, query, or hash): ${origin}`);
    }
    return parsed.origin;
  });

  return [...new Set(normalized)];
};

const readOrigins = (name, appEnv, fallbackToLocal = false) => {
  const raw = process.env[name]?.trim();
  if (!raw) {
    if (fallbackToLocal && (appEnv === 'local' || appEnv === 'development' || appEnv === 'test')) {
      return [DEFAULT_LOCAL_ORIGIN];
    }
    throw new Error(`${name} is required outside local development.`);
  }

  return normalizeOrigins(name, raw);
};

const readDatabaseUrl = () => {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error('DATABASE_URL is required.');
  }

  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use postgres:// or postgresql://.');
  }

  return raw;
};

const readSslMode = () => {
  const mode = (process.env.DATABASE_SSL_MODE || 'auto').trim().toLowerCase();
  if (!SSL_MODES.has(mode)) {
    throw new Error('DATABASE_SSL_MODE must be one of: auto, require, disable.');
  }
  return mode;
};

const normalizePem = (value) => value.replace(/\\n/g, '\n').trim();

const readClerkJwtKey = (appEnv) => {
  const raw = process.env.CLERK_JWT_KEY?.trim();
  if (!raw) {
    if (appEnv === 'local' || appEnv === 'development' || appEnv === 'test') {
      return null;
    }
    throw new Error('CLERK_JWT_KEY is required outside local development.');
  }

  const normalized = normalizePem(raw);
  if (!/-----BEGIN (?:RSA )?PUBLIC KEY-----/.test(normalized)) {
    throw new Error('CLERK_JWT_KEY must be a PEM public key from the Clerk API keys page.');
  }
  return normalized;
};

const readClerkSecretKey = (appEnv) => {
  const raw = process.env.CLERK_SECRET_KEY?.trim();
  if (!raw) {
    if (appEnv === 'local' || appEnv === 'development' || appEnv === 'test') return null;
    throw new Error('CLERK_SECRET_KEY is required outside local development in Phase 5 and later.');
  }

  if (!/^sk_(?:test|live)_/.test(raw)) {
    throw new Error('CLERK_SECRET_KEY must be a Clerk Secret Key (sk_test_... or sk_live_...).');
  }
  if (appEnv === 'staging' && !raw.startsWith('sk_test_')) {
    throw new Error('Staging requires a Clerk Development Secret Key (sk_test_...).');
  }
  if (appEnv === 'production' && !raw.startsWith('sk_live_')) {
    throw new Error('Production requires a Clerk Production Secret Key (sk_live_...).');
  }
  return raw;
};


const readFirebaseProjectId = (appEnv, firebaseRuntimeDisabled = false) => {
  const raw = process.env.FIREBASE_PROJECT_ID?.trim();
  if (raw) return raw;
  if (firebaseRuntimeDisabled || appEnv === 'local' || appEnv === 'development' || appEnv === 'test') return null;
  throw new Error('FIREBASE_PROJECT_ID is required outside local development in Phase 6.');
};

const readClerkApiUrl = () => {
  const raw = (process.env.CLERK_API_URL || DEFAULT_CLERK_API_URL).trim();
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') {
    throw new Error('CLERK_API_URL must use https://.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('CLERK_API_URL must not contain credentials, query, or hash.');
  }
  return raw.replace(/\/+$/, '');
};

export const readServerConfig = () => {
  const appEnv = (process.env.APP_ENV || 'local').trim().toLowerCase();
  const corsAllowedOrigins = readOrigins('CORS_ALLOWED_ORIGINS', appEnv, true);
  const clerkJwtKey = readClerkJwtKey(appEnv);
  const clerkAuthorizedParties = clerkJwtKey
    ? readOrigins('CLERK_AUTHORIZED_PARTIES', appEnv, true)
    : [];
  const firebaseRuntimeDisabled = readBoolean('FIREBASE_RUNTIME_DISABLED', false);

  return Object.freeze({
    appEnv,
    serviceName: (process.env.SERVICE_NAME || 'rental-api').trim(),
    serviceVersion: (process.env.SERVICE_VERSION || 'phase8').trim(),
    port: readInteger('PORT', DEFAULT_PORT, { min: 1, max: 65535 }),
    databaseUrl: readDatabaseUrl(),
    databaseSslMode: readSslMode(),
    dbPoolMax: readInteger('DB_POOL_MAX', DEFAULT_DB_POOL_MAX, { min: 1, max: 10 }),
    dbConnectionTimeoutMs: readInteger(
      'DB_CONNECTION_TIMEOUT_MS',
      DEFAULT_CONNECTION_TIMEOUT_MS,
      { min: 1000, max: 30000 },
    ),
    dbIdleTimeoutMs: readInteger('DB_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS, {
      min: 1000,
      max: 60000,
    }),
    corsAllowedOrigins,
    clerkJwtKey,
    clerkAuthorizedParties,
    clerkClockSkewSeconds: readInteger(
      'CLERK_CLOCK_SKEW_SECONDS',
      DEFAULT_CLERK_CLOCK_SKEW_SECONDS,
      { min: 0, max: 60 },
    ),
    clerkRejectPendingSession: readBoolean('CLERK_REJECT_PENDING_SESSION', true),
    clerkSecretKey: readClerkSecretKey(appEnv),
    clerkApiUrl: readClerkApiUrl(),
    clerkApiTimeoutMs: readInteger('CLERK_API_TIMEOUT_MS', DEFAULT_CLERK_API_TIMEOUT_MS, {
      min: 1000,
      max: 30000,
    }),
    firebaseRuntimeDisabled,
    firebaseProjectId: readFirebaseProjectId(appEnv, firebaseRuntimeDisabled),
    firebaseCertTimeoutMs: readInteger('FIREBASE_CERT_TIMEOUT_MS', DEFAULT_FIREBASE_CERT_TIMEOUT_MS, {
      min: 1000,
      max: 30000,
    }),
    firestoreRestTimeoutMs: readInteger('FIRESTORE_REST_TIMEOUT_MS', DEFAULT_FIRESTORE_REST_TIMEOUT_MS, {
      min: 1000,
      max: 30000,
    }),
    assetBoardWriteMirrorDisabled: firebaseRuntimeDisabled || readBoolean('FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED', false),
    rentalRequestWriteMirrorDisabled: firebaseRuntimeDisabled || readBoolean('FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED', false),
    memberStatusRestrictionWriteMirrorDisabled: firebaseRuntimeDisabled || readBoolean('FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED', false),
    memberProfileWriteMirrorDisabled: firebaseRuntimeDisabled || readBoolean('FIRESTORE_MEMBER_PROFILE_WRITE_MIRROR_DISABLED', false),
    accountLifecycleCompatibilityDisabled: firebaseRuntimeDisabled || readBoolean('FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED', false),
    userFirebaseAuthCompatibilityDisabled: firebaseRuntimeDisabled || readBoolean('FIREBASE_USER_AUTH_COMPATIBILITY_DISABLED', false),
  });
};

export const shouldUseDatabaseSsl = (databaseUrl, sslMode) => {
  if (sslMode === 'require') return true;
  if (sslMode === 'disable') return false;

  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  return !['localhost', '127.0.0.1', '::1'].includes(hostname);
};
