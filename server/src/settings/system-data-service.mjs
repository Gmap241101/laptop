const trim = (value) => String(value ?? '').trim();

const serviceError = (code, message, status = 400) => {
  const error = new Error(message);
  error.name = 'SystemDataServiceError';
  error.code = code;
  error.status = status;
  return error;
};

const requireAdmin = (admin) => {
  if (!admin || !trim(admin.clerkUserId || admin.id || admin.firebaseUid)) {
    throw serviceError('admin_authority_required', 'Administrator authority is required.', 403);
  }
  return admin;
};

const requireOwner = (admin) => {
  requireAdmin(admin);
  if (trim(admin.adminRole).toLowerCase() !== 'owner') {
    throw serviceError('admin_owner_required', 'Owner administrator authority is required.', 403);
  }
  return admin;
};

export const createSystemDataService = ({ repository }) => {
  if (!repository) throw new TypeError('System data repository is required.');
  return Object.freeze({
    async getOverview(admin) {
      requireAdmin(admin);
      return repository.getOverview();
    },
    async checkIntegrity(admin) {
      requireAdmin(admin);
      return repository.checkIntegrity();
    },
    async repairAssetReferences(admin) {
      const owner = requireOwner(admin);
      return repository.repairAssetReferences({ actorClerkUserId: owner.clerkUserId || '' });
    },
    async exportSnapshot(admin, options = {}) {
      requireOwner(admin);
      return repository.exportSnapshot({
        includeOperations: options.includeOperations !== false,
        includeMembers: Boolean(options.includeMembers),
        includePersonalData: Boolean(options.includePersonalData),
      });
    },
  });
};
