const DEFAULT_TIMEOUT_MS = 8000;

const firestoreError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'FirestoreUserAccountError';
  error.code = code;
  error.status = status;
  return error;
};

const decodeInteger = (value) => {
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) ? numberValue : String(value);
};

export const decodeFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return decodeInteger(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('geoPointValue' in value) {
    return {
      latitude: Number(value.geoPointValue?.latitude || 0),
      longitude: Number(value.geoPointValue?.longitude || 0),
    };
  }
  if ('arrayValue' in value) {
    return (value.arrayValue?.values || []).map(decodeFirestoreValue);
  }
  if ('mapValue' in value) {
    return decodeFirestoreFields(value.mapValue?.fields || {});
  }
  return null;
};

export const decodeFirestoreFields = (fields) =>
  Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  );

export const decodeFirestoreDocument = (document) => {
  if (!document || typeof document !== 'object') {
    throw firestoreError('firestore_document_invalid', 'Firestore returned an invalid document payload.');
  }

  return Object.freeze({
    name: String(document.name || ''),
    createTime: document.createTime || null,
    updateTime: document.updateTime || null,
    fields: decodeFirestoreFields(document.fields || {}),
  });
};

const normalizeToken = (value) => String(value || '').trim();

export const createFirestoreUserAccountClient = ({
  projectId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) => {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  return Object.freeze({
    async getUserAccount({ firebaseUid, firebaseIdToken }) {
      const uid = String(firebaseUid || '').trim();
      const token = normalizeToken(firebaseIdToken);
      if (!uid) throw firestoreError('firebase_uid_missing', 'Firebase UID is required.');
      if (!token) throw firestoreError('firebase_id_token_missing', 'Firebase ID token is required.');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}/databases/(default)/documents/userAccounts/${encodeURIComponent(uid)}`;

      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
          signal: controller.signal,
        });

        if (response.status === 404) return null;
        if (response.status === 401) {
          throw firestoreError('firestore_user_account_unauthorized', 'Firestore rejected the Firebase ID token.', 401);
        }
        if (response.status === 403) {
          throw firestoreError('firestore_user_account_forbidden', 'Firestore Security Rules rejected the userAccounts document read.', 403);
        }
        if (!response.ok) {
          throw firestoreError('firestore_user_account_unavailable', `Firestore userAccounts read failed with HTTP ${response.status}.`, response.status);
        }

        return decodeFirestoreDocument(await response.json());
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw firestoreError('firestore_user_account_timeout', 'Firestore userAccounts read timed out.');
        }
        if (error?.code) throw error;
        throw firestoreError('firestore_user_account_unavailable', 'Firestore userAccounts read failed.');
      } finally {
        clearTimeout(timeout);
      }
    },
  });
};
