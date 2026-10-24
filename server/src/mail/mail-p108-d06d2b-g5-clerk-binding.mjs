// D06-D2B G5-PREP: compose EXISTING verified Clerk JWT authentication and
// PostgreSQL-backed administrator authorization for the isolated G2/G3 gate.
// Deliberately not imported by app.mjs, a runtime route, the Outbox or dispatcher.
// No live Clerk HTTP, supplier requests, secrets, or new resources.
import { requireMailPreflightReverification } from './mail-p108-preflight-control.mjs';
import { createClerkSessionAuthenticator } from '../auth/clerk-session.mjs';

export const P108_D06D2B_G5_PREP_VENDOR_AND_DELIVERY_LOCKED = true;
export const P108_D06D2B_G5_BOUND_ORIGIN_REQUIRED = true;
export const P108_D06D2B_G5_RETAINED_PROVIDERS = Object.freeze(['brevo','resend']);
const fault=(code)=>Object.assign(new Error(code),{code,status:403});

// The existing RS256 Clerk JWT verifier is constructed from server-only config.
// adminClerkAuthService MUST consult the PostgreSQL identity registry. No
// injected auth verifier, authority or role claims from a request body.
export function createD06D2BG5TrustedClerkAuthority({clerkJwtConfig,adminClerkAuthService,now=()=>Date.now()}={}) {
  if(!clerkJwtConfig || typeof adminClerkAuthService?.authorizeCurrent!=='function'||typeof now!=='function')
    throw new TypeError('g5_existing_server_auth_dependencies_required');
  // The shared verifier allows azp to be omitted for some general-purpose Clerk
  // clients. Owner-only mail approval is stricter: require a signed, explicitly
  // authorized web origin and refuse relaxed pending-session/skew policies.
  if(clerkJwtConfig.clerkRejectPendingSession !== true ||
     !Number.isSafeInteger(clerkJwtConfig.clerkClockSkewSeconds) ||
     clerkJwtConfig.clerkClockSkewSeconds < 0 ||
     clerkJwtConfig.clerkClockSkewSeconds > 30 ||
     !Array.isArray(clerkJwtConfig.clerkAuthorizedParties) ||
     !clerkJwtConfig.clerkAuthorizedParties.length ||
     !clerkJwtConfig.clerkAuthorizedParties.some(origin => typeof origin === 'string' &&
       /^https:\/\/[^/\s?#]+$/.test(origin)))
    throw new TypeError('g5_strict_clerk_config_required');
  // Instantiate the existing RS256 verifier in this trusted module. No injected
  // permissive or client-controlled `authenticateRequest` implementation.
  const authenticateRequest=createClerkSessionAuthenticator(clerkJwtConfig);
  return Object.freeze({
    async verifyServerAuthority(requestContext){
      const request=requestContext?.httpRequest;
      if(!request || !request.headers || typeof request.headers.authorization!=='string')
        throw fault('g5_authenticated_http_request_required');
      // Existing Clerk verifier performs RS256 verification, exp/nbf, azp and
      // pending-session checks. Never reconstruct authority from client JSON.
      let auth;
      try{auth=await authenticateRequest(request);}catch{throw fault('g5_clerk_jwt_verification_failed');}
      if(!auth || !/^user_[A-Za-z0-9]{8,}$/.test(String(auth.userId||'')) ||
         typeof auth.authorizedParty !== 'string' ||
         !/^https:\/\/[^/\s?#]+$/.test(auth.authorizedParty) ||
         !clerkJwtConfig.clerkAuthorizedParties.includes(auth.authorizedParty) ||
         auth.status !== 'active' ||
         typeof auth.sessionId!=='string' || !auth.sessionId ||
         !Number.isSafeInteger(auth.issuedAt)||!Number.isSafeInteger(auth.expiresAt))
        throw fault('g5_verified_claims_invalid');
      const current=now()/1000;
      if(!Number.isFinite(current) || auth.issuedAt>current+30 ||
         auth.expiresAt<=current || auth.expiresAt<=auth.issuedAt)
        throw fault('g5_signed_session_not_current');
      let adminAuth;
      try{adminAuth=await adminClerkAuthService.authorizeCurrent({clerkUserId:auth.userId});}
      catch{throw fault('g5_postgresql_owner_authorization_failed');}
      const admin=adminAuth?.admin;
      // Expiry must be rechecked after the database lookup: a slow query can
      // otherwise promote a token which expired while authorization was pending.
      if(auth.expiresAt <= now()/1000) throw fault('g5_signed_session_expired_during_lookup');
      if(adminAuth?.authority!=='clerk-postgresql-session' ||
         admin?.clerkUserId!==auth.userId || admin?.adminRole!=='owner' ||
         admin?.status!=='active' || admin?.clerkLinkState!=='linked' ||
         (admin.lockUntil && (!Number.isFinite(Date.parse(admin.lockUntil))||Date.parse(admin.lockUntil)>now())))
        throw fault('g5_postgresql_owner_authorization_failed');
      // The existing preflight checks factorVerificationAge[0] < 5 and a
      // signed reverification ID. No fallback to password-only login.
      const safeAuthority=Object.freeze({
        auth:Object.freeze({...auth}),
        adminAuth:Object.freeze({admin:Object.freeze({adminRole:'owner',clerkUserId:auth.userId})})
      });
      try{requireMailPreflightReverification(safeAuthority);}catch{throw fault('g5_recent_reauthentication_required');}
      return safeAuthority;
    },
    async dispatch(){throw fault('g5_vendor_dispatch_locked');},
    async retry(){throw fault('g5_automatic_retry_locked');}
  });
}
