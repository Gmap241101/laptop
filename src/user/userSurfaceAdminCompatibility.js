import { useCallback, useRef } from 'react';

import { clearAdminAuthSession } from '../features/auth/authSessionService.js';
import { sanitizeFooterCommonHtml } from '../features/boards/footerContentShared.js';

const noop = () => {};
const noopAsync = async () => undefined;
const emptyRef = () => ({ current: null });

export { sanitizeFooterCommonHtml };

export const useNoticePostAdminState = () => ({
  noticePostDeletingId: '',
  noticePostDialog: null,
  noticePostForm: {},
  noticePostSaving: false,
  setNoticePostDeletingId: noop,
  setNoticePostDialog: noop,
  setNoticePostForm: noop,
  setNoticePostSaving: noop,
});

export const useFaqPostAdminState = () => ({
  faqPostDeletingId: '',
  faqPostDialog: null,
  faqPostForm: {},
  faqPostSaving: false,
  setFaqPostDeletingId: noop,
  setFaqPostDialog: noop,
  setFaqPostForm: noop,
  setFaqPostSaving: noop,
});

export const useAdminBoardSettingsState = () => ({
  editingFaqCategoryId: '',
  editingFaqCategoryName: '',
  faqBoardConfigSaving: false,
  faqCategoryDeletingId: '',
  faqCategorySavingId: '',
  faqPostsPerPageInput: '',
  newFaqCategoryName: '',
  noticeBoardConfigSaving: false,
  noticePostsPerPageInput: '',
  setEditingFaqCategoryId: noop,
  setEditingFaqCategoryName: noop,
  setFaqBoardConfigSaving: noop,
  setFaqCategoryDeletingId: noop,
  setFaqCategorySavingId: noop,
  setFaqPostsPerPageInput: noop,
  setNewFaqCategoryName: noop,
  setNoticeBoardConfigSaving: noop,
  setNoticePostsPerPageInput: noop,
});

export const useAdminPopupPostState = () => ({
  popupPostDeletingId: '',
  popupPostDialog: null,
  popupPostForm: {},
  popupPostSaving: false,
  popupPostToggleSavingId: '',
  setPopupPostDeletingId: noop,
  setPopupPostDialog: noop,
  setPopupPostForm: noop,
  setPopupPostSaving: noop,
  setPopupPostToggleSavingId: noop,
});

export const useAdminFooterContentState = () => ({
  footerConfigDraft: { enabled: true, contentHtml: '' },
  footerConfigSaving: false,
  footerPageDeletingId: '',
  footerPageDialog: null,
  footerPageForm: {},
  footerPageSaving: false,
  footerPageToggleSavingId: '',
  setFooterConfigDraft: noop,
  setFooterConfigSaving: noop,
  setFooterPageDeletingId: noop,
  setFooterPageDialog: noop,
  setFooterPageForm: noop,
  setFooterPageSaving: noop,
  setFooterPageToggleSavingId: noop,
});

export const useAdminNavigationState = () => ({
  adminTab: 'dashboard',
  handleMemberDirectoryDeferredStateChange: noop,
  handleSignupPolicyDeferredStateChange: noop,
  memberDirectoryDeferredActionsRef: emptyRef(),
  peopleSettingsDirty: false,
  setAdminTab: noop,
  signupPolicyDeferredActionsRef: emptyRef(),
  signupPolicyDirty: false,
});

export const useAdminWorkspaceBridgeController = () => ({
  adminMemberAccountsNavigationRequest: null,
  adminRequestsMutationVersion: 0,
  adminRequestsNavigationRequest: null,
  clearAdminRequestPanelSelection: noop,
  getAdminRequestById: () => null,
  handleAdminRequestsControllerStateChange: noop,
  notifyAdminRequestMutation: noop,
  resetAdminRequestPanelPage: noop,
  setAdminMemberAccountsNavigationRequest: noop,
  setAdminRequestsNavigationRequest: noop,
  updateAdminRequestPanelRequests: noop,
});

export const useAdminAssetCrudState = () => ({
  editLaptop: null,
  newLaptop: {},
  setEditLaptop: noop,
  setNewLaptop: noop,
});

export const useAdminAssetCategoryState = () => ({
  assetCategorySettingsDirty: false,
  draggingAssetCategoryIndex: null,
  editingAssetCategoryIndex: null,
  editingAssetCategoryName: '',
  newAssetCategory: '',
  setDraggingAssetCategoryIndex: noop,
  setEditingAssetCategoryIndex: noop,
  setEditingAssetCategoryName: noop,
  setNewAssetCategory: noop,
  setTempAssetCategories: noop,
  setTempAssetCategoryRenameMap: noop,
  tempAssetCategories: [],
  tempAssetCategoryRenameMap: {},
});

export const useAdminAccountManagementState = () => ({
  adminAccountEditForm: {},
  adminAccountForm: {},
  adminAccountPage: 1,
  adminMyProfileForm: {},
  adminMyProfileSaving: false,
  editingAdminAccountId: '',
  setAdminAccountEditForm: noop,
  setAdminAccountForm: noop,
  setAdminAccountPage: noop,
  setAdminMyProfileForm: noop,
  setAdminMyProfileSaving: noop,
  setEditingAdminAccountId: noop,
});

export const useAdminAuthenticationState = () => {
  const adminLogoutInProgressRef = useRef(false);
  const clearAdminAuthenticatedSession = useCallback(() => {
    clearAdminAuthSession();
  }, []);

  return {
    adminAuthAbsoluteExpiresAt: 0,
    adminAuthExpiresAt: 0,
    adminAuthForm: { email: '', password: '' },
    adminAuthLoading: false,
    adminAuthPolicyVersion: 0,
    adminLogoutInProgress: false,
    adminLogoutInProgressRef,
    authenticatedAdminId: '',
    clearAdminAuthenticatedSession,
    setAdminAuthenticatedSession: noop,
    setAdminAuthAbsoluteExpiresAt: noop,
    setAdminAuthExpiresAt: noop,
    setAdminAuthForm: noop,
    setAdminAuthLoading: noop,
    setAdminAuthPolicyVersion: noop,
    setAdminLogoutInProgress: noop,
  };
};

export const useAdminSystemSettingsState = ({ dataSettings = {} } = {}) => ({
  holidayImportConflictModal: null,
  holidayImportLoading: false,
  holidayImportYear: new Date().getFullYear(),
  holidayManagementMonth: new Date().getMonth() + 1,
  holidayManagementView: 'calendar',
  holidayManagementYear: new Date().getFullYear(),
  holidaySettingsDirty: false,
  newHolidayDate: '',
  newHolidayName: '',
  newHolidayType: 'public',
  rentalPolicySettingsDirty: false,
  setHolidayImportConflictModal: noop,
  setHolidayImportLoading: noop,
  setHolidayImportYear: noop,
  setHolidayManagementMonth: noop,
  setHolidayManagementView: noop,
  setHolidayManagementYear: noop,
  setNewHolidayDate: noop,
  setNewHolidayName: noop,
  setNewHolidayType: noop,
  setTempSettings: noop,
  tempSettings: dataSettings || {},
});

export const useAdminSplitStorageMigrationState = () => ({
  setSplitStorageFinalizeLoading: noop,
  splitStorageFinalizeLoading: false,
});

export default function useAdminPublicContentSynchronizationController() {}

export const useAdminAuthenticationController = () => ({
  authenticateAdmin: noopAsync,
  authenticatedAdminAccount: null,
  isAdminAuthenticated: false,
  logoutAdmin: noopAsync,
});

export const useAdminBoardSettingsController = () => ({
  addFaqCategory: noopAsync,
  confirmDeleteFaqCategory: noop,
  discardFaqBoardConfigChanges: noop,
  discardNoticeBoardConfigChanges: noop,
  faqBoardSettingsDirty: false,
  noticeBoardSettingsDirty: false,
  saveFaqBoardConfig: noopAsync,
  saveFaqCategoryName: noopAsync,
  saveNoticeBoardConfig: noopAsync,
  startEditFaqCategory: noop,
});

export const useAdminAccountManagementController = () => ({
  adminAccountTotalPages: 1,
  adminAccountUserOptions: [],
  cancelEditAdminAccount: noop,
  deleteAdminAccount: noop,
  paginatedAdminAccounts: [],
  registerAdminAccount: noopAsync,
  safeAdminAccountPage: 1,
  saveAdminAccountEdit: noopAsync,
  saveMyAdminProfile: noopAsync,
  sendAdminAccountPasswordResetEmail: noopAsync,
  startEditAdminAccount: noop,
  toggleAdminAccountLock: noopAsync,
});

export const useAdminSystemSettingsController = () => ({
  addTempHoliday: noop,
  applyHolidayImportConflictChoice: noop,
  deleteTempHoliday: noop,
  discardHolidayChanges: noop,
  discardRentalPolicyChanges: noop,
  importKoreanPublicHolidaysFromJson: noopAsync,
  saveHolidaySettings: noopAsync,
  saveSystemSettings: noopAsync,
  updateTempHolidayReason: noop,
});

export const useAdminSplitStorageMigrationController = () => ({
  finalizeSplitStorageMigration: noopAsync,
});

export const useAdminAssetCategoryController = () => ({
  addTempAssetCategory: noop,
  applyEditTempAssetCategory: noop,
  cancelTempAssetCategoryChanges: noop,
  deleteTempAssetCategory: noop,
  moveTempAssetCategory: noop,
  saveTempAssetCategoryChanges: noopAsync,
  startEditTempAssetCategory: noop,
});

export const createCurrentAdminAuditActorResolver = () => () => null;

export const useAdminBoardPostController = () => ({
  closeFaqPostDialog: noop,
  closeNoticePostDialog: noop,
  confirmDeleteFaqPost: noop,
  confirmDeleteNoticePost: noop,
  openFaqPostDialog: noop,
  openNoticePostDialog: noop,
  saveFaqPost: noopAsync,
  saveNoticePost: noopAsync,
});

export const useAdminPopupPostController = () => ({
  closePopupPostDialog: noop,
  confirmDeletePopupPost: noop,
  movePopupPost: noop,
  openPopupPostDialog: noop,
  savePopupPost: noopAsync,
  togglePopupPostEnabled: noopAsync,
});

export const useAdminFooterContentController = () => ({
  closeFooterPageDialog: noop,
  confirmDeleteFooterPage: noop,
  moveFooterPage: noop,
  openFooterPageDialog: noop,
  saveFooterConfig: noopAsync,
  saveFooterPage: noopAsync,
  toggleFooterPageEnabled: noopAsync,
});

export const useAdminNavigationController = ({ goToUserHome } = {}) => ({
  goToAppHome: goToUserHome || noop,
  handleAdminTabChange: noop,
  openAdminMemberAccounts: noop,
  openAdminRequests: noop,
});

export const useAdminRequestMutationController = () => ({
  commitAdminRequestEdit: noopAsync,
  commitAdminRequestStatusRestore: noopAsync,
  saveRequestMemo: noopAsync,
  updateRequest: noopAsync,
  updateRequestMemo: noop,
});

export const useAdminUserActionReviewState = () => ({
  adminUserActionSavingRequestId: '',
  setAdminUserActionSavingRequestId: noop,
});

export const useAdminUserActionReviewController = () => ({
  reviewUserActionRequest: noopAsync,
});

export const useAdminAssetCrudController = () => ({
  createLaptop: noopAsync,
  deleteLaptop: noop,
  handleAddLaptopClick: noop,
  saveLaptop: noopAsync,
});
