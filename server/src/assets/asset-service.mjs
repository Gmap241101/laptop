import { createHash, randomUUID } from 'node:crypto';

const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const serviceError = (code, message, status = 400, details = {}) => {
  const error = new Error(message);
  error.name = 'AssetServiceError';
  error.code = code;
  error.status = status;
  Object.assign(error, details);
  return error;
};

const koreaToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const read = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${read('year')}-${read('month')}-${read('day')}`;
};

const normalizeFirestoreAsset = (document) => {
  const fields = document?.fields || {};
  const id = trim(fields.id) || decodeURIComponent(trim(document?.name).split('/').at(-1) || '');
  const assetNo = trim(fields.assetNo);
  const category = trim(fields.category || '노트북');
  if (!id || !assetNo || !category) return null;
  return Object.freeze({
    id,
    category,
    assetNo,
    serialNo: trim(fields.serialNo),
    model: trim(fields.model),
    manufactureDate: trim(fields.manufactureDate),
    photo: trim(fields.photo),
    note: trim(fields.note),
    baseStatus: trim(fields.status) === '대여불가' || trim(fields.baseStatus) === '대여불가' ? '대여불가' : '대여가능',
    createdAt: fields.createdAt || document?.createTime || null,
    updatedAt: fields.updatedAt || document?.updateTime || null,
    sourceUpdateTime: trim(document?.updateTime),
  });
};

const baseAssetPayload = (input = {}) => {
  const assetNo = trim(input.assetNo);
  const category = trim(input.category);
  if (!assetNo) throw serviceError('asset_number_required', 'Asset number is required.');
  if (!category) throw serviceError('asset_category_required', 'Asset category is required.');
  const manufactureDate = trim(input.manufactureDate);
  if (manufactureDate && !DATE_RE.test(manufactureDate)) throw serviceError('asset_manufacture_date_invalid', 'Manufacture date must be YYYY-MM-DD.');
  return Object.freeze({
    category,
    assetNo,
    serialNo: trim(input.serialNo),
    model: trim(input.model),
    manufactureDate,
    photo: trim(input.photo),
    note: trim(input.note),
    baseStatus: input.baseStatus === '대여불가' || input.status === '대여불가' ? '대여불가' : '대여가능',
  });
};

const sanitizeCatalog = (catalog) => {
  const assets = (catalog?.assets || []).map((asset) => ({
    id: asset.id, category: asset.category, assetNo: asset.assetNo,
    assetNoNormalized: lower(asset.assetNo), serialNo: asset.serialNo || '', model: asset.model || '',
    manufactureDate: asset.manufactureDate || '', photo: asset.photo || '', note: asset.note || '',
    baseStatus: asset.baseStatus === '대여불가' ? '대여불가' : '대여가능',
    status: asset.status || '대여가능', currentRequestId: asset.currentRequestId ?? null,
    reservations: asset.reservations || [],
  }));
  const metrics = {
    totalAssetCount: assets.length,
    availableCount: assets.filter((asset) => asset.baseStatus !== '대여불가' && !(asset.reservations || []).length).length,
    unavailableCount: assets.filter((asset) => asset.baseStatus === '대여불가').length,
    reservedOrRentedCount: assets.filter((asset) => (asset.reservations || []).length > 0).length,
  };
  return Object.freeze({
    source: 'postgresql', authoritative: true,
    categories: [...(catalog?.categories || [])], assets,
    availability: [...(catalog?.availability || [])], metrics,
    synchronized: Boolean(catalog?.sync), sync: catalog?.sync || null,
  });
};

const mapRepositoryError = (error) => {
  const mappings = {
    duplicate_asset_number: ['duplicate-asset-number', 'Asset number already exists.', 409],
    asset_category_not_found: ['asset-category-not-found', 'Asset category was not found.', 409],
    asset_not_found: ['laptop-not-found', 'Asset was not found.', 404],
    active_rental_exists: ['active-rental-exists', 'Active rental exists.', 409],
    active_rental_identity_change: ['active-rental-identity-change', 'Active rental blocks identity changes.', 409],
    active_rental_category_rename: ['active-rental-category-rename', 'Active rental blocks category rename.', 409],
    asset_category_still_in_use: ['asset-category-still-in-use', 'Asset category is still in use.', 409],
    duplicate_asset_category: ['duplicate-asset-category', 'Duplicate asset category.', 409],
    asset_catalog_limit_exceeded: ['public-catalog-asset-limit-exceeded', 'Asset catalog limit exceeded.', 409],
    asset_bulk_no_valid_assets: ['asset-bulk-no-valid-assets', 'No valid assets were available.', 409],
  };
  const mapped = mappings[error?.code];
  if (!mapped) throw error;
  throw serviceError(mapped[0], mapped[1], mapped[2], {
    assetNo: error?.assetNo || '', category: error?.category || '', blockingRequest: error?.blockingRequest || null,
    duplicateAssetNumbers: error?.duplicateAssetNumbers || [], invalidCategories: error?.invalidCategories || [],
  });
};

export const createAssetService = ({ repository, firestoreClient, writeMirrorEnabled = true }) => {
  if (!repository || !firestoreClient) throw new TypeError('Asset repository and Firestore client are required.');
  const mirrorEnabled = Boolean(writeMirrorEnabled);
  const mirrorStatus = mirrorEnabled ? 'synced' : 'retired';
  const noMirror = async () => Object.freeze({ retired: true, source: 'postgresql-only' });

  const verifyAdmin = async (firebaseIdentity) => firestoreClient.verifyAdmin({
    firebaseUid: firebaseIdentity.uid,
    firebaseIdToken: firebaseIdentity.idToken,
  });

  const getCatalog = async () => {
    const catalog = await repository.getCatalog(koreaToday());
    if (!catalog.sync) throw serviceError('asset_catalog_not_bootstrapped', 'PostgreSQL asset catalog is not bootstrapped.', 503);
    return sanitizeCatalog(catalog);
  };

  return Object.freeze({
    async getPublicCatalog() {
      return getCatalog();
    },

    async bootstrap(firebaseIdentity) {
      const admin = await verifyAdmin(firebaseIdentity);
      const [assetDocuments, configDocument] = await Promise.all([
        firestoreClient.listAllAssets({ firebaseIdToken: firebaseIdentity.idToken }),
        firestoreClient.getPublicConfig({ firebaseIdToken: firebaseIdentity.idToken }),
      ]);
      if (!configDocument) throw serviceError('public-config-not-found', 'Firestore public config was not found.', 409);
      const categories = [...new Set((configDocument.fields?.assetCategories || []).map(trim).filter(Boolean))];
      const assets = assetDocuments.map(normalizeFirestoreAsset).filter(Boolean);
      const missingCategories = assets.map((asset) => asset.category).filter((category) => !categories.includes(category));
      missingCategories.forEach((category) => categories.push(category));
      const sourceHash = createHash('sha256').update(JSON.stringify({ categories, assets: assets.map(({ sourceUpdateTime, ...asset }) => asset) })).digest('hex');
      const result = await repository.bootstrap({ categories, assets, sourceHash });
      const catalog = sanitizeCatalog(await repository.getCatalog(koreaToday()));
      return Object.freeze({ admin, target: 'postgresql', ...result, catalog });
    },

    async create(firebaseIdentity, input) {
      const admin = await verifyAdmin(firebaseIdentity);
      const draft = baseAssetPayload(input);
      const asset = Object.freeze({ id: `NB-${randomUUID().replaceAll('-', '')}`, ...draft });
      try {
        const result = await repository.createAuthoritative({
          asset, referenceDate: koreaToday(),
          beforeCommit: mirrorEnabled
            ? ({ asset: committedAsset, catalog }) => firestoreClient.mirrorCreate({ asset: committedAsset, catalog, admin, firebaseIdToken: firebaseIdentity.idToken })
            : noMirror,
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: mirrorStatus, asset: result.asset, catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },

    async edit(firebaseIdentity, assetId, input) {
      const admin = await verifyAdmin(firebaseIdentity);
      const patch = baseAssetPayload(input);
      const source = mirrorEnabled
        ? await firestoreClient.getAsset({ assetId, firebaseIdToken: firebaseIdentity.idToken })
        : null;
      if (mirrorEnabled && !source) throw serviceError('laptop-not-found', 'Asset was not found in Firestore compatibility storage.', 404);
      try {
        const result = await repository.editAuthoritative({
          assetId: trim(assetId), patch, referenceDate: koreaToday(),
          beforeCommit: mirrorEnabled
            ? ({ previousAsset, asset, catalog }) => firestoreClient.mirrorEdit({ previousAsset, asset, catalog, assetUpdateTime: source.updateTime, admin, firebaseIdToken: firebaseIdentity.idToken })
            : noMirror,
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: mirrorStatus, asset: result.asset, catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },

    async delete(firebaseIdentity, assetId) {
      const admin = await verifyAdmin(firebaseIdentity);
      const source = mirrorEnabled
        ? await firestoreClient.getAsset({ assetId, firebaseIdToken: firebaseIdentity.idToken })
        : null;
      if (mirrorEnabled && !source) throw serviceError('laptop-not-found', 'Asset was not found in Firestore compatibility storage.', 404);
      try {
        const result = await repository.deleteAuthoritative({
          assetId: trim(assetId), referenceDate: koreaToday(),
          beforeCommit: mirrorEnabled
            ? ({ previousAsset, catalog }) => firestoreClient.mirrorDelete({ previousAsset, catalog, assetUpdateTime: source.updateTime, admin, firebaseIdToken: firebaseIdentity.idToken })
            : noMirror,
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: mirrorStatus, deletedAsset: result.deletedAsset, catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },

    async bulkCreate(firebaseIdentity, inputs) {
      const admin = await verifyAdmin(firebaseIdentity);
      const drafts = (Array.isArray(inputs) ? inputs : []).slice(0, 200).map((input) => ({ id: `NB-UP-${randomUUID().replaceAll('-', '')}`, ...baseAssetPayload(input) }));
      if (!drafts.length) throw serviceError('asset-bulk-empty', 'Bulk asset list is empty.', 400);
      try {
        const result = await repository.bulkCreateAuthoritative({
          assets: drafts, referenceDate: koreaToday(),
          beforeCommit: mirrorEnabled
            ? ({ assets, catalog }) => firestoreClient.mirrorBulkCreate({ assets, catalog, admin, firebaseIdToken: firebaseIdentity.idToken })
            : noMirror,
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: mirrorStatus, assets: result.assets, duplicateAssetNumbers: result.duplicateAssetNumbers, invalidCategories: result.invalidCategories, catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },

    async saveCategories(firebaseIdentity, input) {
      const admin = await verifyAdmin(firebaseIdentity);
      const categories = (input?.categories || []).map(trim).filter(Boolean);
      if (!categories.length) throw serviceError('asset-categories-empty', 'At least one asset category is required.', 400);
      try {
        const result = await repository.saveCategoriesAuthoritative({
          categories, renameMap: input?.renameMap || {}, referenceDate: koreaToday(),
          beforeCommit: mirrorEnabled
            ? ({ catalog }) => firestoreClient.mirrorCategories({ catalog, admin, firebaseIdToken: firebaseIdentity.idToken })
            : noMirror,
        });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: mirrorStatus, catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },
  });
};
