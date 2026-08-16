import { createHash } from 'node:crypto';

const trim = (value) => String(value ?? '').normalize('NFKC').trim();
const lower = (value) => trim(value).toLocaleLowerCase('ko-KR');
const serviceError = (code, message, status = 400, details = null) => {
  const error = new Error(message);
  error.name = 'MemberAuthorityServiceError';
  error.code = code;
  error.status = status;
  if (details) error.details = details;
  return error;
};
const sha256 = (value) => createHash('sha256').update(String(value || '')).digest('hex');
const identityKey = (team, name) => sha256(`${lower(team).replace(/\s+/g, ' ')}\u001f${lower(name).replace(/\s+/g, '')}`);
const recoverySource = ({ team, name, phone }) => [lower(team).replace(/\s+/g, ' '), lower(name).replace(/\s+/g, ''), String(phone || '').replace(/\D/g, '')].join('\u001f');
const recoveryKey = (input) => sha256(recoverySource(input));
const validName = (value) => /^[가-힣A-Za-z]{2,30}$/u.test(trim(value).replace(/\s+/g, ''));
const validPhone = (value) => /^(02|0\d{2})-\d{3,4}-\d{4}$/.test(trim(value));

const maskSegment = (value) => {
  const segment = String(value || '');
  if (segment.length <= 1) return '*';
  if (segment.length === 2) return `${segment[0]}*`;
  return `${segment[0]}${'*'.repeat(segment.length - 2)}${segment.at(-1)}`;
};
const maskEmail = (value) => {
  const email = trim(value).toLowerCase();
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  const labels = domain.split('.');
  const koreanSuffixes = new Set(['ac.kr','co.kr','go.kr','mil.kr','ne.kr','or.kr','pe.kr','re.kr']);
  const lastTwo = labels.slice(-2).join('.');
  const keep = koreanSuffixes.has(lastTwo) ? 2 : 1;
  return `${maskSegment(local)}@${labels.map((label, index) => index >= labels.length - keep ? label : maskSegment(label)).join('.')}`;
};
const profileFromAccount = (account = {}, firebaseUid = '') => ({
  uid: firebaseUid || trim(account.uid),
  email: trim(account.email).toLowerCase(),
  maskedEmail: trim(account.maskedEmail),
  name: trim(account.name),
  team: trim(account.team).replace(/\s+/g, ' '),
  phone: trim(account.phone),
  status: trim(account.status),
  directoryMemberId: trim(account.directoryMemberId),
  directoryVerifiedVersion: Number(account.directoryVerifiedVersion || 0),
  profileRequiredReason: trim(account.profileRequiredReason),
  profileRequiredAt: account.profileRequiredAt || '',
  statusBeforeProfileRequired: trim(account.statusBeforeProfileRequired),
  rejoinedAccount: Boolean(account.rejoinedAccount),
  termsConsentRevision: Number(account.termsConsentRevision || 0),
  termsConsentPolicyVersion: Number(account.termsConsentPolicyVersion || 0),
  identityKey: trim(account.identityKey),
  recoveryKey: trim(account.recoveryKey),
  previousAccountUids: Array.isArray(account.previousAccountUids) ? account.previousAccountUids : [],
  createdAt: account.createdAt || null,
  updatedAt: account.updatedAt || null,
});

export const createMemberAuthorityService = ({
  repository,
  firebaseLinkRepository,
  userRepository,
  rentalRestrictionRepository,
  siteContentRepository,
}) => {
  if (!repository || typeof repository.mutateProfile !== 'function') throw new TypeError('Member authority repository is required.');
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.findByFirebaseUid !== 'function' || typeof firebaseLinkRepository.findByAppUserId !== 'function') throw new TypeError('firebaseLinkRepository is required.');
  if (!userRepository || typeof userRepository.findByClerkUserId !== 'function') throw new TypeError('userRepository is required.');
  if (!rentalRestrictionRepository || typeof rentalRestrictionRepository.findByFirebaseUid !== 'function') throw new TypeError('Rental restriction repository is required.');
  if (typeof repository.countBlockingRentalRequestsForUids !== 'function') throw new TypeError('PostgreSQL rental-request guard is required.');
  if (!siteContentRepository || typeof siteContentRepository.getDomain !== 'function') throw new TypeError('PostgreSQL site content repository is required.');
  if (typeof repository.findActiveIdentityOwner !== 'function' || typeof repository.findDirectoryEntryByIdentityKey !== 'function' || typeof repository.getDirectoryBootstrapState !== 'function' || typeof repository.replaceDirectoryEntries !== 'function') throw new TypeError('PostgreSQL member identity/directory repository contract is required.');

  const verifyAdmin = async (identity) => {
    if (identity?.source !== 'clerk-postgresql') throw serviceError('admin_postgresql_identity_required', 'Clerk/PostgreSQL administrator identity is required.', 401);
    return Object.freeze({ uid: identity.uid, role: 'admin', source: 'postgresql-admin-registry' });
  };

  const resolveTarget = async (firebaseUid) => {
    const link = await firebaseLinkRepository.findByFirebaseUid(firebaseUid);
    return { link, appUserId: link?.appUserId || null };
  };

  const verifySelf = async ({ clerkUserId }) => {
    const appUser = await userRepository.findByClerkUserId(clerkUserId);
    if (!appUser) throw serviceError('profile_not_synced', 'PostgreSQL user profile must be synchronized first.', 409);
    const link = await firebaseLinkRepository.findByAppUserId(appUser.id);
    if (!link || String(link.appUserId) !== String(appUser.id)) throw serviceError('legacy_link_token_mismatch', 'The current user authority does not match the linked Clerk user.', 409);
    return { appUser, link };
  };

  const ensureDirectoryBootstrap = async ({ version = 0 } = {}) => {
    const state = await repository.getDirectoryBootstrapState();
    if (state?.completed === true && Number(state.version || 0) >= Number(version || 0)) return state;
    throw serviceError('member_directory_postgresql_stale', 'PostgreSQL member directory must be synchronized by an administrator before member verification.', 503, { requiredVersion: Number(version || 0), synchronizedVersion: Number(state?.version || 0) });
  };

  const getPostgresqlMemberPolicySettings = async () => {
    const domain = await siteContentRepository.getDomain('rental-config');
    const item = domain?.documents?.find((entry) => entry.key === 'rentalSystem/publicConfig');
    if (!item) throw serviceError('member_policy_postgresql_missing', 'PostgreSQL member policy configuration has not been synchronized.', 503);
    return item?.payload?.settings && typeof item.payload.settings === 'object' ? item.payload.settings : {};
  };

  const buildProfileContext = async ({ targetUid, input }) => {
    const current = await repository.findByFirebaseUid(targetUid);
    if (!current) throw serviceError('member_account_not_synchronized', 'PostgreSQL member account must be synchronized before profile authority can be used.', 409);
    const name = trim(input?.name).replace(/\s+/g, '');
    const team = trim(input?.team).replace(/\s+/g, ' ');
    const phone = trim(input?.phone);
    if (!validName(name)) throw serviceError('member_invalid_name', 'Member name is invalid.', 400);
    if (!team) throw serviceError('member_invalid_team', 'Member team is required.', 400);
    if (!validPhone(phone)) throw serviceError('member_invalid_phone', 'Member phone number is invalid.', 400);
    const email = trim(current.email || input?.email).toLowerCase();
    const nextIdentityKey = identityKey(team, name);
    const nextRecoveryKey = recoveryKey({ team, name, phone });
    const owner = await repository.findActiveIdentityOwner(nextIdentityKey, targetUid);
    if (owner) throw serviceError('member_identity_conflict', 'Another member account already owns the requested name/team identity.', 409);
    const settings = await getPostgresqlMemberPolicySettings();
    const directoryRequired = Boolean(settings.requireRegisteredMemberForSignup);
    const directoryVersion = Math.max(0, Number(settings.memberDirectoryVersion || 0));
    let directory = null;
    if (directoryRequired) {
      await ensureDirectoryBootstrap({ version: directoryVersion });
      directory = await repository.findDirectoryEntryByIdentityKey(nextIdentityKey);
      if (!directory || directory.enabled === false || trim(directory.name).replace(/\s+/g, '') !== name || trim(directory.team).replace(/\s+/g, ' ') !== team) {
        throw serviceError('member_directory_mismatch', 'Registered member directory does not match the requested member profile.', 409);
      }
    }
    const restoreDirectoryMismatch = current.status === 'profileRequired' && current.profileRequiredReason === 'directoryMismatch';
    const nextStatus = restoreDirectoryMismatch ? 'active' : (trim(current.status) || 'pending');
    const nextProfile = {
      ...profileFromAccount(current, targetUid),
      email,
      maskedEmail: maskEmail(email),
      name,
      team,
      phone,
      status: nextStatus,
      identityKey: nextIdentityKey,
      recoveryKey: nextRecoveryKey,
      directoryMemberId: directoryRequired && directory ? trim(directory.directoryMemberId) : '',
      directoryVerifiedVersion: directoryRequired ? directoryVersion : 0,
      profileRequiredReason: restoreDirectoryMismatch ? '' : trim(current.profileRequiredReason),
    };
    return { current, nextProfile };
  };

  return Object.freeze({
    async getCurrentByFirebaseIdentity({ firebaseIdentity } = {}) {
      const firebaseUid = trim(firebaseIdentity?.uid);
      if (!firebaseUid) throw serviceError('firebase_identity_missing', 'Verified Firebase identity is required.', 401);
      const profile = await repository.findByFirebaseUid(firebaseUid);
      if (!profile) throw serviceError('member_account_not_synchronized', 'PostgreSQL member account was not found.', 404);
      const tokenEmail = trim(firebaseIdentity?.email).toLowerCase();
      const profileEmail = trim(profile.email).toLowerCase();
      if (tokenEmail && profileEmail && tokenEmail !== profileEmail) {
        throw serviceError('member_source_email_mismatch', 'Firebase identity email does not match the PostgreSQL member account.', 409);
      }
      return Object.freeze({
        source: 'postgresql-authoritative',
        authority: 'postgresql',
        profile: profileFromAccount(profile, firebaseUid),
        updatedAt: profile.updatedAt || null,
        syncedAt: profile.syncedAt || null,
      });
    },

    async verifySelfDirectory({ clerkUserId, firebaseIdentity } = {}) {
      const { appUser, link } = await verifySelf({ clerkUserId, firebaseIdentity });
      const targetUid = trim(link.firebaseUid);
      const current = await repository.findByFirebaseUid(targetUid);
      if (!current) {
        throw serviceError(
          'member_account_not_synchronized',
          'PostgreSQL member account was not found.',
          404
        );
      }

      const settings = await getPostgresqlMemberPolicySettings();
      const directoryRequired = Boolean(settings.requireRegisteredMemberForSignup);
      const directoryVersion = Math.max(0, Number(settings.memberDirectoryVersion || 0));
      const beforeProfile = profileFromAccount(current, targetUid);
      const normalizedName = trim(current.name).replace(/\s+/g, '');
      const normalizedTeam = trim(current.team).replace(/\s+/g, ' ');
      const currentIdentityKey = trim(current.identityKey) || identityKey(normalizedTeam, normalizedName);
      let nextProfile = { ...beforeProfile, identityKey: currentIdentityKey };
      let verified = true;
      let reason = '';

      if (!directoryRequired) {
        if (
          trim(current.status) === 'profileRequired' &&
          trim(current.profileRequiredReason) === 'directoryMismatch'
        ) {
          nextProfile = {
            ...nextProfile,
            status: 'active',
            directoryMemberId: '',
            directoryVerifiedVersion: 0,
            profileRequiredReason: '',
          };
        } else {
          nextProfile = {
            ...nextProfile,
            directoryMemberId: '',
            directoryVerifiedVersion: 0,
          };
        }
      } else {
        const directoryState = await repository.getDirectoryBootstrapState();
        if (
          directoryState?.completed !== true ||
          Number(directoryState?.version || 0) < directoryVersion
        ) {
          throw serviceError(
            'member_directory_postgresql_stale',
            'PostgreSQL member directory is not synchronized to the current policy version.',
            503,
            {
              requiredVersion: directoryVersion,
              synchronizedVersion: Number(directoryState?.version || 0),
            }
          );
        }

        const [directory, owner] = await Promise.all([
          repository.findDirectoryEntryByIdentityKey(currentIdentityKey),
          repository.findActiveIdentityOwner(currentIdentityKey, targetUid),
        ]);
        const directoryMatches = Boolean(
          directory &&
          directory.enabled !== false &&
          trim(directory.name).replace(/\s+/g, '') === normalizedName &&
          trim(directory.team).replace(/\s+/g, ' ') === normalizedTeam
        );

        if (owner) {
          verified = false;
          reason = 'duplicateIdentity';
        } else if (!directoryMatches) {
          verified = false;
          reason = 'directoryMismatch';
        }

        if (verified) {
          nextProfile = {
            ...nextProfile,
            status:
              trim(current.status) === 'profileRequired' &&
              ['directoryMismatch', 'duplicateIdentity'].includes(trim(current.profileRequiredReason))
                ? 'active'
                : trim(current.status),
            directoryMemberId: trim(directory.directoryMemberId),
            directoryVerifiedVersion: directoryVersion,
            profileRequiredReason: '',
          };
        } else {
          nextProfile = {
            ...nextProfile,
            status: 'profileRequired',
            directoryMemberId: directoryMatches ? trim(directory.directoryMemberId) : '',
            directoryVerifiedVersion: 0,
            profileRequiredReason: reason,
          };
        }
      }

      const changed = [
        'status',
        'directoryMemberId',
        'directoryVerifiedVersion',
        'profileRequiredReason',
        'identityKey',
      ].some((key) => String(beforeProfile[key] ?? '') !== String(nextProfile[key] ?? ''));

      let mutationId = '';
      if (changed) {
        const result = await repository.mutateProfile({
          appUserId: appUser.id,
          firebaseUid: targetUid,
          actorFirebaseUid: firebaseIdentity.uid,
          actorType: 'user',
          action: 'user-directory-membership-verify',
          beforeProfile,
          nextProfile,
          mirrorState: 'retired',
          beforeMirror: null,
        });
        mutationId = result.mutationId;
      }

      return Object.freeze({
        authority: 'postgresql',
        source: 'postgresql-authoritative',
        firestoreMirror: 'retired',
        policyEnabled: directoryRequired,
        directoryVersion,
        verified,
        reason,
        changed,
        mutationId,
        profile: nextProfile,
      });
    },

    async listAdminMembers({ firebaseIdentity, status = 'all', search = '', page = 1, pageSize = 10 } = {}) {
      const admin = await verifyAdmin(firebaseIdentity);
      const normalizedStatus = trim(status) || 'all';
      if (!['all','current','active','pending','blocked','retired','profileRequired'].includes(normalizedStatus)) {
        throw serviceError('member_status_filter_invalid', 'Unsupported member status filter.', 400);
      }
      if (typeof repository.listMembers !== 'function' || typeof repository.getStatusCounts !== 'function') {
        throw serviceError('member_admin_postgresql_read_unavailable', 'PostgreSQL member directory read is not configured.', 503);
      }
      const bootstrap = Object.freeze({ completed: true, source: 'postgresql-authoritative', target: 'postgresql', skipped: true });
      const [list, counts] = await Promise.all([
        repository.listMembers({ status: normalizedStatus, search: trim(search), page, pageSize }),
        repository.getStatusCounts(),
      ]);
      return Object.freeze({
        admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || 'admin') },
        source: 'postgresql',
        ...list,
        statusCounts: counts,
        bootstrap: bootstrap || null,
      });
    },

    async listAdminDirectory({ firebaseIdentity } = {}) {
      const admin = await verifyAdmin(firebaseIdentity);
      if (typeof repository.listDirectoryEntries !== 'function') {
        throw serviceError('member_directory_postgresql_read_unavailable', 'PostgreSQL member directory read is not configured.', 503);
      }
      const [entries, state] = await Promise.all([
        repository.listDirectoryEntries(),
        repository.getDirectoryBootstrapState(),
      ]);
      return Object.freeze({
        admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || 'admin') },
        source: 'postgresql',
        target: 'postgresql-member-directory',
        version: Math.max(0, Number(state?.version || 0)),
        entries,
      });
    },

    async editSelf({ clerkUserId, firebaseIdentity, input }) {
      const { appUser, link } = await verifySelf({ clerkUserId, firebaseIdentity });
      const targetUid = trim(link.firebaseUid);
      const context = await buildProfileContext({ targetUid, input });
      const beforeProfile = profileFromAccount(context.current, targetUid);
      const result = await repository.mutateProfile({
        appUserId: appUser.id,
        firebaseUid: targetUid,
        actorFirebaseUid: firebaseIdentity.uid,
        actorType: 'user',
        action: 'user-profile-edit',
        beforeProfile,
        nextProfile: context.nextProfile,
        mirrorState: 'retired',
        beforeMirror: null,
      });
      return Object.freeze({ authority: 'postgresql', source: 'postgresql-authoritative', firestoreMirror: 'retired', identitySource: 'postgresql', recoverySource: 'postgresql', mutationId: result.mutationId, profile: context.nextProfile });
    },

    async editAdmin({ firebaseIdentity, targetUid, input }) {
      const admin = await verifyAdmin(firebaseIdentity);
      const target = trim(targetUid);
      if (!target) throw serviceError('member_target_uid_missing', 'Target member UID is required.', 400);
      const { appUserId } = await resolveTarget(target);
      const context = await buildProfileContext({ targetUid: target, input });
      if (context.current.status === 'retired') throw serviceError('admin_member_edit_retired', 'Retired members are read-only. Re-registration must create a new member account.', 409);
      const beforeProfile = profileFromAccount(context.current, target);
      const result = await repository.mutateProfile({
        appUserId,
        firebaseUid: target,
        actorFirebaseUid: admin.uid,
        actorType: 'admin',
        action: 'admin-profile-edit',
        beforeProfile,
        nextProfile: context.nextProfile,
        mirrorState: 'retired',
        beforeMirror: null,
      });
      return Object.freeze({ admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || 'admin') }, authority: 'postgresql', source: 'postgresql-authoritative', firestoreMirror: 'retired', identitySource: 'postgresql', recoverySource: 'postgresql', mutationId: result.mutationId, profile: context.nextProfile });
    },

    async changeStatusAdmin({ firebaseIdentity, targetUid, nextStatus }) {
      const admin = await verifyAdmin(firebaseIdentity);
      const target = trim(targetUid);
      const status = trim(nextStatus);
      if (!['active','blocked'].includes(status)) throw serviceError('member_status_transition_invalid', 'This member status change requires its dedicated lifecycle action.', 409);
      const current = await repository.findByFirebaseUid(target);
      if (!current) throw serviceError('member_account_not_synchronized', 'PostgreSQL member account must be synchronized before status authority can be used.', 409);
      const currentStatus = trim(current.status);
      if (currentStatus === 'retired') throw serviceError('retired_member_reactivation_not_supported', 'A withdrawn member cannot be reactivated. Re-registration must create a new account.', 409);
      const allowed = (currentStatus === 'pending' && status === 'active') ||
        (currentStatus === 'blocked' && status === 'active') ||
        (['active','profileRequired'].includes(currentStatus) && status === 'blocked');
      if (!allowed) throw serviceError('member_status_transition_invalid', `Unsupported member status transition: ${currentStatus} -> ${status}`, 409);
      const { appUserId } = await resolveTarget(target);
      const beforeProfile = profileFromAccount(current, target);
      const nextProfile = { ...beforeProfile, status };
      if (status === 'active' && current.rejoinedAccount) {
        const linkedUids = Array.from(new Set([target, ...(Array.isArray(current.previousAccountUids) ? current.previousAccountUids : [])].map(trim).filter(Boolean)));
        const blockingRequests = await repository.countBlockingRentalRequestsForUids(linkedUids);
        if (blockingRequests > 0) throw serviceError('rejoined_member_active_requests', 'Previous account still has active rental requests.', 409, { count: blockingRequests });
        if (currentStatus === 'pending') {
          if (typeof repository.approveRejoinedMemberAndConsolidate !== 'function') {
            throw serviceError('rejoin_consolidation_authority_unavailable', 'Rejoined member consolidation authority is unavailable.', 503);
          }
          const consolidation = await repository.approveRejoinedMemberAndConsolidate({
            firebaseUid: target,
            appUserId,
            actorFirebaseUid: admin.uid,
          });
          return Object.freeze({
            admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || 'admin') },
            authority: 'postgresql', source: 'postgresql-authoritative', firestoreMirror: 'retired',
            restrictionAuthority: 'postgresql-consolidated', mutationId: consolidation.mutationId,
            profile: consolidation.profile,
            rejoinConsolidation: Object.freeze({
              completed: true,
              previousAccountUids: consolidation.previousAccountUids,
              transferCounts: consolidation.transferCounts,
            }),
          });
        }
      }
      const restrictionRecord = await rentalRestrictionRepository.findByFirebaseUid(target);
      const inherited = restrictionRecord?.exists && restrictionRecord.restriction ? restrictionRecord.restriction : {};
      const inheritedActive = Boolean(status === 'active' && current.rejoinedAccount && (
        inherited.manualBlock === true || inherited.indefinite === true || inherited.restrictionStatus === 'active' || (inherited.activePenalty === true && trim(inherited.eligibleFromDate) > new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))
      ));
      const nextRestriction = inheritedActive ? { ...inherited, uid: target, inheritedFromPreviousAccount: true } : null;
      const result = await repository.mutateStatus({
        appUserId, firebaseUid: target, actorFirebaseUid: admin.uid, nextStatus: status,
        beforeProfile, nextProfile, nextRestriction, mirrorState: 'retired', beforeMirror: null,
      });
      return Object.freeze({
        admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || 'admin') },
        authority: 'postgresql', source: 'postgresql-authoritative', firestoreMirror: 'retired',
        restrictionAuthority: nextRestriction ? 'postgresql' : 'unchanged', mutationId: result.mutationId, profile: nextProfile,
      });
    },

    async syncMemberDirectoryAdmin({ firebaseIdentity, entries = [], version = 0, teams = null, settings = null }) {
      const admin = await verifyAdmin(firebaseIdentity);
      const normalizedEntries = Array.isArray(entries) ? entries : [];
      const organizationConfigRequested = Array.isArray(teams) && settings && typeof settings === 'object' && !Array.isArray(settings);
      if (normalizedEntries.length === 0 && !organizationConfigRequested) {
        const state = await repository.getDirectoryBootstrapState();
        if (!state?.completed) {
          throw serviceError('member_directory_postgresql_missing', 'PostgreSQL member directory has not been initialized.', 409);
        }
        return Object.freeze({
          ...state,
          admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || admin.role || 'admin') },
          authority: 'postgresql',
          source: 'postgresql-existing',
          target: 'postgresql-member-directory',
          skipped: true,
        });
      }
      const state = await repository.replaceDirectoryEntries(normalizedEntries, {
        source: 'postgresql-admin-direct',
        version: Math.max(0, Number(version || 0)),
        teams,
        settings,
        actorClerkUserId: admin.uid,
      });
      return Object.freeze({
        ...state,
        admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || admin.role || 'admin') },
        authority: 'postgresql',
        source: 'postgresql-admin-direct',
        target: 'postgresql-member-directory',
        skipped: false,
      });
    },


    async restoreDirectoryMismatchAdmin({ firebaseIdentity } = {}) {
      const admin = await verifyAdmin(firebaseIdentity);
      if (typeof repository.listMembersForDirectoryAudit !== 'function') {
        throw serviceError('member_directory_postgresql_audit_unavailable', 'PostgreSQL member directory audit repository is unavailable.', 503);
      }
      const accounts = await repository.listMembersForDirectoryAudit();
      const targets = accounts.filter((account) =>
        trim(account.status) === 'profileRequired' && trim(account.profileRequiredReason) === 'directoryMismatch'
      );
      let restoredCount = 0;
      let failed = 0;
      for (const account of targets) {
        try {
          const beforeProfile = profileFromAccount(account, account.firebaseUid || account.uid);
          const nextProfile = {
            ...beforeProfile,
            status: 'active',
            directoryMemberId: '',
            directoryVerifiedVersion: 0,
            profileRequiredReason: '',
          };
          await repository.mutateProfile({
            appUserId: account.appUserId || null,
            firebaseUid: account.firebaseUid || account.uid,
            actorFirebaseUid: admin.uid,
            actorType: 'admin',
            action: 'admin-directory-policy-restore',
            beforeProfile,
            nextProfile,
            mirrorState: 'retired',
            beforeMirror: null,
          });
          restoredCount += 1;
        } catch {
          failed += 1;
        }
      }
      return Object.freeze({
        authority: 'postgresql',
        source: 'postgresql-authoritative',
        restoredCount,
        failed,
      });
    },

    async auditMemberDirectoryAdmin({ firebaseIdentity } = {}) {
      const admin = await verifyAdmin(firebaseIdentity);
      if (typeof repository.listMembersForDirectoryAudit !== 'function' || typeof repository.listDirectoryEntries !== 'function') {
        throw serviceError('member_directory_postgresql_audit_unavailable', 'PostgreSQL member directory audit repository is unavailable.', 503);
      }
      const settings = await getPostgresqlMemberPolicySettings();
      if (!Boolean(settings.requireRegisteredMemberForSignup)) {
        throw serviceError('member_directory_policy_disabled', 'Registered-member signup policy must be enabled before running the directory audit.', 409);
      }
      const directoryVersion = Math.max(0, Number(settings.memberDirectoryVersion || 0));
      const [accounts, directoryEntries, directoryState] = await Promise.all([
        repository.listMembersForDirectoryAudit(),
        repository.listDirectoryEntries(),
        repository.getDirectoryBootstrapState(),
      ]);
      if (directoryState?.completed !== true || Number(directoryState?.version || 0) < directoryVersion) {
        throw serviceError('member_directory_postgresql_stale', 'PostgreSQL member directory is not synchronized to the current policy version.', 503, {
          requiredVersion: directoryVersion,
          synchronizedVersion: Number(directoryState?.version || 0),
        });
      }

      const directoryByIdentityKey = new Map(
        directoryEntries
          .filter((entry) => entry?.enabled !== false && trim(entry?.identityKey))
          .map((entry) => [trim(entry.identityKey), entry])
      );
      const auditableStatuses = new Set(['pending', 'active', 'profileRequired']);
      const auditableAccounts = accounts.filter((account) => auditableStatuses.has(trim(account.status)));
      const groups = new Map();
      const prepared = auditableAccounts.map((account) => {
        const normalizedName = trim(account.name).replace(/\s+/g, '');
        const normalizedTeam = trim(account.team).replace(/\s+/g, ' ');
        const computedIdentityKey = normalizedName && normalizedTeam ? identityKey(normalizedTeam, normalizedName) : '';
        if (computedIdentityKey) {
          const group = groups.get(computedIdentityKey) || [];
          group.push(account);
          groups.set(computedIdentityKey, group);
        }
        return { account, normalizedName, normalizedTeam, computedIdentityKey };
      });

      let normal = 0;
      let profileRequired = 0;
      let missing = 0;
      let duplicateAccounts = 0;
      let failed = 0;
      for (const group of groups.values()) {
        if (group.length > 1) duplicateAccounts += group.length;
      }

      for (const item of prepared) {
        const { account, normalizedName, normalizedTeam, computedIdentityKey } = item;
        const group = computedIdentityKey ? (groups.get(computedIdentityKey) || []) : [];
        const isDuplicate = group.length > 1;
        const directory = computedIdentityKey ? directoryByIdentityKey.get(computedIdentityKey) : null;
        const directoryMatches = Boolean(
          directory &&
          trim(directory.name).replace(/\s+/g, '') === normalizedName &&
          trim(directory.team).replace(/\s+/g, ' ') === normalizedTeam
        );
        const beforeProfile = profileFromAccount(account, account.firebaseUid || account.uid);
        let nextProfile;
        if (!computedIdentityKey || !directoryMatches || isDuplicate) {
          if (!computedIdentityKey || !directoryMatches) missing += 1;
          profileRequired += 1;
          nextProfile = {
            ...beforeProfile,
            status: 'profileRequired',
            identityKey: isDuplicate ? trim(account.identityKey) : computedIdentityKey,
            directoryMemberId: directoryMatches ? trim(directory.directoryMemberId) : '',
            directoryVerifiedVersion: 0,
            profileRequiredReason: isDuplicate ? 'duplicateIdentity' : 'directoryMismatch',
          };
        } else {
          normal += 1;
          const shouldRestore = trim(account.status) === 'profileRequired' && ['directoryMismatch', 'duplicateIdentity'].includes(trim(account.profileRequiredReason));
          nextProfile = {
            ...beforeProfile,
            status: shouldRestore ? 'active' : trim(account.status),
            identityKey: computedIdentityKey,
            directoryMemberId: trim(directory.directoryMemberId),
            directoryVerifiedVersion: directoryVersion,
            profileRequiredReason: shouldRestore ? '' : trim(account.profileRequiredReason),
          };
        }
        const changed = ['status','identityKey','directoryMemberId','directoryVerifiedVersion','profileRequiredReason']
          .some((key) => String(beforeProfile[key] ?? '') !== String(nextProfile[key] ?? ''));
        if (!changed) continue;
        try {
          await repository.mutateProfile({
            appUserId: account.appUserId || null,
            firebaseUid: account.firebaseUid || account.uid,
            actorFirebaseUid: admin.uid,
            actorType: 'admin',
            action: 'admin-member-directory-audit',
            beforeProfile,
            nextProfile,
            mirrorState: 'retired',
            beforeMirror: null,
          });
        } catch (error) {
          failed += 1;
          if (directoryMatches && !isDuplicate) normal = Math.max(0, normal - 1);
          else profileRequired = Math.max(0, profileRequired - 1);
        }
      }

      const auditSummary = Object.freeze({
        total: auditableAccounts.length,
        normal,
        profileRequired,
        duplicates: duplicateAccounts,
        missing,
        failed,
        directoryVersion,
        completedAtText: new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Seoul' }).format(new Date()),
        completedBy: admin.uid,
        completedAt: new Date().toISOString(),
      });

      if (siteContentRepository && typeof siteContentRepository.getDomain === 'function' && typeof siteContentRepository.replaceDomain === 'function') {
        const current = await siteContentRepository.getDomain('rental-config');
        const documents = (current?.documents || []).map((document) => {
          if (document?.key !== 'rentalSystem/publicConfig') return document;
          const payload = document?.payload && typeof document.payload === 'object' ? document.payload : {};
          const currentSettings = payload?.settings && typeof payload.settings === 'object' ? payload.settings : {};
          return {
            key: document.key,
            payload: {
              ...payload,
              memberDirectoryAudit: auditSummary,
              settings: { ...currentSettings, memberIdentityClaimsReady: true },
              updatedAt: new Date().toISOString(),
            },
            enabled: document.enabled,
            sortOrder: document.sortOrder,
            sourceUpdatedAt: new Date().toISOString(),
          };
        });
        await siteContentRepository.replaceDomain({
          domain: 'rental-config',
          documents,
          actorClerkUserId: admin.uid,
          sourceMode: 'postgresql-admin-directory-audit',
        });
      }

      return Object.freeze({
        authority: 'postgresql',
        source: 'postgresql-authoritative',
        audit: auditSummary,
      });
    },

    async bootstrapAdminRegistry({ firebaseIdentity }) {
      const admin = await verifyAdmin(firebaseIdentity);
      if (firebaseIdentity?.source === 'clerk-postgresql') {
        return Object.freeze({
          admin: { uid: admin.uid },
          source: 'postgresql-existing',
          target: 'postgresql-admin-registry',
          count: 1,
          skipped: true,
        });
      }
      throw serviceError('legacy_admin_registry_bootstrap_retired', 'Legacy administrator registry bootstrap is retired; PostgreSQL is authoritative.', 410);
    },
  });
};
