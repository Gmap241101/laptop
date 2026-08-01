import { STATUS } from '../constants/appConstants.js';
import {
  DEFAULT_SIGNUP_TERMS_SETTINGS,
  normalizeTermsSettings,
} from '../features/terms/termsConstants.js';
import {
  DEFAULT_ADJUST_START_DATE_AFTER_WORK_END,
  DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
  DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
  DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
  DEFAULT_EXCLUDE_SATURDAYS,
  DEFAULT_EXCLUDE_SUNDAYS,
  DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE,
  DEFAULT_MAX_RENTAL_DAYS,
  DEFAULT_RENTAL_EXTENSION_APPROVAL_MODE,
  DEFAULT_RENTAL_EXTENSION_DAYS,
  DEFAULT_RENTAL_EXTENSION_ENABLED,
  DEFAULT_RENTAL_EXTENSION_MAX_COUNT,
  DEFAULT_RENTAL_EXTENSION_REQUEST_WAIT_DAYS,
  DEFAULT_WORK_END_TIME,
  normalizeHolidayList,
  normalizeRentalPolicySettings,
} from '../domain/rentalPolicy.js';
import {
  DEFAULT_OVERDUE_DAY_MULTIPLIER,
  DEFAULT_OVERDUE_FIXED_DAYS_PER_ASSET,
  DEFAULT_OVERDUE_PENALTY_MODE,
  DEFAULT_OVERDUE_RENTAL_BLOCK_ENABLED,
  DEFAULT_POST_OVERDUE_PENALTY_ENABLED,
} from '../utils/overduePolicy.js';
import { getSafeMemberDirectoryVersion } from '../features/members/memberAccountPolicy.js';
import { normalizeAssetReservations } from './publicAssetCatalog.js';

export const seedLaptops = () =>
  Array.from({ length: 15 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const makers = [
      'LG Gram 16 Pro',
      'Samsung Galaxy Book 4',
      'Dell Latitude 5540',
      'Lenovo ThinkPad L14',
      'HP EliteBook 840',
    ];
    const maker = makers[index % makers.length];
    const currentYear = new Date().getFullYear();

    return {
      id: `NB-${number}`,
      category: '노트북',
      assetNo: `LAPTOP-${currentYear}-${number}`,
      serialNo: `SN-${currentYear}-${10000 + index * 37}`,
      model: maker,
      manufactureDate: `${2022 + (index % 4)}-${String(
        (index % 12) + 1
      ).padStart(2, '0')}-15`,
      photo:
        'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80',
      note:
        index % 7 === 0
          ? '배터리 상태 확인 필요'
          : index % 5 === 0
            ? 'HDMI 젠더 파우치 수납'
            : '',
      status: STATUS.AVAILABLE,
      currentRequestId: null,
    };
  });

export const initialData = {
  laptops: [],
  requests: [],
  assetCategories: ['노트북'],
  teams: [],
  borrowers: [],
  settings: {
    teamInputMode: 'dropdown',
    borrowerInputMode: 'dropdown',
    maxRentalDays: DEFAULT_MAX_RENTAL_DAYS,
    adjustStartDateAfterWorkEnd: DEFAULT_ADJUST_START_DATE_AFTER_WORK_END,
    adjustStartDateToNextBusinessDay:
      DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
    excludeWeekendsForStartDate: DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE,
    excludeSaturdays: DEFAULT_EXCLUDE_SATURDAYS,
    excludeSundays: DEFAULT_EXCLUDE_SUNDAYS,
    excludeHolidaysForStartDate: DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
    workEndTime: DEFAULT_WORK_END_TIME,
    holidays: [],
    requireAdminApproval: true,
    requireRegisteredMemberForSignup: false,
    autoApproveNewMembers: false,
    memberDirectoryVersion: 0,
    memberIdentityClaimsReady: false,
    ...DEFAULT_SIGNUP_TERMS_SETTINGS,
    allowNonOverlappingSameAssetRequests:
      DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
    rentalExtensionEnabled: DEFAULT_RENTAL_EXTENSION_ENABLED,
    rentalExtensionApprovalMode: DEFAULT_RENTAL_EXTENSION_APPROVAL_MODE,
    rentalExtensionMaxCount: DEFAULT_RENTAL_EXTENSION_MAX_COUNT,
    rentalExtensionDays: DEFAULT_RENTAL_EXTENSION_DAYS,
    rentalExtensionRequestWaitDays:
      DEFAULT_RENTAL_EXTENSION_REQUEST_WAIT_DAYS,
    overdueRentalBlockEnabled: DEFAULT_OVERDUE_RENTAL_BLOCK_ENABLED,
    postOverduePenaltyEnabled: DEFAULT_POST_OVERDUE_PENALTY_ENABLED,
    overduePenaltyMode: DEFAULT_OVERDUE_PENALTY_MODE,
    overdueFixedDaysPerAsset: DEFAULT_OVERDUE_FIXED_DAYS_PER_ASSET,
    overdueDayMultiplier: DEFAULT_OVERDUE_DAY_MULTIPLIER,
  },
};

export const normalizeBorrowers = (borrowers, teams) =>
  borrowers
    .map((borrower, index) => {
      if (typeof borrower === 'string') {
        return {
          id: '',
          name: borrower,
          team: teams[index % teams.length] || '',
          sortOrder: index,
        };
      }

      return {
        id: borrower.id || '',
        name: borrower.name || '',
        team: borrower.team || teams[0] || '',
        sortOrder: Number.isFinite(Number(borrower.sortOrder))
          ? Number(borrower.sortOrder)
          : index,
      };
    })
    .sort((first, second) => first.sortOrder - second.sortOrder);

export const stripAdminAccountsFromData = (sourceData) => {
  const {
    adminAccounts: _adminAccounts,
    ...dataWithoutAdminAccounts
  } = sourceData || {};

  return dataWithoutAdminAccounts;
};

export const mergePersistedData = (rawData) => {
  const parsed = { ...initialData, ...(rawData || {}) };
  const assetCategories =
    Array.isArray(parsed.assetCategories) && parsed.assetCategories.length > 0
      ? parsed.assetCategories
      : initialData.assetCategories;

  const rawSettings = parsed.settings || {};
  const settings = normalizeRentalPolicySettings({
    ...initialData.settings,
    ...rawSettings,
  });

  settings.adjustStartDateToNextBusinessDay =
    rawSettings.adjustStartDateToNextBusinessDay ??
    rawSettings.adjustStartDateAfterWorkEnd ??
    initialData.settings.adjustStartDateToNextBusinessDay;

  settings.adjustStartDateAfterWorkEnd =
    settings.adjustStartDateToNextBusinessDay;

  const legacyExcludeWeekends =
    rawSettings.excludeWeekendsForStartDate ??
    initialData.settings.excludeWeekendsForStartDate;

  settings.excludeSaturdays =
    rawSettings.excludeSaturdays ?? legacyExcludeWeekends;
  settings.excludeSundays =
    rawSettings.excludeSundays ?? legacyExcludeWeekends;
  settings.excludeWeekendsForStartDate =
    settings.excludeSaturdays && settings.excludeSundays;
  settings.excludeHolidaysForStartDate =
    rawSettings.excludeHolidaysForStartDate ??
    initialData.settings.excludeHolidaysForStartDate;
  settings.allowNonOverlappingSameAssetRequests =
    rawSettings.allowNonOverlappingSameAssetRequests ??
    initialData.settings.allowNonOverlappingSameAssetRequests;
  settings.requireRegisteredMemberForSignup = Boolean(
    rawSettings.requireRegisteredMemberForSignup
  );
  settings.autoApproveNewMembers =
    settings.requireRegisteredMemberForSignup &&
    Boolean(rawSettings.autoApproveNewMembers);
  settings.memberDirectoryVersion =
    getSafeMemberDirectoryVersion(rawSettings);
  settings.memberIdentityClaimsReady = Boolean(
    rawSettings.memberIdentityClaimsReady
  );

  Object.assign(settings, normalizeTermsSettings(rawSettings));
  settings.holidays = normalizeHolidayList(settings.holidays);

  const parsedWithoutAdminAccounts = stripAdminAccountsFromData(parsed);

  return {
    ...parsedWithoutAdminAccounts,
    assetCategories,
    settings,
    laptops: (parsed.laptops || []).map((asset) => ({
      ...asset,
      category: asset.category || assetCategories[0] || '노트북',
      reservations: normalizeAssetReservations(asset.reservations || []),
    })),
    borrowers: normalizeBorrowers(
      parsed.borrowers || [],
      parsed.teams || []
    ),
  };
};
