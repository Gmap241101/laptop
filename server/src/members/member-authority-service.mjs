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
const recoveryVerifier = ({ email, ...rest }) => sha256(['password-reset-v1', recoverySource(rest), trim(email).toLowerCase()].join('\u001f'));
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
const currentClaimUid = (claim = {}) => trim(claim.currentUid || claim.uid);
const formerUids = (claim = {}) => Array.from(new Set((Array.isArray(claim.formerUids) ? claim.formerUids : []).map(trim).filter(Boolean)));
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
  firestoreClient = null,
  rentalRestrictionRepository = null,
  writeMirrorEnabled = true,
  profileWriteMirrorEnabled = true,
  siteContentRepository = null,
  userFirebaseAuthCompatibilityDisabled = false,
}) => {
  if (!repository || typeof repository.mutateProfile !== 'function') throw new TypeError('Member authority repository is required.');
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.findByFirebaseUid !== 'function') throw new TypeError('firebaseLinkRepository is required.');
  if (!userRepository || typeof userRepository.findByClerkUserId !== 'function') throw new TypeError('userRepository is required.');
  if (!writeMirrorEnabled && (!rentalRestrictionRepository || typeof rentalRestrictionRepository.findByFirebaseUid !== 'function')) throw new TypeError('Rental restriction repository is required when member/restriction Firestore write mirror is retired.');
  if (!writeMirrorEnabled && typeof repository.countBlockingRentalRequestsForUids !== 'function') throw new TypeError('PostgreSQL rental-request guard is required when member status authority is enabled.');
  if (!writeMirrorEnabled && (typeof repository.getFullBootstrapState !== 'function' || typeof repository.bootstrapMemberAccounts !== 'function')) throw new TypeError('PostgreSQL member full-bootstrap repository contract is required when member status authority is enabled.');
  if (!profileWriteMirrorEnabled && (!siteContentRepository || typeof siteContentRepository.getDomain !== 'function')) throw new TypeError('PostgreSQL site content repository is required when member profile authority is enabled.');
  if (!profileWriteMirrorEnabled && (typeof repository.findActiveIdentityOwner !== 'function' || typeof repository.findDirectoryEntryByIdentityKey !== 'function' || typeof repository.getDirectoryBootstrapState !== 'function' || typeof repository.replaceDirectoryEntries !== 'function')) throw new TypeError('PostgreSQL member identity/directory repository contract is required when member profile authority is enabled.');

  const verifyAdmin = async (identity) => {
    if (identity?.source !== 'clerk-postgresql') throw serviceError('admin_postgresql_identity_required', 'Clerk/PostgreSQL administrator identity is required.', 401);
    return Object.freeze({ uid: identity.uid, role: 'admin', source: 'postgresql-admin-registry' });
  };

  const resolveTarget = async (firebaseUid) => {
    const link = await firebaseLinkRepository.findByFirebaseUid(firebaseUid);
    return { link, appUserId: link?.appUserId || null };
  };

  const ensureFullMemberBootstrap = async () => {
    if (writeMirrorEnabled) return null;
    const existingState = await repository.getFullBootstrapState();
    return existingState?.completed === true
      ? existingState
      : Object.freeze({ completed: true, source: 'postgresql-authoritative', target: 'postgresql', skipped: true });
  };

  const verifySelf = async ({ clerkUserId, firebaseIdentity }) => {
    const appUser = await userRepository.findByClerkUserId(clerkUserId);
    if (!appUser) throw serviceError('profile_not_synced', 'PostgreSQL user profile must be synchronized first.', 409);
    const requestedUid = trim(firebaseIdentity?.uid);
    const link = userFirebaseAuthCompatibilityDisabled
      ? await firebaseLinkRepository.findByAppUserId(appUser.id)
      : await firebaseLinkRepository.findByFirebaseUid(requestedUid);
    if (!link || String(link.appUserId) !== String(appUser.id)) throw serviceError('legacy_link_token_mismatch', 'The current user authority does not match the linked Clerk user.', 409);
    if (!userFirebaseAuthCompatibilityDisabled && requestedUid && trim(link.firebaseUid) !== requestedUid) throw serviceError('legacy_link_token_mismatch', 'The current Firebase session does not match the linked Clerk user.', 409);
    return { appUser, link };
  };

  const ensureDirectoryBootstrap = async ({ version = 0 } = {}) => {
    if (profileWriteMirrorEnabled) return null;
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

  const buildProfileContext = async ({ firebaseIdentity, targetUid, input }) => {
    if (!profileWriteMirrorEnabled) {
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
        await ensureDirectoryBootstrap({ firebaseIdentity, version: directoryVersion });
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
      return { currentDoc: null, current, nextProfile, nextClaim: null, nextClaimExists: false, previousClaim: null, previousClaimUpdateTime: '', nextRecovery: null, previousRecoveryKey: trim(current.recoveryKey) };
    }

    const currentDoc = await firestoreClient.getUserAccount({ firebaseUid: targetUid, firebaseIdToken: firebaseIdentity.idToken });
    if (!currentDoc) throw serviceError('member_account_not_found', 'Member account was not found.', 404);
    const current = currentDoc.fields || {};
    const name = trim(input?.name).replace(/\s+/g, '');
    const team = trim(input?.team).replace(/\s+/g, ' ');
    const phone = trim(input?.phone);
    if (!validName(name)) throw serviceError('member_invalid_name', 'Member name is invalid.', 400);
    if (!team) throw serviceError('member_invalid_team', 'Member team is required.', 400);
    if (!validPhone(phone)) throw serviceError('member_invalid_phone', 'Member phone number is invalid.', 400);
    const email = trim(current.email || input?.email).toLowerCase();
    const nextIdentityKey = identityKey(team, name);
    const nextRecoveryKey = recoveryKey({ team, name, phone });
    const nextRecoveryVerifier = recoveryVerifier({ email, team, name, phone });
    const previousIdentityKey = trim(current.identityKey) || (current.name && current.team ? identityKey(current.team, current.name) : '');
    const previousRecoveryKey = trim(current.recoveryKey);
    const [configDoc, nextClaimDoc, previousClaimDoc] = await Promise.all([
      firestoreClient.getPublicConfig({ firebaseIdToken: firebaseIdentity.idToken }),
      firestoreClient.getIdentityClaim({ identityKey: nextIdentityKey, firebaseIdToken: firebaseIdentity.idToken }),
      previousIdentityKey && previousIdentityKey !== nextIdentityKey
        ? firestoreClient.getIdentityClaim({ identityKey: previousIdentityKey, firebaseIdToken: firebaseIdentity.idToken })
        : Promise.resolve(null),
    ]);
    const settings = configDoc?.fields?.settings && typeof configDoc.fields.settings === 'object' ? configDoc.fields.settings : {};
    const directoryRequired = Boolean(settings.requireRegisteredMemberForSignup);
    const directoryVersion = Math.max(0, Number(settings.memberDirectoryVersion || 0));
    let directory = null;
    if (directoryRequired) {
      const directoryDoc = await firestoreClient.getDirectoryMember({ identityKey: nextIdentityKey, firebaseIdToken: firebaseIdentity.idToken });
      directory = directoryDoc?.fields || null;
      if (!directory || directory.enabled === false || trim(directory.name).replace(/\s+/g, '') !== name || trim(directory.team).replace(/\s+/g, ' ') !== team) {
        throw serviceError('member_directory_mismatch', 'Registered member directory does not match the requested member profile.', 409);
      }
    }
    const nextClaim = nextClaimDoc?.fields || {};
    const claimUid = currentClaimUid(nextClaim);
    const former = formerUids(nextClaim);
    const claimStatus = trim(nextClaim.status) || (claimUid ? 'active' : 'released');
    if (nextClaimDoc && (nextClaim.conflict === true || (claimUid && claimUid !== targetUid) || (!claimUid && claimStatus === 'released' && former.length > 0 && !former.includes(targetUid)))) {
      throw serviceError('member_identity_conflict', 'Another member account already owns the requested name/team identity.', 409);
    }
    const restoreDirectoryMismatch = current.status === 'profileRequired' && current.profileRequiredReason === 'directoryMismatch';
    const nextStatus = restoreDirectoryMismatch
      ? (['active','pending'].includes(trim(current.statusBeforeProfileRequired)) ? trim(current.statusBeforeProfileRequired) : 'active')
      : (trim(current.status) || 'pending');
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
      profileRequiredAt: restoreDirectoryMismatch ? '' : (current.profileRequiredAt || ''),
      statusBeforeProfileRequired: restoreDirectoryMismatch ? '' : trim(current.statusBeforeProfileRequired),
    };
    return {
      currentDoc,
      current,
      nextProfile,
      nextClaim: { ...nextClaim, formerUids: former },
      nextClaimExists: Boolean(nextClaimDoc),
      previousClaim: previousClaimDoc ? { identityKey: previousIdentityKey, currentUid: currentClaimUid(previousClaimDoc.fields || {}), formerUids: formerUids(previousClaimDoc.fields || {}) } : null,
      previousClaimUpdateTime: previousClaimDoc?.updateTime || '',
      nextRecovery: { recoveryKey: nextRecoveryKey, maskedEmail: nextProfile.maskedEmail, emailVerifier: nextRecoveryVerifier },
      previousRecoveryKey,
    };
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

      if (profileWriteMirrorEnabled) {
        throw serviceError(
          'member_directory_postgresql_authority_disabled',
          'PostgreSQL member directory verification authority is not enabled.',
          409
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
      if (!['all','active','pending','blocked','retired','profileRequired'].includes(normalizedStatus)) {
        throw serviceError('member_status_filter_invalid', 'Unsupported member status filter.', 400);
      }
      if (typeof repository.listMembers !== 'function' || typeof repository.getStatusCounts !== 'function') {
        throw serviceError('member_admin_postgresql_read_unavailable', 'PostgreSQL member directory read is not configured.', 503);
      }
      const bootstrap = await ensureFullMemberBootstrap({ firebaseIdentity });
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
      const context = await buildProfileContext({ firebaseIdentity, targetUid, input });
      const beforeProfile = profileFromAccount(context.current, targetUid);
      const result = await repository.mutateProfile({
        appUserId: appUser.id,
        firebaseUid: targetUid,
        actorFirebaseUid: firebaseIdentity.uid,
        actorType: 'user',
        action: 'user-profile-edit',
        beforeProfile,
        nextProfile: context.nextProfile,
        mirrorState: profileWriteMirrorEnabled ? 'synced' : 'retired',
        beforeMirror: profileWriteMirrorEnabled ? () => firestoreClient.commitProfileEdit({
          targetUid,
          currentAccount: context.current,
          currentAccountUpdateTime: context.currentDoc.updateTime,
          nextProfile: context.nextProfile,
          nextClaim: context.nextClaim,
          nextClaimExists: context.nextClaimExists,
          previousClaim: context.previousClaim,
          previousClaimUpdateTime: context.previousClaimUpdateTime,
          nextRecovery: context.nextRecovery,
          previousRecoveryKey: context.previousRecoveryKey,
          firebaseIdToken: firebaseIdentity.idToken,
        }) : null,
      });
      return Object.freeze({ authority: 'postgresql', source: profileWriteMirrorEnabled ? 'firestore-compatibility' : 'postgresql-authoritative', firestoreMirror: profileWriteMirrorEnabled ? 'synced' : 'retired', identitySource: profileWriteMirrorEnabled ? 'firestore-compatibility' : 'postgresql', recoverySource: 'postgresql', mutationId: result.mutationId, profile: context.nextProfile });
    },

    async editAdmin({ firebaseIdentity, targetUid, input }) {
      const admin = await verifyAdmin(firebaseIdentity);
      const target = trim(targetUid);
      if (!target) throw serviceError('member_target_uid_missing', 'Target member UID is required.', 400);
      const { appUserId } = await resolveTarget(target);
      const context = await buildProfileContext({ firebaseIdentity, targetUid: target, input });
      if (context.current.status === 'retired') throw serviceError('admin_member_edit_retired', 'Retired member must be resumed before editing.', 409);
      const beforeProfile = profileFromAccount(context.current, target);
      const result = await repository.mutateProfile({
        appUserId,
        firebaseUid: target,
        actorFirebaseUid: admin.uid,
        actorType: 'admin',
        action: 'admin-profile-edit',
        beforeProfile,
        nextProfile: context.nextProfile,
        mirrorState: profileWriteMirrorEnabled ? 'synced' : 'retired',
        beforeMirror: profileWriteMirrorEnabled ? () => firestoreClient.commitProfileEdit({
          targetUid: target,
          currentAccount: context.current,
          currentAccountUpdateTime: context.currentDoc.updateTime,
          nextProfile: context.nextProfile,
          nextClaim: context.nextClaim,
          nextClaimExists: context.nextClaimExists,
          previousClaim: context.previousClaim,
          previousClaimUpdateTime: context.previousClaimUpdateTime,
          nextRecovery: context.nextRecovery,
          previousRecoveryKey: context.previousRecoveryKey,
          firebaseIdToken: firebaseIdentity.idToken,
        }) : null,
      });
      return Object.freeze({ admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || 'admin') }, authority: 'postgresql', source: profileWriteMirrorEnabled ? 'firestore-compatibility' : 'postgresql-authoritative', firestoreMirror: profileWriteMirrorEnabled ? 'synced' : 'retired', identitySource: profileWriteMirrorEnabled ? 'firestore-compatibility' : 'postgresql', recoverySource: 'postgresql', mutationId: result.mutationId, profile: context.nextProfile });
    },

    async changeStatusAdmin({ firebaseIdentity, targetUid, nextStatus }) {
      const admin = await verifyAdmin(firebaseIdentity);
      const target = trim(targetUid);
      const status = trim(nextStatus);
      if (!['active','pending','blocked','retired','profileRequired'].includes(status)) throw serviceError('member_status_invalid', 'Unsupported member status.', 400);
      let current = null;
      let currentDoc = null;
      if (writeMirrorEnabled) {
        currentDoc = await firestoreClient.getUserAccount({ firebaseUid: target, firebaseIdToken: firebaseIdentity.idToken });
        if (!currentDoc) throw serviceError('member_account_not_found', 'Member account was not found.', 404);
        current = currentDoc.fields || {};
      } else {
        current = await repository.findByFirebaseUid(target);
        if (!current) throw serviceError('member_account_not_synchronized', 'PostgreSQL member account must be synchronized before status authority can be used.', 409);
      }
      const { appUserId } = await resolveTarget(target);
      const beforeProfile = profileFromAccount(current, target);
      const nextProfile = { ...beforeProfile, status };
      if (!writeMirrorEnabled && status === 'active' && current.rejoinedAccount) {
        const linkedUids = Array.from(new Set([target, ...(Array.isArray(current.previousAccountUids) ? current.previousAccountUids : [])].map(trim).filter(Boolean)));
        const blockingRequests = await repository.countBlockingRentalRequestsForUids(linkedUids);
        if (blockingRequests > 0) {
          throw serviceError('rejoined_member_active_requests', 'Previous account still has active rental requests.', 409, { count: blockingRequests });
        }
      }
      let inherited = {};
      if (!writeMirrorEnabled) {
        const restrictionShadow = await rentalRestrictionRepository.findByFirebaseUid(target);
        inherited = restrictionShadow?.exists && restrictionShadow.restriction ? restrictionShadow.restriction : {};
      } else {
        inherited = current.inheritedRestriction && typeof current.inheritedRestriction === 'object' ? current.inheritedRestriction : {};
      }
      const inheritedActive = Boolean(status === 'active' && current.rejoinedAccount && (
        inherited.manualBlock === true || inherited.indefinite === true || inherited.restrictionStatus === 'active' || (inherited.activePenalty === true && trim(inherited.eligibleFromDate) > new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))
      ));
      const nextRestriction = inheritedActive ? { ...inherited, uid: target, inheritedFromPreviousAccount: true } : null;
      const result = await repository.mutateStatus({
        appUserId,
        firebaseUid: target,
        actorFirebaseUid: admin.uid,
        nextStatus: status,
        beforeProfile,
        nextProfile,
        nextRestriction,
        mirrorState: writeMirrorEnabled ? 'synced' : 'retired',
        beforeMirror: writeMirrorEnabled ? () => firestoreClient.commitStatusChange({
          targetUid: target,
          nextStatus: status,
          recoveryKey: trim(current.recoveryKey),
          inheritedRestriction: nextRestriction,
          firebaseIdToken: firebaseIdentity.idToken,
        }) : null,
      });
      return Object.freeze({
        admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || 'admin') },
        authority: 'postgresql',
        source: writeMirrorEnabled ? 'firestore-compatibility' : 'postgresql-authoritative',
        firestoreMirror: writeMirrorEnabled ? 'synced' : 'retired',
        restrictionAuthority: nextRestriction ? 'postgresql' : 'unchanged',
        mutationId: result.mutationId,
        profile: nextProfile,
      });
    },

    async syncMemberDirectoryAdmin({ firebaseIdentity, entries = [], version = 0 }) {
      const admin = await verifyAdmin(firebaseIdentity);
      const normalizedEntries = Array.isArray(entries) ? entries : [];
      if (normalizedEntries.length === 0) {
        const state = await repository.getDirectoryBootstrapState();
        if (!state?.completed) {
          throw serviceError('member_directory_postgresql_missing', 'PostgreSQL member directory has not been initialized.', 409);
        }
        return Object.freeze({
          admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || admin.role || 'admin') },
          source: 'postgresql-existing',
          target: 'postgresql-member-directory',
          skipped: true,
          ...state,
        });
      }
      const state = await repository.replaceDirectoryEntries(normalizedEntries, {
        source: 'postgresql-admin-direct',
        version: Math.max(0, Number(version || 0)),
      });
      return Object.freeze({
        admin: { uid: admin.uid, role: trim(admin.fields?.adminRole || admin.role || 'admin') },
        source: 'postgresql-admin-direct',
        target: 'postgresql-member-directory',
        skipped: false,
        ...state,
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
