import { createHash } from 'node:crypto';

const normalizeText = (value) => String(value ?? '').trim();
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
const hashPayload = (value) => createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
const serviceError = (code, message) => {
  const error = new Error(message);
  error.name = 'RentalRestrictionServiceError';
  error.code = code;
  return error;
};

export const createRentalRestrictionService = ({ firebaseLinkRepository, rentalRestrictionRepository }) => {
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.findByFirebaseUid !== 'function') throw new TypeError('firebaseLinkRepository is required.');
  if (!rentalRestrictionRepository || typeof rentalRestrictionRepository.findByFirebaseUid !== 'function' || typeof rentalRestrictionRepository.findByAppUserId !== 'function') throw new TypeError('rentalRestrictionRepository is required.');

  return Object.freeze({
    async getCurrentForAppUser({ appUserId, legacyMemberKey = '' } = {}) {
      const normalizedAppUserId = normalizeText(appUserId);
      if (!normalizedAppUserId) throw serviceError('app_user_identity_missing', 'PostgreSQL application user identity is required.');
      const current = await rentalRestrictionRepository.findByAppUserId(normalizedAppUserId);
      if (current) return current;
      const compatibilityKey = normalizeText(legacyMemberKey);
      return Object.freeze({
        firebaseUid: compatibilityKey,
        appUserId: normalizedAppUserId,
        exists: false,
        restriction: null,
        sourceDocumentPath: `postgresql/app_rental_restrictions/app-user/${normalizedAppUserId}/none`,
        sourceUpdatedAt: null,
        sourceHash: hashPayload(null),
        authorityMode: 'postgresql-authoritative',
        mirrorState: 'retired',
        lastMutationId: '',
        authoritativeUpdatedAt: null,
        syncedAt: null,
        createdAt: null,
        updatedAt: null,
      });
    },

    async getCurrentByFirebaseIdentity(firebaseIdentity) {
      const firebaseUid = normalizeText(firebaseIdentity?.uid);
      if (!firebaseUid) throw serviceError('firebase_identity_missing', 'Verified identity bridge UID is required.');
      const current = await rentalRestrictionRepository.findByFirebaseUid(firebaseUid);
      if (current) return current;
      const link = await firebaseLinkRepository.findByFirebaseUid(firebaseUid);
      if (!link?.appUserId) return null;
      return Object.freeze({
        firebaseUid,
        appUserId: String(link.appUserId),
        exists: false,
        restriction: null,
        sourceDocumentPath: `postgresql/app_rental_restrictions/${firebaseUid}/none`,
        sourceUpdatedAt: null,
        sourceHash: hashPayload(null),
        authorityMode: 'postgresql-authoritative',
        mirrorState: 'retired',
        lastMutationId: '',
        authoritativeUpdatedAt: null,
        syncedAt: null,
        createdAt: null,
        updatedAt: null,
      });
    },
  });
};
