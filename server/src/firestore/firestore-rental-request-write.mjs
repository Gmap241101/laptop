import { decodeFirestoreDocument } from './firestore-user-account.mjs';

const DEFAULT_TIMEOUT_MS = 8000;
const normalize = (value) => String(value ?? '').trim();

const createError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'FirestoreRentalRequestWriteError';
  error.code = code;
  error.status = status;
  return error;
};

const encodeFirestoreValue = (value) => {
  if (value == null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nested]) => [key, encodeFirestoreValue(nested)]),
        ),
      },
    };
  }
  return { stringValue: String(value) };
};

const encodeFields = (payload) =>
  Object.fromEntries(Object.entries(payload || {}).map(([key, value]) => [key, encodeFirestoreValue(value)]));

const responseErrorCode = async (response) => {
  try {
    const payload = await response.clone().json();
    return normalize(payload?.error?.status || payload?.error?.message);
  } catch {
    return '';
  }
};

export const createFirestoreRentalRequestWriteClient = ({
  projectId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) => {
  const normalizedProjectId = normalize(projectId);
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}/databases/(default)/documents`;

  const fetchDocument = async ({ path, firebaseIdToken, codePrefix }) => {
    const token = normalize(firebaseIdToken);
    if (!token) throw createError('firebase_id_token_missing', 'Firebase ID token is required.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 404) return null;
      if (response.status === 401) throw createError(`${codePrefix}_unauthorized`, 'Firestore rejected the Firebase ID token.', 401);
      if (response.status === 403) throw createError(`${codePrefix}_forbidden`, 'Firestore Security Rules rejected the document read.', 403);
      if (!response.ok) throw createError(`${codePrefix}_unavailable`, `Firestore document read failed with HTTP ${response.status}.`, response.status);
      return decodeFirestoreDocument(await response.json());
    } catch (error) {
      if (error?.name === 'AbortError') throw createError(`${codePrefix}_timeout`, 'Firestore document read timed out.');
      if (error?.code) throw error;
      throw createError(`${codePrefix}_unavailable`, 'Firestore document read failed.');
    } finally {
      clearTimeout(timeout);
    }
  };

  const commitWrites = async ({ firebaseIdToken, codePrefix, writes }) => {
    const token = normalize(firebaseIdToken);
    if (!token) throw createError('firebase_id_token_missing', 'Firebase ID token is required.', 401);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}:commit`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ writes }),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 401) throw createError(`${codePrefix}_unauthorized`, 'Firestore rejected the Firebase ID token.', 401);
      if (response.status === 403) throw createError(`${codePrefix}_forbidden`, 'Firestore Security Rules rejected the compatibility mirror.', 403);
      if (!response.ok) {
        const detail = await responseErrorCode(response);
        const conflict = [409, 412].includes(response.status) || /ABORTED|FAILED_PRECONDITION/i.test(detail);
        if (conflict) throw createError(`${codePrefix}_conflict`, 'Firestore document changed before compatibility mirror commit.', 409);
        throw createError(`${codePrefix}_unavailable`, `Firestore compatibility mirror failed with HTTP ${response.status}.`, response.status);
      }
      const payload = await response.json();
      return Object.freeze({ commitTime: payload?.commitTime || null, writeResults: Array.isArray(payload?.writeResults) ? payload.writeResults : [] });
    } catch (error) {
      if (error?.name === 'AbortError') throw createError(`${codePrefix}_timeout`, 'Firestore compatibility mirror timed out.', 503);
      if (error?.code) throw error;
      throw createError(`${codePrefix}_unavailable`, 'Firestore compatibility mirror failed.', 503);
    } finally {
      clearTimeout(timeout);
    }
  };

  return Object.freeze({
    async getPublicConfig({ firebaseIdToken }) {
      return fetchDocument({
        path: 'rentalSystem/publicConfig',
        firebaseIdToken,
        codePrefix: 'firestore_rental_public_config',
      });
    },

    async getRentalAsset({ assetId, firebaseIdToken }) {
      const id = normalize(assetId);
      if (!id) throw createError('rental_asset_id_missing', 'Rental asset ID is required.');
      return fetchDocument({
        path: `rentalAssets/${encodeURIComponent(id)}`,
        firebaseIdToken,
        codePrefix: 'firestore_rental_asset',
      });
    },

    async getRentalRequest({ requestId, firebaseIdToken }) {
      const id = normalize(requestId);
      if (!id) throw createError('rental_request_id_missing', 'Rental request ID is required.');
      return fetchDocument({
        path: `rentalRequests/${encodeURIComponent(id)}`,
        firebaseIdToken,
        codePrefix: 'firestore_rental_request',
      });
    },

    async commitUserRequestEdit({ request, availability, asset, requestUpdateTime, assetUpdateTime, firebaseIdToken }) {
      const token = normalize(firebaseIdToken);
      const requestId = normalize(request?.id);
      const assetId = normalize(asset?.id);
      if (!token || !requestId || !assetId || !normalize(requestUpdateTime) || !normalize(assetUpdateTime)) {
        throw createError('firestore_user_request_edit_invalid', 'User request edit mirror payload is incomplete.', 400);
      }
      const requestName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalRequests/${requestId}`;
      const availabilityName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalAvailability/${requestId}`;
      const assetName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalAssets/${assetId}`;
      return commitWrites({
        firebaseIdToken: token,
        codePrefix: 'firestore_user_request_edit',
        writes: [
          {
            update: { name: requestName, fields: encodeFields({ startDate: request.startDate, dueDate: request.dueDate, purpose: request.purpose, userActionRequest: null }) },
            updateMask: { fieldPaths: ['startDate', 'dueDate', 'purpose', 'userActionRequest'] },
            currentDocument: { updateTime: requestUpdateTime },
            updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          },
          {
            update: { name: availabilityName, fields: encodeFields(availability) },
            updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          },
          {
            update: { name: assetName, fields: encodeFields({ reservations: asset.reservations, reservationMutation: { type: 'user-edit', requestId, requesterUid: request.requesterUid } }) },
            updateMask: { fieldPaths: ['reservations', 'reservationMutation'] },
            currentDocument: { updateTime: assetUpdateTime },
            updateTransforms: [
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'reservationMutation.updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
          },
        ],
      });
    },

    async commitUserRequestCancel({ request, asset, requestUpdateTime, assetUpdateTime, firebaseIdToken }) {
      const token = normalize(firebaseIdToken);
      const requestId = normalize(request?.id);
      const assetId = normalize(asset?.id);
      if (!token || !requestId || !assetId || !normalize(requestUpdateTime) || !normalize(assetUpdateTime)) {
        throw createError('firestore_user_request_cancel_invalid', 'User request cancel mirror payload is incomplete.', 400);
      }
      const requestName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalRequests/${requestId}`;
      const availabilityName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalAvailability/${requestId}`;
      const assetName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalAssets/${assetId}`;
      return commitWrites({
        firebaseIdToken: token,
        codePrefix: 'firestore_user_request_cancel',
        writes: [
          { delete: requestName, currentDocument: { updateTime: requestUpdateTime } },
          { delete: availabilityName },
          {
            update: { name: assetName, fields: encodeFields({ reservations: asset.reservations, reservationMutation: { type: 'user-cancel', requestId, requesterUid: request.requesterUid } }) },
            updateMask: { fieldPaths: ['reservations', 'reservationMutation'] },
            currentDocument: { updateTime: assetUpdateTime },
            updateTransforms: [
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'reservationMutation.updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
          },
        ],
      });
    },

    async commitUserExtension({ request, availability = null, asset = null, requestUpdateTime, assetUpdateTime = '', autoApproved = false, firebaseIdToken }) {
      const token = normalize(firebaseIdToken);
      const requestId = normalize(request?.id);
      if (!token || !requestId || !normalize(requestUpdateTime)) {
        throw createError('firestore_user_extension_invalid', 'User extension mirror payload is incomplete.', 400);
      }
      const requestName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalRequests/${requestId}`;
      const requestFields = autoApproved
        ? {
            dueDate: request.dueDate,
            extensionCount: request.extensionCount,
            lastExtensionApprovedDate: request.lastExtensionApprovedDate,
            nextExtensionRequestDate: request.nextExtensionRequestDate,
            extensionHistory: request.extensionHistory || [],
            userActionRequest: request.userActionRequest,
          }
        : { userActionRequest: request.userActionRequest };
      const fieldPaths = Object.keys(requestFields);
      const writes = [{
        update: { name: requestName, fields: encodeFields(requestFields) },
        updateMask: { fieldPaths },
        currentDocument: { updateTime: requestUpdateTime },
        updateTransforms: [
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ...(autoApproved ? [{ fieldPath: 'syncedAt', setToServerValue: 'REQUEST_TIME' }] : []),
        ],
      }];
      if (autoApproved) {
        const assetId = normalize(asset?.id);
        if (!availability || !assetId || !normalize(assetUpdateTime)) {
          throw createError('firestore_user_extension_auto_invalid', 'Automatic extension mirror payload is incomplete.', 400);
        }
        writes.push({
          update: { name: `projects/${normalizedProjectId}/databases/(default)/documents/rentalAvailability/${requestId}`, fields: encodeFields(availability) },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        });
        writes.push({
          update: { name: `projects/${normalizedProjectId}/databases/(default)/documents/rentalAssets/${assetId}`, fields: encodeFields({ reservations: asset.reservations }) },
          updateMask: { fieldPaths: ['reservations'] },
          currentDocument: { updateTime: assetUpdateTime },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        });
      }
      return commitWrites({ firebaseIdToken: token, codePrefix: 'firestore_user_extension', writes });
    },

    async commitRentalRequestCreate({ request, availability, asset, assetUpdateTime, firebaseIdToken }) {
      const token = normalize(firebaseIdToken);
      if (!token) throw createError('firebase_id_token_missing', 'Firebase ID token is required.');
      if (!normalize(request?.id) || !normalize(asset?.id) || !normalize(assetUpdateTime)) {
        throw createError('firestore_rental_request_mirror_invalid', 'Firestore mirror payload is incomplete.');
      }

      const requestName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalRequests/${request.id}`;
      const availabilityName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalAvailability/${request.id}`;
      const assetName = `projects/${normalizedProjectId}/databases/(default)/documents/rentalAssets/${asset.id}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const writes = [
        {
          update: {
            name: requestName,
            fields: encodeFields(request),
          },
          currentDocument: { exists: false },
          updateTransforms: [
            { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        },
        {
          update: {
            name: availabilityName,
            fields: encodeFields(availability),
          },
          currentDocument: { exists: false },
          updateTransforms: [
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        },
        {
          update: {
            name: assetName,
            fields: encodeFields({ reservations: asset.reservations }),
          },
          updateMask: { fieldPaths: ['reservations'] },
          currentDocument: { updateTime: assetUpdateTime },
          updateTransforms: [
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        },
      ];

      try {
        const response = await fetchImpl(`${baseUrl}:commit`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ writes }),
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 401) throw createError('firestore_rental_request_mirror_unauthorized', 'Firestore rejected the Firebase ID token.', 401);
        if (response.status === 403) throw createError('firestore_rental_request_mirror_forbidden', 'Firestore Security Rules rejected the rental request mirror.', 403);
        if (!response.ok) {
          const detail = await responseErrorCode(response);
          const conflict = [409, 412].includes(response.status) || /ABORTED|FAILED_PRECONDITION/i.test(detail);
          if (conflict) {
            throw createError('firestore_rental_asset_write_conflict', 'Rental asset changed before the compatibility mirror could commit.', 409);
          }
          throw createError('firestore_rental_request_mirror_unavailable', `Firestore rental request mirror failed with HTTP ${response.status}.`, response.status);
        }
        const payload = await response.json();
        return Object.freeze({
          commitTime: payload?.commitTime || null,
          writeResults: Array.isArray(payload?.writeResults) ? payload.writeResults : [],
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw createError('firestore_rental_request_mirror_timeout', 'Firestore rental request mirror timed out.');
        if (error?.code) throw error;
        throw createError('firestore_rental_request_mirror_unavailable', 'Firestore rental request mirror failed.');
      } finally {
        clearTimeout(timeout);
      }
    },
  });
};
