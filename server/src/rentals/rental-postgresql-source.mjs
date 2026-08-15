const trim = (value) => String(value ?? '').trim();

const serviceError = (code, message, status = 500) => {
  const error = new Error(message);
  error.name = 'RentalPostgresqlSourceError';
  error.code = code;
  error.status = status;
  return error;
};

const asDocument = (path, fields = {}) => Object.freeze({
  name: `postgresql/${path}`,
  fields: Object.freeze({ ...fields }),
  createTime: fields.createdAt || null,
  updateTime: fields.updatedAt || null,
});

export const createRentalPostgresqlSource = ({
  assetRepository,
  siteContentRepository,
  adminRentalRequestRepository,
  rentalRestrictionRepository,
}) => {
  if (!assetRepository || typeof assetRepository.getCatalog !== 'function') throw new TypeError('assetRepository is required.');
  if (!siteContentRepository || typeof siteContentRepository.getDomain !== 'function') throw new TypeError('siteContentRepository is required.');
  if (!adminRentalRequestRepository || typeof adminRentalRequestRepository.getByRequestId !== 'function') throw new TypeError('adminRentalRequestRepository is required.');
  if (!rentalRestrictionRepository || typeof rentalRestrictionRepository.findByFirebaseUid !== 'function') throw new TypeError('rentalRestrictionRepository is required.');

  const getPublicConfig = async () => {
    const domain = await siteContentRepository.getDomain('rental-config');
    const item = domain?.documents?.find((entry) => entry.key === 'rentalSystem/publicConfig');
    if (!item) return null;
    return asDocument('rentalSystem/publicConfig', item.payload || {});
  };

  const getRentalAsset = async ({ assetId }) => {
    const id = trim(assetId);
    if (!id) return null;
    const catalog = await assetRepository.getCatalog(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date()));
    const asset = catalog?.assets?.find((item) => trim(item?.id) === id);
    return asset ? asDocument(`rentalAssets/${id}`, asset) : null;
  };

  const getRentalRequest = async ({ requestId }) => {
    const id = trim(requestId);
    if (!id) return null;
    const request = await adminRentalRequestRepository.getByRequestId(id);
    return request ? asDocument(`rentalRequests/${id}`, request) : null;
  };

  const getRentalRestriction = async ({ firebaseUid }) => {
    const uid = trim(firebaseUid);
    if (!uid) return null;
    const shadow = await rentalRestrictionRepository.findByFirebaseUid(uid);
    if (!shadow?.exists) return null;
    return asDocument(`postgresql/app_rental_restrictions/${uid}`, shadow.restriction || {});
  };

  return Object.freeze({
    getPublicConfig,
    getRentalAsset,
    getRentalRequest,
    getRentalRestriction,
    async assertReady() {
      const config = await getPublicConfig();
      if (!config) throw serviceError('rental_postgresql_config_missing', 'PostgreSQL rental configuration has not been synchronized.', 503);
      return true;
    },
  });
};
