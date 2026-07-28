import {
  RENTAL_BLOCKING_REQUEST_STATUSES,
  STATUS,
} from '../constants/appConstants.js';
import { getLaptopRepresentativeRequest } from '../domain/rentalPolicy.js';

export function toRentalAvailabilityRequest(request = {}) {
  return {
    id: request.id || '',
    laptopId: request.laptopId || '',
    assetCategory: request.assetCategory || '기기',
    assetNo: request.assetNo || '',
    startDate: request.startDate || '',
    dueDate: request.dueDate || '',
    status: request.status || STATUS.REQUESTED,
  };
}

export const normalizeAssetReservations = (reservations = []) =>
  (Array.isArray(reservations) ? reservations : [])
    .filter(
      (request) =>
        request?.id &&
        request?.laptopId &&
        RENTAL_BLOCKING_REQUEST_STATUSES.includes(request.status)
    )
    .map((request) => toRentalAvailabilityRequest(request));

export const PUBLIC_ASSET_CATALOG_SCHEMA_VERSION = 1;
export const PUBLIC_ASSET_CATALOG_MAX_ASSETS = 200;
export const PUBLIC_ASSET_CATALOG_MAX_BYTES = 900000;

export const toPublicCatalogAsset = (asset = {}) => ({
  id: String(asset.id || '').trim(),
  category: String(asset.category || '').trim(),
  assetNo: String(asset.assetNo || '').trim(),
  serialNo: String(asset.serialNo || '').trim(),
  model: String(asset.model || '').trim(),
  manufactureDate: String(asset.manufactureDate || '').trim(),
  photo: String(asset.photo || '').trim(),
  note: String(asset.note || '').trim(),
  baseStatus:
    asset.baseStatus === STATUS.UNAVAILABLE ||
    asset.status === STATUS.UNAVAILABLE
      ? STATUS.UNAVAILABLE
      : STATUS.AVAILABLE,
});

export const normalizePublicCatalogAssets = (assets = []) =>
  (Array.isArray(assets) ? assets : [])
    .map((asset) => toPublicCatalogAsset(asset))
    .filter((asset) => asset.id && asset.assetNo)
    .slice(0, PUBLIC_ASSET_CATALOG_MAX_ASSETS);

export const getPublicCatalogFingerprint = (assets = []) =>
  JSON.stringify(normalizePublicCatalogAssets(assets));

export const getPublicCatalogPayloadByteLength = (assets = []) => {
  const serialized = JSON.stringify({
    schemaVersion: PUBLIC_ASSET_CATALOG_SCHEMA_VERSION,
    assets: normalizePublicCatalogAssets(assets),
  });

  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(serialized).length;
  }

  return serialized.length * 2;
};

export const hydratePublicCatalogAssets = (catalogAssets = [], availability = []) => {
  const requestsByLaptopId = new Map();

  normalizeAssetReservations(availability).forEach((request) => {
    const current = requestsByLaptopId.get(request.laptopId) || [];
    current.push(request);
    requestsByLaptopId.set(request.laptopId, current);
  });

  return normalizePublicCatalogAssets(catalogAssets).map((asset) => {
    const reservations = requestsByLaptopId.get(asset.id) || [];
    const representativeRequest = getLaptopRepresentativeRequest(
      reservations,
      asset.id
    );

    return {
      ...asset,
      reservations,
      status:
        asset.baseStatus === STATUS.UNAVAILABLE
          ? STATUS.UNAVAILABLE
          : representativeRequest
            ? representativeRequest.status
            : STATUS.AVAILABLE,
      currentRequestId: representativeRequest?.id || null,
    };
  });
};
