// Phase 34 hard retirement.
// Firebase is no longer a runtime provider and there is no browser rollback.
export const readFirebaseRuntimeRetirementConfig = () =>
  Object.freeze({
    enabled: true,
    requested: true,
    queryRollback: false,
    mode: 'removed',
    source: 'phase34-hard-retirement',
  });
