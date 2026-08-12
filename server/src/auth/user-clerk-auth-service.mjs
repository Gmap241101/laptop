import { createHash, randomBytes } from 'node:crypto';

const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();
const sha256 = (value) => createHash('sha256').update(String(value || '')).digest('hex');

const serviceError = (code, message, status = 400) => {
  const error = new Error(message);
  error.name = 'UserClerkAuthServiceError';
  error.code = code;
  error.status = status;
  return error;
};

const publicMetadata = () => ({ rentalSystemRole: 'user' });
const privateMetadata = (legacyMemberKey) => ({
  rentalSystemFirebaseUid: legacyMemberKey,
  rentalSystemLegacyMemberKey: legacyMemberKey,
  rentalSystemUserIdentity: 'postgresql',
});
const nativeLegacyMemberKey = (email) => `clerk-native:${sha256(lower(email))}`;
const compatibilityIdentity = ({ uid, email, provider = 'clerk-postgresql' }) => Object.freeze({
  uid: trim(uid),
  email: lower(email),
  emailVerified: true,
  signInProvider: provider,
  idToken: '',
});

export const createUserClerkAuthService = ({
  repository,
  clerkClient,
  userRepository,
  firebaseLinkRepository,
  firestoreClient = null,
  memberRepository = null,
  adminIdentityRepository = null,
  accountLifecycleService = null,
  accountLifecycleCompatibilityDisabled = false,
  userFirebaseAuthCompatibilityDisabled = false,
}) => {
  if (!repository || typeof repository.findByClerkUserId !== 'function') throw new TypeError('User Clerk auth repository is required.');
  if (!clerkClient || typeof clerkClient.getUser !== 'function' || typeof clerkClient.findUserByEmail !== 'function' || typeof clerkClient.createUser !== 'function' || typeof clerkClient.updateUser !== 'function' || typeof clerkClient.updateUserMetadata !== 'function' || typeof clerkClient.verifyPassword !== 'function' || typeof clerkClient.deleteUser !== 'function') throw new TypeError('Clerk Backend API lifecycle methods are required.');
  if (!userRepository || typeof userRepository.upsertFromClerk !== 'function') throw new TypeError('User repository is required.');
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.link !== 'function') throw new TypeError('Firebase link repository is required.');
  if (!accountLifecycleCompatibilityDisabled && (!firestoreClient || typeof firestoreClient.getUserAccount !== 'function' || typeof firestoreClient.getAdminAccount !== 'function')) throw new TypeError('Legacy member migration client is required only while account lifecycle compatibility is enabled.');
  if (accountLifecycleCompatibilityDisabled && (!adminIdentityRepository || typeof adminIdentityRepository.findByFirebaseUid !== 'function' || typeof adminIdentityRepository.findByClerkUserId !== 'function')) {
    throw new TypeError('PostgreSQL administrator identity repository is required when Phase 32 account lifecycle authority is enabled.');
  }
  if (userFirebaseAuthCompatibilityDisabled && (!accountLifecycleService || typeof accountLifecycleService.signup !== 'function')) {
    throw new TypeError('PostgreSQL account lifecycle service is required when user Firebase Auth compatibility is retired.');
  }

  const ensureRecentFirebaseAuthentication = (firebaseIdentity) => {
    const authTime = Number(firebaseIdentity?.authTime);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(authTime) || authTime <= 0 || nowSeconds - authTime > 300 || authTime > nowSeconds + 5) {
      throw serviceError('user_recent_authentication_required', 'A recent Firebase user sign-in is required for Clerk migration.', 401);
    }
  };

  const readFirebaseUser = async (firebaseIdentity) => {
    if (accountLifecycleCompatibilityDisabled || userFirebaseAuthCompatibilityDisabled) throw serviceError('legacy_user_migration_retired', 'Legacy Firebase user migration is retired.', 410);
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

  const linkClerkAuthority = async ({ clerkUser, legacyMemberKey, email, provider }) => {
    const appUser = await userRepository.upsertFromClerk(clerkUser);
    await firebaseLinkRepository.link(appUser.id, compatibilityIdentity({
      uid: legacyMemberKey,
      email,
      provider,
    }));
    const linked = await repository.linkAuthority({ appUserId: appUser.id, firebaseUid: legacyMemberKey });
    if (!linked) throw serviceError('user_member_authority_not_ready', 'PostgreSQL member account must exist before Clerk authority can be linked.', 409);
    return { appUser, account: await repository.findByFirebaseUid(legacyMemberKey) };
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
      const linkedFirebaseUid = trim(clerkUser.privateMetadata?.rentalSystemFirebaseUid || clerkUser.privateMetadata?.rentalSystemLegacyMemberKey);
      if (linkedFirebaseUid && linkedFirebaseUid !== source.uid) throw serviceError('user_clerk_link_conflict', 'Clerk user is already linked to a different member identity.', 409);
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

    async signupNative({ input = {}, password }) {
      if (!userFirebaseAuthCompatibilityDisabled) {
        throw serviceError('user_native_signup_not_enabled', 'Native Clerk signup is not enabled.', 409);
      }
      const email = lower(input.email);
      if (!email) throw serviceError('user_email_missing', 'Signup email is required.', 400);
      if (typeof password !== 'string' || password.length < 8) throw serviceError('user_clerk_password_too_short', 'Clerk user passwords must be at least 8 characters.', 400);
      if (await clerkClient.findUserByEmail(email)) {
        throw serviceError('member_email_already_registered', 'Email address is already registered.', 409);
      }

      const legacyMemberKey = nativeLegacyMemberKey(email);
      let clerkUser = null;
      let signupCommitted = false;
      try {
        const signup = await accountLifecycleService.signup({
          firebaseIdentity: { uid: legacyMemberKey, email, idToken: 'clerk-native-signup' },
          input: { ...input, email },
        });
        signupCommitted = true;

        clerkUser = await clerkClient.createUser({
          email,
          password,
          firstName: trim(input.name) || '사용자',
          publicMetadata: publicMetadata(),
          privateMetadata: privateMetadata(legacyMemberKey),
          externalId: `rental-user:${legacyMemberKey}`,
          skipPasswordChecks: false,
        });
        const linked = await linkClerkAuthority({
          clerkUser,
          legacyMemberKey,
          email,
          provider: 'clerk-native',
        });
        return Object.freeze({
          authority: 'clerk',
          source: 'postgresql',
          status: signup.status || linked.account?.memberStatus || '',
          legacyMemberKey,
          clerkUser,
          account: linked.account,
          firebaseAuthCompatibility: 'retired',
        });
      } catch (error) {
        if (clerkUser?.clerkUserId) {
          await clerkClient.deleteUser(clerkUser.clerkUserId).catch(() => {});
        }
        if (signupCommitted && typeof accountLifecycleService.rollbackUnlinkedSignup === 'function') {
          await accountLifecycleService.rollbackUnlinkedSignup({ firebaseUid: legacyMemberKey }).catch(() => {});
        }
        throw error;
      }
    },

    async ensureRecoveryClerkIdentity({ firebaseUid, email }) {
      const uid = trim(firebaseUid);
      const normalizedEmail = lower(email);
      if (!uid || !normalizedEmail) throw serviceError('account_recovery_identity_missing', 'Recovery member identity is incomplete.', 400);
      if (!memberRepository || typeof memberRepository.findByFirebaseUid !== 'function') {
        throw serviceError('user_member_postgresql_source_unavailable', 'PostgreSQL member source is unavailable.', 503);
      }
      const admin = accountLifecycleCompatibilityDisabled
        ? await adminIdentityRepository.findByFirebaseUid(uid)
        : null;
      if (admin && trim(admin.status) !== 'retired') throw serviceError('user_account_is_admin', 'Administrator accounts cannot use the general-user recovery flow.', 403);
      const member = await memberRepository.findByFirebaseUid(uid);
      if (!member || trim(member.status) === 'retired') throw serviceError('user_account_not_found', 'Active PostgreSQL member account was not found.', 404);
      if (lower(member.email) !== normalizedEmail) throw serviceError('user_email_mismatch', 'Recovery email does not match the PostgreSQL member account.', 409);

      let clerkUser = await clerkClient.findUserByEmail(normalizedEmail);
      let created = false;
      try {
        if (!clerkUser) {
          clerkUser = await clerkClient.createUser({
            email: normalizedEmail,
            password: `${randomBytes(24).toString('base64url')}A1`,
            firstName: trim(member.name) || '사용자',
            publicMetadata: publicMetadata(),
            privateMetadata: privateMetadata(uid),
            externalId: `rental-user:${uid}`,
            skipPasswordChecks: false,
          });
          created = true;
        } else {
          const linkedKey = trim(clerkUser.privateMetadata?.rentalSystemFirebaseUid || clerkUser.privateMetadata?.rentalSystemLegacyMemberKey);
          if (linkedKey && linkedKey !== uid) throw serviceError('user_clerk_link_conflict', 'Clerk user is linked to a different member identity.', 409);
          clerkUser = await clerkClient.updateUserMetadata(clerkUser.clerkUserId, {
            publicMetadata: publicMetadata(),
            privateMetadata: privateMetadata(uid),
          });
        }
        const linked = await linkClerkAuthority({
          clerkUser,
          legacyMemberKey: uid,
          email: normalizedEmail,
          provider: 'clerk-recovery',
        });
        return Object.freeze({
          authority: 'clerk',
          ready: true,
          created,
          clerkUserId: clerkUser.clerkUserId,
          account: linked.account,
        });
      } catch (error) {
        if (created && clerkUser?.clerkUserId) {
          await clerkClient.deleteUser(clerkUser.clerkUserId).catch(() => {});
        }
        throw error;
      }
    },

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

    async changePassword({ clerkUserId, firebaseIdentity = null, currentPassword, newPassword }) {
      const current = await getCurrent(clerkUserId);
      if (!userFirebaseAuthCompatibilityDisabled && current.account.firebaseUid !== trim(firebaseIdentity?.uid)) {
        throw serviceError('user_firebase_identity_mismatch', 'Firebase compatibility identity does not match Clerk user.', 409);
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8) throw serviceError('user_clerk_password_too_short', 'New Clerk password must be at least 8 characters.', 400);
      await clerkClient.verifyPassword(clerkUserId, currentPassword);
      await clerkClient.updateUser(clerkUserId, { password: newPassword });
      const account = await repository.markPasswordAuthority({ firebaseUid: current.account.firebaseUid });
      return Object.freeze({ authority: 'clerk', changed: true, account });
    },

    async finalizeWithdrawal({ clerkUserId, firebaseIdentity = null, password }) {
      const current = await getCurrent(clerkUserId);
      if (!userFirebaseAuthCompatibilityDisabled && current.account.firebaseUid !== trim(firebaseIdentity?.uid)) {
        throw serviceError('user_firebase_identity_mismatch', 'Firebase compatibility identity does not match Clerk user.', 409);
      }
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
        console.warn('[user-auth] Clerk user deletion deferred after PostgreSQL withdrawal authority was committed', { clerkUserId, legacyMemberKey: current.account.firebaseUid, clerkCleanupError });
      }
      const account = await repository.markClerkRetired({ firebaseUid: current.account.firebaseUid, deleted: clerkDeleted });
      return Object.freeze({ authority: 'postgresql', withdrawn: true, clerkDeleted, clerkCleanupError, account });
    },
  });
};
