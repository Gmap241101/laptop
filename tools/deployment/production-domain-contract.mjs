export const PRODUCTION_FRONTEND_ORIGIN = 'https://notebook.recruit.kro.kr';
export const PRODUCTION_API_ORIGIN = 'https://api.notebook.recruit.kro.kr';
export const PRODUCTION_BRANCH = 'gh-pages';

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const parseHttpsOrigin = (value, label) => {
  const raw = String(value ?? '').trim();
  if (!raw) fail(`${label}_missing`, `${label} is required.`);

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`${label}_invalid`, `${label} must be an absolute HTTPS URL.`);
  }

  if (parsed.protocol !== 'https:') {
    fail(`${label}_https_required`, `${label} must use https://.`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail(`${label}_invalid_components`, `${label} must not contain credentials, query, or hash.`);
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    fail(`${label}_path_not_allowed`, `${label} must be an origin without a path.`);
  }

  return parsed.origin;
};

const normalizeOriginList = (values = []) => values
  .map((value) => parseHttpsOrigin(value, 'origin'))
  .sort();

const assertExactOriginList = (values, expected, label) => {
  const actual = normalizeOriginList(values);
  const expectedList = [expected];
  if (actual.length !== expectedList.length || actual.some((value, index) => value !== expectedList[index])) {
    fail(
      `${label}_mismatch`,
      `${label} must contain only ${expected}. actual=${actual.join(',') || '(empty)'}`
    );
  }
};

export const validateProductionFrontendEnv = (env = process.env) => {
  const apiOrigin = parseHttpsOrigin(env?.VITE_API_URL, 'VITE_API_URL');
  if (apiOrigin !== PRODUCTION_API_ORIGIN) {
    fail(
      'production_api_origin_mismatch',
      `Production VITE_API_URL must be ${PRODUCTION_API_ORIGIN}. actual=${apiOrigin}`
    );
  }

  return Object.freeze({
    frontendOrigin: PRODUCTION_FRONTEND_ORIGIN,
    apiOrigin,
    branch: PRODUCTION_BRANCH,
  });
};

export const validateProductionBackendConfig = ({
  appEnv,
  corsAllowedOrigins = [],
  clerkAuthorizedParties = [],
} = {}) => {
  const normalizedAppEnv = String(appEnv ?? '').trim().toLowerCase();
  if (normalizedAppEnv !== 'production') {
    fail('production_app_env_required', `APP_ENV must be production. actual=${normalizedAppEnv || '(empty)'}`);
  }

  assertExactOriginList(corsAllowedOrigins, PRODUCTION_FRONTEND_ORIGIN, 'CORS_ALLOWED_ORIGINS');
  assertExactOriginList(clerkAuthorizedParties, PRODUCTION_FRONTEND_ORIGIN, 'CLERK_AUTHORIZED_PARTIES');

  return Object.freeze({
    appEnv: normalizedAppEnv,
    frontendOrigin: PRODUCTION_FRONTEND_ORIGIN,
    apiOrigin: PRODUCTION_API_ORIGIN,
  });
};
