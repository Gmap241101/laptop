const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();

const serviceError = (code, message, status = 400) => {
  const error = new Error(message);
  error.name = 'UserClerkAuthServiceError';
  error.code = code;
  error.status = status;
  return error;
};

const publicMetadata = () => ({ rentalSystemRole: 'user' });
const privateMetadata = (firebaseUid) => ({
  rentalSystemFirebaseUid: firebaseUid,
  rentalSystemUserIdentity: 'postgresql',
});

export const createUserClerkAuthService = ({ repository, clerkClient, userRepository, firebaseLinkRepository, firestoreClient, memberRepository = null, adminIdentityRepository = null, accountLifecycleCompatibilityDisabled = false }) => {
  if (!repository || typeof repository.findByClerkUserId !== 'function') throw new TypeError('User Clerk auth repository is required.');
  if (!clerkClient || typeof clerkClient.getUser !== 'function' || typeof clerkClient.findUserByEmail !== 'function' || typeof clerkClient.createUser !== 'function' || typeof clerkClient.updateUser !== 'function' || typeof clerkClient.updateUserMetadata !== 'function' || typeof clerkClient.verifyPassword !== 'function' || typeof clerkClient.deleteUser !== 'function') throw new TypeError('Clerk Backend API lifecycle methods are required.');
  if (!userRepository || typeof userRepository.upsertFromClerk !== 'function') throw new TypeError('User repository is required.');
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.link !== 'function') throw new TypeError('Firebase link repository is required.');
  if (!firestoreClient || typeof firestoreClient.getUserAccount !== 'function' || typeof firestoreClient.getAdminAccount !== 'function') throw new TypeError('Firestore member compatibility client is required.');
  if (accountLifecycleCompatibilityDisabled && (!adminIdentityRepository || typeof adminIdentityRepository.findByFirebaseUid !== 'function' || typeof adminIdentityRepository.findByClerkUserId !== 'function')) {
    throw new TypeError('PostgreSQL administrator identity repository is required when Phase 32 account lifecycle authority is enabled.');
  }

  const ensureRecentFirebaseAuthentication = (firebaseIdentity) => {
    const authTime = Number(firebaseIdentity?.authTime);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(authTime) || authTime <= 0 || nowSeconds - authTime > 300 || authTime > nowSeconds + 5) {
      throw serviceError('user_recent_authentication_required', 'A recent Firebase user sign-in is required for Clerk migration.', 401);
    }
  };

  const readFirebaseUser = async (firebaseIdentity) => {
    const uid = trim(firebaseIdentity?.uid);
    if (!uid || !firebaseIdentity?.idToken) throw serviceError('user_firebase_identity_missing', 'Verified Firebase identity is required.', 401);
    const admin = await firestoreClient.getAdminAccount({ firebaseUid: uid, firebaseIdToken: firebaseIdentity.idToken });
    if (admin) throw serviceError('user_account_is_admin', 'Administrator accounts cannot use the general-user Clerk flow.', 403);
    const document = await firestoreClient.getUserAccount({ firebaseUid: uid, firebaseIdToken: firebaseIdentity.idToken });
    if (!document) throw serviceError('user_account_not_found', 'General-user account was not found.', 404);
    return { uid, fields: document.fields || {} };
  };

  const readProvisionUser = async (firebaseIdentity) => {
    if (!accountLifecycleCompatibilityDisabled) return readFirebaseUser(firebaseIdentity);
    const uid = trim(firebaseIdentity?.uid);
    if (!uid || !firebaseIdentity?.idToken) throw serviceError('user_firebase_identity_missing', 'Verified Firebase identity is required.', 401);
    const admin = await adminIdentityRepository.findByFirebaseUid(uid);
    if (admin && trim(admin.status) !== 'retired') throw serviceError('user_account_is_admin', 'Administrator accounts cannot use the general-user Clerk flow.', 403);
    if (!memberRepository || typeof memberRepository.findByFirebaseUid !== 'function') {
      throw serviceError('user_member_postgresql_source_unavailable', 'PostgreSQL member source is unavailable.', 503);
    }
    const account = await memberRepository.findByFirebaseUid(uid);
    if (!account) throw serviceError('user_account_not_found', 'PostgreSQL member account was not found.', 404);
    return { uid, fields: account };
  };

  const ensureClerkUser = async ({ firebaseIdentity, password, migration }) => {
    if (typeof password !== 'string' || password.length < 8) throw serviceError('user_clerk_password_too_short', 'Clerk user passwords must be at least 8 characters.', 400);
    const source = await readProvisionUser(firebaseIdentity);
    if (trim(source.fields.status) === 'retired') throw serviceError('user_account_retired', 'Retired accounts cannot be migrated to Clerk.', 403);
    const email = lower(firebaseIdentity.email || source.fields.email);
    if (!email) throw serviceError('user_email_missing', 'User email is required for Clerk migration.', 409);
    if (lower(source.fields.email) && lower(source.fields.email) !== email) throw serviceError('user_email_mismatch', 'Firebase and member profile email addresses do not match.', 409);

    let clerkUser = await clerkClient.findUserByEmail(email);
    if (!clerkUser) {
      clerkUser = await clerkClient.createUser({
        email,
        password,
        firstName: trim(source.fields.name) || '사용자',
        publicMetadata: publicMetadata(),
        privateMetadata: privateMetadata(source.uid),
        externalId: `rental-user:${source.uid}`,
        skipPasswordChecks: Boolean(migration),
      });
    } else {
      const linkedFirebaseUid = trim(clerkUser.privateMetadata?.rentalSystemFirebaseUid);
      if (linkedFirebaseUid && linkedFirebaseUid !== source.uid) throw serviceError('user_clerk_link_conflict', 'Clerk user is already linked to a different Firebase account.', 409);
      clerkUser = await clerkClient.updateUser(clerkUser.clerkUserId, {
        password,
        ...(migration ? { skip_password_checks: true } : {}),
      });
      clerkUser = await clerkClient.updateUserMetadata(clerkUser.clerkUserId, {
        publicMetadata: publicMetadata(),
        privateMetadata: privateMetadata(source.uid),
      });
    }

    const appUser = await userRepository.upsertFromClerk(clerkUser);
    await firebaseLinkRepository.link(appUser.id, firebaseIdentity);
    if (!accountLifecycleCompatibilityDisabled) {
      await repository.syncMemberFromCompatibility({ appUserId: appUser.id, firebaseUid: source.uid, profile: source.fields });
    }
    const linked = await repository.linkAuthority({ appUserId: appUser.id, firebaseUid: source.uid });
    if (!linked) throw serviceError('user_member_authority_not_ready', 'PostgreSQL member account must be synchronized before Clerk authority can be linked.', 409);
    return { source, clerkUser, appUser, account: await repository.findByFirebaseUid(source.uid) };
  };

  const getCurrent = async (clerkUserId) => {
    if (accountLifecycleCompatibilityDisabled) {
      const admin = await adminIdentityRepository.findByClerkUserId(trim(clerkUserId));
      if (admin && trim(admin.status) !== 'retired') {
        throw serviceError('user_account_is_admin', 'Administrator accounts cannot use the general-user Clerk flow.', 403);
      }
    }
    const account = await repository.findByClerkUserId(trim(clerkUserId));
    if (!account || !account.firebaseUid) throw serviceError('user_clerk_not_linked', 'Current Clerk user is not linked to a member account.', 403);
    if (account.clerkAccountState === 'deleted' || account.memberStatus === 'retired') throw serviceError('user_account_retired', 'Retired accounts cannot sign in.', 403);
    const clerkUser = await clerkClient.getUser(clerkUserId);
    if (lower(clerkUser.primaryEmail) !== lower(account.firebaseEmail || account.primaryEmail)) throw serviceError('user_clerk_email_mismatch', 'Clerk email does not match the linked member account.', 409);
    const verified = await repository.markVerifiedLogin({ firebaseUid: account.firebaseUid });
    return Object.freeze({ authority: 'clerk', account: verified, clerkUser });
  };

  return Object.freeze({
    getCurrent: ({ clerkUserId }) => getCurrent(clerkUserId),

    async migrateCurrent({ firebaseIdentity, password }) {
      ensureRecentFirebaseAuthentication(firebaseIdentity);
      const result = await ensureClerkUser({ firebaseIdentity, password, migration: true });
      return Object.freeze({ authority: 'clerk', migration: 'firebase-user-to-clerk', account: result.account, clerkUser: result.clerkUser });
    },

    async provisionCurrent({ firebaseIdentity, password }) {
      ensureRecentFirebaseAuthentication(firebaseIdentity);
      const result = await ensureClerkUser({ firebaseIdentity, password, migration: false });
      return Object.freeze({ authority: 'clerk', provisioned: true, account: result.account, clerkUser: result.clerkUser });
    },

    async verifyPassword({ clerkUserId, password }) {
      const current = await getCurrent(clerkUserId);
      if (typeof password !== 'string' || !password) throw serviceError('user_password_required', 'Current password is required.', 400);
      await clerkClient.verifyPassword(clerkUserId, password);
      return Object.freeze({ authority: 'clerk', verified: true, account: current.account });
    },

    async changePassword({ clerkUserId, firebaseIdentity, currentPassword, newPassword }) {
      const current = await getCurrent(clerkUserId);
      if (current.account.firebaseUid !== trim(firebaseIdentity?.uid)) throw serviceError('user_firebase_identity_mismatch', 'Firebase compatibility identity does not match Clerk user.', 409);
      if (typeof newPassword !== 'string' || newPassword.length < 8) throw serviceError('user_clerk_password_too_short', 'New Clerk password must be at least 8 characters.', 400);
      await clerkClient.verifyPassword(clerkUserId, currentPassword);
      await clerkClient.updateUser(clerkUserId, { password: newPassword });
      const account = await repository.markPasswordAuthority({ firebaseUid: current.account.firebaseUid });
      return Object.freeze({ authority: 'clerk', changed: true, account });
    },

    async finalizeWithdrawal({ clerkUserId, firebaseIdentity, password }) {
      const current = await getCurrent(clerkUserId);
      if (current.account.firebaseUid !== trim(firebaseIdentity?.uid)) throw serviceError('user_firebase_identity_mismatch', 'Firebase compatibility identity does not match Clerk user.', 409);
      await clerkClient.verifyPassword(clerkUserId, password);
      if (accountLifecycleCompatibilityDisabled) {
        if (typeof repository.finalizePostgresqlWithdrawal !== 'function') {
          throw serviceError('user_withdrawal_postgresql_authority_unavailable', 'PostgreSQL withdrawal authority is unavailable.', 503);
        }
        await repository.finalizePostgresqlWithdrawal({ firebaseUid: current.account.firebaseUid });
      } else {
        const source = await readFirebaseUser(firebaseIdentity);
        if (trim(source.fields.status) !== 'retired') throw serviceError('user_withdrawal_profile_not_retired', 'Firestore compatibility profile must be retired before finalizing withdrawal.', 409);
        await repository.syncRetiredMember({ firebaseUid: current.account.firebaseUid, account: source.fields });
      }
      let clerkDeleted = false;
      let clerkCleanupError = '';
      try {
        await clerkClient.deleteUser(clerkUserId);
        clerkDeleted = true;
      } catch (error) {
        clerkCleanupError = error?.code || error?.message || 'clerk_user_delete_failed';
        console.warn('[user-auth] Clerk user deletion deferred after PostgreSQL withdrawal authority was committed', { clerkUserId, firebaseUid: current.account.firebaseUid, clerkCleanupError });
      }
      const account = await repository.markClerkRetired({ firebaseUid: current.account.firebaseUid, deleted: clerkDeleted });
      return Object.freeze({ authority: 'postgresql', withdrawn: true, clerkDeleted, clerkCleanupError, account });
    },
  });
};
