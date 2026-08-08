import { randomUUID } from 'node:crypto';
import { decodeFirestoreDocument } from './firestore-user-account.mjs';

const DEFAULT_TIMEOUT_MS = 8000;
const normalize = (value) => String(value ?? '').trim();

const createError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'FirestoreAdminRentalRequestError';
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

const encodeFields = (payload = {}) =>
  Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, encodeFirestoreValue(value)]),
  );

const responseDetail = async (response) => {
  try {
    const payload = await response.clone().json();
    return normalize(payload?.error?.status || payload?.error?.message);
  } catch {
    return '';
  }
};

export const createFirestoreAdminRentalRequestsClient = ({
  projectId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) => {
  const normalizedProjectId = normalize(projectId);
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}/databases/(default)/documents`;
  const documentName = (path) => `projects/${normalizedProjectId}/databases/(default)/documents/${path}`;

  const requestJson = async ({ url, firebaseIdToken, method = 'GET', body = null, codePrefix }) => {
    const token = normalize(firebaseIdToken);
    if (!token) throw createError('firebase_id_token_missing', 'Firebase ID token is required.', 401);
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
      if (response.status === 401) throw createError(`${codePrefix}_unauthorized`, 'Firestore rejected the Firebase ID token.', 401);
      if (response.status === 403) throw createError(`${codePrefix}_forbidden`, 'Firestore Security Rules rejected the admin operation.', 403);
      if (response.status === 404) return null;
      if (!response.ok) {
        const detail = await responseDetail(response);
        const conflict = [409, 412].includes(response.status) || /ABORTED|FAILED_PRECONDITION/i.test(detail);
        if (conflict) throw createError(`${codePrefix}_conflict`, 'Firestore document changed before commit.', 409);
        throw createError(`${codePrefix}_unavailable`, `Firestore operation failed with HTTP ${response.status}.`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw createError(`${codePrefix}_timeout`, 'Firestore operation timed out.', 503);
      if (error?.code) throw error;
      throw createError(`${codePrefix}_unavailable`, 'Firestore operation failed.', 503);
    } finally {
      clearTimeout(timeout);
    }
  };

  const getDocument = async ({ path, firebaseIdToken, codePrefix }) => {
    const payload = await requestJson({
      url: `${baseUrl}/${path}`,
      firebaseIdToken,
      codePrefix,
    });
    return payload ? decodeFirestoreDocument(payload) : null;
  };

  return Object.freeze({
    async verifyAdmin({ firebaseUid, firebaseIdToken }) {
      const uid = normalize(firebaseUid);
      if (!uid) throw createError('admin_firebase_uid_missing', 'Firebase admin UID is required.', 401);
      const document = await getDocument({
        path: `adminAccounts/${encodeURIComponent(uid)}`,
        firebaseIdToken,
        codePrefix: 'firestore_admin_account',
      });
      if (!document) throw createError('admin_account_not_found', 'Firebase admin account was not found.', 403);
      const fields = document.fields || {};
      if (normalize(fields.id) !== uid || normalize(fields.authUid) !== uid) {
        throw createError('admin_account_identity_mismatch', 'Firebase admin account identity is invalid.', 403);
      }
      return Object.freeze({
        uid,
        adminId: normalize(fields.id),
        name: normalize(fields.userName || fields.adminLoginId || fields.authEmail || '관리자'),
        role: normalize(fields.adminRole || 'admin'),
      });
    },

    async listAllRentalRequests({ firebaseIdToken }) {
      const payload = await requestJson({
        url: `${baseUrl}:runQuery`,
        method: 'POST',
        firebaseIdToken,
        codePrefix: 'firestore_admin_rental_requests',
        body: {
          structuredQuery: {
            from: [{ collectionId: 'rentalRequests' }],
          },
        },
      });
      if (!Array.isArray(payload)) {
        throw createError('firestore_admin_rental_requests_invalid', 'Firestore rental request list response is invalid.', 503);
      }
      return payload
        .map((entry) => entry?.document)
        .filter(Boolean)
        .map(decodeFirestoreDocument);
    },

    async getRentalRequest({ requestId, firebaseIdToken }) {
      return getDocument({
        path: `rentalRequests/${encodeURIComponent(normalize(requestId))}`,
        firebaseIdToken,
        codePrefix: 'firestore_admin_rental_request',
      });
    },

    async getRentalAsset({ assetId, firebaseIdToken }) {
      return getDocument({
        path: `rentalAssets/${encodeURIComponent(normalize(assetId))}`,
        firebaseIdToken,
        codePrefix: 'firestore_admin_rental_asset',
      });
    },

    async getPublicConfig({ firebaseIdToken }) {
      return getDocument({
        path: 'rentalSystem/publicConfig',
        firebaseIdToken,
        codePrefix: 'firestore_admin_rental_public_config',
      });
    },

    async getRentalRestriction({ firebaseUid, firebaseIdToken }) {
      const uid = normalize(firebaseUid);
      if (!uid) return null;
      return getDocument({
        path: `rentalRestrictions/${encodeURIComponent(uid)}`,
        firebaseIdToken,
        codePrefix: 'firestore_admin_rental_restriction',
      });
    },

    async commitStatusChange({
      request,
      previousRequest,
      availability,
      asset,
      requestUpdateTime,
      assetUpdateTime,
      auditActor,
      restriction = null,
      relatedRequestUpdates = [],
      firebaseIdToken,
    }) {
      const requestId = normalize(request?.id);
      const assetId = normalize(asset?.id);
      if (!requestId || !assetId || !normalize(requestUpdateTime) || !normalize(assetUpdateTime)) {
        throw createError('firestore_admin_status_mirror_invalid', 'Admin status mirror payload is incomplete.', 400);
      }
      const logId = randomUUID();
      const writes = [
        {
          update: {
            name: documentName(`rentalRequests/${requestId}`),
            fields: encodeFields({
              status: request.status,
              adminMemo: request.adminMemo || '',
              ...(request.actualReturnDate ? { actualReturnDate: request.actualReturnDate } : {}),
              ...(Number(request.overdueDaysAtReturn || 0) > 0 ? { overdueDaysAtReturn: Number(request.overdueDaysAtReturn || 0) } : {}),
              overduePenaltyPending: Boolean(request.overduePenaltyPending),
              overduePenaltyBatchId: request.overduePenaltyBatchId || '',
            }),
          },
          updateMask: {
            fieldPaths: [
              'status', 'adminMemo',
              ...(request.actualReturnDate ? ['actualReturnDate'] : []),
              ...(Number(request.overdueDaysAtReturn || 0) > 0 ? ['overdueDaysAtReturn'] : []),
              'overduePenaltyPending', 'overduePenaltyBatchId',
            ],
          },
          currentDocument: { updateTime: requestUpdateTime },
          updateTransforms: [
            ...(request.returnedAt ? [{ fieldPath: 'returnedAt', setToServerValue: 'REQUEST_TIME' }] : []),
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'syncedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        },
        {
          update: {
            name: documentName(`rentalRequestLogs/${logId}`),
            fields: encodeFields({
              id: logId,
              requestId,
              action: 'status-changed',
              previousStatus: previousRequest?.status || '',
              nextStatus: request.status || '',
              previousMemo: previousRequest?.adminMemo || '',
              nextMemo: request.adminMemo || '',
              actorUid: auditActor.uid,
              actorAdminId: auditActor.adminId,
              actorName: auditActor.name,
            }),
          },
          currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        },
      ];

      if (availability) {
        writes.push({
          update: {
            name: documentName(`rentalAvailability/${requestId}`),
            fields: encodeFields(availability),
          },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        });
      } else {
        writes.push({ delete: documentName(`rentalAvailability/${requestId}`) });
      }

      writes.push({
        update: {
          name: documentName(`rentalAssets/${assetId}`),
          fields: encodeFields({
            reservations: asset.reservations || [],
            status: asset.status,
            currentRequestId: asset.currentRequestId ?? null,
          }),
        },
        updateMask: { fieldPaths: ['reservations', 'status', 'currentRequestId'] },
        currentDocument: { updateTime: assetUpdateTime },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      });

      if (restriction?.uid) {
        writes.push({
          update: {
            name: documentName(`rentalRestrictions/${restriction.uid}`),
            fields: encodeFields(restriction.fields || {}),
          },
          updateMask: { fieldPaths: Object.keys(restriction.fields || {}) },
          updateTransforms: [
            { fieldPath: 'calculatedAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        });
      }

      for (const related of relatedRequestUpdates || []) {
        if (!normalize(related?.id)) continue;
        writes.push({
          update: {
            name: documentName(`rentalRequests/${related.id}`),
            fields: encodeFields(related.fields || {}),
          },
          updateMask: { fieldPaths: Object.keys(related.fields || {}) },
          updateTransforms: [
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'syncedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        });
      }

      return requestJson({
        url: `${baseUrl}:commit`,
        method: 'POST',
        firebaseIdToken,
        codePrefix: 'firestore_admin_status_mirror',
        body: { writes },
      });
    },
  });
};
