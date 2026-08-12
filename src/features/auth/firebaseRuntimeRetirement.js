const trim = (value) => String(value ?? '').trim();
const bool = (value) => trim(value).toLowerCase() === 'true';

export const PHASE34_FIREBASE_RUNTIME_RETIREMENT_REVISION =
  'phase34-firebase-runtime-retirement-20260812-1300';

export const readFirebaseRuntimeRetirementConfig = ({
  env = import.meta.env,
  location = globalThis.location,
} = {}) => {
  const staging = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const enabled = staging && bool(env?.VITE_FIREBASE_RUNTIME_DISABLED);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const rollbackRequested = enabled && params.get('firebaseRuntime') === 'compatibility';
  return Object.freeze({
    enabled,
    requested: Boolean(enabled && !rollbackRequested),
    rollbackRequested,
    authSource: enabled && !rollbackRequested ? 'clerk' : 'firebase-compatibility',
    dataSource: enabled && !rollbackRequested ? 'postgresql' : 'compatibility',
  });
};
