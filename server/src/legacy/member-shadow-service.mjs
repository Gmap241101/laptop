import { createHash } from 'node:crypto';

const normalizeText = (value) => String(value ?? '').trim();
const normalizeEmail = (value) => normalizeText(value).toLowerCase();
const normalizeInteger = (value) => {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalizeArray = (value) => (Array.isArray(value) ? value : []);
const normalizeObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
};

const stableJson = (value) => JSON.stringify(stableValue(value));
const hashPayload = (value) => createHash('sha256').update(stableJson(value)).digest('hex');

const serviceError = (code, message) => {
  const error = new Error(message);
  error.name = 'MemberShadowServiceError';
  error.code = code;
  return error;
};

export const normalizeMemberSource = ({ document, firebaseUid }) => {
  const sourcePayload = normalizeObject(document?.fields);
  const uid = normalizeText(sourcePayload.uid);
  if (!uid || uid !== firebaseUid) {
    throw serviceError('member_source_uid_mismatch', 'Firestore userAccounts UID does not match the verified Firebase user.');
  }

  return Object.freeze({
    sourceDocumentPath: normalizeText(document?.name),
    uid,
    email: normalizeText(sourcePayload.email),
    maskedEmail: normalizeText(sourcePayload.maskedEmail),
    name: normalizeText(sourcePayload.name),
    team: normalizeText(sourcePayload.team),
    phone: normalizeText(sourcePayload.phone),
    status: normalizeText(sourcePayload.status),
    directoryMemberId: normalizeText(sourcePayload.directoryMemberId),
    directoryVerifiedVersion: normalizeInteger(sourcePayload.directoryVerifiedVersion),
    profileRequiredReason: normalizeText(sourcePayload.profileRequiredReason),
    rejoinedAccount: Boolean(sourcePayload.rejoinedAccount),
    termsConsentRevision: normalizeInteger(sourcePayload.termsConsentRevision),
    termsConsentPolicyVersion: normalizeInteger(sourcePayload.termsConsentPolicyVersion),
    identityKey: normalizeText(sourcePayload.identityKey),
    recoveryKey: normalizeText(sourcePayload.recoveryKey),
    previousAccountUids: normalizeArray(sourcePayload.previousAccountUids)
      .map((value) => normalizeText(value))
      .filter(Boolean),
    sourceCreatedAt: sourcePayload.createdAt || document?.createTime || null,
    sourceUpdatedAt: sourcePayload.updatedAt || document?.updateTime || null,
    sourceHash: hashPayload(sourcePayload),
  });
};

const comparableShadow = (shadow) => ({
  uid: shadow.uid,
  email: shadow.email,
  maskedEmail: shadow.maskedEmail,
  name: shadow.name,
  team: shadow.team,
  phone: shadow.phone,
  status: shadow.status,
  directoryMemberId: shadow.directoryMemberId,
  directoryVerifiedVersion: shadow.directoryVerifiedVersion,
  profileRequiredReason: shadow.profileRequiredReason,
  rejoinedAccount: shadow.rejoinedAccount,
  termsConsentRevision: shadow.termsConsentRevision,
  termsConsentPolicyVersion: shadow.termsConsentPolicyVersion,
  identityKey: shadow.identityKey,
  recoveryKey: shadow.recoveryKey,
  previousAccountUids: shadow.previousAccountUids,
});

const comparableSource = (source) => ({
  uid: source.uid,
  email: source.email,
  maskedEmail: source.maskedEmail,
  name: source.name,
  team: source.team,
  phone: source.phone,
  status: source.status,
  directoryMemberId: source.directoryMemberId,
  directoryVerifiedVersion: source.directoryVerifiedVersion,
  profileRequiredReason: source.profileRequiredReason,
  rejoinedAccount: source.rejoinedAccount,
  termsConsentRevision: source.termsConsentRevision,
  termsConsentPolicyVersion: source.termsConsentPolicyVersion,
  identityKey: source.identityKey,
  recoveryKey: source.recoveryKey,
  previousAccountUids: source.previousAccountUids,
});

const changedFields = (shadow, source) => {
  const left = comparableShadow(shadow);
  const right = comparableSource(source);
  return Object.keys(right).filter((key) => stableJson(left[key]) !== stableJson(right[key]));
};

export const createMemberShadowService = ({
  userRepository,
  firebaseLinkRepository,
  memberShadowRepository,
  firestoreUserAccountClient,
}) => {
  if (!userRepository || typeof userRepository.findByClerkUserId !== 'function') {
    throw new TypeError('userRepository.findByClerkUserId() is required.');
  }
  if (
    !firebaseLinkRepository ||
    typeof firebaseLinkRepository.findByAppUserId !== 'function' ||
    typeof firebaseLinkRepository.findByFirebaseUid !== 'function'
  ) {
    throw new TypeError('firebaseLinkRepository findByAppUserId/findByFirebaseUid methods are required.');
  }
  if (!memberShadowRepository || typeof memberShadowRepository.findByAppUserId !== 'function' || typeof memberShadowRepository.upsert !== 'function') {
    throw new TypeError('memberShadowRepository find/upsert methods are required.');
  }
  if (!firestoreUserAccountClient || typeof firestoreUserAccountClient.getUserAccount !== 'function') {
    throw new TypeError('firestoreUserAccountClient.getUserAccount() is required.');
  }

  const context = async (clerkUserId) => {
    const appUser = await userRepository.findByClerkUserId(clerkUserId);
    if (!appUser) throw serviceError('profile_not_synced', 'PostgreSQL user profile must be synchronized first.');
    const firebaseLink = await firebaseLinkRepository.findByAppUserId(appUser.id);
    if (!firebaseLink) throw serviceError('legacy_link_not_found', 'Firebase legacy identity must be linked first.');
    return { appUser, firebaseLink };
  };

  const verifyFirebaseContext = ({ firebaseIdentity, firebaseLink }) => {
    if (!firebaseIdentity?.uid || firebaseIdentity.uid !== firebaseLink.firebaseUid) {
      throw serviceError('legacy_link_token_mismatch', 'The current Firebase session does not match the linked legacy identity.');
    }
    if (!firebaseIdentity.idToken) {
      throw serviceError('firebase_id_token_missing', 'The verified Firebase request did not retain its ID token.');
    }
  };

  const readSource = async ({ appUser, firebaseLink, firebaseIdentity }) => {
    verifyFirebaseContext({ firebaseIdentity, firebaseLink });
    const document = await firestoreUserAccountClient.getUserAccount({
      firebaseUid: firebaseLink.firebaseUid,
      firebaseIdToken: firebaseIdentity.idToken,
    });
    if (!document) throw serviceError('member_source_not_found', 'Firestore userAccounts document does not exist.');
    const source = normalizeMemberSource({ document, firebaseUid: firebaseLink.firebaseUid });
    const sourceEmail = normalizeEmail(source.email);
    const appEmail = normalizeEmail(appUser.primaryEmail);
    if (sourceEmail && appEmail && sourceEmail !== appEmail) {
      throw serviceError('member_source_email_mismatch', 'Firestore member email does not match the linked Clerk/PostgreSQL profile.');
    }
    return source;
  };

  return Object.freeze({
    async getCurrent(clerkUserId) {
      const { appUser } = await context(clerkUserId);
      return memberShadowRepository.findByAppUserId(appUser.id);
    },

    async getCurrentByFirebaseIdentity(firebaseIdentity) {
      const firebaseUid = normalizeText(firebaseIdentity?.uid);
      if (!firebaseUid) throw serviceError('firebase_identity_missing', 'Verified Firebase identity is required.');
      const firebaseLink = await firebaseLinkRepository.findByFirebaseUid(firebaseUid);
      if (!firebaseLink) throw serviceError('legacy_link_not_found', 'Firebase legacy identity has not been linked.');
      const tokenEmail = normalizeEmail(firebaseIdentity?.email);
      const linkedEmail = normalizeEmail(firebaseLink.firebaseEmail);
      if (tokenEmail && linkedEmail && tokenEmail !== linkedEmail) {
        throw serviceError('firebase_link_email_mismatch', 'Firebase token email does not match the linked identity.');
      }
      return memberShadowRepository.findByAppUserId(firebaseLink.appUserId);
    },

    async readCurrentSourceByFirebaseIdentity(firebaseIdentity) {
      const firebaseUid = normalizeText(firebaseIdentity?.uid);
      if (!firebaseUid) throw serviceError('firebase_identity_missing', 'Verified Firebase identity is required.');
      const firebaseLink = await firebaseLinkRepository.findByFirebaseUid(firebaseUid);
      if (!firebaseLink) throw serviceError('legacy_link_not_found', 'Firebase legacy identity has not been linked.');
      const tokenEmail = normalizeEmail(firebaseIdentity?.email);
      const linkedEmail = normalizeEmail(firebaseLink.firebaseEmail);
      if (tokenEmail && linkedEmail && tokenEmail !== linkedEmail) {
        throw serviceError('firebase_link_email_mismatch', 'Firebase token email does not match the linked identity.');
      }
      if (!firebaseIdentity.idToken) {
        throw serviceError('firebase_id_token_missing', 'The verified Firebase request did not retain its ID token.');
      }
      const document = await firestoreUserAccountClient.getUserAccount({
        firebaseUid,
        firebaseIdToken: firebaseIdentity.idToken,
      });
      if (!document) throw serviceError('member_source_not_found', 'Firestore userAccounts document does not exist.');
      const source = normalizeMemberSource({ document, firebaseUid });
      const sourceEmail = normalizeEmail(source.email);
      if (sourceEmail && linkedEmail && sourceEmail !== linkedEmail) {
        throw serviceError('member_source_email_mismatch', 'Firestore member email does not match the linked Firebase identity.');
      }
      return source;
    },

    async syncCurrent(clerkUserId, firebaseIdentity) {
      const { appUser, firebaseLink } = await context(clerkUserId);
      const source = await readSource({ appUser, firebaseLink, firebaseIdentity });
      return memberShadowRepository.upsert(appUser.id, firebaseLink.firebaseUid, source);
    },

    async compareCurrent(clerkUserId, firebaseIdentity) {
      const { appUser, firebaseLink } = await context(clerkUserId);
      const shadow = await memberShadowRepository.findByAppUserId(appUser.id);
      if (!shadow) throw serviceError('member_shadow_not_found', 'Member shadow has not been synchronized yet.');
      const source = await readSource({ appUser, firebaseLink, firebaseIdentity });
      const differences = changedFields(shadow, source);
      if (shadow.sourceHash !== source.sourceHash && differences.length === 0) {
        differences.push('sourcePayload');
      }
      return Object.freeze({
        equivalent: shadow.sourceHash === source.sourceHash && differences.length === 0,
        sourceHash: source.sourceHash,
        shadowHash: shadow.sourceHash,
        changedFields: differences,
        sourceUpdatedAt: source.sourceUpdatedAt,
        shadowSyncedAt: shadow.syncedAt,
      });
    },
  });
};
