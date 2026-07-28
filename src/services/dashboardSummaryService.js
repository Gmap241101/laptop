import {
  getCountFromServer,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import {
  ADMIN_REQUEST_TAB,
  STATUS,
  USER_REQUEST_REVIEW_STATUS,
} from '../constants/appConstants.js';
import { USER_PROFILE_STATUS } from '../constants/memberConstants.js';
import {
  DASHBOARD_SUMMARY_DOC_REF,
  PUBLIC_ASSET_CATALOG_DOC_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  USER_ACCOUNTS_COLLECTION_REF,
} from '../firebase.js';
import {
  getFirestoreTimestampMillis,
  today,
} from '../utils/appUtils.js';
import {
  PUBLIC_ASSET_CATALOG_MAX_BYTES,
  PUBLIC_ASSET_CATALOG_SCHEMA_VERSION,
  getPublicCatalogFingerprint,
  getPublicCatalogPayloadByteLength,
  normalizePublicCatalogAssets,
} from './publicAssetCatalog.js';

export const ADMIN_DASHBOARD_ACTIVE_REQUEST_LIMIT = 100;
export const DASHBOARD_SUMMARY_SCHEMA_VERSION = 1;
// 대시보드 진입 시에만 오래된 요약을 갱신하며, 열린 화면에서는 주기적으로 폴링하지 않는다.
export const DASHBOARD_SUMMARY_ENTRY_REFRESH_AGE_MS = 15 * 60 * 1000;
export const DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT = 12;

const compactDefinedFields = (value = {}) =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );

const toDashboardRequestSummary = (request = {}) =>
  compactDefinedFields({
    id: request.id,
    status: request.status,
    laptopId: request.laptopId,
    assetNo: request.assetNo,
    assetCategory: request.assetCategory,
    startDate: request.startDate,
    dueDate: request.dueDate,
    requesterUid: request.requesterUid,
    requesterName: request.requesterName,
    requesterEmail: request.requesterEmail,
    requesterTeam: request.requesterTeam,
    borrower: request.borrower,
    team: request.team,
    createdAt: request.createdAt,
    requestedAt: request.requestedAt,
    updatedAt: request.updatedAt,
    userActionRequest: request.userActionRequest
      ? compactDefinedFields({
          type: request.userActionRequest.type,
          status: request.userActionRequest.status,
          requestedAt: request.userActionRequest.requestedAt,
        })
      : undefined,
  });

const toDashboardAccountSummary = (account = {}) =>
  compactDefinedFields({
    id: account.id || account.uid,
    uid: account.uid || account.id,
    name: account.name,
    email: account.email,
    team: account.team,
    status: account.status,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  });

export const getDashboardSummaryGeneratedAtMillis = (summary = {}) =>
  Number(summary.generatedAtClientMs || 0) ||
  getFirestoreTimestampMillis(summary.generatedAt);

export const normalizeDashboardSummary = (summary = {}) => ({
  ...summary,
  schemaVersion: Number(summary.schemaVersion || 0),
  activeRequests: Array.isArray(summary.activeRequests)
    ? summary.activeRequests
    : [],
  pendingAccounts: Array.isArray(summary.pendingAccounts)
    ? summary.pendingAccounts
    : [],
  metrics:
    summary.metrics && typeof summary.metrics === 'object'
      ? summary.metrics
      : {},
  requestTabCounts:
    summary.requestTabCounts && typeof summary.requestTabCounts === 'object'
      ? summary.requestTabCounts
      : {},
  dataIssueCounts:
    summary.dataIssueCounts && typeof summary.dataIssueCounts === 'object'
      ? summary.dataIssueCounts
      : {},
});

export const refreshDashboardSummaryDocument = async ({ adminUid }) => {
  if (!adminUid) {
    throw new Error('dashboard-summary/admin-uid-required');
  }

  const referenceDate = today();
  const activeRequestSource = firestoreQuery(
    RENTAL_REQUESTS_COLLECTION_REF,
    where('status', 'in', [
      STATUS.REQUESTED,
      STATUS.ON_HOLD,
      STATUS.APPROVED,
    ]),
    orderBy('createdAt', 'desc'),
    firestoreLimit(ADMIN_DASHBOARD_ACTIVE_REQUEST_LIMIT)
  );
  const pendingAccountSource = firestoreQuery(
    USER_ACCOUNTS_COLLECTION_REF,
    where('status', '==', USER_PROFILE_STATUS.PENDING),
    orderBy('createdAt', 'asc'),
    firestoreLimit(DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT)
  );

  const [
    activeRequestSnapshot,
    pendingAccountSnapshot,
    publicCatalogSnapshot,
    requestedCountSnapshot,
    onHoldCountSnapshot,
    approvedCountSnapshot,
    closedCountSnapshot,
    returnedCountSnapshot,
    pendingUserActionCountSnapshot,
    overdueCountSnapshot,
    dueTodayCountSnapshot,
    startTodayCountSnapshot,
    pendingAccountCountSnapshot,
  ] = await Promise.all([
    getDocs(activeRequestSource),
    getDocs(pendingAccountSource),
    getDoc(PUBLIC_ASSET_CATALOG_DOC_REF),
    getCountFromServer(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('status', '==', STATUS.REQUESTED)
      )
    ),
    getCountFromServer(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('status', '==', STATUS.ON_HOLD)
      )
    ),
    getCountFromServer(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('status', '==', STATUS.APPROVED)
      )
    ),
    getCountFromServer(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('status', 'in', [STATUS.DENIED, STATUS.USER_CANCELLED])
      )
    ),
    getCountFromServer(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('status', '==', STATUS.RETURNED)
      )
    ),
    getCountFromServer(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where(
          'userActionRequest.status',
          '==',
          USER_REQUEST_REVIEW_STATUS.PENDING
        )
      )
    ),
    getCountFromServer(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('status', '==', STATUS.APPROVED),
        where('dueDate', '<', referenceDate)
      )
    ),
    getCountFromServer(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('status', '==', STATUS.APPROVED),
        where('dueDate', '==', referenceDate)
      )
    ),
    getCountFromServer(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('status', '==', STATUS.APPROVED),
        where('startDate', '==', referenceDate)
      )
    ),
    getCountFromServer(
      firestoreQuery(
        USER_ACCOUNTS_COLLECTION_REF,
        where('status', '==', USER_PROFILE_STATUS.PENDING)
      )
    ),
  ]);

  const activeRequests = activeRequestSnapshot.docs.map((requestDoc) =>
    toDashboardRequestSummary({
      ...requestDoc.data(),
      id: requestDoc.id,
    })
  );
  const pendingAccounts = pendingAccountSnapshot.docs.map((accountDoc) =>
    toDashboardAccountSummary({
      ...accountDoc.data(),
      id: accountDoc.id,
      uid: accountDoc.data().uid || accountDoc.id,
    })
  );

  const shouldRepairPublicCatalog =
    !publicCatalogSnapshot.exists() ||
    !Array.isArray(publicCatalogSnapshot.data()?.assets);
  let catalogAssets = publicCatalogSnapshot.exists()
    ? normalizePublicCatalogAssets(publicCatalogSnapshot.data().assets || [])
    : [];

  if (!catalogAssets.length) {
    const legacyAssetSnapshot = await getDocs(RENTAL_ASSETS_COLLECTION_REF);
    catalogAssets = normalizePublicCatalogAssets(
      legacyAssetSnapshot.docs.map((assetDoc) => ({
        ...assetDoc.data(),
        id: assetDoc.id,
      }))
    );
  }

  if (
    shouldRepairPublicCatalog &&
    catalogAssets.length > 0 &&
    getPublicCatalogPayloadByteLength(catalogAssets) <=
      PUBLIC_ASSET_CATALOG_MAX_BYTES
  ) {
    await setDoc(
      PUBLIC_ASSET_CATALOG_DOC_REF,
      {
        schemaVersion: PUBLIC_ASSET_CATALOG_SCHEMA_VERSION,
        assets: catalogAssets,
        assetCount: catalogAssets.length,
        fingerprint: getPublicCatalogFingerprint(catalogAssets),
        updatedAt: serverTimestamp(),
        updatedByUid: adminUid,
      },
      { merge: false }
    );
  }

  const approvedRequests = activeRequests.filter(
    (request) => request.status === STATUS.APPROVED
  );
  const reservedRequests = approvedRequests.filter(
    (request) => Boolean(request.startDate) && request.startDate > referenceDate
  );
  const activeRentalRequests = approvedRequests.filter(
    (request) => !request.startDate || request.startDate <= referenceDate
  );
  const overdueRequests = approvedRequests.filter(
    (request) =>
      (!request.startDate || request.startDate <= referenceDate) &&
      Boolean(request.dueDate) &&
      request.dueDate < referenceDate
  );
  const blockedAssetIds = new Set(
    activeRequests.map((request) => request.laptopId).filter(Boolean)
  );
  const unavailableAssetIds = new Set(
    catalogAssets
      .filter((asset) => asset.baseStatus === STATUS.UNAVAILABLE)
      .map((asset) => asset.id)
      .filter(Boolean)
  );
  const assetIdSet = new Set(
    catalogAssets.map((asset) => asset.id).filter(Boolean)
  );
  const requestIdentity = (request = {}) =>
    request.requesterUid ||
    request.requesterEmail ||
    `${request.requesterName || request.borrower || ''}|${
      request.requesterTeam || request.team || ''
    }`;
  const requestedCount = requestedCountSnapshot.data().count;
  const onHoldCount = onHoldCountSnapshot.data().count;
  const approvedCount = approvedCountSnapshot.data().count;
  const requestTabCounts = {
    [ADMIN_REQUEST_TAB.PENDING]: requestedCount + onHoldCount,
    [ADMIN_REQUEST_TAB.RENTAL]: approvedCount,
    [ADMIN_REQUEST_TAB.CLOSED]: closedCountSnapshot.data().count,
    [ADMIN_REQUEST_TAB.RETURNED]: returnedCountSnapshot.data().count,
  };
  const metrics = {
    requestedCount,
    onHoldCount,
    approvedCount,
    pendingUserActionCount: pendingUserActionCountSnapshot.data().count,
    overdueCount: overdueCountSnapshot.data().count,
    dueTodayCount: dueTodayCountSnapshot.data().count,
    startTodayCount: startTodayCountSnapshot.data().count,
    pendingAccountCount: pendingAccountCountSnapshot.data().count,
    totalAssetCount: catalogAssets.length,
    availableCount: catalogAssets.filter(
      (asset) =>
        !unavailableAssetIds.has(asset.id) && !blockedAssetIds.has(asset.id)
    ).length,
    unavailableCount: unavailableAssetIds.size,
    uniqueReservedAssets: new Set(
      reservedRequests.map((request) => request.laptopId).filter(Boolean)
    ).size,
    uniqueActiveAssets: new Set(
      activeRentalRequests.map((request) => request.laptopId).filter(Boolean)
    ).size,
    uniqueOverdueAssets: new Set(
      overdueRequests
        .map((request) => request.laptopId || request.assetNo)
        .filter(Boolean)
    ).size,
    uniqueOverdueUsers: new Set(
      overdueRequests.map(requestIdentity).filter(Boolean)
    ).size,
  };
  const dataIssueCounts = {
    orphanedAvailability: 0,
    missingDate: approvedRequests.filter(
      (request) => !request.startDate || !request.dueDate
    ).length,
    invalidPeriod: activeRequests.filter(
      (request) =>
        request.startDate &&
        request.dueDate &&
        request.dueDate < request.startDate
    ).length,
    missingAsset: activeRequests.filter(
      (request) => request.laptopId && !assetIdSet.has(request.laptopId)
    ).length,
    missingRequester: activeRequests.filter(
      (request) =>
        !request.requesterUid &&
        !request.requesterEmail &&
        !request.requesterName &&
        !request.borrower
    ).length,
  };
  const generatedAtClientMs = Date.now();
  const summaryPayload = {
    schemaVersion: DASHBOARD_SUMMARY_SCHEMA_VERSION,
    businessDate: referenceDate,
    generatedAt: serverTimestamp(),
    generatedAtClientMs,
    updatedByUid: adminUid,
    activeRequests,
    pendingAccounts,
    metrics,
    requestTabCounts,
    dataIssueCounts,
    sourceStats: {
      activeRequestPreviewCount: activeRequests.length,
      activeRequestSourceCount: requestedCount + onHoldCount + approvedCount,
      activeRequestPreviewLimit: ADMIN_DASHBOARD_ACTIVE_REQUEST_LIMIT,
      activeRequestPreviewTruncated:
        requestedCount + onHoldCount + approvedCount > activeRequests.length,
      pendingAccountPreviewCount: pendingAccounts.length,
      pendingAccountSourceCount: pendingAccountCountSnapshot.data().count,
      pendingAccountPreviewLimit: DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT,
    },
  };

  await setDoc(DASHBOARD_SUMMARY_DOC_REF, summaryPayload, { merge: false });

  return normalizeDashboardSummary({
    ...summaryPayload,
    generatedAt: generatedAtClientMs,
  });
};
