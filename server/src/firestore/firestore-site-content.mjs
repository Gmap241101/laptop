import { decodeFirestoreDocument } from './firestore-user-account.mjs';

const DEFAULT_TIMEOUT_MS = 8000;
const trim = (value) => String(value ?? '').trim();

const createError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'FirestoreSiteContentError';
  error.code = code;
  error.status = status;
  return error;
};

const collectionDocumentId = (document = {}) => {
  const name = trim(document.name);
  if (!name) return '';
  const parts = name.split('/');
  return parts[parts.length - 1] || '';
};

const documentToSyncItem = ({ document, key, collectionId = '' }) => {
  if (!document) return null;
  const fields = document.fields || {};
  const id = collectionId ? collectionDocumentId(document) : '';
  const payload = collectionId ? { id, ...fields } : { ...fields };
  return Object.freeze({
    key: collectionId ? `${collectionId}/${id}` : key,
    payload,
    enabled: typeof fields.enabled === 'boolean' ? fields.enabled : null,
    sortOrder: Number.isFinite(Number(fields.sortOrder)) ? Math.trunc(Number(fields.sortOrder)) : null,
    sourceUpdatedAt: typeof fields.updatedAt === 'string' && fields.updatedAt ? fields.updatedAt : document.updateTime || null,
  });
};

export const createFirestoreSiteContentClient = ({ projectId, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch }) => {
  const normalizedProjectId = trim(projectId);
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}/databases/(default)/documents`;

  const requestJson = async ({ url, firebaseIdToken, method = 'GET', body = null, codePrefix }) => {
    const token = trim(firebaseIdToken);
    if (!token) throw createError('firebase_id_token_missing', 'Firebase administrator ID token is required.', 401);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 401) throw createError(`${codePrefix}_unauthorized`, 'Firestore rejected the Firebase administrator ID token.', 401);
      if (response.status === 403) throw createError(`${codePrefix}_forbidden`, 'Firestore Security Rules rejected the site-content server read.', 403);
      if (response.status === 404) return null;
      if (!response.ok) throw createError(`${codePrefix}_unavailable`, `Firestore site-content read failed with HTTP ${response.status}.`, response.status);
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw createError(`${codePrefix}_timeout`, 'Firestore site-content server read timed out.', 503);
      if (error?.code) throw error;
      throw createError(`${codePrefix}_unavailable`, 'Firestore site-content server read failed.', 503);
    } finally {
      clearTimeout(timeout);
    }
  };

  const getDocument = async (path, firebaseIdToken, codePrefix) => {
    const payload = await requestJson({ url: `${baseUrl}/${path}`, firebaseIdToken, codePrefix });
    return payload ? decodeFirestoreDocument(payload) : null;
  };

  const listCollection = async (collectionId, firebaseIdToken, codePrefix) => {
    const payload = await requestJson({
      url: `${baseUrl}:runQuery`,
      method: 'POST',
      firebaseIdToken,
      codePrefix,
      body: { structuredQuery: { from: [{ collectionId }] } },
    });
    if (!Array.isArray(payload)) throw createError(`${codePrefix}_invalid`, 'Firestore site-content collection response is invalid.', 503);
    return payload.map((entry) => entry?.document).filter(Boolean).map(decodeFirestoreDocument);
  };

  const readSingle = async (path, key, firebaseIdToken, codePrefix) => {
    const document = await getDocument(path, firebaseIdToken, codePrefix);
    const item = documentToSyncItem({ document, key });
    return item ? [item] : [];
  };

  const readCollection = async (collectionId, firebaseIdToken, codePrefix) => {
    const documents = await listCollection(collectionId, firebaseIdToken, codePrefix);
    return documents.map((document) => documentToSyncItem({ document, collectionId })).filter(Boolean);
  };

  return Object.freeze({
    async readDomain({ domain, firebaseIdToken }) {
      const normalizedDomain = trim(domain).toLowerCase();
      if (normalizedDomain === 'site-settings') {
        return readSingle('siteSettings/config', 'siteSettings/config', firebaseIdToken, 'firestore_site_settings');
      }
      if (normalizedDomain === 'home') {
        const [config, banners] = await Promise.all([
          readSingle('homePage/config', 'homePage/config', firebaseIdToken, 'firestore_home_config'),
          readCollection('homeBanners', firebaseIdToken, 'firestore_home_banners'),
        ]);
        return [...config, ...banners];
      }
      if (normalizedDomain === 'popup') {
        return readCollection('popupPosts', firebaseIdToken, 'firestore_popup_posts');
      }
      if (normalizedDomain === 'footer') {
        const [config, pages] = await Promise.all([
          readSingle('siteFooter/config', 'siteFooter/config', firebaseIdToken, 'firestore_footer_config'),
          readCollection('footerPages', firebaseIdToken, 'firestore_footer_pages'),
        ]);
        return [...config, ...pages];
      }
      if (normalizedDomain === 'rental-config') {
        return readSingle('rentalSystem/publicConfig', 'rentalSystem/publicConfig', firebaseIdToken, 'firestore_rental_config');
      }
      if (normalizedDomain === 'terms') {
        const [policy, terms] = await Promise.all([
          readSingle('signupTermsPolicy/current', 'signupTermsPolicy/current', firebaseIdToken, 'firestore_terms_policy'),
          readCollection('signupTerms', firebaseIdToken, 'firestore_signup_terms'),
        ]);
        return [...policy, ...terms];
      }
      throw createError('site_content_domain_invalid', 'Unsupported site-content Firestore domain.', 400);
    },
  });
};
