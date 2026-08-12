import { normalizeUserSessionPolicy } from '../../utils/systemSettings.js';

export const resolveEffectiveUserSessionPolicy = async ({ policy }) =>
  normalizeUserSessionPolicy(policy);
