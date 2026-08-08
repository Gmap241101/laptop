import { decodeFirestoreDocument } from './firestore-user-account.mjs';

const DEFAULT_TIMEOUT_MS = 8000;
const normalizeToken = (value) => String(value || '').trim();
const createError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'FirestoreRentalRestrictionError';
  error.code = code;
  error.status = status;
  return error;
};

export const createFirestoreRentalRestrictionClient = ({
  projectId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) => {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  return Object.freeze({
    async getRentalRestriction({ firebaseUid, firebaseIdToken }) {
      const uid = String(firebaseUid || '').trim();
      const token = normalizeToken(firebaseIdToken);
      if (!uid) throw createError('firebase_uid_missing', 'Firebase UID is required.');
      if (!token) throw createError('firebase_id_token_missing', 'Firebase ID token is required.');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}/databases/(default)/documents/rentalRestrictions/${encodeURIComponent(uid)}`;

      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 404) return null;
        if (response.status === 401) throw createError('firestore_rental_restriction_unauthorized', 'Firestore rejected the Firebase ID token.', 401);
        if (response.status === 403) throw createError('firestore_rental_restriction_forbidden', 'Firestore Security Rules rejected the rentalRestrictions document read.', 403);
        if (!response.ok) throw createError('firestore_rental_restriction_unavailable', `Firestore rentalRestrictions read failed with HTTP ${response.status}.`, response.status);
        return decodeFirestoreDocument(await response.json());
      } catch (error) {
        if (error?.name === 'AbortError') throw createError('firestore_rental_restriction_timeout', 'Firestore rentalRestrictions read timed out.');
        if (error?.code) throw error;
        throw createError('firestore_rental_restriction_unavailable', 'Firestore rentalRestrictions read failed.');
      } finally {
        clearTimeout(timeout);
      }
    },
  });
};
