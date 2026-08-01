import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, DateInputWithWeekday } from './components/CommonUI.jsx';
import useAppContextAssembler from './context/useAppContextAssembler.js';
import AppShell from './shell/AppShell.jsx';
import AppBlockingStateScreen, {
  getAppBlockingState,
} from './shell/AppBlockingStateScreen.jsx';

import useGlobalUiController, {
  useGlobalUiState,
} from './ui/useGlobalUiController.js';

import { richTextHtmlToText } from './utils/richTextCore.js';
import { firebaseAuth } from './firebase.js';



import {
  ADMIN_REQUEST_QUICK_FILTER,
  ADMIN_REQUEST_TAB,
  STATUS,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
} from './constants/appConstants.js';


import {
  DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
  DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
  createDefaultRequestForm,
  getAdjustedRentalDueDate,
  getAdjustedRentalStartDate,
  getNonBusinessDayReason,
  getMaxRentalDueDate,
  getRentalDueDateAdjustmentReason,
  getRentalStartAdjustmentInfo,
  getSafeMaxRentalDays,
  isTemporaryDateInputValue,
  normalizeHolidayList,
} from './domain/rentalPolicy.js';
import { useDashboardSummary } from './hooks/useDashboardSummary.js';
import useSiteSettingsController from './features/settings/useSiteSettingsController.js';
import useResponsiveAssetGridColumns from './hooks/useResponsiveAssetGridColumns.js';
import { selectAppReadiness } from './selectors/appReadinessSelectors.js';
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
import usePublicAssetCatalogCompatibilityController from './features/assets/usePublicAssetCatalogCompatibilityController.js';
import useAdminSystemSettingsController, {
  useAdminSystemSettingsState,
} from './features/settings/useAdminSystemSettingsController.js';
import useAdminSplitStorageMigrationController, {
  useAdminSplitStorageMigrationState,
} from './features/settings/useAdminSplitStorageMigrationController.js';
import { useDebouncedValue } from './hooks/useDebouncedValue.js';
import {
  readUserAccountStatusView,
} from './routing/appRoutes.js';
import useAppNavigationController, {
  useAppNavigationState,
} from './routing/useAppNavigationController.js';
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
  useAdminAuthenticationState,
} from './features/auth/useAdminAuthenticationController.js';
import {
  configureFirebaseAuthPersistence,
} from './features/auth/authSessionService.js';
import useUserAuthenticationSessionController, {
  useUserAuthenticationSessionState,
} from './features/auth/useUserAuthenticationSessionController.js';
import useAdminAccountManagementController, {
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
import useRentalDerivedSelectors from './features/requests/useRentalDerivedSelectors.js';
import {
  initialData,
  mergePersistedData,
} from './services/appDataCompatibilityService.js';
import {
  createCurrentAdminAuditActorResolver,
} from './features/auth/adminAuditActorService.js';


import {
  formatDateWithKoreanWeekday,
  getDisplayRentalStatus,
  getFirestoreTimestampMillis,
  today,
} from './utils/appUtils.js';


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

const createMemberPolicyError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
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


function App() {
  const [data, setData] = useState(initialData);
  const {
    normalizedSiteSettings,
    siteSettings,
    siteSettingsLoadErrorMessage,
    siteSettingsReady,
  } = useSiteSettingsController();
  const {
    adminAccounts,
    adminAccountsLoadErrorMessage,
    adminAccountsReady,
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
    faqPage,
    faqPosts,
    faqPostsLoadErrorMessage,
    faqPostsReady,
    faqQuery,
    faqRegularTotalCount,
    faqSearchWithinCategory,
    noticeBoardConfig,
    noticeBoardConfigLoadErrorMessage,
    noticeBoardConfigReady,
    noticeCursorByPageRef,
    noticeCursorKeyRef,
    noticePage,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsReady,
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
  const assetGridColumns = useResponsiveAssetGridColumns();

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
    if (adminTab === 'adminAccounts') {
      setAdminAccountForm(createDefaultAdminAccountForm());
      setAdminAccountPage(1);
    }
  }, [adminTab]);

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
    hasAdminAccess,
    hasFirebaseAuthSession,
    isCurrentFirebaseAuthAdmin,
    isCurrentFirebaseAuthGeneralUser,
    isSplitStorageReady,
    isUserDirectoryAccessRestricted,
    memberDirectoryAudit,
    memberDirectoryPolicyEnabled,
    memberIdentityClaimsReady,
    shouldShowAdminAccountsErrorPage,
    shouldShowAdminLoadingPage,
    shouldShowAdminLoginPage,
  } = selectAppReadiness({
    adminAccountsLoadErrorMessage,
    adminAccountsReady,
    adminLogoutInProgress,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    dataSettings: data.settings,
    firebaseAuthCurrentUser: firebaseAuth.currentUser,
    firebaseAuthReady,
    firebaseAuthUser,
    firebaseLoadErrorMessage,
    firebaseReady,
    isAdminAuthenticated,
    splitPublicConfig,
    splitStorageVersion,
    userProfile,
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


  usePublicAssetCatalogCompatibilityController({
    authenticatedAdminId,
    currentAuthAdminAccountId: currentAuthAdminAccount?.id || '',
    isAdminAuthenticated,
    triggerToast,
  });


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


  const {
    adminFilteredLaptops,
    availableFilterLabel,
    currentUserRentalRestrictionStatus,
    currentUserRequests,
    editLaptopInsertIndex,
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

  const dynamicContextValueGroups = {
    // 여러 기능에서 공동으로 사용하는 인증·데이터·이동 값
    shared: {
      authenticatedAdminAccount, authenticatedAdminId, currentAuthAdminAccount, currentAuthRoleErrorMessage,
      currentAuthRoleReady, data, setData, siteSettings,
      faqCategories, faqPosts, firebaseAuthReady, firebaseAuthUser,
      getUserRequestActionLabel, goToUserHome, goToProtectedUserTab, goToUserLogin,
      goToUserMypage, handleAdminTabChange, openAdminMemberAccounts, isAdminAuthenticated,
      isCurrentFirebaseAuthGeneralUser, isSplitStorageReady, noticePosts, noticePostsLoadErrorMessage,
      noticePostsReady, openNoticePost, triggerConfirm, triggerToast,
      userActionSaving, userProfile, userProfileReady, footerPagesReady,
      footerPagesLoadErrorMessage, userTab,
    },
    // 사용자 인증·회원·관리자 계정 값
    identity: {
      accountRecoveryForm, accountRecoveryLoading, accountRecoveryResult, resetAccountRecoverySearch,
      adminAccountEditForm, adminAccountForm, adminAccountTotalPages, adminAccountUserOptions,
      adminAccountsLoadErrorMessage, adminAuthForm, adminAuthLoading, adminMyProfileForm,
      adminMyProfileSaving, adminTab, authenticateAdmin, cancelEditAdminAccount,
      cancelWithdrawal, cancelUserSignup, deleteAdminAccount, toggleAdminAccountLock,
      editingAdminAccountId, goToUserEmailRecovery, goToUserFaq, goToUserNotice,
      goToUserPasswordReset, goToUserSignup, hasEstablishedUserSession, hasFirebaseAuthSession,
      isUserDirectoryAccessRestricted, logoutAdmin, logoutUser, memberDirectoryAudit,
      adminMemberAccountsNavigationRequest, memberDirectoryPolicyEnabled, memberIdentityClaimsReady, openWithdrawalDialog,
      paginatedAdminAccounts, passwordResetForm, passwordResetLoading, passwordResetVerificationResult,
      registerAdminAccount, registeredAdminAccounts, safeAdminAccountPage, saveAdminAccountEdit,
      saveMyAdminProfile, saveMyUserProfile, sendAdminAccountPasswordResetEmail, setAccountRecoveryForm,
      setAdminAccountEditForm, setAdminAccountForm, setAdminAccountPage, setAdminAuthForm,
      setAdminMyProfileForm, setAdminTab, updatePasswordResetForm, setUserAuthForm,
      setUserProfileForm, setView, setWithdrawalPassword, shouldShowAdminAccountsErrorPage,
      shouldShowAdminLoadingPage, shouldShowAdminLoginPage, startEditAdminAccount, submitAccountRecovery,
      submitMembershipWithdrawal, submitPasswordReset, submitUserAuthForm, stats,
      userAccountStatusView, userAuthForm, userAuthLoading, userDirectoryVerificationLoading,
      userProfileForm, userProfileSaving, withdrawalBlockMessage, withdrawalDialogOpen,
      withdrawalLoading, withdrawalPassword, selectedFooterPage,
      memberAccountsPrerequisitesReady:
        firebaseAuthReady && currentAuthRoleReady,
      memberDirectoryBorrowers: data.borrowers,
      memberDirectorySettings: data.settings,
      memberDirectoryTeams: data.teams,
      onMemberDirectoryDeferredStateChange:
        handleMemberDirectoryDeferredStateChange,
      onSignupPolicyDeferredStateChange:
        handleSignupPolicyDeferredStateChange,
      signupPolicySettings: data.settings,
    },
    // 대여 신청·신청내역·관리자 신청 및 자산 값
    rental: {
      addTempAssetCategory, adminAvailabilityFilter, adminFilteredLaptops, adminLaptopQuery,
      adminSelectedAssetCategory, adminUserActionSavingRequestId, applyEditTempAssetCategory, availabilityFilter,
      availableFilterLabel, cancelTempAssetCategoryChanges, createLaptop, currentUserRentalRestrictionStatus,
      currentUserRestrictionReady, currentUserRequests, rentalRequestsLoadErrorMessage, rentalRequestsReady,
      dashboardSummary, dashboardSummaryLoadErrorMessage, dashboardSummaryReady, dashboardSummaryRefreshing,
      deleteLaptop, deleteTempAssetCategory, draggingAssetCategoryIndex, editLaptop,
      editLaptopInsertIndex, editingAssetCategoryIndex, editingAssetCategoryName, filteredLaptops,
      form, getUserRequestReviewStatusLabel, handleAddLaptopClick, openAdminRequests,
      isPeriodBasedRentalMode, adminRequestsMutationVersion, adminRequestsNavigationRequest, commitAdminRequestEdit,
      commitAdminRequestStatusRestore, moveTempAssetCategory, newAssetCategory, newLaptop,
      openUserActionDialog, orphanedRentalAvailabilityRequests, query, refreshDashboardSummary,
      renderRequestActionButtons, rentalDeviceSectionDescription, rentalDeviceSectionTitle, rentalPeriodFields,
      rentalStartAdjustmentInfo, requestSubmitLoading, reviewUserActionRequest, saveLaptop,
      saveRequestMemo, saveTempAssetCategoryChanges, selectedAssetCategory, selectedLaptop,
      selectedLaptopAvailability, selectedLaptopId, setAdminAvailabilityFilter, setAdminLaptopQuery,
      setAdminSelectedAssetCategory, setAvailabilityFilter, setDraggingAssetCategoryIndex, setEditLaptop,
      setEditingAssetCategoryIndex, setEditingAssetCategoryName, setForm, setNewAssetCategory,
      setNewLaptop, setQuery, setSelectedAssetCategory, setSelectedLaptopId,
      setShowUploadPanel, showUploadPanel, splitRentalAssets, startEditTempAssetCategory,
      submitRequest, tempAssetCategories, unavailableFilterLabel, updateRequestMemo,
      adminRequestsPrerequisitesReady:
        firebaseAuthReady &&
        currentAuthRoleReady &&
        !currentAuthRoleErrorMessage &&
        Boolean(firebaseAuthUser?.uid),
      onAdminRequestsControllerStateChange:
        handleAdminRequestsControllerStateChange,
    },
    // 공지사항·FAQ 값
    boards: {
      activeFaqCategoryId, activeFaqCategoryName, addFaqCategory, adminExpandedFaqPostId,
      adminFaqTotalPages, adminNoticeQuery, adminNoticeTotalPages, adminPinnedFaqPosts,
      adminPinnedNoticePosts, adminRegularFaqPosts, adminRegularNoticePosts, categoryFilteredFaqPosts,
      closeNoticePost, confirmDeleteFaqCategory, confirmDeleteFaqPost, confirmDeleteNoticePost,
      displayedFaqPosts, editingFaqCategoryId, editingFaqCategoryName, expandedFaqPostId,
      faqBoardConfigLoadErrorMessage, faqBoardConfigReady, faqBoardConfigSaving, faqCategoriesLoadErrorMessage,
      faqCategoriesReady, faqCategoryDeletingId, faqCategoryNameById, faqCategorySavingId,
      faqPostDeletingId, faqPostsLoadErrorMessage, faqPostsPerPageInput, faqPostsReady,
      faqQuery, faqSearchWithinCategory, faqTotalPages, newFaqCategoryName,
      noticeBoardConfigLoadErrorMessage, noticeBoardConfigReady, noticeBoardConfigSaving, noticePostDeletingId,
      noticePostsPerPage, noticePostsPerPageInput, noticeRegularPostNumberById, noticeTotalPages,
      openFaqPostDialog, openNoticePostDialog, paginatedAdminFaqPosts, paginatedAdminNoticePosts,
      paginatedNoticePosts, pinnedNoticePosts, regularFaqPosts, regularNoticePosts,
      safeAdminFaqPage, safeAdminNoticePage, safeFaqPage, safeNoticePage,
      saveFaqBoardConfig, saveFaqCategoryName, saveNoticeBoardConfig, selectedNoticePost,
      setActiveFaqCategoryId, setAdminExpandedFaqPostId, setAdminFaqPage, setAdminNoticePage,
      setAdminNoticeQuery, setEditingFaqCategoryId, setEditingFaqCategoryName, setExpandedFaqPostId,
      setFaqPage, setFaqPostsPerPageInput, setFaqQuery, setFaqSearchWithinCategory,
      setNewFaqCategoryName, setNoticePage, setUserNoticeQuery, setNoticePostsPerPageInput,
      startEditFaqCategory, toggleAdminFaqPost, toggleFaqPost, userNoticeQuery,
    },
    // 시스템 설정·공휴일·운영 관리 값
    operations: {
      addTempHoliday, siteSettingsReady, siteSettingsLoadErrorMessage, systemAdminSettings,
      systemAdminSettingsReady, systemAdminSettingsLoadErrorMessage, userSessionPolicy, userSessionPolicyReady,
      userSessionPolicyLoadErrorMessage, deleteTempHoliday, finalizeSplitStorageMigration, holidayImportConflictModal,
      holidayImportLoading, holidayImportYear, holidayManagementMonth, holidayManagementView,
      holidayManagementYear, holidaySettingsDirty, importKoreanPublicHolidaysFromJson, applyHolidayImportConflictChoice,
      newHolidayDate, newHolidayName, newHolidayType, saveHolidaySettings,
      saveSystemSettings, setHolidayImportConflictModal, setHolidayImportYear, setHolidayManagementMonth,
      setHolidayManagementView, setHolidayManagementYear, setNewHolidayDate, setNewHolidayName,
      setNewHolidayType, setTempSettings, splitStorageFinalizeLoading, tempAllowNonOverlappingSameAssetRequests,
      tempBusinessDayAdjustmentEnabled, tempHolidayList, discardHolidayChanges, tempSettings,
      updateTempHolidayReason,
    },
    // 팝업·푸터 값
    content: {
      temporarilyDismissedPopupVersions, dismissedPopupSessionVersions, dismissedPopupLocalVersions, dismissUserPopup,
      dismissAllUserPopups, popupPosts, popupPostsReady, popupPostsLoadErrorMessage,
      popupPostDeletingId, popupPostToggleSavingId, openPopupPostDialog, togglePopupPostEnabled,
      movePopupPost, confirmDeletePopupPost, footerConfig, footerConfigDraft,
      footerConfigReady, footerConfigLoadErrorMessage, footerConfigSaving, footerPages,
      footerPageDialog, footerPageForm, footerPageSaving, footerPageDeletingId,
      footerPageToggleSavingId, selectedFooterPageId, setFooterConfigDraft, setFooterPageForm,
      saveFooterConfig, openFooterPageDialog, closeFooterPageDialog, saveFooterPage,
      toggleFooterPageEnabled, moveFooterPage, confirmDeleteFooterPage, openFooterPage,
    },
    // 공통 대화상자 값
    dialogs: {
      activeUserActionRentalRequest, closeFaqPostDialog, closeNoticePostDialog, closeUserActionDialog,
      confirmModal, faqPostDialog, faqPostForm, faqPostSaving,
      noticePostDialog, noticePostForm, noticePostSaving, saveFaqPost,
      saveNoticePost, setConfirmModal, setFaqPostForm, setNoticePostForm,
      setToast, setUserActionForm, submitUserActionRequest, toast,
      userActionBorrowers, userActionDialog, userActionForm, popupPostDialog,
      popupPostForm, popupPostSaving, closePopupPostDialog, savePopupPost,
      setPopupPostForm,
    },
  };

  const {
    adminPanelContextKey,
    contextGroups,
    userPanelContextKey,
  } = useAppContextAssembler({
    adminTab,
    dynamicValueGroups: dynamicContextValueGroups,
    hasFirebaseAuthSession,
    isUserDirectoryAccessRestricted,
    userTab,
  });
  const appBlockingState = getAppBlockingState({
    firebaseLoadErrorMessage,
    normalizedSiteSettings,
    view,
  });

  if (appBlockingState) {
    return (
      <AppBlockingStateScreen
        firebaseLoadErrorMessage={firebaseLoadErrorMessage}
        navigateToAdminHome={navigateToAdminHome}
        normalizedSiteSettings={normalizedSiteSettings}
        state={appBlockingState}
      />
    );
  }

  return (
    <AppShell
      adminLogoutInProgress={adminLogoutInProgress}
      adminPanelContextKey={adminPanelContextKey}
      authenticatedAdminAccount={authenticatedAdminAccount}
      communityMenuRef={communityMenuRef}
      contextGroups={contextGroups}
      currentAuthRoleErrorMessage={currentAuthRoleErrorMessage}
      dismissSystemBanner={dismissSystemBanner}
      firebaseAuthReady={firebaseAuthReady}
      firebaseAuthUser={firebaseAuthUser}
      firebaseReady={firebaseReady}
      goToAppHome={goToAppHome}
      goToProtectedUserTab={goToProtectedUserTab}
      goToUserFaq={goToUserFaq}
      goToUserLogin={goToUserLogin}
      goToUserMypage={goToUserMypage}
      goToUserNotice={goToUserNotice}
      goToUserSignup={goToUserSignup}
      isAdminAuthenticated={isAdminAuthenticated}
      isCommunityMenuOpen={isCommunityMenuOpen}
      isCurrentFirebaseAuthAdmin={isCurrentFirebaseAuthAdmin}
      logoutAdmin={logoutAdmin}
      logoutUser={logoutUser}
      normalizedSiteSettings={normalizedSiteSettings}
      popupPosts={popupPosts}
      setIsCommunityMenuOpen={setIsCommunityMenuOpen}
      shouldRenderAppDialogs={shouldRenderAppDialogs}
      shouldShowStats={shouldShowStats}
      shouldShowSystemBanner={shouldShowSystemBanner}
      stats={stats}
      statsLoading={statsLoading}
      userAuthLoading={userAuthLoading}
      userPanelContextKey={userPanelContextKey}
      userTab={userTab}
      view={view}
    />
  );

}

export default App;
