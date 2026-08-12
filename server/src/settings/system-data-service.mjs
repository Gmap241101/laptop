const trim = (value) => String(value ?? '').trim();
const RESET_SCOPES = new Set(['assets', 'members', 'rentals', 'organization', 'content', 'settings']);
const RESET_CONFIRM_TEXT = '테스트 데이터 전체 초기화';

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
    async getResetCounts(admin, scopes = []) {
      requireOwner(admin);
      const selected = [...new Set((Array.isArray(scopes) ? scopes : []).map((value) => trim(value).toLowerCase()).filter((value) => RESET_SCOPES.has(value)))];
      if (selected.length === 0) throw serviceError('system_data_reset_scope_required', 'At least one reset scope is required.', 400);
      return repository.getResetCounts(selected);
    },
    async resetScopes(admin, { scopes = [], confirmText = '', backupConfirmed = false } = {}) {
      const owner = requireOwner(admin);
      const selected = [...new Set((Array.isArray(scopes) ? scopes : []).map((value) => trim(value).toLowerCase()).filter((value) => RESET_SCOPES.has(value)))];
      if (selected.length === 0) throw serviceError('system_data_reset_scope_required', 'At least one reset scope is required.', 400);
      if (trim(confirmText) !== RESET_CONFIRM_TEXT) throw serviceError('system_data_reset_confirmation_invalid', 'Reset confirmation text is invalid.', 400);
      if (backupConfirmed !== true) throw serviceError('system_data_reset_backup_required', 'A PostgreSQL backup must be created before reset.', 409);
      return repository.resetScopes({ scopes: selected, actorClerkUserId: owner.clerkUserId || '' });
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
