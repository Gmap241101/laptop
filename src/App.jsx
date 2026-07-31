import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
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
  ADMIN_ACCOUNTS_COLLECTION_REF,
  FAQ_BOARD_CONFIG_DOC_REF,
  FAQ_CATEGORIES_COLLECTION_REF,
  FAQ_POSTS_COLLECTION_REF,
  FOOTER_PAGES_COLLECTION_REF,
  NOTICE_BOARD_CONFIG_DOC_REF,
  NOTICE_POSTS_COLLECTION_REF,
  POPUP_POSTS_COLLECTION_REF,
  RENTAL_ASSET_NUMBERS_COLLECTION_REF,
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
  createDefaultRequestForm,
  defaultRentalStartDate,
  findSameAssetBlockingRequest,
  getAdjustedRentalDueDate,
  getAdjustedRentalStartDate,
  getExtensionRequestAvailableDate,
  getNonBusinessDayReason,
  getLaptopAdminDisplayStatus,
  getLaptopRentalAvailability,
  getLaptopRepresentativeRequest,
  getMaxRentalDueDate,
  getRentalDueDateAdjustmentReason,
  getRentalExtensionApprovalMode,
  getRentalExtensionEligibility,
  getRentalExtensionPeriod,
  getRentalStartAdjustmentInfo,
  getRequestExtensionCount,
  getSafeMaxRentalDays,
  getSafeRentalExtensionDays,
  getSafeRentalExtensionMaxCount,
  isRentalDueBusinessDay,
  isTemporaryDateInputValue,
  normalizeHolidayList,
  normalizeRentalPolicySettings,
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
  useAdminAssetCrudState,
} from './features/assets/useAdminAssetCrudController.js';
import useAdminAssetCategoryController, {
  useAdminAssetCategoryState,
} from './features/assets/useAdminAssetCategoryController.js';
import useAdminSystemSettingsController, {
  useAdminSystemSettingsState,
} from './features/settings/useAdminSystemSettingsController.js';
import useAdminSplitStorageMigrationController, {
  SPLIT_STORAGE_VERSION,
  useAdminSplitStorageMigrationState,
} from './features/settings/useAdminSplitStorageMigrationController.js';
import {
  getClaimStatus,
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
  normalizeAssetReservations,
  toRentalAvailabilityRequest,
} from './services/publicAssetCatalog.js';
import {
  ensurePublicAssetCatalogWriteThrough,
  getPublicAssetCatalogWriteErrorMessage,
  writePublicAssetCatalogMutationInTransaction,
} from './services/publicAssetCatalogWriteThroughLoader.js';

import {
  normalizeEmailAddress,
  parseDomesticPhoneNumber,
} from './utils/memberPolicy.js';
import useUserAccountRecoveryController from './features/auth/useUserAccountRecoveryController.js';
import useUserLoginController, {
  useUserAuthState,
} from './features/auth/useUserLoginController.js';
import useUserSignupController from './features/auth/useUserSignupController.js';
import useAdminAuthenticationController, {
  createDefaultAdminAuthForm,
  useAdminAuthenticationState,
} from './features/auth/useAdminAuthenticationController.js';
import {
  configureFirebaseAuthPersistence,
} from './features/auth/authSessionService.js';
import useUserAuthenticationSessionController, {
  useUserAuthenticationSessionState,
} from './features/auth/useUserAuthenticationSessionController.js';
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
import useUserMembershipStatusController, {
  useUserMembershipStatusState,
} from './features/members/useUserMembershipStatusController.js';
import useUserRentalRequestController, {
  useUserRentalRequestState,
} from './features/requests/useUserRentalRequestController.js';
import useUserRequestHistoryActionController, {
  useUserRequestHistoryActionState,
} from './features/requests/useUserRequestHistoryActionController.js';
import useAdminRequestMutationController from './features/requests/useAdminRequestMutationController.js';
import useAdminUserActionReviewController, {
  useAdminUserActionReviewState,
} from './features/requests/useAdminUserActionReviewController.js';
import {
  createFreshRentalRestrictionStatusLoader,
} from './features/requests/rentalRestrictionService.js';
import useRentalDataSubscriptionController, {
  useOwnRentalRequestsSubscriptionController,
  useRentalDataSubscriptionState,
} from './features/requests/useRentalDataSubscriptionController.js';
import {
  createCurrentAdminAuditActorResolver,
} from './features/auth/adminAuditActorService.js';

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
  getRentalRestrictionStatus,
} from './utils/overduePolicy.js';


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
const ADMIN_PASSWORD_HASH_ALGORITHM = 'PBKDF2-SHA-256';
const ADMIN_PASSWORD_HASH_ITERATIONS = 120000;

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
  const {
    adminUserActionSavingRequestId,
    setAdminUserActionSavingRequestId,
  } = useAdminUserActionReviewState();

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

  const initializedRemoteFormRef = useRef(false);

  const {
    publicCatalogAssets,
    publicCatalogAssetsReady,
    rentalRequests,
    rentalRequestsLoadErrorMessage,
    rentalRequestsReady,
    setPublicCatalogAssets,
    setPublicCatalogAssetsReady,
    setRentalRequests,
    setRentalRequestsLoadErrorMessage,
    setRentalRequestsReady,
    setSplitPublicConfig,
    setSplitRentalAssets,
    setSplitRentalAvailability,
    setSplitRentalBorrowers,
    setSplitSourceErrors,
    setSplitSourceReady,
    setSplitStorageVersion,
    splitPublicConfig,
    splitRentalAssets,
    splitRentalAvailability,
    splitRentalBorrowers,
    splitSourceErrors,
    splitSourceReady,
    splitStorageVersion,
  } = useRentalDataSubscriptionState();
  const publicCatalogMigrationAdminUidRef = useRef('');

  const adminAccountsApplyingRemoteRef = useRef(false);
  const adminAccountsLastSyncedRef = useRef({});
  const allowAdminAccountsWriteRef = useRef(false);
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
  const {
    assetCategorySettingsDirty,
    draggingAssetCategoryIndex,
    editingAssetCategoryIndex,
    editingAssetCategoryName,
    newAssetCategory,
    setDraggingAssetCategoryIndex,
    setEditingAssetCategoryIndex,
    setEditingAssetCategoryName,
    setNewAssetCategory,
    setTempAssetCategories,
    setTempAssetCategoryRenameMap,
    tempAssetCategories,
    tempAssetCategoryRenameMap,
  } = useAdminAssetCategoryState({
    adminTab,
    dataAssetCategories: data.assetCategories,
  });

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
  const {
    adminAuthAbsoluteExpiresAt,
    adminAuthExpiresAt,
    adminAuthForm,
    adminAuthLoading,
    adminAuthPolicyVersion,
    adminLogoutInProgress,
    adminLogoutInProgressRef,
    authenticatedAdminId,
    clearAdminAuthenticatedSession,
    setAdminAuthenticatedSession,
    setAdminAuthAbsoluteExpiresAt,
    setAdminAuthExpiresAt,
    setAdminAuthForm,
    setAdminAuthLoading,
    setAdminAuthPolicyVersion,
    setAdminLogoutInProgress,
  } = useAdminAuthenticationState({
    systemAdminSettings,
  });
  const {
    clearUserAuthenticatedSession,
    setUserAuthenticatedSession,
    userAuthSessionAbsoluteExpiresAt,
    userAuthSessionExpiresAt,
    userAuthSessionPolicyVersion,
    userAuthSessionUid,
    userSessionLogoutInProgressRef,
  } = useUserAuthenticationSessionState({
    userSessionPolicy,
  });

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
  const {
    profileRequiredRedirectRef,
    setUserDirectoryVerificationLoading,
    userDirectoryVerificationKeyRef,
    userDirectoryVerificationLoading,
    userStatusLogoutInProgressRef,
  } = useUserMembershipStatusState();
  const observedFirebaseAuthUidRef = useRef('');

  const hasFirebaseAuthSession = Boolean(
    firebaseAuthUser ||
      firebaseAuth.currentUser
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


  // 엑셀/CSV 업로드 패널 토글 상태 값 추가
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [assetGridColumns, setAssetGridColumns] = useState(1);

  // 설정 임시 저장 상태와 변경 여부는 설정 feature에서 관리
  const {
    holidayImportConflictModal,
    holidayImportLoading,
    holidayImportYear,
    holidayManagementMonth,
    holidayManagementView,
    holidayManagementYear,
    holidaySettingsDirty,
    newHolidayDate,
    newHolidayName,
    newHolidayType,
    rentalPolicySettingsDirty,
    setHolidayImportConflictModal,
    setHolidayImportLoading,
    setHolidayImportYear,
    setHolidayManagementMonth,
    setHolidayManagementView,
    setHolidayManagementYear,
    setNewHolidayDate,
    setNewHolidayName,
    setNewHolidayType,
    setTempSettings,
    tempSettings,
  } = useAdminSystemSettingsState({
    adminTab,
    dataSettings: data.settings,
  });

  const footerConfigDirty =
    footerConfigReady &&
    (Boolean(footerConfigDraft.enabled) !== Boolean(footerConfig.enabled) ||
      sanitizeFooterCommonHtml(footerConfigDraft.contentHtml || '') !==
        sanitizeFooterCommonHtml(footerConfig.contentHtml || ''));


  const {
    setSplitStorageFinalizeLoading,
    splitStorageFinalizeLoading,
  } = useAdminSplitStorageMigrationState();

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
          clearUserAuthenticatedSession();
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
        clearUserAuthenticatedSession();
        setFirebaseAuthReady(true);
      }
    );

    return unsubscribe;
  }, [clearUserAuthenticatedSession]);

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

          clearAdminAuthenticatedSession();

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





  useEffect(() => {
    if (adminTab === 'adminAccounts') {
      setAdminAccountForm(createDefaultAdminAccountForm());
      setAdminAccountPage(1);
    }
  }, [adminTab]);

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

  const registeredAdminAccounts = adminAccounts || [];

  const {
    authenticateAdmin,
    authenticatedAdminAccount,
    isAdminAuthenticated,
    logoutAdmin,
  } = useAdminAuthenticationController({
    adminAccounts,
    adminAccountsReady,
    adminAuthAbsoluteExpiresAt,
    adminAuthExpiresAt,
    adminAuthForm,
    adminAuthLoading,
    adminAuthPolicyVersion,
    adminLogoutInProgress,
    adminLogoutInProgressRef,
    authenticatedAdminId,
    clearAdminAuthenticatedSession,
    currentAuthAdminAccount,
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    firebaseReady,
    getAdminFirebaseAuthErrorMessage,
    normalizeAdminAccounts,
    setAdminAccounts,
    setAdminAuthenticatedSession,
    setAdminAuthAbsoluteExpiresAt,
    setAdminAuthExpiresAt,
    setAdminAuthForm,
    setAdminAuthLoading,
    setAdminAuthPolicyVersion,
    setAdminLogoutInProgress,
    setCurrentAuthAdminAccount,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setIsCommunityMenuOpen,
    setSelectedFooterPageId,
    setSelectedNoticePostId,
    clearUserAuthenticatedSession,
    setUserTab,
    setView,
    setAdminTab,
    systemAdminSettings,
    systemAdminSettingsReady,
    triggerToast,
    userTab,
    view,
  });

  useRentalDataSubscriptionController({
    adminTab,
    authenticatedAdminId,
    createDefaultRequestForm,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    firebaseAuthReady,
    initializedRemoteFormRef,
    mergePersistedData,
    publicCatalogAssets,
    publicCatalogAssetsReady,
    setData,
    setFirebaseLoadErrorMessage,
    setFirebaseReady,
    setForm,
    setPublicCatalogAssets,
    setPublicCatalogAssetsReady,
    setSplitPublicConfig,
    setSplitRentalAssets,
    setSplitRentalAvailability,
    setSplitRentalBorrowers,
    setSplitSourceErrors,
    setSplitSourceReady,
    setSplitStorageVersion,
    setTempSettings,
    setToast,
    splitPublicConfig,
    splitRentalAssets,
    splitRentalAvailability,
    splitRentalBorrowers,
    splitSourceErrors,
    splitSourceReady,
    userTab,
    view,
  });

  useOwnRentalRequestsSubscriptionController({
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    isAdminAuthenticated,
    setRentalRequests,
    setRentalRequestsLoadErrorMessage,
    setRentalRequestsReady,
    triggerToast,
    userProfile,
    userProfileReady,
  });

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

  const { hasEstablishedUserSession } =
    useUserAuthenticationSessionController({
      authenticatedAdminId,
      clearUserAuthenticatedSession,
      currentAuthAdminAccount,
      currentAuthRoleErrorMessage,
      currentAuthRoleReady,
      firebaseAuthUser,
      setIsCommunityMenuOpen,
      setSelectedFooterPageId,
      setSelectedNoticePostId,
      setUserAuthenticatedSession,
      setUserAuthForm,
      setUserTab,
      setView,
      triggerToast,
      userAuthLoading,
      userAuthSessionAbsoluteExpiresAt,
      userAuthSessionExpiresAt,
      userAuthSessionPolicyVersion,
      userAuthSessionUid,
      userProfile,
      userProfileReady,
      userSessionLogoutInProgressRef,
      userSessionPolicy,
      userSessionPolicyReady,
      withdrawalLoading,
    });

  const showUserAccountStatus = useCallback((type) => {
    const nextView = { type };
    writeUserAccountStatusView(nextView);
    setUserAccountStatusView(nextView);
    replaceAppPath('user', 'accountStatus');
    setView('user');
    setUserTab('accountStatus');
    setIsCommunityMenuOpen(false);
  }, []);

  const { verifyUserDirectoryMembership } =
    useUserMembershipStatusController({
      authenticatedAdminId,
      clearAdminAuthenticatedSession,
      clearUserAuthenticatedSession,
      createMemberPolicyError,
      currentAuthAdminAccount,
      currentAuthRoleErrorMessage,
      currentAuthRoleReady,
      dataSettings: data.settings,
      firebaseAuthUser,
      initialSettings: initialData.settings,
      profileRequiredRedirectRef,
      setIsCommunityMenuOpen,
      setUserAuthForm,
      setUserDirectoryVerificationLoading,
      setUserTab,
      setView,
      showUserAccountStatus,
      siteSettings,
      triggerToast,
      userAuthLoading,
      userDirectoryVerificationKeyRef,
      userDirectoryVerificationLoading,
      userProfile,
      userProfileReady,
      userStatusLogoutInProgressRef,
      userTab,
      withdrawalLoading,
    });

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

  const {
    addTempHoliday,
    applyHolidayImportConflictChoice,
    deleteTempHoliday,
    discardHolidayChanges,
    discardRentalPolicyChanges,
    importKoreanPublicHolidaysFromJson,
    saveHolidaySettings,
    saveSystemSettings,
    updateTempHolidayReason,
  } = useAdminSystemSettingsController({
    dataSettings: data.settings,
    holidayImportConflictModal,
    holidayImportYear,
    isSplitStorageReady,
    newHolidayDate,
    newHolidayName,
    newHolidayType,
    setData,
    setHolidayImportConflictModal,
    setHolidayImportLoading,
    setHolidayManagementMonth,
    setHolidayManagementYear,
    setNewHolidayDate,
    setNewHolidayName,
    setNewHolidayType,
    setTempSettings,
    tempSettings,
    triggerToast,
  });


  const { finalizeSplitStorageMigration } =
    useAdminSplitStorageMigrationController({
      authenticatedAdminId,
      currentAuthAdminAccount,
      isAdminAuthenticated,
      setSplitStorageFinalizeLoading,
      splitStorageFinalizeLoading,
      triggerToast,
    });

  const {
    addTempAssetCategory,
    applyEditTempAssetCategory,
    cancelTempAssetCategoryChanges,
    deleteTempAssetCategory,
    moveTempAssetCategory,
    saveTempAssetCategoryChanges,
    startEditTempAssetCategory,
  } = useAdminAssetCategoryController({
    authenticatedAdminId,
    currentAuthAdminAccount,
    dataAssetCategories: data.assetCategories,
    dataLaptops: data.laptops,
    editingAssetCategoryName,
    isSplitStorageReady,
    newAssetCategory,
    setAdminSelectedAssetCategory,
    setData,
    setDraggingAssetCategoryIndex,
    setEditingAssetCategoryIndex,
    setEditingAssetCategoryName,
    setNewAssetCategory,
    setSelectedAssetCategory,
    setTempAssetCategories,
    setTempAssetCategoryRenameMap,
    tempAssetCategories,
    tempAssetCategoryRenameMap,
    triggerToast,
  });

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

  const loadFreshRentalRestrictionStatus =
    createFreshRentalRestrictionStatusLoader({
      fallbackSettings: data.settings,
    });

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

  const getCurrentAdminAuditActor =
    createCurrentAdminAuditActorResolver({
      firebaseAuth,
      authenticatedAdminAccount,
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

  const {
    commitAdminRequestEdit,
    commitAdminRequestStatusRestore,
    saveRequestMemo,
    updateRequest,
    updateRequestMemo,
  } = useAdminRequestMutationController({
    clearAdminRequestPanelSelection,
    dataSettings: data.settings,
    getAdminRequestById,
    getCurrentAdminAuditActor,
    isSplitStorageReady,
    notifyAdminRequestMutation,
    resetAdminRequestPanelPage,
    setData,
    triggerToast,
    updateAdminRequestPanelRequests,
  });


  const { reviewUserActionRequest } =
    useAdminUserActionReviewController({
      dataSettings: data.settings,
      getAdminRequestById,
      getCurrentAdminAuditActor,
      getUserRequestActionLabel,
      isSplitStorageReady,
      notifyAdminRequestMutation,
      setAdminUserActionSavingRequestId,
      setData,
      triggerToast,
      updateAdminRequestPanelRequests,
    });

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
    view === 'user' &&
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
        <div className={`relative z-40 border-b px-4 py-2 text-center text-sm font-bold leading-5 ${
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
