import { USER_PROFILE_STATUS } from '../constants/memberConstants.js';
import {
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from '../features/members/memberAccountPolicy.js';
import { SPLIT_STORAGE_VERSION } from '../features/settings/splitStorageConstants.js';


export const selectUserAppReadiness = ({
  currentAuthRoleErrorMessage,
  currentAuthRoleReady,
  dataSettings,
  firebaseAuthCurrentUser,
  firebaseAuthUser,
  splitPublicConfig,
  splitStorageVersion,
  userProfile,
}) => {
  const hasFirebaseAuthSession = Boolean(firebaseAuthUser || firebaseAuthCurrentUser);
  const isCurrentFirebaseAuthGeneralUser = Boolean(
    firebaseAuthUser && currentAuthRoleReady && !currentAuthRoleErrorMessage
  );
  const memberDirectoryPolicyEnabled = isRegisteredMemberSignupRequired(dataSettings);
  const memberIdentityClaimsReady = Boolean(dataSettings?.memberIdentityClaimsReady);
  const currentMemberDirectoryVersion = getSafeMemberDirectoryVersion(dataSettings);
  const isUserDirectoryAccessRestricted = Boolean(
    userProfile &&
      (userProfile.status === USER_PROFILE_STATUS.PROFILE_REQUIRED ||
        (memberDirectoryPolicyEnabled &&
          userProfile.status === USER_PROFILE_STATUS.ACTIVE &&
          Number(userProfile.directoryVerifiedVersion || 0) !== currentMemberDirectoryVersion))
  );

  return {
    hasFirebaseAuthSession,
    isCurrentFirebaseAuthGeneralUser,
    isSplitStorageReady: splitStorageVersion >= SPLIT_STORAGE_VERSION,
    isUserDirectoryAccessRestricted,
    memberDirectoryAudit: splitPublicConfig?.memberDirectoryAudit || null,
    memberDirectoryPolicyEnabled,
    memberIdentityClaimsReady,
  };
};

export const selectAppReadiness = ({
  adminAccountsLoadErrorMessage,
  adminAccountsReady,
  adminAuthTransitionPending = false,
  adminLogoutInProgress,
  authenticatedAdminId,
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
  // No administrator session and no in-flight login transition: the login form
  // is safe to render even while an unrelated Clerk bootstrap finishes.
  // Do not treat a restored or pending session as anonymous.
  const adminAnonymousLoginReady = Boolean(
    view === 'admin' &&
    !authenticatedAdminId &&
    !adminLogoutInProgress &&
    !adminAuthTransitionPending &&
    !adminLoadError &&
    !isAdminAuthenticated
  );
  const adminAuthoritativeSessionPending = Boolean(
    view === 'admin' &&
      authenticatedAdminId &&
      currentAuthAdminAccount?.id === authenticatedAdminId &&
      !adminLogoutInProgress &&
      !isAdminAuthenticated
  );

  return {
    hasAdminAccess:
      adminBaseReady &&
      !adminLoadError &&
      !adminLogoutInProgress &&
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
    shouldShowAdminSigningOutPage: view === 'admin' && adminLogoutInProgress,
    shouldShowAdminLoadingPage:
      view === 'admin' &&
      !adminLogoutInProgress &&
      !adminAnonymousLoginReady &&
      (!firebaseAuthReady ||
        !currentAuthRoleReady ||
        (!adminAccountsReady && !currentAuthAdminAccount) ||
        adminAuthoritativeSessionPending),
    shouldShowAdminLoginPage:
      adminAnonymousLoginReady ||
      (!adminLogoutInProgress &&
        adminBaseReady &&
        !adminLoadError &&
        !adminAuthoritativeSessionPending &&
        !isAdminAuthenticated),
  };
};
