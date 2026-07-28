import {
  USER_PROFILE_STATUS,
} from '../../constants/memberConstants.js';

export const getSafeMemberDirectoryVersion = (settings = {}) => {
  const parsedVersion = Math.trunc(
    Number(settings.memberDirectoryVersion || 0)
  );

  return Number.isFinite(parsedVersion) && parsedVersion >= 0
    ? parsedVersion
    : 0;
};

export const isRegisteredMemberSignupRequired = (settings = {}) =>
  Boolean(settings.requireRegisteredMemberForSignup);

export const isAutoApproveNewMembersEnabled = (settings = {}) =>
  isRegisteredMemberSignupRequired(settings) &&
  Boolean(settings.autoApproveNewMembers);

export const getClaimCurrentUid = (claim = {}) =>
  String(claim.currentUid || claim.uid || '').trim();

export const getClaimFormerUids = (claim = {}) =>
  Array.from(
    new Set(
      [
        ...(Array.isArray(claim.formerUids) ? claim.formerUids : []),
      ]
        .map((uid) => String(uid || '').trim())
        .filter(Boolean)
    )
  );

export const getClaimStatus = (claim = {}) =>
  claim.status || (getClaimCurrentUid(claim) ? 'active' : 'released');

export const getRestorableUserProfileStatus = (status) =>
  [USER_PROFILE_STATUS.ACTIVE, USER_PROFILE_STATUS.PENDING].includes(status)
    ? status
    : USER_PROFILE_STATUS.ACTIVE;

export const getUserAccountStatusLabel = (status) => {
  if (status === USER_PROFILE_STATUS.PENDING) {
    return '승인 대기';
  }

  if (status === USER_PROFILE_STATUS.ACTIVE) {
    return '활성';
  }

  if (status === USER_PROFILE_STATUS.PROFILE_REQUIRED) {
    return '정보 수정 필요';
  }

  if (status === USER_PROFILE_STATUS.BLOCKED) {
    return '차단';
  }

  if (status === USER_PROFILE_STATUS.RETIRED) {
    return '이용 종료';
  }

  return '상태 미지정';
};

export const getUserAccountStatusClassName = (status) => {
  if (status === USER_PROFILE_STATUS.PENDING) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  if (status === USER_PROFILE_STATUS.ACTIVE) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (status === USER_PROFILE_STATUS.PROFILE_REQUIRED) {
    return 'border-orange-200 bg-orange-50 text-orange-700';
  }

  if (status === USER_PROFILE_STATUS.BLOCKED) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (status === USER_PROFILE_STATUS.RETIRED) {
    return 'border-slate-300 bg-slate-100 text-slate-700';
  }

  return 'border-slate-200 bg-white text-slate-600';
};
