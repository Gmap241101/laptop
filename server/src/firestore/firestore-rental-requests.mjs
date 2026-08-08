import { decodeFirestoreDocument } from './firestore-user-account.mjs';

const DEFAULT_TIMEOUT_MS = 8000;
const normalize = (value) => String(value ?? '').trim();

const createError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'FirestoreRentalRequestsError';
  error.code = code;
  error.status = status;
  return error;
};

const buildEqualQuery = (fieldPath, value) => ({
  structuredQuery: {
    from: [{ collectionId: 'rentalRequests' }],
    where: {
      fieldFilter: {
        field: { fieldPath },
        op: 'EQUAL',
        value: { stringValue: value },
      },
    },
  },
});

const readQueryResponse = async ({ response, codePrefix }) => {
  if (response.status === 401) {
    throw createError(`${codePrefix}_unauthorized`, 'Firestore rejected the Firebase ID token.', 401);
  }
  if (response.status === 403) {
    throw createError(`${codePrefix}_forbidden`, 'Firestore Security Rules rejected the rentalRequests query.', 403);
  }
  if (!response.ok) {
    throw createError(`${codePrefix}_unavailable`, `Firestore rentalRequests query failed with HTTP ${response.status}.`, response.status);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw createError(`${codePrefix}_invalid`, 'Firestore rentalRequests query returned an invalid payload.');
  }
  return payload
    .map((entry) => entry?.document)
    .filter(Boolean)
    .map(decodeFirestoreDocument);
};

export const createFirestoreRentalRequestsClient = ({
  projectId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) => {
  const normalizedProjectId = normalize(projectId);
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  const runEqualQuery = async ({ fieldPath, value, firebaseIdToken }) => {
    const token = normalize(firebaseIdToken);
    const normalizedValue = normalize(value);
    if (!token) throw createError('firebase_id_token_missing', 'Firebase ID token is required.');
    if (!normalizedValue) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}/databases/(default)/documents:runQuery`;

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildEqualQuery(fieldPath, normalizedValue)),
        cache: 'no-store',
        signal: controller.signal,
      });
      return await readQueryResponse({ response, codePrefix: 'firestore_rental_requests' });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw createError('firestore_rental_requests_timeout', 'Firestore rentalRequests query timed out.');
      }
      if (error?.code) throw error;
      throw createError('firestore_rental_requests_unavailable', 'Firestore rentalRequests query failed.');
    } finally {
      clearTimeout(timeout);
    }
  };

  return Object.freeze({
    async listOwnRentalRequests({ requesterUids = [], requesterEmail = '', firebaseIdToken }) {
      const uidValues = [...new Set((requesterUids || []).map(normalize).filter(Boolean))];
      const email = normalize(requesterEmail).toLowerCase();
      const documents = [];

      for (const uid of uidValues) {
        documents.push(...await runEqualQuery({
          fieldPath: 'requesterUid',
          value: uid,
          firebaseIdToken,
        }));
      }

      if (email) {
        documents.push(...await runEqualQuery({
          fieldPath: 'requesterEmail',
          value: email,
          firebaseIdToken,
        }));
      }

      const byName = new Map();
      for (const document of documents) {
        byName.set(document.name, document);
      }
      return [...byName.values()];
    },
  });
};
