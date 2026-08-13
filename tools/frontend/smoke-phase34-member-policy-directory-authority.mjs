import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  requestAdminMemberDirectoryAuditPostgresql,
  requestAdminMemberDirectoryRestorePostgresql,
  requestAdminSignupPolicyPatch,
} from '../../src/clerk/clerkStagingClient.js';

const clerk = { session: { async getToken() { return 'clerk-member-policy-smoke'; } } };
const requests = [];
const fetchImpl = async (url, options = {}) => {
  requests.push({ url: String(url), options });
  if (String(url).endsWith('/api/admin/member-signup-policy')) {
    return new Response(JSON.stringify({ authenticated: true, authorized: true, signupPolicyMutation: { authority: 'postgresql', operation: 'signup-policy-patch', settings: { requireRegisteredMemberForSignup: true }, termsPolicy: {}, directoryRestore: { restoredCount: 0, failed: 0 } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (String(url).endsWith('/api/admin/member-directory/audit')) {
    return new Response(JSON.stringify({ authenticated: true, authorized: true, memberDirectoryAudit: { authority: 'postgresql', audit: { total: 1, normal: 1, profileRequired: 0, duplicates: 0, missing: 0, failed: 0 } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ authenticated: true, authorized: true, memberDirectoryRestore: { authority: 'postgresql', restoredCount: 0, failed: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const policyInput = {
  requireRegisteredMemberForSignup: true,
  autoApproveNewMembers: true,
  signupTermsEnabled: true,
  signupTermsRequireReconsentOnChange: true,
  signupTermsApplyToExistingMembers: false,
};
await requestAdminSignupPolicyPatch({ clerk, apiBaseUrl: 'https://api.example.test', fetchImpl, policy: policyInput });
await requestAdminMemberDirectoryAuditPostgresql({ clerk, apiBaseUrl: 'https://api.example.test', fetchImpl });
await requestAdminMemberDirectoryRestorePostgresql({ clerk, apiBaseUrl: 'https://api.example.test', fetchImpl });
assert.equal(requests.length, 3);
assert.ok(requests.every((item) => item.options.headers.Authorization === 'Bearer clerk-member-policy-smoke'));
assert.equal(Buffer.byteLength(requests[0].options.body, 'utf8') < 2048, true, 'signup policy request must stay small and must not carry the full terms domain');

const auditSource = fs.readFileSync(new URL('../../src/features/members/useAdminMemberDirectoryAuditActions.js', import.meta.url), 'utf8');
assert.equal(auditSource.includes('retiredLegacyDataCompat'), false);
assert.equal(/\bgetDocs\b|\bsetDoc\b|\bwriteBatch\b|commitFirestoreOperations|firebaseAuth\.currentUser/.test(auditSource), false);
assert.match(auditSource, /auditAdminMemberDirectory\(\)/);
assert.match(auditSource, /restoreAdminMemberDirectoryMismatches\(\)/);
const policySource = fs.readFileSync(new URL('../../src/features/members/useAdminSignupPolicyActions.js', import.meta.url), 'utf8');
assert.equal(policySource.includes('replacePolicyContentDomainInPostgresql'), false);
assert.match(policySource, /saveAdminSignupPolicy\(/);

console.log('[phase34-member-policy-directory-authority-frontend-smoke] PASS');
