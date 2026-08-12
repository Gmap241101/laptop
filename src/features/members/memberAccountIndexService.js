import {
  doc,
  serverTimestamp,
  writeBatch,
} from '../../platform/retiredLegacyDataCompat.js';

import {
  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
  MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
  USER_ACCOUNTS_COLLECTION_NAME,
  db,
} from '../../platform/appDataRefs.js';
import {
  USER_PROFILE_STATUS,
} from '../../constants/memberConstants.js';
import {
  createAccountRecoveryEmailVerifier,
  createAccountRecoveryKey,
  createMemberIdentityKey,
  maskEmailAddress,
  normalizeEmailAddress,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';
import {
  getClaimCurrentUid,
  getClaimFormerUids,
} from './memberAccountPolicy.js';

const FIRESTORE_BATCH_WRITE_LIMIT = 400;

export const commitFirestoreOperations = async (
  operations,
  batchLimit = FIRESTORE_BATCH_WRITE_LIMIT
) => {
  for (
    let startIndex = 0;
    startIndex < operations.length;
    startIndex += batchLimit
  ) {
    const operationChunk = operations.slice(
      startIndex,
      startIndex + batchLimit
    );

    const batch = writeBatch(db);

    operationChunk.forEach((operation) => {
      if (operation.type === 'delete') {
        batch.delete(operation.ref);
        return;
      }

      if (operation.type === 'update') {
        batch.update(operation.ref, operation.data);
        return;
      }

      if (operation.options) {
        batch.set(
          operation.ref,
          operation.data,
          operation.options
        );
        return;
      }

      batch.set(operation.ref, operation.data);
    });

    await batch.commit();
  }
};

export const buildMemberAccountIndexEntries = async (accounts = []) =>
  Promise.all(
    (accounts || []).map(async (account) => {
      const name = normalizeMemberName(account.name || '');
      const team = normalizeMemberTeam(account.team || '');
      const phone = String(account.phone || '').trim();
      const email = normalizeEmailAddress(account.email || '');
      const identityKey =
        name && team ? await createMemberIdentityKey(team, name) : '';
      const recoveryKey =
        name && team && phone
          ? await createAccountRecoveryKey({ team, name, phone })
          : '';
      const emailVerifier =
        name && team && phone && email
          ? await createAccountRecoveryEmailVerifier({
              email,
              team,
              name,
              phone,
            })
          : '';

      return {
        account,
        name,
        team,
        phone,
        email,
        identityKey,
        recoveryKey,
        emailVerifier,
        maskedEmail: maskEmailAddress(email),
      };
    })
  );

export const buildMemberAccountIndexOperations = ({
  accountEntries = [],
  currentClaimDocuments = [],
  currentRecoveryDocuments = [],
} = {}) => {
  const groups = new Map();

  accountEntries.forEach((entry) => {
    if (!entry.identityKey) return;
    const group = groups.get(entry.identityKey) || [];
    group.push(entry);
    groups.set(entry.identityKey, group);
  });

  const currentClaims = new Map(
    currentClaimDocuments.map((documentSnapshot) => [
      documentSnapshot.id,
      documentSnapshot.data(),
    ])
  );
  const desiredClaimKeys = new Set();
  const desiredRecoveryKeys = new Set();
  const claimOperations = [];
  const recoveryOperations = [];
  const accountMetadataOperations = [];

  groups.forEach((group, identityKey) => {
    desiredClaimKeys.add(identityKey);
    const currentClaim = currentClaims.get(identityKey) || {};
    const liveEntries = group.filter(
      (entry) => entry.account.status !== USER_PROFILE_STATUS.RETIRED
    );
    const retiredEntries = group.filter(
      (entry) => entry.account.status === USER_PROFILE_STATUS.RETIRED
    );
    const representative = liveEntries[0] || retiredEntries[0] || group[0];
    const formerUids = Array.from(
      new Set(
        [
          ...getClaimFormerUids(currentClaim),
          ...retiredEntries.map((entry) => entry.account.uid),
          ...group.flatMap((entry) =>
            Array.isArray(entry.account.previousAccountUids)
              ? entry.account.previousAccountUids
              : []
          ),
        ].filter(Boolean)
      )
    );
    const conflict = liveEntries.length > 1;
    const currentEntry = liveEntries.length === 1 ? liveEntries[0] : null;
    const currentUid = currentEntry?.account?.uid || '';

    claimOperations.push({
      type: 'set',
      ref: doc(MEMBER_IDENTITY_CLAIMS_COLLECTION_REF, identityKey),
      data: {
        identityKey,
        uid: currentUid,
        currentUid,
        status: conflict ? 'conflict' : currentUid ? 'active' : 'released',
        name: representative?.name || currentClaim.name || '',
        team: representative?.team || currentClaim.team || '',
        conflict,
        conflictingUids: conflict
          ? liveEntries.map((entry) => entry.account.uid)
          : [],
        formerUids: formerUids.filter((uid) => uid !== currentUid),
        directoryMemberId:
          currentEntry?.account?.directoryMemberId ||
          currentClaim.directoryMemberId ||
          '',
        restrictionSnapshot: currentClaim.restrictionSnapshot || {},
        createdAt: currentClaim.createdAt || serverTimestamp(),
        releasedAt:
          !currentUid && !conflict
            ? currentClaim.releasedAt || serverTimestamp()
            : '',
        updatedAt: serverTimestamp(),
      },
    });

    if (
      currentEntry &&
      !conflict &&
      currentEntry.recoveryKey &&
      currentEntry.maskedEmail
    ) {
      desiredRecoveryKeys.add(currentEntry.recoveryKey);
      recoveryOperations.push({
        type: 'set',
        ref: doc(
          ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
          currentEntry.recoveryKey
        ),
        data: {
          recoveryKey: currentEntry.recoveryKey,
          maskedEmail: currentEntry.maskedEmail,
          emailVerifier: currentEntry.emailVerifier,
          accountStatus:
            currentEntry.account.status || USER_PROFILE_STATUS.PENDING,
          enabled: true,
          updatedAt: serverTimestamp(),
        },
      });
      accountMetadataOperations.push({
        type: 'set',
        ref: doc(db, USER_ACCOUNTS_COLLECTION_NAME, currentEntry.account.uid),
        data: {
          identityKey,
          recoveryKey: currentEntry.recoveryKey,
          maskedEmail: currentEntry.maskedEmail,
          previousAccountUids: formerUids.filter(
            (uid) => uid !== currentEntry.account.uid
          ),
          rejoinedAccount:
            Boolean(currentEntry.account.rejoinedAccount) ||
            formerUids.length > 0,
          updatedAt: serverTimestamp(),
        },
        options: { merge: true },
      });
    }
  });

  currentClaimDocuments.forEach((claimDocument) => {
    if (desiredClaimKeys.has(claimDocument.id)) return;

    const claimData = claimDocument.data();
    const currentUid = getClaimCurrentUid(claimData);

    if (currentUid) {
      claimOperations.push({
        type: 'set',
        ref: claimDocument.ref,
        data: {
          ...claimData,
          uid: '',
          currentUid: '',
          status: 'released',
          formerUids: Array.from(
            new Set([...getClaimFormerUids(claimData), currentUid])
          ),
          releasedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }
  });

  currentRecoveryDocuments.forEach((recoveryDocument) => {
    if (!desiredRecoveryKeys.has(recoveryDocument.id)) {
      recoveryOperations.push({
        type: 'delete',
        ref: recoveryDocument.ref,
      });
    }
  });

  return {
    accountMetadataOperations,
    claimOperations,
    recoveryOperations,
    groups,
  };
};
