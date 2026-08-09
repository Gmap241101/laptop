const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();

const serviceError = (code, message, status = 400) => {
  const error = new Error(message);
  error.name = 'AdminClerkAuthServiceError';
  error.code = code;
  error.status = status;
  return error;
};

const publicMetadata = (admin) => ({
  rentalSystemRole: 'admin',
  adminRole: admin.adminRole || 'admin',
});
const privateMetadata = (admin) => ({
  rentalSystemAdminFirebaseUid: admin.firebaseUid,
  rentalSystemAdminLoginId: admin.adminLoginId || '',
  rentalSystemAdminRegistry: 'postgresql',
});

export const createAdminClerkAuthService = ({ repository, clerkClient, firestoreClient }) => {
  if (!repository || typeof repository.findByFirebaseUid !== 'function') {
    throw new TypeError('Admin identity repository is required.');
  }
  if (
    !clerkClient ||
    typeof clerkClient.getUser !== 'function' ||
    typeof clerkClient.findUserByEmail !== 'function' ||
    typeof clerkClient.createUser !== 'function' ||
    typeof clerkClient.updateUser !== 'function' ||
    typeof clerkClient.updateUserMetadata !== 'function'
  ) {
    throw new TypeError('Clerk Backend API client Phase 22 methods are required.');
  }
  if (!firestoreClient || typeof firestoreClient.verifyAdmin !== 'function' || typeof firestoreClient.getAdminAccount !== 'function') {
    throw new TypeError('Firestore admin compatibility client is required.');
  }

  const ensureRegistry = async (firebaseUid) => {
    const admin = await repository.findByFirebaseUid(trim(firebaseUid));
    if (!admin || admin.status !== 'active') {
      throw serviceError('admin_registry_not_ready', 'Administrator identity registry is not ready.', 409);
    }
    return admin;
  };

  const ensureClerkUser = async ({ admin, password, migration = false }) => {
    const email = lower(admin.authEmail);
    if (!email) throw serviceError('admin_registry_email_missing', 'Administrator registry email is missing.', 409);
    if (typeof password !== 'string' || password.length < 6) {
      throw serviceError('admin_password_invalid', 'Administrator password must be at least 6 characters.', 400);
    }
    if (!migration && password.length < 8) {
      throw serviceError('admin_clerk_password_too_short', 'New Clerk administrator passwords must be at least 8 characters.', 400);
    }

    let clerkUser = admin.clerkUserId ? await clerkClient.getUser(admin.clerkUserId).catch((error) => {
      if (error?.code === 'clerk_user_not_found') return null;
      throw error;
    }) : null;

    if (!clerkUser) clerkUser = await clerkClient.findUserByEmail(email);

    if (!clerkUser) {
      clerkUser = await clerkClient.createUser({
        email,
        password,
        firstName: admin.userName || admin.adminLoginId || '관리자',
        publicMetadata: publicMetadata(admin),
        privateMetadata: privateMetadata(admin),
        externalId: `rental-admin:${admin.firebaseUid}`,
        skipPasswordChecks: migration,
      });
    } else {
      if (lower(clerkUser.primaryEmail) !== email) {
        throw serviceError('admin_clerk_email_mismatch', 'Clerk administrator email does not match the registry.', 409);
      }
      clerkUser = await clerkClient.updateUser(clerkUser.clerkUserId, {
        password,
        ...(migration ? { skip_password_checks: true } : {}),
      });
      clerkUser = await clerkClient.updateUserMetadata(clerkUser.clerkUserId, {
        publicMetadata: publicMetadata(admin),
        privateMetadata: privateMetadata(admin),
      });
    }

    if (admin.clerkUserId && admin.clerkUserId !== clerkUser.clerkUserId) {
      throw serviceError('admin_clerk_link_conflict', 'Administrator registry is linked to a different Clerk user.', 409);
    }

    const linked = await repository.linkClerkIdentity({
      firebaseUid: admin.firebaseUid,
      clerkUserId: clerkUser.clerkUserId,
    });
    if (!linked) throw serviceError('admin_registry_update_failed', 'Administrator registry could not be linked.', 503);
    return { admin: linked, clerkUser };
  };

  const verifyActorCompatibility = async ({ actor, firebaseIdentity }) => {
    const firebaseAdmin = await firestoreClient.verifyAdmin({
      firebaseUid: firebaseIdentity.uid,
      firebaseIdToken: firebaseIdentity.idToken,
    });
    if (actor.firebaseUid !== firebaseAdmin.uid) {
      throw serviceError('admin_firebase_identity_mismatch', 'Firebase compatibility administrator does not match the Clerk administrator.', 409);
    }
    return firebaseAdmin;
  };

  const ensureRecentFirebaseAuthentication = (firebaseIdentity) => {
    const authTime = Number(firebaseIdentity?.authTime);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(authTime) || authTime <= 0 || nowSeconds - authTime > 300 || authTime > nowSeconds + 5) {
      throw serviceError('admin_recent_authentication_required', 'A recent Firebase administrator sign-in is required for Clerk migration.', 401);
    }
  };

  return Object.freeze({
    async getCurrent({ clerkUserId }) {
      const registry = await repository.findByClerkUserId(trim(clerkUserId));
      if (!registry || registry.status !== 'active' || registry.clerkLinkState !== 'linked') {
        throw serviceError('admin_clerk_not_authorized', 'Current Clerk user is not registered as an administrator.', 403);
      }
      const clerkUser = await clerkClient.getUser(clerkUserId);
      if (lower(clerkUser.primaryEmail) !== lower(registry.authEmail)) {
        throw serviceError('admin_clerk_email_mismatch', 'Clerk administrator email does not match the registry.', 409);
      }
      const admin = await repository.markVerifiedLogin({
        firebaseUid: registry.firebaseUid,
        clerkUserId: registry.clerkUserId,
      });
      return Object.freeze({ authority: 'clerk', admin, clerkUser });
    },

    async migrateCurrent({ firebaseIdentity, password }) {
      ensureRecentFirebaseAuthentication(firebaseIdentity);
      const firebaseAdmin = await firestoreClient.verifyAdmin({
        firebaseUid: firebaseIdentity.uid,
        firebaseIdToken: firebaseIdentity.idToken,
      });
      const registry = await ensureRegistry(firebaseAdmin.uid);
      const firestoreEmail = lower(firebaseAdmin.fields?.authEmail || firebaseAdmin.fields?.email);
      if (!firestoreEmail || firestoreEmail !== lower(registry.authEmail)) {
        throw serviceError('admin_registry_email_mismatch', 'Firestore administrator email does not match PostgreSQL registry.', 409);
      }
      const result = await ensureClerkUser({ admin: registry, password, migration: true });
      return Object.freeze({
        authority: 'clerk',
        migration: 'firebase-admin-to-clerk',
        admin: result.admin,
        clerkUser: result.clerkUser,
      });
    },

    async provisionTarget({ actorClerkUserId, firebaseIdentity, targetFirebaseUid, password }) {
      const actor = await repository.findByClerkUserId(trim(actorClerkUserId));
      if (!actor || actor.status !== 'active' || actor.clerkLinkState !== 'linked') {
        throw serviceError('admin_clerk_not_authorized', 'Current Clerk user is not registered as an administrator.', 403);
      }
      await verifyActorCompatibility({ actor, firebaseIdentity });

      const targetUid = trim(targetFirebaseUid);
      const targetDocument = await firestoreClient.getAdminAccount({
        firebaseUid: targetUid,
        firebaseIdToken: firebaseIdentity.idToken,
      });
      if (!targetDocument) throw serviceError('admin_target_not_found', 'Target administrator account was not found.', 404);
      const target = await ensureRegistry(targetUid);
      if (target.adminRole === 'owner' && actor.adminRole !== 'owner') {
        throw serviceError('admin_owner_required', 'Only an owner administrator can provision another owner administrator.', 403);
      }
      const documentEmail = lower(targetDocument.fields?.authEmail || targetDocument.fields?.email);
      if (!documentEmail || documentEmail !== lower(target.authEmail)) {
        throw serviceError('admin_registry_email_mismatch', 'Target administrator email does not match PostgreSQL registry.', 409);
      }

      const result = await ensureClerkUser({ admin: target, password, migration: false });
      return Object.freeze({ authority: 'clerk', provisioned: true, admin: result.admin, clerkUser: result.clerkUser });
    },
  });
};
