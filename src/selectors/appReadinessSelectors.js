import { USER_PROFILE_STATUS } from '../constants/memberConstants.js';
import {
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from '../features/members/memberAccountPolicy.js';
import { SPLIT_STORAGE_VERSION } from '../features/settings/useAdminSplitStorageMigrationController.js';

export const selectAppReadiness = ({
  adminAccountsLoadErrorMessage,
  adminAccountsReady,
  adminLogoutInProgress,
  currentAuthAdminAccount,
  currentAuthRoleErrorMessage,
  currentAuthRoleReady,
  dataSettings,
  firebaseAuthCurrentUser,
  firebaseAuthReady,
  firebaseAuthUser,
  firebaseLoadErrorMessage,
  firebaseReady,
  isAdminAuthenticated,
  splitPublicConfig,
  splitStorageVersion,
  userProfile,
  view,
}) => {
  const hasFirebaseAuthSession = Boolean(
    firebaseAuthUser || firebaseAuthCurrentUser
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
    isRegisteredMemberSignupRequired(dataSettings);
  const memberIdentityClaimsReady = Boolean(
    dataSettings?.memberIdentityClaimsReady
  );
  const currentMemberDirectoryVersion =
    getSafeMemberDirectoryVersion(dataSettings);

  const isUserDirectoryAccessRestricted = Boolean(
    userProfile &&
      (userProfile.status === USER_PROFILE_STATUS.PROFILE_REQUIRED ||
        (memberDirectoryPolicyEnabled &&
          userProfile.status === USER_PROFILE_STATUS.ACTIVE &&
          Number(userProfile.directoryVerifiedVersion || 0) !==
            currentMemberDirectoryVersion))
  );

  const adminBaseReady =
    view === 'admin' &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    (adminAccountsReady || Boolean(currentAuthAdminAccount));

  const adminLoadError = Boolean(
    adminAccountsLoadErrorMessage || currentAuthRoleErrorMessage
  );

  return {
    hasAdminAccess:
      adminBaseReady &&
      !adminLoadError &&
      isAdminAuthenticated,
    hasFirebaseAuthSession,
    isCurrentFirebaseAuthAdmin,
    isCurrentFirebaseAuthGeneralUser,
    isSplitStorageReady:
      splitStorageVersion >= SPLIT_STORAGE_VERSION,
    isUserDirectoryAccessRestricted,
    memberDirectoryAudit:
      splitPublicConfig?.memberDirectoryAudit || null,
    memberDirectoryPolicyEnabled,
    memberIdentityClaimsReady,
    shouldShowAdminAccountsErrorPage:
      adminBaseReady && adminLoadError,
    shouldShowAdminLoadingPage:
      view === 'admin' &&
      (!firebaseAuthReady ||
        !currentAuthRoleReady ||
        (!adminAccountsReady && !currentAuthAdminAccount) ||
        adminLogoutInProgress),
    shouldShowAdminLoginPage:
      adminBaseReady &&
      !adminLoadError &&
      !isAdminAuthenticated,
  };
};
