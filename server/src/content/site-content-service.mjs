import { createRentalConfigBootstrapDocument } from './rental-config-bootstrap.mjs';
const ALLOWED_DOMAINS = new Set(['site-settings', 'home', 'popup', 'footer', 'rental-config', 'terms']);
const errorWith = (code, message, status) => Object.assign(new Error(message), { code, status });
const normalizeDomain = (value) => String(value || '').trim().toLowerCase();
const normalizeTermId = (value) => String(value || '').trim();

const projectSignupTermsPolicyPayload = (payloadValue = {}) => {
  const payload = payloadValue && typeof payloadValue === 'object' ? payloadValue : {};
  return Object.freeze({
    ...payload,
    activeTerms: (Array.isArray(payload.activeTerms) ? payload.activeTerms : []).map((termValue) => {
      const term = termValue && typeof termValue === 'object' ? termValue : {};
      const { contentHtml: _contentHtml, contentText: _contentText, ...metadata } = term;
      return Object.freeze(metadata);
    }),
  });
};

const timestampMillis = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (Number.isFinite(Number(value)) && typeof value !== 'object') {
    const numeric = Number(value);
    return numeric > 0 && numeric < 100000000000 ? numeric * 1000 : numeric;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object') {
    if (value.__mkType === 'timestamp' && Number.isFinite(Number(value.millis))) return Number(value.millis);
    if (Number.isFinite(Number(value.millis))) return Number(value.millis);
    const seconds = Number(value.seconds ?? value._seconds);
    const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
    if (Number.isFinite(seconds)) return Math.trunc(seconds * 1000 + (Number.isFinite(nanoseconds) ? nanoseconds / 1_000_000 : 0));
  }
  return 0;
};

const projectTimedVisibility = (document = {}, nowMillis = Date.now()) => {
  const payload = document?.payload && typeof document.payload === 'object' ? document.payload : {};
  const enabled = typeof document?.enabled === 'boolean'
    ? document.enabled
    : payload.enabled !== false;
  const startMillis = timestampMillis(payload.startAt);
  const isIndefinite = payload.isIndefinite === true;
  const endMillis = isIndefinite ? 0 : timestampMillis(payload.endAt);
  let reason = 'active';
  let active = true;
  if (!enabled) {
    active = false;
    reason = 'disabled';
  } else if (!startMillis) {
    active = false;
    reason = 'start-missing';
  } else if (nowMillis < startMillis) {
    active = false;
    reason = 'scheduled';
  } else if (!isIndefinite && !endMillis) {
    active = false;
    reason = 'end-missing';
  } else if (!isIndefinite && nowMillis > endMillis) {
    active = false;
    reason = 'ended';
  }
  return Object.freeze({ active, reason, enabled, startMillis, endMillis, isIndefinite, evaluatedAt: nowMillis });
};

const projectPublicDocument = (domain, document, nowMillis) => {
  const payload = document?.payload && typeof document.payload === 'object' ? document.payload : {};
  const enabled = typeof document?.enabled === 'boolean' ? document.enabled : payload.enabled;
  const sortOrder = Number.isFinite(Number(document?.sortOrder))
    ? Math.trunc(Number(document.sortOrder))
    : Number.isFinite(Number(payload.sortOrder))
      ? Math.trunc(Number(payload.sortOrder))
      : null;
  const normalizedPayload = Object.freeze({
    ...payload,
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
    ...(sortOrder !== null ? { sortOrder } : {}),
  });
  const timed = (domain === 'home' && String(document?.key || '').startsWith('homeBanners/'))
    || (domain === 'popup' && String(document?.key || '').startsWith('popupPosts/'));
  return Object.freeze({
    ...document,
    payload: normalizedPayload,
    enabled: typeof enabled === 'boolean' ? enabled : null,
    sortOrder,
    publicVisibility: timed ? projectTimedVisibility({ ...document, payload: normalizedPayload }, nowMillis) : null,
  });
};

const projectPublicDomain = (result, nowMillis = Date.now()) => {
  const documents = Array.isArray(result?.documents)
    ? result.documents.map((document) => projectPublicDocument(result.domain, document, nowMillis))
    : [];
  const timed = documents.filter((document) => document.publicVisibility);
  return Object.freeze({
    ...result,
    documents,
    publicProjection: Object.freeze({
      evaluatedAt: nowMillis,
      timedDocumentCount: timed.length,
      activeTimedDocumentCount: timed.filter((document) => document.publicVisibility.active).length,
      visibilityReasons: timed.reduce((accumulator, document) => {
        const reason = document.publicVisibility.reason || 'unknown';
        accumulator[reason] = (accumulator[reason] || 0) + 1;
        return accumulator;
      }, {}),
    }),
  });
};

const projectActiveSignupTermContent = ({ activeTerm, termDocument }) => {
  const termId = normalizeTermId(activeTerm?.id);
  const termPayload = termDocument?.payload && typeof termDocument.payload === 'object'
    ? termDocument.payload
    : {};
  if (!termId || !termDocument || termDocument.enabled === false || termPayload.enabled === false || termPayload.archived === true) {
    return null;
  }
  const version = Math.max(1, Number(activeTerm.version || activeTerm.currentVersion || 1));
  const versionId = String(activeTerm.versionId || activeTerm.currentVersionId || '').trim();
  const contentHash = String(activeTerm.contentHash || '').trim();
  if (
    Number(termPayload.currentVersion || termPayload.version || version) !== version ||
    (versionId && String(termPayload.currentVersionId || termPayload.versionId || '').trim() !== versionId) ||
    (contentHash && String(termPayload.contentHash || '').trim() !== contentHash)
  ) {
    throw errorWith('signup_term_content_changed', 'Signup term content changed while it was being read.', 409);
  }
  return Object.freeze({
    id: termId,
    title: String(activeTerm.title || termPayload.title || '').trim(),
    required: Boolean(activeTerm.required),
    version,
    versionId,
    contentHash,
    contentHtml: String(termPayload.contentHtml || ''),
    contentText: String(termPayload.contentText || ''),
    displayOrder: Number.isFinite(Number(activeTerm.displayOrder)) ? Number(activeTerm.displayOrder) : 0,
  });
};

export const createSiteContentService = ({ repository }) => Object.freeze({
  async getSignupTermsPolicy() {
    if (typeof repository.getDocument !== 'function') {
      throw errorWith('signup_terms_policy_read_unavailable', 'Signup terms policy reader is unavailable.', 503);
    }
    const document = await repository.getDocument('terms', 'signupTermsPolicy/current');
    if (!document) {
      throw errorWith('signup_terms_policy_not_found', 'Signup terms policy is not available.', 404);
    }
    return Object.freeze({
      source: 'postgresql',
      authoritative: true,
      key: document.key,
      payload: projectSignupTermsPolicyPayload(document.payload || {}),
      enabled: document.enabled,
      syncedAt: document.syncedAt || null,
    });
  },
  async getAdminSignupTermsCatalog() {
    if (typeof repository.getSignupTermsAdminCatalog !== 'function') {
      throw errorWith('signup_terms_admin_catalog_unavailable', 'Signup terms administrator catalog reader is unavailable.', 503);
    }
    const catalog = await repository.getSignupTermsAdminCatalog();
    const policyPayload = catalog?.policy?.payload && typeof catalog.policy.payload === 'object'
      ? catalog.policy.payload
      : {};
    return Object.freeze({
      source: 'postgresql',
      authoritative: true,
      policy: projectSignupTermsPolicyPayload(policyPayload),
      terms: (Array.isArray(catalog?.terms) ? catalog.terms : []).map((document) => Object.freeze({
        ...document.payload,
        id: String(document.payload?.id || document.key.split('/').pop() || '').trim(),
        enabled: typeof document.enabled === 'boolean' ? document.enabled : document.payload?.enabled !== false,
        displayOrder: Number.isFinite(Number(document.payload?.displayOrder))
          ? Number(document.payload.displayOrder)
          : Number.isFinite(Number(document.sortOrder)) ? Number(document.sortOrder) : 0,
      })),
    });
  },
  async getAdminSignupTermContent(termIdValue) {
    const termId = normalizeTermId(termIdValue);
    if (!termId) throw errorWith('signup_term_id_missing', 'Signup term ID is required.', 400);
    if (typeof repository.getDocument !== 'function') {
      throw errorWith('signup_terms_admin_content_unavailable', 'Signup terms administrator content reader is unavailable.', 503);
    }
    const document = await repository.getDocument('terms', `signupTerms/${termId}`);
    if (!document) throw errorWith('signup_terms_admin_content_not_found', 'Signup term content is not available.', 404);
    const payload = document.payload && typeof document.payload === 'object' ? document.payload : {};
    return Object.freeze({
      source: 'postgresql',
      authoritative: true,
      term: Object.freeze({
        ...payload,
        id: String(payload.id || termId).trim(),
        enabled: typeof document.enabled === 'boolean' ? document.enabled : payload.enabled !== false,
        displayOrder: Number.isFinite(Number(payload.displayOrder))
          ? Number(payload.displayOrder)
          : Number.isFinite(Number(document.sortOrder)) ? Number(document.sortOrder) : 0,
        contentPreview: String(payload.contentText || '').slice(0, 240),
      }),
    });
  },
  async getSignupTermContent(termIdValue) {
    const termId = normalizeTermId(termIdValue);
    if (!termId) {
      throw errorWith('signup_term_id_missing', 'Signup term ID is required.', 400);
    }
    if (typeof repository.getSignupTermContentContext !== 'function') {
      throw errorWith('signup_term_content_read_unavailable', 'Signup term content reader is unavailable.', 503);
    }
    const context = await repository.getSignupTermContentContext(termId);
    const policyPayload = context?.policy?.payload && typeof context.policy.payload === 'object'
      ? context.policy.payload
      : {};
    const activeTerm = (Array.isArray(policyPayload.activeTerms) ? policyPayload.activeTerms : [])
      .find((term) => normalizeTermId(term?.id) === termId);
    if (!policyPayload.enabled || !activeTerm || !context?.term) {
      throw errorWith('signup_term_content_not_found', 'Active signup term content is not available.', 404);
    }
    const projectedTerm = projectActiveSignupTermContent({ activeTerm, termDocument: context.term });
    if (!projectedTerm) {
      throw errorWith('signup_term_content_not_found', 'Active signup term content is not available.', 404);
    }
    return Object.freeze({
      source: 'postgresql',
      authoritative: true,
      term: projectedTerm,
    });
  },
  async getSignupTermContents(termIdValues = []) {
    const termIds = [...new Set((Array.isArray(termIdValues) ? termIdValues : [])
      .map(normalizeTermId)
      .filter(Boolean))];
    if (termIds.length === 0 || termIds.length > 50) {
      throw errorWith('signup_term_ids_invalid', 'Signup term IDs must contain between 1 and 50 items.', 400);
    }
    if (typeof repository.getSignupTermContentsContext !== 'function') {
      throw errorWith('signup_term_contents_read_unavailable', 'Signup term batch content reader is unavailable.', 503);
    }
    const context = await repository.getSignupTermContentsContext(termIds);
    const policyPayload = context?.policy?.payload && typeof context.policy.payload === 'object'
      ? context.policy.payload
      : {};
    if (!policyPayload.enabled) {
      throw errorWith('signup_term_content_not_found', 'Active signup term content is not available.', 404);
    }
    const activeTerms = Array.isArray(policyPayload.activeTerms) ? policyPayload.activeTerms : [];
    const activeById = new Map(activeTerms.map((term) => [normalizeTermId(term?.id), term]));
    const documentById = new Map((Array.isArray(context?.terms) ? context.terms : []).map((document) => [
      normalizeTermId(document?.payload?.id || String(document?.key || '').split('/').pop()),
      document,
    ]));
    const terms = termIds.map((termId) => {
      const activeTerm = activeById.get(termId);
      const termDocument = documentById.get(termId);
      if (!activeTerm || !termDocument) {
        throw errorWith('signup_term_content_not_found', 'Active signup term content is not available.', 404);
      }
      const projected = projectActiveSignupTermContent({ activeTerm, termDocument });
      if (!projected) {
        throw errorWith('signup_term_content_not_found', 'Active signup term content is not available.', 404);
      }
      return projected;
    }).sort((left, right) => left.displayOrder - right.displayOrder || left.title.localeCompare(right.title, 'ko'));
    return Object.freeze({ source: 'postgresql', authoritative: true, terms: Object.freeze(terms) });
  },
  async getAdminSiteContentCatalog(domainValue) {
    const domain = normalizeDomain(domainValue);
    if (!['popup', 'footer'].includes(domain)) {
      throw errorWith('admin_site_content_catalog_domain_invalid', 'Unsupported administrator site-content catalog domain.', 400);
    }
    if (typeof repository.getAdminSiteContentCatalog !== 'function') {
      throw errorWith('admin_site_content_catalog_unavailable', 'Administrator site-content catalog reader is unavailable.', 503);
    }
    const result = await repository.getAdminSiteContentCatalog(domain);
    if (!result) {
      throw errorWith('admin_site_content_catalog_not_synchronized', 'Administrator site-content catalog is not synchronized.', 404);
    }
    const projected = projectPublicDomain(result);
    return Object.freeze({
      source: 'postgresql',
      authoritative: true,
      domain,
      syncedAt: projected.syncedAt || null,
      documentCount: projected.documents.length,
      documents: projected.documents,
    });
  },

  async getAdminSiteContentDocument(domainValue, documentIdValue) {
    const domain = normalizeDomain(domainValue);
    const documentId = String(documentIdValue || '').trim();
    if (!['popup', 'footer'].includes(domain) || !documentId) {
      throw errorWith('admin_site_content_document_invalid', 'Administrator site-content document target is invalid.', 400);
    }
    if (typeof repository.getDocument !== 'function') {
      throw errorWith('admin_site_content_document_unavailable', 'Administrator site-content document reader is unavailable.', 503);
    }
    const documentKey = domain === 'popup'
      ? `popupPosts/${documentId}`
      : `footerPages/${documentId}`;
    const document = await repository.getDocument(domain, documentKey);
    if (!document) {
      throw errorWith('admin_site_content_document_not_found', 'Administrator site-content document was not found.', 404);
    }
    const payload = document.payload && typeof document.payload === 'object' ? document.payload : {};
    return Object.freeze({
      source: 'postgresql',
      authoritative: true,
      domain,
      document: Object.freeze({
        ...payload,
        id: String(payload.id || documentId).trim(),
        enabled: typeof document.enabled === 'boolean' ? document.enabled : payload.enabled !== false,
        sortOrder: Number.isFinite(Number(document.sortOrder))
          ? Number(document.sortOrder)
          : Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
      }),
    });
  },

  async getHomeBootstrap() {
    if (typeof repository.getDomains !== 'function') {
      throw errorWith('home_bootstrap_read_unavailable', 'User home bootstrap reader is unavailable.', 503);
    }
    const domains = await repository.getDomains(['site-settings', 'home']);
    const siteSettings = domains?.['site-settings'];
    const home = domains?.home;
    if (!siteSettings || !home) {
      throw errorWith('home_bootstrap_not_synchronized', 'User home bootstrap content is not synchronized.', 404);
    }
    return Object.freeze({
      source: 'postgresql',
      authoritative: true,
      siteSettings: projectPublicDomain(siteSettings),
      home: projectPublicDomain(home),
    });
  },
  async getDomain(domainValue) {
    const domain = normalizeDomain(domainValue);
    if (!ALLOWED_DOMAINS.has(domain)) throw errorWith('site_content_domain_invalid', 'Unsupported site content domain.', 400);
    let result = await repository.getDomain(domain);
    if (domain === 'rental-config') {
      const hasCanonicalDocument = Boolean(result?.documents?.some((document) => document?.key === 'rentalSystem/publicConfig'));
      if (!result || !hasCanonicalDocument) {
        if (typeof repository.getRentalConfigBootstrapContext !== 'function') {
          throw errorWith('rental_config_bootstrap_unavailable', 'PostgreSQL rental configuration bootstrap is unavailable.', 503);
        }
        const context = await repository.getRentalConfigBootstrapContext();
        result = await repository.replaceDomain({
          domain,
          documents: [createRentalConfigBootstrapDocument(context)],
          actorClerkUserId: 'phase34-rental-config-self-heal',
          sourceMode: 'postgresql-self-heal',
        });
      }
    }
    if (!result) throw errorWith('site_content_not_synchronized', 'Site content has not been synchronized to PostgreSQL yet.', 404);
    return projectPublicDomain(result);
  },

  async replaceAdminDomain({ domain: domainValue, documents, actorClerkUserId }) {
    const domain = normalizeDomain(domainValue);
    if (!ALLOWED_DOMAINS.has(domain)) throw errorWith('site_content_domain_invalid', 'Unsupported site content domain.', 400);
    if (!Array.isArray(documents) || documents.length > 250) {
      throw errorWith('site_content_documents_invalid', 'Administrator content replacement requires an array of at most 250 documents.', 400);
    }
    const result = await repository.replaceDomain({
      domain,
      documents,
      actorClerkUserId,
      sourceMode: 'postgresql-admin-direct',
    });
    return projectPublicDomain(result);
  },

  async patchAdminDomain({ domain: domainValue, upserts, deletes, addressClaims, actorClerkUserId }) {
    const domain = normalizeDomain(domainValue);
    if (!ALLOWED_DOMAINS.has(domain)) throw errorWith('site_content_domain_invalid', 'Unsupported site content domain.', 400);
    if (typeof repository.patchDomainDocuments !== 'function') {
      throw errorWith('site_content_patch_unavailable', 'PostgreSQL partial content mutation is unavailable.', 503);
    }
    const normalizedUpserts = Array.isArray(upserts) ? upserts : [];
    const normalizedDeletes = Array.isArray(deletes) ? deletes : [];
    const normalizedAddressClaims = Array.isArray(addressClaims) ? addressClaims : [];
    if (normalizedUpserts.length > 50 || normalizedDeletes.length > 50 || normalizedAddressClaims.length > 50) {
      throw errorWith('site_content_patch_documents_invalid', 'Administrator content patch accepts at most 50 upserts and 50 deletes.', 400);
    }
    const result = await repository.patchDomainDocuments({
      domain,
      upserts: normalizedUpserts,
      deletes: normalizedDeletes,
      addressClaims: normalizedAddressClaims,
      actorClerkUserId,
      sourceMode: 'postgresql-admin-patch',
    });
    return projectPublicDomain(result);
  },

  async patchRentalConfigSettings({ settingsPatch, actorClerkUserId }) {
    if (!settingsPatch || typeof settingsPatch !== 'object' || Array.isArray(settingsPatch)) {
      throw errorWith('rental_config_settings_invalid', 'Rental configuration settings patch must be an object.', 400);
    }

    let current = await repository.getDomain('rental-config');
    const hasCanonicalDocument = Boolean(
      current?.documents?.some((document) => document?.key === 'rentalSystem/publicConfig')
    );
    if (!current || !hasCanonicalDocument) {
      if (typeof repository.getRentalConfigBootstrapContext !== 'function') {
        throw errorWith('rental_config_bootstrap_unavailable', 'PostgreSQL rental configuration bootstrap is unavailable.', 503);
      }
      const context = await repository.getRentalConfigBootstrapContext();
      current = await repository.replaceDomain({
        domain: 'rental-config',
        documents: [createRentalConfigBootstrapDocument(context)],
        actorClerkUserId: 'phase34-rental-config-settings-self-heal',
        sourceMode: 'postgresql-self-heal',
      });
    }

    const documents = (current?.documents || []).map((document) => {
      if (document?.key !== 'rentalSystem/publicConfig') return document;
      const payload = document?.payload && typeof document.payload === 'object' ? document.payload : {};
      const settings = payload?.settings && typeof payload.settings === 'object' ? payload.settings : {};
      return {
        key: document.key,
        payload: {
          ...payload,
          settings: { ...settings, ...settingsPatch },
          updatedAt: new Date().toISOString(),
        },
        enabled: document.enabled,
        sortOrder: document.sortOrder,
        sourceUpdatedAt: new Date().toISOString(),
      };
    });

    const result = await repository.replaceDomain({
      domain: 'rental-config',
      documents,
      actorClerkUserId,
      sourceMode: 'postgresql-admin-settings-patch',
    });
    return projectPublicDomain(result);
  },

  async patchSignupPolicy({ policyPatch, actorClerkUserId }) {
    if (!policyPatch || typeof policyPatch !== 'object' || Array.isArray(policyPatch)) {
      throw errorWith('signup_policy_invalid', 'Signup policy patch must be an object.', 400);
    }

    let [rentalConfig, terms] = await Promise.all([
      repository.getDomain('rental-config'),
      repository.getDomain('terms'),
    ]);
    const hasCanonicalDocument = Boolean(
      rentalConfig?.documents?.some((document) => document?.key === 'rentalSystem/publicConfig')
    );
    if (!rentalConfig || !hasCanonicalDocument) {
      if (typeof repository.getRentalConfigBootstrapContext !== 'function') {
        throw errorWith('rental_config_bootstrap_unavailable', 'PostgreSQL rental configuration bootstrap is unavailable.', 503);
      }
      const context = await repository.getRentalConfigBootstrapContext();
      rentalConfig = await repository.replaceDomain({
        domain: 'rental-config',
        documents: [createRentalConfigBootstrapDocument(context)],
        actorClerkUserId: 'phase34-signup-policy-self-heal',
        sourceMode: 'postgresql-self-heal',
      });
    }
    if (!terms) {
      throw errorWith('signup_terms_postgresql_missing', 'PostgreSQL signup terms configuration is unavailable.', 503);
    }

    const publicConfigDocument = rentalConfig.documents.find((document) => document?.key === 'rentalSystem/publicConfig');
    const termsPolicyDocument = terms.documents.find((document) => document?.key === 'signupTermsPolicy/current');
    const publicPayload = publicConfigDocument?.payload && typeof publicConfigDocument.payload === 'object'
      ? publicConfigDocument.payload
      : {};
    const currentSettings = publicPayload?.settings && typeof publicPayload.settings === 'object'
      ? publicPayload.settings
      : {};
    const currentTermsPolicy = termsPolicyDocument?.payload && typeof termsPolicyDocument.payload === 'object'
      ? termsPolicyDocument.payload
      : {};

    const nextRequireRegistered = Boolean(policyPatch.requireRegisteredMemberForSignup);
    const nextAutoApprove = nextRequireRegistered && Boolean(policyPatch.autoApproveNewMembers);
    const nextTermsEnabled = Boolean(policyPatch.signupTermsEnabled);
    const nextRequireReconsent = policyPatch.signupTermsRequireReconsentOnChange !== false;
    const nextApplyToExisting = Boolean(policyPatch.signupTermsApplyToExistingMembers);
    const activeTerms = Array.isArray(currentTermsPolicy.activeTerms) ? currentTermsPolicy.activeTerms : [];
    if (nextTermsEnabled && activeTerms.length === 0) {
      throw errorWith('terms/no-active-terms', 'At least one active signup term is required before enabling terms.', 409);
    }

    const policyEnabledChanged = nextRequireRegistered !== Boolean(currentSettings.requireRegisteredMemberForSignup);
    const nextDirectoryVersion = policyEnabledChanged
      ? Math.max(0, Number(currentSettings.memberDirectoryVersion || 0)) + 1
      : Math.max(0, Number(currentSettings.memberDirectoryVersion || 0));
    const currentTermsEnabled = Boolean(currentSettings.signupTermsEnabled);
    const enablingTerms = !currentTermsEnabled && nextTermsEnabled;
    let revision = Math.max(
      0,
      Number(currentTermsPolicy.revision || 0),
      Number(currentSettings.signupTermsPolicyRevision || 0),
    );
    if (enablingTerms && revision === 0) revision = 1;
    let initialRevision = Math.max(
      0,
      Number(currentTermsPolicy.initialRevision || 0),
      Number(currentSettings.signupTermsInitialRevision || 0),
    );
    let requiredRevision = Math.max(
      0,
      Number(currentTermsPolicy.requiredRevision || 0),
      Number(currentSettings.signupTermsRequiredRevision || 0),
    );
    if (enablingTerms) {
      initialRevision = revision;
      requiredRevision = revision;
    }

    const nextSettings = {
      ...currentSettings,
      requireRegisteredMemberForSignup: nextRequireRegistered,
      autoApproveNewMembers: nextAutoApprove,
      memberDirectoryVersion: nextDirectoryVersion,
      signupTermsEnabled: nextTermsEnabled,
      signupTermsRequireReconsentOnChange: nextRequireReconsent,
      signupTermsApplyToExistingMembers: nextApplyToExisting,
      signupTermsPolicyRevision: revision,
      signupTermsRequiredRevision: requiredRevision,
      signupTermsInitialRevision: initialRevision,
    };
    const nextTermsPolicy = {
      ...currentTermsPolicy,
      enabled: nextTermsEnabled,
      requireReconsentOnChange: nextRequireReconsent,
      applyToExistingMembers: nextApplyToExisting,
      revision,
      requiredRevision,
      initialRevision,
      activeTerms,
      updatedAt: new Date().toISOString(),
      updatedBy: String(actorClerkUserId || 'clerk-admin'),
    };

    const nextTermsDocuments = terms.documents.map((document) => document?.key === 'signupTermsPolicy/current'
      ? {
          key: document.key,
          payload: nextTermsPolicy,
          enabled: nextTermsEnabled,
          sortOrder: document.sortOrder,
          sourceUpdatedAt: new Date().toISOString(),
        }
      : document
    );
    if (!termsPolicyDocument) {
      nextTermsDocuments.unshift({
        key: 'signupTermsPolicy/current',
        payload: nextTermsPolicy,
        enabled: nextTermsEnabled,
        sortOrder: null,
        sourceUpdatedAt: new Date().toISOString(),
      });
    }

    await repository.replaceDomain({
      domain: 'terms',
      documents: nextTermsDocuments,
      actorClerkUserId,
      sourceMode: 'postgresql-admin-signup-policy',
    });

    const nextRentalDocuments = rentalConfig.documents.map((document) => document?.key === 'rentalSystem/publicConfig'
      ? {
          key: document.key,
          payload: { ...publicPayload, settings: nextSettings, updatedAt: new Date().toISOString() },
          enabled: document.enabled,
          sortOrder: document.sortOrder,
          sourceUpdatedAt: new Date().toISOString(),
        }
      : document
    );
    const nextRentalConfig = await repository.replaceDomain({
      domain: 'rental-config',
      documents: nextRentalDocuments,
      actorClerkUserId,
      sourceMode: 'postgresql-admin-signup-policy',
    });

    return Object.freeze({
      authority: 'postgresql',
      operation: 'signup-policy-patch',
      settings: nextSettings,
      termsPolicy: nextTermsPolicy,
      rentalConfig: projectPublicDomain(nextRentalConfig),
    });
  },

});

export const __siteContentVisibilityTest = Object.freeze({ timestampMillis, projectTimedVisibility, projectPublicDomain });
