// Phase 34 P1-08 D06-D2B-PREP: immutable, offline-only provider-selection contract.
// Brevo is selected. Resend remains a supported standby adapter; it is NOT removed,
// disabled globally or subject to automatic fallback. Nothing in this file can send.
import { buildD06D2AOfflinePlan, inspectD06D2AOfflinePolicy } from './mail-p108-d06d2a-sandbox-gate.mjs';

const ALL_PROVIDERS = Object.freeze(['brevo', 'resend']);
const ACTIVE_PROVIDER = 'brevo';
const FAILURE = code => Object.assign(new Error(code), {code});
export const P108_D06D2B_PREP_REAL_DELIVERY_LOCKED = true;

export function inspectD06D2BProviderPlan({requestedProvider=ACTIVE_PROVIDER, config, recipient}={}) {
  if (!ALL_PROVIDERS.includes(requestedProvider)) throw FAILURE('unsupported_provider');
  const base = {
    mode: 'OFFLINE_PROVIDER_PRESERVATION',
    selectedProvider: ACTIVE_PROVIDER,
    availableProviders: ALL_PROVIDERS,
    retainedStandbyProvider: 'resend',
    requestedProvider,
    canAutoFallback: false,
    canSwitchProvider: false,
    canExecuteVendorRequest: false,
    canDeliverEmail: false,
    canReadOrModifyOutbox: false,
    canChangeHerokuConfig: false,
    networkRequestsExecuted: 0,
    realEmailsSent: 0,
    requiresSeparateVendorApproval: true,
  };
  if (requestedProvider === 'resend') return Object.freeze({
    ...base, canBuildBrevoSandboxPreview: false,
    canUseRetainedResendOfflineMock: true,
    blockers: Object.freeze(['resend_preserved_standby_not_selected', 'separate_provider_switch_approval_required']),
    preview: null,
  });
  const gate = inspectD06D2AOfflinePolicy({config, recipient});
  return Object.freeze({ ...base,
    canBuildBrevoSandboxPreview: gate.canBuildSynthetic,
    canUseRetainedResendOfflineMock: true,
    blockers: Object.freeze([...gate.blockers]),
    preview: gate.canBuildSynthetic ? buildD06D2AOfflinePlan({config, recipient}) : null,
  });
}
