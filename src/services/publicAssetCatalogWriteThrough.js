import {
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from '../platform/retiredLegacyDataCompat.js';

import {
  PUBLIC_ASSET_CATALOG_DOC_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  db,
} from '../platform/appDataRefs.js';
import {
  PUBLIC_ASSET_CATALOG_MAX_ASSETS,
  PUBLIC_ASSET_CATALOG_MAX_BYTES,
  PUBLIC_ASSET_CATALOG_SCHEMA_VERSION,
  getPublicCatalogFingerprint,
  getPublicCatalogPayloadByteLength,
  toPublicCatalogAsset,
} from './publicAssetCatalog.js';

const sanitizeCatalogAssets = (assets = []) =>
  (Array.isArray(assets) ? assets : [])
    .map((asset) => toPublicCatalogAsset(asset))
    .filter((asset) => asset.id && asset.assetNo);

const sortCatalogAssets = (assets = []) =>
  [...assets].sort((first, second) =>
    String(first.id || '').localeCompare(String(second.id || ''), 'ko-KR', {
      numeric: true,
      sensitivity: 'base',
    })
  );

const createCatalogError = (code, details = {}) => {
  const error = new Error(code);
  Object.assign(error, details);
  return error;
};

export const createPublicAssetCatalogPayload = (
  assets,
  {
    updatedByUid = '',
    updatedAt = serverTimestamp(),
  } = {}
) => {
  const normalizedAssets = sortCatalogAssets(sanitizeCatalogAssets(assets));

  if (normalizedAssets.length > PUBLIC_ASSET_CATALOG_MAX_ASSETS) {
    throw createCatalogError('public-catalog-asset-limit-exceeded', {
      assetCount: normalizedAssets.length,
      maximumAssetCount: PUBLIC_ASSET_CATALOG_MAX_ASSETS,
    });
  }

  const payloadByteLength = getPublicCatalogPayloadByteLength(normalizedAssets);

  if (payloadByteLength > PUBLIC_ASSET_CATALOG_MAX_BYTES) {
    throw createCatalogError('public-catalog-byte-limit-exceeded', {
      payloadByteLength,
      maximumPayloadByteLength: PUBLIC_ASSET_CATALOG_MAX_BYTES,
    });
  }

  return {
    schemaVersion: PUBLIC_ASSET_CATALOG_SCHEMA_VERSION,
    assets: normalizedAssets,
    assetCount: normalizedAssets.length,
    fingerprint: getPublicCatalogFingerprint(normalizedAssets),
    updatedAt,
    updatedByUid: String(updatedByUid || ''),
    synchronizationMode: 'write-through',
  };
};

export const applyPublicAssetCatalogMutation = ({
  currentAssets = [],
  fallbackAssets = [],
  upsertAssets = [],
  removeAssetIds = [],
} = {}) => {
  const sourceAssets = Array.isArray(currentAssets)
    ? currentAssets
    : fallbackAssets;

  const assetMap = new Map(
    sanitizeCatalogAssets(sourceAssets).map((asset) => [asset.id, asset])
  );

  (Array.isArray(removeAssetIds) ? removeAssetIds : []).forEach((assetId) => {
    const normalizedId = String(assetId || '').trim();
    if (normalizedId) assetMap.delete(normalizedId);
  });

  sanitizeCatalogAssets(upsertAssets).forEach((asset) => {
    assetMap.set(asset.id, asset);
  });

  return sortCatalogAssets(Array.from(assetMap.values()));
};

export const writePublicAssetCatalogMutationInTransaction = async (
  transaction,
  {
    fallbackAssets = [],
    upsertAssets = [],
    removeAssetIds = [],
    updatedByUid = '',
  } = {}
) => {
  const catalogSnapshot = await transaction.get(PUBLIC_ASSET_CATALOG_DOC_REF);
  const catalogData = catalogSnapshot.exists()
    ? catalogSnapshot.data()
    : null;
  const hasUsableCatalog =
    catalogSnapshot.exists() &&
    Number(catalogData?.schemaVersion || 0) ===
      PUBLIC_ASSET_CATALOG_SCHEMA_VERSION &&
    catalogData?.synchronizationMode === 'write-through' &&
    Array.isArray(catalogData?.assets);

  const nextAssets = applyPublicAssetCatalogMutation({
    currentAssets: hasUsableCatalog
      ? catalogData.assets
      : null,
    fallbackAssets,
    upsertAssets,
    removeAssetIds,
  });

  const payload = createPublicAssetCatalogPayload(nextAssets, {
    updatedByUid,
  });

  transaction.set(PUBLIC_ASSET_CATALOG_DOC_REF, payload, { merge: false });

  return payload;
};

export const rebuildPublicAssetCatalogFromServer = async ({
  updatedByUid = '',
} = {}) => {
  const assetSnapshot = await getDocs(RENTAL_ASSETS_COLLECTION_REF);
  const assets = assetSnapshot.docs.map((assetDocument) => ({
    ...assetDocument.data(),
    id: assetDocument.id,
  }));
  const payload = createPublicAssetCatalogPayload(assets, {
    updatedByUid,
  });

  await setDoc(PUBLIC_ASSET_CATALOG_DOC_REF, payload, { merge: false });

  return payload;
};

export const getPublicAssetCatalogWriteErrorMessage = (error) => {
  if (error?.message === 'public-catalog-asset-limit-exceeded') {
    return `공개 자산 카탈로그는 최대 ${error.maximumAssetCount || PUBLIC_ASSET_CATALOG_MAX_ASSETS}대까지 저장할 수 있습니다. 현재 반영 예정 자산은 ${error.assetCount || 0}대입니다.`;
  }

  if (error?.message === 'public-catalog-byte-limit-exceeded') {
    return '자산 사진 URL이나 메모를 포함한 공개 카탈로그 크기가 안전 한도를 초과했습니다. 자산 메모와 URL 길이를 줄인 뒤 다시 시도해 주세요.';
  }

  return '';
};

export const ensurePublicAssetCatalogWriteThrough = async ({
  updatedByUid = '',
} = {}) => {
  const initialCatalogSnapshot = await getDoc(PUBLIC_ASSET_CATALOG_DOC_REF);
  const initialCatalogData = initialCatalogSnapshot.exists()
    ? initialCatalogSnapshot.data()
    : null;
  const isCurrentCatalog =
    initialCatalogSnapshot.exists() &&
    Number(initialCatalogData?.schemaVersion || 0) ===
      PUBLIC_ASSET_CATALOG_SCHEMA_VERSION &&
    initialCatalogData?.synchronizationMode === 'write-through' &&
    Array.isArray(initialCatalogData?.assets) &&
    Number(initialCatalogData?.assetCount || 0) ===
      initialCatalogData.assets.length;

  if (isCurrentCatalog) {
    return {
      rebuilt: false,
      assetCount: initialCatalogData.assets.length,
      fingerprint: String(initialCatalogData.fingerprint || ''),
    };
  }

  const assetSnapshot = await getDocs(RENTAL_ASSETS_COLLECTION_REF);
  const fallbackAssets = assetSnapshot.docs.map((assetDocument) => ({
    ...assetDocument.data(),
    id: assetDocument.id,
  }));

  return runTransaction(db, async (transaction) => {
    const latestCatalogSnapshot =
      await transaction.get(PUBLIC_ASSET_CATALOG_DOC_REF);
    const latestCatalogData = latestCatalogSnapshot.exists()
      ? latestCatalogSnapshot.data()
      : null;
    const alreadyMigrated =
      latestCatalogSnapshot.exists() &&
      Number(latestCatalogData?.schemaVersion || 0) ===
        PUBLIC_ASSET_CATALOG_SCHEMA_VERSION &&
      latestCatalogData?.synchronizationMode === 'write-through' &&
      Array.isArray(latestCatalogData?.assets) &&
      Number(latestCatalogData?.assetCount || 0) ===
        latestCatalogData.assets.length;

    if (alreadyMigrated) {
      return {
        rebuilt: false,
        assetCount: latestCatalogData.assets.length,
        fingerprint: String(latestCatalogData.fingerprint || ''),
      };
    }

    const payload = createPublicAssetCatalogPayload(fallbackAssets, {
      updatedByUid,
    });

    transaction.set(PUBLIC_ASSET_CATALOG_DOC_REF, payload, {
      merge: false,
    });

    return {
      rebuilt: true,
      assetCount: payload.assetCount,
      fingerprint: payload.fingerprint,
    };
  });
};
