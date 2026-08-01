import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  doc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  runTransaction,
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

import { loadAppDialogsModule } from './dialogs/appDialogsLoader.js';
import useGlobalUiController, {
  useGlobalUiState,
} from './ui/useGlobalUiController.js';

const AdminWorkspace = React.lazy(() => import('./admin/AdminWorkspace.jsx'));
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
  getPopupDisplayStatus,
} from './utils/popupUtils.js';

import {
  RENTAL_ASSET_NUMBERS_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  SITE_SETTINGS_DOC_REF,
  USER_ACCOUNTS_COLLECTION_REF,
  db,
  firebaseAuth,
} from './firebase.js';



import {
  ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
  ADMIN_REQUEST_QUICK_FILTER,
  ADMIN_REQUEST_TAB,
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
import useBoardContentSubscriptionController, {
  filterNoticePostsByQuery,
  getSafeFaqPostsPerPage,
  getSafeNoticePostsPerPage,
  useBoardContentSubscriptionState,
} from './features/boards/useBoardContentSubscriptionController.js';
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
  sanitizeFooterCommonHtml,
  useAdminFooterContentState,
} from './features/boards/useAdminFooterContentController.js';
import usePopupFooterContentSubscriptionController, {
  usePopupFooterContentSubscriptionState,
} from './features/boards/usePopupFooterContentSubscriptionController.js';
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
  pushAppPath,
  readUserAccountStatusView,
} from './routing/appRoutes.js';
import useAppNavigationController, {
  useAppNavigationState,
} from './routing/useAppNavigationController.js';
import {
  normalizeAssetReservations,
  toRentalAvailabilityRequest,
} from './services/publicAssetCatalog.js';
import {
  ensurePublicAssetCatalogWriteThrough,
  getPublicAssetCatalogWriteErrorMessage,
  writePublicAssetCatalogMutationInTransaction,
} from './services/publicAssetCatalogWriteThroughLoader.js';

import useUserAccountRecoveryController from './features/auth/useUserAccountRecoveryController.js';
import useAuthIdentityPolicySubscriptionController, {
  normalizeAdminAccounts,
  useAuthIdentityPolicySubscriptionState,
} from './features/auth/useAuthIdentityPolicySubscriptionController.js';
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
import useRentalDerivedSelectors, {
  getUserLaptopStatusLabel,
} from './features/requests/useRentalDerivedSelectors.js';
import {
  createCurrentAdminAuditActorResolver,
} from './features/auth/adminAuditActorService.js';

import {
  DEFAULT_SITE_SETTINGS,
  SERVICE_MODE,
  getHeaderSubtitle,
  getServiceBlockReason,
  normalizeSiteSettings,
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
  const {
    adminAccounts,
    adminAccountsLoadErrorMessage,
    adminAccountsReady,
    adminAccountsRemoteHasData,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    currentUserRestriction,
    currentUserRestrictionReady,
    firebaseAuthReady,
    firebaseAuthUser,
    setAdminAccounts,
    setAdminAccountsLoadErrorMessage,
    setAdminAccountsReady,
    setAdminAccountsRemoteHasData,
    setCurrentAuthAdminAccount,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setCurrentUserRestriction,
    setCurrentUserRestrictionReady,
    setFirebaseAuthReady,
    setFirebaseAuthUser,
    setSystemAdminSettings,
    setSystemAdminSettingsLoadErrorMessage,
    setSystemAdminSettingsReady,
    setUserProfile,
    setUserProfileReady,
    setUserSessionPolicy,
    setUserSessionPolicyLoadErrorMessage,
    setUserSessionPolicyReady,
    systemAdminSettings,
    systemAdminSettingsLoadErrorMessage,
    systemAdminSettingsReady,
    userProfile,
    userProfileReady,
    userSessionPolicy,
    userSessionPolicyLoadErrorMessage,
    userSessionPolicyReady,
  } = useAuthIdentityPolicySubscriptionState();
  const {
    appDialogsActivated,
    confirmModal,
    setAppDialogsActivated,
    setConfirmModal,
    setSystemBannerDismissedKey,
    setToast,
    systemBannerDismissedKey,
    toast,
  } = useGlobalUiState();
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

  const {
    activeFaqCategoryId,
    adminExpandedFaqPostId,
    adminFaqPage,
    adminNoticePage,
    adminNoticeQuery,
    expandedFaqPostId,
    faqBoardConfig,
    faqBoardConfigLoadErrorMessage,
    faqBoardConfigReady,
    faqCategories,
    faqCategoriesLoadErrorMessage,
    faqCategoriesReady,
    faqCursorByPageRef,
    faqCursorKeyRef,
    faqHasNextPage,
    faqPage,
    faqPinnedPosts,
    faqPosts,
    faqPostsLoadErrorMessage,
    faqPostsReady,
    faqQuery,
    faqRegularPagePosts,
    faqRegularTotalCount,
    faqSearchWithinCategory,
    noticeBoardConfig,
    noticeBoardConfigLoadErrorMessage,
    noticeBoardConfigReady,
    noticeCursorByPageRef,
    noticeCursorKeyRef,
    noticeHasNextPage,
    noticePage,
    noticePinnedPosts,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsReady,
    noticeRegularPagePosts,
    noticeRegularTotalCount,
    selectedNoticePostId,
    selectedNoticePostOverride,
    setActiveFaqCategoryId,
    setAdminExpandedFaqPostId,
    setAdminFaqPage,
    setAdminNoticePage,
    setAdminNoticeQuery,
    setExpandedFaqPostId,
    setFaqBoardConfig,
    setFaqBoardConfigLoadErrorMessage,
    setFaqBoardConfigReady,
    setFaqCategories,
    setFaqCategoriesLoadErrorMessage,
    setFaqCategoriesReady,
    setFaqHasNextPage,
    setFaqPage,
    setFaqPinnedPosts,
    setFaqPostsLoadErrorMessage,
    setFaqPostsReady,
    setFaqQuery,
    setFaqRegularPagePosts,
    setFaqRegularTotalCount,
    setFaqSearchWithinCategory,
    setNoticeBoardConfig,
    setNoticeBoardConfigLoadErrorMessage,
    setNoticeBoardConfigReady,
    setNoticeHasNextPage,
    setNoticePage,
    setNoticePinnedPosts,
    setNoticePostsLoadErrorMessage,
    setNoticePostsReady,
    setNoticeRegularPagePosts,
    setNoticeRegularTotalCount,
    setSelectedNoticePostId,
    setSelectedNoticePostOverride,
    setUserNoticeQuery,
    userNoticeQuery,
  } = useBoardContentSubscriptionState();
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

  const {
    dismissedPopupLocalVersions,
    dismissedPopupSessionVersions,
    footerConfig,
    footerConfigLoadErrorMessage,
    footerConfigReady,
    footerPages,
    footerPagesLoadErrorMessage,
    footerPagesReady,
    popupPosts,
    popupPostsLoadErrorMessage,
    popupPostsReady,
    setDismissedPopupLocalVersions,
    setDismissedPopupSessionVersions,
    setFooterConfig,
    setFooterConfigLoadErrorMessage,
    setFooterConfigReady,
    setFooterPages,
    setFooterPagesLoadErrorMessage,
    setFooterPagesReady,
    setPopupPosts,
    setPopupPostsLoadErrorMessage,
    setPopupPostsReady,
    setTemporarilyDismissedPopupVersions,
    temporarilyDismissedPopupVersions,
  } = usePopupFooterContentSubscriptionState();
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

  const {
    communityMenuRef,
    isCommunityMenuOpen,
    pendingProtectedUserTabRef,
    selectedFooterPageId,
    setIsCommunityMenuOpen,
    setSelectedFooterPageId,
    setUserTab,
    setView,
    userTab,
    view,
  } = useAppNavigationState();
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

  const hasFirebaseAuthSession = Boolean(
    firebaseAuthUser ||
      firebaseAuth.currentUser
  );

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
    if (adminTab === 'adminAccounts') {
      setAdminAccountForm(createDefaultAdminAccountForm());
      setAdminAccountPage(1);
    }
  }, [adminTab]);

  const normalizedSiteSettings = normalizeSiteSettings(siteSettings);
  const {
    dismissSystemBanner,
    shouldRenderAppDialogs,
    shouldShowSystemBanner,
    triggerConfirm,
    triggerToast,
  } = useGlobalUiController({
    appDialogsActivated,
    confirmModal,
    faqPostDialog,
    noticePostDialog,
    popupPostDialog,
    setAppDialogsActivated,
    setConfirmModal,
    setSystemBannerDismissedKey,
    setToast,
    systemBannerDismissedKey,
    systemBannerEnabled: normalizedSiteSettings.systemBannerEnabled,
    systemBannerLevel: normalizedSiteSettings.systemBannerLevel,
    systemBannerMessage: normalizedSiteSettings.systemBannerMessage,
    toast,
    userActionDialog,
    view,
  });

  useAuthIdentityPolicySubscriptionController({
    adminTab,
    authenticatedAdminId,
    clearAdminAuthenticatedSession,
    clearUserAuthenticatedSession,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    setAdminAccounts,
    setAdminAccountsLoadErrorMessage,
    setAdminAccountsReady,
    setAdminAccountsRemoteHasData,
    setCurrentAuthAdminAccount,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setCurrentUserRestriction,
    setCurrentUserRestrictionReady,
    setFirebaseAuthReady,
    setFirebaseAuthUser,
    setSystemAdminSettings,
    setSystemAdminSettingsLoadErrorMessage,
    setSystemAdminSettingsReady,
    setToast,
    setUserProfile,
    setUserProfileForm,
    setUserProfileReady,
    setUserSessionPolicy,
    setUserSessionPolicyLoadErrorMessage,
    setUserSessionPolicyReady,
    triggerToast,
    view,
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

  const {
    dashboardSummary,
    dashboardSummaryLoadErrorMessage,
    dashboardSummaryReady,
    dashboardSummaryRefreshing,
    refreshDashboardSummary,
  } = useDashboardSummary({
    adminTab,
    authenticatedAdminId,
    currentAuthAdminAccountId: currentAuthAdminAccount?.id || '',
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUserUid: firebaseAuthUser?.uid || '',
    isAdminAuthenticated,
    triggerToast,
    view,
  });

  const {
    goToProtectedUserTab,
    goToUserFaq,
    goToUserHome,
    goToUserMypage,
    goToUserNotice,
    navigateToAdminHome,
    navigateToUserReturnTarget,
    openFooterPage,
    saveCurrentUserLoginReturnTarget,
    showUserAccountStatus,
  } = useAppNavigationController({
    adminLogoutInProgress,
    communityMenuRef,
    currentAuthAdminAccount,
    currentAuthRoleReady,
    dataSettings: data.settings,
    firebaseAuthReady,
    footerPages,
    footerPagesReady,
    hasFirebaseAuthSession,
    isAdminAuthenticated,
    isCommunityMenuOpen,
    pendingProtectedUserTabRef,
    selectedFooterPageId,
    selectedNoticePostId,
    setIsCommunityMenuOpen,
    setSelectedFooterPageId,
    setSelectedNoticePostId,
    setUserAccountStatusView,
    setUserTab,
    setView,
    triggerToast,
    userAuthLoading,
    userProfile,
    userStatusLogoutInProgressRef,
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

  const {
    adminFilteredLaptops,
    availableFilterLabel,
    currentUserRentalRestrictionStatus,
    currentUserRequests,
    editLaptopInsertIndex,
    filteredBorrowers,
    filteredLaptops,
    isPeriodBasedRentalMode,
    rentalDeviceSectionDescription,
    rentalDeviceSectionTitle,
    selectedLaptop,
    selectedLaptopAvailability,
    shouldShowStats,
    stats,
    statsLoading,
    unavailableFilterLabel,
  } = useRentalDerivedSelectors({
    adminAvailabilityFilter,
    adminLaptopQuery,
    adminSelectedAssetCategory,
    adminTab,
    assetGridColumns,
    availabilityFilter,
    currentUserRestriction,
    dashboardSummary,
    dashboardSummaryReady,
    dataBorrowers: data.borrowers,
    dataLaptops: data.laptops,
    dataRequests: data.requests,
    dataSettings: data.settings,
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
  });

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
  
  const { closeNoticePost, openNoticePost } =
    useBoardContentSubscriptionController({
      activeFaqCategoryId,
      adminFaqPage,
      adminNoticePage,
      adminNoticeQuery,
      adminTab,
      debouncedAdminNoticeQuery,
      debouncedFaqQuery,
      debouncedUserNoticeQuery,
      faqBoardConfig,
      faqCategories,
      faqCursorByPageRef,
      faqCursorKeyRef,
      faqPage,
      faqSearchWithinCategory,
      isAdminAuthenticated,
      noticeBoardConfig,
      noticeCursorByPageRef,
      noticeCursorKeyRef,
      noticePage,
      noticePosts,
      selectedNoticePostId,
      selectedNoticePostOverride,
      setActiveFaqCategoryId,
      setAdminFaqPage,
      setAdminNoticePage,
      setExpandedFaqPostId,
      setFaqBoardConfig,
      setFaqBoardConfigLoadErrorMessage,
      setFaqBoardConfigReady,
      setFaqCategories,
      setFaqCategoriesLoadErrorMessage,
      setFaqCategoriesReady,
      setFaqHasNextPage,
      setFaqPage,
      setFaqPinnedPosts,
      setFaqPostsLoadErrorMessage,
      setFaqPostsPerPageInput,
      setFaqPostsReady,
      setFaqRegularPagePosts,
      setFaqRegularTotalCount,
      setNoticeBoardConfig,
      setNoticeBoardConfigLoadErrorMessage,
      setNoticeBoardConfigReady,
      setNoticeHasNextPage,
      setNoticePage,
      setNoticePinnedPosts,
      setNoticePostsLoadErrorMessage,
      setNoticePostsPerPageInput,
      setNoticePostsReady,
      setNoticeRegularPagePosts,
      setNoticeRegularTotalCount,
      setSelectedNoticePostId,
      setSelectedNoticePostOverride,
      triggerToast,
      userTab,
      view,
    });

  const {
    dismissAllUserPopups,
    dismissUserPopup,
    selectedFooterPage,
  } = usePopupFooterContentSubscriptionController({
    adminTab,
    dismissedPopupLocalVersions,
    dismissedPopupSessionVersions,
    firebaseAuthUser,
    footerPages,
    isAdminAuthenticated,
    selectedFooterPageId,
    setDismissedPopupLocalVersions,
    setDismissedPopupSessionVersions,
    setFooterConfig,
    setFooterConfigDraft,
    setFooterConfigLoadErrorMessage,
    setFooterConfigReady,
    setFooterPages,
    setFooterPagesLoadErrorMessage,
    setFooterPagesReady,
    setPopupPosts,
    setPopupPostsLoadErrorMessage,
    setPopupPostsReady,
    setTemporarilyDismissedPopupVersions,
    temporarilyDismissedPopupVersions,
    triggerToast,
    userTab,
    view,
  });

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

  const goToAppHome = () => {
    if (
      view === 'admin' &&
      typeof window !== 'undefined' &&
      window.__mkHomeBannerUnsaved &&
      !window.confirm(
        '저장하지 않은 초기화면 배너 또는 표시 설정 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?'
      )
    ) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.__mkHomeBannerUnsaved = false;
    }

    if (view === 'admin') {
      navigateToAdminHome();
      handleAdminTabChange('dashboard');
      return;
    }

    goToUserHome();
  };

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
  const shouldMountUserPopupLayer =
    view === 'user' &&
    Array.isArray(popupPosts) &&
    popupPosts.length > 0 &&
    (userTab === 'home' ||
      (userTab === 'rental' && Boolean(firebaseAuthUser)));

  const showFirebaseLoadingOverlay = !firebaseReady;
  const headerSubtitle = getHeaderSubtitle(normalizedSiteSettings);

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
            <Button onClick={() => navigateToAdminHome({ replace: true })}>관리자 모드</Button>
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
            <button type="button" onClick={dismissSystemBanner} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-black/10" aria-label="시스템 안내 닫기"><X size={14} /></button>
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
