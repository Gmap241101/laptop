import { decodeFirestoreDocument } from './firestore-user-account.mjs';

const DEFAULT_TIMEOUT_MS = 8000;
const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();

const createError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'FirestoreAssetError';
  error.code = code;
  error.status = status;
  return error;
};

const encodeFirestoreValue = (value) => {
  if (value == null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encodeFirestoreValue(nested)])) } };
  }
  return { stringValue: String(value) };
};
const encodeFields = (payload = {}) => Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, encodeFirestoreValue(value)]));

const catalogAsset = (asset = {}) => ({
  id: trim(asset.id),
  category: trim(asset.category),
  assetNo: trim(asset.assetNo),
  serialNo: trim(asset.serialNo),
  model: trim(asset.model),
  manufactureDate: trim(asset.manufactureDate),
  photo: trim(asset.photo),
  note: trim(asset.note),
  baseStatus: asset.baseStatus === '대여불가' || asset.status === '대여불가' ? '대여불가' : '대여가능',
});

const sortCatalogAssets = (assets = []) => [...assets].map(catalogAsset).sort((a, b) => a.id.localeCompare(b.id, 'ko-KR', { numeric: true, sensitivity: 'base' }));
const catalogFingerprint = (assets) => JSON.stringify(sortCatalogAssets(assets));
const registryId = (assetNo) => encodeURIComponent(lower(assetNo));

export const createFirestoreAssetClient = ({ projectId, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch }) => {
  const normalizedProjectId = trim(projectId);
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}/databases/(default)/documents`;
  const documentName = (path) => `projects/${normalizedProjectId}/databases/(default)/documents/${path}`;

  const requestJson = async ({ url, firebaseIdToken, method = 'GET', body = null, codePrefix }) => {
    const token = trim(firebaseIdToken);
    if (!token) throw createError('firebase_id_token_missing', 'Firebase ID token is required.', 401);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 401) throw createError(`${codePrefix}_unauthorized`, 'Firestore rejected the Firebase ID token.', 401);
      if (response.status === 403) throw createError(`${codePrefix}_forbidden`, 'Firestore Security Rules rejected the asset operation.', 403);
      if (response.status === 404) return null;
      if (!response.ok) {
        let detail = '';
        try { const payload = await response.clone().json(); detail = trim(payload?.error?.status || payload?.error?.message); } catch { /* ignore */ }
        const conflict = [409, 412].includes(response.status) || /ABORTED|FAILED_PRECONDITION/i.test(detail);
        if (conflict) throw createError(`${codePrefix}_conflict`, 'Firestore document changed before commit.', 409);
        throw createError(`${codePrefix}_unavailable`, `Firestore operation failed with HTTP ${response.status}.`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw createError(`${codePrefix}_timeout`, 'Firestore operation timed out.', 503);
      if (error?.code) throw error;
      throw createError(`${codePrefix}_unavailable`, 'Firestore operation failed.', 503);
    } finally { clearTimeout(timeout); }
  };

  const getDocument = async (path, firebaseIdToken, codePrefix) => {
    const payload = await requestJson({ url: `${baseUrl}/${path}`, firebaseIdToken, codePrefix });
    return payload ? decodeFirestoreDocument(payload) : null;
  };

  const commit = ({ firebaseIdToken, codePrefix, writes }) => requestJson({
    url: `${baseUrl}:commit`, method: 'POST', firebaseIdToken, codePrefix, body: { writes },
  });

  const catalogWrite = (catalog, updatedByUid) => ({
    update: {
      name: documentName('publicAssetCatalog/main'),
      fields: encodeFields({
        schemaVersion: 2,
        assets: sortCatalogAssets(catalog.assets),
        assetCount: catalog.assets.length,
        fingerprint: catalogFingerprint(catalog.assets),
        updatedByUid: trim(updatedByUid),
        synchronizationMode: 'write-through',
      }),
    },
    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
  });

  const assetFields = (asset) => ({
    id: asset.id,
    category: asset.category,
    assetNo: asset.assetNo,
    assetNoNormalized: lower(asset.assetNo),
    serialNo: asset.serialNo || '',
    model: asset.model || '',
    manufactureDate: asset.manufactureDate || '',
    photo: asset.photo || '',
    note: asset.note || '',
    status: asset.baseStatus === '대여불가' ? '대여불가' : asset.status || '대여가능',
    currentRequestId: asset.currentRequestId ?? null,
    reservations: asset.reservations || [],
  });

  return Object.freeze({
    async verifyAdmin({ firebaseUid, firebaseIdToken }) {
      const uid = trim(firebaseUid);
      const document = await getDocument(`adminAccounts/${encodeURIComponent(uid)}`, firebaseIdToken, 'firestore_asset_admin');
      if (!document) throw createError('admin_account_not_found', 'Firebase admin account was not found.', 403);
      const fields = document.fields || {};
      if (trim(fields.id) !== uid || trim(fields.authUid) !== uid) throw createError('admin_account_identity_mismatch', 'Firebase admin account identity is invalid.', 403);
      return Object.freeze({ uid, adminId: trim(fields.id), name: trim(fields.userName || fields.adminLoginId || fields.authEmail || '관리자'), role: trim(fields.adminRole || 'admin') });
    },

    async listAllAssets({ firebaseIdToken }) {
      const payload = await requestJson({
        url: `${baseUrl}:runQuery`, method: 'POST', firebaseIdToken, codePrefix: 'firestore_assets_list',
        body: { structuredQuery: { from: [{ collectionId: 'rentalAssets' }] } },
      });
      if (!Array.isArray(payload)) throw createError('firestore_assets_list_invalid', 'Firestore asset list response is invalid.', 503);
      return payload.map((entry) => entry?.document).filter(Boolean).map(decodeFirestoreDocument);
    },

    async getPublicConfig({ firebaseIdToken }) {
      return getDocument('rentalSystem/publicConfig', firebaseIdToken, 'firestore_asset_public_config');
    },

    async getAsset({ assetId, firebaseIdToken }) {
      return getDocument(`rentalAssets/${encodeURIComponent(trim(assetId))}`, firebaseIdToken, 'firestore_asset_get');
    },

    async mirrorCreate({ asset, catalog, admin, firebaseIdToken }) {
      const reg = registryId(asset.assetNo);
      return commit({ firebaseIdToken, codePrefix: 'firestore_asset_create_mirror', writes: [
        {
          update: { name: documentName(`rentalAssets/${encodeURIComponent(asset.id)}`), fields: encodeFields(assetFields(asset)) },
          currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        },
        {
          update: { name: documentName(`rentalAssetNumbers/${encodeURIComponent(reg)}`), fields: encodeFields({ id: reg, assetId: asset.id, assetNo: asset.assetNo, assetNoNormalized: lower(asset.assetNo) }) },
          currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        },
        catalogWrite(catalog, admin.uid),
      ] });
    },

    async mirrorEdit({ previousAsset, asset, catalog, assetUpdateTime, admin, firebaseIdToken }) {
      const oldReg = registryId(previousAsset.assetNo); const newReg = registryId(asset.assetNo);
      const writes = [{
        update: { name: documentName(`rentalAssets/${encodeURIComponent(asset.id)}`), fields: encodeFields(assetFields(asset)) },
        updateMask: { fieldPaths: Object.keys(assetFields(asset)) },
        ...(trim(assetUpdateTime) ? { currentDocument: { updateTime: assetUpdateTime } } : {}),
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      }];
      if (oldReg !== newReg) writes.push({ delete: documentName(`rentalAssetNumbers/${encodeURIComponent(oldReg)}`) });
      writes.push({
        update: { name: documentName(`rentalAssetNumbers/${encodeURIComponent(newReg)}`), fields: encodeFields({ id: newReg, assetId: asset.id, assetNo: asset.assetNo, assetNoNormalized: lower(asset.assetNo) }) },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      });
      writes.push(catalogWrite(catalog, admin.uid));
      return commit({ firebaseIdToken, codePrefix: 'firestore_asset_edit_mirror', writes });
    },

    async mirrorDelete({ previousAsset, catalog, assetUpdateTime, admin, firebaseIdToken }) {
      const writes = [
        { delete: documentName(`rentalAssets/${encodeURIComponent(previousAsset.id)}`), ...(trim(assetUpdateTime) ? { currentDocument: { updateTime: assetUpdateTime } } : {}) },
        { delete: documentName(`rentalAssetNumbers/${encodeURIComponent(registryId(previousAsset.assetNo))}`) },
        catalogWrite(catalog, admin.uid),
      ];
      return commit({ firebaseIdToken, codePrefix: 'firestore_asset_delete_mirror', writes });
    },

    async mirrorBulkCreate({ assets, catalog, admin, firebaseIdToken }) {
      const writes = [];
      for (const asset of assets) {
        const reg = registryId(asset.assetNo);
        writes.push({
          update: { name: documentName(`rentalAssets/${encodeURIComponent(asset.id)}`), fields: encodeFields(assetFields(asset)) },
          currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        });
        writes.push({
          update: { name: documentName(`rentalAssetNumbers/${encodeURIComponent(reg)}`), fields: encodeFields({ id: reg, assetId: asset.id, assetNo: asset.assetNo, assetNoNormalized: lower(asset.assetNo) }) },
          currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        });
      }
      writes.push(catalogWrite(catalog, admin.uid));
      return commit({ firebaseIdToken, codePrefix: 'firestore_asset_bulk_mirror', writes });
    },

    async mirrorCategories({ catalog, admin, firebaseIdToken }) {
      const writes = [];
      for (const asset of catalog.assets) {
        writes.push({
          update: { name: documentName(`rentalAssets/${encodeURIComponent(asset.id)}`), fields: encodeFields({ category: asset.category }) },
          updateMask: { fieldPaths: ['category'] },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        });
      }
      writes.push({
        update: { name: documentName('rentalSystem/publicConfig'), fields: encodeFields({ assetCategories: catalog.categories }) },
        updateMask: { fieldPaths: ['assetCategories'] },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      });
      writes.push(catalogWrite(catalog, admin.uid));
      return commit({ firebaseIdToken, codePrefix: 'firestore_asset_categories_mirror', writes });
    },
  });
};
