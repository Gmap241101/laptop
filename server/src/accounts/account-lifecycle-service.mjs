import { createHash } from 'node:crypto';

const trim = (value) => String(value ?? '').normalize('NFKC').trim();
const ADMIN_PROVISIONED_TERMS_POLICY_VERSION = -1;
const lower = (value) => trim(value).toLocaleLowerCase('ko-KR');
const sha256 = (value) => createHash('sha256').update(String(value || '')).digest('hex');
const normalizeName = (value) => trim(value).replace(/\s+/g, '');
const normalizeTeam = (value) => trim(value).replace(/\s+/g, ' ');
const normalizePhone = (value) => trim(value);
const validName = (value) => /^[가-힣A-Za-z]{2,30}$/u.test(normalizeName(value));
const validPhone = (value) => /^(02|0\d{2})-\d{3,4}-\d{4}$/.test(normalizePhone(value));
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower(value));
const identityKey = ({ team, name }) => sha256(`${lower(normalizeTeam(team))}\u001f${lower(normalizeName(name))}`);
const recoveryKey = ({ team, name, phone }) => sha256([
  lower(normalizeTeam(team)),
  lower(normalizeName(name)),
  String(phone || '').replace(/\D/g, ''),
].join('\u001f'));

const maskSegment = (value) => {
  const source = String(value || '');
  if (source.length <= 1) return '*';
  if (source.length === 2) return `${source[0]}*`;
  return `${source[0]}${'*'.repeat(source.length - 2)}${source.at(-1)}`;
};
const maskEmail = (value) => {
  const email = lower(value);
  if (!validEmail(email)) return '';
  const [local, domain] = email.split('@');
  const labels = domain.split('.');
  return `${maskSegment(local)}@${labels.map((label, index) => index === labels.length - 1 ? label : maskSegment(label)).join('.')}`;
};

const serviceError = (code, message, status = 400) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
};

const getDocument = (domain, key) => (domain?.documents || []).find((item) => item?.key === key) || null;
const normalizePolicy = (payload = {}) => ({
  enabled: Boolean(payload.enabled),
  revision: Math.max(0, Number(payload.revision || 0)),
  requiredRevision: Math.max(0, Number(payload.requiredRevision || 0)),
  initialRevision: Math.max(0, Number(payload.initialRevision || 0)),
  activeTerms: (Array.isArray(payload.activeTerms) ? payload.activeTerms : []).map((term) => ({
    id: trim(term?.id), title: trim(term?.title), contentHash: trim(term?.contentHash),
    required: Boolean(term?.required), version: Math.max(1, Number(term?.version || 1)),
    versionId: trim(term?.versionId || term?.currentVersionId),
    displayOrder: Number.isFinite(Number(term?.displayOrder)) ? Number(term.displayOrder) : 0,
  }))
    .filter((term) => term.id && term.title)
    .sort((first, second) => first.displayOrder - second.displayOrder || first.title.localeCompare(second.title, 'ko')),
});

const validateTerms = ({ policy, submission, source }) => {
  if (!policy.enabled || policy.activeTerms.length === 0) return [];
  if (Number(submission?.policyRevision || 0) !== policy.revision) {
    throw serviceError('terms_policy_changed', 'Terms policy changed during the request.', 409);
  }
  const byId = new Map((Array.isArray(submission?.decisions) ? submission.decisions : []).map((item) => [trim(item?.termId), item]));
  if (byId.size !== policy.activeTerms.length) throw serviceError('terms_policy_changed', 'Terms decision set does not match the active policy.', 409);
  return policy.activeTerms.map((term) => {
    const decision = byId.get(term.id);
    const accepted = decision?.decision === 'accepted';
    const declined = decision?.decision === 'declined';
    const viewedAtMs = Number(decision?.viewedAtMs || 0);
    if (!decision || Number(decision.termVersion || 0) !== term.version || trim(decision.termVersionId) !== term.versionId || trim(decision.contentHash) !== term.contentHash) {
      throw serviceError('terms_policy_changed', 'Terms content changed during the request.', 409);
    }
    if (term.required && (!accepted || viewedAtMs <= 0)) throw serviceError('terms_required_not_accepted', 'Required terms must be viewed and accepted.', 409);
    if (!term.required && (!(accepted || declined) || viewedAtMs <= 0)) throw serviceError('terms_decision_required', 'Optional terms require a viewed decision.', 409);
    return Object.freeze({
      termId: term.id,
      termVersion: term.version,
      termVersionId: term.versionId,
      policyRevision: policy.revision,
      decision: accepted ? 'accepted' : 'declined',
      requiredSnapshot: term.required,
      titleSnapshot: term.title,
      contentHash: term.contentHash,
      viewedAtMs,
      source,
    });
  });
};

export const createAccountLifecycleService = ({ repository, siteContentRepository, userAuthRepository, authorityEnabled = false }) => {
  if (!repository || typeof repository.createSignupAccount !== 'function' || typeof repository.findRetiredAccountsByEmail !== 'function' || typeof repository.getConsentSnapshot !== 'function' || typeof repository.importConsents !== 'function' || typeof repository.saveConsents !== 'function') {
    throw new TypeError('Account lifecycle repository is required.');
  }
  if (!siteContentRepository || (typeof siteContentRepository.getDocument !== 'function' && typeof siteContentRepository.getDomain !== 'function')) throw new TypeError('Site content repository is required.');
  if (!userAuthRepository || typeof userAuthRepository.findByClerkUserId !== 'function') throw new TypeError('User auth repository is required.');

  const assertAuthorityEnabled = () => {
    if (!authorityEnabled) {
      throw serviceError(
        'account_lifecycle_authority_disabled',
        'PostgreSQL account lifecycle authority is disabled by backend configuration.',
        503,
      );
    }
  };

  const loadPolicyContext = async () => {
    const readDocument = async (domain, key) => {
      if (typeof siteContentRepository.getDocument === 'function') {
        return siteContentRepository.getDocument(domain, key);
      }
      return getDocument(await siteContentRepository.getDomain(domain), key);
    };
    const [rentalConfigDocument, termsPolicyDocument] = await Promise.all([
      readDocument('rental-config', 'rentalSystem/publicConfig'),
      readDocument('terms', 'signupTermsPolicy/current'),
    ]);
    const rentalConfig = rentalConfigDocument?.payload || {};
    const settings = rentalConfig?.settings && typeof rentalConfig.settings === 'object' ? rentalConfig.settings : {};
    const policy = normalizePolicy(termsPolicyDocument?.payload || {});
    return { settings, policy };
  };

  let termsPolicyReadCache = null;
  const TERMS_POLICY_READ_CACHE_TTL_MS = 30_000;

  const loadTermsPolicy = async () => {
    if (typeof siteContentRepository.getDocument === 'function') {
      const document = await siteContentRepository.getDocument('terms', 'signupTermsPolicy/current');
      return normalizePolicy(document?.payload || {});
    }
    const terms = await siteContentRepository.getDomain('terms');
    return normalizePolicy(getDocument(terms, 'signupTermsPolicy/current')?.payload || {});
  };

  const loadTermsPolicyCached = async () => {
    const now = Date.now();
    if (termsPolicyReadCache?.policy && termsPolicyReadCache.expiresAt > now) {
      return termsPolicyReadCache.policy;
    }
    const policy = await loadTermsPolicy();
    termsPolicyReadCache = { policy, expiresAt: Date.now() + TERMS_POLICY_READ_CACHE_TTL_MS };
    return policy;
  };

  const resolveFirebaseUid = async (clerkUserId) => {
    const account = await userAuthRepository.findByClerkUserId(trim(clerkUserId));
    if (!account?.firebaseUid) throw serviceError('user_clerk_not_linked', 'Clerk user is not linked to a PostgreSQL member account.', 403);
    return account.firebaseUid;
  };

  return Object.freeze({
    async signup({ firebaseIdentity, input = {} }) {
      assertAuthorityEnabled();
      const firebaseUid = trim(firebaseIdentity?.uid);
      const email = lower(input.email || firebaseIdentity?.email);
      const name = normalizeName(input.name);
      const team = normalizeTeam(input.team);
      const phone = normalizePhone(input.phone);
      if (!firebaseUid || !firebaseIdentity?.idToken) throw serviceError('signup_firebase_identity_missing', 'Firebase compatibility identity is required for signup.', 401);
      if (!validEmail(email) || (firebaseIdentity?.email && lower(firebaseIdentity.email) !== email)) throw serviceError('signup_email_mismatch', 'Signup email does not match the Firebase identity.', 409);
      if (!validName(name) || !team || !validPhone(phone)) throw serviceError('signup_profile_invalid', 'Signup member profile is invalid.', 400);

      const { settings, policy } = await loadPolicyContext();
      const nextIdentityKey = identityKey({ team, name });
      const nextRecoveryKey = recoveryKey({ team, name, phone });
      const directoryRequired = Boolean(settings.requireRegisteredMemberForSignup);
      const directoryVersion = Math.max(0, Number(settings.memberDirectoryVersion || 0));
      let directoryMemberId = '';
      if (directoryRequired) {
        const directory = await repository.getDirectoryEntry(nextIdentityKey);
        if (!directory || directory.enabled === false || normalizeName(directory.name) !== name || normalizeTeam(directory.team) !== team) {
          throw serviceError('member_directory_mismatch', 'Registered member directory does not match the signup profile.', 409);
        }
        directoryMemberId = trim(directory.directory_member_id);
      }
      const identityAccounts = await repository.findIdentityAccounts(nextIdentityKey);
      const active = identityAccounts.find((account) => trim(account.status) !== 'retired' && trim(account.firebase_uid) !== firebaseUid);
      if (active) throw serviceError('member_identity_already_claimed', 'Another active member already owns the signup identity.', 409);
      const retiredEmailAccounts = await repository.findRetiredAccountsByEmail(email);
      const retiredUids = retiredEmailAccounts.map((account) => trim(account.firebase_uid)).filter((uid) => uid && uid !== firebaseUid);
      const rejoinedAccount = retiredUids.length > 0;
      const autoApprove = directoryRequired && Boolean(settings.autoApproveNewMembers) && !rejoinedAccount;
      const status = autoApprove ? 'active' : 'pending';
      const decisions = validateTerms({ policy, submission: input.terms || {}, source: 'signup' });
      const row = await repository.createSignupAccount({
        firebaseUid, email, maskedEmail: maskEmail(email), name, team, phone, status,
        identityKey: nextIdentityKey, recoveryKey: nextRecoveryKey,
        directoryMemberId, directoryVerifiedVersion: directoryRequired ? directoryVersion : 0,
        previousAccountUids: retiredUids, rejoinedAccount,
        termsConsentRevision: policy.enabled ? policy.revision : 0,
        termsConsentPolicyVersion: policy.enabled ? policy.revision : 0,
        decisions,
      });
      return Object.freeze({ source: 'postgresql', authority: 'postgresql', firestoreBootstrap: 'retired', status, account: row });
    },


    async provisionAdminMember({ firebaseUid, input = {} }) {
      assertAuthorityEnabled();
      const memberKey = trim(firebaseUid);
      const email = lower(input.email);
      const name = normalizeName(input.name);
      const team = normalizeTeam(input.team);
      const phone = normalizePhone(input.phone);
      const requestedDirectoryOverrideByAdmin = input.directoryOverrideByAdmin === true;
      if (!memberKey) throw serviceError('admin_member_key_missing', 'Administrator-provisioned member key is required.', 400);
      if (!validEmail(email)) throw serviceError('admin_member_email_invalid', 'Administrator-provisioned member email is invalid.', 400);
      if (!validName(name) || !team || !validPhone(phone)) throw serviceError('admin_member_profile_invalid', 'Administrator-provisioned member profile is invalid.', 400);

      const { settings } = await loadPolicyContext();
      const nextIdentityKey = identityKey({ team, name });
      const nextRecoveryKey = recoveryKey({ team, name, phone });
      const directoryRequiredByPolicy = Boolean(settings.requireRegisteredMemberForSignup);
      const directoryOverrideByAdmin = directoryRequiredByPolicy && requestedDirectoryOverrideByAdmin;
      const directoryVersion = Math.max(0, Number(settings.memberDirectoryVersion || 0));
      const directory = directoryRequiredByPolicy && !directoryOverrideByAdmin
        ? await repository.getDirectoryEntry(nextIdentityKey)
        : null;
      const directoryMatches = Boolean(
        directory &&
        directory.enabled !== false &&
        normalizeName(directory.name) === name &&
        normalizeTeam(directory.team) === team
      );
      if (directoryRequiredByPolicy && !directoryOverrideByAdmin && !directoryMatches) {
        throw serviceError('member_directory_mismatch', 'Administrator-managed member must use a registered department/name while the member directory policy is enabled unless the explicit manual override is enabled.', 409);
      }
      const identityAccounts = await repository.findIdentityAccounts(nextIdentityKey);
      const active = identityAccounts.find((account) => trim(account.status) !== 'retired' && trim(account.firebase_uid) !== memberKey);
      if (active) throw serviceError('member_identity_already_claimed', 'Another active member already owns the requested member identity.', 409);
      const retiredEmailAccounts = await repository.findRetiredAccountsByEmail(email);
      const retiredUids = retiredEmailAccounts
        .map((account) => trim(account.firebase_uid))
        .filter((uid) => uid && uid !== memberKey);
      const rejoinedAccount = retiredUids.length > 0;
      const status = rejoinedAccount ? 'pending' : 'active';
      const row = await repository.createSignupAccount({
        firebaseUid: memberKey,
        email,
        maskedEmail: maskEmail(email),
        name,
        team,
        phone,
        status,
        identityKey: nextIdentityKey,
        recoveryKey: nextRecoveryKey,
        directoryMemberId: directoryRequiredByPolicy && !directoryOverrideByAdmin && directoryMatches ? trim(directory.directory_member_id) : '',
        directoryVerifiedVersion: directoryRequiredByPolicy && !directoryOverrideByAdmin && directoryMatches ? directoryVersion : 0,
        directoryOverrideByAdmin,
        previousAccountUids: retiredUids,
        rejoinedAccount,
        termsConsentRevision: 0,
        // -1 marks an administrator-created account that has never personally accepted
        // the current signup terms. The frontend treats this as a forced first-login
        // consent marker and saveConsents() replaces it with the real policy revision.
        termsConsentPolicyVersion: ADMIN_PROVISIONED_TERMS_POLICY_VERSION,
        decisions: [],
      });
      return Object.freeze({
        source: 'postgresql',
        authority: 'postgresql',
        provisionedBy: 'admin',
        emailVerification: 'clerk-backend-auto-verified',
        termsConsent: 'required-on-first-login',
        status,
        account: row,
      });
    },

    async rollbackUnlinkedSignup({ firebaseUid }) {
      assertAuthorityEnabled();
      if (typeof repository.rollbackUnlinkedSignup !== 'function') return false;
      return repository.rollbackUnlinkedSignup({ firebaseUid: trim(firebaseUid) });
    },

    async getPolicy() {
      assertAuthorityEnabled();
      return Object.freeze({ source: 'postgresql', payload: await loadTermsPolicyCached() });
    },

    async getTerms({ clerkUserId, includeLogs = true }) {
      assertAuthorityEnabled();
      const firebaseUid = await resolveFirebaseUid(clerkUserId);
      const [policy, snapshot] = await Promise.all([
        loadTermsPolicy(),
        repository.getConsentSnapshot(firebaseUid, { includeLogs }),
      ]);
      return Object.freeze({ source: 'postgresql', policy, ...snapshot, bootstrapRequired: !snapshot.bootstrapCompleted });
    },

    async getTermsByMemberKey({ memberKey, includeLogs = true }) {
      assertAuthorityEnabled();
      const key = trim(memberKey);
      if (!key) throw serviceError('terms_member_key_missing', 'Member key is required.', 400);
      const [policy, snapshot] = await Promise.all([
        loadTermsPolicy(),
        repository.getConsentSnapshot(key, { includeLogs }),
      ]);
      return Object.freeze({ source: 'postgresql', policy, ...snapshot, bootstrapRequired: !snapshot.bootstrapCompleted });
    },

    async bootstrapTerms({ clerkUserId }) {
      assertAuthorityEnabled();
      const firebaseUid = await resolveFirebaseUid(clerkUserId);
      const current = await repository.getConsentSnapshot(firebaseUid);
      const { policy } = await loadPolicyContext();
      if (!current.bootstrapCompleted) {
        throw serviceError(
          'terms_consent_postgresql_bootstrap_required',
          'Terms consent data has not been migrated to PostgreSQL.',
          409,
        );
      }
      return Object.freeze({
        source: 'postgresql',
        policy,
        ...current,
        bootstrapRequired: false,
        legacyBootstrap: 'retired',
      });
    },

    async saveTerms({ clerkUserId, input = {} }) {
      assertAuthorityEnabled();
      const firebaseUid = await resolveFirebaseUid(clerkUserId);
      const { policy } = await loadPolicyContext();
      const decisions = validateTerms({ policy, submission: input, source: trim(input.source) || 'myPage' });
      const snapshot = await repository.saveConsents({ firebaseUid, policyRevision: policy.enabled ? policy.revision : 0, decisions });
      return Object.freeze({ source: 'postgresql', authority: 'postgresql', policy, firestoreMirror: 'retired', ...snapshot, bootstrapRequired: false });
    },
  });
};
