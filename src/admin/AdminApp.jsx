import { useCallback, useState } from 'react';

import { Button } from '../components/CommonUI.jsx';
import useAdminContextAssembler from './useAdminContextAssembler.js';
import AdminShell from './AdminShell.jsx';
import AppBlockingStateScreen, {
  getAppBlockingState,
} from '../shell/AppBlockingStateScreen.jsx';
import useAppInitializationReadinessController from '../shell/useAppInitializationReadinessController.js';

import {
  STATUS,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
} from '../constants/appConstants.js';
import {
  DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY,
  DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS,
  createDefaultRequestForm,
  getRentalStartAdjustmentInfo,
  normalizeHolidayList,
} from '../domain/rentalPolicy.js';
import { useDashboardSummary } from '../hooks/useDashboardSummary.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import useSiteSettingsController from '../features/settings/useSiteSettingsController.js';
import useAdminPublicContentSynchronizationController from '../features/content/useAdminPublicContentSynchronizationController.js';
import { selectAppReadiness } from '../selectors/appReadinessSelectors.js';
import useBoardContentSubscriptionController, {
  getSafeFaqPostsPerPage,
  getSafeNoticePostsPerPage,
  useBoardContentSubscriptionState,
} from '../features/boards/useBoardContentSubscriptionController.js';
import useBoardDerivedSelectors from '../features/boards/useBoardDerivedSelectors.js';
import useAdminBoardPostController, {
  useFaqPostAdminState,
  useNoticePostAdminState,
} from '../features/boards/useAdminBoardPostController.js';
import useAdminBoardSettingsController, {
  useAdminBoardSettingsState,
} from '../features/boards/useAdminBoardSettingsController.js';
import useAdminPopupPostController, {
  useAdminPopupPostState,
} from '../features/boards/useAdminPopupPostController.js';
import useAdminFooterContentController, {
  sanitizeFooterCommonHtml,
  useAdminFooterContentState,
} from '../features/boards/useAdminFooterContentController.js';
import usePopupFooterContentSubscriptionController, {
  usePopupFooterContentSubscriptionState,
} from '../features/boards/usePopupFooterContentSubscriptionController.js';
import useAdminAssetCrudController, {
  useAdminAssetCrudState,
} from '../features/assets/useAdminAssetCrudController.js';
import useAdminAssetCategoryController, {
  useAdminAssetCategoryState,
} from '../features/assets/useAdminAssetCategoryController.js';
import usePublicAssetCatalogCompatibilityController from '../features/assets/usePublicAssetCatalogCompatibilityController.js';
import useAssetCatalogViewController from '../features/assets/useAssetCatalogViewController.js';
import useAdminSystemSettingsController, {
  useAdminSystemSettingsState,
} from '../features/settings/useAdminSystemSettingsController.js';
import useAdminSplitStorageMigrationController, {
  useAdminSplitStorageMigrationState,
} from '../features/settings/useAdminSplitStorageMigrationController.js';
import useAdminNavigationController, {
  useAdminNavigationState,
} from './useAdminNavigationController.js';
import useAdminWorkspaceBridgeController from './useAdminWorkspaceBridgeController.js';
import useAdminIdentityPolicyController, {
  normalizeAdminAccounts,
  useAdminIdentityPolicyState,
} from '../features/auth/useAdminIdentityPolicyController.js';
import useAdminAuthenticationController, {
  useAdminAuthenticationState,
} from '../features/auth/useAdminAuthenticationController.js';
import {
  clearUserAuthSession,
  clearUserAuthTransition,
} from '../features/auth/authSessionService.js';
import useAdminAccountManagementController, {
  useAdminAccountManagementState,
} from '../features/auth/useAdminAccountManagementController.js';
import useAdminRequestMutationController from '../features/requests/useAdminRequestMutationController.js';
import useAdminUserActionReviewController, {
  useAdminUserActionReviewState,
} from '../features/requests/useAdminUserActionReviewController.js';
import useRentalDataSubscriptionController, {
  useRentalDataSubscriptionState,
} from '../features/requests/useRentalDataSubscriptionController.js';
import useRentalDerivedSelectors from '../features/requests/useRentalDerivedSelectors.js';
import {
  initialData,
  mergePersistedData,
} from '../services/appDataCompatibilityService.js';
import {
  createCurrentAdminAuditActorResolver,
} from '../features/auth/adminAuditActorService.js';
import { firebaseAuth } from '../platform/appDataRefs.js';
import { navigateToUserAppSurface } from '../routing/appRoutes.js';
import { getDisplayRentalStatus } from '../utils/appUtils.js';

const ADMIN_RUNTIME_SURFACE = 'admin';
const ADMIN_VIEW = 'admin';
const INERT_USER_TAB = 'home';
const noop = () => {};

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

const getAdminAuthErrorMessage = (error) => {
  const errorCode = error?.code || '';
  const errorMessage = error?.message || '';

  if (error?.message === 'admin-auth-uid-mismatch') {
    return 'Clerk 계정과 PostgreSQL 관리자 등록 정보가 일치하지 않습니다. 관리자 계정 관리 정보를 확인해 주세요.';
  }
  if (errorCode === 'auth/email-already-in-use') {
    return '이미 Clerk에 등록된 이메일입니다. 다른 이메일을 사용하거나 기존 관리자 계정 연결 상태를 확인해 주세요.';
  }
  if (errorCode === 'auth/operation-not-allowed') {
    return 'Clerk에서 이메일/비밀번호 인증이 사용 가능하도록 설정되어 있는지 확인해 주세요.';
  }
  if (errorCode === 'auth/invalid-email') {
    return '관리자 로그인 이메일 형식이 올바르지 않습니다.';
  }
  if (errorCode === 'auth/weak-password') {
    return '관리자 초기 비밀번호는 6자 이상으로 입력해 주세요.';
  }
  if (errorCode === 'auth/password-does-not-meet-requirements') {
    return '관리자 비밀번호가 현재 Clerk 인증 정책을 충족하지 않습니다.';
  }
  if (
    errorCode === 'auth/user-not-found' ||
    errorCode === 'auth/wrong-password' ||
    errorCode === 'auth/invalid-credential'
  ) {
    return '관리자 로그인 이메일 또는 비밀번호가 일치하지 않습니다.';
  }
  if (errorCode === 'auth/network-request-failed') {
    return '인증 서버에 연결하지 못했습니다. 네트워크 상태와 Clerk 설정을 확인해 주세요.';
  }
  if (errorCode === 'auth/unauthorized-domain') {
    return '현재 접속한 도메인이 Clerk의 허용 도메인/Authorized Parties 설정에 포함되어 있지 않습니다.';
  }
  if (errorCode === 'auth/too-many-requests') {
    return '로그인 또는 가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (errorCode === 'auth/requires-recent-login') {
    return '보안상 최근 로그인한 관리자만 비밀번호를 변경할 수 있습니다. 로그아웃 후 다시 로그인한 다음 비밀번호 변경을 시도해 주세요.';
  }
  if (errorCode === 'permission-denied') {
    return '관리자 계정 조회 또는 저장 권한이 거부되었습니다. PostgreSQL 관리자 레지스트리와 Clerk 권한을 확인해 주세요.';
  }

  return `관리자 인증 처리 중 오류가 발생했습니다. 오류 코드: ${
    errorCode || 'unknown'
  }${errorMessage ? ` / ${errorMessage}` : ''}`;
};

export default function AdminApp() {
  const [data, setData] = useState(initialData);
  const [selectedLaptopId, setSelectedLaptopId] = useState('');
  const [form, setForm] = useState(() => createDefaultRequestForm(initialData.settings));
  const [selectedFooterPageId, setSelectedFooterPageId] = useState('');
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const triggerToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }, []);
  const triggerConfirm = useCallback((title, message, onConfirm) => {
    setConfirmModal({ title, message, onConfirm });
  }, []);
  const clearUserAuthenticatedSession = useCallback(
    (reason = 'admin-surface-switch', { clearTransition = false } = {}) => {
      clearUserAuthSession(reason);
      if (clearTransition) clearUserAuthTransition(reason);
    },
    []
  );
  const goToUserHome = useCallback(() => {
    navigateToUserAppSurface('home');
  }, []);
  const goToUserMypage = useCallback(() => {
    navigateToUserAppSurface('mypage');
  }, []);
  const navigateToAdminHome = useCallback(() => {
    if (typeof window !== 'undefined' && window.location.pathname !== '/admin') {
      window.history.replaceState(null, '', '/admin');
    }
  }, []);

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
    firebaseAuthReady,
    firebaseAuthUser,
    setAdminAccounts,
    setAdminAccountsLoadErrorMessage,
    setAdminAccountsReady,
    setAdminAccountsRemoteHasData,
    setCurrentAuthAdminAccount,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setFirebaseAuthReady,
    setFirebaseAuthUser,
    setSystemAdminSettings,
    setSystemAdminSettingsLoadErrorMessage,
    setSystemAdminSettingsReady,
    setUserSessionPolicy,
    setUserSessionPolicyLoadErrorMessage,
    setUserSessionPolicyReady,
    systemAdminSettings,
    systemAdminSettingsLoadErrorMessage,
    systemAdminSettingsReady,
    userSessionPolicy,
    userSessionPolicyLoadErrorMessage,
    userSessionPolicyReady,
  } = useAdminIdentityPolicyState();
  const {
    firebaseLoadErrorMessage,
    firebaseReady,
    setFirebaseLoadErrorMessage,
    setFirebaseReady,
  } = useAppInitializationReadinessController();
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
    setPublicCatalogAssets,
    setPublicCatalogAssetsReady,
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
    adminAvailabilityFilter,
    adminLaptopQuery,
    adminSelectedAssetCategory,
    assetGridColumns,
    setAdminAvailabilityFilter,
    setAdminLaptopQuery,
    setAdminSelectedAssetCategory,
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
    rebaseAdminAuthenticatedSession,
    setAdminAuthenticatedSession,
    setAdminAuthAbsoluteExpiresAt,
    setAdminAuthExpiresAt,
    setAdminAuthForm,
    setAdminAuthLoading,
    setAdminAuthPolicyVersion,
    setAdminLogoutInProgress,
  } = useAdminAuthenticationState({
    systemAdminSettings,
    runtimeSurface: ADMIN_RUNTIME_SURFACE,
  });
  const debouncedAdminNoticeQuery = useDebouncedValue(adminNoticeQuery);
  const debouncedFaqQuery = useDebouncedValue(faqQuery);
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
    publicConfig: splitPublicConfig,
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

  useAdminIdentityPolicyController({
    authenticatedAdminId,
    clearAdminAuthenticatedSession,
    currentAuthAdminAccount,
    setAdminAccounts,
    setAdminAccountsLoadErrorMessage,
    setAdminAccountsReady,
    setAdminAccountsRemoteHasData,
    setCurrentAuthAdminAccount,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setFirebaseAuthReady,
    setFirebaseAuthUser,
    setSystemAdminSettings,
    setSystemAdminSettingsLoadErrorMessage,
    setSystemAdminSettingsReady,
    setUserSessionPolicy,
    setUserSessionPolicyLoadErrorMessage,
    setUserSessionPolicyReady,
  });

  const {
    authenticateAdmin,
    authenticatedAdminAccount,
    isAdminAuthenticated,
    logoutAdmin,
  } = useAdminAuthenticationController({
    runtimeSurface: ADMIN_RUNTIME_SURFACE,
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
    clearUserAuthenticatedSession,
    currentAuthAdminAccount,
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    firebaseReady,
    getAdminAuthErrorMessage,
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
    setIsCommunityMenuOpen: noop,
    setSelectedFooterPageId,
    setSelectedNoticePostId,
    setUserTab: noop,
    setView: noop,
    setAdminTab,
    systemAdminSettings,
    systemAdminSettingsReady,
    triggerToast,
    userTab: INERT_USER_TAB,
    view: ADMIN_VIEW,
  });

  useAdminPublicContentSynchronizationController({
    firebaseAuthUser,
    isAdminAuthenticated,
    triggerToast,
    view: ADMIN_VIEW,
  });

  const {
    hasAdminAccess,
    isSplitStorageReady,
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
    userProfile: null,
    view: ADMIN_VIEW,
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
    view: ADMIN_VIEW,
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
    userTab: INERT_USER_TAB,
    view: ADMIN_VIEW,
  });

  const assetCategoryCatalogReady = Boolean(
    publicCatalogAssetsReady &&
    Array.isArray(splitPublicConfig?.assetCategories) &&
    JSON.stringify(data.assetCategories || []) === JSON.stringify(splitPublicConfig.assetCategories || [])
  );


  const orphanedRentalAvailabilityRequests = [];
  const {
    adminFaqTotalPages,
    adminNoticeTotalPages,
    adminPinnedFaqPosts,
    adminPinnedNoticePosts,
    adminRegularFaqPosts,
    adminRegularNoticePosts,
    faqCategoryNameById,
    noticeRegularPostNumberById,
    paginatedAdminFaqPosts,
    paginatedAdminNoticePosts,
    safeAdminFaqPage,
    safeAdminNoticePage,
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
    userNoticeQuery: '',
    view: ADMIN_VIEW,
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
    editLaptopInsertIndex,
    shouldShowStats,
    stats,
    statsLoading,
  } = useRentalDerivedSelectors({
    adminAvailabilityFilter,
    adminLaptopQuery,
    adminSelectedAssetCategory,
    adminTab,
    assetGridColumns,
    availabilityFilter: '전체',
    currentUserRestriction: null,
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
    query: '',
    rentalRequests: [],
    selectedAssetCategory: '전체',
    selectedLaptopId,
    userProfile: null,
    userTab: INERT_USER_TAB,
    view: ADMIN_VIEW,
  });
  const rentalStartAdjustmentInfo = getRentalStartAdjustmentInfo(data.settings);

  useBoardContentSubscriptionController({
    activeFaqCategoryId,
    adminFaqPage,
    adminNoticePage,
    adminTab,
    debouncedAdminNoticeQuery,
    debouncedFaqQuery,
    debouncedUserNoticeQuery: '',
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
    userTab: INERT_USER_TAB,
    view: ADMIN_VIEW,
  });

  usePopupFooterContentSubscriptionController({
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
    userTab: INERT_USER_TAB,
    view: ADMIN_VIEW,
  });

  const {
    adminAccountTotalPages,
    adminAccountUserOptions,
    cancelEditAdminAccount,
    changeAdminAccountPassword,
    deleteAdminAccount,
    paginatedAdminAccounts,
    registerAdminAccount,
    safeAdminAccountPage,
    saveAdminAccountEdit,
    saveMyAdminProfile,
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
    getAdminAuthErrorMessage,
    registeredAdminAccounts: adminAccounts || [],
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
  const registeredAdminAccounts = adminAccounts || [];

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
    setSelectedAssetCategory: noop,
    setTempAssetCategories,
    setTempAssetCategoryRenameMap,
    tempAssetCategories,
    tempAssetCategoryRenameMap,
    triggerToast,
  });

  const getCurrentAdminAuditActor = createCurrentAdminAuditActorResolver({
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
    view: ADMIN_VIEW,
  });

  const toggleAdminFaqPost = (postId) => {
    setAdminExpandedFaqPostId((currentPostId) =>
      currentPostId === postId ? '' : postId
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

  const { reviewUserActionRequest } = useAdminUserActionReviewController({
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

  const tempBusinessDayAdjustmentEnabled =
    tempSettings.adjustStartDateToNextBusinessDay ??
    tempSettings.adjustStartDateAfterWorkEnd ??
    DEFAULT_ADJUST_START_DATE_TO_NEXT_BUSINESS_DAY;
  const tempHolidayList = normalizeHolidayList(tempSettings.holidays);
  const tempAllowNonOverlappingSameAssetRequests =
    tempSettings.allowNonOverlappingSameAssetRequests ??
    DEFAULT_ALLOW_NON_OVERLAPPING_SAME_ASSET_REQUESTS;

  const shouldRenderAdminDialogs = Boolean(
    popupPostDialog ||
      faqPostDialog ||
      noticePostDialog ||
      confirmModal ||
      toast
  );

  const dynamicContextSourceValues = {
    authenticatedAdminAccount,
    authenticatedAdminId,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    data,
    setData,
    siteSettings,
    faqCategories,
    faqPosts,
    firebaseAuthReady,
    firebaseAuthUser,
    getUserRequestActionLabel,
    goToUserHome,
    handleAdminTabChange,
    openAdminMemberAccounts,
    isAdminAuthenticated,
    isSplitStorageReady,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsReady,
    triggerConfirm,
    triggerToast,
    adminAccountEditForm,
    adminAccountForm,
    adminAccountTotalPages,
    adminAccountUserOptions,
    adminAccountsLoadErrorMessage,
    adminAuthForm,
    adminAuthLoading,
    adminMyProfileForm,
    adminMyProfileSaving,
    adminTab,
    authenticateAdmin,
    cancelEditAdminAccount,
    changeAdminAccountPassword,
    deleteAdminAccount,
    toggleAdminAccountLock,
    editingAdminAccountId,
    logoutAdmin,
    memberDirectoryAudit,
    adminMemberAccountsNavigationRequest,
    memberDirectoryPolicyEnabled,
    memberIdentityClaimsReady,
    paginatedAdminAccounts,
    registerAdminAccount,
    registeredAdminAccounts,
    safeAdminAccountPage,
    saveAdminAccountEdit,
    saveMyAdminProfile,
    setAdminAccountEditForm,
    setAdminAccountForm,
    setAdminAccountPage,
    setAdminAuthForm,
    setAdminMyProfileForm,
    setAdminTab,
    shouldShowAdminAccountsErrorPage,
    shouldShowAdminLoadingPage,
    shouldShowAdminLoginPage,
    startEditAdminAccount,
    stats,
    addTempAssetCategory,
    assetCategoryCatalogReady,
    adminAvailabilityFilter,
    adminFilteredLaptops,
    adminLaptopQuery,
    adminSelectedAssetCategory,
    adminUserActionSavingRequestId,
    applyEditTempAssetCategory,
    cancelTempAssetCategoryChanges,
    createLaptop,
    dashboardSummary,
    dashboardSummaryLoadErrorMessage,
    dashboardSummaryReady,
    dashboardSummaryRefreshing,
    deleteLaptop,
    deleteTempAssetCategory,
    draggingAssetCategoryIndex,
    editLaptop,
    editLaptopInsertIndex,
    editingAssetCategoryIndex,
    editingAssetCategoryName,
    getUserRequestReviewStatusLabel,
    handleAddLaptopClick,
    openAdminRequests,
    adminRequestsMutationVersion,
    adminRequestsNavigationRequest,
    commitAdminRequestEdit,
    commitAdminRequestStatusRestore,
    moveTempAssetCategory,
    newAssetCategory,
    newLaptop,
    orphanedRentalAvailabilityRequests,
    refreshDashboardSummary,
    renderRequestActionButtons,
    rentalStartAdjustmentInfo,
    reviewUserActionRequest,
    saveLaptop,
    saveRequestMemo,
    saveTempAssetCategoryChanges,
    selectedLaptopId,
    setAdminAvailabilityFilter,
    setAdminLaptopQuery,
    setAdminSelectedAssetCategory,
    setDraggingAssetCategoryIndex,
    setEditLaptop,
    setEditingAssetCategoryIndex,
    setEditingAssetCategoryName,
    setNewAssetCategory,
    setNewLaptop,
    setShowUploadPanel,
    showUploadPanel,
    splitRentalAssets,
    startEditTempAssetCategory,
    tempAssetCategories,
    updateRequestMemo,
    activeFaqCategoryId,
    addFaqCategory,
    adminExpandedFaqPostId,
    adminFaqTotalPages,
    adminNoticeQuery,
    adminNoticeTotalPages,
    adminPinnedFaqPosts,
    adminPinnedNoticePosts,
    adminRegularFaqPosts,
    adminRegularNoticePosts,
    confirmDeleteFaqCategory,
    confirmDeleteFaqPost,
    confirmDeleteNoticePost,
    discardFaqBoardConfigChanges,
    discardNoticeBoardConfigChanges,
    editingFaqCategoryId,
    editingFaqCategoryName,
    faqBoardConfigLoadErrorMessage,
    faqBoardConfigReady,
    faqBoardConfigSaving,
    faqCategoriesLoadErrorMessage,
    faqCategoriesReady,
    faqCategoryDeletingId,
    faqCategoryNameById,
    faqCategorySavingId,
    faqPostDeletingId,
    faqPostsLoadErrorMessage,
    faqPostsPerPageInput,
    faqPostsReady,
    faqRegularTotalCount,
    newFaqCategoryName,
    noticeBoardConfigLoadErrorMessage,
    noticeBoardConfigReady,
    noticeBoardConfigSaving,
    noticePostDeletingId,
    noticePostsPerPageInput,
    noticeRegularPostNumberById,
    noticeRegularTotalCount,
    openFaqPostDialog,
    openNoticePostDialog,
    paginatedAdminFaqPosts,
    paginatedAdminNoticePosts,
    safeAdminFaqPage,
    safeAdminNoticePage,
    saveFaqBoardConfig,
    saveFaqCategoryName,
    saveNoticeBoardConfig,
    setAdminExpandedFaqPostId,
    setAdminFaqPage,
    setAdminNoticePage,
    setAdminNoticeQuery,
    setEditingFaqCategoryId,
    setEditingFaqCategoryName,
    setFaqPostsPerPageInput,
    setNewFaqCategoryName,
    setNoticePostsPerPageInput,
    startEditFaqCategory,
    toggleAdminFaqPost,
    addTempHoliday,
    siteSettingsReady,
    siteSettingsLoadErrorMessage,
    systemAdminSettings,
    systemAdminSettingsReady,
    systemAdminSettingsLoadErrorMessage,
    setSystemAdminSettings,
    setUserSessionPolicy,
    rebaseAdminAuthenticatedSession,
    userSessionPolicy,
    userSessionPolicyReady,
    userSessionPolicyLoadErrorMessage,
    deleteTempHoliday,
    finalizeSplitStorageMigration,
    holidayImportConflictModal,
    holidayImportLoading,
    holidayImportYear,
    holidayManagementMonth,
    holidayManagementView,
    holidayManagementYear,
    holidaySettingsDirty,
    importKoreanPublicHolidaysFromJson,
    applyHolidayImportConflictChoice,
    newHolidayDate,
    newHolidayName,
    newHolidayType,
    saveHolidaySettings,
    saveSystemSettings,
    setHolidayImportConflictModal,
    setHolidayImportYear,
    setHolidayManagementMonth,
    setHolidayManagementView,
    setHolidayManagementYear,
    setNewHolidayDate,
    setNewHolidayName,
    setNewHolidayType,
    setTempSettings,
    splitStorageFinalizeLoading,
    tempAllowNonOverlappingSameAssetRequests,
    tempBusinessDayAdjustmentEnabled,
    tempHolidayList,
    discardHolidayChanges,
    tempSettings,
    updateTempHolidayReason,
    popupPosts,
    popupPostsReady,
    popupPostsLoadErrorMessage,
    popupPostDeletingId,
    popupPostToggleSavingId,
    openPopupPostDialog,
    togglePopupPostEnabled,
    movePopupPost,
    confirmDeletePopupPost,
    footerConfig,
    footerConfigDraft,
    footerConfigReady,
    footerConfigLoadErrorMessage,
    footerConfigSaving,
    footerPages,
    footerPagesLoadErrorMessage,
    footerPagesReady,
    footerPageDialog,
    footerPageForm,
    footerPageSaving,
    footerPageDeletingId,
    footerPageToggleSavingId,
    setFooterConfigDraft,
    setFooterPageForm,
    saveFooterConfig,
    openFooterPageDialog,
    closeFooterPageDialog,
    saveFooterPage,
    toggleFooterPageEnabled,
    moveFooterPage,
    confirmDeleteFooterPage,
    closeFaqPostDialog,
    closeNoticePostDialog,
    confirmModal,
    faqPostDialog,
    faqPostForm,
    faqPostSaving,
    noticePostDialog,
    noticePostForm,
    noticePostSaving,
    saveFaqPost,
    saveNoticePost,
    setConfirmModal,
    setFaqPostForm,
    setNoticePostForm,
    setToast,
    toast,
    popupPostDialog,
    popupPostForm,
    popupPostSaving,
    closePopupPostDialog,
    savePopupPost,
    setPopupPostForm,
    handleMemberDirectoryDeferredStateChange,
    handleSignupPolicyDeferredStateChange,
    handleAdminRequestsControllerStateChange,
  };

  const { adminPanelContextKey, contextGroups } = useAdminContextAssembler({
    adminTab,
    dynamicSourceValues: dynamicContextSourceValues,
  });
  const appBlockingState = getAppBlockingState({
    firebaseLoadErrorMessage,
    normalizedSiteSettings,
    view: ADMIN_VIEW,
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
    <AdminShell
      adminLogoutInProgress={adminLogoutInProgress}
      adminPanelContextKey={adminPanelContextKey}
      authenticatedAdminAccount={authenticatedAdminAccount}
      contextGroups={contextGroups}
      firebaseAuthReady={firebaseAuthReady}
      goToAdminHome={goToAppHome}
      goToUserMypage={goToUserMypage}
      isAdminAuthenticated={isAdminAuthenticated}
      logoutAdmin={logoutAdmin}
      normalizedSiteSettings={normalizedSiteSettings}
      shouldRenderAdminDialogs={shouldRenderAdminDialogs}
      shouldShowStats={shouldShowStats}
      stats={stats}
      statsLoading={statsLoading}
    />
  );
}
