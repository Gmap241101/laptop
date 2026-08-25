import { useMemo } from 'react';

import { STATUS } from '../../constants/appConstants.js';
import {
  DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
  getLaptopRentalAvailability,
} from '../../domain/rentalPolicy.js';
import { compareRentalAssetDisplay, getDisplayRentalStatus, today } from '../../utils/appUtils.js';
import { normalizeEmailAddress } from '../../utils/memberPolicy.js';
import { getRentalRestrictionStatus } from '../../utils/overduePolicy.js';

const EMPTY_RENTAL_STATS = Object.freeze({
  total: 0,
  available: 0,
  requested: 0,
  reserved: 0,
  approved: 0,
  overdue: 0,
});

const getFiniteMetric = (metrics, key) => {
  const value = Number(metrics?.[key]);
  return Number.isFinite(value) ? value : 0;
};

export const mergeRentalRequestSources = ({
  availabilityRequests,
  ownRequests,
  includeAvailabilitySummaries,
}) => {
  const requestMap = new Map();

  if (includeAvailabilitySummaries) {
    (availabilityRequests || []).forEach((request) => {
      if (!request?.id) return;
      requestMap.set(request.id, request);
    });
  }

  (ownRequests || []).forEach((request) => {
    if (!request?.id) return;

    requestMap.set(request.id, {
      ...(requestMap.get(request.id) || {}),
      ...request,
    });
  });

  return Array.from(requestMap.values());
};

export const selectCurrentUserRequests = ({
  requests,
  firebaseUid,
  firebaseEmail,
  profileEmail,
  previousAccountUids,
}) => {
  if (!firebaseUid) return [];

  const linkedRequesterUids = new Set(
    [firebaseUid, ...(Array.isArray(previousAccountUids) ? previousAccountUids : [])]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
  const currentUserEmail = normalizeEmailAddress(
    firebaseEmail || profileEmail || ''
  );

  return (requests || []).filter((request) => {
    const requesterUid = String(request?.requesterUid || '').trim();

    if (requesterUid && linkedRequesterUids.has(requesterUid)) {
      return true;
    }

    return Boolean(
      currentUserEmail &&
      normalizeEmailAddress(request?.requesterEmail || '') === currentUserEmail
    );
  });
};

export const createRentalStatusSummary = ({
  enabled,
  requests,
  laptops,
  referenceDate,
}) => {
  if (!enabled) {
    return {
      blockedLaptopIds: new Set(),
      stats: { ...EMPTY_RENTAL_STATS },
    };
  }

  const blockedLaptopIds = new Set();
  let requested = 0;
  let reserved = 0;
  let approved = 0;
  let overdue = 0;

  (requests || []).forEach((request) => {
    if (
      request.status === STATUS.REQUESTED ||
      request.status === STATUS.APPROVED ||
      request.status === STATUS.ON_HOLD
    ) {
      blockedLaptopIds.add(request.laptopId);
    }

    if (request.status === STATUS.REQUESTED) {
      requested += 1;
      return;
    }

    if (request.status !== STATUS.APPROVED) {
      return;
    }

    if (request.startDate && request.startDate > referenceDate) {
      reserved += 1;
      return;
    }

    approved += 1;

    if (request.dueDate && request.dueDate < referenceDate) {
      overdue += 1;
    }
  });

  let available = 0;

  (laptops || []).forEach((laptop) => {
    if (
      !blockedLaptopIds.has(laptop.id) &&
      laptop.status !== STATUS.UNAVAILABLE
    ) {
      available += 1;
    }
  });

  return {
    blockedLaptopIds,
    stats: {
      total: (laptops || []).length,
      available,
      requested,
      reserved,
      approved,
      overdue,
    },
  };
};

export const selectAdminRentalStatusStats = (dashboardSummary) => {
  const metrics = dashboardSummary?.metrics || {};

  return {
    total: getFiniteMetric(metrics, 'totalAssetCount'),
    available: getFiniteMetric(metrics, 'availableCount'),
    requested: getFiniteMetric(metrics, 'requestedCount'),
    reserved: getFiniteMetric(metrics, 'uniqueReservedAssets'),
    approved: getFiniteMetric(metrics, 'uniqueActiveAssets'),
    overdue: getFiniteMetric(metrics, 'uniqueOverdueAssets'),
  };
};

export const filterUserRentalLaptops = ({
  enabled,
  laptops,
  requests,
  settings,
  startDate,
  dueDate,
  query,
  selectedCategory,
  availabilityFilter,
}) => {
  if (!enabled) return [];

  const normalizedQuery = String(query || '').trim().toLowerCase();

  return (laptops || []).filter((laptop) => {
    const laptopAvailability = getLaptopRentalAvailability(
      laptop,
      requests || [],
      settings || {},
      startDate,
      dueDate
    );

    const keywordMatched = `${laptop.category || ''} ${laptop.assetNo} ${laptop.serialNo} ${laptop.model} ${laptop.note}`
      .toLowerCase()
      .includes(normalizedQuery);
    const categoryMatched =
      selectedCategory === '전체' || laptop.category === selectedCategory;
    const availabilityMatched =
      availabilityFilter === '전체'
        ? true
        : availabilityFilter === STATUS.AVAILABLE
          ? !laptopAvailability.blocked
          : laptopAvailability.blocked;

    return keywordMatched && categoryMatched && availabilityMatched;
  }).sort(compareRentalAssetDisplay);
};

export const filterAdminRentalLaptops = ({
  enabled,
  laptops,
  query,
  selectedCategory,
  availabilityFilter,
  blockedLaptopIds,
}) => {
  if (!enabled) return [];

  const normalizedQuery = String(query || '').trim().toLowerCase();
  const blockedIds = blockedLaptopIds || new Set();

  return (laptops || []).filter((laptop) => {
    const keywordMatched = `${laptop.category || ''} ${laptop.assetNo} ${laptop.serialNo} ${laptop.model} ${laptop.note}`
      .toLowerCase()
      .includes(normalizedQuery);
    const categoryMatched =
      selectedCategory === '전체' || laptop.category === selectedCategory;
    const availabilityMatched =
      availabilityFilter === '전체'
        ? true
        : availabilityFilter === STATUS.AVAILABLE
          ? !blockedIds.has(laptop.id) && laptop.status !== STATUS.UNAVAILABLE
          : blockedIds.has(laptop.id) || laptop.status === STATUS.UNAVAILABLE;

    return keywordMatched && categoryMatched && availabilityMatched;
  }).sort(compareRentalAssetDisplay);
};

export const getUserLaptopStatusLabel = (laptopAvailability) => {
  if (!laptopAvailability) {
    return STATUS.AVAILABLE;
  }

  if (laptopAvailability.reason === 'assetUnavailable') {
    return STATUS.UNAVAILABLE;
  }

  return getDisplayRentalStatus(
    laptopAvailability.status,
    laptopAvailability.blockingRequest?.startDate
  );
};

export const getEditLaptopInsertIndex = ({
  editLaptop,
  adminFilteredLaptops,
  assetGridColumns,
}) => {
  if (!editLaptop) return -1;

  const editLaptopIndex = (adminFilteredLaptops || []).findIndex(
    (laptop) => laptop.id === editLaptop.id
  );

  if (editLaptopIndex < 0) return -1;

  return Math.min(
    Math.ceil((editLaptopIndex + 1) / assetGridColumns) * assetGridColumns - 1,
    adminFilteredLaptops.length - 1
  );
};

export default function useRentalDerivedSelectors({
  adminAvailabilityFilter,
  adminLaptopQuery,
  adminSelectedAssetCategory,
  adminTab,
  assetGridColumns,
  availabilityFilter,
  currentUserRestriction,
  dashboardSummary,
  dashboardSummaryReady,
  dataBorrowers,
  dataLaptops,
  dataRequests,
  dataSettings,
  editLaptop,
  firebaseAuthUser,
  form,
  hasAdminAccess,
  isAdminAuthenticated,
  query,
  rentalRequests,
  selectedAssetCategory,
  selectedLaptopId,
  userProfile,
  userTab,
  view,
}) {
  const mergedRentalRequests = useMemo(
    () =>
      mergeRentalRequestSources({
        availabilityRequests: dataRequests,
        ownRequests: rentalRequests,
        includeAvailabilitySummaries: view === 'user',
      }),
    [dataRequests, rentalRequests, view]
  );

  const currentUserRequests = useMemo(
    () =>
      selectCurrentUserRequests({
        requests: mergedRentalRequests,
        firebaseUid: firebaseAuthUser?.uid,
        firebaseEmail: firebaseAuthUser?.email,
        profileEmail: userProfile?.email,
        previousAccountUids: userProfile?.previousAccountUids,
      }),
    [
      mergedRentalRequests,
      firebaseAuthUser?.uid,
      firebaseAuthUser?.email,
      userProfile?.email,
      userProfile?.previousAccountUids,
    ]
  );

  const currentUserRentalRestrictionStatus = useMemo(
    () =>
      getRentalRestrictionStatus({
        requests: currentUserRequests,
        requesterUid: firebaseAuthUser?.uid || '',
        settings: dataSettings,
        restriction: currentUserRestriction,
        referenceDate: today(),
      }),
    [
      currentUserRequests,
      firebaseAuthUser?.uid,
      dataSettings,
      currentUserRestriction,
    ]
  );

  const shouldShowStats =
    hasAdminAccess || (view === 'user' && userTab === 'rental');
  const shouldPrepareUserRentalList =
    view === 'user' && userTab === 'rental';
  const shouldPrepareAdminAssetList =
    hasAdminAccess && adminTab === 'laptops';
  const shouldPrepareRentalStatus =
    shouldPrepareAdminAssetList ||
    (view === 'user' && ['home', 'rental'].includes(userTab));

  const rentalStatusSummary = useMemo(
    () =>
      createRentalStatusSummary({
        enabled: shouldPrepareRentalStatus,
        requests: dataRequests,
        laptops: dataLaptops,
        referenceDate: today(),
      }),
    [shouldPrepareRentalStatus, dataRequests, dataLaptops]
  );

  const adminRentalStatusStats = useMemo(
    () => selectAdminRentalStatusStats(dashboardSummary),
    [dashboardSummary]
  );

  const shouldUseAdminSummaryStats = view === 'admin' && isAdminAuthenticated;
  const stats = shouldUseAdminSummaryStats
    ? adminRentalStatusStats
    : rentalStatusSummary.stats;
  const statsLoading =
    shouldUseAdminSummaryStats &&
    (!dashboardSummaryReady || !dashboardSummary);

  const filteredLaptops = useMemo(
    () =>
      filterUserRentalLaptops({
        enabled: shouldPrepareUserRentalList,
        laptops: dataLaptops,
        requests: dataRequests,
        settings: dataSettings,
        startDate: form.startDate,
        dueDate: form.dueDate,
        query,
        selectedCategory: selectedAssetCategory,
        availabilityFilter,
      }),
    [
      shouldPrepareUserRentalList,
      dataLaptops,
      dataRequests,
      dataSettings,
      form.startDate,
      form.dueDate,
      query,
      selectedAssetCategory,
      availabilityFilter,
    ]
  );

  const adminFilteredLaptops = useMemo(
    () =>
      filterAdminRentalLaptops({
        enabled: shouldPrepareAdminAssetList,
        laptops: dataLaptops,
        query: adminLaptopQuery,
        selectedCategory: adminSelectedAssetCategory,
        availabilityFilter: adminAvailabilityFilter,
        blockedLaptopIds: rentalStatusSummary.blockedLaptopIds,
      }),
    [
      shouldPrepareAdminAssetList,
      dataLaptops,
      adminLaptopQuery,
      adminSelectedAssetCategory,
      adminAvailabilityFilter,
      rentalStatusSummary.blockedLaptopIds,
    ]
  );

  const selectedLaptop = useMemo(
    () =>
      (dataLaptops || []).find((laptop) => laptop.id === selectedLaptopId),
    [dataLaptops, selectedLaptopId]
  );

  const selectedLaptopAvailability = useMemo(
    () =>
      selectedLaptop
        ? getLaptopRentalAvailability(
            selectedLaptop,
            dataRequests || [],
            dataSettings || {},
            form.startDate,
            form.dueDate
          )
        : null,
    [
      selectedLaptop,
      dataRequests,
      dataSettings,
      form.startDate,
      form.dueDate,
    ]
  );

  const isPeriodBasedRentalMode =
    dataSettings.allowNonOverlappingSameAssetRequests ??
    DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS;

  const filteredBorrowers = useMemo(
    () => (dataBorrowers || []).filter((borrower) => borrower.team === form.team),
    [dataBorrowers, form.team]
  );

  const editLaptopInsertIndex = useMemo(
    () =>
      getEditLaptopInsertIndex({
        editLaptop,
        adminFilteredLaptops,
        assetGridColumns,
      }),
    [editLaptop, adminFilteredLaptops, assetGridColumns]
  );

  return {
    adminFilteredLaptops,
    availableFilterLabel: STATUS.AVAILABLE,
    currentUserRentalRestrictionStatus,
    currentUserRequests,
    editLaptopInsertIndex,
    filteredBorrowers,
    filteredLaptops,
    isPeriodBasedRentalMode,
    mergedRentalRequests,
    rentalDeviceSectionDescription: isPeriodBasedRentalMode
      ? '선택 기간 중 [대여가능] 기기만 신청할 수 있습니다.'
      : '[대여가능] 기기만 신청할 수 있습니다.',
    rentalDeviceSectionTitle: isPeriodBasedRentalMode
      ? '대여 기기 선택'
      : '대여 기기 선택',
    selectedLaptop,
    selectedLaptopAvailability,
    shouldShowStats,
    stats,
    statsLoading,
    unavailableFilterLabel: STATUS.UNAVAILABLE,
  };
}
