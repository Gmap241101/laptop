import {
  createMemberIdentityKey,
  isValidMemberName,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';
import { getSafeMemberDirectoryVersion } from './memberAccountPolicy.js';

export class MemberDirectoryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MemberDirectoryValidationError';
    this.userMessage = message;
  }
}

const randomId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const createBorrowerDocumentId = () => `BORROWER-${randomId()}`;

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

  return { nextTeams, nextBorrowers };
};

export const saveMemberDirectory = async ({
  settings = {},
  tempBorrowers = [],
  tempTeams = [],
} = {}) => {
  const { nextTeams, nextBorrowers } = normalizeMemberDirectoryDraft({
    tempTeams,
    tempBorrowers,
  });

  const directoryEntries = await Promise.all(
    nextBorrowers.map(async (borrower) => ({
      identityKey: await createMemberIdentityKey(borrower.team, borrower.name),
      directoryMemberId: borrower.id,
      name: borrower.name,
      team: borrower.team,
      sortOrder: borrower.sortOrder,
      enabled: true,
    }))
  );

  const nextSettings = {
    ...settings,
    memberDirectoryVersion: getSafeMemberDirectoryVersion(settings) + 1,
    memberIdentityClaimsReady: true,
  };

  return { directoryEntries, nextBorrowers, nextSettings, nextTeams };
};
