import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { normalizeSecureAttachmentInputs } from '../attachments/attachment-service.mjs';

const scrypt = promisify(scryptCallback);
const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();
const GUEST_SESSION_TTL_MS = 30 * 60 * 1000;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const PASSWORD_HASH_PREFIX = 'scrypt-v1';

const serviceError = (code, message, status = 400, details = {}) => {
  const error = new Error(message);
  error.name = 'InquiryServiceError';
  error.code = code;
  error.status = status;
  Object.assign(error, details);
  return error;
};

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
};
const sha256 = (value) => createHash('sha256').update(String(value ?? '')).digest('hex');
const hashStructured = (value) => sha256(JSON.stringify(stableValue(value)));

const normalizePhone = (value) => {
  const digits = trim(value).replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith('02')) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return trim(value);
};

const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower(value));
const validatePhone = (value) => /^(02|0\d{2})-\d{3,4}-\d{4}$/.test(normalizePhone(value));
const normalizeBody = (input = {}) => ({
  bodyHtml: String(input.bodyHtml || ''),
  bodyText: trim(input.bodyText || input.body || ''),
});

const validateInquiryContent = (input = {}) => {
  const categoryId = trim(input.categoryId);
  const title = trim(input.title);
  const { bodyHtml, bodyText } = normalizeBody(input);
  if (!categoryId) throw serviceError('inquiry_category_required', 'Inquiry category is required.', 400);
  if (!title) throw serviceError('inquiry_title_required', 'Inquiry title is required.', 400);
  if (title.length > 200) throw serviceError('inquiry_title_too_long', 'Inquiry title is too long.', 400);
  if (!bodyText) throw serviceError('inquiry_body_required', 'Inquiry body is required.', 400);
  if (bodyText.length > 20000 || bodyHtml.length > 100000) throw serviceError('inquiry_body_too_long', 'Inquiry body is too long.', 413);
  return Object.freeze({
    categoryId, title, bodyHtml, bodyText,
    attachments: Object.prototype.hasOwnProperty.call(input || {}, 'attachments')
      ? normalizeSecureAttachmentInputs(input?.attachments)
      : null,
  });
};

const validateGuestIdentity = (input = {}) => {
  const name = trim(input.name).replace(/\s+/g, ' ');
  const email = lower(input.email);
  const phone = normalizePhone(input.phone);
  if (name.length < 2 || name.length > 50) throw serviceError('guest_inquiry_name_invalid', 'Guest inquiry name is invalid.', 400);
  if (!validateEmail(email)) throw serviceError('guest_inquiry_email_invalid', 'Guest inquiry email is invalid.', 400);
  if (!validatePhone(phone)) throw serviceError('guest_inquiry_phone_invalid', 'Guest inquiry phone is invalid.', 400);
  return Object.freeze({ name, email, phone });
};

const validateGuestAuthor = (input = {}) => {
  const identity = validateGuestIdentity(input);
  const team = trim(input.team).replace(/\s+/g, ' ');
  if (!team || team.length > 100) throw serviceError('guest_inquiry_team_invalid', 'Guest inquiry team is required.', 400);
  return Object.freeze({ ...identity, team });
};

const validateGuestPasswordInput = (password) => {
  const value = String(password || '');
  if (value.length < 8 || value.length > 128) {
    throw serviceError('guest_inquiry_password_invalid', 'Guest inquiry password must be between 8 and 128 characters.', 400);
  }
  return value;
};

export const hashGuestInquiryPassword = async (password) => {
  const normalized = validateGuestPasswordInput(password);
  const salt = randomBytes(16);
  const derived = await scrypt(normalized, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 });
  return [
    PASSWORD_HASH_PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    Buffer.from(derived).toString('base64url'),
  ].join('$');
};

export const verifyGuestInquiryPassword = async (password, encoded) => {
  try {
    const [prefix, nValue, rValue, pValue, saltValue, hashValue] = String(encoded || '').split('$');
    if (prefix !== PASSWORD_HASH_PREFIX || !saltValue || !hashValue) return false;
    const n = Number(nValue);
    const r = Number(rValue);
    const p = Number(pValue);
    if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;
    const salt = Buffer.from(saltValue, 'base64url');
    const expected = Buffer.from(hashValue, 'base64url');
    if (expected.length !== SCRYPT_KEYLEN) return false;
    const actual = Buffer.from(await scrypt(String(password || ''), salt, expected.length, { N: n, r, p, maxmem: 64 * 1024 * 1024 }));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

const normalizeSignupTerms = (context = {}) => {
  const activeTerms = Array.isArray(context?.policy?.activeTerms) ? context.policy.activeTerms : [];
  const documentsById = new Map(
    (Array.isArray(context?.terms) ? context.terms : []).map((document) => {
      const payload = document?.payload || {};
      const id = trim(payload.id || String(document?.key || '').replace(/^signupTerms\//, ''));
      return [id, payload];
    }),
  );
  return activeTerms.map((snapshot) => {
    const id = trim(snapshot?.id);
    const payload = documentsById.get(id) || {};
    return Object.freeze({
      source: 'signup',
      id,
      title: trim(payload.title || snapshot?.title),
      contentHtml: String(payload.contentHtml || ''),
      contentText: trim(payload.contentText || ''),
      required: Boolean(snapshot?.required ?? payload.required),
      revision: Math.max(1, Number(snapshot?.version || payload.currentVersion || 1)),
      versionId: trim(snapshot?.versionId || payload.currentVersionId),
      contentHash: trim(snapshot?.contentHash || payload.contentHash) || hashStructured({ id, title: payload.title || snapshot?.title, content: payload.contentText || payload.contentHtml || '' }),
      enabled: payload.enabled !== false && !payload.archived,
    });
  }).filter((term) => term.id && term.title && term.enabled);
};

const normalizeInquiryTerms = (terms = []) => terms.map((term) => Object.freeze({
  source: 'inquiry',
  id: trim(term.id),
  title: trim(term.title),
  contentHtml: String(term.contentHtml || ''),
  contentText: trim(term.contentText),
  required: Boolean(term.required),
  revision: Math.max(1, Number(term.revision || 1)),
  versionId: `inquiry:${trim(term.id)}:r${Math.max(1, Number(term.revision || 1))}`,
  contentHash: trim(term.contentHash),
  enabled: term.enabled !== false,
})).filter((term) => term.id && term.title && term.enabled);

const mapRepositoryError = (error) => {
  if (error?.name !== 'InquiryRepositoryError') throw error;
  throw serviceError(error.code || 'inquiry_repository_error', error.message || 'Inquiry repository operation failed.', error.status || 409, {
    inquiryCount: Number(error?.inquiryCount || 0),
  });
};

const requireAdmin = (admin) => {
  if (!admin || trim(admin.status) !== 'active') {
    throw serviceError('admin_authority_required', 'Active administrator authority is required.', 403);
  }
  return Object.freeze({
    id: trim(admin.firebaseUid || admin.id || admin.legacyAdminKey || admin.clerkUserId),
    displayName: trim(admin.userName || admin.name || admin.adminLoginId || admin.authEmail) || '관리자',
  });
};

export const createInquiryService = ({ repository }) => {
  if (!repository) throw new TypeError('Inquiry repository is required.');

  const getTermCatalog = async ({ includeDisabledInquiryTerms = false } = {}) => {
    const [signupContext, inquiryTerms] = await Promise.all([
      repository.getSignupTermsContext(),
      repository.listInquiryTerms({ includeDisabled: includeDisabledInquiryTerms }),
    ]);
    return Object.freeze({
      signupTerms: Object.freeze(normalizeSignupTerms(signupContext)),
      inquiryTerms: Object.freeze(normalizeInquiryTerms(inquiryTerms)),
    });
  };

  const getSelectedGuestTerms = async (knownSettings = null) => {
    const [settings, catalog] = knownSettings
      ? [knownSettings, await getTermCatalog()]
      : await Promise.all([repository.getSettings(), getTermCatalog()]);
    const byKey = new Map([
      ...catalog.signupTerms.map((term) => [`signup:${term.id}`, term]),
      ...catalog.inquiryTerms.map((term) => [`inquiry:${term.id}`, term]),
    ]);
    const selected = settings.guestTermBindings
      .map((binding) => byKey.get(`${trim(binding?.source)}:${trim(binding?.id)}`))
      .filter(Boolean);
    return Object.freeze({ settings, terms: Object.freeze(selected) });
  };

  const resolveMember = async (clerkUserId) => {
    const member = await repository.resolveMemberByClerkUserId(trim(clerkUserId));
    if (!member?.memberUid) throw serviceError('inquiry_member_not_found', 'Member account is not linked to the current Clerk session.', 403);
    if (!['active', 'profileRequired'].includes(trim(member.status))) {
      throw serviceError('inquiry_member_not_eligible', 'Current member account cannot use inquiry service.', 403);
    }
    return member;
  };

  const requireGuestSession = async (token) => {
    const normalized = trim(token);
    if (!normalized) throw serviceError('guest_inquiry_session_required', 'Guest inquiry access session is required.', 401);
    const session = await repository.getGuestSession(sha256(normalized));
    if (!session || session.publicIds.length === 0) {
      throw serviceError('guest_inquiry_session_invalid', 'Guest inquiry access session is invalid or expired.', 401);
    }
    return session;
  };

  const checkGuestIdentityPassword = async ({ identity, password }) => {
    const identityRecord = await repository.findGuestIdentity(identity);
    if (!identityRecord?.exists) {
      return Object.freeze({ exists: false, publicIds: Object.freeze([]), matched: false });
    }
    const matched = await verifyGuestInquiryPassword(password, identityRecord.passwordHash);
    return Object.freeze({
      exists: true,
      publicIds: identityRecord.publicIds,
      matched,
    });
  };

  return Object.freeze({
    async getPublicConfig({ includeGuestTerms = false, includeCategories = true } = {}) {
      const [settings, categories, catalog] = await Promise.all([
        repository.getSettings(),
        includeCategories ? repository.listCategories() : Promise.resolve([]),
        includeGuestTerms ? getTermCatalog() : Promise.resolve(null),
      ]);
      let terms = [];
      if (includeGuestTerms && settings.allowGuest && catalog) {
        const byKey = new Map([
          ...catalog.signupTerms.map((term) => [`signup:${term.id}`, term]),
          ...catalog.inquiryTerms.map((term) => [`inquiry:${term.id}`, term]),
        ]);
        terms = settings.guestTermBindings
          .map((binding) => byKey.get(`${trim(binding?.source)}:${trim(binding?.id)}`))
          .filter(Boolean);
      }
      return Object.freeze({
        source: 'postgresql',
        authoritative: true,
        allowGuest: settings.allowGuest,
        postsPerPage: settings.postsPerPage,
        categories,
        guestTerms: Object.freeze(terms),
        guestTermsLoaded: Boolean(includeGuestTerms),
        guestPasswordResetSupported: false,
      });
    },

    async createMember({ clerkUserId, input }) {
      const member = await resolveMember(clerkUserId);
      const content = validateInquiryContent(input);
      try {
        return await repository.createMemberInquiry({
          inquiryId: `inq-${randomUUID().replaceAll('-', '')}`,
          publicId: randomUUID(),
          member,
          ...content,
        });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async listMember({ clerkUserId, search = '', page, pageSize }) {
      const member = await resolveMember(clerkUserId);
      return repository.listMemberInquiries({ memberUid: member.memberUid, search, page, pageSize });
    },

    async getMember({ clerkUserId, publicId }) {
      const member = await resolveMember(clerkUserId);
      const inquiry = await repository.getMemberInquiry({ memberUid: member.memberUid, publicId: trim(publicId) });
      if (!inquiry) throw serviceError('inquiry_not_found', 'Inquiry was not found.', 404);
      return inquiry;
    },

    async updateMember({ clerkUserId, publicId, input }) {
      const member = await resolveMember(clerkUserId);
      const content = validateInquiryContent(input);
      try {
        return await repository.updateOwnedInquiry({ ownerType: 'member', memberUid: member.memberUid, publicId: trim(publicId), ...content });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async deleteMember({ clerkUserId, publicId }) {
      const member = await resolveMember(clerkUserId);
      try {
        return await repository.deleteOwnedInquiry({ ownerType: 'member', memberUid: member.memberUid, publicId: trim(publicId), deletedBy: member.memberUid });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async prepareGuestCreate({ input }) {
      const settings = await repository.getSettings();
      if (!settings.allowGuest) throw serviceError('guest_inquiry_disabled', 'Guest inquiries are disabled.', 403);
      const identity = validateGuestIdentity(input);
      const password = validateGuestPasswordInput(input?.password);
      const identityCheck = await checkGuestIdentityPassword({ identity, password });
      if (identityCheck.exists && !identityCheck.matched) {
        throw serviceError('guest_inquiry_identity_password_mismatch', 'Guest inquiry identity password does not match.', 409);
      }
      return Object.freeze({ allowed: true, identityExists: identityCheck.exists });
    },

    async createGuest({ input }) {
      const settings = await repository.getSettings();
      if (!settings.allowGuest) throw serviceError('guest_inquiry_disabled', 'Guest inquiries are disabled.', 403);
      const author = validateGuestAuthor(input?.author || input);
      const content = validateInquiryContent(input);
      const password = validateGuestPasswordInput(input?.password);
      if (password !== String(input?.passwordConfirm || '')) {
        throw serviceError('guest_inquiry_password_confirmation_mismatch', 'Guest inquiry password confirmation does not match.', 400);
      }
      const currentPassword = validateGuestPasswordInput(input?.currentPassword || password);
      const identityCheck = await checkGuestIdentityPassword({ identity: author, password: currentPassword });
      if (identityCheck.exists && !identityCheck.matched) {
        throw serviceError('guest_inquiry_identity_password_mismatch', 'Guest inquiry identity password does not match.', 409);
      }
      const rotateIdentityPassword = identityCheck.exists && password !== currentPassword;
      const { terms } = await getSelectedGuestTerms(settings);
      const decisions = new Map((Array.isArray(input?.termDecisions) ? input.termDecisions : []).map((decision) => [
        `${trim(decision?.source)}:${trim(decision?.id)}`,
        Boolean(decision?.accepted),
      ]));
      for (const term of terms) {
        if (term.required && decisions.get(`${term.source}:${term.id}`) !== true) {
          throw serviceError('guest_inquiry_required_terms_missing', 'All required guest inquiry terms must be accepted.', 400);
        }
      }
      const acceptedTerms = terms.filter((term) => decisions.get(`${term.source}:${term.id}`) === true);
      const passwordHash = await hashGuestInquiryPassword(password);
      const consents = acceptedTerms.map((term) => Object.freeze({
        id: `inqconsent-${randomUUID().replaceAll('-', '')}`,
        source: term.source,
        termId: term.id,
        revision: term.revision,
        versionId: term.versionId,
        required: term.required,
        title: term.title,
        contentHash: term.contentHash,
      }));
      try {
        const created = await repository.createGuestInquiry({
          inquiryId: `inq-${randomUUID().replaceAll('-', '')}`,
          publicId: randomUUID(),
          ...content,
          author,
          passwordHash,
          rotateIdentityPassword,
          consents,
        });
        return Object.freeze({ ...created, passwordResetSupported: false });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async verifyGuestAccess({ input }) {
      const password = String(input?.password || '');
      let identity;
      try {
        identity = validateGuestIdentity(input);
      } catch {
        throw serviceError('guest_inquiry_verification_failed', 'Guest inquiry verification failed.', 404);
      }
      if (!password) {
        throw serviceError('guest_inquiry_verification_failed', 'Guest inquiry verification failed.', 404);
      }
      const identityCheck = await checkGuestIdentityPassword({ identity, password });
      if (!identityCheck.exists) {
        const dummy = await hashGuestInquiryPassword('guest-inquiry-dummy-password');
        await verifyGuestInquiryPassword(password, dummy);
      }
      if (!identityCheck.matched) {
        throw serviceError('guest_inquiry_verification_failed', 'Guest inquiry verification failed.', 404);
      }
      const publicIds = identityCheck.publicIds;
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + GUEST_SESSION_TTL_MS);
      await repository.createGuestSession({ tokenHash: sha256(token), publicIds, expiresAt });
      return Object.freeze({ token, expiresAt: expiresAt.toISOString(), count: publicIds.length });
    },

    async listGuest({ token, page, pageSize }) {
      const session = await requireGuestSession(token);
      return repository.listGuestInquiries({ publicIds: session.publicIds, page, pageSize });
    },

    async getGuest({ token, publicId }) {
      const session = await requireGuestSession(token);
      const inquiry = await repository.getGuestInquiry({ publicIds: session.publicIds, publicId: trim(publicId) });
      if (!inquiry) throw serviceError('inquiry_not_found', 'Inquiry was not found.', 404);
      return inquiry;
    },

    async updateGuest({ token, publicId, input }) {
      const session = await requireGuestSession(token);
      if (!session.publicIds.includes(trim(publicId))) throw serviceError('inquiry_not_found', 'Inquiry was not found.', 404);
      const content = validateInquiryContent(input);
      try {
        return await repository.updateOwnedInquiry({ ownerType: 'guest', publicId: trim(publicId), ...content });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async deleteGuest({ token, publicId }) {
      const normalizedPublicId = trim(publicId);
      const session = await requireGuestSession(token);
      if (!session.publicIds.includes(normalizedPublicId)) throw serviceError('inquiry_not_found', 'Inquiry was not found.', 404);
      try {
        const result = await repository.deleteOwnedInquiry({ ownerType: 'guest', publicId: normalizedPublicId, deletedBy: 'guest-session' });
        const remaining = session.publicIds.filter((id) => id !== normalizedPublicId);
        await repository.revokeGuestSession(sha256(trim(token)));
        if (remaining.length > 0) {
          await repository.createGuestSession({
            tokenHash: sha256(trim(token)),
            publicIds: remaining,
            expiresAt: session.expiresAt,
          });
        }
        return result;
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async listAdmin({ admin, query }) {
      requireAdmin(admin);
      return repository.listAdminInquiries(query || {});
    },

    async getAdmin({ admin, publicId }) {
      requireAdmin(admin);
      const inquiry = await repository.getAdminInquiry(trim(publicId));
      if (!inquiry) throw serviceError('inquiry_not_found', 'Inquiry was not found.', 404);
      return inquiry;
    },

    async addAnswer({ admin, publicId, input }) {
      const actor = requireAdmin(admin);
      const { bodyHtml, bodyText } = normalizeBody(input);
      if (!bodyText) throw serviceError('inquiry_answer_body_required', 'Inquiry answer body is required.', 400);
      if (bodyText.length > 20000 || bodyHtml.length > 100000) throw serviceError('inquiry_answer_body_too_long', 'Inquiry answer body is too long.', 413);
      try {
        return await repository.addAnswer({
          answerId: `inqans-${randomUUID().replaceAll('-', '')}`,
          publicId: trim(publicId),
          bodyHtml,
          bodyText,
          adminIdentityId: actor.id,
          adminDisplayName: actor.displayName,
          attachments: normalizeSecureAttachmentInputs(input?.attachments),
        });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async updateAnswer({ admin, publicId, answerId, input }) {
      const actor = requireAdmin(admin);
      const { bodyHtml, bodyText } = normalizeBody(input);
      if (!bodyText) throw serviceError('inquiry_answer_body_required', 'Inquiry answer body is required.', 400);
      try {
        return await repository.updateAnswer({
          publicId: trim(publicId),
          answerId: trim(answerId),
          bodyHtml,
          bodyText,
          actorId: actor.id,
          attachments: Object.prototype.hasOwnProperty.call(input || {}, 'attachments')
            ? normalizeSecureAttachmentInputs(input?.attachments)
            : null,
        });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async deleteAnswer({ admin, publicId, answerId }) {
      const actor = requireAdmin(admin);
      try {
        return await repository.deleteAnswer({ publicId: trim(publicId), answerId: trim(answerId), actorId: actor.id });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async deleteAdmin({ admin, publicId }) {
      const actor = requireAdmin(admin);
      try {
        return await repository.deleteAdminInquiry({ publicId: trim(publicId), actorId: actor.id });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async getAdminSettings({ admin }) {
      requireAdmin(admin);
      const [settings, categories, catalog] = await Promise.all([
        repository.getSettings(),
        repository.listCategories({ includeCounts: true }),
        getTermCatalog({ includeDisabledInquiryTerms: true }),
      ]);
      return Object.freeze({ settings, categories, ...catalog });
    },

    async saveAdminSettings({ admin, input }) {
      const actor = requireAdmin(admin);
      const postsPerPage = Math.trunc(Number(input?.postsPerPage));
      if (!Number.isFinite(postsPerPage) || postsPerPage < 5 || postsPerPage > 50) {
        throw serviceError('inquiry_page_size_invalid', 'Inquiry page size must be between 5 and 50.', 400);
      }
      const catalog = await getTermCatalog();
      const validKeys = new Set([
        ...catalog.signupTerms.map((term) => `signup:${term.id}`),
        ...catalog.inquiryTerms.map((term) => `inquiry:${term.id}`),
      ]);
      const bindings = [...new Map((Array.isArray(input?.guestTermBindings) ? input.guestTermBindings : [])
        .map((binding) => ({ source: trim(binding?.source), id: trim(binding?.id) }))
        .filter((binding) => validKeys.has(`${binding.source}:${binding.id}`))
        .map((binding) => [`${binding.source}:${binding.id}`, binding])).values()];
      return repository.saveSettings({
        allowGuest: Boolean(input?.allowGuest),
        postsPerPage,
        guestTermBindings: bindings,
        actorId: actor.id,
      });
    },

    async saveCategory({ admin, input }) {
      const actor = requireAdmin(admin);
      const name = trim(input?.name);
      if (!name || name.length > 50) throw serviceError('inquiry_category_name_invalid', 'Inquiry category name is required.', 400);
      try {
        return await repository.saveCategory({
          id: trim(input?.id) || `inqcat-${randomUUID().replaceAll('-', '')}`,
          name,
          actorId: actor.id,
        });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async deleteCategory({ admin, categoryId }) {
      const actor = requireAdmin(admin);
      try {
        return await repository.deleteCategory({ categoryId: trim(categoryId), actorId: actor.id });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async saveInquiryTerm({ admin, input }) {
      const actor = requireAdmin(admin);
      const id = trim(input?.id) || `inqterm-${randomUUID().replaceAll('-', '')}`;
      const title = trim(input?.title);
      const bodyHtml = String(input?.bodyHtml || '');
      const bodyText = trim(input?.bodyText || input?.body || '');
      if (!title || title.length > 100) throw serviceError('inquiry_term_title_invalid', 'Inquiry term title is required.', 400);
      if (!bodyText) throw serviceError('inquiry_term_body_required', 'Inquiry term body is required.', 400);
      const previous = trim(input?.id) ? await repository.getInquiryTerm(id) : null;
      const contentHash = hashStructured({ title, bodyText, required: Boolean(input?.required) });
      const semanticChanged = !previous || previous.contentHash !== contentHash;
      const revision = previous ? previous.revision + (semanticChanged ? 1 : 0) : 1;
      return repository.saveInquiryTerm({
        id,
        title,
        bodyHtml,
        bodyText,
        required: Boolean(input?.required),
        revision,
        contentHash,
        enabled: input?.enabled !== false,
        actorId: actor.id,
      });
    },

    async deleteInquiryTerm({ admin, termId }) {
      const actor = requireAdmin(admin);
      try {
        return await repository.deleteInquiryTerm({ termId: trim(termId), actorId: actor.id });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },
  });
};
