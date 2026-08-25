import { useState } from 'react';
import useUserContextAssembler from './user/useUserContextAssembler.js';
import UserShell from './user/UserShell.jsx';
import AppBlockingStateScreen, {
  getAppBlockingState,
} from './shell/AppBlockingStateScreen.jsx';
import useAppInitializationReadinessController from './shell/useAppInitializationReadinessController.js';

import useGlobalUiController, {
  useGlobalUiState,
} from './ui/useGlobalUiController.js';

import { firebaseAuth } from './platform/appDataRefs.js';



import {
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
} from './constants/appConstants.js';


import {
  createDefaultRequestForm,
  getRentalStartAdjustmentInfo,
} from './domain/rentalPolicy.js';
import useSiteSettingsController from './features/settings/useSiteSettingsController.js';
import { selectUserAppReadiness } from './selectors/appReadinessSelectors.js';
import useBoardContentSubscriptionController, {
  useUserBoardContentSubscriptionState,
} from './features/boards/useBoardContentSubscriptionController.js';
import useBoardDerivedSelectors from './features/boards/useBoardDerivedSelectors.js';
import useUserPopupFooterContentSubscriptionController, {
  usePopupFooterContentSubscriptionState,
} from './features/boards/useUserPopupFooterContentSubscriptionController.js';
import { useUserAssetCatalogViewController } from './features/assets/useAssetCatalogViewController.js';
import { useDebouncedValue } from './hooks/useDebouncedValue.js';
import useAppNavigationController, {
  useAppNavigationState,
} from './routing/useAppNavigationController.js';
import useUserAccountRecoveryController from './features/auth/useUserAccountRecoveryController.js';
import useAuthIdentityPolicySubscriptionController, {
  useUserAuthIdentityPolicySubscriptionState,
} from './features/auth/useAuthIdentityPolicySubscriptionController.js';
import useUserLoginController, {
  useUserAuthState,
} from './features/auth/useUserLoginController.js';
import useUserSignupController from './features/auth/useUserSignupController.js';
import {
  clearAdminAuthSession,
  configureFirebaseAuthPersistence,
} from './features/auth/authSessionService.js';
import useUserAuthenticationSessionController, {
  useUserAuthenticationSessionState,
} from './features/auth/useUserAuthenticationSessionController.js';
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
import {
  createFreshRentalRestrictionStatusLoader,
} from './features/requests/rentalRestrictionService.js';
import useRentalDataSubscriptionController, {
  useOwnRentalRequestsSubscriptionController,
  useRentalDataSubscriptionState,
} from './features/requests/useRentalDataSubscriptionController.js';
import { useUserRentalDerivedSelectors } from './features/requests/useRentalDerivedSelectors.js';
import {
  initialData,
  mergePersistedData,
} from './services/appDataCompatibilityService.js';



const USER_SURFACE_NOOP = () => {};

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
    return '비밀번호가 현재 인증 정책을 충족하지 않습니다. 대문자, 숫자, 특수문자 등 설정된 정책을 확인해 주세요.';
  }

  if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }

  if (errorCode === 'auth/invalid-credential') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }

  if (errorCode === 'auth/operation-not-allowed') {
    return '현재 인증 서비스에서 이메일/비밀번호 로그인이 허용되지 않습니다. Clerk 인증 설정을 확인해 주세요.';
  }

  if (errorCode === 'auth/network-request-failed') {
    return '인증 서버에 연결하지 못했습니다. 네트워크 상태와 Clerk 설정을 확인해 주세요.';
  }

  if (errorCode === 'auth/unauthorized-domain') {
    return '현재 접속한 도메인이 인증 허용 범위에 포함되어 있지 않습니다. Clerk Authorized Parties/도메인 설정을 확인해 주세요.';
  }

  if (errorCode === 'auth/too-many-requests') {
    return '로그인 또는 가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (errorCode === 'auth/requires-recent-login') {
    return '보안상 최근 로그인한 사용자만 비밀번호를 변경할 수 있습니다. 로그아웃 후 다시 로그인한 다음 비밀번호 변경을 시도해 주세요.';
  }

  if (errorCode === 'member/directory-status-sync-permission-denied') {
    return '회원가입 명부 정책 변경에 따른 회원 상태 동기화 권한이 거부되었습니다. PostgreSQL 회원 정책과 Clerk 세션을 확인한 뒤 다시 로그인해 주세요.';
  }

  if (errorCode === 'permission-denied') {
    return '회원 정보 또는 로그인 역할 확인 권한이 거부되었습니다. PostgreSQL 회원 상태와 Clerk 세션 권한을 확인해 주세요.';
  }

  if (errorCode === 'unavailable') {
    return 'PostgreSQL API에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }

  return `사용자 인증 처리 중 오류가 발생했습니다. 오류 코드: ${errorCode || 'unknown'} ${errorMessage ? ` / ${errorMessage}` : ''}`;
};

function UserApp({ runtimeSurface = 'user' }) {
  const [data, setData] = useState(initialData);
  const {
    normalizedSiteSettings,
    siteSettings,
    siteSettingsLoadErrorMessage,
    siteSettingsReady,
  } = useSiteSettingsController();
  const {
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    currentUserRestriction,
    currentUserRestrictionReady,
    firebaseAuthReady,
    firebaseAuthUser,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setCurrentUserRestriction,
    setCurrentUserRestrictionReady,
    setFirebaseAuthReady,
    setFirebaseAuthUser,
    setUserProfile,
    setUserProfileReady,
    setUserSessionPolicy,
    setUserSessionPolicyLoadErrorMessage,
    setUserSessionPolicyReady,
    userProfile,
    userProfileReady,
    userSessionPolicy,
    userSessionPolicyLoadErrorMessage,
    userSessionPolicyReady,
  } = useUserAuthIdentityPolicySubscriptionState();
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
    activeFaqCategoryId,
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
  } = useUserBoardContentSubscriptionState();



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
    availabilityFilter,
    query,
    selectedAssetCategory,
    setAvailabilityFilter,
    setQuery,
    setSelectedAssetCategory,
  } = useUserAssetCatalogViewController();
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
  const debouncedFaqQuery = useDebouncedValue(faqQuery);

  const {
    dismissSystemBanner,
    shouldRenderAppDialogs,
    shouldShowSystemBanner,
    triggerConfirm,
    triggerToast,
  } = useGlobalUiController({
    appDialogsActivated,
    confirmModal,
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
    runtimeSurface,
    authenticatedAdminId: '',
    clearAdminAuthenticatedSession: clearAdminAuthSession,
    clearUserAuthenticatedSession,
    currentAuthAdminAccount: null,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    setAdminAccounts: USER_SURFACE_NOOP,
    setAdminAccountsLoadErrorMessage: USER_SURFACE_NOOP,
    setAdminAccountsReady: USER_SURFACE_NOOP,
    setAdminAccountsRemoteHasData: USER_SURFACE_NOOP,
    setCurrentAuthAdminAccount: USER_SURFACE_NOOP,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setCurrentUserRestriction,
    setCurrentUserRestrictionReady,
    setFirebaseAuthReady,
    setFirebaseAuthUser,
    setSystemAdminSettings: USER_SURFACE_NOOP,
    setSystemAdminSettingsLoadErrorMessage: USER_SURFACE_NOOP,
    setSystemAdminSettingsReady: USER_SURFACE_NOOP,
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

  const {
    hasFirebaseAuthSession,
    isCurrentFirebaseAuthGeneralUser,
    isSplitStorageReady,
    isUserDirectoryAccessRestricted,
  } = selectUserAppReadiness({
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    dataSettings: data.settings,
    firebaseAuthCurrentUser: firebaseAuth.currentUser,
    firebaseAuthUser,
    splitPublicConfig,
    splitStorageVersion,
    userProfile,
  });

  const {
    goToProtectedUserTab,
    goToUserFaq,
    goToUserHome,
    goToUserInquiry,
    goToUserMypage,
    goToUserNotice,
    navigateToAdminHome,
    navigateToUserReturnTarget,
    openFooterPage,
    saveCurrentUserLoginReturnTarget,
    showUserAccountStatus,
  } = useAppNavigationController({
    runtimeSurface,
    adminLogoutInProgress: false,
    communityMenuRef,
    currentAuthAdminAccount: null,
    currentAuthRoleReady,
    dataSettings: data.settings,
    firebaseAuthReady,
    footerPages,
    footerPagesReady,
    hasFirebaseAuthSession,
    isAdminAuthenticated: false,
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
    adminTab: 'dashboard',
    authenticatedAdminId: '',
    createDefaultRequestForm,
    currentAuthAdminAccount: null,
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
    setTempSettings: USER_SURFACE_NOOP,
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
    isAdminAuthenticated: false,
    setRentalRequests,
    setRentalRequestsLoadErrorMessage,
    setRentalRequestsReady,
    triggerToast,
    userAuthSessionUid,
    userProfile,
    userProfileReady,
  });


  const {
    activeFaqCategoryName,
    categoryFilteredFaqPosts,
    displayedFaqPosts,
    faqCategoryNameById,
    faqTotalPages,
    noticeRegularPostNumberById,
    noticeTotalPages,
    paginatedNoticePosts,
    pinnedNoticePosts,
    regularFaqPosts,
    regularNoticePosts,
    safeFaqPage,
    safeNoticePage,
    selectedNoticePost,
  } = useBoardDerivedSelectors({
    activeFaqCategoryId,
    adminFaqPage: 1,
    adminNoticePage: 1,
    adminNoticeQuery: '',
    adminTab: 'dashboard',
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
    availableFilterLabel,
    currentUserRentalRestrictionStatus,
    currentUserRequests,
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
  } = useUserRentalDerivedSelectors({
    availabilityFilter,
    currentUserRestriction,
    dataBorrowers: data.borrowers,
    dataLaptops: data.laptops,
    dataRequests: data.requests,
    dataSettings: data.settings,
    firebaseAuthUser,
    form,
    query,
    rentalRequests,
    selectedAssetCategory,
    selectedLaptopId,
    userProfile,
    userTab,
  });

  const { closeNoticePost, openNoticePost } =
    useBoardContentSubscriptionController({
      activeFaqCategoryId,
      adminFaqPage: 1,
      adminNoticePage: 1,
      adminTab: 'dashboard',
      debouncedAdminNoticeQuery: '',
      debouncedFaqQuery,
      debouncedUserNoticeQuery,
      faqBoardConfig,
      faqCategories,
      faqCursorByPageRef,
      faqCursorKeyRef,
      faqPage,
      faqSearchWithinCategory,
      isAdminAuthenticated: false,
      noticeBoardConfig,
      noticeCursorByPageRef,
      noticeCursorKeyRef,
      noticePage,
      noticePosts,
      selectedNoticePostId,
      selectedNoticePostOverride,
      setActiveFaqCategoryId,
      setAdminFaqPage: USER_SURFACE_NOOP,
      setAdminNoticePage: USER_SURFACE_NOOP,
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
      setFaqPostsPerPageInput: USER_SURFACE_NOOP,
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
      setNoticePostsPerPageInput: USER_SURFACE_NOOP,
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
  } = useUserPopupFooterContentSubscriptionController({
    dismissedPopupLocalVersions,
    dismissedPopupSessionVersions,
    firebaseAuthUser,
    footerPages,
    selectedFooterPageId,
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
    userTab,
    view,
  });

  const { hasEstablishedUserSession } =
    useUserAuthenticationSessionController({
      runtimeSurface,
      authenticatedAdminId: '',
      clearUserAuthenticatedSession,
      currentAuthAdminAccount: null,
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
      runtimeSurface,
      authenticatedAdminId: '',
      clearAdminAuthenticatedSession: clearAdminAuthSession,
      clearUserAuthenticatedSession,
      createMemberPolicyError,
      currentAuthAdminAccount: null,
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
    clearAdminAuthenticatedSession: clearAdminAuthSession,
    createMemberPolicyError,
    currentAuthAdminAccount: null,
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
    clearAdminAuthenticatedSession: clearAdminAuthSession,
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
    clearAdminAuthenticatedSession: clearAdminAuthSession,
    clearUserAuthenticatedSession,
    configureFirebaseAuthPersistence,
    createMemberPolicyError,
    dataSettings: data.settings,
    dataTeams: data.teams,
    firebaseAuthReady,
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

  useSelectedRentalAssetAvailabilityGuard({
    selectedLaptop,
    selectedLaptopAvailability,
    requestSubmitLoading,
    selectedLaptopId,
    setSelectedLaptopId,
    triggerToast,
  });

  const rentalStartAdjustmentInfo = getRentalStartAdjustmentInfo(data.settings);

  const loadFreshRentalRestrictionStatus =
    createFreshRentalRestrictionStatusLoader({
      fallbackSettings: data.settings,
    });

  const { submitRequest } = useUserRentalRequestController({
    currentAuthAdminAccount: null,
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
    isAdminAuthenticated: false,
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

  const toggleFaqPost = (postId) => {
    setExpandedFaqPostId((currentPostId) =>
      currentPostId === postId ? '' : postId
    );
  };

  const dynamicContextSourceValues = {
    accountRecoveryForm,
    accountRecoveryLoading,
    accountRecoveryResult,
    activeFaqCategoryId,
    activeFaqCategoryName,
    activeUserActionRentalRequest,
    availabilityFilter,
    availableFilterLabel,
    cancelUserSignup,
    cancelWithdrawal,
    categoryFilteredFaqPosts,
    closeNoticePost,
    closeUserActionDialog,
    confirmModal,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    currentUserRentalRestrictionStatus,
    currentUserRequests,
    currentUserRestrictionReady,
    data,
    dismissAllUserPopups,
    dismissedPopupLocalVersions,
    dismissedPopupSessionVersions,
    dismissUserPopup,
    displayedFaqPosts,
    expandedFaqPostId,
    faqCategories,
    faqCategoriesLoadErrorMessage,
    faqCategoriesReady,
    faqCategoryNameById,
    faqPostsLoadErrorMessage,
    faqPostsReady,
    faqQuery,
    faqSearchWithinCategory,
    faqTotalPages,
    filteredLaptops,
    firebaseAuthReady,
    firebaseAuthUser,
    footerConfig,
    footerPages,
    footerPagesLoadErrorMessage,
    footerPagesReady,
    form,
    getUserRequestActionLabel,
    getUserRequestReviewStatusLabel,
    goToProtectedUserTab,
    goToUserEmailRecovery,
    goToUserFaq,
    goToUserHome,
    goToUserInquiry,
    goToUserLogin,
    goToUserMypage,
    goToUserNotice,
    goToUserPasswordReset,
    goToUserSignup,
    hasEstablishedUserSession,
    hasFirebaseAuthSession,
    isCurrentFirebaseAuthGeneralUser,
    isPeriodBasedRentalMode,
    isUserDirectoryAccessRestricted,
    logoutUser,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsReady,
    noticeRegularPostNumberById,
    noticeTotalPages,
    openFooterPage,
    openNoticePost,
    openUserActionDialog,
    openWithdrawalDialog,
    paginatedNoticePosts,
    passwordResetForm,
    passwordResetLoading,
    passwordResetStage,
    passwordResetVerificationResult,
    pinnedNoticePosts,
    popupPosts,
    query,
    regularFaqPosts,
    regularNoticePosts,
    rentalDeviceSectionDescription,
    rentalDeviceSectionTitle,
    rentalRequestsLoadErrorMessage,
    rentalRequestsReady,
    rentalStartAdjustmentInfo,
    requestSubmitLoading,
    resetAccountRecoverySearch,
    safeFaqPage,
    safeNoticePage,
    saveMyUserProfile,
    selectedAssetCategory,
    selectedFooterPage,
    selectedFooterPageId,
    selectedLaptop,
    selectedLaptopAvailability,
    selectedLaptopId,
    selectedNoticePost,
    setAccountRecoveryForm,
    setActiveFaqCategoryId,
    setAvailabilityFilter,
    setConfirmModal,
    setExpandedFaqPostId,
    setFaqPage,
    setFaqQuery,
    setFaqSearchWithinCategory,
    setForm,
    setNoticePage,
    setQuery,
    setSelectedAssetCategory,
    setSelectedLaptopId,
    setToast,
    setUserActionForm,
    setUserAuthForm,
    setUserNoticeQuery,
    setUserProfileForm,
    setWithdrawalPassword,
    siteSettings,
    stats,
    submitAccountRecovery,
    submitMembershipWithdrawal,
    submitPasswordReset,
    submitRequest,
    submitUserActionRequest,
    submitUserAuthForm,
    temporarilyDismissedPopupVersions,
    toast,
    toggleFaqPost,
    triggerToast,
    unavailableFilterLabel,
    updatePasswordResetForm,
    userAccountStatusView,
    userActionDialog,
    userActionForm,
    userActionSaving,
    userAuthForm,
    userAuthLoading,
    userDirectoryVerificationLoading,
    userNoticeQuery,
    userProfile,
    userProfileForm,
    userProfileReady,
    userProfileSaving,
    userTab,
    withdrawalBlockMessage,
    withdrawalDialogOpen,
    withdrawalLoading,
    withdrawalPassword,
  };

  const { contextGroups, userPanelContextKey } = useUserContextAssembler({
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
    <UserShell
      communityMenuRef={communityMenuRef}
      contextGroups={contextGroups}
      currentAuthRoleErrorMessage={currentAuthRoleErrorMessage}
      dismissSystemBanner={dismissSystemBanner}
      firebaseAuthReady={firebaseAuthReady}
      firebaseAuthUser={firebaseAuthUser}
      firebaseReady={firebaseReady}
      goToAppHome={goToUserHome}
      goToProtectedUserTab={goToProtectedUserTab}
      goToUserFaq={goToUserFaq}
      goToUserInquiry={goToUserInquiry}
      goToUserLogin={goToUserLogin}
      goToUserMypage={goToUserMypage}
      goToUserNotice={goToUserNotice}
      goToUserSignup={goToUserSignup}
      isCommunityMenuOpen={isCommunityMenuOpen}
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

export default UserApp;
