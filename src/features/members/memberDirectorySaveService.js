import {
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
  MEMBER_DIRECTORY_KEYS_COLLECTION_REF,
  MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_BORROWERS_COLLECTION_REF,
  USER_ACCOUNTS_COLLECTION_REF,
} from '../../firebase.js';
import {
  createMemberIdentityKey,
  isValidMemberName,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';
import {
  buildMemberAccountIndexEntries,
  buildMemberAccountIndexOperations,
  commitFirestoreOperations,
} from './memberAccountIndexService.js';
import {
  getSafeMemberDirectoryVersion,
} from './memberAccountPolicy.js';

export class MemberDirectoryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MemberDirectoryValidationError';
    this.userMessage = message;
  }
}

const createBorrowerDocumentId = () =>
  `BORROWER-${doc(RENTAL_BORROWERS_COLLECTION_REF).id}`;

const findDuplicateByNormalizedValue = (values = []) =>
  values.find(
    (value, index) =>
      values.findIndex(
        (candidate) =>
          candidate.toLocaleLowerCase('ko-KR') ===
          value.toLocaleLowerCase('ko-KR')
      ) !== index
  );

export const normalizeMemberDirectoryDraft = ({
  tempTeams = [],
  tempBorrowers = [],
} = {}) => {
  const nextTeams = tempTeams
    .map((team) => normalizeMemberTeam(team))
    .filter(Boolean);

  const duplicatedTeam = findDuplicateByNormalizedValue(nextTeams);

  if (duplicatedTeam) {
    throw new MemberDirectoryValidationError(
      `[${duplicatedTeam}] 부서명이 중복되어 저장할 수 없습니다.`
    );
  }

  const nextBorrowers = tempBorrowers
    .map((borrower, index) => ({
      id: borrower.id || createBorrowerDocumentId(),
      name: normalizeMemberName(borrower.name || ''),
      team: normalizeMemberTeam(borrower.team || ''),
      sortOrder: index,
    }))
    .filter(
      (borrower) =>
        borrower.name &&
        borrower.team &&
        nextTeams.includes(borrower.team)
    );

  const invalidBorrower = nextBorrowers.find(
    (borrower) => !isValidMemberName(borrower.name)
  );

  if (invalidBorrower) {
    throw new MemberDirectoryValidationError(
      `[${invalidBorrower.team}] ${invalidBorrower.name} 사용자명은 공백 없이 한글 또는 영문 2~30자로 입력해 주세요.`
    );
  }

  const duplicatedBorrower = nextBorrowers.find(
    (borrower, index) =>
      nextBorrowers.findIndex(
        (candidate) =>
          normalizeMemberTeam(candidate.team).toLocaleLowerCase('ko-KR') ===
            normalizeMemberTeam(borrower.team).toLocaleLowerCase('ko-KR') &&
          normalizeMemberName(candidate.name).toLocaleLowerCase('ko-KR') ===
            normalizeMemberName(borrower.name).toLocaleLowerCase('ko-KR')
      ) !== index
  );

  if (duplicatedBorrower) {
    throw new MemberDirectoryValidationError(
      `[${duplicatedBorrower.team}] ${duplicatedBorrower.name} 사용자명이 중복되어 저장할 수 없습니다.`
    );
  }

  return {
    nextTeams,
    nextBorrowers,
  };
};

export const saveMemberDirectory = async ({
  currentBorrowers = [],
  settings = {},
  tempBorrowers = [],
  tempTeams = [],
} = {}) => {
  const {
    nextTeams,
    nextBorrowers,
  } = normalizeMemberDirectoryDraft({
    tempTeams,
    tempBorrowers,
  });

  const directoryEntries = await Promise.all(
    nextBorrowers.map(async (borrower) => ({
      ...borrower,
      identityKey: await createMemberIdentityKey(
        borrower.team,
        borrower.name
      ),
    }))
  );

  const [
    currentUserAccountsSnapshot,
    currentDirectorySnapshot,
    currentClaimsSnapshot,
    currentRecoverySnapshot,
  ] = await Promise.all([
    getDocs(USER_ACCOUNTS_COLLECTION_REF),
    getDocs(MEMBER_DIRECTORY_KEYS_COLLECTION_REF),
    getDocs(MEMBER_IDENTITY_CLAIMS_COLLECTION_REF),
    getDocs(ACCOUNT_RECOVERY_KEYS_COLLECTION_REF),
  ]);

  const accountEntries = await buildMemberAccountIndexEntries(
    currentUserAccountsSnapshot.docs.map((accountDocument) => ({
      ...accountDocument.data(),
      uid: accountDocument.data().uid || accountDocument.id,
    }))
  );

  const currentBorrowerDocuments = currentBorrowers
    .filter((borrower) => borrower?.id)
    .map((borrower) => ({
      id: borrower.id,
      ref: doc(RENTAL_BORROWERS_COLLECTION_REF, borrower.id),
    }));

  const nextBorrowerIdSet = new Set(
    nextBorrowers.map((borrower) => borrower.id)
  );
  const nextDirectoryKeySet = new Set(
    directoryEntries.map((entry) => entry.identityKey)
  );

  const borrowerOperations = [
    ...nextBorrowers.map((borrower) => ({
      type: 'set',
      ref: doc(RENTAL_BORROWERS_COLLECTION_REF, borrower.id),
      data: {
        ...borrower,
        updatedAt: serverTimestamp(),
      },
    })),
    ...currentBorrowerDocuments
      .filter(
        (borrowerDocument) =>
          !nextBorrowerIdSet.has(borrowerDocument.id)
      )
      .map((borrowerDocument) => ({
        type: 'delete',
        ref: borrowerDocument.ref,
      })),
  ];

  const directoryOperations = [
    ...directoryEntries.map((entry) => ({
      type: 'set',
      ref: doc(
        MEMBER_DIRECTORY_KEYS_COLLECTION_REF,
        entry.identityKey
      ),
      data: {
        identityKey: entry.identityKey,
        directoryMemberId: entry.id,
        name: entry.name,
        team: entry.team,
        sortOrder: entry.sortOrder,
        enabled: true,
        updatedAt: serverTimestamp(),
      },
    })),
    ...currentDirectorySnapshot.docs
      .filter(
        (directoryDocument) =>
          !nextDirectoryKeySet.has(directoryDocument.id)
      )
      .map((directoryDocument) => ({
        type: 'delete',
        ref: directoryDocument.ref,
      })),
  ];

  const {
    accountMetadataOperations,
    claimOperations,
    recoveryOperations,
  } = buildMemberAccountIndexOperations({
    accountEntries,
    currentClaimDocuments: currentClaimsSnapshot.docs,
    currentRecoveryDocuments: currentRecoverySnapshot.docs,
  });

  await commitFirestoreOperations([
    ...borrowerOperations,
    ...directoryOperations,
    ...claimOperations,
    ...recoveryOperations,
    ...accountMetadataOperations,
  ]);

  const nextSettings = {
    ...settings,
    memberDirectoryVersion:
      getSafeMemberDirectoryVersion(settings) + 1,
    memberIdentityClaimsReady: true,
  };

  await setDoc(
    PUBLIC_CONFIG_DOC_REF,
    {
      teams: nextTeams,
      settings: nextSettings,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    nextBorrowers,
    nextSettings,
    nextTeams,
  };
};
