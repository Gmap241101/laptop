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

const normalizeSource = ({ document, firebaseUid }) => {
  if (!document) {
    return Object.freeze({ exists: false, restriction: null, sourceDocumentPath: '', sourceUpdatedAt: null, sourceHash: hashPayload(null) });
  }
  const payload = { ...(document.fields || {}) };
  const sourceUid = normalizeText(payload.uid || firebaseUid);
  if (sourceUid !== firebaseUid) throw serviceError('rental_restriction_uid_mismatch', 'Firestore rental restriction UID does not match the requested Firebase UID.');
  payload.uid = firebaseUid;
  return Object.freeze({
    exists: true,
    restriction: Object.freeze(payload),
    sourceDocumentPath: normalizeText(document.name),
    sourceUpdatedAt: document.updateTime || null,
    sourceHash: hashPayload(payload),
  });
};

export const createRentalRestrictionService = ({ firebaseLinkRepository, rentalRestrictionRepository, firestoreRentalRestrictionClient, firebaseCompatibilityRequired = true }) => {
  if (!firebaseLinkRepository || typeof firebaseLinkRepository.findByFirebaseUid !== 'function') throw new TypeError('firebaseLinkRepository is required.');
  if (!rentalRestrictionRepository || typeof rentalRestrictionRepository.findByFirebaseUid !== 'function' || typeof rentalRestrictionRepository.upsert !== 'function') throw new TypeError('rentalRestrictionRepository is required.');
  if (firebaseCompatibilityRequired && (!firestoreRentalRestrictionClient || typeof firestoreRentalRestrictionClient.getRentalRestriction !== 'function')) throw new TypeError('Legacy rental restriction source client is required only when compatibility mode is enabled.');

  const verifyIdentity = async (firebaseIdentity, firebaseUid) => {
    const actorUid = normalizeText(firebaseIdentity?.uid);
    if (!actorUid || (firebaseCompatibilityRequired && !firebaseIdentity?.idToken)) throw serviceError('firebase_identity_missing', 'Verified Firebase identity is required.');
    const link = await firebaseLinkRepository.findByFirebaseUid(firebaseUid);
    return { actorUid, link };
  };

  const readSource = async (firebaseIdentity, firebaseUid) => {
    if (!firebaseCompatibilityRequired) throw serviceError('legacy_restriction_source_retired', 'Legacy rental restriction source is retired.');
    const document = await firestoreRentalRestrictionClient.getRentalRestriction({
      firebaseUid,
      firebaseIdToken: firebaseIdentity.idToken,
    });
    return normalizeSource({ document, firebaseUid });
  };

  return Object.freeze({
    async getCurrentByFirebaseIdentity(firebaseIdentity) {
      const firebaseUid = normalizeText(firebaseIdentity?.uid);
      if (!firebaseUid) throw serviceError('firebase_identity_missing', 'Verified Firebase identity is required.');
      const { link } = await verifyIdentity(firebaseIdentity, firebaseUid);
      const current = await rentalRestrictionRepository.findByFirebaseUid(firebaseUid);
      if (current) return current;
      if (!link?.appUserId) return null;
      return Object.freeze({
        firebaseUid,
        appUserId: String(link.appUserId),
        exists: false,
        restriction: null,
        sourceDocumentPath: `postgresql/app_member_accounts/${firebaseUid}/rental-restriction-none`,
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

    async readCurrentSourceByFirebaseIdentity(firebaseIdentity) {
      const firebaseUid = normalizeText(firebaseIdentity?.uid);
      await verifyIdentity(firebaseIdentity, firebaseUid);
      return readSource(firebaseIdentity, firebaseUid);
    },

    async syncLinkedFirebaseUid(firebaseIdentity, targetFirebaseUid = '') {
      const actorUid = normalizeText(firebaseIdentity?.uid);
      const firebaseUid = normalizeText(targetFirebaseUid) || actorUid;
      const { link } = await verifyIdentity(firebaseIdentity, firebaseUid);
      const source = await readSource(firebaseIdentity, firebaseUid);
      const shadow = await rentalRestrictionRepository.upsert({
        firebaseUid,
        appUserId: link?.appUserId || null,
        ...source,
      });
      return Object.freeze({ status: 'synced', firebaseUid, actorUid, shadow });
    },
  });
};
