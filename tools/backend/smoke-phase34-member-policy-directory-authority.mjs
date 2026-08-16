import assert from 'node:assert/strict';
import { createMemberAuthorityService } from '../../server/src/members/member-authority-service.mjs';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';

const adminIdentity = Object.freeze({ source: 'clerk-postgresql', uid: 'admin-1', email: 'admin@example.test' });

const accounts = [
  {
    appUserId: '1', firebaseUid: 'member-1', uid: 'member-1', email: 'one@example.test', name: 'One', team: 'Team A', phone: '010-1111-1111',
    status: 'active', directoryMemberId: 'DIR-1', directoryVerifiedVersion: 3, directoryOverrideByAdmin: false, profileRequiredReason: '', identityKey: '', recoveryKey: '', previousAccountUids: [],
  },
  {
    appUserId: '2', firebaseUid: 'member-2', uid: 'member-2', email: 'two@example.test', name: 'Two', team: 'Team B', phone: '010-2222-2222',
    status: 'active', directoryMemberId: '', directoryVerifiedVersion: 0, directoryOverrideByAdmin: false, profileRequiredReason: '', identityKey: '', recoveryKey: '', previousAccountUids: [],
  },
  {
    appUserId: '3', firebaseUid: 'member-override', uid: 'member-override', email: 'override@example.test', name: 'Override', team: 'Manual Team', phone: '010-3333-3333',
    status: 'active', directoryMemberId: '', directoryVerifiedVersion: 0, directoryOverrideByAdmin: true, profileRequiredReason: '', identityKey: '', recoveryKey: '', previousAccountUids: [],
  },
];

const crypto = await import('node:crypto');
const normalize = (value) => String(value || '').normalize('NFKC').trim();
const keyFor = (team, name) => crypto.createHash('sha256').update(`${normalize(team).toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ')}\u001f${normalize(name).toLocaleLowerCase('ko-KR').replace(/\s+/g, '')}`).digest('hex');
const directoryEntries = [
  { identityKey: keyFor('Team A', 'One'), directoryMemberId: 'DIR-1', name: 'One', team: 'Team A', enabled: true },
];
accounts[0].identityKey = directoryEntries[0].identityKey;

const siteState = {
  'rental-config': {
    domain: 'rental-config', source: 'postgresql', documents: [{ key: 'rentalSystem/publicConfig', payload: { settings: { requireRegisteredMemberForSignup: true, memberDirectoryVersion: 3 } }, enabled: true, sortOrder: 0 }],
  },
};
let siteReplaceCount = 0;
const siteContentRepository = {
  async getDomain(domain) { return siteState[domain] || null; },
  async replaceDomain({ domain, documents, sourceMode }) {
    siteReplaceCount += 1;
    siteState[domain] = { domain, source: 'postgresql', sourceMode, documents: documents.map((item) => ({ ...item })) };
    return siteState[domain];
  },
};

const repository = {
  async findByFirebaseUid(uid) { return accounts.find((item) => item.firebaseUid === uid) || null; },
  async findActiveIdentityOwner() { return null; },
  async findDirectoryEntryByIdentityKey(identityKey) { return directoryEntries.find((item) => item.identityKey === identityKey) || null; },
  async getDirectoryBootstrapState() { return { completed: true, version: 3 }; },
  async replaceDirectoryEntries() { return { completed: true, version: 3 }; },
  async listDirectoryEntries() { return directoryEntries; },
  async listMembersForDirectoryAudit() { return accounts.map((item) => ({ ...item })); },
  async getFullBootstrapState() { return { completed: true }; },
  async bootstrapMemberAccounts() { return { completed: true }; },
  async countBlockingRentalRequestsForUids() { return 0; },
  async mutateProfile({ firebaseUid, nextProfile }) {
    const index = accounts.findIndex((item) => item.firebaseUid === firebaseUid);
    assert.notEqual(index, -1);
    accounts[index] = { ...accounts[index], ...nextProfile, firebaseUid, uid: firebaseUid };
    return { mutationId: `mutation-${firebaseUid}` };
  },
};

const memberService = createMemberAuthorityService({
  repository,
  firebaseLinkRepository: { async findByFirebaseUid() { return null; }, async findByAppUserId() { return null; } },
  userRepository: { async findByClerkUserId() { return null; } },
  rentalRestrictionRepository: { async findByFirebaseUid() { return null; } },
  writeMirrorEnabled: false,
  profileWriteMirrorEnabled: false,
  siteContentRepository,
  userFirebaseAuthCompatibilityDisabled: true,
});

const auditResult = await memberService.auditMemberDirectoryAdmin({ firebaseIdentity: adminIdentity });
assert.equal(auditResult.authority, 'postgresql');
assert.equal(auditResult.audit.total, 3);
assert.equal(auditResult.audit.adminOverrides, 1);
assert.equal(auditResult.audit.normal, 2);
assert.equal(auditResult.audit.profileRequired, 1);
assert.equal(auditResult.audit.missing, 1);
assert.equal(accounts[1].status, 'profileRequired');
assert.equal(accounts[1].profileRequiredReason, 'directoryMismatch');
assert.equal(accounts[2].status, 'active');
assert.equal(accounts[2].directoryOverrideByAdmin, true);
assert.ok(siteReplaceCount >= 1);
assert.equal(siteState['rental-config'].documents[0].payload.memberDirectoryAudit.profileRequired, 1);

siteState['rental-config'].documents[0].payload.settings.requireRegisteredMemberForSignup = false;
const restoreResult = await memberService.restoreDirectoryMismatchAdmin({ firebaseIdentity: adminIdentity });
assert.equal(restoreResult.authority, 'postgresql');
assert.equal(restoreResult.restoredCount, 1);
assert.equal(restoreResult.failed, 0);
assert.equal(accounts[1].status, 'active');
assert.equal(accounts[1].profileRequiredReason, '');

const policyOffAdminEdit = await memberService.editAdmin({
  firebaseIdentity: adminIdentity,
  targetUid: 'member-override',
  input: {
    name: 'Override',
    team: 'Policy Off Free Team',
    phone: '010-3333-4444',
    directoryOverrideByAdmin: true,
  },
});
assert.equal(policyOffAdminEdit.authority, 'postgresql');
assert.equal(accounts[2].team, 'Policy Off Free Team');
assert.equal(accounts[2].directoryOverrideByAdmin, false, 'directory override must be cleared/ignored while the signup directory policy is disabled');
assert.equal(accounts[2].directoryMemberId, '');
assert.equal(accounts[2].directoryVerifiedVersion, 0);

const largeTermsText = 'x'.repeat(80 * 1024);
const contentState = {
  'rental-config': {
    domain: 'rental-config', source: 'postgresql', documents: [{ key: 'rentalSystem/publicConfig', payload: { settings: { requireRegisteredMemberForSignup: false, memberDirectoryVersion: 3, signupTermsEnabled: false } }, enabled: true, sortOrder: 0 }],
  },
  terms: {
    domain: 'terms', source: 'postgresql', documents: [
      { key: 'signupTermsPolicy/current', payload: { enabled: false, revision: 0, requiredRevision: 0, initialRevision: 0, activeTerms: [{ id: 'terms-1', title: 'Terms', contentHtml: largeTermsText }] }, enabled: false, sortOrder: 0 },
      { key: 'signupTerms/terms-1', payload: { title: 'Terms', contentHtml: largeTermsText }, enabled: true, sortOrder: 1 },
    ],
  },
};
const contentRepository = {
  async getDomain(domain) { return contentState[domain] || null; },
  async replaceDomain({ domain, documents, sourceMode }) {
    contentState[domain] = { domain, source: 'postgresql', sourceMode, documents: documents.map((item) => ({ ...item })) };
    return contentState[domain];
  },
  async getRentalConfigBootstrapContext() { return { memberDirectoryVersion: 3, memberDirectoryEntryCount: 1 }; },
};
const contentService = createSiteContentService({ repository: contentRepository });
const policyResult = await contentService.patchSignupPolicy({
  policyPatch: {
    requireRegisteredMemberForSignup: true,
    autoApproveNewMembers: true,
    signupTermsEnabled: true,
    signupTermsRequireReconsentOnChange: true,
    signupTermsApplyToExistingMembers: false,
  },
  actorClerkUserId: 'clerk-admin-1',
});
assert.equal(policyResult.authority, 'postgresql');
assert.equal(policyResult.settings.requireRegisteredMemberForSignup, true);
assert.equal(policyResult.settings.memberDirectoryVersion, 3, 'signup-policy toggle must not advance the PostgreSQL member-directory data version');
assert.equal(policyResult.termsPolicy.enabled, true);
assert.equal(policyResult.termsPolicy.activeTerms[0].contentHtml.length, 80 * 1024, 'large existing terms content must be preserved server-side without browser full-domain PUT');
assert.equal(contentState.terms.documents.find((item) => item.key === 'signupTermsPolicy/current').payload.activeTerms[0].contentHtml.length, 80 * 1024);

console.log('[phase34-member-policy-directory-authority-backend-smoke] PASS');
