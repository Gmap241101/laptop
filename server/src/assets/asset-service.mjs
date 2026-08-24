import { randomUUID } from 'node:crypto';

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

export const createAssetService = ({ repository }) => {
  if (!repository) throw new TypeError('Asset repository is required.');

  const verifyAdmin = async (identity) => {
    if (identity?.source !== 'clerk-postgresql') throw serviceError('admin_postgresql_identity_required', 'Clerk/PostgreSQL administrator identity is required.', 401);
    return Object.freeze({ uid: identity.uid, role: 'admin', source: 'postgresql-admin-registry' });
  };

  const getCatalog = async () => {
    const catalog = await repository.getCatalog(koreaToday());
    if (!catalog.sync) throw serviceError('asset_catalog_not_bootstrapped', 'PostgreSQL asset catalog is not bootstrapped.', 503);
    return sanitizeCatalog(catalog);
  };


  return Object.freeze({
    async getPublicCatalog() {
      return getCatalog();
    },

    async getCategories(adminIdentity) {
      const admin = await verifyAdmin(adminIdentity);
      const categoryCatalog = await repository.getCategoryCatalog();
      return Object.freeze({
        admin,
        authority: 'postgresql',
        categories: categoryCatalog.categories || [],
        items: categoryCatalog.items || [],
      });
    },

    async bootstrap(adminIdentity) {
      const admin = await verifyAdmin(adminIdentity);
      const catalog = await getCatalog();
      return Object.freeze({ admin, target: 'postgresql', source: 'postgresql-existing', skipped: true, assetCount: catalog.assets.length, categoryCount: catalog.categories.length, catalog });
    },

    async create(adminIdentity, input) {
      const admin = await verifyAdmin(adminIdentity);
      const draft = baseAssetPayload(input);
      const asset = Object.freeze({ id: `NB-${randomUUID().replaceAll('-', '')}`, ...draft });
      try {
        const result = await repository.createAuthoritative({ asset, referenceDate: koreaToday() });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', asset: result.asset, catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },

    async edit(adminIdentity, assetId, input) {
      const admin = await verifyAdmin(adminIdentity);
      const patch = baseAssetPayload(input);
      try {
        const result = await repository.editAuthoritative({ assetId: trim(assetId), patch, referenceDate: koreaToday() });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', asset: result.asset, catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },

    async delete(adminIdentity, assetId) {
      const admin = await verifyAdmin(adminIdentity);
      try {
        const result = await repository.deleteAuthoritative({ assetId: trim(assetId), referenceDate: koreaToday() });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', deletedAsset: result.deletedAsset, catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },

    async bulkCreate(adminIdentity, inputs) {
      const admin = await verifyAdmin(adminIdentity);
      const drafts = (Array.isArray(inputs) ? inputs : []).slice(0, 200).map((input) => ({ id: `NB-UP-${randomUUID().replaceAll('-', '')}`, ...baseAssetPayload(input) }));
      if (!drafts.length) throw serviceError('asset-bulk-empty', 'Bulk asset list is empty.', 400);
      try {
        const result = await repository.bulkCreateAuthoritative({ assets: drafts, referenceDate: koreaToday() });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', assets: result.assets, duplicateAssetNumbers: result.duplicateAssetNumbers, invalidCategories: result.invalidCategories, catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },

    async saveCategories(adminIdentity, input) {
      const admin = await verifyAdmin(adminIdentity);
      const categories = (input?.categories || []).map(trim).filter(Boolean);
      if (!categories.length) throw serviceError('asset-categories-empty', 'At least one asset category is required.', 400);
      try {
        const result = await repository.saveCategoriesAuthoritative({ categories, renameMap: input?.renameMap || {}, referenceDate: koreaToday() });
        return Object.freeze({ admin, authority: 'postgresql', firestoreMirror: 'retired', catalog: sanitizeCatalog(result.catalog) });
      } catch (error) { return mapRepositoryError(error); }
    },
  });
};
