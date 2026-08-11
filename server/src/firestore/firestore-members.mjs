import { decodeFirestoreDocument } from './firestore-user-account.mjs';

const DEFAULT_TIMEOUT_MS = 8000;
const trim = (value) => String(value ?? '').trim();
const createError = (code, message, status = null) => {
  const error = new Error(message);
  error.name = 'FirestoreMemberAuthorityError';
  error.code = code;
  error.status = status;
  return error;
};

const encodeValue = (value) => {
  if (value == null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encodeValue(nested)])) } };
  return { stringValue: String(value) };
};
const encodeFields = (payload = {}) => Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, encodeValue(value)]));

export const createFirestoreMemberAuthorityClient = ({ projectId, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch }) => {
  const normalizedProjectId = trim(projectId);
  if (!normalizedProjectId) throw new TypeError('Firebase projectId is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}/databases/(default)/documents`;
  const documentName = (path) => `projects/${normalizedProjectId}/databases/(default)/documents/${path}`;

  const requestJson = async ({ url, firebaseIdToken, method = 'GET', body = null, codePrefix }) => {
    const token = trim(firebaseIdToken);
    if (!token) throw createError('firebase_id_token_missing', 'Firebase ID token is required.', 401);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 401) throw createError(`${codePrefix}_unauthorized`, 'Firestore rejected the Firebase ID token.', 401);
      if (response.status === 403) throw createError(`${codePrefix}_forbidden`, 'Firestore Security Rules rejected the member operation.', 403);
      if (response.status === 404) return null;
      if (!response.ok) {
        let detail = '';
        try { const payload = await response.clone().json(); detail = trim(payload?.error?.status || payload?.error?.message); } catch { /* ignore */ }
        const conflict = [409, 412].includes(response.status) || /ABORTED|FAILED_PRECONDITION/i.test(detail);
        if (conflict) throw createError(`${codePrefix}_conflict`, 'Firestore document changed before commit.', 409);
        throw createError(`${codePrefix}_unavailable`, `Firestore operation failed with HTTP ${response.status}.`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw createError(`${codePrefix}_timeout`, 'Firestore operation timed out.', 503);
      if (error?.code) throw error;
      throw createError(`${codePrefix}_unavailable`, 'Firestore operation failed.', 503);
    } finally { clearTimeout(timeout); }
  };

  const getDocument = async (path, firebaseIdToken, codePrefix) => {
    const payload = await requestJson({ url: `${baseUrl}/${path}`, firebaseIdToken, codePrefix });
    return payload ? decodeFirestoreDocument(payload) : null;
  };

  const commit = ({ firebaseIdToken, codePrefix, writes }) => requestJson({
    url: `${baseUrl}:commit`, method: 'POST', firebaseIdToken, codePrefix, body: { writes },
  });

  const updateWrite = ({ path, fields, updateTime = '', transforms = [] }) => ({
    update: { name: documentName(path), fields: encodeFields(fields) },
    updateMask: { fieldPaths: Object.keys(fields) },
    ...(trim(updateTime) ? { currentDocument: { updateTime: trim(updateTime) } } : {}),
    ...(transforms.length ? { updateTransforms: transforms } : {}),
  });

  return Object.freeze({
    async verifyAdmin({ firebaseUid, firebaseIdToken }) {
      const uid = trim(firebaseUid);
      if (!uid) throw createError('admin_firebase_uid_missing', 'Firebase admin UID is required.', 401);
      const document = await getDocument(`adminAccounts/${encodeURIComponent(uid)}`, firebaseIdToken, 'firestore_member_admin');
      if (!document) throw createError('admin_account_not_found', 'Firebase admin account was not found.', 403);
      const fields = document.fields || {};
      if (trim(fields.id) !== uid || trim(fields.authUid) !== uid) throw createError('admin_account_identity_mismatch', 'Firebase admin account identity is invalid.', 403);
      return Object.freeze({ uid, fields, updateTime: document.updateTime || null });
    },

    async getAdminAccount({ firebaseUid, firebaseIdToken }) {
      const uid = trim(firebaseUid);
      if (!uid) return null;
      return getDocument(`adminAccounts/${encodeURIComponent(uid)}`, firebaseIdToken, 'firestore_member_admin_target');
    },

    async getUserAccount({ firebaseUid, firebaseIdToken }) {
      return getDocument(`userAccounts/${encodeURIComponent(trim(firebaseUid))}`, firebaseIdToken, 'firestore_member_user');
    },
    async listUserAccounts({ firebaseIdToken }) {
      const payload = await requestJson({
        url: `${baseUrl}:runQuery`,
        method: 'POST',
        firebaseIdToken,
        codePrefix: 'firestore_member_user_list',
        body: { structuredQuery: { from: [{ collectionId: 'userAccounts' }] } },
      });
      if (!Array.isArray(payload)) throw createError('firestore_member_user_list_invalid', 'Firestore userAccounts list response is invalid.', 503);
      return payload
        .map((entry) => entry?.document)
        .filter(Boolean)
        .map(decodeFirestoreDocument);
    },
    async getPublicConfig({ firebaseIdToken }) {
      return getDocument('rentalSystem/publicConfig', firebaseIdToken, 'firestore_member_public_config');
    },
    async getIdentityClaim({ identityKey, firebaseIdToken }) {
      const key = trim(identityKey);
      if (!key) return null;
      return getDocument(`memberIdentityClaims/${encodeURIComponent(key)}`, firebaseIdToken, 'firestore_member_identity_claim');
    },
    async getDirectoryMember({ identityKey, firebaseIdToken }) {
      const key = trim(identityKey);
      if (!key) return null;
      return getDocument(`memberDirectoryKeys/${encodeURIComponent(key)}`, firebaseIdToken, 'firestore_member_directory');
    },
    async getRentalRestriction({ firebaseUid, firebaseIdToken }) {
      const uid = trim(firebaseUid);
      if (!uid) return null;
      return getDocument(`rentalRestrictions/${encodeURIComponent(uid)}`, firebaseIdToken, 'firestore_member_restriction');
    },
    async listAdminAccounts({ firebaseIdToken }) {
      const payload = await requestJson({
        url: `${baseUrl}:runQuery`, method: 'POST', firebaseIdToken, codePrefix: 'firestore_admin_identity_list',
        body: { structuredQuery: { from: [{ collectionId: 'adminAccounts' }] } },
      });
      if (!Array.isArray(payload)) throw createError('firestore_admin_identity_list_invalid', 'Firestore admin account list response is invalid.', 503);
      return payload.map((entry) => entry?.document).filter(Boolean).map(decodeFirestoreDocument);
    },

    async commitProfileEdit({
      targetUid,
      currentAccount,
      currentAccountUpdateTime,
      nextProfile,
      nextClaim,
      nextClaimExists,
      previousClaim,
      previousClaimUpdateTime,
      nextRecovery,
      previousRecoveryKey,
      firebaseIdToken,
    }) {
      const uid = trim(targetUid);
      const writes = [];
      const claimPath = `memberIdentityClaims/${encodeURIComponent(nextProfile.identityKey)}`;
      const claimFields = {
        identityKey: nextProfile.identityKey,
        uid,
        currentUid: uid,
        status: 'active',
        name: nextProfile.name,
        team: nextProfile.team,
        conflict: false,
        conflictingUids: [],
        formerUids: Array.isArray(nextClaim.formerUids) ? nextClaim.formerUids : [],
        directoryMemberId: nextProfile.directoryMemberId || nextClaim.directoryMemberId || '',
        restrictionSnapshot: nextClaim.restrictionSnapshot || {},
        releasedAt: '',
      };
      if (nextClaimExists) {
        writes.push(updateWrite({ path: claimPath, fields: claimFields, transforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }));
      } else {
        writes.push({
          update: { name: documentName(claimPath), fields: encodeFields(claimFields) },
          currentDocument: { exists: false },
          updateTransforms: [
            { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        });
      }

      if (previousClaim?.identityKey && previousClaim.identityKey !== nextProfile.identityKey && previousClaim.currentUid === uid) {
        writes.push(updateWrite({
          path: `memberIdentityClaims/${encodeURIComponent(previousClaim.identityKey)}`,
          fields: {
            uid: '', currentUid: '', status: 'released',
            formerUids: Array.from(new Set([...(previousClaim.formerUids || []), uid])),
          },
          updateTime: previousClaimUpdateTime || '',
          transforms: [
            { fieldPath: 'releasedAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        }));
      }

      const userFields = {
        email: nextProfile.email,
        maskedEmail: nextProfile.maskedEmail,
        name: nextProfile.name,
        team: nextProfile.team,
        phone: nextProfile.phone,
        status: nextProfile.status,
        identityKey: nextProfile.identityKey,
        recoveryKey: nextProfile.recoveryKey,
        directoryMemberId: nextProfile.directoryMemberId || '',
        directoryVerifiedVersion: Number(nextProfile.directoryVerifiedVersion || 0),
        directoryVerifiedAt: nextProfile.directoryVerifiedVersion ? new Date() : '',
        profileRequiredReason: nextProfile.profileRequiredReason || '',
        profileRequiredAt: nextProfile.profileRequiredAt || '',
        statusBeforeProfileRequired: nextProfile.statusBeforeProfileRequired || '',
      };
      writes.push(updateWrite({
        path: `userAccounts/${encodeURIComponent(uid)}`,
        fields: userFields,
        updateTime: currentAccountUpdateTime || '',
        transforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      }));

      writes.push({
        update: {
          name: documentName(`accountRecoveryKeys/${encodeURIComponent(nextProfile.recoveryKey)}`),
          fields: encodeFields({ ...nextRecovery, accountStatus: nextProfile.status, enabled: nextProfile.status !== 'retired' }),
        },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      });
      if (previousRecoveryKey && previousRecoveryKey !== nextProfile.recoveryKey) {
        writes.push({ delete: documentName(`accountRecoveryKeys/${encodeURIComponent(previousRecoveryKey)}`) });
      }
      return commit({ firebaseIdToken, codePrefix: 'firestore_member_profile_mirror', writes });
    },

    async commitStatusChange({ targetUid, nextStatus, recoveryKey = '', inheritedRestriction = null, firebaseIdToken }) {
      const uid = trim(targetUid);
      const writes = [updateWrite({
        path: `userAccounts/${encodeURIComponent(uid)}`,
        fields: { status: nextStatus },
        transforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      })];
      if (trim(recoveryKey)) {
        writes.push(updateWrite({
          path: `accountRecoveryKeys/${encodeURIComponent(trim(recoveryKey))}`,
          fields: { accountStatus: nextStatus },
          transforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        }));
      }
      if (inheritedRestriction && typeof inheritedRestriction === 'object') {
        writes.push({
          update: {
            name: documentName(`rentalRestrictions/${encodeURIComponent(uid)}`),
            fields: encodeFields({ ...inheritedRestriction, uid, inheritedFromPreviousAccount: true }),
          },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        });
      }
      return commit({ firebaseIdToken, codePrefix: 'firestore_member_status_mirror', writes });
    },
  });
};
