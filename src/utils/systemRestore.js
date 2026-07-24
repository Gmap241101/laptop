import { Timestamp } from 'firebase/firestore';

export const BACKUP_FORMAT_VERSION = 2;
export const RESTORE_CONFIRM_TEXT = '백업 데이터 복원';

export const RESTORE_MODE = {
  ADD_MISSING: 'addMissing',
  MERGE: 'merge',
  OVERWRITE: 'overwrite',
  REPLACE: 'replace',
};

export const SYSTEM_RESTORE_SCOPE = {
  SITE: 'site',
  POLICIES: 'policies',
  ASSETS: 'assets',
  ORGANIZATION: 'organization',
  MEMBERS: 'members',
  RENTALS: 'rentals',
  CONTENT: 'content',
  SYSTEM_ADMIN: 'systemAdmin',
};

export const RESTORE_SCOPE_META = {
  [SYSTEM_RESTORE_SCOPE.SITE]: {
    label: '사이트 기본 설정',
    description: '사이트명, 로고, 브랜드 색상, 문의 정보와 서비스 운영 설정을 복원합니다.',
    documentKeys: ['siteSettings/config'],
    collections: [],
  },
  [SYSTEM_RESTORE_SCOPE.POLICIES]: {
    label: '대여·회원가입 정책',
    description: '공개 설정 문서의 대여 정책, 휴일 및 회원가입 정책을 복원합니다.',
    documentKeys: ['rentalSystem/publicConfig:settings'],
    collections: [],
  },
  [SYSTEM_RESTORE_SCOPE.ASSETS]: {
    label: '자산 및 자산번호',
    description: '자산, 자산관리번호 레지스트리와 자산 카테고리를 복원합니다.',
    documentKeys: ['rentalSystem/publicConfig:assetCategories'],
    collections: ['rentalAssets', 'rentalAssetNumbers'],
  },
  [SYSTEM_RESTORE_SCOPE.ORGANIZATION]: {
    label: '부서·사용자 명부',
    description: '부서 목록, 사용자 명부, 명부 검증 키와 최근 명부 검사 정보를 복원합니다.',
    documentKeys: ['rentalSystem/publicConfig:organization'],
    collections: ['rentalBorrowers', 'memberDirectoryKeys'],
  },
  [SYSTEM_RESTORE_SCOPE.MEMBERS]: {
    label: '회원 계정·인덱스',
    description: '일반회원 문서, 부서·성명 점유와 이메일 찾기 인덱스를 복원합니다. Firebase Authentication 계정은 별도입니다.',
    documentKeys: [],
    collections: ['userAccounts', 'memberIdentityClaims', 'accountRecoveryKeys'],
    requiresPersonalData: true,
  },
  [SYSTEM_RESTORE_SCOPE.RENTALS]: {
    label: '신청·대여·제재 이력',
    description: '대여신청, 처리 로그, 예약 잠금, 연체 및 대여 제한을 복원합니다.',
    documentKeys: [],
    collections: ['rentalRequests', 'rentalRequestLogs', 'rentalAvailability', 'rentalRestrictions'],
  },
  [SYSTEM_RESTORE_SCOPE.CONTENT]: {
    label: '공지·FAQ·팝업·배너·푸터',
    description: '사이트 콘텐츠와 각 콘텐츠 표시 설정을 복원합니다.',
    documentKeys: ['noticeBoard/config', 'faqBoard/config', 'homePage/config', 'siteFooter/config'],
    collections: ['noticePosts', 'faqPosts', 'faqCategories', 'popupPosts', 'homeBanners', 'footerPages'],
  },
  [SYSTEM_RESTORE_SCOPE.SYSTEM_ADMIN]: {
    label: '관리자 시스템 설정',
    description: '관리자 세션 보안 및 시스템 점검 메타데이터를 복원합니다. 최고 관리자만 선택할 수 있습니다.',
    documentKeys: ['systemSettings/admin:security'],
    collections: [],
    ownerOnly: true,
  },
};

export const RESTORE_DELETE_ORDER = [
  'rentalRequestLogs',
  'rentalAvailability',
  'rentalRequests',
  'rentalRestrictions',
  'accountRecoveryKeys',
  'memberIdentityClaims',
  'userAccounts',
  'rentalAssetNumbers',
  'rentalAssets',
  'memberDirectoryKeys',
  'rentalBorrowers',
  'noticePosts',
  'faqPosts',
  'faqCategories',
  'popupPosts',
  'homeBanners',
  'footerPages',
];

export const RESTORE_WRITE_ORDER = [
  'rentalBorrowers',
  'memberDirectoryKeys',
  'rentalAssets',
  'rentalAssetNumbers',
  'userAccounts',
  'memberIdentityClaims',
  'accountRecoveryKeys',
  'rentalRequests',
  'rentalRequestLogs',
  'rentalAvailability',
  'rentalRestrictions',
  'noticePosts',
  'faqCategories',
  'faqPosts',
  'popupPosts',
  'homeBanners',
  'footerPages',
];

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const serializeBackupValue = (value) => {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value?.toDate === 'function' && Number.isFinite(Number(value?.seconds))) {
    return {
      __firestoreType: 'timestamp',
      seconds: Number(value.seconds),
      nanoseconds: Number(value.nanoseconds || 0),
    };
  }
  if (value instanceof Date) {
    return { __firestoreType: 'date', value: value.toISOString() };
  }
  if (Array.isArray(value)) return value.map((item) => serializeBackupValue(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeBackupValue(item)])
    );
  }
  return value;
};

export const deserializeBackupValue = (value) => {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((item) => deserializeBackupValue(item));
  if (!isPlainObject(value)) return value;

  if (
    value.__firestoreType === 'timestamp'
    && Number.isFinite(Number(value.seconds))
  ) {
    return new Timestamp(Number(value.seconds), Number(value.nanoseconds || 0));
  }
  if (value.__firestoreType === 'date' && typeof value.value === 'string') {
    return new Date(value.value);
  }

  // 기존 v1 백업에서 Firestore Timestamp가 일반 객체로 직렬화된 형식도 지원합니다.
  if (
    Number.isFinite(Number(value.seconds))
    && Number.isFinite(Number(value.nanoseconds))
    && Object.keys(value).every((key) => ['seconds', 'nanoseconds', 'type'].includes(key))
  ) {
    return new Timestamp(Number(value.seconds), Number(value.nanoseconds || 0));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, deserializeBackupValue(item)])
  );
};

const getBackupDocument = (payload, path) => payload?.documents?.[path] ?? null;
const getBackupCollection = (payload, name) =>
  Array.isArray(payload?.collections?.[name]) ? payload.collections[name] : [];

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

export const getAvailableRestoreScopes = (payload, isOwner = false) => {
  const available = [];
  const metadata = payload?.metadata || {};
  const publicConfig = getBackupDocument(payload, 'rentalSystem/publicConfig');

  Object.entries(RESTORE_SCOPE_META).forEach(([scope, meta]) => {
    if (meta.ownerOnly && !isOwner) return;
    if (meta.requiresPersonalData && metadata.includePersonalData !== true) return;

    let hasData = meta.collections.some((name) => hasOwn(payload?.collections, name));
    if (scope === SYSTEM_RESTORE_SCOPE.POLICIES) hasData ||= hasOwn(publicConfig, 'settings');
    if (scope === SYSTEM_RESTORE_SCOPE.ASSETS) hasData ||= hasOwn(publicConfig, 'assetCategories');
    if (scope === SYSTEM_RESTORE_SCOPE.ORGANIZATION) {
      hasData ||= hasOwn(publicConfig, 'teams') || hasOwn(publicConfig, 'memberDirectoryAudit');
    }
    meta.documentKeys.forEach((key) => {
      if (key === 'systemSettings/admin:security') {
        if (isPlainObject(payload?.documents?.['systemSettings/admin'])) hasData = true;
      } else if (!key.includes(':') && isPlainObject(payload?.documents?.[key])) {
        hasData = true;
      }
    });

    if (hasData) available.push(scope);
  });

  return available;
};

export const validateBackupPayload = ({
  payload,
  currentProjectId,
  currentSchemaVersion,
  isOwner,
}) => {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(payload)) errors.push('JSON 최상위 데이터가 객체 형식이 아닙니다.');
  if (!isPlainObject(payload?.metadata)) errors.push('백업 metadata가 없습니다.');
  if (!isPlainObject(payload?.documents)) errors.push('백업 documents가 없습니다.');
  if (!isPlainObject(payload?.collections)) errors.push('백업 collections가 없습니다.');

  const metadata = payload?.metadata || {};
  const backupProjectId = String(metadata.firebaseProjectId || '').trim();
  const backupFormatVersion = Number(metadata.backupFormatVersion || 1);
  const backupSchemaVersion = Number(metadata.schemaVersion || 1);
  const projectMismatch = Boolean(backupProjectId && backupProjectId !== currentProjectId);
  const schemaIsNewer = Number.isFinite(backupSchemaVersion)
    && backupSchemaVersion > Number(currentSchemaVersion || 1);

  if (!Number.isFinite(backupFormatVersion) || backupFormatVersion < 1) {
    errors.push('백업 파일 형식 버전이 올바르지 않습니다.');
  } else if (backupFormatVersion > BACKUP_FORMAT_VERSION) {
    errors.push(`백업 형식 v${backupFormatVersion}은 현재 지원 버전 v${BACKUP_FORMAT_VERSION}보다 새 버전입니다.`);
  } else if (backupFormatVersion < BACKUP_FORMAT_VERSION) {
    warnings.push(`이전 백업 형식 v${backupFormatVersion}입니다. 기존 Timestamp 형식을 호환 변환합니다.`);
  }
  if (!backupProjectId) warnings.push('백업 파일에 Firebase 프로젝트 ID가 없습니다.');
  if (projectMismatch) {
    warnings.push(
      isOwner
        ? `백업 프로젝트(${backupProjectId})와 현재 프로젝트(${currentProjectId})가 다릅니다. 최고 관리자 강제 복원이 필요합니다.`
        : `백업 프로젝트(${backupProjectId})와 현재 프로젝트(${currentProjectId})가 달라 복원할 수 없습니다.`
    );
  }
  if (schemaIsNewer) {
    errors.push(`백업 스키마 v${backupSchemaVersion}가 현재 시스템 v${currentSchemaVersion}보다 새 버전입니다.`);
  } else if (backupSchemaVersion < Number(currentSchemaVersion || 1)) {
    warnings.push(`이전 스키마 v${backupSchemaVersion} 백업입니다. 복원 후 데이터 점검이 필요합니다.`);
  }
  if (metadata.includeMembers && metadata.includePersonalData !== true) {
    warnings.push('회원 개인정보를 제외한 백업이므로 회원 계정·복구 인덱스는 복원할 수 없습니다.');
  }

  const availableScopes = getAvailableRestoreScopes(payload, isOwner);
  if (availableScopes.length === 0) errors.push('복원 가능한 데이터 영역이 없습니다.');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata,
    projectMismatch,
    schemaIsNewer,
    availableScopes,
  };
};

const createFullDocumentPlan = (payload, path) => {
  if (!hasOwn(payload?.documents, path) || !isPlainObject(payload.documents[path])) return null;
  const [collectionName, documentId] = path.split('/');
  return {
    key: path,
    path,
    collectionName,
    documentId,
    data: payload.documents[path],
    partial: false,
  };
};

const createPublicConfigPartialPlan = (payload, type) => {
  const publicConfig = getBackupDocument(payload, 'rentalSystem/publicConfig');
  if (!isPlainObject(publicConfig)) return null;

  if (type === 'settings' && hasOwn(publicConfig, 'settings')) {
    return {
      key: 'rentalSystem/publicConfig:settings',
      path: 'rentalSystem/publicConfig',
      collectionName: 'rentalSystem',
      documentId: 'publicConfig',
      data: { settings: publicConfig.settings || {} },
      partial: true,
    };
  }
  if (type === 'assetCategories' && hasOwn(publicConfig, 'assetCategories')) {
    return {
      key: 'rentalSystem/publicConfig:assetCategories',
      path: 'rentalSystem/publicConfig',
      collectionName: 'rentalSystem',
      documentId: 'publicConfig',
      data: { assetCategories: Array.isArray(publicConfig.assetCategories) ? publicConfig.assetCategories : [] },
      partial: true,
    };
  }
  if (type === 'organization' && (hasOwn(publicConfig, 'teams') || hasOwn(publicConfig, 'memberDirectoryAudit'))) {
    return {
      key: 'rentalSystem/publicConfig:organization',
      path: 'rentalSystem/publicConfig',
      collectionName: 'rentalSystem',
      documentId: 'publicConfig',
      data: {
        teams: Array.isArray(publicConfig.teams) ? publicConfig.teams : [],
        memberDirectoryAudit: publicConfig.memberDirectoryAudit || null,
      },
      partial: true,
    };
  }
  return null;
};


const createSystemAdminSecurityPlan = (payload) => {
  const source = getBackupDocument(payload, 'systemSettings/admin');
  if (!isPlainObject(source)) return null;
  const idle = Math.min(480, Math.max(15, Math.trunc(Number(source.adminIdleTimeoutMinutes || 60))));
  const absolute = Math.min(24, Math.max(1, Math.trunc(Number(source.adminAbsoluteTimeoutHours || 8))));
  return {
    key: 'systemSettings/admin:security',
    path: 'systemSettings/admin',
    collectionName: 'systemSettings',
    documentId: 'admin',
    data: {
      adminIdleTimeoutMinutes: idle,
      adminAbsoluteTimeoutHours: absolute,
    },
    partial: true,
  };
};

export const buildRestorePlan = (payload, selectedScopes = []) => {
  const collections = new Map();
  const documents = new Map();

  selectedScopes.forEach((scope) => {
    const meta = RESTORE_SCOPE_META[scope];
    if (!meta) return;

    meta.collections.forEach((name) => {
      if (!hasOwn(payload?.collections, name)) return;
      const rawRecords = getBackupCollection(payload, name)
        .filter((item) => item && typeof item.id === 'string' && item.id && isPlainObject(item.data));
      const recordMap = new Map();
      rawRecords.forEach((item) => recordMap.set(item.id, item));
      collections.set(name, {
        name,
        records: Array.from(recordMap.values()),
        duplicateIdCount: rawRecords.length - recordMap.size,
      });
    });

    meta.documentKeys.forEach((key) => {
      let plan = null;
      if (key === 'rentalSystem/publicConfig:settings') {
        plan = createPublicConfigPartialPlan(payload, 'settings');
      } else if (key === 'rentalSystem/publicConfig:assetCategories') {
        plan = createPublicConfigPartialPlan(payload, 'assetCategories');
      } else if (key === 'rentalSystem/publicConfig:organization') {
        plan = createPublicConfigPartialPlan(payload, 'organization');
      } else if (key === 'systemSettings/admin:security') {
        plan = createSystemAdminSecurityPlan(payload);
      } else {
        plan = createFullDocumentPlan(payload, key);
      }
      if (plan) documents.set(plan.key, plan);
    });
  });

  const collectionPlans = RESTORE_WRITE_ORDER
    .filter((name) => collections.has(name))
    .map((name) => collections.get(name));
  Array.from(collections.keys())
    .filter((name) => !RESTORE_WRITE_ORDER.includes(name))
    .sort()
    .forEach((name) => collectionPlans.push(collections.get(name)));

  return {
    collections: collectionPlans,
    documents: Array.from(documents.values()),
    totalDocuments:
      collectionPlans.reduce((sum, item) => sum + item.records.length, 0)
      + documents.size,
  };
};

export const computeBackupFileHash = async (text) => {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};
