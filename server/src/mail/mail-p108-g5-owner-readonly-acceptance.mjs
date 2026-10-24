// Phase 34 G5: narrowly scoped read-only acceptance endpoint for an EXISTING
// Staging deployment, disabled unless explicitly opted in. No emails, vendors,
// Outbox mutations, schema changes, audit writes or tokens in its response.
import { createD06D2BG5TrustedClerkAuthority } from './mail-p108-d06d2b-g5-clerk-binding.mjs';
export const G5_READONLY_ACCEPTANCE_LOCKED = true;
export const G5_READONLY_CHECK_PATH = '/api/admin/mail-delivery/g5-owner-check';
const denied = (code) => Object.assign(new Error(code), { code, status:403 });

export function createG5OwnerReadOnlyAcceptance({ config, adminClerkAuthService } = {}) {
  if (config?.appEnv !== 'staging') throw new TypeError('g5_staging_environment_required');
  const gate = createD06D2BG5TrustedClerkAuthority({
    clerkJwtConfig:config, adminClerkAuthService,
  });
  return Object.freeze({
    async check(request) {
      if (!request || request.method !== 'GET') throw denied('g5_readonly_method_required');
      // Direct raw server request is supplied; body/params never supply identity.
      await gate.verifyServerAuthority({ httpRequest:request });
      return Object.freeze({
        result:'PASS', readOnly:true, ownerVerified:true,
        verifiedBy:'signed-clerk-jwt-and-postgresql-admin',
        recentReauthenticationVerified:true, vendorCalls:0, emailsSent:0,
        schemaWrites:0, outboxMutations:0, canSend:false, canApproveSandbox:false,
      });
    },
    async dispatch() { throw denied('g5_live_delivery_locked'); },
  });
}
