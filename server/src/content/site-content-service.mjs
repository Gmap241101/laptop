const ALLOWED_DOMAINS = new Set(['site-settings', 'home', 'popup', 'footer']);
const errorWith = (code, message, status) => Object.assign(new Error(message), { code, status });
const normalizeDomain = (value) => String(value || '').trim().toLowerCase();

export const createSiteContentService = ({ repository }) => Object.freeze({
  async getDomain(domainValue) {
    const domain = normalizeDomain(domainValue);
    if (!ALLOWED_DOMAINS.has(domain)) throw errorWith('site_content_domain_invalid', 'Unsupported site content domain.', 400);
    const result = await repository.getDomain(domain);
    if (!result) throw errorWith('site_content_not_synchronized', 'Site content has not been synchronized to PostgreSQL yet.', 404);
    return result;
  },

  async syncDomain({ domain: domainValue, documents, actorClerkUserId }) {
    const domain = normalizeDomain(domainValue);
    if (!ALLOWED_DOMAINS.has(domain)) throw errorWith('site_content_domain_invalid', 'Unsupported site content domain.', 400);
    if (!Array.isArray(documents) || documents.length > 250) {
      throw errorWith('site_content_documents_invalid', 'Site content sync requires an array of at most 250 documents.', 400);
    }
    return repository.replaceDomain({ domain, documents, actorClerkUserId });
  },
});
