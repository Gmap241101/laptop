const DEFAULT_LOCAL_ORIGIN = 'http://localhost:5173';
const DEFAULT_PORT = 3001;
const DEFAULT_DB_POOL_MAX = 5;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;
const DEFAULT_IDLE_TIMEOUT_MS = 10000;
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

const readOrigins = (appEnv) => {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) {
    if (appEnv === 'local' || appEnv === 'development') return [DEFAULT_LOCAL_ORIGIN];
    throw new Error('CORS_ALLOWED_ORIGINS is required outside local development.');
  }
  const origins = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error('CORS_ALLOWED_ORIGINS must contain at least one origin.');
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Unsupported CORS origin protocol: ${origin}`);
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error(`CORS origin must not include a path, query, or hash: ${origin}`);
  }
  return [...new Set(origins)];
};

const readDatabaseUrl = () => {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL must use postgres:// or postgresql://.');
  return raw;
};

const readSslMode = () => {
  const mode = (process.env.DATABASE_SSL_MODE || 'auto').trim().toLowerCase();
  if (!SSL_MODES.has(mode)) throw new Error('DATABASE_SSL_MODE must be one of: auto, require, disable.');
  return mode;
};

export const readServerConfig = () => {
  const appEnv = (process.env.APP_ENV || 'local').trim().toLowerCase();
  return Object.freeze({
    appEnv,
    serviceName: (process.env.SERVICE_NAME || 'rental-api').trim(),
    serviceVersion: (process.env.SERVICE_VERSION || 'phase2').trim(),
    port: readInteger('PORT', DEFAULT_PORT, { min: 1, max: 65535 }),
    databaseUrl: readDatabaseUrl(),
    databaseSslMode: readSslMode(),
    dbPoolMax: readInteger('DB_POOL_MAX', DEFAULT_DB_POOL_MAX, { min: 1, max: 10 }),
    dbConnectionTimeoutMs: readInteger('DB_CONNECTION_TIMEOUT_MS', DEFAULT_CONNECTION_TIMEOUT_MS, { min: 1000, max: 30000 }),
    dbIdleTimeoutMs: readInteger('DB_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS, { min: 1000, max: 60000 }),
    corsAllowedOrigins: readOrigins(appEnv),
  });
};

export const shouldUseDatabaseSsl = (databaseUrl, sslMode) => {
  if (sslMode === 'require') return true;
  if (sslMode === 'disable') return false;
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  return !['localhost', '127.0.0.1', '::1'].includes(hostname);
};
