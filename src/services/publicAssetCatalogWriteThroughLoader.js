let publicAssetCatalogWriteThroughServicePromise = null;

/**
 * 사용자 최초 진입 시 관리자 전용 자산 쓰기 서비스를 내려받지 않는다.
 * 최초 관리자 카탈로그 점검 또는 자산 쓰기 작업에서 한 번만 로드하고
 * 이후에는 동일한 모듈 Promise를 재사용한다.
 */
export const loadPublicAssetCatalogWriteThroughService = () => {
  if (!publicAssetCatalogWriteThroughServicePromise) {
    publicAssetCatalogWriteThroughServicePromise = import(
      './publicAssetCatalogWriteThrough.js'
    ).catch((error) => {
      publicAssetCatalogWriteThroughServicePromise = null;
      throw error;
    });
  }

  return publicAssetCatalogWriteThroughServicePromise;
};

export const createPublicAssetCatalogPayload = async (...args) => {
  const service = await loadPublicAssetCatalogWriteThroughService();
  return service.createPublicAssetCatalogPayload(...args);
};

export const ensurePublicAssetCatalogWriteThrough = async (...args) => {
  const service = await loadPublicAssetCatalogWriteThroughService();
  return service.ensurePublicAssetCatalogWriteThrough(...args);
};

export const getPublicAssetCatalogWriteErrorMessage = async (...args) => {
  try {
    const service = await loadPublicAssetCatalogWriteThroughService();
    return service.getPublicAssetCatalogWriteErrorMessage(...args);
  } catch (error) {
    console.error('Public asset catalog error helper load error:', error);
    return '';
  }
};

export const rebuildPublicAssetCatalogFromServer = async (...args) => {
  const service = await loadPublicAssetCatalogWriteThroughService();
  return service.rebuildPublicAssetCatalogFromServer(...args);
};

export const writePublicAssetCatalogMutationInTransaction = async (...args) => {
  const service = await loadPublicAssetCatalogWriteThroughService();
  return service.writePublicAssetCatalogMutationInTransaction(...args);
};

export default loadPublicAssetCatalogWriteThroughService;
