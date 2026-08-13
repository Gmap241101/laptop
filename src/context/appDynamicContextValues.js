/**
 * App.jsx가 제공하는 평면 동적 상태·행동에서 화면 컨텍스트용 파생 값을 조립합니다.
 * 화면별 키 선택은 appContextSlices.js가 담당하므로 App.jsx는 기능 그룹 내부 구조를 알 필요가 없습니다.
 */
export const createAppDynamicContextValues = (sourceValues = {}) => {
  const {
    handleAdminRequestsControllerStateChange,
    handleMemberDirectoryDeferredStateChange,
    handleSignupPolicyDeferredStateChange,
    ...dynamicValues
  } = sourceValues;

  return {
    ...dynamicValues,
    adminRequestsPrerequisitesReady:
      Boolean(sourceValues.isAdminAuthenticated) &&
      sourceValues.currentAuthRoleReady &&
      !sourceValues.currentAuthRoleErrorMessage,
    memberAccountsPrerequisitesReady:
      Boolean(sourceValues.isAdminAuthenticated) &&
      sourceValues.currentAuthRoleReady,
    memberDirectoryBorrowers: sourceValues.data.borrowers,
    memberDirectorySettings: sourceValues.data.settings,
    memberDirectoryTeams: sourceValues.data.teams,
    onAdminRequestsControllerStateChange:
      handleAdminRequestsControllerStateChange,
    onMemberDirectoryDeferredStateChange:
      handleMemberDirectoryDeferredStateChange,
    onSignupPolicyDeferredStateChange:
      handleSignupPolicyDeferredStateChange,
    signupPolicySettings: sourceValues.data.settings,
  };
};
