const normalizeStringList = (values = [], fallback = []) => {
  const normalized = [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  return normalized.length ? normalized : [...fallback];
};

const asNonNegativeInteger = (value, fallback = 0) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const createRentalConfigBootstrapDocument = ({
  teams = [],
  memberDirectoryVersion = 0,
  memberDirectoryEntryCount = 0,
} = {}) => {
  const normalizedTeams = normalizeStringList(teams);
  const directoryPresent = Number(memberDirectoryEntryCount || 0) > 0;

  return Object.freeze({
    key: 'rentalSystem/publicConfig',
    payload: Object.freeze({
      storageVersion: 2,
      teams: normalizedTeams,
      settings: Object.freeze({
        teamInputMode: 'dropdown',
        borrowerInputMode: 'dropdown',
        maxRentalDays: 14,
        adjustStartDateAfterWorkEnd: true,
        adjustStartDateToNextBusinessDay: true,
        excludeWeekendsForStartDate: true,
        excludeSaturdays: true,
        excludeSundays: true,
        excludeHolidaysForStartDate: true,
        workEndTime: '18:00',
        holidays: [],
        requireAdminApproval: true,
        // If a PostgreSQL member directory already exists, fail conservatively by
        // keeping signup restricted to that directory instead of silently opening it.
        requireRegisteredMemberForSignup: directoryPresent,
        autoApproveNewMembers: false,
        memberDirectoryVersion: asNonNegativeInteger(memberDirectoryVersion, 0),
        memberIdentityClaimsReady: directoryPresent,
        allowNonOverlappingSameAssetRequests: false,
        rentalExtensionEnabled: false,
        rentalExtensionApprovalMode: 'manual',
        rentalExtensionMaxCount: 1,
        rentalExtensionDays: 5,
        rentalExtensionRequestWaitDays: 7,
        overdueRentalBlockEnabled: false,
        postOverduePenaltyEnabled: false,
        overduePenaltyMode: 'fixedPerAsset',
        overdueFixedDaysPerAsset: 1,
        overdueDayMultiplier: 1,
      }),
      bootstrap: Object.freeze({
        source: 'postgresql-self-heal',
        reason: 'missing-rental-config-after-firebase-retirement',
        generatedAt: new Date().toISOString(),
      }),
      updatedAt: new Date().toISOString(),
    }),
  });
};
