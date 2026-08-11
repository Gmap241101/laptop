import { useState } from 'react';
import { Button } from './components/CommonUI.jsx';
import useAppContextAssembler from './context/useAppContextAssembler.js';
import AppShell from './shell/AppShell.jsx';
import AppBlockingStateScreen, {
  getAppBlockingState,
} from './shell/AppBlockingStateScreen.jsx';
import useAppInitializationReadinessController from './shell/useAppInitializationReadinessController.js';

import useGlobalUiController, {
  useGlobalUiState,
} from './ui/useGlobalUiController.js';

import { firebaseAuth } from './firebase.js';



import {
  STATUS,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
} from './constants/appConstants.js';


import {
  DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
  DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
  createDefaultRequestForm,
  getRentalStartAdjustmentInfo,
  normalizeHolidayList,
} from './domain/rentalPolicy.js';
import { useDashboardSummary } from './hooks/useDashboardSummary.js';
import useSiteSettingsController from './features/settings/useSiteSettingsController.js';
import { selectAppReadiness } from './selectors/appReadinessSelectors.js';
import useBoardContentSubscriptionController, {
  getSafeFaqPostsPerPage,
  getSafeNoticePostsPerPage,
  useBoardContentSubscriptionState,
} from './features/boards/useBoardContentSubscriptionController.js';
import useBoardDerivedSelectors from './features/boards/useBoardDerivedSelectors.js';
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
import useAssetCatalogViewController from './features/assets/useAssetCatalogViewController.js';
import useAdminSystemSettingsController, {
  useAdminSystemSettingsState,
} from './features/settings/useAdminSystemSettingsController.js';
import useAdminSplitStorageMigrationController, {
  useAdminSplitStorageMigrationState,
} from './features/settings/useAdminSplitStorageMigrationController.js';
import useAdminNavigationController, {
  useAdminNavigationState,
} from './admin/useAdminNavigationController.js';
import useAdminWorkspaceBridgeController from './admin/useAdminWorkspaceBridgeController.js';
import { useDebouncedValue } from './hooks/useDebouncedValue.js';
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
import useSelectedRentalAssetAvailabilityGuard from './features/requests/useSelectedRentalAssetAvailabilityGuard.js';
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


import { getDisplayRentalStatus } from './utils/appUtils.js';


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
  const {
    firebaseLoadErrorMessage,
    firebaseReady,
    setFirebaseLoadErrorMessage,
    setFirebaseReady,
  } = useAppInitializationReadinessController();

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
    setUserAccountStatusView,
    setUserTab,
    setView,
    userAccountStatusView,
    userTab,
    view,
  } = useAppNavigationState();
  const {
    adminAvailabilityFilter,
    adminLaptopQuery,
    adminSelectedAssetCategory,
    assetGridColumns,
    availabilityFilter,
    query,
    selectedAssetCategory,
    setAdminAvailabilityFilter,
    setAdminLaptopQuery,
    setAdminSelectedAssetCategory,
    setAvailabilityFilter,
    setQuery,
    setSelectedAssetCategory,
    setShowUploadPanel,
    showUploadPanel,
  } = useAssetCatalogViewController();
  const {
    adminTab,
    handleMemberDirectoryDeferredStateChange,
    handleSignupPolicyDeferredStateChange,
    memberDirectoryDeferredActionsRef,
    peopleSettingsDirty,
    setAdminTab,
    signupPolicyDeferredActionsRef,
    signupPolicyDirty,
  } = useAdminNavigationState();
  const {
    adminMemberAccountsNavigationRequest,
    adminRequestsMutationVersion,
    adminRequestsNavigationRequest,
    clearAdminRequestPanelSelection,
    getAdminRequestById,
    handleAdminRequestsControllerStateChange,
    notifyAdminRequestMutation,
    resetAdminRequestPanelPage,
    setAdminMemberAccountsNavigationRequest,
    setAdminRequestsNavigationRequest,
    updateAdminRequestPanelRequests,
  } = useAdminWorkspaceBridgeController();
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
  } = useAdminAccountManagementState({ adminTab });
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
    userAuthSessionUid,
    userProfile,
    userProfileReady,
  });

  const orphanedRentalAvailabilityRequests = [];



  const {
    activeFaqCategoryName,
    adminFaqTotalPages,
    adminNoticeTotalPages,
    adminPinnedFaqPosts,
    adminPinnedNoticePosts,
    adminRegularFaqPosts,
    adminRegularNoticePosts,
    categoryFilteredFaqPosts,
    displayedFaqPosts,
    faqCategoryNameById,
    faqTotalPages,
    noticeRegularPostNumberById,
    noticeTotalPages,
    paginatedAdminFaqPosts,
    paginatedAdminNoticePosts,
    paginatedNoticePosts,
    pinnedNoticePosts,
    regularFaqPosts,
    regularNoticePosts,
    safeAdminFaqPage,
    safeAdminNoticePage,
    safeFaqPage,
    safeNoticePage,
    selectedNoticePost,
  } = useBoardDerivedSelectors({
    activeFaqCategoryId,
    adminFaqPage,
    adminNoticePage,
    adminNoticeQuery,
    adminTab,
    faqBoardConfig,
    faqCategories,
    faqPage,
    faqPosts,
    faqQuery,
    faqRegularTotalCount,
    faqSearchWithinCategory,
    noticeBoardConfig,
    noticePage,
    noticePosts,
    noticeRegularTotalCount,
    selectedNoticePostId,
    selectedNoticePostOverride,
    userNoticeQuery,
    view,
  });

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
      setFirebaseAuthUser,
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
      hasEstablishedUserSession,
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
    passwordResetStage,
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
    setFirebaseAuthUser,
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
    setFirebaseAuthUser,
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



  useSelectedRentalAssetAvailabilityGuard({
    selectedLaptop,
    selectedLaptopAvailability,
    requestSubmitLoading,
    selectedLaptopId,
    setSelectedLaptopId,
    triggerToast,
  });

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
    currentUserRentalRestrictionStatus,
    currentUserRestrictionReady,
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
    rentalRequestsReady,
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
  } = useUserRequestHistoryActionController({
    currentUserRentalRestrictionStatus,
    currentUserRestrictionReady,
    currentUserRequests,
    dataSettings: data.settings,
    firebaseAuthUser,
    loadFreshRentalRestrictionStatus,
    rentalRequestsReady,
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


  const {
    goToAppHome,
    handleAdminTabChange,
    openAdminMemberAccounts,
    openAdminRequests,
  } = useAdminNavigationController({
    adminTab,
    assetCategorySettingsDirty,
    cancelTempAssetCategoryChanges,
    discardFaqBoardConfigChanges,
    discardHolidayChanges,
    discardNoticeBoardConfigChanges,
    discardRentalPolicyChanges,
    faqBoardSettingsDirty,
    footerConfig,
    footerConfigDirty,
    goToUserHome,
    holidaySettingsDirty,
    memberDirectoryDeferredActionsRef,
    navigateToAdminHome,
    noticeBoardSettingsDirty,
    peopleSettingsDirty,
    rentalPolicySettingsDirty,
    saveFaqBoardConfig,
    saveFooterConfig,
    saveHolidaySettings,
    saveNoticeBoardConfig,
    saveSystemSettings,
    saveTempAssetCategoryChanges,
    setAdminMemberAccountsNavigationRequest,
    setAdminRequestsNavigationRequest,
    setAdminTab,
    setConfirmModal,
    setFooterConfigDraft,
    signupPolicyDeferredActionsRef,
    signupPolicyDirty,
    view,
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

  const dynamicContextSourceValues = {
    authenticatedAdminAccount, authenticatedAdminId, currentAuthAdminAccount,
    currentAuthRoleErrorMessage, currentAuthRoleReady, data, setData, siteSettings, faqCategories,
    faqPosts, firebaseAuthReady, firebaseAuthUser, getUserRequestActionLabel, goToUserHome,
    goToProtectedUserTab, goToUserLogin, goToUserMypage, handleAdminTabChange,
    openAdminMemberAccounts, isAdminAuthenticated, isCurrentFirebaseAuthGeneralUser,
    isSplitStorageReady, noticePosts, noticePostsLoadErrorMessage, noticePostsReady,
    openNoticePost, triggerConfirm, triggerToast, userActionSaving, userProfile, userProfileReady,
    footerPagesReady, footerPagesLoadErrorMessage, userTab, accountRecoveryForm,
    accountRecoveryLoading, accountRecoveryResult, resetAccountRecoverySearch,
    adminAccountEditForm, adminAccountForm, adminAccountTotalPages, adminAccountUserOptions,
    adminAccountsLoadErrorMessage, adminAuthForm, adminAuthLoading, adminMyProfileForm,
    adminMyProfileSaving, adminTab, authenticateAdmin, cancelEditAdminAccount, cancelWithdrawal,
    cancelUserSignup, deleteAdminAccount, toggleAdminAccountLock, editingAdminAccountId,
    goToUserEmailRecovery, goToUserFaq, goToUserNotice, goToUserPasswordReset, goToUserSignup,
    hasEstablishedUserSession, hasFirebaseAuthSession, isUserDirectoryAccessRestricted,
    logoutAdmin, logoutUser, memberDirectoryAudit, adminMemberAccountsNavigationRequest,
    memberDirectoryPolicyEnabled, memberIdentityClaimsReady, openWithdrawalDialog,
    paginatedAdminAccounts, passwordResetForm, passwordResetLoading,
    passwordResetStage, passwordResetVerificationResult, registerAdminAccount, registeredAdminAccounts,
    safeAdminAccountPage, saveAdminAccountEdit, saveMyAdminProfile, saveMyUserProfile,
    sendAdminAccountPasswordResetEmail, setAccountRecoveryForm, setAdminAccountEditForm,
    setAdminAccountForm, setAdminAccountPage, setAdminAuthForm, setAdminMyProfileForm, setAdminTab,
    updatePasswordResetForm, setUserAuthForm, setUserProfileForm, setView, setWithdrawalPassword,
    shouldShowAdminAccountsErrorPage, shouldShowAdminLoadingPage, shouldShowAdminLoginPage,
    startEditAdminAccount, submitAccountRecovery, submitMembershipWithdrawal, submitPasswordReset,
    submitUserAuthForm, stats, userAccountStatusView, userAuthForm, userAuthLoading,
    userDirectoryVerificationLoading, userProfileForm, userProfileSaving, withdrawalBlockMessage,
    withdrawalDialogOpen, withdrawalLoading, withdrawalPassword, selectedFooterPage,
    addTempAssetCategory, adminAvailabilityFilter, adminFilteredLaptops, adminLaptopQuery,
    adminSelectedAssetCategory, adminUserActionSavingRequestId, applyEditTempAssetCategory,
    availabilityFilter, availableFilterLabel, cancelTempAssetCategoryChanges, createLaptop,
    currentUserRentalRestrictionStatus, currentUserRestrictionReady, currentUserRequests,
    rentalRequestsLoadErrorMessage, rentalRequestsReady, dashboardSummary,
    dashboardSummaryLoadErrorMessage, dashboardSummaryReady, dashboardSummaryRefreshing,
    deleteLaptop, deleteTempAssetCategory, draggingAssetCategoryIndex, editLaptop,
    editLaptopInsertIndex, editingAssetCategoryIndex, editingAssetCategoryName, filteredLaptops,
    form, getUserRequestReviewStatusLabel, handleAddLaptopClick, openAdminRequests,
    isPeriodBasedRentalMode, adminRequestsMutationVersion, adminRequestsNavigationRequest,
    commitAdminRequestEdit, commitAdminRequestStatusRestore, moveTempAssetCategory,
    newAssetCategory, newLaptop, openUserActionDialog, orphanedRentalAvailabilityRequests, query,
    refreshDashboardSummary, renderRequestActionButtons, rentalDeviceSectionDescription,
    rentalDeviceSectionTitle, rentalStartAdjustmentInfo, requestSubmitLoading,
    reviewUserActionRequest, saveLaptop, saveRequestMemo, saveTempAssetCategoryChanges,
    selectedAssetCategory, selectedLaptop, selectedLaptopAvailability, selectedLaptopId,
    setAdminAvailabilityFilter, setAdminLaptopQuery, setAdminSelectedAssetCategory,
    setAvailabilityFilter, setDraggingAssetCategoryIndex, setEditLaptop,
    setEditingAssetCategoryIndex, setEditingAssetCategoryName, setForm, setNewAssetCategory,
    setNewLaptop, setQuery, setSelectedAssetCategory, setSelectedLaptopId, setShowUploadPanel,
    showUploadPanel, splitRentalAssets, startEditTempAssetCategory, submitRequest,
    tempAssetCategories, unavailableFilterLabel, updateRequestMemo, activeFaqCategoryId,
    activeFaqCategoryName, addFaqCategory, adminExpandedFaqPostId, adminFaqTotalPages,
    adminNoticeQuery, adminNoticeTotalPages, adminPinnedFaqPosts, adminPinnedNoticePosts,
    adminRegularFaqPosts, adminRegularNoticePosts, categoryFilteredFaqPosts, closeNoticePost,
    confirmDeleteFaqCategory, confirmDeleteFaqPost, confirmDeleteNoticePost, displayedFaqPosts,
    editingFaqCategoryId, editingFaqCategoryName, expandedFaqPostId,
    faqBoardConfigLoadErrorMessage, faqBoardConfigReady, faqBoardConfigSaving,
    faqCategoriesLoadErrorMessage, faqCategoriesReady, faqCategoryDeletingId, faqCategoryNameById,
    faqCategorySavingId, faqPostDeletingId, faqPostsLoadErrorMessage, faqPostsPerPageInput,
    faqPostsReady, faqQuery, faqSearchWithinCategory, faqTotalPages, newFaqCategoryName,
    noticeBoardConfigLoadErrorMessage, noticeBoardConfigReady, noticeBoardConfigSaving,
    noticePostDeletingId, noticePostsPerPageInput, noticeRegularPostNumberById, noticeTotalPages,
    openFaqPostDialog, openNoticePostDialog, paginatedAdminFaqPosts, paginatedAdminNoticePosts,
    paginatedNoticePosts, pinnedNoticePosts, regularFaqPosts, regularNoticePosts, safeAdminFaqPage,
    safeAdminNoticePage, safeFaqPage, safeNoticePage, saveFaqBoardConfig, saveFaqCategoryName,
    saveNoticeBoardConfig, selectedNoticePost, setActiveFaqCategoryId, setAdminExpandedFaqPostId,
    setAdminFaqPage, setAdminNoticePage, setAdminNoticeQuery, setEditingFaqCategoryId,
    setEditingFaqCategoryName, setExpandedFaqPostId, setFaqPage, setFaqPostsPerPageInput,
    setFaqQuery, setFaqSearchWithinCategory, setNewFaqCategoryName, setNoticePage,
    setUserNoticeQuery, setNoticePostsPerPageInput, startEditFaqCategory, toggleAdminFaqPost,
    toggleFaqPost, userNoticeQuery, addTempHoliday, siteSettingsReady,
    siteSettingsLoadErrorMessage, systemAdminSettings, systemAdminSettingsReady,
    systemAdminSettingsLoadErrorMessage, userSessionPolicy, userSessionPolicyReady,
    userSessionPolicyLoadErrorMessage, deleteTempHoliday, finalizeSplitStorageMigration,
    holidayImportConflictModal, holidayImportLoading, holidayImportYear, holidayManagementMonth,
    holidayManagementView, holidayManagementYear, holidaySettingsDirty,
    importKoreanPublicHolidaysFromJson, applyHolidayImportConflictChoice, newHolidayDate,
    newHolidayName, newHolidayType, saveHolidaySettings, saveSystemSettings,
    setHolidayImportConflictModal, setHolidayImportYear, setHolidayManagementMonth,
    setHolidayManagementView, setHolidayManagementYear, setNewHolidayDate, setNewHolidayName,
    setNewHolidayType, setTempSettings, splitStorageFinalizeLoading,
    tempAllowNonOverlappingSameAssetRequests, tempBusinessDayAdjustmentEnabled, tempHolidayList,
    discardHolidayChanges, tempSettings, updateTempHolidayReason,
    temporarilyDismissedPopupVersions, dismissedPopupSessionVersions, dismissedPopupLocalVersions,
    dismissUserPopup, dismissAllUserPopups, popupPosts, popupPostsReady,
    popupPostsLoadErrorMessage, popupPostDeletingId, popupPostToggleSavingId, openPopupPostDialog,
    togglePopupPostEnabled, movePopupPost, confirmDeletePopupPost, footerConfig, footerConfigDraft,
    footerConfigReady, footerConfigLoadErrorMessage, footerConfigSaving, footerPages,
    footerPageDialog, footerPageForm, footerPageSaving, footerPageDeletingId,
    footerPageToggleSavingId, selectedFooterPageId, setFooterConfigDraft, setFooterPageForm,
    saveFooterConfig, openFooterPageDialog, closeFooterPageDialog, saveFooterPage,
    toggleFooterPageEnabled, moveFooterPage, confirmDeleteFooterPage, openFooterPage,
    activeUserActionRentalRequest, closeFaqPostDialog, closeNoticePostDialog,
    closeUserActionDialog, confirmModal, faqPostDialog, faqPostForm, faqPostSaving,
    noticePostDialog, noticePostForm, noticePostSaving, saveFaqPost, saveNoticePost,
    setConfirmModal, setFaqPostForm, setNoticePostForm, setToast, setUserActionForm,
    submitUserActionRequest, toast, userActionDialog, userActionForm, popupPostDialog,
    popupPostForm, popupPostSaving, closePopupPostDialog, savePopupPost, setPopupPostForm,
    handleMemberDirectoryDeferredStateChange, handleSignupPolicyDeferredStateChange,
    handleAdminRequestsControllerStateChange,
  };

  const {
    adminPanelContextKey,
    contextGroups,
    userPanelContextKey,
  } = useAppContextAssembler({
    adminTab,
    dynamicSourceValues: dynamicContextSourceValues,
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
