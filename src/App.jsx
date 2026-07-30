import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query as firestoreQuery,
  runTransaction,
  setDoc,
  updateDoc,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Laptop,
  LayoutDashboard,
  Users,
  ClipboardList,
  Settings,
  Plus,
  Pin,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Save,
  Trash2,
  Edit3,
  ShieldCheck,
  AlertCircle,
  X,
  Info,
  UserPlus,
  LogIn,
  UserCircle,
  LogOut,
} from 'lucide-react';

import {
  AdminPageHeader,
  Badge,
  Button,
  Card,
  CardContent,
  DateInputWithWeekday,
  Input,
  LockIcon,
  Select,
} from './components/CommonUI.jsx';

import RentalStatusBoard from './components/RentalStatusBoard.jsx';
import UserWorkspace from './user/UserWorkspace.jsx';
import UserFooter from './user/UserFooter.jsx';
import DevRenderProfiler from './performance/DevRenderProfiler.jsx';
import useStableContextGroups from './hooks/useStableContextGroups.js';
import {
  APP_CONTEXT_GROUP_KEYS,
  getAdminPanelContextKey,
  getUserPanelContextKey,
} from './context/appContextSlices.js';

const AdminWorkspace = React.lazy(() => import('./admin/AdminWorkspace.jsx'));
let appDialogsModulePromise = null;
const loadAppDialogsModule = () => {
  if (!appDialogsModulePromise) {
    appDialogsModulePromise = import('./dialogs/AppDialogs.jsx').catch(
      (error) => {
        appDialogsModulePromise = null;
        throw error;
      }
    );
  }

  return appDialogsModulePromise;
};
const AppDialogs = React.lazy(loadAppDialogsModule);
let adminRequestMutationServicePromise = null;
const loadAdminRequestMutationService = () => {
  if (!adminRequestMutationServicePromise) {
    adminRequestMutationServicePromise = import(
      './features/requests/adminRequestMutationService.js'
    ).catch((error) => {
      adminRequestMutationServicePromise = null;
      throw error;
    });
  }

  return adminRequestMutationServicePromise;
};
const UserPopupLayer = React.lazy(() => import('./user/UserPopupLayer.jsx'));
const DevPerformancePanel = React.lazy(() =>
  import('./performance/DevPerformancePanel.jsx')
);
const MemoizedUserFooter = React.memo(UserFooter);
const MemoizedAppDialogs = React.memo(AppDialogs);
const MemoizedUserPopupLayer = React.memo(UserPopupLayer);
import {
  isRichTextEmpty,
  legacyTextToRichHtml,
  richTextHtmlToText,
  sanitizeRichTextHtml,
} from './utils/richTextCore.js';
import {
  formatPopupDateTime,
  getPopupDateMillis,
  getPopupDisplayStatus,
  getPopupVersionKey,
  toDateTimeLocalValue,
} from './utils/popupUtils.js';

import {
  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
  ADMIN_ACCOUNTS_COLLECTION_REF,
  FAQ_BOARD_CONFIG_DOC_REF,
  FAQ_CATEGORIES_COLLECTION_REF,
  FAQ_POSTS_COLLECTION_REF,
  FOOTER_PAGES_COLLECTION_REF,
  NOTICE_BOARD_CONFIG_DOC_REF,
  NOTICE_POSTS_COLLECTION_REF,
  POPUP_POSTS_COLLECTION_REF,
  PUBLIC_ASSET_CATALOG_DOC_REF,
  PUBLIC_CONFIG_DOC_REF,
  MEMBER_DIRECTORY_KEYS_COLLECTION_REF,
  MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
  RENTAL_ASSET_NUMBERS_COLLECTION_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  RENTAL_AVAILABILITY_COLLECTION_REF,
  RENTAL_BORROWERS_COLLECTION_REF,
  RENTAL_REQUEST_LOGS_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  RENTAL_RESTRICTIONS_COLLECTION_REF,
  SITE_FOOTER_CONFIG_DOC_REF,
  SITE_SETTINGS_DOC_REF,
  SYSTEM_ADMIN_SETTINGS_DOC_REF,
  USER_SESSION_POLICY_DOC_REF,
  USER_ACCOUNTS_COLLECTION_NAME,
  USER_ACCOUNTS_COLLECTION_REF,
  db,
  firebaseAuth,
} from './firebase.js';



import {
  ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
  ADMIN_REQUEST_QUICK_FILTER,
  ADMIN_REQUEST_TAB,
  DEFAULT_FAQ_POSTS_PER_PAGE,
  DEFAULT_NOTICE_POSTS_PER_PAGE,
  DISPLAY_STATUS,
  FAQ_POSTS_PER_PAGE_OPTIONS,
  NOTICE_POSTS_PER_PAGE_OPTIONS,
  RENTAL_BLOCKING_REQUEST_STATUSES,
  RENTAL_REQUEST_AUDIT_ACTION,
  RENTAL_REQUEST_STATUS_TRANSITIONS,
  RENTAL_EXTENSION_APPROVAL_MODE,
  OVERDUE_PENALTY_MODE,
  STATUS,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
  statusStyle,
} from './constants/appConstants.js';


import {
  PROFILE_REQUIRED_REASON,
  USER_PROFILE_STATUS,
} from './constants/memberConstants.js';
import {
  DEFAULT_SIGNUP_TERMS_SETTINGS,
  normalizeTermsSettings,
} from './features/terms/termsConstants.js';
import {
  DEFAULT_ADJUST_START_DATE_AFTER_WORK_END,
  DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
  DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
  DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
  DEFAULT_EXCLUDE_SATURDAYS,
  DEFAULT_EXCLUDE_SUNDAYS,
  DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE,
  DEFAULT_HOLIDAY_TYPE,
  DEFAULT_MAX_RENTAL_DAYS,
  DEFAULT_RENTAL_EXTENSION_APPROVAL_MODE,
  DEFAULT_RENTAL_EXTENSION_DAYS,
  DEFAULT_RENTAL_EXTENSION_ENABLED,
  DEFAULT_RENTAL_EXTENSION_MAX_COUNT,
  DEFAULT_RENTAL_EXTENSION_REQUEST_WAIT_DAYS,
  DEFAULT_WORK_END_TIME,
  HOLIDAY_TYPE_LABEL,
  RENTAL_POLICY_SETTING_KEYS,
  createDefaultRequestForm,
  defaultRentalStartDate,
  findExtensionPeriodConflict,
  findSameAssetBlockingRequest,
  getAdjustedRentalDueDate,
  getAdjustedRentalStartDate,
  getExtensionRequestAvailableDate,
  getHolidayReasons,
  getNonBusinessDayReason,
  getLaptopAdminDisplayStatus,
  getLaptopRentalAvailability,
  getLaptopRepresentativeRequest,
  getMaxRentalDueDate,
  getRentalDueDateAdjustmentReason,
  getRentalExtensionApprovalMode,
  getRentalExtensionEligibility,
  getRentalExtensionErrorMessage,
  getRentalExtensionPeriod,
  getRentalStartAdjustmentInfo,
  getRequestExtensionCount,
  getSafeMaxRentalDays,
  getSafeRentalExtensionDays,
  getSafeRentalExtensionMaxCount,
  getSafeRentalExtensionRequestWaitDays,
  isRentalDueBusinessDay,
  isTemporaryDateInputValue,
  normalizeHolidayList,
  normalizeHolidayReason,
  normalizeRentalPolicySettings,
  serializeHolidayListForFirestore,
} from './domain/rentalPolicy.js';
import { useDashboardSummary } from './hooks/useDashboardSummary.js';
import useBoardProgressiveSearch from './features/boards/useBoardProgressiveSearch.js';
import useAdminBoardPostController, {
  useFaqPostAdminState,
  useNoticePostAdminState,
} from './features/boards/useAdminBoardPostController.js';
import useAdminBoardSettingsController, {
  useAdminBoardSettingsState,
} from './features/boards/useAdminBoardSettingsController.js';
import useAdminPopupPostController, {
  useAdminPopupPostState,
} from './features/boards/useAdminPopupPostController.js';
import useAdminFooterContentController, {
  createDefaultFooterConfigDraft,
  sanitizeFooterCommonHtml,
  useAdminFooterContentState,
} from './features/boards/useAdminFooterContentController.js';
import useAdminAssetCrudController, {
  getAssetNumberRegistryId,
  normalizeAssetNumber,
  useAdminAssetCrudState,
} from './features/assets/useAdminAssetCrudController.js';
import {
  commitFirestoreOperations,
} from './features/members/memberAccountIndexService.js';
import {
  getClaimCurrentUid,
  getClaimFormerUids,
  getClaimStatus,
  getRestorableUserProfileStatus,
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from './features/members/memberAccountPolicy.js';
import { useDebouncedValue } from './hooks/useDebouncedValue.js';
import {
  PROTECTED_USER_TABS,
  clearUserLoginReturnTarget,
  getInitialFooterPageIdFromPath,
  getInitialUserTabFromPath,
  getInitialViewFromPath,
  getRouteStateFromPath,
  normalizeUserLoginReturnTarget,
  pushAppPath,
  readUserAccountStatusView,
  readUserLoginReturnTarget,
  replaceAppPath,
  writeUserAccountStatusView,
  writeUserLoginReturnTarget,
} from './routing/appRoutes.js';
import {
  PUBLIC_ASSET_CATALOG_SCHEMA_VERSION,
  hydratePublicCatalogAssets,
  normalizeAssetReservations,
  normalizePublicCatalogAssets,
  toRentalAvailabilityRequest,
} from './services/publicAssetCatalog.js';
import {
  createPublicAssetCatalogPayload,
  ensurePublicAssetCatalogWriteThrough,
  getPublicAssetCatalogWriteErrorMessage,
  rebuildPublicAssetCatalogFromServer,
  writePublicAssetCatalogMutationInTransaction,
} from './services/publicAssetCatalogWriteThroughLoader.js';

import {
  createMemberIdentityKey,
  normalizeEmailAddress,
  normalizeMemberName,
  normalizeMemberTeam,
  parseDomesticPhoneNumber,
} from './utils/memberPolicy.js';
import useUserAccountRecoveryController from './features/auth/useUserAccountRecoveryController.js';
import useUserLoginController, {
  createDefaultUserAuthForm,
  useUserAuthState,
} from './features/auth/useUserLoginController.js';
import useUserSignupController from './features/auth/useUserSignupController.js';
import useAdminAccountManagementController, {
  ADMIN_ACCOUNT_PAGE_SIZE,
  ADMIN_CUSTOM_OPTION_VALUE,
  createDefaultAdminAccountForm,
  useAdminAccountManagementState,
} from './features/auth/useAdminAccountManagementController.js';
import useUserMyPageAccountController, {
  createDefaultUserProfileForm,
  useUserMyPageAccountState,
} from './features/members/useUserMyPageAccountController.js';
import useUserRentalRequestController, {
  useUserRentalRequestState,
} from './features/requests/useUserRentalRequestController.js';
import useUserRequestHistoryActionController, {
  useUserRequestHistoryActionState,
} from './features/requests/useUserRequestHistoryActionController.js';

import {
  DEFAULT_SITE_SETTINGS,
  DEFAULT_SYSTEM_ADMIN_SETTINGS,
  DEFAULT_USER_SESSION_POLICY,
  SERVICE_MODE,
  getHeaderSubtitle,
  getServiceBlockReason,
  normalizeSiteSettings,
  normalizeSystemAdminSettings,
  normalizeUserSessionPolicy,
} from './utils/systemSettings.js';

import {
  addDaysFrom,
  formatDate,
  formatDateWithKoreanWeekday,
  formatFirestoreDate,
  formatFirestoreTimestamp,
  getDisplayRentalStatus,
  getRequestDisplayStatus,
  getFirestoreTimestampMillis,
  getKoreaNow,
  today,
} from './utils/appUtils.js';

import {
  DEFAULT_OVERDUE_DAY_MULTIPLIER,
  DEFAULT_OVERDUE_FIXED_DAYS_PER_ASSET,
  DEFAULT_OVERDUE_PENALTY_MODE,
  DEFAULT_OVERDUE_RENTAL_BLOCK_ENABLED,
  DEFAULT_POST_OVERDUE_PENALTY_ENABLED,
  buildOverdueReturnResult,
  getRentalRestrictionStatus,
} from './utils/overduePolicy.js';

const SPLIT_STORAGE_VERSION = 2;

// --- 상태 및 스타일 정의 ---
const getUserRequestActionLabel = (type) => {
  if (type === USER_REQUEST_ACTION.CHANGE) return '신청정보 수정';
  if (type === USER_REQUEST_ACTION.CANCEL) return '대여 신청 취소';
  if (type === USER_REQUEST_ACTION.EXTEND) return '대여 연장 신청';
  if (type === USER_REQUEST_ACTION.RETURN) return '조기 반납 요청';

  return '사용자 요청';
};

const getUserRequestReviewStatusLabel = (status) => {
  if (status === USER_REQUEST_REVIEW_STATUS.PENDING) return '검토 대기';
  if (status === USER_REQUEST_REVIEW_STATUS.APPROVED) return '승인';
  if (status === USER_REQUEST_REVIEW_STATUS.DENIED) return '불허';

  return '상태 미지정';
};

const getSafeNoticePostsPerPage = (value) => {
  const parsedValue = Math.trunc(Number(value));

  return parsedValue >= 5 &&
    parsedValue <= 50
    ? parsedValue
    : DEFAULT_NOTICE_POSTS_PER_PAGE;
};

const filterNoticePostsByQuery = (posts = [], queryText = '') => {
  const normalizedQuery = String(queryText || '')
    .trim()
    .toLowerCase();

  if (!normalizedQuery) {
    return posts;
  }

  return posts.filter(
    (post) =>
      String(post.title || '')
        .toLowerCase()
        .includes(normalizedQuery) ||
      String(
        post.contentText ||
          post.content ||
          richTextHtmlToText(post.contentHtml || '')
      )
        .toLowerCase()
        .includes(normalizedQuery)
  );
};

const getSafeFaqPostsPerPage = (value) => {
  const parsedValue = Math.trunc(Number(value));

  return parsedValue >= 5 &&
    parsedValue <= 50
    ? parsedValue
    : DEFAULT_FAQ_POSTS_PER_PAGE;
};


const POPUP_DISMISSED_SESSION_KEY = 'rentalSystemDismissedPopupVersions';
const POPUP_DISMISSED_LOCAL_KEY = 'rentalSystemDismissedPopupVersionsUntil';
const POPUP_DISMISS_SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// --- 초기 자산 데이터 생성 ---
function seedLaptops() {
  return Array.from({ length: 15 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const makers = ['LG Gram 16 Pro', 'Samsung Galaxy Book 4', 'Dell Latitude 5540', 'Lenovo ThinkPad L14', 'HP EliteBook 840'];
    const maker = makers[i % makers.length];
    return {
      id: `NB-${n}`,
      category: '노트북',
      assetNo: `LAPTOP-${new Date().getFullYear()}-${n}`,
      serialNo: `SN-${new Date().getFullYear()}-${10000 + i * 37}`,
      model: maker,
      manufactureDate: `${2022 + (i % 4)}-${String((i % 12) + 1).padStart(2, '0')}-15`,
      photo: `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`,
      note: i % 7 === 0 ? '배터리 상태 확인 필요' : i % 5 === 0 ? 'HDMI 젠더 파우치 수납' : '',
      status: STATUS.AVAILABLE,
      currentRequestId: null,
    };
  });
}

const initialData = {
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
    adjustStartDateToNextBusinessDay: DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
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
    allowNonOverlappingSameAssetRequests: DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
    rentalExtensionEnabled: DEFAULT_RENTAL_EXTENSION_ENABLED,
    rentalExtensionApprovalMode: DEFAULT_RENTAL_EXTENSION_APPROVAL_MODE,
    rentalExtensionMaxCount: DEFAULT_RENTAL_EXTENSION_MAX_COUNT,
    rentalExtensionDays: DEFAULT_RENTAL_EXTENSION_DAYS,
    rentalExtensionRequestWaitDays: DEFAULT_RENTAL_EXTENSION_REQUEST_WAIT_DAYS,
    overdueRentalBlockEnabled: DEFAULT_OVERDUE_RENTAL_BLOCK_ENABLED,
    postOverduePenaltyEnabled: DEFAULT_POST_OVERDUE_PENALTY_ENABLED,
    overduePenaltyMode: DEFAULT_OVERDUE_PENALTY_MODE,
    overdueFixedDaysPerAsset: DEFAULT_OVERDUE_FIXED_DAYS_PER_ASSET,
    overdueDayMultiplier: DEFAULT_OVERDUE_DAY_MULTIPLIER,
  },
};

function normalizeBorrowers(borrowers, teams) {
  return borrowers
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
        sortOrder:
          Number.isFinite(Number(borrower.sortOrder))
            ? Number(borrower.sortOrder)
            : index,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeAdminAccounts(adminAccounts) {
  if (!Array.isArray(adminAccounts)) return [];

  return adminAccounts
    .filter((account) => account && (account.adminLoginId || account.id))
    .map((account, index) => ({
      id: account.id || account.authUid || `ADMIN-LEGACY-${index}`,
      adminLoginId: account.adminLoginId || '',
      authUid: account.authUid || '',
      authEmail: account.authEmail || account.email || '',
      authProvider: account.authProvider || '',
      authLinkedAt: account.authLinkedAt || '',
      passwordHash: account.passwordHash || '',
      passwordSalt: account.passwordSalt || '',
      passwordHashAlgorithm:
        account.passwordHashAlgorithm ||
        account.passwordHashAlgorith ||
        (account.authUid ? 'Firebase Auth' : 'SHA-256'),
      passwordHashIterations: Number(account.passwordHashIterations) || 0,
      failedLoginCount: Number(account.failedLoginCount) || 0,
      lockUntil: Number(account.lockUntil) || 0,
      lockReason: account.lockReason || '',
      lastLoginAt: account.lastLoginAt || '',
      passwordChangedAt: account.passwordChangedAt || '',
      organizationName: account.organizationName || '',
      userName: account.userName || '',
      email: account.email || '',
      phone: account.phone || '',
      adminRole: ['owner', 'admin'].includes(account.adminRole) ? account.adminRole : 'owner',
      createdAt: account.createdAt || '',
      updatedAt: account.updatedAt || '',
    }));
}

function stripAdminAccountsFromData(sourceData) {
  const { adminAccounts: _adminAccounts, ...dataWithoutAdminAccounts } = sourceData || {};

  return dataWithoutAdminAccounts;
}

function mergePersistedData(rawData) {
  const parsed = { ...initialData, ...(rawData || {}) };
  const assetCategories = Array.isArray(parsed.assetCategories) && parsed.assetCategories.length > 0
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

  settings.adjustStartDateAfterWorkEnd = settings.adjustStartDateToNextBusinessDay;
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
  settings.requireRegisteredMemberForSignup =
    Boolean(rawSettings.requireRegisteredMemberForSignup);
  settings.autoApproveNewMembers =
    settings.requireRegisteredMemberForSignup &&
    Boolean(rawSettings.autoApproveNewMembers);
  settings.memberDirectoryVersion =
    getSafeMemberDirectoryVersion(rawSettings);
  settings.memberIdentityClaimsReady =
    Boolean(rawSettings.memberIdentityClaimsReady);
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
    borrowers: normalizeBorrowers(parsed.borrowers || [], parsed.teams || []),
  };
}

const FIRESTORE_PINNED_POST_LIMIT = 20;
const ADMIN_AUTH_SESSION_KEY = 'mk_laptop_admin_auth_session';
const USER_AUTH_SESSION_KEY = 'mk_laptop_user_auth_session';
const ADMIN_PASSWORD_HASH_ALGORITHM = 'PBKDF2-SHA-256';
const ADMIN_PASSWORD_HASH_ITERATIONS = 120000;

const createDefaultAdminAuthForm = () => ({
  adminLoginId: '',
  password: '',
});

const createMemberPolicyError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

const getProfileRequiredReasonLabel = (reason) => {
  if (reason === PROFILE_REQUIRED_REASON.DUPLICATE_IDENTITY) {
    return '부서·성명 중복 계정';
  }

  if (reason === PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH) {
    return '등록 명부 불일치';
  }

  return '등록 정보 확인 필요';
};

const getUserAuthErrorMessage = (error) => {
  const errorCode = error?.code || '';
  const errorMessage = error?.message || '';

  if (errorCode === 'member/directory-mismatch') {
    return '등록된 부서·성명과 일치하지 않습니다. 입력 정보를 확인해 주세요.';
  }

  if (errorCode === 'member/identity-already-claimed') {
    return '이미 가입된 부서·성명입니다. 기존 계정으로 로그인하거나 관리자에게 문의해 주세요.';
  }

  if (errorCode === 'member/directory-not-ready') {
    return '가입 가능한 부서·사용자 명부가 준비되지 않았습니다. 관리자에게 문의해 주세요.';
  }

  if (errorCode === 'member/identity-index-not-ready') {
    return '회원 중복 확인 정보가 준비되지 않았습니다. 관리자에게 문의해 주세요.';
  }

  if (errorCode === 'terms/policy-changed') {
    return '회원가입 약관이 변경되었습니다. 약관 동의 단계로 돌아가 변경된 내용을 다시 확인해 주세요.';
  }

  if (errorCode === 'terms/required-not-accepted') {
    return '필수 회원가입 약관을 모두 확인하고 동의해 주세요.';
  }

  if (errorCode === 'terms/decision-required') {
    return '선택 약관에 동의하려면 약관 내용을 먼저 확인해 주세요.';
  }

  if (errorCode === 'auth/email-already-in-use') {
    return '이미 가입된 이메일입니다. 로그인 화면에서 로그인해 주세요.';
  }

  if (errorCode === 'auth/invalid-email') {
    return '이메일 형식이 올바르지 않습니다.';
  }

  if (errorCode === 'auth/weak-password') {
    return '비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.';
  }

  if (errorCode === 'auth/password-does-not-meet-requirements') {
    return '비밀번호가 Firebase Authentication의 비밀번호 정책을 충족하지 않습니다. 대문자, 숫자, 특수문자 등 설정된 정책을 확인해 주세요.';
  }

  if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }

  if (errorCode === 'auth/invalid-credential') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }

  if (errorCode === 'auth/operation-not-allowed') {
    return 'Firebase Authentication에서 Email/Password 로그인 제공자가 아직 사용 설정되어 있지 않습니다. Firebase Console의 Authentication > Sign-in method에서 Email/Password를 사용 설정해 주세요.';
  }

  if (errorCode === 'auth/network-request-failed') {
    return 'Firebase Authentication 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.';
  }

  if (errorCode === 'auth/unauthorized-domain') {
    return '현재 접속한 도메인이 Firebase Authentication 승인 도메인에 등록되어 있지 않습니다. Firebase Console의 Authentication 설정에서 Authorized domains를 확인해 주세요.';
  }

  if (errorCode === 'auth/too-many-requests') {
    return '로그인 또는 가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (errorCode === 'auth/requires-recent-login') {
    return '보안상 최근 로그인한 사용자만 비밀번호를 변경할 수 있습니다. 로그아웃 후 다시 로그인한 다음 비밀번호 변경을 시도해 주세요.';
  }

  if (errorCode === 'member/directory-status-sync-permission-denied') {
    return '회원가입 명부 정책 변경에 따른 회원 상태 동기화 권한이 거부되었습니다. 최신 Firestore Rules를 게시한 뒤 다시 로그인해 주세요.';
  }

  if (errorCode === 'permission-denied') {
    return '회원 정보 또는 로그인 역할 확인 권한이 거부되었습니다. Firestore Rules의 userAccounts/{uid} 및 adminAccounts/{uid} 규칙과 게시 여부를 확인해 주세요.';
  }

  if (errorCode === 'unavailable') {
    return 'Firestore 서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }

  return `사용자 인증 처리 중 오류가 발생했습니다. 오류 코드: ${errorCode || 'unknown'} ${errorMessage ? ` / ${errorMessage}` : ''}`;
};

const getAdminFirebaseAuthErrorMessage = (error) => {
  const errorCode = error?.code || '';

  if (error?.message === 'admin-auth-uid-mismatch') {
    return 'Firebase Auth 계정 UID와 관리자 등록 정보가 일치하지 않습니다. 관리자 ID 관리 정보를 확인해 주세요.';
  }

  if (errorCode === 'auth/email-already-in-use') {
    return '이미 Firebase Authentication에 등록된 이메일입니다. 다른 이메일을 사용하거나 기존 Auth 계정 연결 상태를 확인해 주세요.';
  }

  if (errorCode === 'auth/operation-not-allowed') {
    return 'Firebase Authentication에서 Email/Password 제공자가 사용 설정되어 있지 않습니다. Authentication > Sign-in method에서 Email/Password를 사용 설정해 주세요.';
  }

  if (errorCode === 'auth/invalid-email') {
    return '관리자 로그인 이메일 형식이 올바르지 않습니다.';
  }

  if (errorCode === 'auth/weak-password') {
    return '관리자 초기 비밀번호는 6자 이상으로 입력해 주세요.';
  }

  if (errorCode === 'auth/password-does-not-meet-requirements') {
    return '관리자 비밀번호가 Firebase Authentication의 비밀번호 정책을 충족하지 않습니다.';
  }

  if (
    errorCode === 'auth/user-not-found' ||
    errorCode === 'auth/wrong-password' ||
    errorCode === 'auth/invalid-credential'
  ) {
    return '관리자 로그인 이메일 또는 비밀번호가 일치하지 않습니다.';
  }

  if (errorCode === 'auth/network-request-failed') {
    return 'Firebase Authentication 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.';
  }

  if (errorCode === 'auth/unauthorized-domain') {
    return '현재 접속한 도메인이 Firebase Authentication 승인 도메인에 등록되어 있지 않습니다.';
  }

  if (errorCode === 'auth/too-many-requests') {
    return '로그인 또는 가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (errorCode === 'auth/requires-recent-login') {
    return '보안상 최근 로그인한 관리자만 비밀번호를 변경할 수 있습니다. 로그아웃 후 다시 로그인한 다음 비밀번호 변경을 시도해 주세요.';
  }

  if (errorCode === 'permission-denied') {
    return '관리자 계정 조회 또는 저장 권한이 거부되었습니다. Firestore Rules의 adminAccounts/{uid} 규칙을 확인해 주세요.';
  }

  return getUserAuthErrorMessage(error).replace('사용자 인증', '관리자 인증');
};

const bufferToHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const hexToBuffer = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
};

const createAdminPasswordSalt = () => {
  const saltValues = new Uint8Array(16);
  window.crypto.getRandomValues(saltValues);

  return bufferToHex(saltValues);
};

const hashAdminPasswordLegacy = async (password) => {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', passwordBuffer);

  return bufferToHex(hashBuffer);
};

const hashAdminPassword = async (
  password,
  salt,
  iterations = ADMIN_PASSWORD_HASH_ITERATIONS
) => {
  const encoder = new TextEncoder();

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bufferToHex(derivedBits);
};

const createAdminPasswordSecurity = async (password) => {
  const passwordSalt = createAdminPasswordSalt();
  const passwordHash = await hashAdminPassword(password, passwordSalt);

  return {
    passwordHash,
    passwordSalt,
    passwordHashAlgorithm: ADMIN_PASSWORD_HASH_ALGORITHM,
    passwordHashIterations: ADMIN_PASSWORD_HASH_ITERATIONS,
  };
};

const verifyAdminPassword = async (password, adminAccount) => {
  if (
    adminAccount.passwordHashAlgorithm === ADMIN_PASSWORD_HASH_ALGORITHM &&
    adminAccount.passwordSalt
  ) {
    const passwordHash = await hashAdminPassword(
      password,
      adminAccount.passwordSalt,
      Number(adminAccount.passwordHashIterations) || ADMIN_PASSWORD_HASH_ITERATIONS
    );

    return {
      matched: passwordHash === adminAccount.passwordHash,
      shouldMigratePassword: false,
    };
  }

  const legacyPasswordHash = await hashAdminPasswordLegacy(password);

  return {
    matched: legacyPasswordHash === adminAccount.passwordHash,
    shouldMigratePassword: legacyPasswordHash === adminAccount.passwordHash,
  };
};

const createEmptyAuthSession = (identityKey) => ({
  [identityKey]: '',
  expiresAt: 0,
  absoluteExpiresAt: 0,
  policyVersion: 0,
  lastActivityAt: 0,
  logoutOnBrowserClose: true,
});

const clearStoredAuthSession = (storageKey) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(storageKey);
  window.localStorage.removeItem(storageKey);
};

const readStoredAuthSession = (storageKey, identityKey) => {
  const emptySession = createEmptyAuthSession(identityKey);
  if (typeof window === 'undefined') return emptySession;

  const now = Date.now();
  const candidates = [
    [window.sessionStorage, true],
    [window.localStorage, false],
  ];
  let selected = null;

  candidates.forEach(([storage, sessionOnly]) => {
    const raw = storage.getItem(storageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const absoluteExpiresAt = Number(parsed?.absoluteExpiresAt || 0);
      const absoluteIsValid = absoluteExpiresAt === 0 || absoluteExpiresAt > now;
      const isValid =
        Boolean(parsed?.[identityKey]) &&
        Number(parsed?.expiresAt || 0) > now &&
        absoluteIsValid;

      if (!isValid) {
        storage.removeItem(storageKey);
        return;
      }

      const candidate = {
        ...emptySession,
        ...parsed,
        absoluteExpiresAt,
        logoutOnBrowserClose:
          typeof parsed.logoutOnBrowserClose === 'boolean'
            ? parsed.logoutOnBrowserClose
            : sessionOnly,
      };

      if (
        !selected ||
        Number(candidate.lastActivityAt || 0) >
          Number(selected.lastActivityAt || 0)
      ) {
        selected = candidate;
      }
    } catch {
      storage.removeItem(storageKey);
    }
  });

  return selected || emptySession;
};

const writeStoredAuthSession = (storageKey, session, logoutOnBrowserClose) => {
  if (typeof window === 'undefined') return;
  clearStoredAuthSession(storageKey);
  const storage = logoutOnBrowserClose
    ? window.sessionStorage
    : window.localStorage;
  storage.setItem(storageKey, JSON.stringify(session));
};

const configureFirebaseAuthPersistence = async (
  authInstance,
  logoutOnBrowserClose
) => {
  await setPersistence(
    authInstance,
    logoutOnBrowserClose
      ? browserSessionPersistence
      : browserLocalPersistence
  );
};

const readAdminAuthSession = () =>
  readStoredAuthSession(ADMIN_AUTH_SESSION_KEY, 'adminId');

const saveAdminAuthSession = (
  adminId,
  securitySettings = {},
  previousSession = null
) => {
  const normalized = normalizeSystemAdminSettings(securitySettings);
  const now = Date.now();
  const idleDurationMs = normalized.adminIdleTimeoutMinutes * 60 * 1000;
  const absoluteDurationMs =
    normalized.adminAbsoluteTimeoutHours > 0
      ? normalized.adminAbsoluteTimeoutHours * 60 * 60 * 1000
      : 0;
  const previousAbsoluteExpiresAt = Number(
    previousSession?.absoluteExpiresAt || 0
  );
  const absoluteExpiresAt =
    absoluteDurationMs === 0
      ? 0
      : previousAbsoluteExpiresAt > now
        ? previousAbsoluteExpiresAt
        : now + absoluteDurationMs;
  const idleExpiresAt = now + idleDurationMs;
  const nextSession = {
    adminId,
    lastActivityAt: now,
    expiresAt:
      absoluteExpiresAt > 0
        ? Math.min(idleExpiresAt, absoluteExpiresAt)
        : idleExpiresAt,
    absoluteExpiresAt,
    policyVersion: normalized.adminSecurityPolicyVersion,
    logoutOnBrowserClose: normalized.adminLogoutOnBrowserClose,
  };

  writeStoredAuthSession(
    ADMIN_AUTH_SESSION_KEY,
    nextSession,
    normalized.adminLogoutOnBrowserClose
  );
  return nextSession;
};

const clearAdminAuthSession = () => {
  clearStoredAuthSession(ADMIN_AUTH_SESSION_KEY);
};

const readUserAuthSession = () =>
  readStoredAuthSession(USER_AUTH_SESSION_KEY, 'userId');

const saveUserAuthSession = (
  userId,
  policy = {},
  previousSession = null
) => {
  const normalized = normalizeUserSessionPolicy(policy);
  const now = Date.now();
  const idleDurationMs = normalized.userIdleTimeoutMinutes * 60 * 1000;
  const absoluteDurationMs =
    normalized.userAbsoluteTimeoutHours > 0
      ? normalized.userAbsoluteTimeoutHours * 60 * 60 * 1000
      : 0;
  const previousAbsoluteExpiresAt = Number(
    previousSession?.absoluteExpiresAt || 0
  );
  const absoluteExpiresAt =
    absoluteDurationMs === 0
      ? 0
      : previousAbsoluteExpiresAt > now
        ? previousAbsoluteExpiresAt
        : now + absoluteDurationMs;
  const idleExpiresAt = now + idleDurationMs;
  const nextSession = {
    userId,
    lastActivityAt: now,
    expiresAt:
      absoluteExpiresAt > 0
        ? Math.min(idleExpiresAt, absoluteExpiresAt)
        : idleExpiresAt,
    absoluteExpiresAt,
    policyVersion: normalized.userSecurityPolicyVersion,
    logoutOnBrowserClose: normalized.userLogoutOnBrowserClose,
  };

  writeStoredAuthSession(
    USER_AUTH_SESSION_KEY,
    nextSession,
    normalized.userLogoutOnBrowserClose
  );
  return nextSession;
};

const clearUserAuthSession = () => {
  clearStoredAuthSession(USER_AUTH_SESSION_KEY);
};

function App() {
  const [data, setData] = useState(initialData);
  const [siteSettings, setSiteSettings] = useState(DEFAULT_SITE_SETTINGS);
  const [siteSettingsReady, setSiteSettingsReady] = useState(false);
  const [siteSettingsLoadErrorMessage, setSiteSettingsLoadErrorMessage] = useState('');
  const [systemAdminSettings, setSystemAdminSettings] = useState(DEFAULT_SYSTEM_ADMIN_SETTINGS);
  const [systemAdminSettingsReady, setSystemAdminSettingsReady] = useState(false);
  const [systemAdminSettingsLoadErrorMessage, setSystemAdminSettingsLoadErrorMessage] = useState('');
  const [userSessionPolicy, setUserSessionPolicy] = useState(DEFAULT_USER_SESSION_POLICY);
  const [userSessionPolicyReady, setUserSessionPolicyReady] = useState(false);
  const [userSessionPolicyLoadErrorMessage, setUserSessionPolicyLoadErrorMessage] = useState('');
  const [systemBannerDismissedKey, setSystemBannerDismissedKey] = useState('');
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [firebaseLoadErrorMessage, setFirebaseLoadErrorMessage] = useState('');

  const [rentalRequests, setRentalRequests] = useState([]);
  const [rentalRequestsReady, setRentalRequestsReady] = useState(false);

  const [
    rentalRequestsLoadErrorMessage,
    setRentalRequestsLoadErrorMessage,
  ] = useState('');

  const {
    form,
    requestSubmitInProgressRef,
    requestSubmitLoading,
    selectedLaptopId,
    setForm,
    setRequestSubmitLoading,
    setSelectedLaptopId,
  } = useUserRentalRequestState(data.settings);

  const {
    setUserActionDialog,
    setUserActionForm,
    setUserActionSaving,
    userActionDialog,
    userActionForm,
    userActionSaving,
  } = useUserRequestHistoryActionState();
  const [
    adminUserActionSavingRequestId,
    setAdminUserActionSavingRequestId,
  ] = useState('');

  const [noticePosts, setNoticePosts] = useState([]);
  const [noticePinnedPosts, setNoticePinnedPosts] = useState([]);
  const [noticeRegularPagePosts, setNoticeRegularPagePosts] = useState([]);
  const [noticeHasNextPage, setNoticeHasNextPage] = useState(false);
  const [noticeRegularTotalCount, setNoticeRegularTotalCount] = useState(0);
  const noticeCursorByPageRef = useRef(new Map([[1, null]]));
  const noticeCursorKeyRef = useRef('');
  const [noticePostsReady, setNoticePostsReady] = useState(false);
  const [
    noticePostsLoadErrorMessage,
    setNoticePostsLoadErrorMessage,
  ] = useState('');

  const [noticeBoardConfig, setNoticeBoardConfig] = useState({
    postsPerPage: DEFAULT_NOTICE_POSTS_PER_PAGE,
  });
  const [noticeBoardConfigReady, setNoticeBoardConfigReady] = useState(false);
  const [
    noticeBoardConfigLoadErrorMessage,
    setNoticeBoardConfigLoadErrorMessage,
  ] = useState('');

  const [selectedNoticePostId, setSelectedNoticePostId] = useState('');
  const [selectedNoticePostOverride, setSelectedNoticePostOverride] = useState(null);
  const [noticePage, setNoticePage] = useState(1);
  const [adminNoticePage, setAdminNoticePage] = useState(1);
  const [userNoticeQuery, setUserNoticeQuery] = useState('');
  const [adminNoticeQuery, setAdminNoticeQuery] = useState('');
  const {
    noticePostDeletingId,
    noticePostDialog,
    noticePostForm,
    noticePostSaving,
    setNoticePostDeletingId,
    setNoticePostDialog,
    setNoticePostForm,
    setNoticePostSaving,
  } = useNoticePostAdminState();
  const {
    editingFaqCategoryId,
    editingFaqCategoryName,
    faqBoardConfigSaving,
    faqCategoryDeletingId,
    faqCategorySavingId,
    faqPostsPerPageInput,
    newFaqCategoryName,
    noticeBoardConfigSaving,
    noticePostsPerPageInput,
    setEditingFaqCategoryId,
    setEditingFaqCategoryName,
    setFaqBoardConfigSaving,
    setFaqCategoryDeletingId,
    setFaqCategorySavingId,
    setFaqPostsPerPageInput,
    setNewFaqCategoryName,
    setNoticeBoardConfigSaving,
    setNoticePostsPerPageInput,
  } = useAdminBoardSettingsState();

  const [popupPosts, setPopupPosts] = useState([]);
  const [popupPostsReady, setPopupPostsReady] = useState(true);
  const [popupPostsLoadErrorMessage, setPopupPostsLoadErrorMessage] = useState('');
  const {
    popupPostDeletingId,
    popupPostDialog,
    popupPostForm,
    popupPostSaving,
    popupPostToggleSavingId,
    setPopupPostDeletingId,
    setPopupPostDialog,
    setPopupPostForm,
    setPopupPostSaving,
    setPopupPostToggleSavingId,
  } = useAdminPopupPostState();

  const [footerConfig, setFooterConfig] = useState(createDefaultFooterConfigDraft);
  const [footerConfigReady, setFooterConfigReady] = useState(false);
  const [footerConfigLoadErrorMessage, setFooterConfigLoadErrorMessage] = useState('');
  const [footerPages, setFooterPages] = useState([]);
  const [footerPagesReady, setFooterPagesReady] = useState(false);
  const [footerPagesLoadErrorMessage, setFooterPagesLoadErrorMessage] = useState('');
  const {
    footerConfigDraft,
    footerConfigSaving,
    footerPageDeletingId,
    footerPageDialog,
    footerPageForm,
    footerPageSaving,
    footerPageToggleSavingId,
    setFooterConfigDraft,
    setFooterConfigSaving,
    setFooterPageDeletingId,
    setFooterPageDialog,
    setFooterPageForm,
    setFooterPageSaving,
    setFooterPageToggleSavingId,
  } = useAdminFooterContentState();

  const [temporarilyDismissedPopupVersions, setTemporarilyDismissedPopupVersions] = useState([]);
  const [dismissedPopupSessionVersions, setDismissedPopupSessionVersions] = useState(() => {
    if (typeof window === 'undefined') return [];

    try {
      const parsed = JSON.parse(
        window.sessionStorage.getItem(POPUP_DISMISSED_SESSION_KEY) || '[]'
      );
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  });
  const [dismissedPopupLocalVersions, setDismissedPopupLocalVersions] = useState(() => {
    if (typeof window === 'undefined') return {};

    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(POPUP_DISMISSED_LOCAL_KEY) || '{}'
      );
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

      const nowMillis = Date.now();
      return Object.fromEntries(
        Object.entries(parsed).filter(
          ([versionKey, expiresAt]) => versionKey && Number(expiresAt) > nowMillis
        )
      );
    } catch {
      return {};
    }
  });

  const [faqCategories, setFaqCategories] = useState([]);
  const [faqCategoriesReady, setFaqCategoriesReady] = useState(false);
  const [
    faqCategoriesLoadErrorMessage,
    setFaqCategoriesLoadErrorMessage,
  ] = useState('');

  const [faqPosts, setFaqPosts] = useState([]);
  const [faqPinnedPosts, setFaqPinnedPosts] = useState([]);
  const [faqRegularPagePosts, setFaqRegularPagePosts] = useState([]);
  const [faqHasNextPage, setFaqHasNextPage] = useState(false);
  const [faqRegularTotalCount, setFaqRegularTotalCount] = useState(0);
  const faqCursorByPageRef = useRef(new Map([[1, null]]));
  const faqCursorKeyRef = useRef('');
  const [faqPostsReady, setFaqPostsReady] = useState(false);
  const [
    faqPostsLoadErrorMessage,
    setFaqPostsLoadErrorMessage,
  ] = useState('');

  const [faqBoardConfig, setFaqBoardConfig] = useState({
    postsPerPage: DEFAULT_FAQ_POSTS_PER_PAGE,
  });
  const [faqBoardConfigReady, setFaqBoardConfigReady] = useState(false);
  const [
    faqBoardConfigLoadErrorMessage,
    setFaqBoardConfigLoadErrorMessage,
  ] = useState('');

  const [activeFaqCategoryId, setActiveFaqCategoryId] = useState('all');
  const [faqQuery, setFaqQuery] = useState('');
  const [faqSearchWithinCategory, setFaqSearchWithinCategory] = useState(false);
  const [expandedFaqPostId, setExpandedFaqPostId] = useState('');
  const [adminExpandedFaqPostId, setAdminExpandedFaqPostId] = useState('');
  const [faqPage, setFaqPage] = useState(1);
  const [adminFaqPage, setAdminFaqPage] = useState(1);

  const {
    faqPostDeletingId,
    faqPostDialog,
    faqPostForm,
    faqPostSaving,
    setFaqPostDeletingId,
    setFaqPostDialog,
    setFaqPostForm,
    setFaqPostSaving,
  } = useFaqPostAdminState();

  const [adminAccounts, setAdminAccounts] = useState([]);
  const [adminAccountsReady, setAdminAccountsReady] = useState(false);
  const [adminAccountsLoadErrorMessage, setAdminAccountsLoadErrorMessage] = useState('');
  const [adminAccountsRemoteHasData, setAdminAccountsRemoteHasData] = useState(false);
  const [legacyAdminAccounts] = useState([]);

  const initializedRemoteFormRef = useRef(false);

  const [splitPublicConfig, setSplitPublicConfig] = useState(null);
  const [splitRentalAssets, setSplitRentalAssets] = useState([]);
  const [publicCatalogAssets, setPublicCatalogAssets] = useState([]);
  const [publicCatalogAssetsReady, setPublicCatalogAssetsReady] = useState(false);
  const publicCatalogMigrationAdminUidRef = useRef('');
  const [splitRentalAvailability, setSplitRentalAvailability] = useState([]);
  const [splitRentalBorrowers, setSplitRentalBorrowers] = useState([]);
  const [splitStorageVersion, setSplitStorageVersion] = useState(0);
  const [splitSourceReady, setSplitSourceReady] = useState({
    config: false,
    assets: false,
    availability: false,
    borrowers: false,
  });

  const [splitSourceErrors, setSplitSourceErrors] = useState({
    config: '',
    assets: '',
    availability: '',
    borrowers: '',
  });

  const adminAccountsApplyingRemoteRef = useRef(false);
  const adminAccountsLastSyncedRef = useRef({});
  const allowAdminAccountsWriteRef = useRef(false);
  const adminLogoutInProgressRef = useRef(false);
  const pendingProtectedUserTabRef = useRef('');

  const [view, setView] = useState(getInitialViewFromPath); // 'user' | 'admin'
  const [userTab, setUserTab] = useState(getInitialUserTabFromPath); // 'home' | 'rental' | 'history' | 'notice' | 'faq' | 'footerPage' | 'notFound'
  const [selectedFooterPageId, setSelectedFooterPageId] = useState(getInitialFooterPageIdFromPath);
  const [isCommunityMenuOpen, setIsCommunityMenuOpen] = useState(false);
  const communityMenuRef = useRef(null);
  const [query, setQuery] = useState('');
  const [selectedAssetCategory, setSelectedAssetCategory] = useState('전체');
  const [availabilityFilter, setAvailabilityFilter] = useState(STATUS.AVAILABLE);
  const [adminLaptopQuery, setAdminLaptopQuery] = useState('');
  const [adminSelectedAssetCategory, setAdminSelectedAssetCategory] = useState('전체');
  const [adminAvailabilityFilter, setAdminAvailabilityFilter] = useState('전체');
  const [adminTab, setAdminTab] = useState('dashboard'); // 관리자 사이드바의 현재 메뉴 키
  const [adminMemberAccountsNavigationRequest, setAdminMemberAccountsNavigationRequest] = useState({
    requestId: 0,
    query: '',
    statusFilter: 'all',
  });
  const [adminRequestsNavigationRequest, setAdminRequestsNavigationRequest] = useState({
    requestId: 0,
    query: '',
    quickFilter: ADMIN_REQUEST_QUICK_FILTER.ALL,
    requestTab: ADMIN_REQUEST_TAB.PENDING,
    selectedRequestId: '',
  });
  const [adminRequestsMutationVersion, setAdminRequestsMutationVersion] = useState(0);
  const adminRequestsControllerRef = useRef({
    clearSelection: null,
    getRequestById: null,
    resetPage: null,
    updateRequests: null,
  });
  const [peopleSettingsDirty, setPeopleSettingsDirty] = useState(false);
  const memberDirectoryDeferredActionsRef = useRef({
    discard: null,
    save: null,
  });
  const [signupPolicyDirty, setSignupPolicyDirty] = useState(false);
  const signupPolicyDeferredActionsRef = useRef({
    discard: null,
    save: null,
  });
  const {
    editLaptop,
    newLaptop,
    setEditLaptop,
    setNewLaptop,
  } = useAdminAssetCrudState();
  const [newAssetCategory, setNewAssetCategory] = useState('');
  const [tempAssetCategories, setTempAssetCategories] = useState(data.assetCategories || []);
  const [tempAssetCategoryRenameMap, setTempAssetCategoryRenameMap] = useState({});
  const [editingAssetCategoryIndex, setEditingAssetCategoryIndex] = useState(null);
  const [editingAssetCategoryName, setEditingAssetCategoryName] = useState('');
  const [draggingAssetCategoryIndex, setDraggingAssetCategoryIndex] = useState(null);

  const {
    adminAccountEditForm,
    adminAccountForm,
    adminAccountPage,
    adminMyProfileForm,
    adminMyProfileSaving,
    editingAdminAccountId,
    setAdminAccountEditForm,
    setAdminAccountForm,
    setAdminAccountPage,
    setAdminMyProfileForm,
    setAdminMyProfileSaving,
    setEditingAdminAccountId,
  } = useAdminAccountManagementState();
  const [adminAuthForm, setAdminAuthForm] = useState(createDefaultAdminAuthForm);
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [adminLogoutInProgress, setAdminLogoutInProgress] = useState(false);
  const [authenticatedAdminId, setAuthenticatedAdminId] = useState(
    () => readAdminAuthSession().adminId
  );
  const [adminAuthExpiresAt, setAdminAuthExpiresAt] = useState(
    () => readAdminAuthSession().expiresAt
  );
  const [adminAuthAbsoluteExpiresAt, setAdminAuthAbsoluteExpiresAt] = useState(
    () => readAdminAuthSession().absoluteExpiresAt
  );
  const [adminAuthPolicyVersion, setAdminAuthPolicyVersion] = useState(
    () => readAdminAuthSession().policyVersion
  );
  const [userAuthSessionUid, setUserAuthSessionUid] = useState(
    () => readUserAuthSession().userId
  );
  const [userAuthSessionExpiresAt, setUserAuthSessionExpiresAt] = useState(
    () => readUserAuthSession().expiresAt
  );
  const [userAuthSessionAbsoluteExpiresAt, setUserAuthSessionAbsoluteExpiresAt] = useState(
    () => readUserAuthSession().absoluteExpiresAt
  );
  const [userAuthSessionPolicyVersion, setUserAuthSessionPolicyVersion] = useState(
    () => readUserAuthSession().policyVersion
  );

  const [firebaseAuthUser, setFirebaseAuthUser] = useState(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [currentAuthAdminAccount, setCurrentAuthAdminAccount] = useState(null);
  const [currentAuthRoleReady, setCurrentAuthRoleReady] = useState(false);
  const [currentAuthRoleErrorMessage, setCurrentAuthRoleErrorMessage] = useState('');
  const {
    userAuthForm,
    userAuthLoading,
    setUserAuthForm,
    setUserAuthLoading,
  } = useUserAuthState();
  const [userAccountStatusView, setUserAccountStatusView] = useState(readUserAccountStatusView);
  const [userDirectoryVerificationLoading, setUserDirectoryVerificationLoading] = useState(false);
  const userDirectoryVerificationKeyRef = useRef('');
  const profileRequiredRedirectRef = useRef('');
  const observedFirebaseAuthUidRef = useRef('');

  const hasFirebaseAuthSession = Boolean(
    firebaseAuthUser ||
      firebaseAuth.currentUser
  );

  const hasEstablishedUserSession = Boolean(
    firebaseAuthUser?.uid &&
      userAuthSessionUid === firebaseAuthUser.uid &&
      userAuthSessionExpiresAt > Date.now()
  );

  const [userProfile, setUserProfile] = useState(null);
  const [userProfileReady, setUserProfileReady] = useState(false);
  const {
    setUserProfileForm,
    setUserProfileSaving,
    setWithdrawalDialogOpen,
    setWithdrawalLoading,
    setWithdrawalPassword,
    userProfileForm,
    userProfileSaving,
    withdrawalDialogOpen,
    withdrawalLoading,
    withdrawalPassword,
  } = useUserMyPageAccountState();

  const [currentUserRestriction, setCurrentUserRestriction] = useState(null);
  const [currentUserRestrictionReady, setCurrentUserRestrictionReady] = useState(false);

  const debouncedUserNoticeQuery = useDebouncedValue(userNoticeQuery);
  const debouncedAdminNoticeQuery = useDebouncedValue(adminNoticeQuery);
  const debouncedFaqQuery = useDebouncedValue(faqQuery);


  const userStatusLogoutInProgressRef = useRef(false);
  const userSessionLogoutInProgressRef = useRef(false);

  // 엑셀/CSV 업로드 패널 토글 상태 값 추가
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [assetGridColumns, setAssetGridColumns] = useState(1);

  // 설정 임시 저장을 위한 임시 상태 정의
  const [tempSettings, setTempSettings] = useState(data.settings);
  const [newHolidayDate, setNewHolidayDate] = useState(today());
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayType, setNewHolidayType] = useState(DEFAULT_HOLIDAY_TYPE);
  const [holidayImportYear, setHolidayImportYear] = useState(String(getKoreaNow().getUTCFullYear()));
  const [holidayImportLoading, setHolidayImportLoading] = useState(false);
  const [holidayImportConflictModal, setHolidayImportConflictModal] = useState(null);
  const [holidayManagementYear, setHolidayManagementYear] = useState(
    String(getKoreaNow().getUTCFullYear())
  );
  const [holidayManagementMonth, setHolidayManagementMonth] = useState(
    getKoreaNow().getUTCMonth() + 1
  );
  const [holidayManagementView, setHolidayManagementView] = useState('calendar');

  useEffect(() => {
    if (adminTab === 'holidaySettings') {
      setHolidayManagementView('calendar');
    }
  }, [adminTab]);

  const holidaySettingsDirty = useMemo(
    () =>
      JSON.stringify(
        serializeHolidayListForFirestore(tempSettings.holidays || [])
      ) !==
      JSON.stringify(
        serializeHolidayListForFirestore(data.settings.holidays || [])
      ),
    [data.settings.holidays, tempSettings.holidays]
  );

  const assetCategorySettingsDirty = useMemo(() => {
    const normalizeCategories = (categories = []) =>
      categories
        .map((category) => String(category || '').trim())
        .filter(Boolean);

    return (
      JSON.stringify(normalizeCategories(tempAssetCategories)) !==
        JSON.stringify(normalizeCategories(data.assetCategories || [])) ||
      Object.keys(tempAssetCategoryRenameMap || {}).length > 0
    );
  }, [data.assetCategories, tempAssetCategories, tempAssetCategoryRenameMap]);


  const getComparableRentalPolicySettings = (settings = {}) => {
    const excludeSaturdays =
      settings.excludeSaturdays ??
      settings.excludeWeekendsForStartDate ??
      DEFAULT_EXCLUDE_SATURDAYS;
    const excludeSundays =
      settings.excludeSundays ??
      settings.excludeWeekendsForStartDate ??
      DEFAULT_EXCLUDE_SUNDAYS;

    const normalizedSettings = normalizeRentalPolicySettings({
      ...data.settings,
      ...settings,
      holidays: data.settings.holidays,
      allowNonOverlappingSameAssetRequests:
        settings.allowNonOverlappingSameAssetRequests ??
        DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
      adjustStartDateAfterWorkEnd:
        settings.adjustStartDateToNextBusinessDay ??
        settings.adjustStartDateAfterWorkEnd ??
        DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
      adjustStartDateToNextBusinessDay:
        settings.adjustStartDateToNextBusinessDay ??
        settings.adjustStartDateAfterWorkEnd ??
        DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
      excludeSaturdays,
      excludeSundays,
      excludeWeekendsForStartDate: excludeSaturdays && excludeSundays,
      maxRentalDays: getSafeMaxRentalDays(settings),
    });

    const comparableSettings = Object.fromEntries(
      RENTAL_POLICY_SETTING_KEYS.map((key) => [key, normalizedSettings[key]])
    );

    [
      'maxRentalDays',
      'rentalExtensionMaxCount',
      'rentalExtensionDays',
      'rentalExtensionRequestWaitDays',
      'overdueFixedDaysPerAsset',
      'overdueDayMultiplier',
      'workEndTime',
    ].forEach((key) => {
      comparableSettings[key] = String(
        settings[key] ?? normalizedSettings[key] ?? ''
      );
    });

    return comparableSettings;
  };

  const rentalPolicySettingsDirty = useMemo(
    () =>
      JSON.stringify(getComparableRentalPolicySettings(tempSettings)) !==
      JSON.stringify(getComparableRentalPolicySettings(data.settings)),
    [data.settings, tempSettings]
  );

  const footerConfigDirty =
    footerConfigReady &&
    (Boolean(footerConfigDraft.enabled) !== Boolean(footerConfig.enabled) ||
      sanitizeFooterCommonHtml(footerConfigDraft.contentHtml || '') !==
        sanitizeFooterCommonHtml(footerConfig.contentHtml || ''));


  const [
    splitStorageFinalizeLoading,
    setSplitStorageFinalizeLoading,
  ] = useState(false);

  // Toast 메시지 상태
  const [toast, setToast] = useState(null);
  // 커스텀 모달 확인창 상태
  const [confirmModal, setConfirmModal] = useState(null);
  // 대화상자 모듈은 최초 사용 전까지 지연하고, 한 번 활성화된 뒤에는 유지한다.
  const [appDialogsActivated, setAppDialogsActivated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        const nextAuthUid = user?.uid || '';
        const authIdentityChanged =
          observedFirebaseAuthUidRef.current !== nextAuthUid;

        observedFirebaseAuthUidRef.current = nextAuthUid;

        if (authIdentityChanged) {
          setCurrentAuthAdminAccount(null);
          setCurrentAuthRoleErrorMessage('');
          setCurrentAuthRoleReady(!user);
        }

        setFirebaseAuthUser(user);
        if (!user) {
          clearUserAuthSession();
          setUserAuthSessionUid('');
          setUserAuthSessionExpiresAt(0);
          setUserAuthSessionAbsoluteExpiresAt(0);
          setUserAuthSessionPolicyVersion(0);
        }
        setFirebaseAuthReady(true);
      },
      (error) => {
        console.error('Firebase Auth state error:', error);

        observedFirebaseAuthUidRef.current = '';
        setCurrentAuthAdminAccount(null);
        setCurrentAuthRoleErrorMessage('');
        setCurrentAuthRoleReady(true);

        setFirebaseAuthUser(null);
        clearUserAuthSession();
        setUserAuthSessionUid('');
        setUserAuthSessionExpiresAt(0);
        setUserAuthSessionAbsoluteExpiresAt(0);
        setUserAuthSessionPolicyVersion(0);
        setFirebaseAuthReady(true);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!firebaseAuthReady) return;

    if (!firebaseAuthUser) {
      setCurrentAuthAdminAccount(null);
      setCurrentAuthRoleErrorMessage('');
      setCurrentAuthRoleReady(true);
      return;
    }

    const currentAuthUid = firebaseAuthUser.uid;

    setCurrentAuthAdminAccount(null);
    setCurrentAuthRoleErrorMessage('');
    setCurrentAuthRoleReady(false);

    const unsubscribe = onSnapshot(
      doc(db, 'adminAccounts', currentAuthUid),
      (snapshot) => {
        if (!snapshot.exists()) {
          setCurrentAuthAdminAccount(null);
          setCurrentAuthRoleErrorMessage('');
          setCurrentAuthRoleReady(true);
          return;
        }

        const normalizedAdminAccount =
          normalizeAdminAccounts([
            {
              ...snapshot.data(),
              id: snapshot.id,
            },
          ])[0] || null;

        const hasValidAdminUidStructure =
          Boolean(normalizedAdminAccount) &&
          snapshot.id === currentAuthUid &&
          normalizedAdminAccount.id === currentAuthUid &&
          normalizedAdminAccount.authUid === currentAuthUid;

        if (!hasValidAdminUidStructure) {
          const message =
            '관리자 계정 문서의 UID 정보가 올바르지 않습니다. adminAccounts 문서 ID, id, authUid가 모두 같은지 확인해 주세요.';

          clearAdminAuthSession();
          setAuthenticatedAdminId('');
          setAdminAuthExpiresAt(0);
    setAdminAuthAbsoluteExpiresAt(0);
    setAdminAuthPolicyVersion(0);

          setCurrentAuthAdminAccount(null);
          setCurrentAuthRoleErrorMessage(message);
          setCurrentAuthRoleReady(true);

          triggerToast(message, 'error');
          return;
        }

        setCurrentAuthAdminAccount(normalizedAdminAccount);
        setCurrentAuthRoleErrorMessage('');
        setCurrentAuthRoleReady(true);
      },
      (error) => {
        const message =
          '현재 로그인 계정의 관리자 권한을 확인하지 못했습니다. Firestore Rules를 확인해 주세요.';

        console.error('Current auth role sync error:', error);

        setCurrentAuthAdminAccount(null);
        setCurrentAuthRoleErrorMessage(message);
        setCurrentAuthRoleReady(true);

        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, [firebaseAuthReady, firebaseAuthUser?.uid]);

  useEffect(() => {
    if (!hasFirebaseAuthSession) {
      setUserProfile(null);
      setUserProfileReady(true);
      setUserProfileForm(createDefaultUserProfileForm());
      return;
    }

    if (!currentAuthRoleReady) {
      setUserProfileReady(false);
      return;
    }

    if (currentAuthRoleErrorMessage) {
      setUserProfile(null);
      setUserProfileReady(true);
      setUserProfileForm(createDefaultUserProfileForm());
      return;
    }

    if (currentAuthAdminAccount || authenticatedAdminId) {
      setUserProfile(null);
      setUserProfileReady(true);
      setUserProfileForm(createDefaultUserProfileForm());
      return;
    }

    setUserProfileReady(false);

    const unsubscribe = onSnapshot(
      doc(db, USER_ACCOUNTS_COLLECTION_NAME, firebaseAuthUser.uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          setUserProfile(null);
          setUserProfileForm({
            name: firebaseAuthUser.displayName || '',
            team: '',
            phonePrefix: '010',
            phoneMiddle: '',
            phoneLast: '',
            newPassword: '',
            newPasswordConfirm: '',
          });
          setUserProfileReady(true);
          return;
        }

        const profileData = snapshot.data();

        const parsedPhone = parseDomesticPhoneNumber(profileData.phone || '');

        setUserProfile(profileData);
        setUserProfileForm({
          name: profileData.name || '',
          team: profileData.team || '',
          phonePrefix: parsedPhone.prefix,
          phoneMiddle: parsedPhone.middle,
          phoneLast: parsedPhone.last,
          newPassword: '',
          newPasswordConfirm: '',
        });
        setUserProfileReady(true);
      },
      (error) => {
        console.error('User account sync error:', error);
        setUserProfile(null);
        setUserProfileReady(true);
        triggerToast(
          '마이페이지 정보를 불러오지 못했습니다. Firestore 권한을 확인해 주세요.',
          'error'
        );
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthUser,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    currentAuthAdminAccount,
    authenticatedAdminId,
  ]);

  useEffect(() => {
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthRoleErrorMessage ||
      currentAuthAdminAccount ||
      authenticatedAdminId
    ) {
      setCurrentUserRestriction(null);
      setCurrentUserRestrictionReady(true);
      return;
    }

    setCurrentUserRestrictionReady(false);

    const unsubscribe = onSnapshot(
      doc(
        RENTAL_RESTRICTIONS_COLLECTION_REF,
        firebaseAuthUser.uid
      ),
      (snapshot) => {
        setCurrentUserRestriction(
          snapshot.exists()
            ? {
                ...snapshot.data(),
                uid: snapshot.id,
              }
            : null
        );
        setCurrentUserRestrictionReady(true);
      },
      (error) => {
        console.error('Rental restriction sync error:', error);
        setCurrentUserRestriction(null);
        setCurrentUserRestrictionReady(true);
        triggerToast(
          '대여 제한 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
          'error'
        );
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthUser?.uid,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    currentAuthAdminAccount,
    authenticatedAdminId,
  ]);

  useEffect(() => {
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthAdminAccount ||
      authenticatedAdminId ||
      !userProfileReady ||
      !userProfile ||
      userProfile.uid !== firebaseAuthUser.uid ||
      userAuthLoading ||
      withdrawalLoading
    ) {
      return;
    }

    const currentStatus =
      userProfile.status || '';

    if (
      currentStatus ===
      USER_PROFILE_STATUS.ACTIVE
    ) {
      const wasRedirectedForProfileRequired =
        profileRequiredRedirectRef.current.startsWith(
          `${firebaseAuthUser.uid}:`
        );

      profileRequiredRedirectRef.current = '';

      if (
        wasRedirectedForProfileRequired &&
        userTab === 'mypage'
      ) {
        replaceAppPath('user', 'rental');
        setView('user');
        setUserTab('rental');
        setIsCommunityMenuOpen(false);
        triggerToast(
          '회원 상태가 정상 이용 가능 상태로 복원되었습니다.',
          'success'
        );
      }

      return;
    }

    if (
      currentStatus ===
      USER_PROFILE_STATUS.PROFILE_REQUIRED
    ) {
      const redirectKey = `${firebaseAuthUser.uid}:${userProfile.profileRequiredReason || ''}`;

      if (profileRequiredRedirectRef.current !== redirectKey) {
        profileRequiredRedirectRef.current = redirectKey;
        replaceAppPath('user', 'mypage');
        setView('user');
        setUserTab('mypage');
        setIsCommunityMenuOpen(false);
        triggerToast(
          '등록 정보 확인이 필요합니다. 부서와 성명을 수정해 주세요.',
          'error'
        );
      }

      return;
    }

    if (
      userStatusLogoutInProgressRef.current
    ) {
      return;
    }

    userStatusLogoutInProgressRef.current = true;

    const statusPageType =
      currentStatus === USER_PROFILE_STATUS.PENDING
        ? 'loginPending'
        : currentStatus === USER_PROFILE_STATUS.BLOCKED
          ? 'loginBlocked'
          : 'loginRetired';

    const logoutInactiveUser = async () => {
      try {
        showUserAccountStatus(statusPageType);
        clearUserAuthenticatedSession();
        await signOut(firebaseAuth);

        clearUserLoginReturnTarget();
        clearAdminAuthSession();
        setAuthenticatedAdminId('');
        setAdminAuthExpiresAt(0);
          setAdminAuthAbsoluteExpiresAt(0);
          setAdminAuthPolicyVersion(0);
        setUserAuthForm(createDefaultUserAuthForm());
      } catch (error) {
        console.error(
          'Inactive user automatic logout error:',
          error
        );

        triggerToast(
          '회원 상태 변경은 확인했지만 자동 로그아웃에 실패했습니다. 페이지를 새로고침해 주세요.',
          'error'
        );
      } finally {
        userStatusLogoutInProgressRef.current = false;
      }
    };

    void logoutInactiveUser();
  }, [
    firebaseAuthUser,
    currentAuthRoleReady,
    currentAuthAdminAccount,
    authenticatedAdminId,
    userProfileReady,
    userProfile,
    userAuthLoading,
    userTab,
    withdrawalLoading,
  ]);

  useEffect(() => {
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthRoleErrorMessage ||
      currentAuthAdminAccount ||
      authenticatedAdminId ||
      !userProfileReady ||
      !userProfile ||
      userAuthLoading ||
      userDirectoryVerificationLoading
    ) {
      return;
    }

    const policyEnabled = isRegisteredMemberSignupRequired(data.settings);
    const directoryVersion = getSafeMemberDirectoryVersion(data.settings);
    const currentStatus = userProfile.status || '';
    const isDirectoryMismatchProfile =
      currentStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
      userProfile.profileRequiredReason ===
        PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
    const needsVerification =
      isDirectoryMismatchProfile ||
      (policyEnabled &&
        currentStatus === USER_PROFILE_STATUS.ACTIVE &&
        Number(userProfile.directoryVerifiedVersion || 0) !==
          directoryVersion);

    if (!needsVerification) {
      return;
    }

    const serviceMode = normalizeSiteSettings(siteSettings).serviceMode;
    const isPolicyDisabledRestore =
      !policyEnabled &&
      currentStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
      userProfile.profileRequiredReason ===
        PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;

    if (
      serviceMode !== SERVICE_MODE.NORMAL &&
      !isPolicyDisabledRestore
    ) {
      return;
    }

    const verificationKey = [
      firebaseAuthUser.uid,
      policyEnabled ? 'on' : 'off',
      directoryVersion,
      currentStatus,
      userProfile.name || '',
      userProfile.team || '',
      userProfile.profileRequiredReason || '',
    ].join(':');

    if (userDirectoryVerificationKeyRef.current === verificationKey) {
      return;
    }

    userDirectoryVerificationKeyRef.current = verificationKey;
    setUserDirectoryVerificationLoading(true);

    void verifyUserDirectoryMembership({
      authUser: firebaseAuthUser,
      account: userProfile,
    })
      .catch((error) => {
        console.error('User directory verification error:', error);
        userDirectoryVerificationKeyRef.current = '';
        triggerToast(
          error?.code === 'permission-denied'
            ? '회원가입 명부 정책 변경에 따른 회원 상태 동기화 권한이 거부되었습니다. 최신 Firestore Rules를 게시한 뒤 다시 로그인해 주세요.'
            : '회원 명부 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          'error'
        );
      })
      .finally(() => {
        setUserDirectoryVerificationLoading(false);
      });
  }, [
    authenticatedAdminId,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    data.settings,
    firebaseAuthUser,
    siteSettings.serviceMode,
    userAuthLoading,
    userDirectoryVerificationLoading,
    userProfile,
    userProfileReady,
  ]);

  const getCurrentUserLoginReturnTarget = () => {
    if (view !== 'user') {
      return null;
    }

    if (
      userTab === 'login' ||
      userTab === 'signup'
    ) {
      return readUserLoginReturnTarget();
    }

    if (userTab === 'notFound') {
      return {
        userTab: 'home',
        routeId: '',
        noticePostId: '',
      };
    }

    return normalizeUserLoginReturnTarget({
      userTab,
      routeId:
        userTab === 'footerPage'
          ? selectedFooterPageId
          : '',
      noticePostId:
        userTab === 'notice'
          ? selectedNoticePostId
          : '',
    });
  };

  const saveCurrentUserLoginReturnTarget = () => {
    const returnTarget =
      getCurrentUserLoginReturnTarget();

    if (!returnTarget) {
      return readUserLoginReturnTarget();
    }

    return writeUserLoginReturnTarget(
      returnTarget
    );
  };

  const navigateToUserReturnTarget = (
    rawTarget,
    { replace = false } = {}
  ) => {
    let target =
      normalizeUserLoginReturnTarget(
        rawTarget
      ) || {
        userTab: 'rental',
        routeId: '',
        noticePostId: '',
      };

    if (target.userTab === 'footerPage') {
      const requestedFooterPage =
        footerPages.find(
          (page) =>
            page.id === target.routeId &&
            page.enabled !== false
        );

      if (
        footerPagesReady &&
        !requestedFooterPage
      ) {
        target = {
          userTab: 'home',
          routeId: '',
          noticePostId: '',
        };
      }
    }

    const updatePath = replace
      ? replaceAppPath
      : pushAppPath;

    updatePath(
      'user',
      target.userTab,
      target.routeId
    );

    setView('user');
    setUserTab(target.userTab);
    setSelectedFooterPageId(
      target.userTab === 'footerPage'
        ? target.routeId
        : ''
    );
    setSelectedNoticePostId(
      target.userTab === 'notice'
        ? target.noticePostId
        : ''
    );
    setIsCommunityMenuOpen(false);

    if (typeof window !== 'undefined') {
      window.scrollTo({
        top: 0,
        behavior: 'auto',
      });
    }
  };

  const goToProtectedUserTab = (
    nextUserTab
  ) => {
    if (
      !PROTECTED_USER_TABS.has(
        nextUserTab
      )
    ) {
      return;
    }

    if (
      !firebaseAuthReady ||
      !currentAuthRoleReady
    ) {
      pendingProtectedUserTabRef.current =
        nextUserTab;
      return;
    }

    pendingProtectedUserTabRef.current = '';

    if (!hasFirebaseAuthSession) {
      writeUserLoginReturnTarget({
        userTab: nextUserTab,
        routeId: '',
        noticePostId: '',
      });

      replaceAppPath('user', 'login');
      setView('user');
      setUserTab('login');
      setSelectedFooterPageId('');
      setSelectedNoticePostId('');
      setIsCommunityMenuOpen(false);
      return;
    }

    const directoryPolicyEnabled = isRegisteredMemberSignupRequired(
      data.settings
    );
    const directoryVersion = getSafeMemberDirectoryVersion(data.settings);
    const directoryAccessRestricted = Boolean(
      userProfile &&
        (userProfile.status === USER_PROFILE_STATUS.PROFILE_REQUIRED ||
          (directoryPolicyEnabled &&
            userProfile.status === USER_PROFILE_STATUS.ACTIVE &&
            Number(userProfile.directoryVerifiedVersion || 0) !==
              directoryVersion))
    );

    if (directoryAccessRestricted) {
      replaceAppPath('user', 'mypage');
      setView('user');
      setUserTab('mypage');
      setSelectedFooterPageId('');
      setSelectedNoticePostId('');
      setIsCommunityMenuOpen(false);
      triggerToast(
        '등록 정보 확인 후 서비스를 이용해 주세요.',
        'error'
      );
      return;
    }

    navigateToUserReturnTarget({
      userTab: nextUserTab,
      routeId: '',
      noticePostId: '',
    });
  };

  useEffect(() => {
    if (
      !firebaseAuthReady ||
      !currentAuthRoleReady ||
      !pendingProtectedUserTabRef.current
    ) {
      return;
    }

    const pendingUserTab =
      pendingProtectedUserTabRef.current;

    pendingProtectedUserTabRef.current = '';
    goToProtectedUserTab(pendingUserTab);
  }, [
    firebaseAuthReady,
    currentAuthRoleReady,
    firebaseAuthUser,
    hasFirebaseAuthSession,
  ]);

  const goToUserHome = () => {
    pendingProtectedUserTabRef.current = '';

    if (
      userTab === 'login' ||
      userTab === 'signup'
    ) {
      clearUserLoginReturnTarget();
    }

    navigateToUserReturnTarget({
      userTab: 'home',
      routeId: '',
      noticePostId: '',
    });
  };

  const goToUserNotice = () => {
    pendingProtectedUserTabRef.current = '';

    if (
      userTab === 'login' ||
      userTab === 'signup'
    ) {
      clearUserLoginReturnTarget();
    }

    navigateToUserReturnTarget({
      userTab: 'notice',
      routeId: '',
      noticePostId: '',
    });
  };

  const goToUserFaq = () => {
    pendingProtectedUserTabRef.current = '';

    if (
      userTab === 'login' ||
      userTab === 'signup'
    ) {
      clearUserLoginReturnTarget();
    }

    navigateToUserReturnTarget({
      userTab: 'faq',
      routeId: '',
      noticePostId: '',
    });
  };

  const goToAppHome = () => {
    if (
      view === 'admin' &&
      typeof window !== 'undefined' &&
      window.__mkHomeBannerUnsaved &&
      !window.confirm('저장하지 않은 초기화면 배너 또는 표시 설정 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?')
    ) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.__mkHomeBannerUnsaved = false;
    }

    if (view === 'admin') {
      pushAppPath('admin');
      setView('admin');
      handleAdminTabChange('dashboard');
      setIsCommunityMenuOpen(false);
      return;
    }

    goToUserHome();
  };

  useEffect(() => {
    const syncViewWithPath = () => {
      const nextRouteState = getRouteStateFromPath();

      pendingProtectedUserTabRef.current = '';

      if (
        nextRouteState.redirectTo &&
        window.location.pathname !== nextRouteState.redirectTo
      ) {
        window.history.replaceState(null, '', nextRouteState.redirectTo);
      }

      if (
        nextRouteState.view === 'user' &&
        ![
          'login',
          'signup',
          'rental',
          'history',
        ].includes(
          nextRouteState.userTab
        )
      ) {
        clearUserLoginReturnTarget();
      }

      setView(nextRouteState.view);
      setUserTab(nextRouteState.userTab);
      setSelectedFooterPageId(nextRouteState.footerPageId || '');
      setIsCommunityMenuOpen(false);
    };

    syncViewWithPath();

    window.addEventListener('popstate', syncViewWithPath);

    return () => {
      window.removeEventListener('popstate', syncViewWithPath);
    };
  }, []);

  useEffect(() => {
    if (
      view !== 'user' ||
      !PROTECTED_USER_TABS.has(userTab)
    ) {
      return;
    }

    if (
      !firebaseAuthReady ||
      !currentAuthRoleReady ||
      userAuthLoading ||
      adminLogoutInProgress ||
      userStatusLogoutInProgressRef.current
    ) {
      return;
    }

    if (hasFirebaseAuthSession) {
      return;
    }

    writeUserLoginReturnTarget({
      userTab,
      routeId: '',
      noticePostId: '',
    });

    replaceAppPath('user', 'login');
    setUserTab('login');
    setSelectedFooterPageId('');
    setSelectedNoticePostId('');
    setIsCommunityMenuOpen(false);
  }, [
    view,
    userTab,
    firebaseAuthReady,
    currentAuthRoleReady,
    firebaseAuthUser,
    hasFirebaseAuthSession,
    userAuthLoading,
    adminLogoutInProgress,
  ]);

    useEffect(() => {
    if (!isCommunityMenuOpen) return;

    const handleCommunityMenuOutsideClick = (event) => {
      if (
        communityMenuRef.current &&
        !communityMenuRef.current.contains(event.target)
      ) {
        setIsCommunityMenuOpen(false);
      }
    };

    const handleCommunityMenuEscape = (event) => {
      if (event.key === 'Escape') {
        setIsCommunityMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleCommunityMenuOutsideClick, true);
    document.addEventListener('touchstart', handleCommunityMenuOutsideClick, true);
    document.addEventListener('keydown', handleCommunityMenuEscape, true);

    return () => {
      document.removeEventListener('mousedown', handleCommunityMenuOutsideClick, true);
      document.removeEventListener('touchstart', handleCommunityMenuOutsideClick, true);
      document.removeEventListener('keydown', handleCommunityMenuEscape, true);
    };
  }, [isCommunityMenuOpen]);

  useEffect(() => {
    const updateAssetGridColumns = () => {
      if (window.matchMedia('(min-width: 1280px)').matches) {
        setAssetGridColumns(3);
      } else if (window.matchMedia('(min-width: 640px)').matches) {
        setAssetGridColumns(2);
      } else {
        setAssetGridColumns(1);
      }
    };

    updateAssetGridColumns();
    window.addEventListener('resize', updateAssetGridColumns);

    return () => {
      window.removeEventListener('resize', updateAssetGridColumns);
    };
  }, []);

  useEffect(() => {
    setSiteSettingsReady(false);
    const unsubscribe = onSnapshot(
      SITE_SETTINGS_DOC_REF,
      (snapshot) => {
        const nextSettings = normalizeSiteSettings(
          snapshot.exists() ? snapshot.data() : DEFAULT_SITE_SETTINGS
        );
        setSiteSettings(nextSettings);
        setSiteSettingsLoadErrorMessage('');
        setSiteSettingsReady(true);
      },
      (error) => {
        console.error('Site settings sync error:', error);
        setSiteSettings(DEFAULT_SITE_SETTINGS);
        setSiteSettingsLoadErrorMessage(
          '사이트 공통 설정을 불러오지 못했습니다. 기본 설정으로 표시합니다.'
        );
        setSiteSettingsReady(true);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const normalized = normalizeSiteSettings(siteSettings);
    const root = document.documentElement;
    root.style.setProperty('--mk-orange', normalized.primaryColor);
    root.style.setProperty('--mk-orange-dark', normalized.primaryDarkColor);
    root.style.setProperty('--mk-orange-soft', normalized.primaryColor + '1A');
    root.style.setProperty('--mk-orange-border', normalized.primaryColor + '40');
    root.style.setProperty('--mk-orange-ring', normalized.primaryColor + '26');
    root.style.setProperty('--mk-orange-shadow', normalized.primaryColor + '33');

    document.title = normalized.browserTitle || normalized.siteName;
    let descriptionMeta = document.querySelector('meta[name="description"]');
    if (!descriptionMeta) {
      descriptionMeta = document.createElement('meta');
      descriptionMeta.setAttribute('name', 'description');
      document.head.appendChild(descriptionMeta);
    }
    descriptionMeta.setAttribute('content', normalized.metaDescription || '');

    let favicon = document.querySelector('link[rel="icon"]');
    if (normalized.faviconUrl) {
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.setAttribute('rel', 'icon');
        document.head.appendChild(favicon);
      }
      favicon.setAttribute('href', normalized.faviconUrl);
    }
  }, [siteSettings]);

  useEffect(() => {
    const shouldSubscribeForActiveUser = Boolean(
      firebaseAuthUser &&
      currentAuthRoleReady &&
      !currentAuthRoleErrorMessage &&
      !currentAuthAdminAccount &&
      !authenticatedAdminId
    );
    const shouldSubscribeForAdminSecurity = Boolean(
      firebaseAuthUser &&
      currentAuthRoleReady &&
      (currentAuthAdminAccount || authenticatedAdminId) &&
      view === 'admin' &&
      adminTab === 'accountSecurity'
    );
    const shouldSubscribeUserSessionPolicy =
      shouldSubscribeForActiveUser || shouldSubscribeForAdminSecurity;

    if (!shouldSubscribeUserSessionPolicy) {
      setUserSessionPolicyReady(false);
      setUserSessionPolicyLoadErrorMessage('');
      return undefined;
    }

    setUserSessionPolicyReady(false);
    const unsubscribe = onSnapshot(
      USER_SESSION_POLICY_DOC_REF,
      (snapshot) => {
        setUserSessionPolicy(
          normalizeUserSessionPolicy(
            snapshot.exists() ? snapshot.data() : DEFAULT_USER_SESSION_POLICY
          )
        );
        setUserSessionPolicyLoadErrorMessage('');
        setUserSessionPolicyReady(true);
      },
      (error) => {
        console.error('User session policy sync error:', error);
        setUserSessionPolicy(DEFAULT_USER_SESSION_POLICY);
        setUserSessionPolicyLoadErrorMessage(
          '사용자 세션 정책을 불러오지 못해 기본값을 사용합니다.'
        );
        setUserSessionPolicyReady(true);
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthUser?.uid,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    currentAuthAdminAccount?.id,
    authenticatedAdminId,
    view,
    adminTab,
  ]);

  useEffect(() => {
    const canReadSystemAdminSettings = Boolean(
      firebaseAuthUser &&
      currentAuthRoleReady &&
      (currentAuthAdminAccount || authenticatedAdminId)
    );

    if (!canReadSystemAdminSettings) {
      setSystemAdminSettings(DEFAULT_SYSTEM_ADMIN_SETTINGS);
      setSystemAdminSettingsReady(true);
      setSystemAdminSettingsLoadErrorMessage('');
      return undefined;
    }

    setSystemAdminSettingsReady(false);
    const unsubscribe = onSnapshot(
      SYSTEM_ADMIN_SETTINGS_DOC_REF,
      (snapshot) => {
        setSystemAdminSettings(
          normalizeSystemAdminSettings(
            snapshot.exists() ? snapshot.data() : DEFAULT_SYSTEM_ADMIN_SETTINGS
          )
        );
        setSystemAdminSettingsLoadErrorMessage('');
        setSystemAdminSettingsReady(true);
      },
      (error) => {
        console.error('System admin settings sync error:', error);
        setSystemAdminSettings(DEFAULT_SYSTEM_ADMIN_SETTINGS);
        setSystemAdminSettingsLoadErrorMessage(
          '관리자 시스템 설정을 불러오지 못했습니다.'
        );
        setSystemAdminSettingsReady(true);
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthUser?.uid,
    currentAuthRoleReady,
    currentAuthAdminAccount?.id,
    authenticatedAdminId,
  ]);

  useEffect(() => {
    setSplitSourceReady((prev) => ({
      ...prev,
      config: false,
    }));

    const unsubscribe = onSnapshot(
      PUBLIC_CONFIG_DOC_REF,
      (snapshot) => {
        if (!snapshot.exists()) {
          const message =
            'Firestore 공개 설정 문서가 없습니다. rentalSystem/publicConfig 마이그레이션 상태를 확인해 주세요.';

          setSplitPublicConfig(null);
          setSplitStorageVersion(0);
          setSplitSourceErrors((prev) => ({
            ...prev,
            config: message,
          }));
          setSplitSourceReady((prev) => ({
            ...prev,
            config: true,
          }));
          setFirebaseReady(true);
          setToast({
            message,
            type: 'error',
          });
          return;
        }

        const configData = snapshot.data();

        setSplitPublicConfig(configData);
        setSplitStorageVersion(
          Number(configData.storageVersion || 0)
        );
        setSplitSourceErrors((prev) => ({
          ...prev,
          config: '',
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          config: true,
        }));
      },
      (error) => {
        const message =
          'Firestore 공개 설정을 불러오지 못했습니다. rentalSystem/publicConfig 읽기 권한을 확인해 주세요.';

        console.error('Public config sync error:', error);
        setSplitPublicConfig(null);
        setSplitStorageVersion(0);
        setSplitSourceErrors((prev) => ({
          ...prev,
          config: message,
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          config: true,
        }));
        setFirebaseReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const shouldLoadUserCatalog =
      view === 'user' && ['home', 'rental'].includes(userTab);
    const shouldSubscribeAdminAssets =
      view === 'admin' &&
      Boolean(authenticatedAdminId) &&
      Boolean(currentAuthAdminAccount?.id) &&
      [
        'laptops',
        'requests',
        'categories',
        'dataManagement',
      ].includes(adminTab);

    if (!shouldLoadUserCatalog && !shouldSubscribeAdminAssets) {
      setPublicCatalogAssets([]);
      setPublicCatalogAssetsReady(false);
      setSplitSourceErrors((prev) => ({
        ...prev,
        assets: '',
      }));
      setSplitSourceReady((prev) => ({
        ...prev,
        assets: true,
      }));
      return undefined;
    }

    setFirebaseReady(false);
    setSplitSourceReady((prev) => ({
      ...prev,
      assets: false,
    }));

    if (shouldSubscribeAdminAssets) {
      setPublicCatalogAssets([]);
      setPublicCatalogAssetsReady(false);

      const unsubscribe = onSnapshot(
        RENTAL_ASSETS_COLLECTION_REF,
        (snapshot) => {
          const assets = snapshot.docs.map((assetDocument) => ({
            ...assetDocument.data(),
            id: assetDocument.id,
            reservations: normalizeAssetReservations(
              assetDocument.data().reservations || []
            ),
          }));

          setSplitRentalAssets(assets);
          setSplitSourceErrors((prev) => ({
            ...prev,
            assets: '',
          }));
          setSplitSourceReady((prev) => ({
            ...prev,
            assets: true,
          }));
        },
        (error) => {
          const message =
            '대여 자산 컬렉션을 불러오지 못했습니다. rentalAssets 읽기 권한을 확인해 주세요.';

          console.error('Rental assets sync error:', error);
          setSplitRentalAssets([]);
          setSplitSourceErrors((prev) => ({
            ...prev,
            assets: message,
          }));
          setSplitSourceReady((prev) => ({
            ...prev,
            assets: true,
          }));
          setFirebaseReady(true);
          setToast({
            message,
            type: 'error',
          });
        }
      );

      return unsubscribe;
    }

    let cancelled = false;
    setPublicCatalogAssetsReady(false);

    const loadLegacyAssetFallback = async (reason = '') => {
      try {
        const fallbackSnapshot = await getDocs(RENTAL_ASSETS_COLLECTION_REF);
        if (cancelled) return;

        const fallbackAssets = normalizePublicCatalogAssets(
          fallbackSnapshot.docs.map((assetDocument) => ({
            ...assetDocument.data(),
            id: assetDocument.id,
          }))
        );

        setPublicCatalogAssets(fallbackAssets);
        setPublicCatalogAssetsReady(true);
        setSplitSourceErrors((prev) => ({
          ...prev,
          assets: '',
        }));

        if (reason) {
          console.warn(
            'Public asset catalog fallback activated:',
            reason
          );
        }
      } catch (fallbackError) {
        if (cancelled) return;

        const message =
          '공개 자산 카탈로그와 기존 자산 목록을 모두 불러오지 못했습니다.';
        console.error('Public asset catalog fallback error:', fallbackError);
        setPublicCatalogAssets([]);
        setPublicCatalogAssetsReady(true);
        setSplitRentalAssets([]);
        setSplitSourceErrors((prev) => ({
          ...prev,
          assets: message,
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          assets: true,
        }));
        setFirebaseReady(true);
        setToast({ message, type: 'error' });
      }
    };

    const unsubscribe = onSnapshot(
      PUBLIC_ASSET_CATALOG_DOC_REF,
      (snapshot) => {
        if (cancelled) return;

        const catalogData = snapshot.exists()
          ? snapshot.data()
          : null;
        const hasCurrentCatalogSchema =
          Number(catalogData?.schemaVersion || 0) ===
            PUBLIC_ASSET_CATALOG_SCHEMA_VERSION &&
          Array.isArray(catalogData?.assets);

        if (!hasCurrentCatalogSchema) {
          void loadLegacyAssetFallback(
            snapshot.exists()
              ? 'publicCatalog/main 문서가 이전 스키마입니다.'
              : 'publicCatalog/main 문서가 없습니다.'
          );
          return;
        }

        const catalogAssets = normalizePublicCatalogAssets(
          snapshot.data().assets
        );
        setPublicCatalogAssets(catalogAssets);
        setPublicCatalogAssetsReady(true);
        setSplitSourceErrors((prev) => ({
          ...prev,
          assets: '',
        }));
      },
      (error) => {
        if (cancelled) return;
        console.error('Public asset catalog sync error:', error);
        void loadLegacyAssetFallback(error?.code || error?.message || 'unknown-error');
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    view,
    userTab,
    adminTab,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
  ]);

  useEffect(() => {
    const shouldHydrateUserCatalog =
      view === 'user' &&
      ['home', 'rental'].includes(userTab) &&
      publicCatalogAssetsReady &&
      splitSourceReady.availability;

    if (!shouldHydrateUserCatalog) {
      return;
    }

    setSplitRentalAssets(
      hydratePublicCatalogAssets(
        publicCatalogAssets,
        splitRentalAvailability
      )
    );
    setSplitSourceErrors((prev) => ({
      ...prev,
      assets: '',
    }));
    setSplitSourceReady((prev) => ({
      ...prev,
      assets: true,
    }));
  }, [
    view,
    userTab,
    publicCatalogAssets,
    publicCatalogAssetsReady,
    splitRentalAvailability,
    splitSourceReady.availability,
  ]);

  useEffect(() => {
    const shouldSubscribeAvailability =
      (view === 'user' && ['home', 'rental'].includes(userTab)) ||
      (
        view === 'admin' &&
        Boolean(authenticatedAdminId) &&
        Boolean(currentAuthAdminAccount?.id) &&
        ['laptops', 'requests'].includes(adminTab)
      );

    if (!shouldSubscribeAvailability) {
      setSplitSourceErrors((prev) => ({
        ...prev,
        availability: '',
      }));
      setSplitSourceReady((prev) => ({
        ...prev,
        availability: true,
      }));
      return undefined;
    }

    setFirebaseReady(false);
    setSplitSourceReady((prev) => ({
      ...prev,
      availability: false,
    }));

    const unsubscribe = onSnapshot(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      (snapshot) => {
        const availabilityRequests = snapshot.docs.map(
          (availabilityDocument) => ({
            ...availabilityDocument.data(),
            id: availabilityDocument.id,
          })
        );

        setSplitRentalAvailability(availabilityRequests);
        setSplitSourceErrors((prev) => ({
          ...prev,
          availability: '',
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          availability: true,
        }));
      },
      (error) => {
        const message =
          '공개 예약 현황을 불러오지 못했습니다. rentalAvailability 읽기 권한을 확인해 주세요.';

        console.error('Rental availability sync error:', error);
        setSplitRentalAvailability([]);
        setSplitSourceErrors((prev) => ({
          ...prev,
          availability: message,
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          availability: true,
        }));
        setFirebaseReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, [
    view,
    userTab,
    adminTab,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
  ]);


  useEffect(() => {
    const shouldLoadRentalBorrowers =
      firebaseAuthReady &&
      currentAuthRoleReady &&
      !currentAuthRoleErrorMessage &&
      view === 'admin' &&
      Boolean(authenticatedAdminId) &&
      Boolean(currentAuthAdminAccount?.id) &&
      ['people', 'signupPolicy', 'adminAccounts'].includes(adminTab);

    if (!shouldLoadRentalBorrowers) {
      setSplitRentalBorrowers([]);
      setSplitSourceErrors((prev) => ({
        ...prev,
        borrowers: '',
      }));
      setSplitSourceReady((prev) => ({
        ...prev,
        borrowers: true,
      }));
      return undefined;
    }

    setSplitSourceReady((prev) => ({
      ...prev,
      borrowers: false,
    }));

    const unsubscribe = onSnapshot(
      RENTAL_BORROWERS_COLLECTION_REF,
      (snapshot) => {
        const borrowers = snapshot.docs
          .map((borrowerDocument, index) => ({
            ...borrowerDocument.data(),
            id: borrowerDocument.id,
            sortOrder:
              Number.isFinite(
                Number(borrowerDocument.data().sortOrder)
              )
                ? Number(borrowerDocument.data().sortOrder)
                : index,
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder);

        setSplitRentalBorrowers(borrowers);
        setSplitSourceErrors((prev) => ({
          ...prev,
          borrowers: '',
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          borrowers: true,
        }));
      },
      (error) => {
        const message =
          '대여자 목록을 불러오지 못했습니다. rentalBorrowers 조회 권한을 확인해 주세요.';

        console.error('Rental borrowers sync error:', error);
        setSplitRentalBorrowers([]);
        setSplitSourceErrors((prev) => ({
          ...prev,
          borrowers: message,
        }));
        setSplitSourceReady((prev) => ({
          ...prev,
          borrowers: true,
        }));
        setFirebaseReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthReady,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    view,
    adminTab,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
  ]);


  useEffect(() => {
    const allSplitSourcesReady =
      splitSourceReady.config &&
      splitSourceReady.assets &&
      splitSourceReady.availability &&
      splitSourceReady.borrowers;

    if (!allSplitSourcesReady) {
      return;
    }

    const splitLoadError = Object.values(
      splitSourceErrors
    ).find(Boolean);

    if (splitLoadError) {
      setFirebaseLoadErrorMessage(
        splitLoadError
      );
      setFirebaseReady(true);
      return;
    }

    if (!splitPublicConfig) {
      return;
    }

    const remoteData = mergePersistedData({
      laptops: splitRentalAssets,
      requests: splitRentalAvailability,
      assetCategories:
        splitPublicConfig.assetCategories || [],
      teams: splitPublicConfig.teams || [],
      borrowers: splitRentalBorrowers,
      settings: splitPublicConfig.settings || {},
    });

    setData(remoteData);
    setFirebaseLoadErrorMessage('');
    setFirebaseReady(true);

    if (!initializedRemoteFormRef.current) {
      setForm(
        createDefaultRequestForm(remoteData.settings)
      );
      setTempSettings(remoteData.settings);
      initializedRemoteFormRef.current = true;
    }
  }, [
    splitSourceReady,
    splitRentalAssets,
    splitSourceErrors,
    splitPublicConfig,
    splitRentalAssets,
    splitRentalAvailability,
    splitRentalBorrowers,
  ]);

  useEffect(() => {
    if (!firebaseAuthReady || !currentAuthRoleReady) {
      setAdminAccountsReady(false);
      return undefined;
    }

    const hasAdminSession =
      Boolean(authenticatedAdminId) &&
      Boolean(currentAuthAdminAccount?.id);

    const shouldLoadAdminAccounts =
      hasAdminSession &&
      view === 'admin' &&
      adminTab === 'adminAccounts';

    if (!shouldLoadAdminAccounts) {
      allowAdminAccountsWriteRef.current = false;
      setAdminAccounts(
        hasAdminSession && currentAuthAdminAccount
          ? [currentAuthAdminAccount]
          : []
      );
      setAdminAccountsRemoteHasData(hasAdminSession);
      setAdminAccountsReady(true);
      setAdminAccountsLoadErrorMessage('');
      return undefined;
    }

    setAdminAccountsReady(false);

    const unsubscribe = onSnapshot(
      ADMIN_ACCOUNTS_COLLECTION_REF,
      (snapshot) => {
        try {
          if (snapshot.empty) {
            const message =
              '최상위 adminAccounts 컬렉션에 관리자 문서가 없습니다. 기존 관리자 데이터를 UID 문서로 이전했는지 확인해 주세요.';

            allowAdminAccountsWriteRef.current = false;
            setAdminAccountsRemoteHasData(false);
            adminAccountsLastSyncedRef.current = {};
            adminAccountsApplyingRemoteRef.current = true;
            setAdminAccounts([]);
            setAdminAccountsLoadErrorMessage(message);
            setAdminAccountsReady(true);
            return;
          }

          const remoteAdminAccounts = normalizeAdminAccounts(
            snapshot.docs.map((adminDoc) => ({
              ...adminDoc.data(),
              id: adminDoc.id,
            }))
          );

          const remoteSyncMap = Object.fromEntries(
            remoteAdminAccounts.map((account) => [
              account.id,
              JSON.stringify(account),
            ])
          );

          allowAdminAccountsWriteRef.current = true;
          setAdminAccountsRemoteHasData(true);
          setAdminAccountsLoadErrorMessage('');
          adminAccountsLastSyncedRef.current = remoteSyncMap;
          adminAccountsApplyingRemoteRef.current = true;
          setAdminAccounts(remoteAdminAccounts);
          setAdminAccountsReady(true);
        } catch (error) {
          const message =
            '관리자 ID 컬렉션 동기화 처리 중 오류가 발생했습니다.';

          console.error(
            'Admin accounts collection snapshot handling error:',
            error
          );

          allowAdminAccountsWriteRef.current = false;
          setAdminAccountsRemoteHasData(false);
          setAdminAccountsLoadErrorMessage(message);
          setAdminAccountsReady(true);
          setToast({
            message,
            type: 'error',
          });
        }
      },
      (error) => {
        const message =
          '관리자 ID 컬렉션 연결 또는 권한 오류가 발생했습니다.';

        console.error('Admin accounts collection sync error:', error);
        allowAdminAccountsWriteRef.current = false;
        setAdminAccountsRemoteHasData(false);
        setAdminAccountsLoadErrorMessage(message);
        setAdminAccountsReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthReady,
    currentAuthRoleReady,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
    view,
    adminTab,
  ]);





  // 설정 탭으로 변경되거나 시스템 원본 설정 값이 변경될 때 임시 설정 버퍼를 동기화
  useEffect(() => {
    if (['serviceOperations', 'extensionSettings', 'holidaySettings'].includes(adminTab)) {
      setTempSettings(data.settings);
      setNewHolidayDate(today());
      setNewHolidayName('');
      setNewHolidayType(DEFAULT_HOLIDAY_TYPE);
      setHolidayImportYear(String(getKoreaNow().getUTCFullYear()));
      setHolidayImportLoading(false);
      if (adminTab === 'holidaySettings') {
        setHolidayManagementYear(String(getKoreaNow().getUTCFullYear()));
        setHolidayManagementMonth(getKoreaNow().getUTCMonth() + 1);
      }
    }
  }, [adminTab, data.settings]);

  // 자산 카테고리 탭으로 변경되거나 시스템 원본 카테고리 값이 변경될 때 임시 카테고리 버퍼를 동기화
  useEffect(() => {
    if (adminTab === 'categories') {
      setTempAssetCategories(data.assetCategories || []);
      setTempAssetCategoryRenameMap({});
      setEditingAssetCategoryIndex(null);
      setEditingAssetCategoryName('');
      setDraggingAssetCategoryIndex(null);
      setNewAssetCategory('');
    }
  }, [adminTab, data.assetCategories]);

  useEffect(() => {
    if (adminTab === 'adminAccounts') {
      setAdminAccountForm(createDefaultAdminAccountForm());
      setAdminAccountPage(1);
    }
  }, [adminTab]);

  useEffect(() => {
    if (!authenticatedAdminId) return;
    if (!firebaseAuthReady) return;
    if (!adminAccountsReady) return;

    const expireAdminSession = async () => {
      if (adminLogoutInProgressRef.current) return;

      adminLogoutInProgressRef.current = true;
      setAdminLogoutInProgress(true);

      const expiringAdminAccount =
        (adminAccounts || []).find(
          (account) => account.id === authenticatedAdminId
        ) ||
        (
          currentAuthAdminAccount?.id === authenticatedAdminId
            ? currentAuthAdminAccount
            : null
        );

      const shouldSignOutFirebaseAdmin =
        Boolean(expiringAdminAccount?.authUid) &&
        firebaseAuth.currentUser?.uid === expiringAdminAccount.authUid;

      let firebaseSignOutFailed = false;

      try {
        if (shouldSignOutFirebaseAdmin) {
          await signOut(firebaseAuth);
        }
      } catch (error) {
        firebaseSignOutFailed = true;
        console.error('Expired admin Firebase Auth logout error:', error);
      } finally {
        clearAdminAuthSession();
        setAuthenticatedAdminId('');
        setAdminAuthExpiresAt(0);
          setAdminAuthAbsoluteExpiresAt(0);
          setAdminAuthPolicyVersion(0);
        setAdminAuthForm(createDefaultAdminAuthForm());

        adminLogoutInProgressRef.current = false;
        setAdminLogoutInProgress(false);

        setToast({
          message: firebaseSignOutFailed
            ? '관리자 세션은 만료되었지만 Firebase Auth 로그아웃에 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.'
            : '관리자 세션이 만료되어 로그아웃되었습니다.',
          type: firebaseSignOutFailed ? 'error' : 'success',
        });

        window.setTimeout(() => setToast(null), 3000);
      }
    };

    if (!adminAuthExpiresAt || adminAuthExpiresAt <= Date.now()) {
      void expireAdminSession();
      return;
    }

    const remainingTime = adminAuthExpiresAt - Date.now();

    const sessionTimer = window.setTimeout(() => {
      void expireAdminSession();
    }, remainingTime);

    return () => {
      window.clearTimeout(sessionTimer);
    };
  }, [
    authenticatedAdminId,
    adminAuthExpiresAt,
    firebaseAuthReady,
    adminAccountsReady,
    adminAccounts,
    legacyAdminAccounts,
  ]);

  useEffect(() => {
    if (!authenticatedAdminId) return;
    if (!firebaseReady) return;
    if (!firebaseAuthReady) return;
    if (!adminAccountsReady) return;
    if (adminLogoutInProgressRef.current) return;

    const authenticatedAccount =
      (adminAccounts || []).find(
        (account) => account.id === authenticatedAdminId
      ) ||
      (
        currentAuthAdminAccount?.id === authenticatedAdminId
          ? currentAuthAdminAccount
          : null
      );

    const hasFirebaseAuthMismatch =
      Boolean(authenticatedAccount?.authUid) &&
      firebaseAuth.currentUser?.uid !== authenticatedAccount.authUid;
    const hasActiveAdminLock = Number(authenticatedAccount?.lockUntil || 0) > Date.now();

    if (!authenticatedAccount || hasFirebaseAuthMismatch || hasActiveAdminLock) {
      if (hasActiveAdminLock && firebaseAuth.currentUser) {
        void signOut(firebaseAuth).catch((error) => {
          console.error('Locked admin Firebase Auth logout error:', error);
        });
      }
      clearAdminAuthSession();
      setAuthenticatedAdminId('');
      setAdminAuthExpiresAt(0);
          setAdminAuthAbsoluteExpiresAt(0);
          setAdminAuthPolicyVersion(0);
    }
  }, [
    authenticatedAdminId,
    firebaseReady,
    firebaseAuthReady,
    firebaseAuthUser,
    adminAccountsReady,
    adminAccounts,
    legacyAdminAccounts,
  ]);

  const triggerToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerConfirm = (title, message, onConfirm) => {
    setConfirmModal({ title, message, onConfirm });
  };

  const {
    dashboardSummary,
    dashboardSummaryLoadErrorMessage,
    dashboardSummaryReady,
    dashboardSummaryRefreshing,
    refreshDashboardSummary,
  } = useDashboardSummary({
    firebaseAuthReady,
    currentAuthRoleReady,
    authenticatedAdminId,
    currentAuthAdminAccountId: currentAuthAdminAccount?.id || '',
    view,
    adminTab,
    triggerToast,
  });

  const verifyUserDirectoryMembership = async ({
    authUser,
    account,
    force = false,
  }) => {
    if (!authUser?.uid || !account) {
      throw createMemberPolicyError('member/account-not-ready');
    }

    const normalizedName = normalizeMemberName(account.name || '');
    const normalizedTeam = normalizeMemberTeam(account.team || '');
    const identityKey = await createMemberIdentityKey(
      normalizedTeam,
      normalizedName
    );

    return runTransaction(db, async (transaction) => {
      const configRef = PUBLIC_CONFIG_DOC_REF;
      const userRef = doc(
        db,
        USER_ACCOUNTS_COLLECTION_NAME,
        authUser.uid
      );
      const directoryRef = doc(
        MEMBER_DIRECTORY_KEYS_COLLECTION_REF,
        identityKey
      );
      const claimRef = doc(
        MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
        identityKey
      );

      const configSnapshot = await transaction.get(configRef);
      const userSnapshot = await transaction.get(userRef);

      if (!userSnapshot.exists()) {
        throw createMemberPolicyError('member/account-not-ready');
      }

      const currentAccount = userSnapshot.data();
      const latestName = normalizeMemberName(currentAccount.name || '');
      const latestTeam = normalizeMemberTeam(currentAccount.team || '');

      if (latestName !== normalizedName || latestTeam !== normalizedTeam) {
        throw createMemberPolicyError('member/profile-changed');
      }

      const settings = normalizeRentalPolicySettings({
        ...initialData.settings,
        ...(configSnapshot.exists()
          ? configSnapshot.data()?.settings || {}
          : {}),
      });
      const policyEnabled = isRegisteredMemberSignupRequired(settings);
      const directoryVersion = getSafeMemberDirectoryVersion(settings);
      const currentStatus = currentAccount.status || '';

      if (!policyEnabled) {
        if (
          currentStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
          currentAccount.profileRequiredReason ===
            PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH
        ) {
          const restoredStatus = getRestorableUserProfileStatus(
            currentAccount.statusBeforeProfileRequired
          );

          transaction.update(userRef, {
            status: restoredStatus,
            profileRequiredReason: '',
            profileRequiredAt: '',
            statusBeforeProfileRequired: '',
            updatedAt: serverTimestamp(),
          });

          if (currentAccount.recoveryKey) {
            transaction.set(
              doc(
                ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
                currentAccount.recoveryKey
              ),
              {
                recoveryKey: currentAccount.recoveryKey,
                maskedEmail: currentAccount.maskedEmail || '',
                accountStatus: restoredStatus,
                enabled: true,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }

          return {
            status: restoredStatus,
            policyEnabled: false,
            restored: true,
          };
        }

        return {
          status: currentStatus,
          policyEnabled: false,
          restored: false,
        };
      }

      if (
        !force &&
        currentStatus === USER_PROFILE_STATUS.ACTIVE &&
        Number(currentAccount.directoryVerifiedVersion || 0) ===
          directoryVersion
      ) {
        return {
          status: currentStatus,
          policyEnabled: true,
          verified: true,
        };
      }

      const directorySnapshot = await transaction.get(directoryRef);
      const claimSnapshot = await transaction.get(claimRef);
      const directoryData = directorySnapshot.exists()
        ? directorySnapshot.data()
        : null;
      const claimData = claimSnapshot.exists()
        ? claimSnapshot.data()
        : null;

      const directoryMatches = Boolean(
        directoryData &&
          directoryData.enabled !== false &&
          normalizeMemberName(directoryData.name || '') === normalizedName &&
          normalizeMemberTeam(directoryData.team || '') === normalizedTeam
      );
      const claimConflict = Boolean(
        claimData &&
          (claimData.conflict === true ||
            getClaimCurrentUid(claimData) !== authUser.uid)
      );

      if (directoryMatches && !claimConflict) {
        transaction.set(
          claimRef,
          {
            identityKey,
            uid: authUser.uid,
            currentUid: authUser.uid,
            status: 'active',
            name: normalizedName,
            team: normalizedTeam,
            conflict: false,
            conflictingUids: [],
            formerUids: getClaimFormerUids(claimData || {}),
            directoryMemberId: directoryData.directoryMemberId || '',
            restrictionSnapshot: claimData?.restrictionSnapshot || {},
            createdAt: claimData?.createdAt || serverTimestamp(),
            releasedAt: '',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        const shouldRestore =
          currentStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
          currentAccount.profileRequiredReason ===
            PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
        const nextStatus = shouldRestore
          ? getRestorableUserProfileStatus(
              currentAccount.statusBeforeProfileRequired
            )
          : currentStatus;

        transaction.update(userRef, {
          status: nextStatus,
          identityKey,
          directoryMemberId: directoryData.directoryMemberId || '',
          directoryVerifiedVersion: directoryVersion,
          directoryVerifiedAt: serverTimestamp(),
          profileRequiredReason: shouldRestore
            ? ''
            : currentAccount.profileRequiredReason || '',
          profileRequiredAt: shouldRestore
            ? ''
            : currentAccount.profileRequiredAt || '',
          statusBeforeProfileRequired: shouldRestore
            ? ''
            : currentAccount.statusBeforeProfileRequired || '',
          updatedAt: serverTimestamp(),
        });

        if (currentAccount.recoveryKey) {
          transaction.set(
            doc(ACCOUNT_RECOVERY_KEYS_COLLECTION_REF, currentAccount.recoveryKey),
            {
              accountStatus: nextStatus,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        return {
          status: nextStatus,
          policyEnabled: true,
          verified: true,
          restored: shouldRestore,
        };
      }

      const nextReason = claimConflict
        ? PROFILE_REQUIRED_REASON.DUPLICATE_IDENTITY
        : PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
      const statusBeforeProfileRequired =
        [USER_PROFILE_STATUS.ACTIVE, USER_PROFILE_STATUS.PENDING].includes(
          currentStatus
        )
          ? currentStatus
          : currentAccount.statusBeforeProfileRequired ||
            USER_PROFILE_STATUS.PENDING;

      transaction.update(userRef, {
        status: USER_PROFILE_STATUS.PROFILE_REQUIRED,
        statusBeforeProfileRequired,
        profileRequiredReason: nextReason,
        profileRequiredAt: serverTimestamp(),
        identityKey,
        directoryMemberId: directoryMatches
          ? directoryData.directoryMemberId || ''
          : '',
        directoryVerifiedVersion: 0,
        directoryVerifiedAt: '',
        updatedAt: serverTimestamp(),
      });

      if (currentAccount.recoveryKey) {
        transaction.set(
          doc(ACCOUNT_RECOVERY_KEYS_COLLECTION_REF, currentAccount.recoveryKey),
          {
            accountStatus: USER_PROFILE_STATUS.PROFILE_REQUIRED,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      return {
        status: USER_PROFILE_STATUS.PROFILE_REQUIRED,
        policyEnabled: true,
        verified: false,
        reason: nextReason,
      };
    });
  };

  const registeredAdminAccounts = adminAccounts || [];

  const authenticatedAdminAccount =
    registeredAdminAccounts.find(
      (account) => account.id === authenticatedAdminId
    ) ||
    (
      currentAuthAdminAccount?.id === authenticatedAdminId
        ? currentAuthAdminAccount
        : null
    );

  const isCurrentFirebaseAuthAdmin =
    Boolean(firebaseAuthUser) &&
    currentAuthRoleReady &&
    Boolean(currentAuthAdminAccount);

  const isCurrentFirebaseAuthGeneralUser =
    Boolean(firebaseAuthUser) &&
    currentAuthRoleReady &&
    !currentAuthRoleErrorMessage &&
    !currentAuthAdminAccount;

  const memberDirectoryPolicyEnabled =
    isRegisteredMemberSignupRequired(data.settings);
  const memberIdentityClaimsReady = Boolean(
    data.settings.memberIdentityClaimsReady
  );
  const currentMemberDirectoryVersion =
    getSafeMemberDirectoryVersion(data.settings);
  const isUserDirectoryAccessRestricted = Boolean(
    userProfile &&
      (userProfile.status === USER_PROFILE_STATUS.PROFILE_REQUIRED ||
        (memberDirectoryPolicyEnabled &&
          userProfile.status === USER_PROFILE_STATUS.ACTIVE &&
          Number(userProfile.directoryVerifiedVersion || 0) !==
            currentMemberDirectoryVersion))
  );
  const memberDirectoryAudit =
    splitPublicConfig?.memberDirectoryAudit || null;

  const mergedRentalRequests = useMemo(() => {
    const requestMap = new Map();
    const shouldMergeAvailabilitySummaries = view === 'user';

    if (shouldMergeAvailabilitySummaries) {
      (data.requests || []).forEach((request) => {
        if (!request?.id) return;
        requestMap.set(request.id, request);
      });
    }

    (rentalRequests || []).forEach((request) => {
      if (!request?.id) return;

      requestMap.set(request.id, {
        ...(requestMap.get(request.id) || {}),
        ...request,
      });
    });

    return Array.from(requestMap.values());
  }, [data.requests, rentalRequests, view, adminTab]);

  const orphanedRentalAvailabilityRequests = [];



  const noticePostsPerPage = getSafeNoticePostsPerPage(
    noticeBoardConfig.postsPerPage
  );

  const allPinnedNoticePosts = useMemo(
    () =>
      (noticePosts || []).filter(
        (post) => post.isPinned
      ),
    [noticePosts]
  );

  const allRegularNoticePosts = useMemo(
    () =>
      (noticePosts || []).filter(
        (post) => !post.isPinned
      ),
    [noticePosts]
  );

  const userNoticeSearchMode = Boolean(String(userNoticeQuery || '').trim());
  const adminNoticeSearchMode = Boolean(String(adminNoticeQuery || '').trim());
  const activeNoticePage =
    view === 'admin' && adminTab === 'noticePosts'
      ? adminNoticePage
      : noticePage;
  const activeNoticeSearchMode =
    view === 'admin' && adminTab === 'noticePosts'
      ? adminNoticeSearchMode
      : userNoticeSearchMode;

  const noticeRegularPostNumberById = useMemo(
    () =>
      new Map(
        allRegularNoticePosts.map((post, index) => [
          post.id,
          activeNoticeSearchMode
            ? allRegularNoticePosts.length - index
            : Math.max(
                1,
                noticeRegularTotalCount -
                  (activeNoticePage - 1) * noticePostsPerPage -
                  index
              ),
        ])
      ),
    [
      allRegularNoticePosts,
      activeNoticePage,
      activeNoticeSearchMode,
      noticeRegularTotalCount,
      noticePostsPerPage,
    ]
  );

  const pinnedNoticePosts = useMemo(
    () =>
      filterNoticePostsByQuery(
        allPinnedNoticePosts,
        userNoticeQuery
      ),
    [allPinnedNoticePosts, userNoticeQuery]
  );

  const regularNoticePosts = useMemo(
    () =>
      filterNoticePostsByQuery(
        allRegularNoticePosts,
        userNoticeQuery
      ),
    [allRegularNoticePosts, userNoticeQuery]
  );

  const adminPinnedNoticePosts = useMemo(
    () =>
      filterNoticePostsByQuery(
        allPinnedNoticePosts,
        adminNoticeQuery
      ),
    [allPinnedNoticePosts, adminNoticeQuery]
  );

  const adminRegularNoticePosts = useMemo(
    () =>
      filterNoticePostsByQuery(
        allRegularNoticePosts,
        adminNoticeQuery
      ),
    [allRegularNoticePosts, adminNoticeQuery]
  );

  const noticeTotalPages = Math.max(
    1,
    Math.ceil(
      (userNoticeSearchMode
        ? regularNoticePosts.length
        : noticeRegularTotalCount) / noticePostsPerPage
    )
  );

  const safeNoticePage = Math.min(noticePage, noticeTotalPages);

  const paginatedNoticePosts = useMemo(
    () =>
      userNoticeSearchMode
        ? regularNoticePosts.slice(
            (safeNoticePage - 1) * noticePostsPerPage,
            safeNoticePage * noticePostsPerPage
          )
        : regularNoticePosts,
    [
      userNoticeSearchMode,
      regularNoticePosts,
      safeNoticePage,
      noticePostsPerPage,
    ]
  );

  const adminNoticeTotalPages = Math.max(
    1,
    Math.ceil(
      (adminNoticeSearchMode
        ? adminRegularNoticePosts.length
        : noticeRegularTotalCount) / noticePostsPerPage
    )
  );

  const safeAdminNoticePage = Math.min(
    adminNoticePage,
    adminNoticeTotalPages
  );

  const paginatedAdminNoticePosts = useMemo(
    () =>
      adminNoticeSearchMode
        ? adminRegularNoticePosts.slice(
            (safeAdminNoticePage - 1) * noticePostsPerPage,
            safeAdminNoticePage * noticePostsPerPage
          )
        : adminRegularNoticePosts,
    [
      adminNoticeSearchMode,
      adminRegularNoticePosts,
      safeAdminNoticePage,
      noticePostsPerPage,
    ]
  );

  const selectedNoticePost = useMemo(
    () =>
      selectedNoticePostId
        ? noticePosts.find(
            (post) => post.id === selectedNoticePostId
          ) ||
          (selectedNoticePostOverride?.id === selectedNoticePostId
            ? selectedNoticePostOverride
            : null)
        : null,
    [
      noticePosts,
      selectedNoticePostId,
      selectedNoticePostOverride,
    ]
  );

  const faqCategoryNameById = useMemo(
    () =>
      new Map(
        (faqCategories || []).map(
          (category) => [
            category.id,
            category.name,
          ]
        )
      ),
    [faqCategories]
  );

  const faqPostsPerPage = getSafeFaqPostsPerPage(
    faqBoardConfig.postsPerPage
  );

  const activeFaqCategoryName =
    activeFaqCategoryId === 'all'
      ? '전체'
      : faqCategoryNameById.get(
          activeFaqCategoryId
        ) || '선택 카테고리';

  const faqCategoryOrderById = useMemo(
    () =>
      new Map(
        (faqCategories || []).map(
          (category, index) => [
            category.id,
            index,
          ]
        )
      ),
    [faqCategories]
  );

  const categoryFilteredFaqPosts = useMemo(() => {
    const normalizedQuery = faqQuery
      .trim()
      .toLowerCase();

    const shouldLimitToActiveCategory =
      activeFaqCategoryId !== 'all' &&
      (
        !normalizedQuery ||
        faqSearchWithinCategory
      );

    return (faqPosts || [])
      .filter((post) => {
        const categoryMatched =
          !shouldLimitToActiveCategory ||
          post.categoryId ===
            activeFaqCategoryId;

        const keywordMatched =
          !normalizedQuery ||
          String(post.title || '')
            .toLowerCase()
            .includes(normalizedQuery) ||
          String(
            post.contentText ||
              post.content ||
              richTextHtmlToText(post.contentHtml || '')
          )
            .toLowerCase()
            .includes(normalizedQuery);

        return categoryMatched && keywordMatched;
      })
      .sort((first, second) => {
        const firstCategoryOrder =
          faqCategoryOrderById.get(
            first.categoryId
          ) ?? Number.MAX_SAFE_INTEGER;

        const secondCategoryOrder =
          faqCategoryOrderById.get(
            second.categoryId
          ) ?? Number.MAX_SAFE_INTEGER;

        if (
          firstCategoryOrder !==
          secondCategoryOrder
        ) {
          return (
            firstCategoryOrder -
            secondCategoryOrder
          );
        }

        return (
          getFirestoreTimestampMillis(
            second.createdAt
          ) -
          getFirestoreTimestampMillis(
            first.createdAt
          )
        );
      });
  }, [
    faqPosts,
    faqQuery,
    faqSearchWithinCategory,
    activeFaqCategoryId,
    faqCategoryOrderById,
  ]);

  const pinnedFaqPosts = useMemo(
    () =>
      categoryFilteredFaqPosts.filter(
        (post) => post.isPinned
      ),
    [categoryFilteredFaqPosts]
  );

  const regularFaqPosts = useMemo(
    () =>
      categoryFilteredFaqPosts.filter(
        (post) => !post.isPinned
      ),
    [categoryFilteredFaqPosts]
  );

  const faqSearchMode = Boolean(String(faqQuery || '').trim());

  const faqTotalPages = Math.max(
    1,
    Math.ceil(
      (faqSearchMode
        ? regularFaqPosts.length
        : faqRegularTotalCount) / faqPostsPerPage
    )
  );

  const safeFaqPage = Math.min(faqPage, faqTotalPages);

  const paginatedFaqPosts = useMemo(
    () =>
      faqSearchMode
        ? regularFaqPosts.slice(
            (safeFaqPage - 1) * faqPostsPerPage,
            safeFaqPage * faqPostsPerPage
          )
        : regularFaqPosts,
    [faqSearchMode, regularFaqPosts, safeFaqPage, faqPostsPerPage]
  );

  const displayedFaqPosts = useMemo(
    () =>
      [
        ...pinnedFaqPosts,
        ...paginatedFaqPosts,
      ].sort((first, second) => {
        const firstCategoryOrder =
          faqCategoryOrderById.get(
            first.categoryId
          ) ?? Number.MAX_SAFE_INTEGER;

        const secondCategoryOrder =
          faqCategoryOrderById.get(
            second.categoryId
          ) ?? Number.MAX_SAFE_INTEGER;

        if (
          firstCategoryOrder !==
          secondCategoryOrder
        ) {
          return (
            firstCategoryOrder -
            secondCategoryOrder
          );
        }

        return (
          getFirestoreTimestampMillis(
            second.createdAt
          ) -
          getFirestoreTimestampMillis(
            first.createdAt
          )
        );
      }),
    [
      pinnedFaqPosts,
      paginatedFaqPosts,
      faqCategoryOrderById,
    ]
  );

  const adminPinnedFaqPosts = useMemo(
    () =>
      (faqPosts || []).filter(
        (post) => post.isPinned
      ),
    [faqPosts]
  );

  const adminRegularFaqPosts = useMemo(
    () =>
      (faqPosts || []).filter(
        (post) => !post.isPinned
      ),
    [faqPosts]
  );

  const adminFaqTotalPages = Math.max(
    1,
    Math.ceil(faqRegularTotalCount / faqPostsPerPage)
  );

  const safeAdminFaqPage = Math.min(
    adminFaqPage,
    adminFaqTotalPages
  );

  const paginatedAdminFaqPosts = adminRegularFaqPosts;

  const currentUserRequests = useMemo(() => {
    if (!firebaseAuthUser?.uid) return [];

    const linkedRequesterUids = new Set(
      [
        firebaseAuthUser.uid,
        ...(Array.isArray(userProfile?.previousAccountUids)
          ? userProfile.previousAccountUids
          : []),
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    );
    const currentUserEmail = normalizeEmailAddress(
      firebaseAuthUser.email || userProfile?.email || ''
    );

    return mergedRentalRequests.filter((request) => {
      const requesterUid = String(request.requesterUid || '').trim();

      if (requesterUid && linkedRequesterUids.has(requesterUid)) {
        return true;
      }

      return Boolean(
        currentUserEmail &&
        normalizeEmailAddress(request.requesterEmail || '') === currentUserEmail
      );
    });
  }, [
    mergedRentalRequests,
    firebaseAuthUser?.uid,
    firebaseAuthUser?.email,
    userProfile?.email,
    userProfile?.previousAccountUids,
  ]);

  const currentUserRentalRestrictionStatus = useMemo(
    () =>
      getRentalRestrictionStatus({
        requests: currentUserRequests,
        requesterUid: firebaseAuthUser?.uid || '',
        settings: data.settings,
        restriction: currentUserRestriction,
        referenceDate: today(),
      }),
    [
      currentUserRequests,
      firebaseAuthUser?.uid,
      data.settings,
      currentUserRestriction,
    ]
  );

  const hasMatchingAdminFirebaseAuth =
    Boolean(authenticatedAdminAccount?.authUid) &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    firebaseAuth.currentUser?.uid === authenticatedAdminAccount.authUid &&
    currentAuthAdminAccount?.id === authenticatedAdminAccount.id;

  const isAdminAuthenticated =
    Boolean(authenticatedAdminAccount) &&
    !adminLogoutInProgress &&
    hasMatchingAdminFirebaseAuth;

  const {
    addFaqCategory,
    confirmDeleteFaqCategory,
    discardFaqBoardConfigChanges,
    discardNoticeBoardConfigChanges,
    faqBoardSettingsDirty,
    noticeBoardSettingsDirty,
    saveFaqBoardConfig,
    saveFaqCategoryName,
    saveNoticeBoardConfig,
    startEditFaqCategory,
  } = useAdminBoardSettingsController({
    activeFaqCategoryId,
    editingFaqCategoryId,
    editingFaqCategoryName,
    faqBoardConfig,
    faqBoardConfigReady,
    faqCategories,
    faqPostForm,
    faqPostsPerPageInput,
    getSafeFaqPostsPerPage,
    getSafeNoticePostsPerPage,
    isAdminAuthenticated,
    newFaqCategoryName,
    noticeBoardConfig,
    noticeBoardConfigReady,
    noticePostsPerPageInput,
    setActiveFaqCategoryId,
    setAdminExpandedFaqPostId,
    setAdminFaqPage,
    setAdminNoticePage,
    setEditingFaqCategoryId,
    setEditingFaqCategoryName,
    setExpandedFaqPostId,
    setFaqBoardConfig,
    setFaqBoardConfigSaving,
    setFaqCategoryDeletingId,
    setFaqCategorySavingId,
    setFaqPage,
    setFaqPostForm,
    setFaqPostsPerPageInput,
    setNewFaqCategoryName,
    setNoticeBoardConfig,
    setNoticeBoardConfigSaving,
    setNoticePage,
    setNoticePostsPerPageInput,
    triggerConfirm,
    triggerToast,
  });


  useEffect(() => {
    if (!isAdminAuthenticated) {
      publicCatalogMigrationAdminUidRef.current = '';
      return;
    }

    const adminUid =
      firebaseAuth.currentUser?.uid ||
      authenticatedAdminId ||
      currentAuthAdminAccount?.id ||
      '';

    if (
      !adminUid ||
      publicCatalogMigrationAdminUidRef.current === adminUid
    ) {
      return;
    }

    publicCatalogMigrationAdminUidRef.current = adminUid;
    let cancelled = false;

    const ensureWriteThroughCatalog = async () => {
      try {
        const result =
          await ensurePublicAssetCatalogWriteThrough({
            updatedByUid: adminUid,
          });

        if (!cancelled && result.rebuilt) {
          console.info(
            'Public asset catalog migrated to write-through synchronization:',
            result.assetCount
          );
        }
      } catch (error) {
        if (cancelled) return;

        publicCatalogMigrationAdminUidRef.current = '';
        console.error(
          'Public asset catalog write-through migration error:',
          error
        );

        const catalogErrorMessage =
          await getPublicAssetCatalogWriteErrorMessage(error);

        triggerToast(
          catalogErrorMessage ||
            '공개 자산 카탈로그 동기화 방식 전환에 실패했습니다. 데이터 관리에서 무결성 점검을 실행해 주세요.',
          'error'
        );
      }
    };

    void ensureWriteThroughCatalog();

    return () => {
      cancelled = true;
    };
  }, [
    isAdminAuthenticated,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
  ]);


  const isSplitStorageReady =
    splitStorageVersion >= SPLIT_STORAGE_VERSION;


  const openAdminMemberAccounts = useCallback(
    ({ query = '', statusFilter = 'all' } = {}) => {
      setAdminMemberAccountsNavigationRequest((currentRequest) => ({
        requestId: Number(currentRequest?.requestId || 0) + 1,
        query: String(query || ''),
        statusFilter: String(statusFilter || 'all'),
      }));
      setAdminTab('memberAccounts');
    },
    []
  );

  const handleAdminRequestsControllerStateChange = useCallback((nextState) => {
    adminRequestsControllerRef.current = {
      clearSelection:
        typeof nextState?.clearSelection === 'function'
          ? nextState.clearSelection
          : null,
      getRequestById:
        typeof nextState?.getRequestById === 'function'
          ? nextState.getRequestById
          : null,
      resetPage:
        typeof nextState?.resetPage === 'function'
          ? nextState.resetPage
          : null,
      updateRequests:
        typeof nextState?.updateRequests === 'function'
          ? nextState.updateRequests
          : null,
    };
  }, []);

  const openAdminRequests = useCallback(
    ({
      query = '',
      quickFilter = ADMIN_REQUEST_QUICK_FILTER.ALL,
      requestTab = ADMIN_REQUEST_TAB.PENDING,
      selectedRequestId = '',
    } = {}) => {
      setAdminRequestsNavigationRequest((currentRequest) => ({
        requestId: Number(currentRequest?.requestId || 0) + 1,
        query: String(query || ''),
        quickFilter: String(
          quickFilter || ADMIN_REQUEST_QUICK_FILTER.ALL
        ),
        requestTab: String(
          requestTab || ADMIN_REQUEST_TAB.PENDING
        ),
        selectedRequestId: String(selectedRequestId || ''),
      }));
      setAdminTab('requests');
    },
    []
  );

  const getAdminRequestById = useCallback(
    (requestId) =>
      adminRequestsControllerRef.current.getRequestById?.(requestId) || null,
    []
  );

  const updateAdminRequestPanelRequests = useCallback((updater) => {
    adminRequestsControllerRef.current.updateRequests?.(updater);
  }, []);

  const resetAdminRequestPanelPage = useCallback(() => {
    adminRequestsControllerRef.current.resetPage?.();
  }, []);

  const clearAdminRequestPanelSelection = useCallback(() => {
    adminRequestsControllerRef.current.clearSelection?.();
  }, []);

  const notifyAdminRequestMutation = useCallback(() => {
    setAdminRequestsMutationVersion((currentVersion) => currentVersion + 1);
  }, []);

  const handleMemberDirectoryDeferredStateChange = useCallback(
    (nextState) => {
      const nextDirty = Boolean(nextState?.dirty);

      memberDirectoryDeferredActionsRef.current = {
        discard:
          typeof nextState?.discard === 'function'
            ? nextState.discard
            : null,
        save:
          typeof nextState?.save === 'function'
            ? nextState.save
            : null,
      };

      setPeopleSettingsDirty((currentDirty) =>
        currentDirty === nextDirty
          ? currentDirty
          : nextDirty
      );
    },
    []
  );

  const handleSignupPolicyDeferredStateChange = useCallback(
    (nextState) => {
      const nextDirty = Boolean(nextState?.dirty);

      signupPolicyDeferredActionsRef.current = {
        discard:
          typeof nextState?.discard === 'function'
            ? nextState.discard
            : null,
        save:
          typeof nextState?.save === 'function'
            ? nextState.save
            : null,
      };

      setSignupPolicyDirty((currentDirty) =>
        currentDirty === nextDirty
          ? currentDirty
          : nextDirty
      );
    },
    []
  );

  const currentAdminDeferredSettingsDirty = Boolean(
    (adminTab === 'extensionSettings' && rentalPolicySettingsDirty) ||
      (adminTab === 'holidaySettings' && holidaySettingsDirty) ||
      (adminTab === 'categories' && assetCategorySettingsDirty) ||
      (adminTab === 'people' && peopleSettingsDirty) ||
      (adminTab === 'signupPolicy' && signupPolicyDirty) ||
      (adminTab === 'noticePosts' && noticeBoardSettingsDirty) ||
      (adminTab === 'faqPosts' && faqBoardSettingsDirty) ||
      (adminTab === 'footerManagement' && footerConfigDirty)
  );

  useEffect(() => {
    if (view !== 'admin' || !currentAdminDeferredSettingsDirty) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [view, currentAdminDeferredSettingsDirty]);


  const shouldShowAdminLoadingPage =
    view === 'admin' &&
    (
      !firebaseReady ||
      !firebaseAuthReady ||
      !currentAuthRoleReady ||
      !adminAccountsReady ||
      adminLogoutInProgress
    );

  const shouldShowAdminAccountsErrorPage =
    view === 'admin' &&
    firebaseReady &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    adminAccountsReady &&
    Boolean(
      adminAccountsLoadErrorMessage || currentAuthRoleErrorMessage
    );

  const hasAdminAccess =
    view === 'admin' &&
    firebaseReady &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    adminAccountsReady &&
    !firebaseLoadErrorMessage &&
    !adminAccountsLoadErrorMessage &&
    !currentAuthRoleErrorMessage &&
    isAdminAuthenticated;

  const shouldShowAdminLoginPage =
    view === 'admin' &&
    firebaseReady &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    adminAccountsReady &&
    !firebaseLoadErrorMessage &&
    !adminAccountsLoadErrorMessage &&
    !currentAuthRoleErrorMessage &&
    !isAdminAuthenticated;
  
  const finalizeSplitStorageMigration = async () => {
    if (splitStorageFinalizeLoading) {
      return;
    }

    if (!isAdminAuthenticated) {
      triggerToast(
        '분리 저장소 최종 전환은 인증된 관리자만 실행할 수 있습니다.',
        'error'
      );
      return;
    }

    setSplitStorageFinalizeLoading(true);

    try {
      const [
        configSnapshot,
        assetsSnapshot,
        availabilitySnapshot,
        borrowersSnapshot,
        existingRegistrySnapshot,
      ] = await Promise.all([
        getDoc(PUBLIC_CONFIG_DOC_REF),
        getDocs(RENTAL_ASSETS_COLLECTION_REF),
        getDocs(RENTAL_AVAILABILITY_COLLECTION_REF),
        getDocs(RENTAL_BORROWERS_COLLECTION_REF),
        getDocs(RENTAL_ASSET_NUMBERS_COLLECTION_REF),
      ]);

      if (!configSnapshot.exists()) {
        throw new Error('public-config-not-found');
      }

      const currentConfig = configSnapshot.data();
      const currentStorageVersion = Number(
        currentConfig.storageVersion || 0
      );

      if (currentStorageVersion >= SPLIT_STORAGE_VERSION) {
        triggerToast(
          'Firestore 분리 저장소 최종 전환이 이미 완료되어 있습니다.',
          'success'
        );
        return;
      }

      const availabilityByAssetId = new Map();

      availabilitySnapshot.docs.forEach(
        (availabilityDocument) => {
          const availabilityRequest =
            toRentalAvailabilityRequest({
              ...availabilityDocument.data(),
              id: availabilityDocument.id,
            });

          if (
            !availabilityRequest.id ||
            !availabilityRequest.laptopId ||
            !RENTAL_BLOCKING_REQUEST_STATUSES.includes(
              availabilityRequest.status
            )
          ) {
            throw new Error(
              'invalid-availability-document'
            );
          }

          const currentAssetReservations =
            availabilityByAssetId.get(
              availabilityRequest.laptopId
            ) || [];

          currentAssetReservations.push(
            availabilityRequest
          );

          availabilityByAssetId.set(
            availabilityRequest.laptopId,
            currentAssetReservations
          );
        }
      );

      const assetIdSet = new Set(
        assetsSnapshot.docs.map(
          (assetDocument) => assetDocument.id
        )
      );

      for (const availabilityAssetId of availabilityByAssetId.keys()) {
        if (!assetIdSet.has(availabilityAssetId)) {
          throw new Error(
            'availability-asset-not-found'
          );
        }
      }

      const assetNumberRegistryIdSet = new Set();
      const assetOperations = [];
      const registryOperations = [];

      assetsSnapshot.docs.forEach(
        (assetDocument) => {
          const assetData = assetDocument.data();
          const assetNo = String(
            assetData.assetNo || ''
          ).trim();

          if (!assetNo) {
            throw new Error(
              'asset-number-missing'
            );
          }

          const assetNoNormalized =
            normalizeAssetNumber(assetNo);

          const registryId =
            getAssetNumberRegistryId(assetNo);

          if (
            assetNumberRegistryIdSet.has(
              registryId
            )
          ) {
            throw new Error(
              'duplicate-asset-number'
            );
          }

          assetNumberRegistryIdSet.add(
            registryId
          );

          const reservations =
            normalizeAssetReservations(
              availabilityByAssetId.get(
                assetDocument.id
              ) || []
            );

          const representativeRequest =
            getLaptopRepresentativeRequest(
              reservations,
              assetDocument.id
            );

          const nextStatus =
            assetData.status ===
            STATUS.UNAVAILABLE
              ? STATUS.UNAVAILABLE
              : representativeRequest
                ? representativeRequest.status
                : STATUS.AVAILABLE;

          assetOperations.push({
            type: 'set',
            ref: assetDocument.ref,
            data: {
              reservations,
              assetNoNormalized,
              status: nextStatus,
              currentRequestId:
                representativeRequest?.id || null,
              updatedAt: serverTimestamp(),
            },
            options: {
              merge: true,
            },
          });

          registryOperations.push({
            type: 'set',
            ref: doc(
              RENTAL_ASSET_NUMBERS_COLLECTION_REF,
              registryId
            ),
            data: {
              id: registryId,
              assetId: assetDocument.id,
              assetNo,
              assetNoNormalized,
              updatedAt: serverTimestamp(),
            },
          });
        }
      );

      const borrowerOperations =
        borrowersSnapshot.docs.map(
          (borrowerDocument, index) => ({
            type: 'set',
            ref: borrowerDocument.ref,
            data: {
              id: borrowerDocument.id,
              name: String(
                borrowerDocument.data().name || ''
              ),
              team: String(
                borrowerDocument.data().team || ''
              ),
              sortOrder:
                Number.isFinite(
                  Number(
                    borrowerDocument.data().sortOrder
                  )
                )
                  ? Number(
                      borrowerDocument.data().sortOrder
                    )
                  : index,
              updatedAt: serverTimestamp(),
            },
            options: {
              merge: true,
            },
          })
        );

      const registryCleanupOperations =
        existingRegistrySnapshot.docs.map(
          (registryDocument) => ({
            type: 'delete',
            ref: registryDocument.ref,
          })
        );

      await commitFirestoreOperations(
        registryCleanupOperations
      );

      await commitFirestoreOperations([
        ...assetOperations,
        ...registryOperations,
        ...borrowerOperations,
      ]);

      await rebuildPublicAssetCatalogFromServer({
        updatedByUid:
          firebaseAuth.currentUser?.uid ||
          authenticatedAdminId ||
          currentAuthAdminAccount?.id ||
          '',
      });

      await setDoc(
        PUBLIC_CONFIG_DOC_REF,
        {
          storageVersion:
            SPLIT_STORAGE_VERSION,
          storageMode:
            'split-collections',
          storageReady: true,
          storageFinalizedBy:
            firebaseAuth.currentUser?.uid ||
            authenticatedAdminId ||
            '',
          storageFinalizedAt:
            serverTimestamp(),
          storageFinalizedCounts: {
            assets: assetsSnapshot.size,
            availabilityRequests:
              availabilitySnapshot.size,
            borrowers:
              borrowersSnapshot.size,
          },
          updatedAt: serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      triggerToast(
        `Firestore 분리 저장소 최종 전환이 완료되었습니다. 자산 ${assetsSnapshot.size}건, 진행 중 예약 ${availabilitySnapshot.size}건, 대여자 ${borrowersSnapshot.size}건을 검증했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'Split storage finalization error:',
        error
      );

      if (
        error?.message ===
        'availability-asset-not-found'
      ) {
        triggerToast(
          'rentalAvailability에 연결된 자산 문서가 없어 최종 전환을 중단했습니다. rentalAssets와 rentalAvailability의 laptopId를 확인해 주세요.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'duplicate-asset-number'
      ) {
        triggerToast(
          '중복된 자산관리번호가 있어 최종 전환을 중단했습니다. rentalAssets의 assetNo 중복을 먼저 정리해 주세요.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'asset-number-missing'
      ) {
        triggerToast(
          '자산관리번호가 없는 자산 문서가 있어 최종 전환을 중단했습니다.',
          'error'
        );
        return;
      }

      if (
        error?.code ===
        'permission-denied'
      ) {
        triggerToast(
          '분리 저장소 최종 전환 권한이 없습니다. 변경된 Firestore Rules가 게시되었는지 확인해 주세요.',
          'error'
        );
        return;
      }

      triggerToast(
        'Firestore 분리 저장소 최종 전환에 실패했습니다. 기존 분리 컬렉션은 삭제되지 않았으며, 원인을 수정한 뒤 다시 실행할 수 있습니다.',
        'error'
      );
    } finally {
      setSplitStorageFinalizeLoading(false);
    }
  };

  useEffect(() => {
    if (!firebaseAuthReady || !currentAuthRoleReady || !userProfileReady) {
      setRentalRequestsReady(false);
      return undefined;
    }

    const canReadOwnRentalRequests = Boolean(
      firebaseAuthUser &&
      !currentAuthRoleErrorMessage &&
      [
        USER_PROFILE_STATUS.ACTIVE,
        USER_PROFILE_STATUS.PROFILE_REQUIRED,
      ].includes(userProfile?.status)
    );

    if (isAdminAuthenticated) {
      setRentalRequests([]);
      setRentalRequestsLoadErrorMessage('');
      setRentalRequestsReady(true);
      return undefined;
    }

    if (!canReadOwnRentalRequests) {
      setRentalRequests([]);
      setRentalRequestsLoadErrorMessage('');
      setRentalRequestsReady(true);
      return undefined;
    }

    setRentalRequestsReady(false);
    setRentalRequestsLoadErrorMessage('');

    const linkedRequesterUids = [
      ...new Set(
        [
          firebaseAuthUser.uid,
          ...(Array.isArray(userProfile?.previousAccountUids)
            ? userProfile.previousAccountUids
            : []),
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      ),
    ];
    const requesterEmail = normalizeEmailAddress(
      firebaseAuthUser.email || userProfile?.email || ''
    );
    const sourceDefinitions = linkedRequesterUids.map((requesterUid, index) => ({
      key: `uid:${index}`,
      required: true,
      source: firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('requesterUid', '==', requesterUid)
      ),
    }));

    if (requesterEmail) {
      sourceDefinitions.push({
        key: 'email',
        required: false,
        source: firestoreQuery(
          RENTAL_REQUESTS_COLLECTION_REF,
          where('requesterEmail', '==', requesterEmail)
        ),
      });
    }

    if (sourceDefinitions.length === 0) {
      setRentalRequests([]);
      setRentalRequestsReady(true);
      return undefined;
    }

    let disposed = false;
    const sourceState = new Map(
      sourceDefinitions.map(({ key }) => [
        key,
        {
          ready: false,
          requests: [],
        },
      ])
    );

    const publishRequests = () => {
      if (disposed) return;

      const states = Array.from(sourceState.values());

      if (!states.every((state) => state.ready)) return;

      const requestMap = new Map();

      states.forEach((state) => {
        state.requests.forEach((request) => {
          requestMap.set(request.id, {
            ...(requestMap.get(request.id) || {}),
            ...request,
          });
        });
      });

      setRentalRequests(Array.from(requestMap.values()));
      setRentalRequestsLoadErrorMessage('');
      setRentalRequestsReady(true);
    };

    const unsubscribers = sourceDefinitions.map(
      ({ key, required, source }) =>
        onSnapshot(
          source,
          (snapshot) => {
            sourceState.set(key, {
              ready: true,
              requests: snapshot.docs.map((requestDoc) => ({
                ...requestDoc.data(),
                id: requestDoc.id,
              })),
            });
            publishRequests();
          },
          (error) => {
            console.error(`Own rental requests ${key} sync error:`, error);
            sourceState.set(key, {
              ready: true,
              requests: [],
            });

            if (required) {
              const message =
                '나의 대여신청 내역을 불러오지 못했습니다. Firestore Rules의 rentalRequests 본인 및 이전 계정 조회 권한을 확인해 주세요.';
              setRentalRequestsLoadErrorMessage(message);
              setRentalRequestsReady(true);
              triggerToast(message, 'error');
              return;
            }

            publishRequests();
          }
        )
    );

    return () => {
      disposed = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser?.email,
    firebaseAuthUser?.uid,
    isAdminAuthenticated,
    userProfile?.email,
    userProfile?.previousAccountUids,
    userProfile?.status,
    userProfileReady,
  ]);


  useEffect(() => {
    setNoticePosts([
      ...(noticePinnedPosts || []),
      ...(noticeRegularPagePosts || []),
    ]);
  }, [noticePinnedPosts, noticeRegularPagePosts]);

  useEffect(() => {
    const shouldLoadUserNotice = view === 'user' && userTab === 'notice';
    const shouldLoadAdminNotice =
      isAdminAuthenticated && view === 'admin' && adminTab === 'noticePosts';
    const shouldLoadNotice = shouldLoadUserNotice || shouldLoadAdminNotice;

    if (!shouldLoadNotice) {
      setNoticeBoardConfigReady(true);
      setNoticeBoardConfigLoadErrorMessage('');
      return undefined;
    }

    setNoticeBoardConfigReady(false);
    setNoticeBoardConfigLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      NOTICE_BOARD_CONFIG_DOC_REF,
      (snapshot) => {
        const postsPerPage = getSafeNoticePostsPerPage(
          snapshot.exists()
            ? snapshot.data().postsPerPage
            : DEFAULT_NOTICE_POSTS_PER_PAGE
        );

        setNoticeBoardConfig({ postsPerPage });
        setNoticePostsPerPageInput(postsPerPage);
        setNoticeBoardConfigLoadErrorMessage('');
        setNoticeBoardConfigReady(true);
      },
      (error) => {
        const message =
          '공지사항 목록 설정을 불러오지 못해 기본값 10개를 사용합니다.';
        console.error('Notice board config sync error:', error);
        setNoticeBoardConfig({
          postsPerPage: DEFAULT_NOTICE_POSTS_PER_PAGE,
        });
        setNoticePostsPerPageInput(DEFAULT_NOTICE_POSTS_PER_PAGE);
        setNoticeBoardConfigLoadErrorMessage(message);
        setNoticeBoardConfigReady(true);
      }
    );

    return unsubscribe;
  }, [isAdminAuthenticated, view, userTab, adminTab]);

  const shouldRunAdminNoticeSearch =
    isAdminAuthenticated && view === 'admin' && adminTab === 'noticePosts';
  const shouldRunUserNoticeSearch = view === 'user' && userTab === 'notice';
  const activeNoticeSearchQuery = shouldRunAdminNoticeSearch
    ? debouncedAdminNoticeQuery
    : debouncedUserNoticeQuery;
  const noticeSearchPostsPerPage = getSafeNoticePostsPerPage(
    noticeBoardConfig.postsPerPage
  );
  const noticeSearchActivePage = shouldRunAdminNoticeSearch
    ? adminNoticePage
    : noticePage;
  const noticeProgressiveSearchEnabled = Boolean(
    (shouldRunAdminNoticeSearch || shouldRunUserNoticeSearch) &&
      String(activeNoticeSearchQuery || '').trim()
  );

  useBoardProgressiveSearch({
    enabled: noticeProgressiveSearchEnabled,
    collectionRef: NOTICE_POSTS_COLLECTION_REF,
    searchKey: [
      shouldRunAdminNoticeSearch ? 'admin' : 'user',
      String(activeNoticeSearchQuery || '').trim().toLowerCase(),
    ].join('|'),
    searchQuery: activeNoticeSearchQuery,
    activePage: noticeSearchActivePage,
    postsPerPage: noticeSearchPostsPerPage,
    pinnedBatchSize: FIRESTORE_PINNED_POST_LIMIT,
    errorMessage:
      '공지사항 검색 결과를 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.',
    errorLogLabel: 'Notice progressive search error:',
    setPinnedPosts: setNoticePinnedPosts,
    setRegularPagePosts: setNoticeRegularPagePosts,
    setRegularTotalCount: setNoticeRegularTotalCount,
    setHasNextPage: setNoticeHasNextPage,
    setLoadErrorMessage: setNoticePostsLoadErrorMessage,
    setReady: setNoticePostsReady,
    triggerToast,
  });

  useEffect(() => {
    const shouldLoadUserNotice = view === 'user' && userTab === 'notice';
    const shouldLoadUserHomeNotice = view === 'user' && userTab === 'home';
    const shouldLoadAdminNotice =
      isAdminAuthenticated && view === 'admin' && adminTab === 'noticePosts';
    const shouldLoadNotice =
      shouldLoadUserNotice || shouldLoadUserHomeNotice || shouldLoadAdminNotice;
    const activeSearchQuery = shouldLoadUserHomeNotice
      ? ''
      : shouldLoadAdminNotice
        ? debouncedAdminNoticeQuery
        : debouncedUserNoticeQuery;
    const searchMode = Boolean(String(activeSearchQuery || '').trim());

    if (!shouldLoadNotice) {
      noticeCursorKeyRef.current = '';
      noticeCursorByPageRef.current = new Map([[1, null]]);
      setNoticePinnedPosts([]);
      setNoticeRegularPagePosts([]);
      setNoticePostsReady(true);
      setNoticePostsLoadErrorMessage('');
      setNoticeHasNextPage(false);
      return undefined;
    }

    if (searchMode) return undefined;


    const pinnedSource = firestoreQuery(
      NOTICE_POSTS_COLLECTION_REF,
      where('isPinned', '==', true),
      orderBy('createdAt', 'desc'),
      firestoreLimit(
        shouldLoadUserHomeNotice ? 6 : FIRESTORE_PINNED_POST_LIMIT
      )
    );

    const applyPinnedNoticeSnapshot = (snapshot) => {
      setNoticePinnedPosts(
        snapshot.docs.map((postDoc) => ({
          ...postDoc.data(),
          id: postDoc.id,
        }))
      );
      setNoticePostsLoadErrorMessage('');
    };

    const handlePinnedNoticeError = (error) => {
      const message =
        '상단 고정 공지사항을 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.';
      console.error('Pinned notice posts load error:', error);
      setNoticePinnedPosts([]);
      setNoticePostsLoadErrorMessage(message);
      setNoticePostsReady(true);
      triggerToast(message, 'error');
    };

    if (shouldLoadUserHomeNotice) {
      let cancelled = false;

      void getDocs(pinnedSource)
        .then((snapshot) => {
          if (!cancelled) applyPinnedNoticeSnapshot(snapshot);
        })
        .catch((error) => {
          if (!cancelled) handlePinnedNoticeError(error);
        });

      return () => {
        cancelled = true;
      };
    }

    return onSnapshot(
      pinnedSource,
      applyPinnedNoticeSnapshot,
      handlePinnedNoticeError
    );
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    debouncedUserNoticeQuery,
    debouncedAdminNoticeQuery,
    noticePage,
    adminNoticePage,
    noticeBoardConfig.postsPerPage,
  ]);

  useEffect(() => {
    const shouldLoadUserNotice = view === 'user' && userTab === 'notice';
    const shouldLoadUserHomeNotice = view === 'user' && userTab === 'home';
    const shouldLoadAdminNotice =
      isAdminAuthenticated && view === 'admin' && adminTab === 'noticePosts';
    const shouldLoadNotice =
      shouldLoadUserNotice || shouldLoadUserHomeNotice || shouldLoadAdminNotice;
    const activeSearchQuery = shouldLoadUserHomeNotice
      ? ''
      : shouldLoadAdminNotice
        ? debouncedAdminNoticeQuery
        : debouncedUserNoticeQuery;
    const searchMode = Boolean(String(activeSearchQuery || '').trim());

    if (!shouldLoadNotice || searchMode) return undefined;

    const postsPerPage = shouldLoadUserHomeNotice
      ? 6
      : getSafeNoticePostsPerPage(noticeBoardConfig.postsPerPage);
    const activePage = shouldLoadUserHomeNotice
      ? 1
      : shouldLoadAdminNotice
        ? adminNoticePage
        : noticePage;
    const cursorKey = `${
      shouldLoadUserHomeNotice
        ? 'home'
        : shouldLoadAdminNotice
          ? 'admin'
          : 'user'
    }|${postsPerPage}`;
    const cursorKeyChanged = noticeCursorKeyRef.current !== cursorKey;

    if (cursorKeyChanged) {
      noticeCursorKeyRef.current = cursorKey;
      noticeCursorByPageRef.current = new Map([[1, null]]);
    }

    const pageCursor = noticeCursorByPageRef.current.get(activePage);
    if (activePage > 1 && !pageCursor) {
      if (shouldLoadAdminNotice) setAdminNoticePage(1);
      else setNoticePage(1);
      return undefined;
    }

    setNoticePostsReady(false);
    setNoticePostsLoadErrorMessage('');

    const regularSource = firestoreQuery(
      NOTICE_POSTS_COLLECTION_REF,
      where('isPinned', '==', false),
      orderBy('createdAt', 'desc'),
      ...(pageCursor ? [startAfter(pageCursor)] : []),
      firestoreLimit(postsPerPage + 1)
    );

    const applyRegularNoticeSnapshot = (snapshot) => {
      const sourceDocs = snapshot.docs;
      const visibleDocs = sourceDocs.slice(0, postsPerPage);
      const hasNext = sourceDocs.length > postsPerPage;

      if (visibleDocs.length > 0) {
        noticeCursorByPageRef.current.set(
          activePage + 1,
          visibleDocs[visibleDocs.length - 1]
        );
      }

      setNoticeRegularPagePosts(
        visibleDocs.map((postDoc) => ({
          ...postDoc.data(),
          id: postDoc.id,
        }))
      );
      setNoticeHasNextPage(hasNext);
      setNoticePostsLoadErrorMessage('');
      setNoticePostsReady(true);
    };

    const handleRegularNoticeError = (error) => {
      const message =
        '공지사항 목록을 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.';
      console.error('Paged notice posts load error:', error);
      setNoticeRegularPagePosts([]);
      setNoticeHasNextPage(false);
      setNoticePostsLoadErrorMessage(message);
      setNoticePostsReady(true);
      triggerToast(message, 'error');
    };

    let unsubscribe = null;
    let cancelled = false;

    if (shouldLoadUserHomeNotice) {
      void getDocs(regularSource)
        .then((snapshot) => {
          if (!cancelled) applyRegularNoticeSnapshot(snapshot);
        })
        .catch((error) => {
          if (!cancelled) handleRegularNoticeError(error);
        });
    } else {
      unsubscribe = onSnapshot(
        regularSource,
        applyRegularNoticeSnapshot,
        handleRegularNoticeError
      );
    }

    if (cursorKeyChanged && !shouldLoadUserHomeNotice) {
      void getCountFromServer(
        firestoreQuery(
          NOTICE_POSTS_COLLECTION_REF,
          where('isPinned', '==', false)
        )
      )
        .then((countSnapshot) => {
          setNoticeRegularTotalCount(countSnapshot.data().count);
        })
        .catch((error) => {
          console.error('Notice regular post count error:', error);
        });
    }

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    noticePage,
    adminNoticePage,
    noticeBoardConfig.postsPerPage,
    debouncedUserNoticeQuery,
    debouncedAdminNoticeQuery,
  ]);

  useEffect(() => {
    noticeCursorByPageRef.current = new Map([[1, null]]);
    noticeCursorKeyRef.current = '';
    setNoticePage(1);
  }, [debouncedUserNoticeQuery]);

  useEffect(() => {
    noticeCursorByPageRef.current = new Map([[1, null]]);
    noticeCursorKeyRef.current = '';
    setAdminNoticePage(1);
  }, [debouncedAdminNoticeQuery]);

  useEffect(() => {
    const shouldLoadSelectedNotice =
      view === 'user' &&
      userTab === 'notice' &&
      Boolean(selectedNoticePostId) &&
      !selectedNoticePost;

    if (!shouldLoadSelectedNotice) return undefined;

    let cancelled = false;

    void getDoc(doc(NOTICE_POSTS_COLLECTION_REF, selectedNoticePostId))
      .then((snapshot) => {
        if (cancelled || !snapshot.exists()) return;
        setSelectedNoticePostOverride({
          ...snapshot.data(),
          id: snapshot.id,
        });
      })
      .catch((error) => {
        console.error('Selected notice post read error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [view, userTab, selectedNoticePostId, selectedNoticePost]);

  useEffect(() => {
    if (
      !selectedNoticePostId ||
      (noticePosts || []).some((post) => post.id === selectedNoticePostId)
    ) {
      setSelectedNoticePostOverride(null);
    }
  }, [selectedNoticePostId, noticePosts]);

  useEffect(() => {
    const shouldLoadAdminPopup =
      isAdminAuthenticated && view === 'admin' && adminTab === 'popupPosts';
    const shouldLoadUserPopup =
      view === 'user' &&
      (
        userTab === 'home' ||
        (userTab === 'rental' && Boolean(firebaseAuthUser))
      );
    const shouldLoadPopup = shouldLoadAdminPopup || shouldLoadUserPopup;

    if (!shouldLoadPopup) {
      setPopupPosts([]);
      setPopupPostsLoadErrorMessage('');
      setPopupPostsReady(true);
      return undefined;
    }

    setPopupPostsReady(false);
    setPopupPostsLoadErrorMessage('');

    const popupSource = shouldLoadAdminPopup
      ? POPUP_POSTS_COLLECTION_REF
      : firestoreQuery(
          POPUP_POSTS_COLLECTION_REF,
          where('enabled', '==', true)
        );

    const applyPopupSnapshot = (snapshot) => {
      const remotePosts = snapshot.docs
        .map((popupDoc) => ({
          ...popupDoc.data(),
          id: popupDoc.id,
        }))
        .sort((first, second) => {
          const firstOrder = Number(first.sortOrder);
          const secondOrder = Number(second.sortOrder);
          const firstHasOrder = Number.isFinite(firstOrder) && firstOrder > 0;
          const secondHasOrder = Number.isFinite(secondOrder) && secondOrder > 0;

          if (firstHasOrder && secondHasOrder && firstOrder !== secondOrder) {
            return firstOrder - secondOrder;
          }
          if (firstHasOrder !== secondHasOrder) return firstHasOrder ? -1 : 1;

          return (
            getPopupDateMillis(second.createdAt) -
            getPopupDateMillis(first.createdAt)
          );
        });

      setPopupPosts(remotePosts);
      setPopupPostsLoadErrorMessage('');
      setPopupPostsReady(true);
    };

    const handlePopupLoadError = (error) => {
      const message =
        '팝업을 불러오지 못했습니다. Firestore Rules의 popupPosts 읽기 권한을 확인해 주세요.';

      console.error('Popup posts load error:', error);
      setPopupPosts([]);
      setPopupPostsLoadErrorMessage(message);
      setPopupPostsReady(true);

      if (shouldLoadAdminPopup) triggerToast(message, 'error');
    };

    if (shouldLoadUserPopup) {
      let cancelled = false;

      void getDocs(popupSource)
        .then((snapshot) => {
          if (!cancelled) applyPopupSnapshot(snapshot);
        })
        .catch((error) => {
          if (!cancelled) handlePopupLoadError(error);
        });

      return () => {
        cancelled = true;
      };
    }

    return onSnapshot(
      popupSource,
      applyPopupSnapshot,
      handlePopupLoadError
    );
  }, [firebaseAuthUser?.uid, isAdminAuthenticated, userTab, view, adminTab]);

  useEffect(() => {
    const shouldLoadUserFooter = view === 'user';
    const shouldLoadAdminFooter =
      isAdminAuthenticated &&
      view === 'admin' &&
      adminTab === 'footerManagement';
    const shouldLoadFooter = shouldLoadUserFooter || shouldLoadAdminFooter;

    if (!shouldLoadFooter) {
      const defaultFooterConfig = createDefaultFooterConfigDraft();
      setFooterConfig(defaultFooterConfig);
      setFooterConfigDraft(defaultFooterConfig);
      setFooterConfigLoadErrorMessage('');
      setFooterConfigReady(true);
      return undefined;
    }

    setFooterConfigReady(false);
    setFooterConfigLoadErrorMessage('');

    const applyFooterConfigSnapshot = (snapshot) => {
      const remoteData = snapshot.exists() ? snapshot.data() : {};
      const nextConfig = {
        enabled: snapshot.exists() ? remoteData.enabled !== false : true,
        content: remoteData.content || '',
        contentText: remoteData.contentText || remoteData.content || '',
        contentHtml: sanitizeFooterCommonHtml(
          remoteData.contentHtml ||
            legacyTextToRichHtml(
              remoteData.contentText || remoteData.content || ''
            )
        ),
        contentFormat: remoteData.contentFormat || 'rich-html-v1',
        updatedAt: remoteData.updatedAt || null,
      };

      setFooterConfig(nextConfig);
      setFooterConfigDraft({
        enabled: nextConfig.enabled,
        contentHtml: nextConfig.contentHtml,
      });
      setFooterConfigLoadErrorMessage('');
      setFooterConfigReady(true);
    };

    const handleFooterConfigError = (error) => {
      const message =
        '푸터 공통 정보를 불러오지 못했습니다. Firestore Rules의 siteFooter 읽기 권한을 확인해 주세요.';
      console.error('Footer config load error:', error);
      setFooterConfig(createDefaultFooterConfigDraft());
      setFooterConfigDraft(createDefaultFooterConfigDraft());
      setFooterConfigLoadErrorMessage(message);
      setFooterConfigReady(true);
      if (shouldLoadAdminFooter) triggerToast(message, 'error');
    };

    if (shouldLoadUserFooter) {
      let cancelled = false;

      void getDoc(SITE_FOOTER_CONFIG_DOC_REF)
        .then((snapshot) => {
          if (!cancelled) applyFooterConfigSnapshot(snapshot);
        })
        .catch((error) => {
          if (!cancelled) handleFooterConfigError(error);
        });

      return () => {
        cancelled = true;
      };
    }

    return onSnapshot(
      SITE_FOOTER_CONFIG_DOC_REF,
      applyFooterConfigSnapshot,
      handleFooterConfigError
    );
  }, [isAdminAuthenticated, view, adminTab]);

  useEffect(() => {
    const shouldLoadUserFooter = view === 'user';
    const shouldLoadAdminFooter =
      isAdminAuthenticated &&
      view === 'admin' &&
      adminTab === 'footerManagement';
    const shouldLoadFooter = shouldLoadUserFooter || shouldLoadAdminFooter;

    if (!shouldLoadFooter) {
      setFooterPages([]);
      setFooterPagesLoadErrorMessage('');
      setFooterPagesReady(true);
      return undefined;
    }

    setFooterPagesReady(false);
    setFooterPagesLoadErrorMessage('');

    const footerPagesSource = shouldLoadAdminFooter
      ? FOOTER_PAGES_COLLECTION_REF
      : firestoreQuery(
          FOOTER_PAGES_COLLECTION_REF,
          where('enabled', '==', true)
        );

    const applyFooterPagesSnapshot = (snapshot) => {
      const remotePages = snapshot.docs
        .map((pageDoc) => ({
          ...pageDoc.data(),
          id: pageDoc.id,
        }))
        .sort((first, second) => {
          const orderDifference =
            (Number(first.sortOrder) || 0) -
            (Number(second.sortOrder) || 0);
          if (orderDifference !== 0) return orderDifference;

          const createdDifference =
            getFirestoreTimestampMillis(first.createdAt) -
            getFirestoreTimestampMillis(second.createdAt);
          if (createdDifference !== 0) return createdDifference;

          return String(first.id || '').localeCompare(
            String(second.id || '')
          );
        });

      setFooterPages(remotePages);
      setFooterPagesLoadErrorMessage('');
      setFooterPagesReady(true);
    };

    const handleFooterPagesError = (error) => {
      const message =
        '푸터 메뉴 페이지를 불러오지 못했습니다. Firestore Rules의 footerPages 읽기 권한을 확인해 주세요.';
      console.error('Footer pages load error:', error);
      setFooterPages([]);
      setFooterPagesLoadErrorMessage(message);
      setFooterPagesReady(true);
      if (shouldLoadAdminFooter) triggerToast(message, 'error');
    };

    if (shouldLoadUserFooter) {
      let cancelled = false;

      void getDocs(footerPagesSource)
        .then((snapshot) => {
          if (!cancelled) applyFooterPagesSnapshot(snapshot);
        })
        .catch((error) => {
          if (!cancelled) handleFooterPagesError(error);
        });

      return () => {
        cancelled = true;
      };
    }

    return onSnapshot(
      footerPagesSource,
      applyFooterPagesSnapshot,
      handleFooterPagesError
    );
  }, [isAdminAuthenticated, view, adminTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      POPUP_DISMISSED_SESSION_KEY,
      JSON.stringify(dismissedPopupSessionVersions)
    );
  }, [dismissedPopupSessionVersions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      POPUP_DISMISSED_LOCAL_KEY,
      JSON.stringify(dismissedPopupLocalVersions)
    );
  }, [dismissedPopupLocalVersions]);

  useEffect(() => {
    setTemporarilyDismissedPopupVersions([]);
  }, [userTab, view]);

  useEffect(() => {
    const shouldLoadUserFaq = view === 'user' && userTab === 'faq';
    const shouldLoadAdminFaq =
      isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
    const shouldLoadFaq = shouldLoadUserFaq || shouldLoadAdminFaq;

    if (!shouldLoadFaq) {
      setFaqCategoriesReady(true);
      setFaqCategoriesLoadErrorMessage('');
      return undefined;
    }

    setFaqCategoriesReady(false);
    setFaqCategoriesLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      FAQ_CATEGORIES_COLLECTION_REF,
      (snapshot) => {
        const remoteCategories = snapshot.docs
          .map((categoryDoc) => ({
            ...categoryDoc.data(),
            id: categoryDoc.id,
          }))
          .sort((first, second) => {
            const orderDifference =
              (Number(first.order) || 0) - (Number(second.order) || 0);
            if (orderDifference !== 0) return orderDifference;
            return String(first.name || '').localeCompare(
              String(second.name || ''),
              'ko'
            );
          });

        setFaqCategories(remoteCategories);
        setFaqCategoriesLoadErrorMessage('');
        setFaqCategoriesReady(true);
      },
      (error) => {
        const message =
          'FAQ 카테고리를 불러오지 못했습니다. Firestore Rules의 faqCategories 읽기 권한을 확인해 주세요.';
        console.error('FAQ categories sync error:', error);
        setFaqCategories([]);
        setFaqCategoriesLoadErrorMessage(message);
        setFaqCategoriesReady(true);
        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, [isAdminAuthenticated, view, userTab, adminTab]);

  useEffect(() => {
    const shouldLoadUserFaq = view === 'user' && userTab === 'faq';
    const shouldLoadAdminFaq =
      isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
    const shouldLoadFaq = shouldLoadUserFaq || shouldLoadAdminFaq;

    if (!shouldLoadFaq) {
      setFaqBoardConfigReady(true);
      setFaqBoardConfigLoadErrorMessage('');
      return undefined;
    }

    setFaqBoardConfigReady(false);
    setFaqBoardConfigLoadErrorMessage('');

    const unsubscribe = onSnapshot(
      FAQ_BOARD_CONFIG_DOC_REF,
      (snapshot) => {
        const postsPerPage = getSafeFaqPostsPerPage(
          snapshot.exists()
            ? snapshot.data().postsPerPage
            : DEFAULT_FAQ_POSTS_PER_PAGE
        );
        setFaqBoardConfig({ postsPerPage });
        setFaqPostsPerPageInput(postsPerPage);
        setFaqBoardConfigLoadErrorMessage('');
        setFaqBoardConfigReady(true);
      },
      (error) => {
        const message =
          'FAQ 목록 설정을 불러오지 못해 기본값 10개를 사용합니다.';
        console.error('FAQ board config sync error:', error);
        setFaqBoardConfig({ postsPerPage: DEFAULT_FAQ_POSTS_PER_PAGE });
        setFaqPostsPerPageInput(DEFAULT_FAQ_POSTS_PER_PAGE);
        setFaqBoardConfigLoadErrorMessage(message);
        setFaqBoardConfigReady(true);
      }
    );

    return unsubscribe;
  }, [isAdminAuthenticated, view, userTab, adminTab]);

  useEffect(() => {
    setFaqPosts([
      ...(faqPinnedPosts || []),
      ...(faqRegularPagePosts || []),
    ]);
  }, [faqPinnedPosts, faqRegularPagePosts]);

  const shouldRunAdminFaqSearch =
    isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
  const shouldRunUserFaqSearch = view === 'user' && userTab === 'faq';
  const faqProgressiveSearchCategoryId =
    shouldRunUserFaqSearch &&
    activeFaqCategoryId !== 'all' &&
    faqSearchWithinCategory
      ? activeFaqCategoryId
      : '';
  const faqSearchPostsPerPage = getSafeFaqPostsPerPage(
    faqBoardConfig.postsPerPage
  );
  const faqSearchActivePage = shouldRunAdminFaqSearch
    ? adminFaqPage
    : faqPage;
  const faqProgressiveSearchEnabled = Boolean(
    (shouldRunAdminFaqSearch || shouldRunUserFaqSearch) &&
      String(debouncedFaqQuery || '').trim()
  );

  useBoardProgressiveSearch({
    enabled: faqProgressiveSearchEnabled,
    collectionRef: FAQ_POSTS_COLLECTION_REF,
    searchKey: [
      shouldRunAdminFaqSearch ? 'admin' : 'user',
      faqProgressiveSearchCategoryId || 'all',
      String(debouncedFaqQuery || '').trim().toLowerCase(),
    ].join('|'),
    searchQuery: debouncedFaqQuery,
    activePage: faqSearchActivePage,
    postsPerPage: faqSearchPostsPerPage,
    pinnedBatchSize: FIRESTORE_PINNED_POST_LIMIT,
    categoryId: faqProgressiveSearchCategoryId,
    errorMessage:
      'FAQ 검색 결과를 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.',
    errorLogLabel: 'FAQ progressive search error:',
    setPinnedPosts: setFaqPinnedPosts,
    setRegularPagePosts: setFaqRegularPagePosts,
    setRegularTotalCount: setFaqRegularTotalCount,
    setHasNextPage: setFaqHasNextPage,
    setLoadErrorMessage: setFaqPostsLoadErrorMessage,
    setReady: setFaqPostsReady,
    triggerToast,
  });

  useEffect(() => {
    const shouldLoadUserFaq = view === 'user' && userTab === 'faq';
    const shouldLoadAdminFaq =
      isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
    const shouldLoadFaq = shouldLoadUserFaq || shouldLoadAdminFaq;
    const searchMode = Boolean(String(debouncedFaqQuery || '').trim());
    const shouldLimitToActiveCategory =
      shouldLoadUserFaq &&
      activeFaqCategoryId !== 'all' &&
      (!searchMode || faqSearchWithinCategory);
    const categoryConstraints = shouldLimitToActiveCategory
      ? [where('categoryId', '==', activeFaqCategoryId)]
      : [];

    if (!shouldLoadFaq) {
      faqCursorKeyRef.current = '';
      faqCursorByPageRef.current = new Map([[1, null]]);
      setFaqPinnedPosts([]);
      setFaqRegularPagePosts([]);
      setFaqPostsReady(true);
      setFaqPostsLoadErrorMessage('');
      setFaqHasNextPage(false);
      return undefined;
    }

    if (searchMode) return undefined;


    const pinnedSource = firestoreQuery(
      FAQ_POSTS_COLLECTION_REF,
      ...categoryConstraints,
      where('isPinned', '==', true),
      orderBy('createdAt', 'desc'),
      firestoreLimit(FIRESTORE_PINNED_POST_LIMIT)
    );

    const unsubscribe = onSnapshot(
      pinnedSource,
      (snapshot) => {
        setFaqPinnedPosts(
          snapshot.docs.map((postDoc) => ({
            ...postDoc.data(),
            id: postDoc.id,
          }))
        );
        setFaqPostsLoadErrorMessage('');
      },
      (error) => {
        const message =
          '상단 고정 FAQ를 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.';
        console.error('Pinned FAQ sync error:', error);
        setFaqPinnedPosts([]);
        setFaqPostsLoadErrorMessage(message);
        setFaqPostsReady(true);
        triggerToast(message, 'error');
      }
    );

    return unsubscribe;
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    activeFaqCategoryId,
    faqSearchWithinCategory,
    debouncedFaqQuery,
    faqPage,
    adminFaqPage,
    faqBoardConfig.postsPerPage,
  ]);

  useEffect(() => {
    const shouldLoadUserFaq = view === 'user' && userTab === 'faq';
    const shouldLoadAdminFaq =
      isAdminAuthenticated && view === 'admin' && adminTab === 'faqPosts';
    const shouldLoadFaq = shouldLoadUserFaq || shouldLoadAdminFaq;
    const searchMode = Boolean(String(debouncedFaqQuery || '').trim());

    if (!shouldLoadFaq || searchMode) return undefined;

    const shouldLimitToActiveCategory =
      shouldLoadUserFaq && activeFaqCategoryId !== 'all';
    const categoryConstraints = shouldLimitToActiveCategory
      ? [where('categoryId', '==', activeFaqCategoryId)]
      : [];
    const postsPerPage = getSafeFaqPostsPerPage(faqBoardConfig.postsPerPage);
    const activePage = shouldLoadAdminFaq ? adminFaqPage : faqPage;
    const cursorKey = [
      shouldLoadAdminFaq ? 'admin' : 'user',
      shouldLimitToActiveCategory ? activeFaqCategoryId : 'all',
      postsPerPage,
    ].join('|');
    const cursorKeyChanged = faqCursorKeyRef.current !== cursorKey;

    if (cursorKeyChanged) {
      faqCursorKeyRef.current = cursorKey;
      faqCursorByPageRef.current = new Map([[1, null]]);
    }

    const pageCursor = faqCursorByPageRef.current.get(activePage);
    if (activePage > 1 && !pageCursor) {
      if (shouldLoadAdminFaq) setAdminFaqPage(1);
      else setFaqPage(1);
      return undefined;
    }

    setFaqPostsReady(false);
    setFaqPostsLoadErrorMessage('');

    const regularSource = firestoreQuery(
      FAQ_POSTS_COLLECTION_REF,
      ...categoryConstraints,
      where('isPinned', '==', false),
      orderBy('createdAt', 'desc'),
      ...(pageCursor ? [startAfter(pageCursor)] : []),
      firestoreLimit(postsPerPage + 1)
    );

    const unsubscribe = onSnapshot(
      regularSource,
      (snapshot) => {
        const sourceDocs = snapshot.docs;
        const visibleDocs = sourceDocs.slice(0, postsPerPage);
        const hasNext = sourceDocs.length > postsPerPage;

        if (visibleDocs.length > 0) {
          faqCursorByPageRef.current.set(
            activePage + 1,
            visibleDocs[visibleDocs.length - 1]
          );
        }

        setFaqRegularPagePosts(
          visibleDocs.map((postDoc) => ({
            ...postDoc.data(),
            id: postDoc.id,
          }))
        );
        setFaqHasNextPage(hasNext);
        setFaqPostsLoadErrorMessage('');
        setFaqPostsReady(true);
      },
      (error) => {
        const message =
          'FAQ 목록을 불러오지 못했습니다. Firestore Rules와 인덱스를 확인해 주세요.';
        console.error('Paged FAQ posts sync error:', error);
        setFaqRegularPagePosts([]);
        setFaqHasNextPage(false);
        setFaqPostsLoadErrorMessage(message);
        setFaqPostsReady(true);
        triggerToast(message, 'error');
      }
    );

    if (cursorKeyChanged) {
      void getCountFromServer(
        firestoreQuery(
          FAQ_POSTS_COLLECTION_REF,
          ...categoryConstraints,
          where('isPinned', '==', false)
        )
      )
        .then((countSnapshot) => {
          setFaqRegularTotalCount(countSnapshot.data().count);
        })
        .catch((error) => {
          console.error('FAQ regular post count error:', error);
        });
    }

    return unsubscribe;
  }, [
    isAdminAuthenticated,
    view,
    userTab,
    adminTab,
    activeFaqCategoryId,
    faqPage,
    adminFaqPage,
    faqBoardConfig.postsPerPage,
    debouncedFaqQuery,
  ]);

  useEffect(() => {
    faqCursorByPageRef.current = new Map([[1, null]]);
    faqCursorKeyRef.current = '';
    setFaqPage(1);
    setAdminFaqPage(1);
  }, [debouncedFaqQuery, activeFaqCategoryId, faqSearchWithinCategory]);

  useEffect(() => {
    if (
      activeFaqCategoryId !== 'all' &&
      !faqCategories.some(
        (category) =>
          category.id === activeFaqCategoryId
      )
    ) {
      setActiveFaqCategoryId('all');
      setExpandedFaqPostId('');
      setFaqPage(1);
    }
  }, [
    faqCategories,
    activeFaqCategoryId,
  ]);

  const setUserAuthenticatedSession = (userId, policyOverride = null) => {
    const nextSession = saveUserAuthSession(
      userId,
      policyOverride || userSessionPolicy
    );

    setUserAuthSessionUid(nextSession.userId);
    setUserAuthSessionExpiresAt(nextSession.expiresAt);
    setUserAuthSessionAbsoluteExpiresAt(nextSession.absoluteExpiresAt);
    setUserAuthSessionPolicyVersion(nextSession.policyVersion);
  };

  const clearUserAuthenticatedSession = () => {
    clearUserAuthSession();
    setUserAuthSessionUid('');
    setUserAuthSessionExpiresAt(0);
    setUserAuthSessionAbsoluteExpiresAt(0);
    setUserAuthSessionPolicyVersion(0);
  };

  const expireCurrentUserSession = async (message) => {
    if (userSessionLogoutInProgressRef.current) return;
    userSessionLogoutInProgressRef.current = true;

    try {
      if (firebaseAuth.currentUser) {
        await signOut(firebaseAuth);
      }
    } catch (error) {
      console.error('Expired user Firebase Auth logout error:', error);
    } finally {
      clearUserAuthenticatedSession();
      clearUserLoginReturnTarget();
      setUserAuthForm(createDefaultUserAuthForm());
      replaceAppPath('user', 'login');
      setView('user');
      setUserTab('login');
      setSelectedFooterPageId('');
      setSelectedNoticePostId('');
      setIsCommunityMenuOpen(false);
      userSessionLogoutInProgressRef.current = false;
      triggerToast(message, 'error');
    }
  };

  const setAdminAuthenticatedSession = (adminId, securitySettingsOverride = null) => {
    const nextSession = saveAdminAuthSession(
      adminId,
      securitySettingsOverride || systemAdminSettings
    );

    setAuthenticatedAdminId(nextSession.adminId);
    setAdminAuthExpiresAt(nextSession.expiresAt);
    setAdminAuthAbsoluteExpiresAt(nextSession.absoluteExpiresAt);
    setAdminAuthPolicyVersion(nextSession.policyVersion);
  };

  const clearAdminAuthenticatedSession = () => {
    clearAdminAuthSession();
    setAuthenticatedAdminId('');
    setAdminAuthExpiresAt(0);
    setAdminAuthAbsoluteExpiresAt(0);
    setAdminAuthPolicyVersion(0);
  };

  useEffect(() => {
    if (!authenticatedAdminId || !isAdminAuthenticated) return undefined;

    const normalizedSecurity = normalizeSystemAdminSettings(systemAdminSettings);
    if (
      systemAdminSettingsReady &&
      adminAuthPolicyVersion &&
      adminAuthPolicyVersion !== normalizedSecurity.adminSecurityPolicyVersion
    ) {
      if (!adminLogoutInProgressRef.current) {
        adminLogoutInProgressRef.current = true;
        setAdminLogoutInProgress(true);
        void (async () => {
          try {
            if (firebaseAuth.currentUser) {
              await signOut(firebaseAuth);
            }
          } catch (error) {
            console.error('Admin policy change logout error:', error);
          } finally {
            clearAdminAuthenticatedSession();
            setAdminAuthForm(createDefaultAdminAuthForm());
            adminLogoutInProgressRef.current = false;
            setAdminLogoutInProgress(false);
            triggerToast(
              '관리자 보안 설정이 변경되어 다시 로그인이 필요합니다.',
              'error'
            );
          }
        })();
      }
      return undefined;
    }

    let lastRefreshAt = 0;
    const refreshSession = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 30000) return;
      lastRefreshAt = now;

      const currentSession = readAdminAuthSession();
      if (!currentSession.adminId || currentSession.adminId !== authenticatedAdminId) return;
      const nextSession = saveAdminAuthSession(
        authenticatedAdminId,
        normalizedSecurity,
        { absoluteExpiresAt: adminAuthAbsoluteExpiresAt || currentSession.absoluteExpiresAt }
      );
      setAdminAuthExpiresAt(nextSession.expiresAt);
      setAdminAuthAbsoluteExpiresAt(nextSession.absoluteExpiresAt);
      setAdminAuthPolicyVersion(nextSession.policyVersion);
    };

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, refreshSession, { passive: true }));
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshSession();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, refreshSession));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    authenticatedAdminId,
    isAdminAuthenticated,
    systemAdminSettings,
    systemAdminSettingsReady,
    adminAuthPolicyVersion,
    adminAuthAbsoluteExpiresAt,
  ]);

  useEffect(() => {
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthRoleErrorMessage ||
      currentAuthAdminAccount ||
      authenticatedAdminId ||
      !userProfileReady ||
      !userProfile ||
      ![USER_PROFILE_STATUS.ACTIVE, USER_PROFILE_STATUS.PROFILE_REQUIRED].includes(
        userProfile.status
      ) ||
      userAuthLoading ||
      withdrawalLoading ||
      !userSessionPolicyReady
    ) {
      return undefined;
    }

    const normalizedPolicy = normalizeUserSessionPolicy(userSessionPolicy);
    if (
      !userAuthSessionUid ||
      userAuthSessionUid !== firebaseAuthUser.uid
    ) {
      void expireCurrentUserSession(
        '로그인 세션 정보를 확인할 수 없어 다시 로그인이 필요합니다.'
      );
      return undefined;
    }

    if (
      userAuthSessionPolicyVersion !==
      normalizedPolicy.userSecurityPolicyVersion
    ) {
      void expireCurrentUserSession(
        '사용자 보안 설정이 변경되어 다시 로그인이 필요합니다.'
      );
      return undefined;
    }

    if (
      !userAuthSessionExpiresAt ||
      userAuthSessionExpiresAt <= Date.now()
    ) {
      const absoluteExpired =
        userAuthSessionAbsoluteExpiresAt > 0 &&
        userAuthSessionAbsoluteExpiresAt <= Date.now();
      void expireCurrentUserSession(
        absoluteExpired
          ? '로그인 최대 유지시간이 지나 자동으로 로그아웃되었습니다.'
          : '장시간 사용하지 않아 자동으로 로그아웃되었습니다.'
      );
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const absoluteExpired =
        userAuthSessionAbsoluteExpiresAt > 0 &&
        userAuthSessionAbsoluteExpiresAt <= Date.now();
      void expireCurrentUserSession(
        absoluteExpired
          ? '로그인 최대 유지시간이 지나 자동으로 로그아웃되었습니다.'
          : '장시간 사용하지 않아 자동으로 로그아웃되었습니다.'
      );
    }, Math.max(0, userAuthSessionExpiresAt - Date.now()));

    return () => window.clearTimeout(timeoutId);
  }, [
    firebaseAuthUser?.uid,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    currentAuthAdminAccount?.id,
    authenticatedAdminId,
    userProfileReady,
    userProfile?.uid,
    userProfile?.status,
    userAuthLoading,
    withdrawalLoading,
    userSessionPolicy,
    userSessionPolicyReady,
    userAuthSessionUid,
    userAuthSessionExpiresAt,
    userAuthSessionAbsoluteExpiresAt,
    userAuthSessionPolicyVersion,
  ]);

  useEffect(() => {
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthRoleErrorMessage ||
      currentAuthAdminAccount ||
      authenticatedAdminId ||
      !userProfileReady ||
      !userProfile ||
      ![USER_PROFILE_STATUS.ACTIVE, USER_PROFILE_STATUS.PROFILE_REQUIRED].includes(
        userProfile.status
      ) ||
      userAuthSessionUid !== firebaseAuthUser.uid ||
      !userSessionPolicyReady
    ) {
      return undefined;
    }

    const normalizedPolicy = normalizeUserSessionPolicy(userSessionPolicy);
    let lastRefreshAt = 0;
    const refreshSession = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 30000) return;
      lastRefreshAt = now;

      const currentSession = readUserAuthSession();
      if (
        !currentSession.userId ||
        currentSession.userId !== firebaseAuthUser.uid
      ) {
        return;
      }

      const nextSession = saveUserAuthSession(
        firebaseAuthUser.uid,
        normalizedPolicy,
        {
          absoluteExpiresAt: currentSession.absoluteExpiresAt,
        }
      );
      setUserAuthSessionUid(nextSession.userId);
      setUserAuthSessionExpiresAt(nextSession.expiresAt);
      setUserAuthSessionAbsoluteExpiresAt(nextSession.absoluteExpiresAt);
      setUserAuthSessionPolicyVersion(nextSession.policyVersion);
    };

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) =>
      window.addEventListener(eventName, refreshSession, { passive: true })
    );
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshSession();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      events.forEach((eventName) =>
        window.removeEventListener(eventName, refreshSession)
      );
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    firebaseAuthUser?.uid,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    currentAuthAdminAccount?.id,
    authenticatedAdminId,
    userProfileReady,
    userProfile?.uid,
    userProfile?.status,
    userAuthSessionUid,
    userSessionPolicy,
    userSessionPolicyReady,
  ]);

  const showUserAccountStatus = (type) => {
    const nextView = { type };
    writeUserAccountStatusView(nextView);
    setUserAccountStatusView(nextView);
    replaceAppPath('user', 'accountStatus');
    setView('user');
    setUserTab('accountStatus');
    setIsCommunityMenuOpen(false);
  };

  const {
    cancelWithdrawal,
    openWithdrawalDialog,
    saveMyUserProfile,
    submitMembershipWithdrawal,
    withdrawalBlockMessage,
  } = useUserMyPageAccountController({
    clearAdminAuthenticatedSession,
    createMemberPolicyError,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    currentUserRentalRestrictionStatus,
    currentUserRequests,
    currentUserRestriction,
    currentUserRestrictionReady,
    dataSettings: data.settings,
    firebaseAuthUser,
    getUserAuthErrorMessage,
    initialSettings: initialData.settings,
    rentalRequestsReady,
    setUserProfileForm,
    setUserProfileSaving,
    setWithdrawalDialogOpen,
    setWithdrawalLoading,
    setWithdrawalPassword,
    showUserAccountStatus,
    triggerToast,
    userProfile,
    userProfileForm,
    withdrawalLoading,
    withdrawalPassword,
  });

  const {
    accountRecoveryForm,
    accountRecoveryLoading,
    accountRecoveryResult,
    goToUserEmailRecovery,
    goToUserPasswordReset,
    passwordResetForm,
    passwordResetLoading,
    passwordResetVerificationResult,
    resetAccountRecoveryForLogin,
    resetAccountRecoverySearch,
    setAccountRecoveryForm,
    submitAccountRecovery,
    submitPasswordReset,
    updatePasswordResetForm,
  } = useUserAccountRecoveryController({
    getUserAuthErrorMessage,
    setIsCommunityMenuOpen,
    setUserTab,
    setView,
    showUserAccountStatus,
    triggerToast,
  });

  const {
    goToUserLogin,
    logoutUser,
    submitUserLogin,
  } = useUserLoginController({
    clearAdminAuthenticatedSession,
    clearUserAuthenticatedSession,
    configureFirebaseAuthPersistence,
    createMemberPolicyError,
    dataSettings: data.settings,
    getUserAuthErrorMessage,
    navigateToUserReturnTarget,
    pendingProtectedUserTabRef,
    resetAccountRecoveryForLogin,
    saveCurrentUserLoginReturnTarget,
    setIsCommunityMenuOpen,
    setSelectedFooterPageId,
    setSelectedNoticePostId,
    setUserAuthenticatedSession,
    siteSettings,
    setUserAuthForm,
    setUserAuthLoading,
    setUserTab,
    setView,
    showUserAccountStatus,
    triggerToast,
    userAuthForm,
    userSessionPolicy,
    userSessionPolicyReady,
    userTab,
    verifyUserDirectoryMembership,
  });

  const {
    cancelUserSignup,
    goToUserSignup,
    submitUserSignupForm,
  } = useUserSignupController({
    clearAdminAuthenticatedSession,
    clearUserAuthenticatedSession,
    configureFirebaseAuthPersistence,
    createMemberPolicyError,
    dataSettings: data.settings,
    dataTeams: data.teams,
    getUserAuthErrorMessage,
    initialSettings: initialData.settings,
    pendingProtectedUserTabRef,
    saveCurrentUserLoginReturnTarget,
    setIsCommunityMenuOpen,
    setUserAuthenticatedSession,
    setUserAuthForm,
    setUserAuthLoading,
    setUserTab,
    setView,
    showUserAccountStatus,
    siteSettings,
    triggerToast,
    userAuthForm,
    userAuthLoading,
    userSessionPolicy,
    userSessionPolicyReady,
    userTab,
  });

  const goToUserMypage = () => {
    if (currentAuthAdminAccount && !isAdminAuthenticated) {
      pushAppPath('admin');
      setView('admin');
      setIsCommunityMenuOpen(false);

      triggerToast(
        '관리자 계정은 관리자 모드에서 다시 인증해 주세요.',
        'error'
      );

      return;
    }

    pushAppPath('user', 'mypage');
    setView('user');
    setUserTab('mypage');
    setIsCommunityMenuOpen(false);
  };


  const submitUserAuthForm = (event, providedTermsSubmission = null) =>
    userTab === 'signup'
      ? submitUserSignupForm(event, providedTermsSubmission)
      : submitUserLogin(event);

    const authenticateAdmin = async () => {
    const adminEmail = adminAuthForm.adminLoginId.trim();
    const password = adminAuthForm.password;

    if (!adminEmail) {
      triggerToast('관리자 로그인 이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!password) {
      triggerToast('비밀번호를 입력해 주세요.', 'error');
      return;
    }

    let signedInAdminUser = null;

    setAdminAuthLoading(true);

    try {
      const initialSecuritySettings = normalizeSystemAdminSettings(
        systemAdminSettings
      );
      await configureFirebaseAuthPersistence(
        firebaseAuth,
        initialSecuritySettings.adminLogoutOnBrowserClose
      );
      clearUserAuthenticatedSession();

      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        adminEmail,
        password
      );

      signedInAdminUser = credential.user;

      const adminAccountDocRef = doc(
        db,
        'adminAccounts',
        credential.user.uid
      );

      const adminAccountSnapshot = await getDoc(adminAccountDocRef);

      if (!adminAccountSnapshot.exists()) {
        await signOut(firebaseAuth);
        signedInAdminUser = null;

        triggerToast(
          'Firebase Auth 로그인은 성공했지만 등록된 관리자 권한이 없습니다.',
          'error'
        );

        return;
      }

      const matchedAdminAccount = normalizeAdminAccounts([
        {
          ...adminAccountSnapshot.data(),
          id: adminAccountSnapshot.id,
        },
      ])[0];

      const hasValidAdminUidStructure =
        Boolean(matchedAdminAccount) &&
        adminAccountSnapshot.id === credential.user.uid &&
        matchedAdminAccount.id === credential.user.uid &&
        matchedAdminAccount.authUid === credential.user.uid;

      if (!hasValidAdminUidStructure) {
        throw new Error('admin-auth-uid-mismatch');
      }

      if (
        matchedAdminAccount.lockUntil &&
        matchedAdminAccount.lockUntil > Date.now()
      ) {
        const remainingMinutes = Math.ceil(
          (matchedAdminAccount.lockUntil - Date.now()) / 60000
        );

        await signOut(firebaseAuth);
        signedInAdminUser = null;

        triggerToast(
          `관리자 계정이 잠금 상태입니다. 약 ${remainingMinutes}분 후 다시 시도해 주세요.`,
          'error'
        );

        return;
      }

      const nowText = new Date().toLocaleString('ko-KR');

      const nextAdminAccount = {
        ...matchedAdminAccount,
        id: credential.user.uid,
        authUid: credential.user.uid,
        authEmail:
          credential.user.email ||
          matchedAdminAccount.authEmail ||
          '',
        authProvider: 'firebase-auth',
        lastLoginAt: nowText,
        updatedAt: nowText,
      };

      await setDoc(
        adminAccountDocRef,
        {
          ...nextAdminAccount,
          syncedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setCurrentAuthAdminAccount(nextAdminAccount);
      setCurrentAuthRoleErrorMessage('');
      setCurrentAuthRoleReady(true);

      setAdminAccounts((prev) => [
        nextAdminAccount,
        ...(prev || []).filter(
          (account) => account.id !== nextAdminAccount.id
        ),
      ]);

      const securitySettingsSnapshot = await getDoc(
        SYSTEM_ADMIN_SETTINGS_DOC_REF
      ).catch(() => null);
      const loginSecuritySettings = normalizeSystemAdminSettings(
        securitySettingsSnapshot?.exists()
          ? securitySettingsSnapshot.data()
          : systemAdminSettings
      );
      await configureFirebaseAuthPersistence(
        firebaseAuth,
        loginSecuritySettings.adminLogoutOnBrowserClose
      );

      setAdminAuthenticatedSession(
        nextAdminAccount.id,
        loginSecuritySettings
      );
      setAdminAuthForm(createDefaultAdminAuthForm());
      setAdminTab('dashboard');

      signedInAdminUser = null;

      triggerToast(
        `[${nextAdminAccount.adminLoginId}] 관리자 인증이 완료되었습니다.`,
        'success'
      );
    } catch (error) {
      let firebaseAuthCleanupFailed = false;

      if (
        signedInAdminUser &&
        firebaseAuth.currentUser?.uid === signedInAdminUser.uid
      ) {
        try {
          await signOut(firebaseAuth);
        } catch (logoutError) {
          firebaseAuthCleanupFailed = true;
          console.error('Failed admin login cleanup error:', logoutError);
        }
      }

      clearAdminAuthenticatedSession();
      setCurrentAuthAdminAccount(null);

      console.error('Admin authentication error:', error);

      const baseErrorMessage = getAdminFirebaseAuthErrorMessage(error);

      triggerToast(
        firebaseAuthCleanupFailed
          ? `${baseErrorMessage} Firebase Auth 로그아웃에도 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.`
          : baseErrorMessage,
        'error'
      );
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const logoutAdmin = async () => {
    if (adminLogoutInProgressRef.current || adminLogoutInProgress) return;

    const shouldLeaveProtectedUserPage =
      view === 'user' &&
      PROTECTED_USER_TABS.has(userTab);

    adminLogoutInProgressRef.current = true;
    setAdminLogoutInProgress(true);

    const adminAccountForLogout =
      authenticatedAdminAccount || currentAuthAdminAccount;

    const shouldSignOutFirebaseAdmin =
      Boolean(adminAccountForLogout?.authUid) &&
      firebaseAuth.currentUser?.uid === adminAccountForLogout.authUid;

    let firebaseSignOutFailed = false;

    try {
      if (shouldSignOutFirebaseAdmin) {
        await signOut(firebaseAuth);
      }
    } catch (error) {
      firebaseSignOutFailed = true;
      console.error('Admin Firebase Auth logout error:', error);
    } finally {
      clearUserLoginReturnTarget();
      clearAdminAuthenticatedSession();
      setAdminAuthForm(createDefaultAdminAuthForm());

      if (shouldLeaveProtectedUserPage) {
        replaceAppPath('user', 'home');
        setView('user');
        setUserTab('home');
        setSelectedFooterPageId('');
        setSelectedNoticePostId('');
        setIsCommunityMenuOpen(false);
      }

      adminLogoutInProgressRef.current = false;
      setAdminLogoutInProgress(false);

      triggerToast(
        firebaseSignOutFailed
          ? '관리자 화면 인증은 해제되었지만 Firebase Auth 로그아웃에 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.'
          : '관리자 인증이 해제되었습니다.',
        firebaseSignOutFailed ? 'error' : 'success'
      );
    }
  };

  const {
    adminAccountTotalPages,
    adminAccountUserOptions,
    cancelEditAdminAccount,
    deleteAdminAccount,
    paginatedAdminAccounts,
    registerAdminAccount,
    safeAdminAccountPage,
    saveAdminAccountEdit,
    saveMyAdminProfile,
    sendAdminAccountPasswordResetEmail,
    startEditAdminAccount,
    toggleAdminAccountLock,
  } = useAdminAccountManagementController({
    adminAccountEditForm,
    adminAccountForm,
    adminAccountPage,
    adminMyProfileForm,
    authenticatedAdminAccount,
    authenticatedAdminId,
    currentAuthAdminAccount,
    dataBorrowers: data.borrowers,
    editingAdminAccountId,
    firebaseAuthUser,
    getAdminFirebaseAuthErrorMessage,
    registeredAdminAccounts,
    setAdminAccountEditForm,
    setAdminAccountForm,
    setAdminAccountPage,
    setAdminAccounts,
    setAdminMyProfileForm,
    setAdminMyProfileSaving,
    setCurrentAuthAdminAccount,
    setEditingAdminAccountId,
    triggerConfirm,
    triggerToast,
  });

  const addTempHoliday = () => {
    const holidayDate = newHolidayDate;
    const holidayName = newHolidayName.trim();
    const nextReason = normalizeHolidayReason({
      type: newHolidayType || DEFAULT_HOLIDAY_TYPE,
      name: holidayName,
    });

    if (!holidayDate) {
      triggerToast('휴일 날짜를 선택해 주세요.', 'error');
      return;
    }

    const normalizedHolidays = normalizeHolidayList(tempSettings.holidays);
    const existingHoliday = normalizedHolidays.find(
      (holiday) => holiday.date === holidayDate
    );

    if (
      existingHoliday &&
      getHolidayReasons(existingHoliday).some(
        (reason) =>
          reason.type === nextReason.type &&
          reason.name === nextReason.name
      )
    ) {
      triggerToast('같은 날짜에 동일한 휴일 사유가 이미 등록되어 있습니다.', 'error');
      return;
    }

    const nextHolidays = existingHoliday
      ? normalizedHolidays.map((holiday) =>
          holiday.date === holidayDate
            ? normalizeHolidayList([
                holiday,
                {
                  date: holidayDate,
                  reasons: [nextReason],
                  enabled: true,
                },
              ])[0]
            : holiday
        )
      : normalizeHolidayList([
          ...normalizedHolidays,
          {
            date: holidayDate,
            reasons: [nextReason],
            enabled: true,
          },
        ]);

    setTempSettings((prev) => ({
      ...prev,
      holidays: normalizeHolidayList(nextHolidays),
    }));

    setHolidayManagementYear(String(holidayDate).slice(0, 4));
    setHolidayManagementMonth(Number(String(holidayDate).slice(5, 7)) || 1);
    setNewHolidayName('');
    triggerToast(
      `[${formatDateWithKoreanWeekday(holidayDate)}] ${nextReason.name} 사유가 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  };

  const updateTempHolidayReason = ({
    sourceDate,
    reasonIndex,
    date,
    type,
    name,
  }) => {
    const nextDate = String(date || '').trim();
    const nextReason = normalizeHolidayReason({ type, name });
    const normalizedHolidays = normalizeHolidayList(tempSettings.holidays);
    const sourceHoliday = normalizedHolidays.find(
      (holiday) => holiday.date === sourceDate
    );

    if (!nextDate) {
      triggerToast('휴일 날짜를 선택해 주세요.', 'error');
      return false;
    }

    if (!sourceHoliday) {
      triggerToast('수정할 휴일 정보를 찾지 못했습니다.', 'error');
      return false;
    }

    if (
      nextDate !== sourceDate &&
      normalizedHolidays.some((holiday) => holiday.date === nextDate)
    ) {
      triggerToast(
        '해당 날짜에는 이미 등록된 휴일이 있습니다. 기존 휴일에 사유를 추가하거나 다른 날짜를 선택해 주세요.',
        'error'
      );
      return false;
    }

    const sourceReasons = getHolidayReasons(sourceHoliday);

    if (
      sourceReasons.some(
        (reason, index) =>
          index !== reasonIndex &&
          reason.type === nextReason.type &&
          reason.name === nextReason.name
      )
    ) {
      triggerToast('같은 날짜에 동일한 휴일 사유가 이미 등록되어 있습니다.', 'error');
      return false;
    }

    const nextSourceReasons = sourceReasons.filter(
      (_, index) => index !== reasonIndex
    );
    const withoutSource = normalizedHolidays.filter(
      (holiday) => holiday.date !== sourceDate
    );
    const rebuiltHolidays = [...withoutSource];

    if (nextSourceReasons.length > 0) {
      rebuiltHolidays.push({
        ...sourceHoliday,
        reasons: nextSourceReasons,
      });
    }

    rebuiltHolidays.push({
      date: nextDate,
      reasons: [nextReason],
      enabled: sourceHoliday.enabled !== false,
    });

    setTempSettings((prev) => ({
      ...prev,
      holidays: normalizeHolidayList(rebuiltHolidays),
    }));
    setHolidayManagementYear(nextDate.slice(0, 4));
    setHolidayManagementMonth(Number(nextDate.slice(5, 7)) || 1);
    triggerToast(
      `[${formatDateWithKoreanWeekday(nextDate)}] 휴일 정보가 임시 수정되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );

    return true;
  };

  const deleteTempHoliday = (targetDate, reasonIndex) => {
    const normalizedHolidays = normalizeHolidayList(tempSettings.holidays);
    const targetHoliday = normalizedHolidays.find(
      (holiday) => holiday.date === targetDate
    );
    const targetReason = getHolidayReasons(targetHoliday)[reasonIndex];

    if (!targetHoliday || !targetReason) {
      triggerToast('삭제할 휴일 정보를 찾지 못했습니다.', 'error');
      return;
    }

    const nextReasons = getHolidayReasons(targetHoliday).filter(
      (_, index) => index !== reasonIndex
    );
    const nextHolidays = normalizedHolidays
      .filter((holiday) => holiday.date !== targetDate)
      .concat(
        nextReasons.length > 0
          ? [
              {
                ...targetHoliday,
                reasons: nextReasons,
              },
            ]
          : []
      );

    setTempSettings((prev) => ({
      ...prev,
      holidays: normalizeHolidayList(nextHolidays),
    }));

    triggerToast(
      `[${targetReason.name || '휴일'}] 휴일 사유가 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  };

  const mergeImportedHolidays = (
    currentHolidays = [],
    importedHolidays = [],
    mode = 'merge'
  ) => {
    const currentList = normalizeHolidayList(currentHolidays);
    const importedList = normalizeHolidayList(importedHolidays);
    const holidayMap = new Map(
      currentList.map((holiday) => [holiday.date, holiday])
    );

    importedList.forEach((importedHoliday) => {
      const existingHoliday = holidayMap.get(importedHoliday.date);

      if (!existingHoliday) {
        holidayMap.set(importedHoliday.date, importedHoliday);
        return;
      }

      if (mode === 'exclude') {
        return;
      }

      if (mode === 'replace') {
        holidayMap.set(importedHoliday.date, importedHoliday);
        return;
      }

      holidayMap.set(
        importedHoliday.date,
        normalizeHolidayList([existingHoliday, importedHoliday])[0]
      );
    });

    return normalizeHolidayList(Array.from(holidayMap.values()));
  };

  const applyHolidayImportConflictChoice = (mode) => {
    const pendingImport = holidayImportConflictModal;

    if (!pendingImport) return;

    const nextMode = ['exclude', 'merge', 'replace'].includes(mode)
      ? mode
      : 'merge';

    setTempSettings((prev) => ({
      ...prev,
      holidays: mergeImportedHolidays(
        prev.holidays || [],
        pendingImport.importedHolidays,
        nextMode
      ),
    }));
    setHolidayManagementYear(String(pendingImport.year));
    setHolidayManagementMonth(
      pendingImport.year === getKoreaNow().getUTCFullYear()
        ? getKoreaNow().getUTCMonth() + 1
        : 1
    );
    setHolidayImportConflictModal(null);

    const actionLabel =
      nextMode === 'exclude'
        ? '중복 날짜를 제외하고'
        : nextMode === 'replace'
          ? '중복 날짜를 불러온 데이터로 교체하고'
          : '기존 휴일 사유와 병합하고';

    triggerToast(
      `${pendingImport.year}년 공휴일을 ${actionLabel} 임시 목록에 반영했습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  };

  const importKoreanPublicHolidaysFromJson = async () => {
    const year = Number(holidayImportYear);

    if (!year || year < 2000 || year > 2100) {
      triggerToast('불러올 연도를 2000년부터 2100년 사이로 입력해 주세요.', 'error');
      return;
    }

    setHolidayImportLoading(true);

    try {
      const jsonUrl = `${import.meta.env.BASE_URL}holidays/kr-holidays-${year}.json?ts=${Date.now()}`;
      const response = await fetch(jsonUrl);

      if (!response.ok) {
        triggerToast(`${year}년 공휴일 JSON 파일을 찾지 못했습니다. 먼저 로컬 스크립트 또는 GitHub Actions로 public/holidays/kr-holidays-${year}.json 파일을 생성해 주세요.`, 'error');
        return;
      }

      const payload = await response.json();
      const importedHolidays = normalizeHolidayList(
        Array.isArray(payload)
          ? payload
          : Array.isArray(payload.holidays)
            ? payload.holidays
            : []
      );

      if (importedHolidays.length === 0) {
        triggerToast(`${year}년 공휴일 JSON에 불러올 휴일 데이터가 없습니다.`, 'error');
        return;
      }

      const currentHolidays = normalizeHolidayList(tempSettings.holidays);
      const currentDateSet = new Set(
        currentHolidays.map((holiday) => holiday.date)
      );
      const duplicateHolidays = importedHolidays.filter((holiday) =>
        currentDateSet.has(holiday.date)
      );
      const newHolidays = importedHolidays.filter(
        (holiday) => !currentDateSet.has(holiday.date)
      );

      setHolidayManagementYear(String(year));
      setHolidayManagementMonth(
        year === getKoreaNow().getUTCFullYear()
          ? getKoreaNow().getUTCMonth() + 1
          : 1
      );

      if (duplicateHolidays.length > 0) {
        setHolidayImportConflictModal({
          year,
          importedHolidays,
          importedDateCount: importedHolidays.length,
          newDateCount: newHolidays.length,
          duplicateDateCount: duplicateHolidays.length,
        });
        return;
      }

      setTempSettings((prev) => ({
        ...prev,
        holidays: mergeImportedHolidays(
          prev.holidays || [],
          importedHolidays,
          'merge'
        ),
      }));

      triggerToast(`${year}년 법정/임시공휴일 ${importedHolidays.length}건을 임시 목록에 불러왔습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
    } catch (error) {
      console.error('Static holiday JSON import error:', error);
      triggerToast('공휴일 JSON 파일을 불러오는 중 오류가 발생했습니다. public/holidays 파일 생성 및 배포 상태를 확인해 주세요.', 'error');
    } finally {
      setHolidayImportLoading(false);
    }
  };

  const getOriginalAssetCategoryName = (category) => {
    const matchedEntry = Object.entries(tempAssetCategoryRenameMap).find(
      ([, renamedName]) => renamedName === category
    );

    return matchedEntry ? matchedEntry[0] : category;
  };

  const addTempAssetCategory = () => {
    const categoryName = newAssetCategory.trim();

    if (!categoryName) {
      triggerToast('자산 카테고리 명칭을 입력해 주세요.', 'error');
      return;
    }

    if (tempAssetCategories.some((category) => String(category || '').trim() === categoryName)) {
      triggerToast('이미 등록된 자산 카테고리입니다.', 'error');
      return;
    }

    setTempAssetCategories((prev) => [...prev, categoryName]);
    setNewAssetCategory('');
    triggerToast(`[${categoryName}] 자산 카테고리가 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const startEditTempAssetCategory = (category, index) => {
    setEditingAssetCategoryIndex(index);
    setEditingAssetCategoryName(category);
  };

  const applyEditTempAssetCategory = (category, index) => {
    const nextCategoryName = editingAssetCategoryName.trim();

    if (!nextCategoryName) {
      triggerToast('자산 카테고리 명칭을 입력해 주세요.', 'error');
      return;
    }

    if (
      tempAssetCategories.some(
        (item, itemIndex) => itemIndex !== index && String(item || '').trim() === nextCategoryName
      )
    ) {
      triggerToast('이미 등록된 자산 카테고리입니다.', 'error');
      return;
    }

    const originalCategoryName = getOriginalAssetCategoryName(category);

    setTempAssetCategories((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? nextCategoryName : item))
    );

    setTempAssetCategoryRenameMap((prev) => {
      const nextMap = { ...prev };

      if ((data.assetCategories || []).includes(originalCategoryName) && originalCategoryName !== nextCategoryName) {
        nextMap[originalCategoryName] = nextCategoryName;
      } else {
        delete nextMap[originalCategoryName];
      }

      return nextMap;
    });

    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    triggerToast(`[${category}] 카테고리명이 임시 수정되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const deleteTempAssetCategory = (category, index) => {
    const originalCategoryName = getOriginalAssetCategoryName(category);
    const isCategoryInUse = data.laptops.some((asset) => {
      const assetCategory = asset.category || '노트북';
      return assetCategory === originalCategoryName || assetCategory === category;
    });

    if (isCategoryInUse) {
      triggerToast('해당 카테고리를 사용하는 자산이 있어 삭제할 수 없습니다.', 'error');
      return;
    }

    setTempAssetCategories((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setTempAssetCategoryRenameMap((prev) => {
      const nextMap = { ...prev };
      delete nextMap[originalCategoryName];
      return nextMap;
    });
    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    triggerToast(`[${category}] 자산 카테고리가 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`, 'success');
  };

  const moveTempAssetCategory = (fromIndex, toIndex) => {
    if (fromIndex === null || fromIndex === toIndex) return;

    setTempAssetCategories((prev) => {
      const next = [...prev];
      const [movedCategory] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedCategory);
      return next;
    });

    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
  };

  const cancelTempAssetCategoryChanges = ({ silent = false } = {}) => {
    setTempAssetCategories(data.assetCategories || []);
    setTempAssetCategoryRenameMap({});
    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    setDraggingAssetCategoryIndex(null);
    setNewAssetCategory('');
    if (!silent) {
      triggerToast('자산 카테고리 변경사항이 취소되고 이전 상태로 복원되었습니다.', 'success');
    }
  };

  const saveTempAssetCategoryChanges = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 자산 카테고리를 저장할 수 없습니다.',
        'error'
      );
      return false;
    }

    const nextAssetCategories =
      tempAssetCategories
        .map((category) =>
          String(category || '').trim()
        )
        .filter(Boolean);

    const duplicatedCategory =
      nextAssetCategories.find(
        (category, index) =>
          nextAssetCategories.indexOf(
            category
          ) !== index
      );

    if (duplicatedCategory) {
      triggerToast(
        `[${duplicatedCategory}] 카테고리명이 중복되어 저장할 수 없습니다.`,
        'error'
      );
      return false;
    }

    try {
      const assetsSnapshot =
        await getDocs(
          RENTAL_ASSETS_COLLECTION_REF
        );

      const assetOperations = [];
      const nextCatalogAssets = [];

      assetsSnapshot.docs.forEach(
        (assetDocument) => {
          const assetData = {
            ...assetDocument.data(),
            id: assetDocument.id,
          };

          const nextCategory =
            tempAssetCategoryRenameMap[
              assetData.category
            ] ||
            assetData.category;

          if (
            nextCategory !==
              assetData.category &&
            normalizeAssetReservations(
              assetData.reservations || []
            ).length > 0
          ) {
            const activeRentalError =
              new Error(
                'active-rental-category-rename'
              );

            activeRentalError.assetNo =
              assetData.assetNo;

            throw activeRentalError;
          }

          if (
            !nextAssetCategories.includes(
              nextCategory
            )
          ) {
            const categoryInUseError =
              new Error(
                'asset-category-still-in-use'
              );

            categoryInUseError.category =
              assetData.category;

            throw categoryInUseError;
          }

          const nextAsset = {
            ...assetData,
            category:
              nextCategory,
          };

          nextCatalogAssets.push(nextAsset);

          if (
            nextCategory !==
            assetData.category
          ) {
            assetOperations.push({
              type: 'set',
              ref: assetDocument.ref,
              data: {
                category:
                  nextCategory,
                updatedAt:
                  serverTimestamp(),
              },
              options: {
                merge: true,
              },
            });
          }
        }
      );

      const catalogPayload =
        await createPublicAssetCatalogPayload(
          nextCatalogAssets,
          {
            updatedByUid:
              firebaseAuth.currentUser?.uid ||
              authenticatedAdminId ||
              currentAuthAdminAccount?.id ||
              '',
          }
        );

      const categorySaveBatch =
        writeBatch(db);

      assetOperations.forEach(
        (operation) => {
          categorySaveBatch.set(
            operation.ref,
            operation.data,
            operation.options
          );
        }
      );

      categorySaveBatch.set(
        PUBLIC_CONFIG_DOC_REF,
        {
          assetCategories:
            nextAssetCategories,
          updatedAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      categorySaveBatch.set(
        PUBLIC_ASSET_CATALOG_DOC_REF,
        catalogPayload,
        {
          merge: false,
        }
      );

      await categorySaveBatch.commit();

      setData((prev) => ({
        ...prev,
        assetCategories:
          nextAssetCategories,
        laptops:
          (prev.laptops || []).map(
            (asset) => ({
              ...asset,
              category:
                tempAssetCategoryRenameMap[
                  asset.category
                ] ||
                asset.category,
            })
          ),
      }));

      setSelectedAssetCategory(
        '전체'
      );
      setAdminSelectedAssetCategory(
        '전체'
      );
      setTempAssetCategories(
        nextAssetCategories
      );
      setTempAssetCategoryRenameMap(
        {}
      );
      setEditingAssetCategoryIndex(
        null
      );
      setEditingAssetCategoryName(
        ''
      );
      setDraggingAssetCategoryIndex(
        null
      );

      triggerToast(
        '자산 카테고리 변경사항이 분리 저장소에 성공적으로 저장 및 반영되었습니다.',
        'success'
      );

      return true;
    } catch (error) {
      console.error(
        'Asset category save error:',
        error
      );

      if (
        error?.message ===
        'active-rental-category-rename'
      ) {
        triggerToast(
          `진행 중 예약이 있는 자산 [${error.assetNo}]이(가) 포함되어 카테고리명을 변경할 수 없습니다. 해당 신청을 먼저 완료해 주세요.`,
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'asset-category-still-in-use'
      ) {
        triggerToast(
          `카테고리 [${error.category}]를 사용하는 최신 자산이 있어 삭제할 수 없습니다.`,
          'error'
        );
        return false;
      }

      const catalogErrorMessage =
        await getPublicAssetCatalogWriteErrorMessage(error);

      if (catalogErrorMessage) {
        triggerToast(catalogErrorMessage, 'error');
        return false;
      }

      triggerToast(
        '자산 카테고리 저장에 실패했습니다. 기존 카테고리와 자산 정보는 유지됩니다.',
        'error'
      );

      return false;
    }
  };

  const saveSystemSettings = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 대여 정책을 저장할 수 없습니다.',
        'error'
      );
      return false;
    }

    if (
      !Number.isInteger(Number(tempSettings.maxRentalDays)) ||
      Number(tempSettings.maxRentalDays) < 1
    ) {
      triggerToast(
        '기본 최장 허용 대여 기간은 1 이상의 정수로 입력해 주세요.',
        'error'
      );
      return false;
    }

    if (
      tempSettings.rentalExtensionEnabled &&
      (
        Number(tempSettings.rentalExtensionMaxCount) < 1 ||
        Number(tempSettings.rentalExtensionDays) < 1 ||
        Number(tempSettings.rentalExtensionRequestWaitDays) < 0
      )
    ) {
      triggerToast(
        '대여 연장 횟수와 회당 연장 기간은 1 이상, 연장 신청 대기일은 0 이상으로 입력해 주세요.',
        'error'
      );
      return false;
    }

    if (
      tempSettings.postOverduePenaltyEnabled &&
      (
        (
          tempSettings.overduePenaltyMode ===
            OVERDUE_PENALTY_MODE.FIXED_PER_ASSET &&
          Number(tempSettings.overdueFixedDaysPerAsset) < 1
        ) ||
        (
          tempSettings.overduePenaltyMode ===
            OVERDUE_PENALTY_MODE.OVERDUE_DAY_MULTIPLIER &&
          Number(tempSettings.overdueDayMultiplier) < 1
        )
      )
    ) {
      triggerToast(
        '연체 페널티의 기기당 고정 일수와 연체일 배수는 1 이상의 정수로 입력해 주세요.',
        'error'
      );
      return false;
    }

    const excludeSaturdays =
      tempSettings.excludeSaturdays ??
      tempSettings.excludeWeekendsForStartDate ??
      DEFAULT_EXCLUDE_SATURDAYS;
    const excludeSundays =
      tempSettings.excludeSundays ??
      tempSettings.excludeWeekendsForStartDate ??
      DEFAULT_EXCLUDE_SUNDAYS;

    const normalizedPolicySettings = normalizeRentalPolicySettings({
      ...data.settings,
      ...tempSettings,
      holidays: data.settings.holidays,
      allowNonOverlappingSameAssetRequests:
        tempSettings.allowNonOverlappingSameAssetRequests ??
        DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
      adjustStartDateAfterWorkEnd:
        tempSettings.adjustStartDateToNextBusinessDay ??
        tempSettings.adjustStartDateAfterWorkEnd ??
        DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
      adjustStartDateToNextBusinessDay:
        tempSettings.adjustStartDateToNextBusinessDay ??
        tempSettings.adjustStartDateAfterWorkEnd ??
        DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
      excludeSaturdays,
      excludeSundays,
      excludeWeekendsForStartDate: excludeSaturdays && excludeSundays,
      maxRentalDays: getSafeMaxRentalDays(tempSettings),
    });

    const policyValues = Object.fromEntries(
      RENTAL_POLICY_SETTING_KEYS.map((key) => [key, normalizedPolicySettings[key]])
    );
    const firestorePolicyUpdates = Object.fromEntries(
      RENTAL_POLICY_SETTING_KEYS.map((key) => [
        `settings.${key}`,
        normalizedPolicySettings[key],
      ])
    );

    try {
      await updateDoc(PUBLIC_CONFIG_DOC_REF, {
        ...firestorePolicyUpdates,
        updatedAt: serverTimestamp(),
      });

      const nextSettings = {
        ...data.settings,
        ...policyValues,
        holidays: normalizeHolidayList(data.settings.holidays),
      };

      setData((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          ...policyValues,
        },
      }));
      setTempSettings(nextSettings);

      triggerToast(
        '대여 정책 변경사항이 성공적으로 저장 및 반영되었습니다.',
        'success'
      );

      return true;
    } catch (error) {
      console.error('Rental policy settings save error:', error);

      triggerToast(
        '대여 정책 저장에 실패했습니다. 기존 설정은 유지됩니다.',
        'error'
      );

      return false;
    }
  };

  const saveHolidaySettings = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 휴일을 저장할 수 없습니다.',
        'error'
      );
      return false;
    }

    const nextHolidays = serializeHolidayListForFirestore(
      tempSettings.holidays || []
    );

    try {
      await updateDoc(PUBLIC_CONFIG_DOC_REF, {
        'settings.holidays': nextHolidays,
        updatedAt: serverTimestamp(),
      });

      const normalizedHolidays = normalizeHolidayList(nextHolidays);

      setData((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          holidays: normalizedHolidays,
        },
      }));
      setTempSettings((prev) => ({
        ...prev,
        holidays: normalizedHolidays,
      }));
      setHolidayImportConflictModal(null);
      setHolidayImportLoading(false);

      triggerToast(
        '휴일 변경사항이 성공적으로 저장 및 반영되었습니다.',
        'success'
      );

      return true;
    } catch (error) {
      console.error('Holiday settings save error:', error);

      triggerToast(
        '휴일 저장에 실패했습니다. 기존 설정은 유지됩니다.',
        'error'
      );

      return false;
    }
  };

  const discardHolidayChanges = () => {
    setTempSettings((prev) => ({
      ...prev,
      holidays: normalizeHolidayList(data.settings.holidays || []),
    }));
    setNewHolidayDate(today());
    setNewHolidayName('');
    setNewHolidayType(DEFAULT_HOLIDAY_TYPE);
    setHolidayImportConflictModal(null);
    setHolidayImportLoading(false);
  };

  const discardRentalPolicyChanges = () => {
    const savedPolicyValues = getComparableRentalPolicySettings(data.settings);

    setTempSettings((prev) => ({
      ...prev,
      ...savedPolicyValues,
      holidays: prev.holidays,
    }));
  };

  const discardFooterConfigChanges = () => {
    setFooterConfigDraft({
      enabled: Boolean(footerConfig.enabled),
      contentHtml: footerConfig.contentHtml || '',
    });
  };

  const getAdminDeferredChangesConfig = (tab) => {
    if (tab === 'extensionSettings' && rentalPolicySettingsDirty) {
      return {
        label: '대여 정책',
        discard: discardRentalPolicyChanges,
        save: saveSystemSettings,
      };
    }

    if (tab === 'holidaySettings' && holidaySettingsDirty) {
      return {
        label: '휴일',
        discard: discardHolidayChanges,
        save: saveHolidaySettings,
      };
    }

    if (tab === 'categories' && assetCategorySettingsDirty) {
      return {
        label: '자산 카테고리',
        discard: () => cancelTempAssetCategoryChanges({ silent: true }),
        save: saveTempAssetCategoryChanges,
      };
    }

    if (tab === 'people' && peopleSettingsDirty) {
      const {
        discard,
        save,
      } = memberDirectoryDeferredActionsRef.current;

      if (
        typeof discard !== 'function' ||
        typeof save !== 'function'
      ) {
        return null;
      }

      return {
        label: '부서·사용자',
        discard,
        save,
      };
    }

    if (tab === 'signupPolicy' && signupPolicyDirty) {
      const {
        discard,
        save,
      } = signupPolicyDeferredActionsRef.current;

      if (
        typeof discard !== 'function' ||
        typeof save !== 'function'
      ) {
        return null;
      }

      return {
        label: '회원가입 정책',
        discard,
        save,
      };
    }

    if (tab === 'noticePosts' && noticeBoardSettingsDirty) {
      return {
        label: '공지사항 목록 설정',
        discard: discardNoticeBoardConfigChanges,
        save: saveNoticeBoardConfig,
      };
    }

    if (tab === 'faqPosts' && faqBoardSettingsDirty) {
      return {
        label: 'FAQ 목록 설정',
        discard: discardFaqBoardConfigChanges,
        save: saveFaqBoardConfig,
      };
    }

    if (tab === 'footerManagement' && footerConfigDirty) {
      return {
        label: '푸터 공통 정보',
        discard: discardFooterConfigChanges,
        save: saveFooterConfig,
      };
    }

    return null;
  };

  const handleAdminTabChange = (nextTab) => {
    if (!nextTab || nextTab === adminTab) {
      return;
    }

    const deferredChanges = getAdminDeferredChangesConfig(adminTab);

    if (!deferredChanges) {
      setAdminTab(nextTab);
      return;
    }

    setConfirmModal({
      title: `저장되지 않은 ${deferredChanges.label} 변경사항`,
      message: `저장되지 않은 ${deferredChanges.label} 변경사항이 있습니다. 변경사항을 저장한 후 이동하시겠습니까?`,
      cancelLabel: '계속 편집',
      secondaryLabel: '저장하지 않고 이동',
      confirmLabel: '저장 후 이동',
      confirmLoadingLabel: '저장 중...',
      variant: 'primary',
      secondaryVariant: 'outline',
      onSecondary: () => {
        deferredChanges.discard();
        setAdminTab(nextTab);
        return true;
      },
      onConfirm: async () => {
        const saved = await deferredChanges.save();

        if (!saved) {
          return false;
        }

        setAdminTab(nextTab);
        return true;
      },
    });
  };

  const shouldShowStats =
    hasAdminAccess || (view === 'user' && userTab === 'rental');

  const shouldPrepareUserRentalList =
    view === 'user' && userTab === 'rental';

  const shouldPrepareAdminAssetList =
    hasAdminAccess && adminTab === 'laptops';

  const shouldPrepareRentalStatus =
    shouldPrepareAdminAssetList ||
    (view === 'user' && ['home', 'rental'].includes(userTab));

  const rentalStatusSummary = useMemo(() => {
    const emptyStats = {
      total: 0,
      available: 0,
      requested: 0,
      reserved: 0,
      approved: 0,
      overdue: 0,
    };

    if (!shouldPrepareRentalStatus) {
      return {
        blockedLaptopIds: new Set(),
        stats: emptyStats,
      };
    }

    const todayDate = today();
    const nextBlockedLaptopIds = new Set();

    let requested = 0;
    let reserved = 0;
    let approved = 0;
    let overdue = 0;

    data.requests.forEach((request) => {
      if (
        request.status === STATUS.REQUESTED ||
        request.status === STATUS.APPROVED ||
        request.status === STATUS.ON_HOLD
      ) {
        nextBlockedLaptopIds.add(request.laptopId);
      }

      if (request.status === STATUS.REQUESTED) {
        requested += 1;
        return;
      }

      if (request.status !== STATUS.APPROVED) {
        return;
      }

      if (request.startDate && request.startDate > todayDate) {
        reserved += 1;
        return;
      }

      approved += 1;

      if (request.dueDate && request.dueDate < todayDate) {
        overdue += 1;
      }
    });

    let available = 0;

    data.laptops.forEach((laptop) => {
      if (
        !nextBlockedLaptopIds.has(laptop.id) &&
        laptop.status !== STATUS.UNAVAILABLE
      ) {
        available += 1;
      }
    });

    return {
      blockedLaptopIds: nextBlockedLaptopIds,
      stats: {
        total: data.laptops.length,
        available,
        requested,
        reserved,
        approved,
        overdue,
      },
    };
  }, [shouldPrepareRentalStatus, data.requests, data.laptops]);

  const blockedLaptopIds = rentalStatusSummary.blockedLaptopIds;

  const adminRentalStatusStats = useMemo(() => {
    const metrics = dashboardSummary?.metrics || {};
    const getMetric = (key) => {
      const value = Number(metrics[key]);
      return Number.isFinite(value) ? value : 0;
    };

    return {
      total: getMetric('totalAssetCount'),
      available: getMetric('availableCount'),
      requested: getMetric('requestedCount'),
      reserved: getMetric('uniqueReservedAssets'),
      approved: getMetric('uniqueActiveAssets'),
      overdue: getMetric('uniqueOverdueAssets'),
    };
  }, [dashboardSummary]);

  const shouldUseAdminSummaryStats = view === 'admin' && isAdminAuthenticated;
  const stats = shouldUseAdminSummaryStats
    ? adminRentalStatusStats
    : rentalStatusSummary.stats;
  const statsLoading =
    shouldUseAdminSummaryStats &&
    (!dashboardSummaryReady || !dashboardSummary);

  const filteredLaptops = useMemo(() => {
    if (!shouldPrepareUserRentalList) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    return data.laptops.filter((l) => {
      const laptopAvailability = getLaptopRentalAvailability(
        l,
        data.requests,
        data.settings,
        form.startDate,
        form.dueDate
      );

      const keywordMatched = `${l.category || ''} ${l.assetNo} ${l.serialNo} ${l.model} ${l.note}`
        .toLowerCase()
        .includes(normalizedQuery);

      const categoryMatched =
        selectedAssetCategory === '전체' || l.category === selectedAssetCategory;

      const availabilityMatched =
        availabilityFilter === '전체'
          ? true
          : availabilityFilter === STATUS.AVAILABLE
            ? !laptopAvailability.blocked
            : laptopAvailability.blocked;

      return keywordMatched && categoryMatched && availabilityMatched;
    });
  }, [
    shouldPrepareUserRentalList,
    data.laptops,
    data.requests,
    data.settings,
    form.startDate,
    form.dueDate,
    query,
    selectedAssetCategory,
    availabilityFilter,
  ]);

  const adminFilteredLaptops = useMemo(() => {
    if (!shouldPrepareAdminAssetList) {
      return [];
    }

    const normalizedAdminLaptopQuery = adminLaptopQuery.trim().toLowerCase();

    return data.laptops.filter((l) => {
      const keywordMatched = `${l.category || ''} ${l.assetNo} ${l.serialNo} ${l.model} ${l.note}`
        .toLowerCase()
        .includes(normalizedAdminLaptopQuery);

      const categoryMatched =
        adminSelectedAssetCategory === '전체' || l.category === adminSelectedAssetCategory;

      const availabilityMatched =
        adminAvailabilityFilter === '전체'
          ? true
          : adminAvailabilityFilter === STATUS.AVAILABLE
            ? !blockedLaptopIds.has(l.id) && l.status !== STATUS.UNAVAILABLE
            : blockedLaptopIds.has(l.id) || l.status === STATUS.UNAVAILABLE;

      return keywordMatched && categoryMatched && availabilityMatched;
    });
  }, [
    shouldPrepareAdminAssetList,
    data.laptops,
    adminLaptopQuery,
    adminSelectedAssetCategory,
    adminAvailabilityFilter,
    blockedLaptopIds,
  ]);

  const selectedLaptop = data.laptops.find((l) => l.id === selectedLaptopId);

  const isPeriodBasedRentalMode =
    data.settings.allowNonOverlappingSameAssetRequests ??
    DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS;

  const rentalDeviceSectionTitle = isPeriodBasedRentalMode
    ? '대여 기기 선택'
    : '대여 기기 선택';

  const rentalDeviceSectionDescription = isPeriodBasedRentalMode
    ? '선택 기간 중 [대여가능] 기기만 신청할 수 있습니다.'
    : '[대여가능] 기기만 신청할 수 있습니다.';

  const availableFilterLabel = STATUS.AVAILABLE;
  const unavailableFilterLabel = STATUS.UNAVAILABLE;

const getUserLaptopStatusLabel = (laptopAvailability) => {
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

  const selectedLaptopAvailability = selectedLaptop
    ? getLaptopRentalAvailability(
        selectedLaptop,
        data.requests,
        data.settings,
        form.startDate,
        form.dueDate
      )
    : null;

  useEffect(() => {
    if (!selectedLaptop || !selectedLaptopAvailability?.blocked) {
      return;
    }

    setSelectedLaptopId(null);

    if (selectedLaptopAvailability.reason === 'periodOverlap') {
      triggerToast(
        '선택한 대여 기간에는 기존 선택 기기를 사용할 수 없어 선택이 해제되었습니다.',
        'error'
      );
      return;
    }

    if (selectedLaptopAvailability.reason === 'assetUnavailable') {
      triggerToast(
        '선택한 기기가 대여불가 상태여서 선택이 해제되었습니다.',
        'error'
      );
      return;
    }

    triggerToast(
      '선택한 기기가 현재 신청할 수 없는 상태여서 선택이 해제되었습니다.',
      'error'
    );
  }, [
    selectedLaptopId,
    selectedLaptop?.id,
    selectedLaptopAvailability?.blocked,
    selectedLaptopAvailability?.reason,
    selectedLaptopAvailability?.blockingRequest?.startDate,
    selectedLaptopAvailability?.blockingRequest?.dueDate,
  ]);

  const filteredBorrowers = data.borrowers.filter((b) => b.team === form.team);

  const rentalPeriodFields = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <DateInputWithWeekday
        label="대여 시작일"
        value={form.startDate}
        min={today()}
        onInvalidDate={() => triggerToast('올바른 날짜를 입력해 주세요.', 'error')}
        onChange={(v) => {
          const minStartDate = today();

          if (!v) {
            const nextStartDate = getAdjustedRentalStartDate(minStartDate, data.settings);

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
            });

            return nextStartDate;
          }

          if (isTemporaryDateInputValue(v)) {
            setForm({
              ...form,
              startDate: v,
            });

            return v;
          }

          if (v < minStartDate) {
            const nextStartDate = getAdjustedRentalStartDate(minStartDate, data.settings);

            triggerToast(
              `대여 시작일은 오늘보다 이전일 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(nextStartDate)}입니다.`,
              'error'
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
            });

            return nextStartDate;
          }

          const nextStartDate = getAdjustedRentalStartDate(v, data.settings);

          if (nextStartDate !== v) {
            const reason = getNonBusinessDayReason(v, data.settings);

            triggerToast(
              `대여 시작일은 ${reason ? `${reason}이라` : '영업일이 아니라'} 선택할 수 없습니다. ${formatDateWithKoreanWeekday(nextStartDate)}로 조정되었습니다.`,
              'error'
            );
          }

          setForm({
            ...form,
            startDate: nextStartDate,
            dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
          });

          return nextStartDate;
        }}
        onDateBlur={(v) => {
          const minStartDate = today();

          if (!v || isTemporaryDateInputValue(v) || v < minStartDate) {
            const nextStartDate = getAdjustedRentalStartDate(minStartDate, data.settings);

            triggerToast(
              `대여 시작일은 오늘보다 이전일 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(nextStartDate)}입니다.`,
              'error'
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
            });

            return nextStartDate;
          }

          const nextStartDate = getAdjustedRentalStartDate(v, data.settings);

          if (nextStartDate !== v) {
            const reason = getNonBusinessDayReason(v, data.settings);

            triggerToast(
              `대여 시작일은 ${reason ? `${reason}이라` : '영업일이 아니라'} 선택할 수 없습니다. ${formatDateWithKoreanWeekday(nextStartDate)}로 조정되었습니다.`,
              'error'
            );

            setForm({
              ...form,
              startDate: nextStartDate,
              dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
            });

            return nextStartDate;
          }

          setForm({
            ...form,
            startDate: nextStartDate,
            dueDate: getMaxRentalDueDate(nextStartDate, data.settings),
          });

          return nextStartDate;
        }}
      />

      <DateInputWithWeekday
        label="반납 예정일"
        value={form.dueDate}
        min={form.startDate}
        max={getMaxRentalDueDate(form.startDate, data.settings)}
        onInvalidDate={() => triggerToast('올바른 날짜를 입력해 주세요.', 'error')}
        onChange={(v) => {
          const minDueDate = form.startDate;
          const maxDueDate = getMaxRentalDueDate(form.startDate, data.settings);
          const maxRentalDays = getSafeMaxRentalDays(data.settings);
          let nextDueDate = v;

          if (!nextDueDate) {
            const adjustedMinDueDate = getAdjustedRentalDueDate(
              minDueDate,
              data.settings
            );

            setForm({ ...form, dueDate: adjustedMinDueDate });
            return adjustedMinDueDate;
          }

          if (isTemporaryDateInputValue(nextDueDate)) {
            setForm({ ...form, dueDate: nextDueDate });
            return nextDueDate;
          }

          if (nextDueDate < minDueDate) {
            triggerToast(
              `반납 예정일은 대여 시작일보다 빠를 수 없습니다. 최소 반납 예정일은 ${formatDateWithKoreanWeekday(minDueDate)}입니다.`,
              'error'
            );

            nextDueDate = minDueDate;
          }

          if (nextDueDate > maxDueDate) {
            triggerToast(
              `대여 가능 기간은 대여 시작일 다음 날부터 최대 ${maxRentalDays}일이며 달력 기준으로 계산됩니다. 반납 예정일은 ${formatDateWithKoreanWeekday(maxDueDate)}까지 선택할 수 있습니다.`,
              'error'
            );

            nextDueDate = maxDueDate;
          }

          const adjustedDueDate = getAdjustedRentalDueDate(
            nextDueDate,
            data.settings
          );

          if (adjustedDueDate !== nextDueDate) {
            const adjustmentReason = getRentalDueDateAdjustmentReason(
              nextDueDate,
              data.settings
            );
            const finalDueDate =
              adjustedDueDate > maxDueDate
                ? maxDueDate
                : adjustedDueDate;

            triggerToast(
              `선택한 반납 예정일이 ${adjustmentReason || '휴무일'}이므로 다음 영업일인 ${formatDateWithKoreanWeekday(finalDueDate)}로 자동 조정되었습니다.`,
              'success'
            );

            nextDueDate = finalDueDate;
          }

          setForm({ ...form, dueDate: nextDueDate });

          return nextDueDate;
        }}
        onDateBlur={(v) => {
          const minDueDate = form.startDate;
          const maxDueDate = getMaxRentalDueDate(form.startDate, data.settings);
          const maxRentalDays = getSafeMaxRentalDays(data.settings);
          let nextDueDate = v;

          if (!nextDueDate || isTemporaryDateInputValue(nextDueDate) || nextDueDate < minDueDate) {
            const adjustedMinDueDate = getAdjustedRentalDueDate(
              minDueDate,
              data.settings
            );

            triggerToast(
              `반납 예정일은 대여 시작일보다 빠를 수 없습니다. 최소 반납 예정일은 ${formatDateWithKoreanWeekday(adjustedMinDueDate)}입니다.`,
              'error'
            );

            setForm({ ...form, dueDate: adjustedMinDueDate });

            return adjustedMinDueDate;
          }

          if (nextDueDate > maxDueDate) {
            triggerToast(
              `대여 가능 기간은 대여 시작일 다음 날부터 최대 ${maxRentalDays}일이며 달력 기준으로 계산됩니다. 반납 예정일은 ${formatDateWithKoreanWeekday(maxDueDate)}까지 선택할 수 있습니다.`,
              'error'
            );

            setForm({ ...form, dueDate: maxDueDate });

            return maxDueDate;
          }

          const adjustedDueDate = getAdjustedRentalDueDate(
            nextDueDate,
            data.settings
          );

          if (adjustedDueDate !== nextDueDate) {
            const adjustmentReason = getRentalDueDateAdjustmentReason(
              nextDueDate,
              data.settings
            );
            const finalDueDate =
              adjustedDueDate > maxDueDate
                ? maxDueDate
                : adjustedDueDate;

            triggerToast(
              `선택한 반납 예정일이 ${adjustmentReason || '휴무일'}이므로 다음 영업일인 ${formatDateWithKoreanWeekday(finalDueDate)}로 자동 조정되었습니다.`,
              'success'
            );

            setForm({ ...form, dueDate: finalDueDate });

            return finalDueDate;
          }

          setForm({ ...form, dueDate: nextDueDate });

          return nextDueDate;
        }}
      />
    </div>
  );

  const rentalStartAdjustmentInfo = getRentalStartAdjustmentInfo(data.settings);
  const tempBusinessDayAdjustmentEnabled =
    tempSettings.adjustStartDateToNextBusinessDay ??
    tempSettings.adjustStartDateAfterWorkEnd ??
    DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY;
  const tempHolidayList = normalizeHolidayList(tempSettings.holidays);

  const tempAllowNonOverlappingSameAssetRequests =
    tempSettings.allowNonOverlappingSameAssetRequests ??
    DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS;

  const editLaptopIndex = editLaptop ? adminFilteredLaptops.findIndex((l) => l.id === editLaptop.id) : -1;
  const editLaptopInsertIndex =
    editLaptopIndex >= 0
      ? Math.min(
          Math.ceil((editLaptopIndex + 1) / assetGridColumns) * assetGridColumns - 1,
          adminFilteredLaptops.length - 1
        )
      : -1;

  const loadFreshRentalRestrictionStatus = async (requesterUid) => {
    const restrictionDocRef = doc(
      RENTAL_RESTRICTIONS_COLLECTION_REF,
      requesterUid
    );

    const [
      publicConfigSnapshot,
      userRequestsSnapshot,
      restrictionSnapshot,
    ] = await Promise.all([
      getDoc(PUBLIC_CONFIG_DOC_REF),
      getDocs(
        firestoreQuery(
          RENTAL_REQUESTS_COLLECTION_REF,
          where('requesterUid', '==', requesterUid)
        )
      ),
      getDoc(restrictionDocRef),
    ]);

    const latestSettings = normalizeRentalPolicySettings({
      ...data.settings,
      ...(publicConfigSnapshot.exists()
        ? publicConfigSnapshot.data()?.settings || {}
        : {}),
    });

    const latestRequests = userRequestsSnapshot.docs.map(
      (requestDocument) => ({
        ...requestDocument.data(),
        id: requestDocument.id,
      })
    );

    const latestRestriction = restrictionSnapshot.exists()
      ? {
          ...restrictionSnapshot.data(),
          uid: restrictionSnapshot.id,
        }
      : null;

    return getRentalRestrictionStatus({
      requests: latestRequests,
      requesterUid,
      settings: latestSettings,
      restriction: latestRestriction,
      referenceDate: today(),
    });
  };

  const hasOtherCurrentOverdueRequest = async ({
    requesterUid,
    excludedRequestId,
    referenceDate,
  }) => {
    if (!requesterUid || !referenceDate) {
      return false;
    }

    const snapshot = await getDocs(
      firestoreQuery(
        RENTAL_REQUESTS_COLLECTION_REF,
        where('requesterUid', '==', requesterUid),
        where('status', '==', STATUS.APPROVED),
        where('dueDate', '<', referenceDate),
        firestoreLimit(2)
      )
    );

    return snapshot.docs.some(
      (requestDocument) => requestDocument.id !== excludedRequestId
    );
  };

  const getOverdueReturnResult = ({
    latestRequest,
    latestSettings,
    restrictionData,
    actualReturnDate,
    batchId,
    hasOtherCurrentOverdueRequests = false,
  }) =>
    buildOverdueReturnResult({
      request: latestRequest,
      actualReturnDate,
      settings: latestSettings,
      restriction: restrictionData,
      hasOtherCurrentOverdueRequests,
      batchId,
    });

  const writeOverdueReturnSideEffects = ({
    transaction,
    requestId,
    requesterUid,
    returnResult,
  }) => {
    if (!returnResult?.restrictionData || !requesterUid) {
      return;
    }

    const restrictionDocRef = doc(
      RENTAL_RESTRICTIONS_COLLECTION_REF,
      requesterUid
    );

    transaction.set(
      restrictionDocRef,
      {
        ...returnResult.restrictionData,
        calculatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    (returnResult.finalizedRequestIds || [])
      .filter((pendingRequestId) => pendingRequestId !== requestId)
      .forEach((pendingRequestId) => {
        transaction.update(
          doc(
            RENTAL_REQUESTS_COLLECTION_REF,
            pendingRequestId
          ),
          {
            overduePenaltyPending: false,
            overduePenaltyBatchId:
              returnResult.requestFields.overduePenaltyBatchId || '',
            updatedAt: serverTimestamp(),
            syncedAt: serverTimestamp(),
          }
        );
      });
  };

  const { submitRequest } = useUserRentalRequestController({
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    dataRequests: data.requests,
    dataSettings: data.settings,
    firebaseAuthReady,
    firebaseAuthUser,
    form,
    goToUserLogin,
    goToUserMypage,
    isAdminAuthenticated,
    isSplitStorageReady,
    loadFreshRentalRestrictionStatus,
    requestSubmitInProgressRef,
    requestSubmitLoading,
    selectedLaptop,
    setData,
    setForm,
    setRentalRequests,
    setRequestSubmitLoading,
    setSelectedLaptopId,
    siteSettings,
    triggerToast,
    userProfile,
    userProfileReady,
  });

  const {
    activeUserActionRentalRequest,
    closeUserActionDialog,
    openUserActionDialog,
    submitUserActionRequest,
    userActionBorrowers,
  } = useUserRequestHistoryActionController({
    currentUserRentalRestrictionStatus,
    currentUserRequests,
    dataBorrowers: data.borrowers,
    dataSettings: data.settings,
    firebaseAuthUser,
    loadFreshRentalRestrictionStatus,
    setData,
    setRentalRequests,
    setUserActionDialog,
    setUserActionForm,
    setUserActionSaving,
    siteSettings,
    triggerToast,
    userActionDialog,
    userActionForm,
    userActionSaving,
  });

  const getCurrentAdminAuditActor = () => ({
    uid:
      firebaseAuth.currentUser?.uid ||
      authenticatedAdminAccount?.authUid ||
      '',

    adminId:
      authenticatedAdminAccount?.id ||
      '',

    name:
      authenticatedAdminAccount?.userName ||
      authenticatedAdminAccount?.adminLoginId ||
      authenticatedAdminAccount?.authEmail ||
      '관리자',
  });

  const {
    closeFaqPostDialog,
    closeNoticePostDialog,
    confirmDeleteFaqPost,
    confirmDeleteNoticePost,
    openFaqPostDialog,
    openNoticePostDialog,
    saveFaqPost,
    saveNoticePost,
  } = useAdminBoardPostController({
    adminExpandedFaqPostId,
    expandedFaqPostId,
    faqCategories,
    faqCategoryNameById,
    faqPostDialog,
    faqPostForm,
    faqPostSaving,
    faqPosts,
    getCurrentAdminAuditActor,
    isAdminAuthenticated,
    noticePostDialog,
    noticePostForm,
    noticePostSaving,
    noticePosts,
    selectedNoticePostId,
    setAdminExpandedFaqPostId,
    setExpandedFaqPostId,
    setFaqPostDeletingId,
    setFaqPostDialog,
    setFaqPostForm,
    setFaqPostSaving,
    setNoticePostDeletingId,
    setNoticePostDialog,
    setNoticePostForm,
    setNoticePostSaving,
    setSelectedNoticePostId,
    triggerConfirm,
    triggerToast,
  });

    const reviewUserActionRequest = async (
    id,
    approved
  ) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 사용자 요청을 처리할 수 없습니다.',
        'error'
      );
      return;
    }

    const currentRequest =
      getAdminRequestById(id);

    if (!currentRequest) {
      triggerToast(
        '신청 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 사용자 요청 처리를 중단했습니다.',
        'error'
      );
      return;
    }

    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      id
    );

    const availabilityDocRef = doc(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      id
    );

    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      currentRequest.laptopId
    );

    const requestLogDocRef = doc(
      RENTAL_REQUEST_LOGS_COLLECTION_REF
    );

    const restrictionDocRef = currentRequest.requesterUid
      ? doc(
          RENTAL_RESTRICTIONS_COLLECTION_REF,
          currentRequest.requesterUid
        )
      : null;

    const overdueBatchId =
      `OVERDUE-${doc(RENTAL_RESTRICTIONS_COLLECTION_REF).id}`;

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailabilityRequest = null;
    let shouldKeepAvailability = false;
    let processedActionType = '';

    setAdminUserActionSavingRequestId(id);

    try {
      const hasOtherCurrentOverdueRequests =
        approved &&
        currentRequest.userActionRequest?.type === USER_REQUEST_ACTION.RETURN
          ? await hasOtherCurrentOverdueRequest({
              requesterUid: currentRequest.requesterUid,
              excludedRequestId: currentRequest.id,
              referenceDate: today(),
            })
          : false;

      await runTransaction(
        db,
        async (transaction) => {
          const [
            requestSnapshot,
            assetSnapshot,
            publicConfigSnapshot,
            restrictionSnapshot,
          ] = await Promise.all([
            transaction.get(
              requestDocRef
            ),
            transaction.get(
              assetDocRef
            ),
            transaction.get(
              PUBLIC_CONFIG_DOC_REF
            ),
            restrictionDocRef
              ? transaction.get(restrictionDocRef)
              : Promise.resolve(null),
          ]);

          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }

          if (!assetSnapshot.exists()) {
            throw new Error(
              'rental-asset-not-found'
            );
          }

          const latestRequest = {
            ...requestSnapshot.data(),
            id: requestSnapshot.id,
          };

          const latestSettings = normalizeRentalPolicySettings({
            ...data.settings,
            ...(publicConfigSnapshot.exists()
              ? publicConfigSnapshot.data()?.settings || {}
              : {}),
          });

          const latestRestriction =
            restrictionSnapshot?.exists()
              ? {
                  ...restrictionSnapshot.data(),
                  uid: restrictionSnapshot.id,
                }
              : null;

          const userActionRequest =
            latestRequest.userActionRequest;

          if (
            !userActionRequest ||
            userActionRequest.status !==
              USER_REQUEST_REVIEW_STATUS.PENDING
          ) {
            throw new Error(
              'user-action-request-not-pending'
            );
          }

          processedActionType =
            userActionRequest.type || '';

          if (
            !Object.values(
              USER_REQUEST_ACTION
            ).includes(
              processedActionType
            )
          ) {
            throw new Error(
              'invalid-user-action-request-type'
            );
          }

          const latestAsset = {
            ...assetSnapshot.data(),
            id: assetSnapshot.id,
          };

          const latestReservations =
            normalizeAssetReservations(
              latestAsset.reservations || []
            ).filter(
              (request) =>
                request.id !== id
            );

          const nextReviewStatus =
            approved
              ? USER_REQUEST_REVIEW_STATUS.APPROVED
              : USER_REQUEST_REVIEW_STATUS.DENIED;

          let nextUserActionRequest = {
            ...userActionRequest,
            status: nextReviewStatus,
            reviewedAt:
              serverTimestamp(),
            reviewedByUid:
              auditActor.uid,
            reviewedByName:
              auditActor.name,
            reviewMemo:
              latestRequest.adminMemo || '',
          };

          const previousStatus =
            latestRequest.status || '';

          let nextStatus =
            previousStatus;

          let nextRequestFields = {
            userActionRequest:
              nextUserActionRequest,
            updatedAt:
              serverTimestamp(),
            syncedAt:
              serverTimestamp(),
          };

          let nextCommittedRequest = {
            ...latestRequest,
            userActionRequest:
              nextUserActionRequest,
          };

          let overdueReturnResult = null;

          if (approved) {
            if (
              processedActionType ===
              USER_REQUEST_ACTION.CHANGE
            ) {
              if (
                ![
                  STATUS.REQUESTED,
                  STATUS.ON_HOLD,
                ].includes(
                  previousStatus
                )
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              const nextStartDate =
                userActionRequest.startDate || '';

              const nextDueDate =
                userActionRequest.dueDate || '';

              const latestAvailability =
                getLaptopRentalAvailability(
                  latestAsset,
                  latestReservations,
                  data.settings,
                  nextStartDate,
                  nextDueDate
                );

              if (
                latestAvailability.blocked
              ) {
                throw new Error(
                  'user-action-period-conflict'
                );
              }

              nextRequestFields = {
                ...nextRequestFields,
                team:
                  userActionRequest.team || '',
                borrower:
                  userActionRequest.borrower || '',
                startDate:
                  nextStartDate,
                dueDate:
                  nextDueDate,
                purpose:
                  userActionRequest.purpose || '',
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                team:
                  userActionRequest.team || '',
                borrower:
                  userActionRequest.borrower || '',
                startDate:
                  nextStartDate,
                dueDate:
                  nextDueDate,
                purpose:
                  userActionRequest.purpose || '',
              };
            }

            if (
              processedActionType ===
              USER_REQUEST_ACTION.EXTEND
            ) {
              if (
                previousStatus !==
                STATUS.APPROVED
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              if (!latestSettings.rentalExtensionEnabled) {
                throw new Error(
                  'rental-extension-disabled'
                );
              }

              const currentExtensionCount =
                getRequestExtensionCount(latestRequest);

              const maxExtensionCount =
                getSafeRentalExtensionMaxCount(
                  latestSettings
                );

              if (
                currentExtensionCount >=
                maxExtensionCount
              ) {
                throw new Error(
                  'rental-extension-count-exceeded'
                );
              }

              const availableDate =
                getExtensionRequestAvailableDate(
                  latestRequest,
                  latestSettings
                );

              if (
                availableDate &&
                today() < availableDate
              ) {
                const earlyError = new Error(
                  'rental-extension-too-early'
                );
                earlyError.availableDate =
                  availableDate;
                throw earlyError;
              }

              const extensionPeriod =
                getRentalExtensionPeriod(
                  latestRequest,
                  latestSettings,
                  userActionRequest.extensionDays ??
                    userActionRequest.extensionBusinessDays
                );

              const blockingRequest =
                findExtensionPeriodConflict(
                  latestReservations,
                  latestRequest.laptopId,
                  latestRequest.id,
                  extensionPeriod.extensionStartDate,
                  extensionPeriod.extensionDueDate
                );

              if (blockingRequest) {
                throw new Error(
                  'rental-extension-period-conflict'
                );
              }

              const approvalDate = today();
              const approvedAt = new Date();
              const extensionNumber =
                currentExtensionCount + 1;
              const nextExtensionRequestDate =
                addDaysFrom(
                  approvalDate,
                  getSafeRentalExtensionRequestWaitDays(
                    latestSettings
                  )
                );

              nextUserActionRequest = {
                ...nextUserActionRequest,
                approvalMode:
                  userActionRequest.approvalMode ||
                  RENTAL_EXTENSION_APPROVAL_MODE.MANUAL,
                extensionNumber,
                previousDueDate:
                  latestRequest.dueDate || '',
                extensionStartDate:
                  extensionPeriod.extensionStartDate,
                dueDate:
                  extensionPeriod.extensionDueDate,
                extensionDays:
                  extensionPeriod.extensionDays,
                approvalDate,
                nextExtensionRequestDate,
              };

              const nextExtensionHistory = [
                ...(Array.isArray(latestRequest.extensionHistory)
                  ? latestRequest.extensionHistory
                  : []),
                {
                  extensionNumber,
                  approvalMode:
                    nextUserActionRequest.approvalMode,
                  previousDueDate:
                    latestRequest.dueDate || '',
                  extensionStartDate:
                    extensionPeriod.extensionStartDate,
                  newDueDate:
                    extensionPeriod.extensionDueDate,
                  extensionDays:
                    extensionPeriod.extensionDays,
                  requestedAt:
                    userActionRequest.requestedAt ||
                    approvedAt,
                  approvedAt,
                  approvedDate:
                    approvalDate,
                  approvedByUid:
                    auditActor.uid,
                  approvedByName:
                    auditActor.name,
                  status:
                    USER_REQUEST_REVIEW_STATUS.APPROVED,
                },
              ];

              nextRequestFields = {
                ...nextRequestFields,
                userActionRequest:
                  nextUserActionRequest,
                dueDate:
                  extensionPeriod.extensionDueDate,
                extensionCount:
                  extensionNumber,
                lastExtensionApprovedDate:
                  approvalDate,
                nextExtensionRequestDate,
                extensionHistory:
                  nextExtensionHistory,
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                userActionRequest:
                  nextUserActionRequest,
                dueDate:
                  extensionPeriod.extensionDueDate,
                extensionCount:
                  extensionNumber,
                lastExtensionApprovedDate:
                  approvalDate,
                nextExtensionRequestDate,
                extensionHistory:
                  nextExtensionHistory,
              };
            }

            if (
              processedActionType ===
              USER_REQUEST_ACTION.CANCEL
            ) {
              if (
                ![
                  STATUS.REQUESTED,
                  STATUS.ON_HOLD,
                ].includes(
                  previousStatus
                )
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              nextStatus =
                STATUS.USER_CANCELLED;

              nextRequestFields = {
                ...nextRequestFields,
                status:
                  nextStatus,
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                status:
                  nextStatus,
              };
            }

            if (
              processedActionType ===
              USER_REQUEST_ACTION.RETURN
            ) {
              if (
                previousStatus !==
                STATUS.APPROVED
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              nextStatus =
                STATUS.RETURNED;

              overdueReturnResult =
                getOverdueReturnResult({
                  latestRequest,
                  latestSettings,
                  restrictionData: latestRestriction,
                  actualReturnDate: today(),
                  batchId: overdueBatchId,
                  hasOtherCurrentOverdueRequests,
                });

              nextRequestFields = {
                ...nextRequestFields,
                status:
                  nextStatus,
                ...overdueReturnResult.requestFields,
                returnedAt:
                  serverTimestamp(),
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                status:
                  nextStatus,
                ...overdueReturnResult.requestFields,
                returnedAt:
                  new Date(),
              };
            }
          }

          const nextAvailabilityRequest =
            toRentalAvailabilityRequest(
              nextCommittedRequest
            );

          shouldKeepAvailability =
            approved
              ? RENTAL_BLOCKING_REQUEST_STATUSES.includes(
                  nextStatus
                )
              : RENTAL_BLOCKING_REQUEST_STATUSES.includes(
                  previousStatus
                );

          const updatedReservations =
            approved
              ? shouldKeepAvailability
                ? [
                    ...latestReservations,
                    nextAvailabilityRequest,
                  ]
                : latestReservations
              : normalizeAssetReservations(
                  latestAsset.reservations || []
                );

          const representativeRequest =
            getLaptopRepresentativeRequest(
              updatedReservations,
              latestAsset.id
            );

          const nextAsset = {
            ...latestAsset,
            reservations:
              updatedReservations,
            status:
              latestAsset.status ===
              STATUS.UNAVAILABLE
                ? STATUS.UNAVAILABLE
                : representativeRequest
                  ? representativeRequest.status
                  : STATUS.AVAILABLE,
            currentRequestId:
              representativeRequest?.id ||
              null,
          };

          transaction.update(
            requestDocRef,
            nextRequestFields
          );

          if (overdueReturnResult) {
            writeOverdueReturnSideEffects({
              transaction,
              requestId: id,
              requesterUid: latestRequest.requesterUid,
              returnResult: overdueReturnResult,
            });
          }

          if (approved) {
            if (shouldKeepAvailability) {
              transaction.set(
                availabilityDocRef,
                {
                  ...nextAvailabilityRequest,
                  updatedAt:
                    serverTimestamp(),
                }
              );
            } else {
              transaction.delete(
                availabilityDocRef
              );
            }

            transaction.update(
              assetDocRef,
              {
                reservations:
                  nextAsset.reservations,
                status:
                  nextAsset.status,
                currentRequestId:
                  nextAsset.currentRequestId,
                updatedAt:
                  serverTimestamp(),
              }
            );

            committedAsset =
              nextAsset;

            committedAvailabilityRequest =
              shouldKeepAvailability
                ? nextAvailabilityRequest
                : null;
          }

          transaction.set(
            requestLogDocRef,
            {
              id: requestLogDocRef.id,
              requestId: id,
              action:
                RENTAL_REQUEST_AUDIT_ACTION.USER_ACTION_REVIEWED,
              previousStatus,
              nextStatus,
              previousMemo:
                latestRequest.adminMemo || '',
              nextMemo:
                latestRequest.adminMemo || '',
              actorUid:
                auditActor.uid,
              actorAdminId:
                auditActor.adminId,
              actorName:
                auditActor.name,
              detail:
                processedActionType ===
                USER_REQUEST_ACTION.EXTEND
                  ? `${getUserRequestActionLabel(
                      processedActionType
                    )} ${
                      approved
                        ? '승인'
                        : '불허'
                    } · ${
                      userActionRequest.extensionStartDate ||
                      '-'
                    } ~ ${
                      userActionRequest.dueDate ||
                      '-'
                    }`
                  : `${getUserRequestActionLabel(
                      processedActionType
                    )} ${
                      approved
                        ? '승인'
                        : '불허'
                    } · 요청 사유: ${
                      userActionRequest.reason ||
                      '-'
                    }`,
              createdAt:
                serverTimestamp(),
            }
          );

          committedRequest =
            nextCommittedRequest;
        }
      );

      if (!committedRequest) {
        throw new Error(
          'user-action-review-result-missing'
        );
      }

      updateAdminRequestPanelRequests((prev) =>
        (prev || []).map((request) =>
          request.id === id
            ? {
                ...committedRequest,
                userActionRequest: {
                  ...committedRequest.userActionRequest,
                  reviewedAt:
                    new Date(),
                },
              }
            : request
        )
      );

      if (
        approved &&
        committedAsset
      ) {
        setData((prev) => ({
          ...prev,
          requests:
            shouldKeepAvailability
              ? [
                  committedAvailabilityRequest,
                  ...(prev.requests || []).filter(
                    (request) =>
                      request.id !== id
                  ),
                ]
              : (prev.requests || []).filter(
                  (request) =>
                    request.id !== id
                ),
          laptops:
            (prev.laptops || []).map(
              (asset) =>
                asset.id ===
                committedAsset.id
                  ? committedAsset
                  : asset
            ),
        }));
      }

      notifyAdminRequestMutation();

      triggerToast(
        `${getUserRequestActionLabel(
          processedActionType
        )}을 ${
          approved
            ? '승인'
            : '불허'
        }했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'User rental action review error:',
        error
      );

      const extensionErrorCodes = [
        'rental-extension-disabled',
        'rental-extension-count-exceeded',
        'rental-extension-too-early',
        'rental-extension-period-conflict',
      ];

      const errorMessage =
        error?.message ===
        'user-action-request-not-pending'
          ? '검토 대기 중인 사용자 요청이 없습니다.'
          : error?.message ===
              'invalid-user-action-request-status'
            ? '현재 신청 상태에서는 해당 사용자 요청을 승인할 수 없습니다.'
            : extensionErrorCodes.includes(
                error?.message
              )
              ? getRentalExtensionErrorMessage(
                  error.message,
                  error?.availableDate || ''
                )
              : error?.message ===
                  'user-action-period-conflict'
                ? '변경 요청 기간이 다른 예약과 겹쳐 승인할 수 없습니다.'
                : error?.message ===
                    'rental-request-not-found'
                  ? '정식 대여 신청 문서를 찾을 수 없습니다.'
                  : error?.message ===
                      'rental-asset-not-found'
                    ? '신청과 연결된 자산 문서를 찾을 수 없습니다.'
                    : `사용자 요청 처리에 실패했습니다. 오류 코드: ${
                        error?.code ||
                        error?.message ||
                        'unknown-error'
                      }`;

      triggerToast(
        errorMessage,
        'error'
      );
    } finally {
      setAdminUserActionSavingRequestId('');
    }
  };

  const openNoticePost = async (post) => {
    if (!post?.id) {
      return;
    }

    setSelectedNoticePostId(
      post.id
    );

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const postDocRef = doc(
            NOTICE_POSTS_COLLECTION_REF,
            post.id
          );

          const postSnapshot =
            await transaction.get(
              postDocRef
            );

          if (!postSnapshot.exists()) {
            return;
          }

          const currentViewCount =
            Number(
              postSnapshot.data().viewCount
            ) || 0;

          transaction.update(
            postDocRef,
            {
              viewCount:
                currentViewCount + 1,
            }
          );
        }
      );
    } catch (error) {
      console.error(
        'Notice post view count update error:',
        error
      );
    }
  };

  const closeNoticePost = () => {
    setSelectedNoticePostId('');
  };

  const {
    closePopupPostDialog,
    confirmDeletePopupPost,
    movePopupPost,
    openPopupPostDialog,
    savePopupPost,
    togglePopupPostEnabled,
  } = useAdminPopupPostController({
    getCurrentAdminAuditActor,
    isAdminAuthenticated,
    popupPostDialog,
    popupPostForm,
    popupPostSaving,
    popupPosts,
    setPopupPostDeletingId,
    setPopupPostDialog,
    setPopupPostForm,
    setPopupPostSaving,
    setPopupPostToggleSavingId,
    triggerConfirm,
    triggerToast,
  });

  const {
    closeFooterPageDialog,
    confirmDeleteFooterPage,
    moveFooterPage,
    openFooterPageDialog,
    saveFooterConfig,
    saveFooterPage,
    toggleFooterPageEnabled,
  } = useAdminFooterContentController({
    footerConfigDraft,
    footerPageDialog,
    footerPageForm,
    footerPageSaving,
    footerPages,
    getCurrentAdminAuditActor,
    isAdminAuthenticated,
    selectedFooterPageId,
    setFooterConfigSaving,
    setFooterPageDeletingId,
    setFooterPageDialog,
    setFooterPageForm,
    setFooterPageSaving,
    setFooterPageToggleSavingId,
    setSelectedFooterPageId,
    triggerConfirm,
    triggerToast,
  });

  const openFooterPage = (pageId) => {
    const normalizedPageId = String(pageId || '').trim();
    if (!normalizedPageId) return;

    pendingProtectedUserTabRef.current = '';

    if (
      userTab === 'login' ||
      userTab === 'signup'
    ) {
      clearUserLoginReturnTarget();
    }

    pushAppPath('user', 'footerPage', normalizedPageId);
    setView('user');
    setUserTab('footerPage');
    setSelectedFooterPageId(normalizedPageId);
    setIsCommunityMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleFaqPost = (postId) => {
    setExpandedFaqPostId(
      (currentPostId) =>
        currentPostId === postId
          ? ''
          : postId
    );
  };

  const toggleAdminFaqPost = (postId) => {
    setAdminExpandedFaqPostId(
      (currentPostId) =>
        currentPostId === postId
          ? ''
          : postId
    );
  };

  const commitAdminRequestEdit = async ({ requestId = '', form = {} } = {}) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 신청 정보를 수정할 수 없습니다.',
        'error'
      );
      return false;
    }

    const currentRequest =
      getAdminRequestById(requestId);

    if (!currentRequest) {
      triggerToast(
        '수정할 정식 대여 신청 문서를 찾을 수 없습니다.',
        'error'
      );
      return false;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 신청 정보 수정을 중단했습니다.',
        'error'
      );
      return false;
    }

    try {
      const {
        executeAdminRequestEditMutation,
      } = await loadAdminRequestMutationService();

      const {
        adminDueDateAdjusted,
        committedAsset,
        committedAvailabilityRequest,
        committedRequest,
        nextDueDate,
        shouldKeepAvailability,
      } = await executeAdminRequestEditMutation({
        auditActor,
        currentRequest,
        form,
        requestId,
        settings: data.settings,
      });

      updateAdminRequestPanelRequests((prev) =>
        (prev || []).map(
          (request) =>
            request.id === requestId
              ? committedRequest
              : request
        )
      );

      setData((prev) => ({
        ...prev,
        requests:
          shouldKeepAvailability
            ? [
                committedAvailabilityRequest,
                ...(prev.requests || []).filter(
                  (request) =>
                    request.id !== requestId
                ),
              ]
            : (prev.requests || []).filter(
                (request) =>
                  request.id !== requestId
              ),
        laptops:
          committedAsset
            ? (prev.laptops || []).map(
                (asset) =>
                  asset.id === committedAsset.id
                    ? committedAsset
                    : asset
              )
            : prev.laptops,
      }));

      notifyAdminRequestMutation();

      triggerToast(
        adminDueDateAdjusted
          ? `반납 예정일이 휴무일이어서 ${formatDateWithKoreanWeekday(nextDueDate)}로 자동 조정된 후 신청 정보가 수정되었습니다.`
          : '대여 신청 정보를 수정했습니다. 관리자 수정에는 기본 최대 대여 기간 제한을 적용하지 않았습니다.',
        'success'
      );

      return true;
    } catch (error) {
      console.error(
        'Admin rental request edit error:',
        error
      );

      if (
        error?.message ===
        'required-rental-edit-fields-missing'
      ) {
        triggerToast(
          '부서, 대여자명, 대여 시작일과 반납 예정일을 모두 입력해 주세요.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'invalid-rental-edit-period'
      ) {
        triggerToast(
          '반납 예정일은 대여 시작일보다 빠를 수 없습니다.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'admin-audit-actor-missing'
      ) {
        triggerToast(
          '관리자 인증 정보를 확인할 수 없어 신청 정보 수정을 중단했습니다.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'rental-period-conflict'
      ) {
        const blockingRequest =
          error.blockingRequest;

        triggerToast(
          blockingRequest
            ? `동일 기기의 다른 예약과 기간이 겹칩니다. 충돌 기간: ${blockingRequest.startDate || '-'} ~ ${blockingRequest.dueDate || '-'}`
            : '동일 기기의 다른 활성 예약과 충돌하여 신청 정보를 수정할 수 없습니다.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서를 찾을 수 없습니다.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'rental-asset-not-found'
      ) {
        triggerToast(
          '신청과 연결된 자산 문서를 찾을 수 없습니다.',
          'error'
        );
        return false;
      }

      triggerToast(
        `대여 신청 정보 수정에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    }

    return false;
  };

  const commitAdminRequestStatusRestore = async ({
    nextStatus = '',
    requestId = '',
    restoreReason = '',
  } = {}) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 상태를 복구할 수 없습니다.',
        'error'
      );
      return false;
    }

    const currentRequest =
      getAdminRequestById(requestId);

    if (!currentRequest) {
      triggerToast(
        '복구할 정식 대여 신청 문서를 찾을 수 없습니다.',
        'error'
      );
      return false;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 상태 복구를 중단했습니다.',
        'error'
      );
      return false;
    }

    try {
      const {
        executeAdminRequestStatusRestoreMutation,
      } = await loadAdminRequestMutationService();

      const {
        committedAsset,
        committedAvailabilityRequest,
        committedRequest,
        shouldKeepAvailability,
      } = await executeAdminRequestStatusRestoreMutation({
        auditActor,
        currentRequest,
        nextStatus,
        requestId,
        restoreReason,
        settings: data.settings,
      });

      updateAdminRequestPanelRequests((prev) =>
        (prev || []).map(
          (request) =>
            request.id === requestId
              ? committedRequest
              : request
        )
      );

      setData((prev) => ({
        ...prev,
        requests:
          shouldKeepAvailability
            ? [
                committedAvailabilityRequest,
                ...(prev.requests || []).filter(
                  (request) =>
                    request.id !== requestId
                ),
              ]
            : (prev.requests || []).filter(
                (request) =>
                  request.id !== requestId
              ),
        laptops:
          (prev.laptops || []).map(
            (asset) =>
              asset.id === committedAsset.id
                ? committedAsset
                : asset
          ),
      }));

      notifyAdminRequestMutation();

      triggerToast(
        `상태를 [${nextStatus}]로 복구했습니다.`,
        'success'
      );

      return true;
    } catch (error) {
      console.error(
        'Admin rental request restore error:',
        error
      );

      if (
        error?.message ===
        'restore-reason-missing'
      ) {
        triggerToast(
          '상태 복구 사유를 입력해 주세요.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'admin-audit-actor-missing'
      ) {
        triggerToast(
          '관리자 인증 정보를 확인할 수 없어 상태 복구를 중단했습니다.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'rental-period-conflict'
      ) {
        const blockingRequest =
          error.blockingRequest;

        triggerToast(
          blockingRequest
            ? `동일 기기의 다른 예약과 기간이 겹칩니다. 충돌 기간: ${blockingRequest.startDate || '-'} ~ ${blockingRequest.dueDate || '-'}`
            : '동일 기기의 다른 활성 예약과 충돌하여 상태를 복구할 수 없습니다.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'invalid-rental-period'
      ) {
        triggerToast(
          '대여 시작일과 반납 예정일을 먼저 올바르게 수정해 주세요.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'invalid-rental-status-transition'
      ) {
        triggerToast(
          `허용되지 않은 상태 복구입니다. 현재 상태: ${error.previousStatus || '-'}, 복구 대상: ${error.nextStatus || '-'}`,
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서를 찾을 수 없습니다.',
          'error'
        );
        return false;
      }

      if (
        error?.message ===
        'rental-asset-not-found'
      ) {
        triggerToast(
          '신청과 연결된 자산 문서를 찾을 수 없습니다.',
          'error'
        );
        return false;
      }

      triggerToast(
        `상태 복구에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    }

    return false;
  };
  
  const updateRequest = async (id, status) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 신청 상태를 변경할 수 없습니다.',
        'error'
      );
      return;
    }

    const currentRequest = getAdminRequestById(id);

    if (!currentRequest) {
      triggerToast(
        '신청 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const auditActor = getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 상태 변경을 중단했습니다.',
        'error'
      );
      return;
    }

    const actualReturnDate =
      status === STATUS.RETURNED ? today() : '';
    const overdueBatchId =
      status === STATUS.RETURNED
        ? `OVERDUE-${doc(RENTAL_RESTRICTIONS_COLLECTION_REF).id}`
        : '';
    const nextDisplayStatus = getDisplayRentalStatus(
      status,
      currentRequest.startDate,
      currentRequest.dueDate
    );

    try {
      const hasOtherCurrentOverdueRequests =
        status === STATUS.RETURNED
          ? await hasOtherCurrentOverdueRequest({
              requesterUid: currentRequest.requesterUid,
              excludedRequestId: currentRequest.id,
              referenceDate: actualReturnDate,
            })
          : false;
      const {
        executeAdminRequestStatusChangeMutation,
      } = await loadAdminRequestMutationService();
      const {
        committedAsset,
        committedAvailabilityRequest,
        committedRequest,
        shouldKeepAvailability,
      } = await executeAdminRequestStatusChangeMutation({
        actualReturnDate,
        auditActor,
        currentRequest,
        hasOtherCurrentOverdueRequests,
        nextStatus: status,
        overdueBatchId,
        requestId: id,
        settings: data.settings,
      });

      updateAdminRequestPanelRequests((prev) => {
        const requestExists = (prev || []).some(
          (request) => request.id === id
        );

        if (!requestExists) {
          return [committedRequest, ...(prev || [])];
        }

        return (prev || []).map((request) =>
          request.id === id ? committedRequest : request
        );
      });

      setData((prev) => ({
        ...prev,
        requests: shouldKeepAvailability
          ? [
              committedAvailabilityRequest,
              ...(prev.requests || []).filter(
                (request) => request.id !== id
              ),
            ]
          : (prev.requests || []).filter(
              (request) => request.id !== id
            ),
        laptops: (prev.laptops || []).map((asset) =>
          asset.id === committedAsset.id
            ? committedAsset
            : asset
        ),
      }));

      clearAdminRequestPanelSelection();
      resetAdminRequestPanelPage();
      notifyAdminRequestMutation();

      triggerToast(
        `상태가 [${nextDisplayStatus}]로 업데이트 되었습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'Rental request status update error:',
        error
      );

      if (error?.message === 'rental-request-not-found') {
        triggerToast(
          '정식 대여 신청 문서를 찾을 수 없어 상태 변경을 중단했습니다.',
          'error'
        );
        return;
      }

      if (error?.message === 'rental-asset-not-found') {
        triggerToast(
          '신청과 연결된 자산 문서를 찾을 수 없어 상태 변경을 중단했습니다.',
          'error'
        );
        return;
      }

      if (
        error?.message === 'invalid-rental-status-transition'
      ) {
        triggerToast(
          `허용되지 않은 상태 변경입니다. 현재 상태: ${
            error.previousStatus || '-'
          }, 변경 요청: ${error.nextStatus || '-'}`,
          'error'
        );
        return;
      }

      if (error?.message === 'rental-period-conflict') {
        const blockingRequest = error.blockingRequest;

        triggerToast(
          blockingRequest
            ? `동일 기기의 다른 예약과 기간이 겹칩니다. 충돌 기간: ${blockingRequest.startDate || '-'} ~ ${blockingRequest.dueDate || '-'}`
            : '동일 기기의 다른 활성 예약과 충돌하여 상태를 변경할 수 없습니다.',
          'error'
        );
        return;
      }

      const firebaseErrorCode =
        error?.code || error?.message || 'unknown-error';

      triggerToast(
        `신청 상태와 기기 상태 저장에 실패했습니다. 오류 코드: ${firebaseErrorCode}`,
        'error'
      );
    }
  };

  const updateRequestMemo = (id, memo) => {
    const currentRequest = getAdminRequestById(id);

    if (!currentRequest) return;

    const nextRequest = {
      ...currentRequest,
      adminMemo: memo,
    };

    updateAdminRequestPanelRequests((prev) => {
      const requestExists = (prev || []).some(
        (request) => request.id === id
      );

      if (!requestExists) {
        return [nextRequest, ...(prev || [])];
      }

      return (prev || []).map((request) =>
        request.id === id ? nextRequest : request
      );
    });
  };

  const saveRequestMemo = async (id, memo) => {
    const currentRequest = getAdminRequestById(id);

    if (!currentRequest) {
      triggerToast(
        '신청 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 메모 저장을 중단했습니다.',
        'error'
      );
      return;
    }

    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      id
    );

    const requestLogDocRef = doc(
      RENTAL_REQUEST_LOGS_COLLECTION_REF
    );

    let memoWasChanged = false;

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const requestSnapshot =
            await transaction.get(
              requestDocRef
            );

          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }

          const latestRequest =
            requestSnapshot.data();

          const previousMemo = String(
            latestRequest.adminMemo || ''
          );

          const nextMemo = String(
            memo || ''
          );

          if (
            previousMemo === nextMemo
          ) {
            return;
          }

          transaction.update(
            requestDocRef,
            {
              adminMemo: nextMemo,
              updatedAt:
                serverTimestamp(),
              syncedAt:
                serverTimestamp(),
            }
          );

          transaction.set(
            requestLogDocRef,
            {
              id: requestLogDocRef.id,
              requestId: id,
              action:
                RENTAL_REQUEST_AUDIT_ACTION.MEMO_CHANGED,
              previousStatus:
                latestRequest.status || '',
              nextStatus:
                latestRequest.status || '',
              previousMemo,
              nextMemo,
              actorUid:
                auditActor.uid,
              actorAdminId:
                auditActor.adminId,
              actorName:
                auditActor.name,
              createdAt:
                serverTimestamp(),
            }
          );

          memoWasChanged = true;
        }
      );

      if (!memoWasChanged) {
        return;
      }

      updateAdminRequestPanelRequests((prev) =>
        (prev || []).map((request) =>
          request.id === id
            ? {
                ...request,
                adminMemo: memo,
              }
            : request
        )
      );
    } catch (error) {
      console.error(
        'Rental request memo save error:',
        error
      );

      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서가 없어 관리자 메모를 저장하지 않았습니다.',
          'error'
        );
        return;
      }

      triggerToast(
        `관리자 메모 저장에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    }
  };

  const renderRequestActionButtons = (request) => {
    const displayStatus = getDisplayRentalStatus(
      request.status,
      request.startDate,
      request.dueDate
    );
    const actionButtonClassName = 'px-2.5 py-1.5 text-xs rounded-lg';

    if (request.status === STATUS.REQUESTED) {
      return (
        <div className="flex flex-wrap gap-1">
          <Button
            onClick={() => updateRequest(request.id, STATUS.APPROVED)}
            variant="primary"
            className={actionButtonClassName}
          >
            승인
          </Button>
          <Button
            onClick={() => updateRequest(request.id, STATUS.ON_HOLD)}
            variant="secondary"
            className={`${actionButtonClassName} text-purple-700 bg-purple-50 hover:bg-purple-100`}
          >
            보류
          </Button>
          <Button
            onClick={() => updateRequest(request.id, STATUS.DENIED)}
            variant="dangerOutline"
            className={actionButtonClassName}
          >
            불허
          </Button>
        </div>
      );
    }

    if (request.status === STATUS.APPROVED) {
      return (
        <div className="flex flex-wrap gap-1">
          <Button
            onClick={() => updateRequest(request.id, STATUS.RETURNED)}
            variant="outline"
            className={`${actionButtonClassName} text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200`}
          >
            반납확정
          </Button>
        </div>
      );
    }

    if (request.status === STATUS.ON_HOLD) {
      return (
        <div className="flex flex-wrap gap-1">
          <Button
            onClick={() => updateRequest(request.id, STATUS.APPROVED)}
            variant="primary"
            className={actionButtonClassName}
          >
            승인
          </Button>
          <Button
            onClick={() => updateRequest(request.id, STATUS.DENIED)}
            variant="dangerOutline"
            className={actionButtonClassName}
          >
            불허
          </Button>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
        {displayStatus} 상태는 추가 처리 버튼이 없습니다.
      </div>
    );
  };


  const {
    createLaptop,
    deleteLaptop,
    handleAddLaptopClick,
    saveLaptop,
  } = useAdminAssetCrudController({
    authenticatedAdminId,
    currentAuthAdminAccount,
    data,
    editLaptop,
    isSplitStorageReady,
    newLaptop,
    selectedLaptopId,
    setData,
    setEditLaptop,
    setNewLaptop,
    setSelectedLaptopId,
    setShowUploadPanel,
    splitRentalAssets,
    triggerConfirm,
    triggerToast,
  });



  const selectedFooterPage = useMemo(
    () =>
      selectedFooterPageId
        ? footerPages.find((page) => page.id === selectedFooterPageId) || null
        : null,
    [footerPages, selectedFooterPageId]
  );

  const dismissUserPopup = (popup, dismissMode = 'temporary') => {
    const versionKey = getPopupVersionKey(popup);
    if (!versionKey) return;

    if (dismissMode === 'session') {
      setDismissedPopupSessionVersions((currentVersions) =>
        currentVersions.includes(versionKey)
          ? currentVersions
          : [...currentVersions, versionKey]
      );
      return;
    }

    if (dismissMode === 'sevenDays') {
      setDismissedPopupLocalVersions((currentVersions) => ({
        ...currentVersions,
        [versionKey]: Date.now() + POPUP_DISMISS_SEVEN_DAYS_MS,
      }));
      return;
    }

    setTemporarilyDismissedPopupVersions((currentVersions) =>
      currentVersions.includes(versionKey)
        ? currentVersions
        : [...currentVersions, versionKey]
    );
  };

  const dismissAllUserPopups = (popups, dismissMode = 'temporary') => {
    const versionKeys = [
      ...new Set(
        (Array.isArray(popups) ? popups : [])
          .map((popup) => getPopupVersionKey(popup))
          .filter(Boolean)
      ),
    ];

    if (!versionKeys.length) return;

    if (dismissMode === 'session') {
      setDismissedPopupSessionVersions((currentVersions) => [
        ...new Set([...currentVersions, ...versionKeys]),
      ]);
      return;
    }

    if (dismissMode === 'sevenDays') {
      const expiresAt = Date.now() + POPUP_DISMISS_SEVEN_DAYS_MS;
      setDismissedPopupLocalVersions((currentVersions) => ({
        ...currentVersions,
        ...Object.fromEntries(
          versionKeys.map((versionKey) => [versionKey, expiresAt])
        ),
      }));
      return;
    }

    setTemporarilyDismissedPopupVersions((currentVersions) => [
      ...new Set([...currentVersions, ...versionKeys]),
    ]);
  };

  const uiContext = {
    ADMIN_ACCOUNT_PAGE_SIZE,
    ADMIN_CUSTOM_OPTION_VALUE,
    ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
    ADMIN_REQUEST_QUICK_FILTER,
    ADMIN_REQUEST_TAB,
    AlertCircle,
    AnimatePresence,
    AdminPageHeader,
    Badge,
    Button,
    Card,
    CardContent,
    CheckCircle2,
    ClipboardList,
    Clock,
    DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
    DEFAULT_EXCLUDE_SATURDAYS,
    DEFAULT_EXCLUDE_SUNDAYS,
    DEFAULT_HOLIDAY_TYPE,
    DEFAULT_WORK_END_TIME,
    DateInputWithWeekday,
    Edit3,
    FAQ_POSTS_PER_PAGE_OPTIONS,
    HOLIDAY_TYPE_LABEL,
    Info,
    Input,
    Laptop,
    LayoutDashboard,
    LockIcon,
    LogOut,
    NOTICE_POSTS_PER_PAGE_OPTIONS,
    OVERDUE_PENALTY_MODE,
    Pin,
    Plus,
    RENTAL_EXTENSION_APPROVAL_MODE,
    RENTAL_REQUEST_AUDIT_ACTION,
    React,
    STATUS,
    Save,
    Search,
    Select,
    Settings,
    ShieldCheck,
    Trash2,
    USER_PROFILE_STATUS,
    USER_REQUEST_ACTION,
    USER_REQUEST_REVIEW_STATUS,
    UserCircle,
    Users,
    X,
    XCircle,
    activeFaqCategoryId,
    activeFaqCategoryName,
    activeUserActionRentalRequest,
    accountRecoveryForm,
    accountRecoveryLoading,
    accountRecoveryResult,
    resetAccountRecoverySearch,
    addDaysFrom,
    addFaqCategory,
    addTempAssetCategory,
    addTempHoliday,
    adminAccountEditForm,
    adminAccountForm,
    adminAccountTotalPages,
    adminAccountUserOptions,
    adminAccountsLoadErrorMessage,
    adminAuthForm,
    adminAuthLoading,
    adminAvailabilityFilter,
    adminExpandedFaqPostId,
    adminFaqTotalPages,
    adminFilteredLaptops,
    adminLaptopQuery,
    adminMyProfileForm,
    adminMyProfileSaving,
    adminNoticeQuery,
    adminNoticeTotalPages,
    adminPinnedFaqPosts,
    adminPinnedNoticePosts,
    adminRegularFaqPosts,
    adminRegularNoticePosts,
    adminSelectedAssetCategory,
    adminTab,
    adminUserActionSavingRequestId,
    applyEditTempAssetCategory,
    authenticateAdmin,
    authenticatedAdminAccount,
    authenticatedAdminId,
    availabilityFilter,
    availableFilterLabel,
    cancelEditAdminAccount,
    cancelTempAssetCategoryChanges,
    cancelWithdrawal,
    cancelUserSignup,
    categoryFilteredFaqPosts,
    closeFaqPostDialog,
    closeNoticePost,
    closeNoticePostDialog,
    closeUserActionDialog,
    confirmDeleteFaqCategory,
    confirmDeleteFaqPost,
    confirmDeleteNoticePost,
    confirmModal,
    createDefaultAdminAccountForm,
    createLaptop,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    currentUserRentalRestrictionStatus,
    currentUserRestrictionReady,
    currentUserRequests,
    rentalRequestsLoadErrorMessage,
    rentalRequestsReady,
    dashboardSummary,
    dashboardSummaryLoadErrorMessage,
    dashboardSummaryReady,
    dashboardSummaryRefreshing,
    data,
    setData,
    siteSettings,
    siteSettingsReady,
    siteSettingsLoadErrorMessage,
    systemAdminSettings,
    systemAdminSettingsReady,
    systemAdminSettingsLoadErrorMessage,
    userSessionPolicy,
    userSessionPolicyReady,
    userSessionPolicyLoadErrorMessage,
    deleteAdminAccount,
    toggleAdminAccountLock,
    deleteLaptop,
    deleteTempAssetCategory,
    deleteTempHoliday,
    displayedFaqPosts,
    draggingAssetCategoryIndex,
    editLaptop,
    editLaptopInsertIndex,
    editingAdminAccountId,
    editingAssetCategoryIndex,
    editingAssetCategoryName,
    editingFaqCategoryId,
    editingFaqCategoryName,
    expandedFaqPostId,
    faqBoardConfigLoadErrorMessage,
    faqBoardConfigReady,
    faqBoardConfigSaving,
    faqCategories,
    faqCategoriesLoadErrorMessage,
    faqCategoriesReady,
    faqCategoryDeletingId,
    faqCategoryNameById,
    faqCategorySavingId,
    faqPostDeletingId,
    faqPostDialog,
    faqPostForm,
    faqPostSaving,
    faqPosts,
    faqPostsLoadErrorMessage,
    faqPostsPerPageInput,
    faqPostsReady,
    faqQuery,
    faqSearchWithinCategory,
    faqTotalPages,
    filteredLaptops,
    finalizeSplitStorageMigration,
    firebaseAuthReady,
    firebaseAuthUser,
    form,
    formatDateWithKoreanWeekday,
    formatFirestoreDate,
    formatFirestoreTimestamp,
    defaultRentalStartDate,
    getAdjustedRentalDueDate,
    getDisplayRentalStatus,
    getRequestDisplayStatus,
    getKoreaNow,
    getLaptopAdminDisplayStatus,
    getLaptopRentalAvailability,
    getMaxRentalDueDate,
    getRentalDueDateAdjustmentReason,
    getExtensionRequestAvailableDate,
    getRequestExtensionCount,
    getRentalExtensionApprovalMode,
    getRentalExtensionPeriod,
    getSafeRentalExtensionDays,
    getSafeRentalExtensionMaxCount,
    getSafeMaxRentalDays,
    getUserLaptopStatusLabel,
    getUserRequestActionLabel,
    getUserRequestReviewStatusLabel,
    goToUserEmailRecovery,
    goToUserHome,
    goToProtectedUserTab,
    goToUserFaq,
    goToUserLogin,
    goToUserMypage,
    goToUserNotice,
    goToUserPasswordReset,
    goToUserSignup,
    handleAddLaptopClick,
    hasEstablishedUserSession,
    hasFirebaseAuthSession,
    handleAdminTabChange,
    openAdminMemberAccounts,
    openAdminRequests,
    holidayImportConflictModal,
    holidayImportLoading,
    holidayImportYear,
    holidayManagementMonth,
    holidayManagementView,
    holidayManagementYear,
    holidaySettingsDirty,
    importKoreanPublicHolidaysFromJson,
    applyHolidayImportConflictChoice,
    isAdminAuthenticated,
    isCurrentFirebaseAuthGeneralUser,
    isPeriodBasedRentalMode,
    isSplitStorageReady,
    isUserDirectoryAccessRestricted,
    logoutAdmin,
    logoutUser,
    memberDirectoryAudit,
    adminMemberAccountsNavigationRequest,
    adminRequestsMutationVersion,
    adminRequestsNavigationRequest,
    commitAdminRequestEdit,
    commitAdminRequestStatusRestore,
    adminRequestsPrerequisitesReady:
      firebaseAuthReady &&
      currentAuthRoleReady &&
      !currentAuthRoleErrorMessage &&
      Boolean(firebaseAuthUser?.uid),
    onAdminRequestsControllerStateChange:
      handleAdminRequestsControllerStateChange,
    memberAccountsPrerequisitesReady:
      firebaseAuthReady && currentAuthRoleReady,
    memberDirectoryPolicyEnabled,
    memberIdentityClaimsReady,
    memberDirectoryBorrowers: data.borrowers,
    memberDirectorySettings: data.settings,
    memberDirectoryTeams: data.teams,
    onMemberDirectoryDeferredStateChange:
      handleMemberDirectoryDeferredStateChange,
    onSignupPolicyDeferredStateChange:
      handleSignupPolicyDeferredStateChange,
    signupPolicySettings: data.settings,
    motion,
    moveTempAssetCategory,
    newAssetCategory,
    newFaqCategoryName,
    newHolidayDate,
    newHolidayName,
    newHolidayType,
    newLaptop,
    noticeBoardConfigLoadErrorMessage,
    noticeBoardConfigReady,
    noticeBoardConfigSaving,
    noticePostDeletingId,
    noticePostDialog,
    noticePostForm,
    noticePostSaving,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsPerPage,
    noticePostsPerPageInput,
    noticePostsReady,
    noticeRegularPostNumberById,
    noticeTotalPages,
    openFaqPostDialog,
    openNoticePost,
    openNoticePostDialog,
    openWithdrawalDialog,
    openUserActionDialog,
    orphanedRentalAvailabilityRequests,
    paginatedAdminAccounts,
    paginatedAdminFaqPosts,
    paginatedAdminNoticePosts,
    paginatedNoticePosts,
    passwordResetForm,
    passwordResetLoading,
    passwordResetVerificationResult,
    pinnedNoticePosts,
    pushAppPath,
    query,
    refreshDashboardSummary,
    registerAdminAccount,
    registeredAdminAccounts,
    regularFaqPosts,
    regularNoticePosts,
    renderRequestActionButtons,
    rentalDeviceSectionDescription,
    rentalDeviceSectionTitle,
    rentalPeriodFields,
    rentalStartAdjustmentInfo,
    requestSubmitLoading,
    reviewUserActionRequest,
    safeAdminAccountPage,
    safeAdminFaqPage,
    safeAdminNoticePage,
    safeFaqPage,
    safeNoticePage,
    saveAdminAccountEdit,
    saveFaqBoardConfig,
    saveFaqCategoryName,
    saveFaqPost,
    saveLaptop,
    saveMyAdminProfile,
    saveMyUserProfile,
    saveNoticeBoardConfig,
    saveNoticePost,
    saveRequestMemo,
    saveHolidaySettings,
    saveSystemSettings,
    saveTempAssetCategoryChanges,
    selectedAssetCategory,
    selectedLaptop,
    selectedLaptopAvailability,
    selectedLaptopId,
    selectedNoticePost,
    sendAdminAccountPasswordResetEmail,
    setAccountRecoveryForm,
    setActiveFaqCategoryId,
    setAdminAccountEditForm,
    setAdminAccountForm,
    setAdminAccountPage,
    setAdminAuthForm,
    setAdminAvailabilityFilter,
    setAdminExpandedFaqPostId,
    setAdminFaqPage,
    setAdminLaptopQuery,
    setAdminMyProfileForm,
    setAdminNoticePage,
    setAdminNoticeQuery,
    setAdminSelectedAssetCategory,
    setAdminTab,
    setAvailabilityFilter,
    setConfirmModal,
    setDraggingAssetCategoryIndex,
    setEditLaptop,
    setEditingAssetCategoryIndex,
    setEditingAssetCategoryName,
    setEditingFaqCategoryId,
    setEditingFaqCategoryName,
    setExpandedFaqPostId,
    setFaqPage,
    setFaqPostForm,
    setFaqPostsPerPageInput,
    setFaqQuery,
    setFaqSearchWithinCategory,
    setForm,
    setHolidayImportConflictModal,
    setHolidayImportYear,
    setHolidayManagementMonth,
    setHolidayManagementView,
    setHolidayManagementYear,
    setNewAssetCategory,
    setNewFaqCategoryName,
    setNewHolidayDate,
    setNewHolidayName,
    setNewHolidayType,
    setNewLaptop,
    setNoticePage,
    setNoticePostForm,
    setUserNoticeQuery,
    setNoticePostsPerPageInput,
    updatePasswordResetForm,
    setQuery,
    setSelectedAssetCategory,
    setSelectedLaptopId,
    setShowUploadPanel,
    setTempSettings,
    setToast,
    setUserActionForm,
    setUserAuthForm,
    setUserProfileForm,
    setView,
    setWithdrawalPassword,
    shouldShowAdminAccountsErrorPage,
    shouldShowAdminLoadingPage,
    shouldShowAdminLoginPage,
    showUploadPanel,
    splitRentalAssets,
    splitStorageFinalizeLoading,
    startEditAdminAccount,
    startEditFaqCategory,
    startEditTempAssetCategory,
    submitAccountRecovery,
    submitMembershipWithdrawal,
    submitPasswordReset,
    submitRequest,
    submitUserActionRequest,
    submitUserAuthForm,
    tempAllowNonOverlappingSameAssetRequests,
    tempAssetCategories,
    tempBusinessDayAdjustmentEnabled,
    tempHolidayList,
    discardHolidayChanges,
    tempSettings,
    toast,
    stats,
    today,
    toggleAdminFaqPost,
    toggleFaqPost,
    triggerConfirm,
    triggerToast,
    unavailableFilterLabel,
    updateRequestMemo,
    updateTempHolidayReason,
    userAccountStatusView,
    userActionBorrowers,
    userActionDialog,
    userActionForm,
    userActionSaving,
    userAuthForm,
    userAuthLoading,
    userDirectoryVerificationLoading,
    userProfile,
    userProfileForm,
    userProfileReady,
    userProfileSaving,
    withdrawalBlockMessage,
    withdrawalDialogOpen,
    withdrawalLoading,
    withdrawalPassword,
    userNoticeQuery,
    temporarilyDismissedPopupVersions,
    dismissedPopupSessionVersions,
    dismissedPopupLocalVersions,
    dismissUserPopup,
    dismissAllUserPopups,
    popupPosts,
    popupPostsReady,
    popupPostsLoadErrorMessage,
    popupPostDialog,
    popupPostForm,
    popupPostSaving,
    popupPostDeletingId,
    popupPostToggleSavingId,
    openPopupPostDialog,
    closePopupPostDialog,
    savePopupPost,
    togglePopupPostEnabled,
    movePopupPost,
    confirmDeletePopupPost,
    setPopupPostForm,
    getPopupDisplayStatus,
    formatPopupDateTime,
    footerConfig,
    footerConfigDraft,
    footerConfigReady,
    footerConfigLoadErrorMessage,
    footerConfigSaving,
    footerPages,
    footerPagesReady,
    footerPagesLoadErrorMessage,
    footerPageDialog,
    footerPageForm,
    footerPageSaving,
    footerPageDeletingId,
    footerPageToggleSavingId,
    selectedFooterPageId,
    selectedFooterPage,
    setFooterConfigDraft,
    setFooterPageForm,
    saveFooterConfig,
    openFooterPageDialog,
    closeFooterPageDialog,
    saveFooterPage,
    toggleFooterPageEnabled,
    moveFooterPage,
    confirmDeleteFooterPage,
    openFooterPage,
    userTab,
  };

  const contextGroups = useStableContextGroups(
    uiContext,
    APP_CONTEXT_GROUP_KEYS
  );
  const userPanelContextKey = getUserPanelContextKey({
    userTab,
    hasFirebaseAuthSession,
    isUserDirectoryAccessRestricted,
  });
  const adminPanelContextKey = getAdminPanelContextKey(adminTab);
  const hasVisibleAppDialog = Boolean(
    userActionDialog ||
      popupPostDialog ||
      faqPostDialog ||
      noticePostDialog ||
      confirmModal ||
      toast
  );
  const shouldMountUserPopupLayer =
    view === 'user' &&
    Array.isArray(popupPosts) &&
    popupPosts.length > 0 &&
    (userTab === 'home' ||
      (userTab === 'rental' && Boolean(firebaseAuthUser)));

  useEffect(() => {
    if (hasVisibleAppDialog && !appDialogsActivated) {
      setAppDialogsActivated(true);
    }
  }, [appDialogsActivated, hasVisibleAppDialog]);

  useEffect(() => {
    if (appDialogsActivated || typeof window === 'undefined') {
      return undefined;
    }

    const preloadAppDialogs = () => {
      void loadAppDialogsModule().catch((error) => {
        console.error('App dialogs preload error:', error);
      });
      window.removeEventListener('pointerdown', preloadAppDialogs);
      window.removeEventListener('keydown', preloadAppDialogs);
    };

    window.addEventListener('pointerdown', preloadAppDialogs, {
      once: true,
      passive: true,
    });
    window.addEventListener('keydown', preloadAppDialogs, {
      once: true,
    });

    return () => {
      window.removeEventListener('pointerdown', preloadAppDialogs);
      window.removeEventListener('keydown', preloadAppDialogs);
    };
  }, [appDialogsActivated]);

  const shouldRenderAppDialogs =
    hasVisibleAppDialog || appDialogsActivated;

  const showFirebaseLoadingOverlay = !firebaseReady;
  const normalizedSiteSettings = normalizeSiteSettings(siteSettings);
  const headerSubtitle = getHeaderSubtitle(normalizedSiteSettings);
  const systemBannerKey = `${normalizedSiteSettings.systemBannerLevel}:${normalizedSiteSettings.systemBannerMessage}`;
  const shouldShowSystemBanner =
    normalizedSiteSettings.systemBannerEnabled &&
    normalizedSiteSettings.systemBannerMessage &&
    systemBannerDismissedKey !== systemBannerKey;

  if (firebaseLoadErrorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 font-sans text-slate-900">
        <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <AlertCircle size={22} />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">
                Firebase 데이터를 불러오지 못했습니다.
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                원격 DB 보호를 위해 화면 데이터 저장을 차단했습니다.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs leading-relaxed text-rose-700">
            {firebaseLoadErrorMessage}
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              다시 불러오기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (
    view === 'user' &&
    normalizedSiteSettings.serviceMode === SERVICE_MODE.MAINTENANCE
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 font-sans text-white">
        <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/10 p-7 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl mk-brand-gradient-tr text-white">
            <Settings size={28} />
          </div>
          <h1 className="mt-5 text-2xl font-black">
            {normalizedSiteSettings.maintenanceTitle}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-300">
            {normalizedSiteSettings.maintenanceMessage}
          </p>
          {normalizedSiteSettings.maintenanceEndAt ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-200">
              예상 종료: {normalizedSiteSettings.maintenanceEndAt.replace('T', ' ')}
            </div>
          ) : null}
          {normalizedSiteSettings.supportEnabled ? (
            <div className="mt-5 text-xs leading-6 text-slate-300">
              {normalizedSiteSettings.supportMessage ? <div>{normalizedSiteSettings.supportMessage}</div> : null}
              {normalizedSiteSettings.supportDepartment ? <div>담당 부서: {normalizedSiteSettings.supportDepartment}</div> : null}
              {normalizedSiteSettings.supportEmail ? <div>이메일: {normalizedSiteSettings.supportEmail}</div> : null}
              {normalizedSiteSettings.supportPhone ? <div>전화번호: {normalizedSiteSettings.supportPhone}</div> : null}
            </div>
          ) : null}
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>다시 확인</Button>
            <Button onClick={() => { replaceAppPath('admin', 'home'); setView('admin'); }}>관리자 모드</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`flex min-h-screen flex-col bg-slate-50 text-slate-900 font-sans antialiased transition duration-200 ${
        showFirebaseLoadingOverlay ? 'pointer-events-none select-none blur-sm' : ''
      }`}>
      {shouldShowSystemBanner ? (
        <div className={`relative z-40 border-b px-4 py-2 text-center text-xs font-bold ${
          normalizedSiteSettings.systemBannerLevel === 'critical'
            ? 'border-rose-300 bg-rose-600 text-white'
            : normalizedSiteSettings.systemBannerLevel === 'warning'
              ? 'border-amber-300 bg-amber-100 text-amber-900'
              : 'border-sky-300 bg-sky-100 text-sky-900'
        }`}>
          {normalizedSiteSettings.systemBannerUrl ? (
            <a href={normalizedSiteSettings.systemBannerUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {normalizedSiteSettings.systemBannerMessage}
            </a>
          ) : normalizedSiteSettings.systemBannerMessage}
          {normalizedSiteSettings.systemBannerDismissible ? (
            <button type="button" onClick={() => setSystemBannerDismissedKey(systemBannerKey)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-black/10" aria-label="시스템 안내 닫기"><X size={14} /></button>
          ) : null}
        </div>
      ) : null}
            {/* --- 상단 글로벌 네비게이션 --- */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            onClick={goToAppHome}
            className="flex min-w-0 shrink-0 items-center gap-3.5 text-left sm:gap-4"
          >
            {normalizedSiteSettings.logoMode === 'image' && normalizedSiteSettings.logoImageUrl ? (
              <picture className="shrink-0">
                {normalizedSiteSettings.mobileLogoImageUrl ? (
                  <source media="(max-width: 639px)" srcSet={normalizedSiteSettings.mobileLogoImageUrl} />
                ) : null}
                <img
                  src={normalizedSiteSettings.logoImageUrl}
                  alt={normalizedSiteSettings.logoAltText}
                  className="h-11 max-w-[150px] object-contain sm:h-12"
                />
              </picture>
            ) : normalizedSiteSettings.logoMode === 'text' ? null : (
              <div className="shrink-0 rounded-2xl mk-brand-gradient-tr p-2.5 text-white mk-brand-shadow-md sm:p-3">
                <Laptop size={26} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="break-keep text-[16px] font-bold leading-snug tracking-tight text-slate-900 sm:text-lg lg:text-[21px]">
                {normalizedSiteSettings.siteName}
              </h1>
              {headerSubtitle ? (
                <p className="mt-0.5 truncate text-xs font-medium text-slate-500 sm:text-sm">
                  {headerSubtitle}
                </p>
              ) : null}
            </div>
          </button>

          {view === 'user' && (
            <nav
              ref={communityMenuRef}
              className="relative flex w-full flex-wrap items-center justify-end gap-5 sm:gap-8 lg:w-auto lg:gap-12 xl:gap-14"
            >
              <button
                type="button"
                onClick={() =>
                  goToProtectedUserTab('rental')
                }
                className={`rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                  userTab === 'rental'
                    ? 'bg-orange-50 font-semibold mk-brand-text'
                    : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                대여신청
              </button>

              <button
                type="button"
                onClick={() =>
                  goToProtectedUserTab('history')
                }
                className={`rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                  userTab === 'history'
                    ? 'bg-orange-50 font-semibold mk-brand-text'
                    : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                신청내역
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsCommunityMenuOpen((prev) => !prev)}
                  className={`rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                    ['notice', 'faq'].includes(userTab) || isCommunityMenuOpen
                      ? 'bg-orange-50 font-semibold mk-brand-text'
                      : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  커뮤니티
                </button>

                <AnimatePresence>
                  {isCommunityMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      className="absolute left-0 top-full z-40 mt-2 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={goToUserNotice}
                        className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                          userTab === 'notice'
                            ? 'bg-orange-50 mk-brand-text'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        공지사항
                      </button>

                      <button
                        type="button"
                        onClick={goToUserFaq}
                        className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                          userTab === 'faq'
                            ? 'bg-orange-50 mk-brand-text'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        FAQ
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-2">
                {firebaseAuthUser || isAdminAuthenticated ? (
                  <>
                    {!currentAuthRoleErrorMessage && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={goToUserMypage}
                        className="px-3 py-2 text-xs"
                      >
                        <UserCircle size={14} />
                        마이페이지
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={
                        isCurrentFirebaseAuthAdmin || isAdminAuthenticated
                          ? logoutAdmin
                          : logoutUser
                      }
                      disabled={
                        userAuthLoading ||
                        adminLogoutInProgress ||
                        !firebaseAuthReady
                      }
                      className="px-3 py-2 text-xs"
                    >
                      <LogOut size={14} />
                      {adminLogoutInProgress ? '로그아웃 중...' : '로그아웃'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goToUserSignup}
                      disabled={userAuthLoading || !firebaseAuthReady}
                      className="px-3 py-2 text-xs"
                    >
                      <UserPlus size={14} />
                      회원가입
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={goToUserLogin}
                      disabled={userAuthLoading || !firebaseAuthReady}
                      className="px-3 py-2 text-xs"
                    >
                      <LogIn size={14} />
                      로그인
                    </Button>
                  </>
                )}
              </div>
            </nav>
          )}

          {view === 'admin' && (
            <div className="flex w-fit items-center gap-2">
              {isAdminAuthenticated && (
                <div className="hidden rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 sm:block">
                  {authenticatedAdminAccount.adminLoginId} 인증됨
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                관리자 모드
              </div>

              {isAdminAuthenticated && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToUserMypage}
                    className="px-3 py-2 text-xs"
                  >
                    마이페이지
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={logoutAdmin}
                    disabled={adminLogoutInProgress || !firebaseAuthReady}
                    className="px-3 py-2 text-xs"
                  >
                    {adminLogoutInProgress ? '로그아웃 중...' : '로그아웃'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* --- 메인 워크스페이스 --- */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        
        {/* --- 실시간 주요 대여 현황 보드 --- */}
        {shouldShowStats && (
          <DevRenderProfiler id="Shared:RentalStatusBoard">
            <RentalStatusBoard
              stats={stats}
              loading={statsLoading}
              className="mb-6 sm:mb-8"
            />
          </DevRenderProfiler>
        )}

        {view === 'user' ? (
          <DevRenderProfiler id="UserWorkspace">
            <UserWorkspace
              ctx={contextGroups.user.shell}
              panelCtx={contextGroups.user[userPanelContextKey]}
            />
          </DevRenderProfiler>
        ) : (
          <React.Suspense
            fallback={(
              <Card className="mx-auto max-w-xl border-slate-200 bg-white shadow-sm">
                <CardContent className="p-8 text-center">
                  <div className="text-sm font-bold text-slate-700">관리자 화면을 불러오는 중입니다.</div>
                  <div className="mt-2 text-xs text-slate-500">처음 진입할 때 관리자 모듈을 별도로 불러옵니다.</div>
                </CardContent>
              </Card>
            )}
          >
            <DevRenderProfiler id="AdminWorkspace">
              <AdminWorkspace
                ctx={contextGroups.admin.shell}
                panelCtx={contextGroups.admin[adminPanelContextKey]}
              />
            </DevRenderProfiler>
          </React.Suspense>
        )}
      </main>

      {view === 'user' && (
        <DevRenderProfiler id="Shared:UserFooter">
          <MemoizedUserFooter ctx={contextGroups.app.footer} />
        </DevRenderProfiler>
      )}

      {shouldRenderAppDialogs && (
        <React.Suspense fallback={null}>
          <DevRenderProfiler id="Shared:AppDialogs">
            <MemoizedAppDialogs ctx={contextGroups.app.dialogs} />
          </DevRenderProfiler>
        </React.Suspense>
      )}
      {shouldMountUserPopupLayer && (
        <React.Suspense fallback={null}>
          <DevRenderProfiler id="Shared:UserPopupLayer">
            <MemoizedUserPopupLayer ctx={contextGroups.app.popup} />
          </DevRenderProfiler>
        </React.Suspense>
      )}

      {import.meta.env.DEV && (
        <React.Suspense fallback={null}>
          <DevPerformancePanel />
        </React.Suspense>
      )}
      </div>

      {showFirebaseLoadingOverlay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/10 px-6 font-sans text-slate-900 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl mk-brand-gradient-tr text-white mk-brand-shadow-md">
              {normalizedSiteSettings.logoMode === 'image' && normalizedSiteSettings.logoImageUrl ? (
                <img src={normalizedSiteSettings.logoImageUrl} alt={normalizedSiteSettings.logoAltText} className="h-8 max-w-[120px] object-contain" />
              ) : (
                <Laptop size={24} />
              )}
            </div>
            <h1 className="text-base font-bold text-slate-900">
              데이터를 불러오는 중입니다.
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Firebase 원격 DB 기준으로 데이터를 불러오고 있습니다. 잠시만 기다려 주십시오.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
