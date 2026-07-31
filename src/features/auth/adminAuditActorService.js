export const createAdminAuditActor = ({
  firebaseUser,
  authenticatedAdminAccount,
}) => ({
  uid:
    firebaseUser?.uid ||
    authenticatedAdminAccount?.authUid ||
    '',

  adminId:
    authenticatedAdminAccount?.id ||
    '',

  name:
    authenticatedAdminAccount?.userName ||
    authenticatedAdminAccount?.adminLoginId ||
    authenticatedAdminAccount?.authEmail ||
    '관리자',
});

export const createCurrentAdminAuditActorResolver = ({
  firebaseAuth,
  authenticatedAdminAccount,
}) =>
  () =>
    createAdminAuditActor({
      firebaseUser: firebaseAuth?.currentUser,
      authenticatedAdminAccount,
    });
