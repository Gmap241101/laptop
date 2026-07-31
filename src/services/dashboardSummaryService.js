import {
  getCountFromServer,
  getDoc,
  getDocs,
  limit as firestoreLimit,
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
  RENTAL_AVAILABILITY_COLLECTION_REF,
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
export const DASHBOARD_SUMMARY_SCHEMA_VERSION = 2;
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
  // 통계는 최근 100건 미리보기가 아니라 모든 진행 신청을 기준으로 계산한다.
  // 상세 목록만 아래에서 최근 100건으로 잘라 요약 문서 크기를 제한한다.
  const activeRequestSource = firestoreQuery(
    RENTAL_REQUESTS_COLLECTION_REF,
    where('status', 'in', [
      STATUS.REQUESTED,
      STATUS.ON_HOLD,
      STATUS.APPROVED,
    ])
  );
  const pendingAccountSource = firestoreQuery(
    USER_ACCOUNTS_COLLECTION_REF,
    where('status', '==', USER_PROFILE_STATUS.PENDING),
    firestoreLimit(100)
  );

  const [
    activeRequestSnapshot,
    pendingAccountSnapshot,
    publicCatalogSnapshot,
    rentalAvailabilitySnapshot,
    closedCountSnapshot,
    returnedCountSnapshot,
    pendingAccountCountSnapshot,
  ] = await Promise.all([
    getDocs(activeRequestSource),
    getDocs(pendingAccountSource),
    getDoc(PUBLIC_ASSET_CATALOG_DOC_REF),
    getDocs(RENTAL_AVAILABILITY_COLLECTION_REF),
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
        USER_ACCOUNTS_COLLECTION_REF,
        where('status', '==', USER_PROFILE_STATUS.PENDING)
      )
    ),
  ]);

  const allActiveRequests = activeRequestSnapshot.docs.map((requestDoc) =>
    toDashboardRequestSummary({
      ...requestDoc.data(),
      id: requestDoc.id,
    })
  );
  const getRequestSortMillis = (request = {}) =>
    getFirestoreTimestampMillis(
      request.createdAt || request.requestedAt || request.updatedAt
    );
  const activeRequests = [...allActiveRequests]
    .sort((first, second) => {
      const timeDiff = getRequestSortMillis(second) - getRequestSortMillis(first);
      if (timeDiff) return timeDiff;
      return String(second.id || '').localeCompare(String(first.id || ''));
    })
    .slice(0, ADMIN_DASHBOARD_ACTIVE_REQUEST_LIMIT);
  const pendingAccounts = pendingAccountSnapshot.docs
    .map((accountDoc) =>
      toDashboardAccountSummary({
        ...accountDoc.data(),
        id: accountDoc.id,
        uid: accountDoc.data().uid || accountDoc.id,
      })
    )
    .sort((first, second) => {
      const timeDiff =
        getFirestoreTimestampMillis(first.createdAt) -
        getFirestoreTimestampMillis(second.createdAt);
      if (timeDiff) return timeDiff;
      return String(first.id || '').localeCompare(String(second.id || ''));
    })
    .slice(0, DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT);

  const publicCatalogData = publicCatalogSnapshot.exists()
    ? publicCatalogSnapshot.data()
    : null;
  const shouldRepairPublicCatalog =
    !publicCatalogSnapshot.exists() ||
    !Array.isArray(publicCatalogData?.assets) ||
    Number(publicCatalogData?.schemaVersion || 0) !==
      PUBLIC_ASSET_CATALOG_SCHEMA_VERSION ||
    publicCatalogData?.synchronizationMode !== 'write-through';
  let catalogAssets = publicCatalogSnapshot.exists()
    ? normalizePublicCatalogAssets(publicCatalogData?.assets || [])
    : [];

  if (shouldRepairPublicCatalog || !catalogAssets.length) {
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
        synchronizationMode: 'write-through',
      },
      { merge: false }
    );
  }

  const approvedRequests = allActiveRequests.filter(
    (request) => request.status === STATUS.APPROVED
  );
  const requestedRequests = allActiveRequests.filter(
    (request) => request.status === STATUS.REQUESTED
  );
  const onHoldRequests = allActiveRequests.filter(
    (request) => request.status === STATUS.ON_HOLD
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
  const dueTodayRequests = approvedRequests.filter(
    (request) =>
      (!request.startDate || request.startDate <= referenceDate) &&
      request.dueDate === referenceDate
  );
  const startTodayRequests = approvedRequests.filter(
    (request) => request.startDate === referenceDate
  );
  const pendingUserActionRequests = allActiveRequests.filter(
    (request) =>
      request.userActionRequest?.status === USER_REQUEST_REVIEW_STATUS.PENDING
  );
  const blockedAssetIds = new Set(
    allActiveRequests.map((request) => request.laptopId).filter(Boolean)
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
  const activeRequestIdSet = new Set(
    allActiveRequests.map((request) => request.id).filter(Boolean)
  );
  const orphanedAvailabilityRequests = rentalAvailabilitySnapshot.docs.filter(
    (availabilityDoc) => {
      const availabilityId = availabilityDoc.data()?.id || availabilityDoc.id;
      return !activeRequestIdSet.has(availabilityId);
    }
  );
  const requestIdentity = (request = {}) =>
    request.requesterUid ||
    request.requesterEmail ||
    `${request.requesterName || request.borrower || ''}|${
      request.requesterTeam || request.team || ''
    }`;
  const requestedCount = requestedRequests.length;
  const onHoldCount = onHoldRequests.length;
  const approvedCount = approvedRequests.length;
  const generatedAtClientMs = Date.now();
  const getDateDiffDays = (fromDate, toDate) => {
    if (!fromDate || !toDate) return 0;
    const fromMillis = new Date(`${fromDate}T00:00:00Z`).getTime();
    const toMillis = new Date(`${toDate}T00:00:00Z`).getTime();
    if (!Number.isFinite(fromMillis) || !Number.isFinite(toMillis)) return 0;
    return Math.max(0, Math.floor((toMillis - fromMillis) / 86400000));
  };
  const getWaitingDays = (value) => {
    const valueMillis = getFirestoreTimestampMillis(value);
    if (!valueMillis) return 0;
    return Math.max(
      0,
      Math.floor((generatedAtClientMs - valueMillis) / 86400000)
    );
  };
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
    pendingUserActionCount: pendingUserActionRequests.length,
    overdueCount: overdueRequests.length,
    dueTodayCount: dueTodayRequests.length,
    startTodayCount: startTodayRequests.length,
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
    longestOverdueDays: overdueRequests.reduce(
      (maximum, request) =>
        Math.max(maximum, getDateDiffDays(request.dueDate, referenceDate)),
      0
    ),
    oldestRequestedDays: requestedRequests.reduce(
      (maximum, request) =>
        Math.max(
          maximum,
          getWaitingDays(request.createdAt || request.requestedAt || request.updatedAt)
        ),
      0
    ),
    oldestPendingMemberDays: pendingAccounts.reduce(
      (maximum, account) =>
        Math.max(maximum, getWaitingDays(account.createdAt || account.updatedAt)),
      0
    ),
  };
  const dataIssueCounts = {
    orphanedAvailability: orphanedAvailabilityRequests.length,
    missingDate: approvedRequests.filter(
      (request) => !request.startDate || !request.dueDate
    ).length,
    invalidPeriod: allActiveRequests.filter(
      (request) =>
        request.startDate &&
        request.dueDate &&
        request.dueDate < request.startDate
    ).length,
    missingAsset: allActiveRequests.filter(
      (request) => request.laptopId && !assetIdSet.has(request.laptopId)
    ).length,
    missingRequester: allActiveRequests.filter(
      (request) =>
        !request.requesterUid &&
        !request.requesterEmail &&
        !request.requesterName &&
        !request.borrower
    ).length,
  };
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
      activeRequestSourceCount: allActiveRequests.length,
      activeRequestPreviewLimit: ADMIN_DASHBOARD_ACTIVE_REQUEST_LIMIT,
      activeRequestPreviewTruncated:
        allActiveRequests.length > activeRequests.length,
      pendingAccountPreviewCount: pendingAccounts.length,
      pendingAccountSourceCount: pendingAccountCountSnapshot.data().count,
      pendingAccountPreviewLimit: DASHBOARD_SUMMARY_PENDING_ACCOUNT_LIMIT,
      metricSource: 'all-active-requests',
      metricSourceCount: allActiveRequests.length,
      rentalAvailabilitySourceCount: rentalAvailabilitySnapshot.size,
      orphanedAvailabilityCount: orphanedAvailabilityRequests.length,
    },
  };

  await setDoc(DASHBOARD_SUMMARY_DOC_REF, summaryPayload, { merge: false });

  return normalizeDashboardSummary({
    ...summaryPayload,
    generatedAt: generatedAtClientMs,
  });
};
