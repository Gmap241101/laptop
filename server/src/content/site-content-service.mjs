import { createRentalConfigBootstrapDocument } from './rental-config-bootstrap.mjs';
const ALLOWED_DOMAINS = new Set(['site-settings', 'home', 'popup', 'footer', 'rental-config', 'terms']);
const errorWith = (code, message, status) => Object.assign(new Error(message), { code, status });
const normalizeDomain = (value) => String(value || '').trim().toLowerCase();

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

export const createSiteContentService = ({ repository }) => Object.freeze({
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
});

export const __siteContentVisibilityTest = Object.freeze({ timestampMillis, projectTimedVisibility, projectPublicDomain });
