import { randomUUID } from 'node:crypto';

const trim = (value) => String(value ?? '').trim();
const lower = (value) => trim(value).toLowerCase();
const serviceError = (code, message, status = 400) => Object.assign(new Error(message), { name: 'AdminClerkAuthServiceError', code, status });
const publicMetadata = (admin) => ({ rentalSystemRole: 'admin', adminRole: admin.adminRole || 'admin' });
const privateMetadata = (admin) => ({ rentalSystemAdminKey: admin.legacyAdminKey || admin.firebaseUid, rentalSystemAdminLoginId: admin.adminLoginId || '', rentalSystemAdminRegistry: 'postgresql' });
const isLocked = (admin) => admin?.lockUntil && Date.parse(admin.lockUntil) > Date.now();
const assertOwner = (admin) => { if ((admin?.adminRole || 'admin') !== 'owner') throw serviceError('admin_owner_required', 'Only an owner administrator can perform this operation.', 403); };

export const createAdminClerkAuthService = ({ repository, clerkClient }) => {
  if (!repository || typeof repository.findByClerkUserId !== 'function' || typeof repository.listActive !== 'function') throw new TypeError('Admin identity repository is required.');
  if (!clerkClient || typeof clerkClient.getUser !== 'function' || typeof clerkClient.findUserByEmail !== 'function' || typeof clerkClient.createUser !== 'function' || typeof clerkClient.updateUser !== 'function' || typeof clerkClient.updateUserMetadata !== 'function' || typeof clerkClient.deleteUser !== 'function') throw new TypeError('Clerk Backend API administrator lifecycle methods are required.');

  const requireActor = async (clerkUserId) => {
    const actor = await repository.findByClerkUserId(trim(clerkUserId));
    if (!actor || actor.status !== 'active' || actor.clerkLinkState !== 'linked') throw serviceError('admin_clerk_not_authorized', 'Current Clerk user is not registered as an administrator.', 403);
    if (isLocked(actor)) throw serviceError('admin_account_locked', 'Administrator account is locked.', 423);
    return actor;
  };
  const serialize = (admin) => Object.freeze({ ...admin, id: admin.legacyAdminKey || admin.firebaseUid, authUid: admin.legacyAdminKey || admin.firebaseUid, email: admin.authEmail, authProvider: 'clerk', passwordHashAlgorithm: 'Clerk', lockUntil: admin.lockUntil ? Date.parse(admin.lockUntil) : 0 });

  return Object.freeze({
    async migrateCurrent() { throw serviceError('admin_firebase_migration_retired', 'Firebase administrator migration is retired; use Clerk/PostgreSQL administrator management.', 410); },
    async provisionTarget() { throw serviceError('admin_firebase_provision_retired', 'Firebase administrator provisioning is retired; use Clerk/PostgreSQL administrator management.', 410); },
    async authorizeCurrent({ clerkUserId }) {
      const registry = await requireActor(clerkUserId);
      return Object.freeze({
        authority: 'clerk-postgresql-session',
        admin: registry,
        account: serialize(registry),
      });
    },
    async getCurrent({ clerkUserId }) {
      const registry = await requireActor(clerkUserId);
      const clerkUser = await clerkClient.getUser(clerkUserId);
      if (lower(clerkUser.primaryEmail) !== lower(registry.authEmail)) throw serviceError('admin_clerk_email_mismatch', 'Clerk administrator email does not match the registry.', 409);
      const admin = await repository.markVerifiedLogin({ firebaseUid: registry.legacyAdminKey, clerkUserId: registry.clerkUserId });
      return Object.freeze({ authority: 'clerk', admin, account: serialize(admin), clerkUser });
    },
    async list({ actorClerkUserId }) {
      await requireActor(actorClerkUserId);
      const accounts = await repository.listActive();
      return Object.freeze({ source: 'postgresql', accounts: accounts.map(serialize) });
    },
    async create({ actorClerkUserId, input }) {
      const actor = await requireActor(actorClerkUserId);
      const adminRole = input?.adminRole === 'owner' ? 'owner' : 'admin';
      if (adminRole === 'owner') assertOwner(actor);
      const adminLoginId = trim(input?.adminLoginId);
      const authEmail = lower(input?.email || input?.authEmail);
      const organizationName = trim(input?.organizationName);
      const userName = trim(input?.userName);
      const phone = trim(input?.phone);
      const password = String(input?.password || '');
      if (!adminLoginId || !authEmail || !organizationName || !userName) throw serviceError('admin_account_fields_required', 'Administrator ID, email, organization and name are required.', 400);
      if (password.length < 8) throw serviceError('admin_clerk_password_too_short', 'Administrator password must be at least 8 characters.', 400);
      if (await repository.findByAuthEmail(authEmail)) throw serviceError('admin_email_duplicate', 'Administrator email already exists.', 409);
      const existingByLogin = (await repository.listActive()).find((item) => lower(item.adminLoginId) === lower(adminLoginId));
      if (existingByLogin) throw serviceError('admin_login_id_duplicate', 'Administrator ID already exists.', 409);
      if (await clerkClient.findUserByEmail(authEmail)) throw serviceError('admin_clerk_email_duplicate', 'A Clerk account already uses this email.', 409);
      const legacyAdminKey = `admin:${randomUUID()}`;
      let clerkUser = null;
      try {
        clerkUser = await clerkClient.createUser({ email: authEmail, password, firstName: userName, publicMetadata: { rentalSystemRole: 'admin', adminRole }, privateMetadata: { rentalSystemAdminKey: legacyAdminKey, rentalSystemAdminLoginId: adminLoginId, rentalSystemAdminRegistry: 'postgresql' }, externalId: `rental-admin:${legacyAdminKey}` });
        const admin = await repository.create({ legacyAdminKey, adminLoginId, authEmail, organizationName, userName, phone, adminRole, clerkUserId: clerkUser.clerkUserId });
        return Object.freeze({ source: 'clerk-postgresql', account: serialize(admin) });
      } catch (error) {
        if (clerkUser?.clerkUserId) await clerkClient.deleteUser(clerkUser.clerkUserId).catch(() => {});
        throw error;
      }
    },
    async update({ actorClerkUserId, targetKey, input }) {
      const actor = await requireActor(actorClerkUserId);
      const target = await repository.findByFirebaseUid(trim(targetKey));
      if (!target || target.status === 'retired') throw serviceError('admin_target_not_found', 'Administrator account was not found.', 404);
      const nextRole = input?.adminRole === 'owner' ? 'owner' : 'admin';
      if (nextRole !== target.adminRole) assertOwner(actor);
      if (target.adminRole === 'owner' && nextRole !== 'owner') {
        const owners = (await repository.listActive()).filter((item) => item.adminRole === 'owner');
        if (owners.length <= 1) throw serviceError('last_owner_required', 'The last owner administrator cannot be demoted.', 409);
      }
      const adminLoginId = trim(input?.adminLoginId || target.adminLoginId);
      const duplicate = (await repository.listActive()).find((item) => item.legacyAdminKey !== target.legacyAdminKey && lower(item.adminLoginId) === lower(adminLoginId));
      if (duplicate) throw serviceError('admin_login_id_duplicate', 'Administrator ID already exists.', 409);
      const admin = await repository.update({ legacyAdminKey: target.legacyAdminKey, adminLoginId, organizationName: trim(input?.organizationName || target.organizationName), userName: trim(input?.userName || target.userName), phone: trim(input?.phone ?? target.phone), adminRole: nextRole });
      if (target.clerkUserId) await clerkClient.updateUserMetadata(target.clerkUserId, { publicMetadata: publicMetadata(admin), privateMetadata: privateMetadata(admin) });
      const password = String(input?.newPassword || '');
      if (password) {
        if (password.length < 8) throw serviceError('admin_clerk_password_too_short', 'Administrator password must be at least 8 characters.', 400);
        if (!target.clerkUserId) throw serviceError('admin_clerk_link_missing', 'Administrator Clerk identity is missing.', 409);
        await clerkClient.updateUser(target.clerkUserId, { password });
      }
      return Object.freeze({ source: 'clerk-postgresql', account: serialize(admin) });
    },
    async setLock({ actorClerkUserId, targetKey, locked }) {
      const actor = await requireActor(actorClerkUserId); assertOwner(actor);
      const target = await repository.findByFirebaseUid(trim(targetKey));
      if (!target || target.status === 'retired') throw serviceError('admin_target_not_found', 'Administrator account was not found.', 404);
      if (target.clerkUserId === actor.clerkUserId) throw serviceError('admin_self_lock_forbidden', 'Current administrator cannot lock their own account.', 409);
      const admin = await repository.setLock({ legacyAdminKey: target.legacyAdminKey, locked: Boolean(locked), reason: locked ? '최고 관리자 수동 잠금' : '' });
      return Object.freeze({ source: 'postgresql', account: serialize(admin) });
    },
    async retire({ actorClerkUserId, targetKey }) {
      const actor = await requireActor(actorClerkUserId);
      const target = await repository.findByFirebaseUid(trim(targetKey));
      if (!target || target.status === 'retired') throw serviceError('admin_target_not_found', 'Administrator account was not found.', 404);
      if (target.clerkUserId === actor.clerkUserId) throw serviceError('admin_self_delete_forbidden', 'Current administrator cannot delete their own account.', 409);
      if (target.adminRole === 'owner') {
        assertOwner(actor);
        const owners = (await repository.listActive()).filter((item) => item.adminRole === 'owner');
        if (owners.length <= 1) throw serviceError('last_owner_required', 'The last owner administrator cannot be deleted.', 409);
      }
      const retired = await repository.retire(target.legacyAdminKey);
      if (target.clerkUserId) await clerkClient.deleteUser(target.clerkUserId).catch((error) => { throw serviceError('admin_clerk_delete_failed', error?.message || 'Clerk administrator deletion failed.', 502); });
      return Object.freeze({ source: 'clerk-postgresql', account: serialize(retired) });
    },
  });
};
