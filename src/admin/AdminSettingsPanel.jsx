import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileClock,
  HardDrive,
  Info,
  LockKeyhole,
  Paintbrush,
  Play,
  RefreshCw,
  Save,
  ServerCog,
  Settings2,
  ShieldAlert,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';

import {
  PUBLIC_CONFIG_DOC_REF,
  SITE_SETTINGS_DOC_REF,
  SYSTEM_ADMIN_SETTINGS_DOC_REF,
  SYSTEM_AUDIT_LOGS_COLLECTION_REF,
  SYSTEM_RESET_JOBS_COLLECTION_REF,
  db,
  firebaseAuth,
  firebaseConfig,
} from '../firebase.js';
import {
  DEFAULT_SITE_SETTINGS,
  DEFAULT_SYSTEM_ADMIN_SETTINGS,
  SERVICE_MODE,
  SYSTEM_MANAGEMENT_TAB,
  SYSTEM_RESET_SCOPE,
  createDownload,
  formatBackupTimestamp,
  isValidHexColor,
  normalizeSiteSettings,
  normalizeSystemAdminSettings,
  redactBackupDocument,
} from '../utils/systemSettings.js';

const SYSTEM_TABS = [
  [SYSTEM_MANAGEMENT_TAB.SITE, Paintbrush, '사이트 기본 설정'],
  [SYSTEM_MANAGEMENT_TAB.SERVICE, Activity, '서비스 운영'],
  [SYSTEM_MANAGEMENT_TAB.SECURITY, LockKeyhole, '관리자 보안'],
  [SYSTEM_MANAGEMENT_TAB.DATA, Database, '데이터 점검·백업'],
  [SYSTEM_MANAGEMENT_TAB.RESET, Trash2, '데이터 초기화'],
  [SYSTEM_MANAGEMENT_TAB.INFO, Info, '시스템 정보'],
  [SYSTEM_MANAGEMENT_TAB.AUDIT, FileClock, '변경 이력'],
];

const RESET_SCOPE_META = {
  [SYSTEM_RESET_SCOPE.ASSETS]: {
    label: '자산',
    description: '대여 자산과 자산관리번호 레지스트리를 삭제합니다.',
    collections: ['rentalAssets', 'rentalAssetNumbers'],
  },
  [SYSTEM_RESET_SCOPE.MEMBERS]: {
    label: '일반회원 정보',
    description: '일반회원 문서, 부서·성명 점유, 이메일 찾기 인덱스를 삭제합니다. Firebase Auth 계정은 별도 정리가 필요합니다.',
    collections: ['userAccounts', 'memberIdentityClaims', 'accountRecoveryKeys'],
  },
  [SYSTEM_RESET_SCOPE.RENTALS]: {
    label: '신청·대여내역',
    description: '대여신청, 신청 로그, 예약 잠금, 연체·대여 제한을 삭제합니다.',
    collections: ['rentalRequestLogs', 'rentalAvailability', 'rentalRequests', 'rentalRestrictions'],
  },
  [SYSTEM_RESET_SCOPE.ORGANIZATION]: {
    label: '부서·사용자 명부',
    description: '부서 사용자 명부와 명부 검증 키를 삭제합니다.',
    collections: ['rentalBorrowers', 'memberDirectoryKeys'],
  },
  [SYSTEM_RESET_SCOPE.CONTENT]: {
    label: '게시물·사이트 콘텐츠',
    description: '공지, FAQ, 팝업, 배너, 푸터 콘텐츠를 삭제합니다.',
    collections: ['noticePosts', 'faqPosts', 'faqCategories', 'popupPosts', 'homeBanners', 'footerPages'],
  },
  [SYSTEM_RESET_SCOPE.SETTINGS]: {
    label: '사이트·운영 설정',
    description: '사이트 기본정보와 서비스 운영 설정을 기본값으로 되돌립니다. Firebase 연결과 관리자 계정은 유지합니다.',
    collections: [],
  },
};

const TEST_DATA_PRESET = [
  SYSTEM_RESET_SCOPE.ASSETS,
  SYSTEM_RESET_SCOPE.MEMBERS,
  SYSTEM_RESET_SCOPE.RENTALS,
];

const FULL_RESET_PRESET = Object.values(SYSTEM_RESET_SCOPE);
const RESET_CONFIRM_TEXT = '테스트 데이터 전체 초기화';
const FIRESTORE_DELETE_BATCH_SIZE = 400;

const BACKUP_COLLECTIONS = {
  settings: [
    'rentalBorrowers',
    'noticePosts',
    'faqPosts',
    'memberDirectoryKeys',
    'faqCategories',
    'homeBanners',
    'popupPosts',
    'footerPages',
  ],
  operations: [
    'rentalAssets',
    'rentalAssetNumbers',
    'rentalAvailability',
    'rentalRequests',
    'rentalRequestLogs',
    'rentalRestrictions',
  ],
  members: [
    'userAccounts',
    'memberIdentityClaims',
    'accountRecoveryKeys',
  ],
};

const BACKUP_DOCUMENTS = [
  ['rentalSystem/publicConfig', 'rentalSystem', 'publicConfig'],
  ['siteSettings/config', 'siteSettings', 'config'],
  ['systemSettings/admin', 'systemSettings', 'admin'],
  ['noticeBoard/config', 'noticeBoard', 'config'],
  ['faqBoard/config', 'faqBoard', 'config'],
  ['homePage/config', 'homePage', 'config'],
  ['siteFooter/config', 'siteFooter', 'config'],
];

const CONTENT_CONFIG_DOCS = [
  ['noticeBoard', 'config'],
  ['faqBoard', 'config'],
  ['homePage', 'config'],
  ['siteFooter', 'config'],
];

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value || {}));

const getAdminDisplayName = (account) =>
  account?.userName || account?.adminLoginId || account?.authEmail || account?.id || '관리자';

const getAdminRole = (account) => account?.adminRole || 'owner';

const formatTimestampValue = (value) => {
  if (!value) return '기록 없음';
  if (typeof value?.toDate === 'function') return value.toDate().toLocaleString('ko-KR');
  if (typeof value === 'string') return value;
  return new Date(value).toLocaleString('ko-KR');
};

const snapshotCollection = async (collectionName, includePersonalData) => {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((item) => ({
    id: item.id,
    data: redactBackupDocument(collectionName, item.data(), includePersonalData),
  }));
};

const deleteCollectionDocuments = async (collectionName, onProgress) => {
  const snapshot = await getDocs(collection(db, collectionName));
  const docs = snapshot.docs;
  let deleted = 0;

  for (let start = 0; start < docs.length; start += FIRESTORE_DELETE_BATCH_SIZE) {
    const batch = writeBatch(db);
    const slice = docs.slice(start, start + FIRESTORE_DELETE_BATCH_SIZE);
    slice.forEach((item) => batch.delete(item.ref));
    await batch.commit();
    deleted += slice.length;
    onProgress?.(deleted, docs.length);
  }

  return docs.length;
};

const buildAuthCleanupScript = () => `/**
 * Firebase Authentication 일반회원 일괄 삭제 스크립트
 *
 * 준비:
 *   npm install firebase-admin
 *   Firebase Console > 프로젝트 설정 > 서비스 계정에서 키 JSON 다운로드
 *
 * 실행:
 *   node delete-non-admin-auth-users.mjs ./service-account.json ./non-admin-auth-users-to-delete.json
 *
 * 주의: 서비스 계정 키를 GitHub, 웹 프로젝트, Firestore에 업로드하지 마십시오.
 */
import fs from 'node:fs/promises';
import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [, , serviceAccountPath, uidFilePath] = process.argv;
if (!serviceAccountPath || !uidFilePath) {
  console.error('사용법: node delete-non-admin-auth-users.mjs <service-account.json> <uid-list.json>');
  process.exit(1);
}

const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
const uidFile = JSON.parse(await fs.readFile(uidFilePath, 'utf8'));
const uids = Array.isArray(uidFile.uids) ? uidFile.uids.filter(Boolean) : [];

initializeApp({ credential: cert(serviceAccount) });

if (uids.length === 0) {
  console.log('삭제할 UID가 없습니다.');
  process.exit(0);
}

const result = await getAuth().deleteUsers(uids);
console.log('삭제 성공:', result.successCount);
console.log('삭제 실패:', result.failureCount);
result.errors.forEach((item) => {
  console.error(item.index, uids[item.index], item.error?.message || item.error);
});
`;

function ToggleSwitch({ checked, disabled = false, onChange, label, description = '' }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="min-w-0">
        <div className="text-sm font-bold text-slate-900">{label}</div>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${
          checked ? 'bg-[var(--mk-orange)]' : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}

function SectionCard({ title, description, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-black text-slate-900">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function AdminSettingsPanel({ ctx }) {
  const {
    AdminPageHeader,
    Button,
    Input,
    Select,
    authenticatedAdminAccount,
    data,
    finalizeSplitStorageMigration,
    isSplitStorageReady,
    siteSettings,
    siteSettingsLoadErrorMessage,
    siteSettingsReady,
    splitStorageFinalizeLoading,
    systemAdminSettings,
    systemAdminSettingsLoadErrorMessage,
    systemAdminSettingsReady,
    triggerConfirm,
    triggerToast,
  } = ctx;

  const [activeTab, setActiveTab] = useState(SYSTEM_MANAGEMENT_TAB.SITE);
  const [siteDraft, setSiteDraft] = useState(() => normalizeSiteSettings(siteSettings));
  const [securityDraft, setSecurityDraft] = useState(() => normalizeSystemAdminSettings(systemAdminSettings));
  const [siteSaving, setSiteSaving] = useState(false);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditReady, setAuditReady] = useState(false);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityResult, setIntegrityResult] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupIncludeOperations, setBackupIncludeOperations] = useState(true);
  const [backupIncludeMembers, setBackupIncludeMembers] = useState(false);
  const [backupIncludePersonalData, setBackupIncludePersonalData] = useState(false);
  const [selectedResetScopes, setSelectedResetScopes] = useState(TEST_DATA_PRESET);
  const [resetCounts, setResetCounts] = useState(null);
  const [resetScanLoading, setResetScanLoading] = useState(false);
  const [resetRunning, setResetRunning] = useState(false);
  const [resetProgress, setResetProgress] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetBackupReady, setResetBackupReady] = useState(false);
  const [latestResetJob, setLatestResetJob] = useState(null);

  const isOwner = getAdminRole(authenticatedAdminAccount) === 'owner';
  const siteDirty = JSON.stringify(siteDraft) !== JSON.stringify(normalizeSiteSettings(siteSettings));
  const securityDirty = JSON.stringify(securityDraft) !== JSON.stringify(normalizeSystemAdminSettings(systemAdminSettings));

  useEffect(() => {
    setSiteDraft(normalizeSiteSettings(siteSettings));
  }, [siteSettings]);

  useEffect(() => {
    setSecurityDraft(normalizeSystemAdminSettings(systemAdminSettings));
  }, [systemAdminSettings]);

  useEffect(() => {
    if (!authenticatedAdminAccount) return undefined;

    const auditQuery = query(
      SYSTEM_AUDIT_LOGS_COLLECTION_REF,
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubscribeAudit = onSnapshot(
      auditQuery,
      (snapshot) => {
        setAuditLogs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setAuditReady(true);
      },
      (error) => {
        console.error('System audit log load error:', error);
        setAuditReady(true);
      }
    );

    let unsubscribeReset = () => {};
    if (getAdminRole(authenticatedAdminAccount) === 'owner') {
      const resetQuery = query(
        SYSTEM_RESET_JOBS_COLLECTION_REF,
        orderBy('startedAt', 'desc'),
        limit(1)
      );
      unsubscribeReset = onSnapshot(
        resetQuery,
        (snapshot) => {
          setLatestResetJob(snapshot.docs[0]
            ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() }
            : null);
        },
        (error) => console.error('System reset job load error:', error)
      );
    } else {
      setLatestResetJob(null);
    }

    return () => {
      unsubscribeAudit();
      unsubscribeReset();
    };
  }, [authenticatedAdminAccount?.id, authenticatedAdminAccount?.adminRole]);

  const writeAuditLog = async ({ action, section, beforeValues = null, afterValues = null, summary = '' }) => {
    await addDoc(SYSTEM_AUDIT_LOGS_COLLECTION_REF, {
      action,
      section,
      summary,
      beforeValues: beforeValues ? cloneForAudit(beforeValues) : null,
      afterValues: afterValues ? cloneForAudit(afterValues) : null,
      adminUid: authenticatedAdminAccount?.id || '',
      adminName: getAdminDisplayName(authenticatedAdminAccount),
      adminEmail: authenticatedAdminAccount?.authEmail || authenticatedAdminAccount?.email || '',
      createdAt: serverTimestamp(),
    });
  };

  const validateSiteDraft = () => {
    if (!siteDraft.siteName.trim()) return '사이트 정식 명칭을 입력해 주세요.';
    if (!siteDraft.siteShortName.trim()) return '사이트 짧은 명칭을 입력해 주세요.';
    if (!isValidHexColor(siteDraft.primaryColor)) return '기본 강조색은 #RRGGBB 형식으로 입력해 주세요.';
    if (!isValidHexColor(siteDraft.primaryDarkColor)) return '진한 강조색은 #RRGGBB 형식으로 입력해 주세요.';
    if (siteDraft.serviceMode === SERVICE_MODE.MAINTENANCE && !siteDraft.maintenanceTitle.trim()) {
      return '점검 제목을 입력해 주세요.';
    }
    return '';
  };

  const saveSiteSettings = async () => {
    const validationMessage = validateSiteDraft();
    if (validationMessage) {
      triggerToast(validationMessage, 'error');
      return;
    }

    setSiteSaving(true);
    const beforeValues = normalizeSiteSettings(siteSettings);
    const afterValues = normalizeSiteSettings(siteDraft);

    try {
      await setDoc(
        SITE_SETTINGS_DOC_REF,
        {
          ...afterValues,
          updatedAt: serverTimestamp(),
          updatedBy: authenticatedAdminAccount?.id || '',
          updatedByName: getAdminDisplayName(authenticatedAdminAccount),
        },
        { merge: true }
      );
      await writeAuditLog({
        action: 'site-settings-update',
        section: activeTab === SYSTEM_MANAGEMENT_TAB.SERVICE ? '서비스 운영' : '사이트 기본 설정',
        beforeValues,
        afterValues,
        summary: '사이트 공통 설정을 변경했습니다.',
      });
      triggerToast('사이트 설정이 저장되었습니다.', 'success');
    } catch (error) {
      console.error('Site settings save error:', error);
      triggerToast('사이트 설정 저장에 실패했습니다. Firestore 권한을 확인해 주세요.', 'error');
    } finally {
      setSiteSaving(false);
    }
  };

  const saveSecuritySettings = async () => {
    if (!isOwner) {
      triggerToast('최고 관리자만 관리자 보안 설정을 변경할 수 있습니다.', 'error');
      return;
    }

    const normalized = normalizeSystemAdminSettings(securityDraft);
    const beforeValues = normalizeSystemAdminSettings(systemAdminSettings);
    const changed =
      normalized.adminIdleTimeoutMinutes !== beforeValues.adminIdleTimeoutMinutes ||
      normalized.adminAbsoluteTimeoutHours !== beforeValues.adminAbsoluteTimeoutHours;
    const nextValues = {
      ...normalized,
      adminSecurityPolicyVersion: changed
        ? beforeValues.adminSecurityPolicyVersion + 1
        : beforeValues.adminSecurityPolicyVersion,
    };

    setSecuritySaving(true);
    try {
      await setDoc(
        SYSTEM_ADMIN_SETTINGS_DOC_REF,
        {
          ...nextValues,
          updatedAt: serverTimestamp(),
          updatedBy: authenticatedAdminAccount?.id || '',
        },
        { merge: true }
      );
      await writeAuditLog({
        action: 'admin-security-update',
        section: '관리자 보안',
        beforeValues,
        afterValues: nextValues,
        summary: changed
          ? '관리자 세션 정책을 변경하여 기존 관리자 세션이 다음 확인 시 종료됩니다.'
          : '관리자 보안 설정을 저장했습니다.',
      });
      triggerToast(
        changed
          ? '관리자 보안 설정이 저장되었습니다. 기존 관리자 세션은 다시 로그인이 필요합니다.'
          : '관리자 보안 설정이 저장되었습니다.',
        'success'
      );
    } catch (error) {
      console.error('Admin security settings save error:', error);
      triggerToast('관리자 보안 설정 저장에 실패했습니다.', 'error');
    } finally {
      setSecuritySaving(false);
    }
  };

  const runIntegrityCheck = async () => {
    setIntegrityLoading(true);
    try {
      const [assets, assetNumbers, availability, requests, users, claims, recovery, restrictions] = await Promise.all([
        getDocs(collection(db, 'rentalAssets')),
        getDocs(collection(db, 'rentalAssetNumbers')),
        getDocs(collection(db, 'rentalAvailability')),
        getDocs(collection(db, 'rentalRequests')),
        getDocs(collection(db, 'userAccounts')),
        getDocs(collection(db, 'memberIdentityClaims')),
        getDocs(collection(db, 'accountRecoveryKeys')),
        getDocs(collection(db, 'rentalRestrictions')),
      ]);

      const assetIds = new Set(assets.docs.map((item) => item.id));
      const requestIds = new Set(requests.docs.map((item) => item.id));
      const userIds = new Set(users.docs.map((item) => item.id));
      const availabilityIds = new Set(availability.docs.map((item) => item.id));
      const issues = [];

      requests.docs.forEach((item) => {
        const value = item.data();
        if (value.laptopId && !assetIds.has(value.laptopId)) {
          issues.push({ level: 'error', code: 'missing-asset', message: `${item.id}: 존재하지 않는 자산 ${value.laptopId} 참조` });
        }
        if (['신청중', '보류', '대여중'].includes(value.status) && (!value.startDate || !value.dueDate)) {
          issues.push({ level: 'error', code: 'missing-period', message: `${item.id}: 진행 중 신청의 날짜 누락` });
        }
        if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
          issues.push({ level: 'error', code: 'invalid-period', message: `${item.id}: 반납일이 시작일보다 빠름` });
        }
        if (value.requesterUid && !userIds.has(value.requesterUid)) {
          issues.push({ level: 'warning', code: 'missing-user', message: `${item.id}: 회원 문서가 없는 UID 참조` });
        }
      });

      availability.docs.forEach((item) => {
        if (!requestIds.has(item.id)) {
          issues.push({ level: 'warning', code: 'orphan-availability', message: `${item.id}: 정식 신청 없이 예약 요약만 존재` });
        }
      });

      users.docs.forEach((item) => {
        const value = item.data();
        if (value.status === 'retired' && value.identityKey) {
          issues.push({ level: 'warning', code: 'retired-identity', message: `${item.id}: 탈퇴회원에 활성 identityKey 잔존` });
        }
        if (value.status !== 'retired' && value.identityKey && !claims.docs.some((claim) => claim.id === value.identityKey)) {
          issues.push({ level: 'warning', code: 'missing-claim', message: `${item.id}: 부서·성명 점유 문서 누락` });
        }
        if (value.status !== 'retired' && value.recoveryKey && !recovery.docs.some((record) => record.id === value.recoveryKey)) {
          issues.push({ level: 'warning', code: 'missing-recovery', message: `${item.id}: 이메일 찾기 복구키 누락` });
        }
      });

      restrictions.docs.forEach((item) => {
        const value = item.data();
        if (value.restrictionUntil && String(value.restrictionUntil) < new Date().toISOString().slice(0, 10) && value.restrictionStatus === 'active') {
          issues.push({ level: 'warning', code: 'expired-restriction', message: `${item.id}: 만료된 제재가 활성 상태` });
        }
      });

      const result = {
        checkedAtText: new Date().toLocaleString('ko-KR'),
        counts: {
          assets: assets.size,
          assetNumbers: assetNumbers.size,
          availability: availability.size,
          requests: requests.size,
          users: users.size,
          claims: claims.size,
          recovery: recovery.size,
          restrictions: restrictions.size,
        },
        normal: issues.length === 0,
        warnings: issues.filter((item) => item.level === 'warning').length,
        errors: issues.filter((item) => item.level === 'error').length,
        issues,
      };

      setIntegrityResult(result);
      await setDoc(
        SYSTEM_ADMIN_SETTINGS_DOC_REF,
        {
          lastIntegrityCheckAt: serverTimestamp(),
          lastIntegrityCheckBy: authenticatedAdminAccount?.id || '',
          lastIntegrityCheckSummary: {
            normal: result.normal,
            warnings: result.warnings,
            errors: result.errors,
            counts: result.counts,
          },
        },
        { merge: true }
      );
      await writeAuditLog({
        action: 'system-integrity-check',
        section: '데이터 점검',
        afterValues: result,
        summary: `시스템 데이터 점검: 오류 ${result.errors}건, 주의 ${result.warnings}건`,
      });
      triggerToast(
        result.normal
          ? '시스템 데이터 점검 결과 이상이 없습니다.'
          : `시스템 데이터 점검에서 오류 ${result.errors}건, 주의 ${result.warnings}건을 확인했습니다.`,
        result.normal ? 'success' : 'error'
      );
    } catch (error) {
      console.error('System integrity check error:', error);
      triggerToast('시스템 데이터 점검에 실패했습니다.', 'error');
    } finally {
      setIntegrityLoading(false);
    }
  };

  const createBackupPayload = async ({ includeOperations, includeMembers, includePersonalData }) => {
    const collectionNames = new Set(BACKUP_COLLECTIONS.settings);
    if (includeOperations) BACKUP_COLLECTIONS.operations.forEach((name) => collectionNames.add(name));
    if (includeMembers) BACKUP_COLLECTIONS.members.forEach((name) => collectionNames.add(name));

    const collections = {};
    for (const collectionName of collectionNames) {
      collections[collectionName] = await snapshotCollection(collectionName, includePersonalData);
    }

    const documents = {};
    for (const [key, collectionName, documentId] of BACKUP_DOCUMENTS) {
      const snapshot = await getDoc(doc(db, collectionName, documentId));
      documents[key] = snapshot.exists()
        ? redactBackupDocument(collectionName, snapshot.data(), includePersonalData)
        : null;
    }

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedAtKorea: new Date().toLocaleString('ko-KR'),
        applicationVersion: 'system-management-v1',
        schemaVersion: Number(systemAdminSettings?.schemaVersion || 1),
        firebaseProjectId: firebaseConfig.projectId,
        includeOperations,
        includeMembers,
        includePersonalData,
        exportedBy: authenticatedAdminAccount?.id || '',
      },
      documents,
      collections,
    };
  };

  const downloadBackup = async (options = {}) => {
    setBackupLoading(true);
    try {
      const payload = await createBackupPayload({
        includeOperations: options.includeOperations ?? backupIncludeOperations,
        includeMembers: options.includeMembers ?? backupIncludeMembers,
        includePersonalData: options.includePersonalData ?? backupIncludePersonalData,
      });
      const filename = `rental-system-backup-${formatBackupTimestamp()}.json`;
      createDownload(filename, JSON.stringify(payload, null, 2));
      await setDoc(
        SYSTEM_ADMIN_SETTINGS_DOC_REF,
        {
          lastBackupGeneratedAt: serverTimestamp(),
          lastBackupGeneratedBy: authenticatedAdminAccount?.id || '',
        },
        { merge: true }
      );
      await writeAuditLog({
        action: 'system-backup-download',
        section: '데이터 백업',
        afterValues: payload.metadata,
        summary: '시스템 백업 파일을 생성했습니다.',
      });
      triggerToast('백업 파일을 생성했습니다.', 'success');
      return true;
    } catch (error) {
      console.error('System backup error:', error);
      triggerToast('백업 파일 생성에 실패했습니다.', 'error');
      return false;
    } finally {
      setBackupLoading(false);
    }
  };

  const scanResetTargets = async () => {
    if (!isOwner) {
      triggerToast('최고 관리자만 데이터 초기화를 실행할 수 있습니다.', 'error');
      return;
    }
    setResetScanLoading(true);
    try {
      const counts = {};
      const collectionNames = Array.from(new Set(
        selectedResetScopes.flatMap((scope) => RESET_SCOPE_META[scope]?.collections || [])
      ));
      for (const name of collectionNames) {
        const snapshot = await getDocs(collection(db, name));
        counts[name] = snapshot.size;
      }
      setResetCounts(counts);
      setResetBackupReady(false);
      triggerToast('초기화 대상 문서 수를 확인했습니다.', 'success');
    } catch (error) {
      console.error('Reset target scan error:', error);
      triggerToast('초기화 대상 확인에 실패했습니다.', 'error');
    } finally {
      setResetScanLoading(false);
    }
  };

  const downloadResetBackup = async () => {
    const succeeded = await downloadBackup({
      includeOperations: true,
      includeMembers: true,
      includePersonalData: true,
    });
    if (succeeded) setResetBackupReady(true);
  };

  const downloadAuthCleanupFiles = (uids) => {
    createDownload(
      'non-admin-auth-users-to-delete.json',
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        firebaseProjectId: firebaseConfig.projectId,
        uids,
      }, null, 2)
    );
    createDownload(
      'delete-non-admin-auth-users.mjs',
      buildAuthCleanupScript(),
      'text/javascript;charset=utf-8'
    );
  };

  const updateResetJob = async (jobRef, values) => {
    await setDoc(jobRef, {
      ...values,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const executeReset = async ({ resumeJob = null } = {}) => {
    if (!isOwner) {
      triggerToast('최고 관리자만 데이터 초기화를 실행할 수 있습니다.', 'error');
      return;
    }
    if (!resetBackupReady && !resumeJob) {
      triggerToast('초기화 전 개인정보 포함 백업 파일을 먼저 생성해 주세요.', 'error');
      return;
    }
    if (!resumeJob && resetConfirmText !== RESET_CONFIRM_TEXT) {
      triggerToast(`확인 문구 “${RESET_CONFIRM_TEXT}”를 정확히 입력해 주세요.`, 'error');
      return;
    }
    if (!resetPassword) {
      triggerToast('현재 관리자 비밀번호를 입력해 주세요.', 'error');
      return;
    }
    if (!firebaseAuth.currentUser?.email) {
      triggerToast('현재 Firebase 관리자 로그인 세션을 확인할 수 없습니다.', 'error');
      return;
    }

    const scopes = resumeJob?.scopes || selectedResetScopes;

    if (scopes.includes(SYSTEM_RESET_SCOPE.ASSETS) && !scopes.includes(SYSTEM_RESET_SCOPE.RENTALS)) {
      const rentalSnapshot = await getDocs(collection(db, 'rentalRequests'));
      if (!rentalSnapshot.empty) {
        triggerToast('대여내역이 남아 있어 자산만 초기화할 수 없습니다. 신청·대여내역을 함께 선택해 주세요.', 'error');
        return;
      }
    }
    if (scopes.includes(SYSTEM_RESET_SCOPE.MEMBERS) && !scopes.includes(SYSTEM_RESET_SCOPE.RENTALS)) {
      const rentalSnapshot = await getDocs(collection(db, 'rentalRequests'));
      if (!rentalSnapshot.empty) {
        triggerToast('대여내역이 남아 있어 회원정보만 초기화할 수 없습니다. 신청·대여내역을 함께 선택해 주세요.', 'error');
        return;
      }
    }

    const credential = EmailAuthProvider.credential(
      firebaseAuth.currentUser.email,
      resetPassword
    );

    setResetRunning(true);
    setResetProgress({ step: '관리자 재인증', completed: 0, total: 1 });

    let jobRef = resumeJob?.id
      ? doc(SYSTEM_RESET_JOBS_COLLECTION_REF, resumeJob.id)
      : doc(SYSTEM_RESET_JOBS_COLLECTION_REF);
    let authUids = [];

    try {
      await reauthenticateWithCredential(firebaseAuth.currentUser, credential);

      if (!resumeJob) {
        await setDoc(jobRef, {
          status: 'running',
          scopes,
          selectedCollections: Array.from(new Set(scopes.flatMap((scope) => RESET_SCOPE_META[scope]?.collections || []))),
          currentStep: 'maintenance',
          deletedCounts: {},
          failedDocuments: [],
          startedAt: serverTimestamp(),
          startedBy: authenticatedAdminAccount?.id || '',
          startedByName: getAdminDisplayName(authenticatedAdminAccount),
        });
      } else {
        await updateResetJob(jobRef, { status: 'running', resumedAt: serverTimestamp() });
      }

      const previousSiteSettings = normalizeSiteSettings(siteSettings);
      await setDoc(SITE_SETTINGS_DOC_REF, {
        ...previousSiteSettings,
        serviceMode: SERVICE_MODE.MAINTENANCE,
        maintenanceTitle: '시스템 데이터 정비 중입니다.',
        maintenanceMessage: '관리자가 시스템 데이터를 정비하고 있습니다. 작업 완료 후 다시 이용해 주세요.',
        updatedAt: serverTimestamp(),
        updatedBy: authenticatedAdminAccount?.id || '',
      }, { merge: true });
      await updateResetJob(jobRef, { currentStep: 'collect-auth-uids' });

      if (scopes.includes(SYSTEM_RESET_SCOPE.MEMBERS)) {
        const userSnapshot = await getDocs(collection(db, 'userAccounts'));
        authUids = userSnapshot.docs.map((item) => item.id).filter(Boolean);
        downloadAuthCleanupFiles(authUids);
      }

      const collectionNames = Array.from(new Set(
        scopes.flatMap((scope) => RESET_SCOPE_META[scope]?.collections || [])
      ));
      const deletedCounts = {};

      for (let index = 0; index < collectionNames.length; index += 1) {
        const collectionName = collectionNames[index];
        setResetProgress({
          step: `${collectionName} 삭제`,
          completed: index,
          total: collectionNames.length,
        });
        await updateResetJob(jobRef, { currentStep: `delete:${collectionName}` });
        deletedCounts[collectionName] = await deleteCollectionDocuments(
          collectionName,
          (completed, total) => setResetProgress({
            step: `${collectionName} 삭제`,
            completed,
            total,
          })
        );
        await updateResetJob(jobRef, { deletedCounts });
      }

      if (scopes.includes(SYSTEM_RESET_SCOPE.CONTENT)) {
        for (const [collectionName, documentId] of CONTENT_CONFIG_DOCS) {
          await deleteDoc(doc(db, collectionName, documentId)).catch(() => {});
        }
      }

      const publicConfigSnapshot = await getDoc(PUBLIC_CONFIG_DOC_REF);
      const publicConfig = publicConfigSnapshot.exists() ? publicConfigSnapshot.data() : {};
      const publicConfigUpdates = {};

      if (scopes.includes(SYSTEM_RESET_SCOPE.ORGANIZATION)) {
        publicConfigUpdates.teams = [];
        publicConfigUpdates.settings = {
          ...(publicConfig.settings || {}),
          requireRegisteredMemberForSignup: false,
          autoApproveNewMembers: false,
          memberDirectoryVersion: Number(publicConfig.settings?.memberDirectoryVersion || 0) + 1,
          memberIdentityClaimsReady: false,
        };
      }

      if (scopes.includes(SYSTEM_RESET_SCOPE.ASSETS)) {
        publicConfigUpdates.assetCategories = publicConfig.assetCategories || [];
      }

      if (Object.keys(publicConfigUpdates).length > 0) {
        await setDoc(PUBLIC_CONFIG_DOC_REF, {
          ...publicConfigUpdates,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      if (scopes.includes(SYSTEM_RESET_SCOPE.SETTINGS)) {
        await setDoc(SITE_SETTINGS_DOC_REF, {
          ...DEFAULT_SITE_SETTINGS,
          serviceMode: SERVICE_MODE.MAINTENANCE,
          maintenanceTitle: '시스템 데이터 정비가 완료되었습니다.',
          maintenanceMessage: '관리자가 정상 운영 전환을 확인하고 있습니다.',
          updatedAt: serverTimestamp(),
          updatedBy: authenticatedAdminAccount?.id || '',
        }, { merge: false });
      }

      setIntegrityResult(null);
      setResetCounts(null);
      setResetBackupReady(false);
      setResetConfirmText('');
      setResetPassword('');
      setResetProgress({ step: '완료', completed: collectionNames.length, total: collectionNames.length });

      await updateResetJob(jobRef, {
        status: 'completed',
        currentStep: 'completed',
        deletedCounts,
        authUidCount: authUids.length,
        completedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'system-data-reset',
        section: '데이터 초기화',
        afterValues: { scopes, deletedCounts, authUidCount: authUids.length, resetJobId: jobRef.id },
        summary: `데이터 초기화 완료: ${scopes.map((scope) => RESET_SCOPE_META[scope]?.label).join(', ')}`,
      });
      triggerToast(
        authUids.length > 0
          ? `Firestore 초기화가 완료되었습니다. 일반회원 Auth UID ${authUids.length}건은 내려받은 로컬 스크립트 또는 Firebase Console에서 삭제해 주세요.`
          : 'Firestore 데이터 초기화가 완료되었습니다. 시스템은 점검 모드로 유지됩니다.',
        'success'
      );
    } catch (error) {
      console.error('System reset error:', error);
      await updateResetJob(jobRef, {
        status: 'failed',
        errorMessage: error?.message || String(error),
        failedAt: serverTimestamp(),
      }).catch(() => {});
      triggerToast(
        error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential'
          ? '현재 관리자 비밀번호가 올바르지 않습니다.'
          : '데이터 초기화가 중단되었습니다. 중단된 작업을 다시 실행할 수 있습니다.',
        'error'
      );
    } finally {
      setResetRunning(false);
    }
  };

  const renderSiteTab = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <div className="space-y-5">
        <SectionCard title="사이트 명칭" description="헤더, 로그인 화면, 기본 비주얼과 브라우저 제목에 적용됩니다.">
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="사이트 정식 명칭" value={siteDraft.siteName} onChange={(value) => setSiteDraft({ ...siteDraft, siteName: value })} />
            <Input label="사이트 짧은 명칭" value={siteDraft.siteShortName} onChange={(value) => setSiteDraft({ ...siteDraft, siteShortName: value })} />
            <Input label="기관명" value={siteDraft.organizationName} onChange={(value) => setSiteDraft({ ...siteDraft, organizationName: value })} />
            <Input label="브라우저 제목" value={siteDraft.browserTitle} onChange={(value) => setSiteDraft({ ...siteDraft, browserTitle: value })} />
            <div className="md:col-span-2">
              <Input label="사이트 설명" value={siteDraft.metaDescription} onChange={(value) => setSiteDraft({ ...siteDraft, metaDescription: value })} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="헤더 부제·주소" description="현재 접속 주소를 자동 표시하거나 직접 입력할 수 있습니다.">
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="표시 방식" value={siteDraft.headerSubtitleMode} onChange={(value) => setSiteDraft({ ...siteDraft, headerSubtitleMode: value })}>
              <option value="currentOrigin">현재 접속 도메인 자동 표시</option>
              <option value="custom">직접 입력</option>
              <option value="hidden">표시하지 않음</option>
            </Select>
            <Input label="연결 주소" value={siteDraft.siteUrl} onChange={(value) => setSiteDraft({ ...siteDraft, siteUrl: value })} placeholder="https://example.com" />
            {siteDraft.headerSubtitleMode === 'custom' ? (
              <div className="md:col-span-2">
                <Input label="표시 문구" value={siteDraft.headerSubtitleText} onChange={(value) => setSiteDraft({ ...siteDraft, headerSubtitleText: value })} placeholder="사내 기기 대여 포털" />
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="로고·브랜드" description="오류·경고·성공 상태 색상은 변경하지 않고 주요 버튼과 선택 요소에만 적용됩니다.">
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="로고 표시 방식" value={siteDraft.logoMode} onChange={(value) => setSiteDraft({ ...siteDraft, logoMode: value })}>
              <option value="icon">기본 노트북 아이콘</option>
              <option value="image">이미지 로고</option>
              <option value="text">텍스트만 표시</option>
            </Select>
            <Input label="로고 대체 텍스트" value={siteDraft.logoAltText} onChange={(value) => setSiteDraft({ ...siteDraft, logoAltText: value })} />
            {siteDraft.logoMode === 'image' ? (
              <>
                <Input label="PC 로고 이미지 URL" value={siteDraft.logoImageUrl} onChange={(value) => setSiteDraft({ ...siteDraft, logoImageUrl: value })} />
                <Input label="모바일 로고 이미지 URL" value={siteDraft.mobileLogoImageUrl} onChange={(value) => setSiteDraft({ ...siteDraft, mobileLogoImageUrl: value })} />
              </>
            ) : null}
            <Input label="파비콘 URL" value={siteDraft.faviconUrl} onChange={(value) => setSiteDraft({ ...siteDraft, faviconUrl: value })} />
            <Input label="기본 강조색" value={siteDraft.primaryColor} onChange={(value) => setSiteDraft({ ...siteDraft, primaryColor: value.toUpperCase() })} placeholder="#FF6B00" />
            <Input label="진한 강조색" value={siteDraft.primaryDarkColor} onChange={(value) => setSiteDraft({ ...siteDraft, primaryDarkColor: value.toUpperCase() })} placeholder="#E65300" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="h-10 w-10 rounded-xl" style={{ background: siteDraft.primaryColor }} />
            <div className="h-10 w-10 rounded-xl" style={{ background: siteDraft.primaryDarkColor }} />
            <button type="button" className="rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: `linear-gradient(135deg, ${siteDraft.primaryColor}, ${siteDraft.primaryDarkColor})` }}>미리보기 버튼</button>
            <Button type="button" variant="outline" onClick={() => setSiteDraft({ ...siteDraft, primaryColor: DEFAULT_SITE_SETTINGS.primaryColor, primaryDarkColor: DEFAULT_SITE_SETTINGS.primaryDarkColor })}>기본색 복원</Button>
          </div>
        </SectionCard>

        <SectionCard title="기본 메인 비주얼" description="등록된 메인 배너가 없을 때만 표시됩니다.">
          <div className="space-y-4">
            <ToggleSwitch checked={siteDraft.defaultHeroEnabled} onChange={(value) => setSiteDraft({ ...siteDraft, defaultHeroEnabled: value })} label="기본 메인 비주얼 사용" description="끄면 등록 배너가 없는 경우 간소화된 빈 영역으로 표시됩니다." />
            <Input label="기본 제목" value={siteDraft.defaultHeroTitle} onChange={(value) => setSiteDraft({ ...siteDraft, defaultHeroTitle: value })} placeholder="비워 두면 사이트 정식 명칭 사용" />
            <Input label="기본 설명" value={siteDraft.defaultHeroDescription} onChange={(value) => setSiteDraft({ ...siteDraft, defaultHeroDescription: value })} />
          </div>
        </SectionCard>

        <SectionCard title="서비스 문의 정보" description="가입 대기, 이용 중지, 점검, 탈퇴 제한 안내에 공통으로 표시할 수 있습니다.">
          <div className="space-y-4">
            <ToggleSwitch checked={siteDraft.supportEnabled} onChange={(value) => setSiteDraft({ ...siteDraft, supportEnabled: value })} label="문의 정보 표시" />
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="담당 부서" value={siteDraft.supportDepartment} onChange={(value) => setSiteDraft({ ...siteDraft, supportDepartment: value })} />
              <Input label="문의 이메일" type="email" value={siteDraft.supportEmail} onChange={(value) => setSiteDraft({ ...siteDraft, supportEmail: value })} />
              <Input label="문의 전화번호" value={siteDraft.supportPhone} onChange={(value) => setSiteDraft({ ...siteDraft, supportPhone: value })} />
              <Input label="문의 가능 시간" value={siteDraft.supportHours} onChange={(value) => setSiteDraft({ ...siteDraft, supportHours: value })} />
              <div className="md:col-span-2">
                <Input label="문의 안내 문구" value={siteDraft.supportMessage} onChange={(value) => setSiteDraft({ ...siteDraft, supportMessage: value })} />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-5">
        <SectionCard title="실시간 미리보기" description="저장 전 사이트 헤더와 주요 색상을 확인합니다.">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {siteDraft.logoMode === 'image' && siteDraft.logoImageUrl ? (
                <img src={siteDraft.logoImageUrl} alt={siteDraft.logoAltText} className="h-11 max-w-[120px] object-contain" />
              ) : siteDraft.logoMode === 'text' ? null : (
                <div className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${siteDraft.primaryColor}, ${siteDraft.primaryDarkColor})` }}>
                  <HardDrive size={22} />
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-900">{siteDraft.siteName || '사이트명'}</div>
                <div className="truncate text-xs text-slate-500">
                  {siteDraft.headerSubtitleMode === 'hidden'
                    ? '부제 숨김'
                    : siteDraft.headerSubtitleMode === 'custom'
                      ? siteDraft.headerSubtitleText || siteDraft.siteUrl || '직접 입력 문구'
                      : window.location.origin}
                </div>
              </div>
            </div>
            <div className="mt-5 rounded-2xl px-5 py-7 text-white" style={{ background: `linear-gradient(135deg, #0f172a, ${siteDraft.primaryDarkColor})` }}>
              <div className="text-lg font-black">{siteDraft.defaultHeroTitle || siteDraft.siteName}</div>
              <div className="mt-2 text-xs text-white/80">{siteDraft.defaultHeroDescription}</div>
            </div>
          </div>
        </SectionCard>
        <div className="sticky top-24 flex justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <Button type="button" variant="outline" disabled={!siteDirty || siteSaving} onClick={() => setSiteDraft(normalizeSiteSettings(siteSettings))}>변경 취소</Button>
          <Button type="button" disabled={!siteDirty || siteSaving} onClick={saveSiteSettings}><Save size={14} />{siteSaving ? '저장 중' : '사이트 설정 저장'}</Button>
        </div>
      </div>
    </div>
  );

  const renderServiceTab = () => (
    <div className="space-y-5">
      <SectionCard title="서비스 운영 모드" description="관리자 화면은 계속 사용할 수 있으며 일반 사용자 화면과 쓰기 권한만 제한합니다.">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            [SERVICE_MODE.NORMAL, '정상 운영', '모든 사용자 기능을 정상 제공합니다.', 'border-emerald-200 bg-emerald-50'],
            [SERVICE_MODE.READ_ONLY, '읽기 전용', '조회는 가능하지만 사용자 변경 작업을 차단합니다.', 'border-amber-200 bg-amber-50'],
            [SERVICE_MODE.MAINTENANCE, '점검 중', '일반 사용자에게 점검 안내 페이지만 표시합니다.', 'border-rose-200 bg-rose-50'],
          ].map(([value, label, description, tone]) => (
            <button key={value} type="button" onClick={() => setSiteDraft({ ...siteDraft, serviceMode: value })} className={`rounded-2xl border p-4 text-left transition ${siteDraft.serviceMode === value ? `${tone} ring-2 ring-[var(--mk-orange)]/20` : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <div className="text-sm font-black text-slate-900">{label}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
            </button>
          ))}
        </div>
        {siteDraft.serviceMode === SERVICE_MODE.MAINTENANCE ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Input label="점검 제목" value={siteDraft.maintenanceTitle} onChange={(value) => setSiteDraft({ ...siteDraft, maintenanceTitle: value })} />
            <Input label="종료 예정일시" type="datetime-local" value={siteDraft.maintenanceEndAt} onChange={(value) => setSiteDraft({ ...siteDraft, maintenanceEndAt: value })} />
            <div className="md:col-span-2">
              <Input label="점검 설명" value={siteDraft.maintenanceMessage} onChange={(value) => setSiteDraft({ ...siteDraft, maintenanceMessage: value })} />
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="기능별 접수" description="정상 운영 중에도 특정 사용자 요청만 일시 중지할 수 있습니다. 화면과 Firestore Rules에 함께 적용됩니다.">
        <div className="grid gap-3 md:grid-cols-2">
          <ToggleSwitch checked={siteDraft.allowNewRentalRequests} onChange={(value) => setSiteDraft({ ...siteDraft, allowNewRentalRequests: value })} label="신규 대여신청 접수" />
          <ToggleSwitch checked={siteDraft.allowNewMemberSignup} onChange={(value) => setSiteDraft({ ...siteDraft, allowNewMemberSignup: value })} label="신규 회원가입 접수" />
          <ToggleSwitch checked={siteDraft.allowRequestChanges} onChange={(value) => setSiteDraft({ ...siteDraft, allowRequestChanges: value })} label="신청 변경·취소 요청" />
          <ToggleSwitch checked={siteDraft.allowExtensionRequests} onChange={(value) => setSiteDraft({ ...siteDraft, allowExtensionRequests: value })} label="대여 연장 요청" />
          <ToggleSwitch checked={siteDraft.allowReturnRequests} onChange={(value) => setSiteDraft({ ...siteDraft, allowReturnRequests: value })} label="반납 요청" />
        </div>
      </SectionCard>

      <SectionCard title="전역 시스템 안내" description="운영 장애나 예정된 점검처럼 모든 화면에서 계속 보여야 하는 짧은 안내입니다.">
        <div className="space-y-4">
          <ToggleSwitch checked={siteDraft.systemBannerEnabled} onChange={(value) => setSiteDraft({ ...siteDraft, systemBannerEnabled: value })} label="전역 안내 사용" />
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="중요도" value={siteDraft.systemBannerLevel} onChange={(value) => setSiteDraft({ ...siteDraft, systemBannerLevel: value })}>
              <option value="info">정보</option>
              <option value="warning">주의</option>
              <option value="critical">긴급</option>
            </Select>
            <Input label="연결 URL" value={siteDraft.systemBannerUrl} onChange={(value) => setSiteDraft({ ...siteDraft, systemBannerUrl: value })} />
            <div className="md:col-span-2">
              <Input label="안내 문구" value={siteDraft.systemBannerMessage} onChange={(value) => setSiteDraft({ ...siteDraft, systemBannerMessage: value })} />
            </div>
          </div>
          <ToggleSwitch checked={siteDraft.systemBannerDismissible} onChange={(value) => setSiteDraft({ ...siteDraft, systemBannerDismissible: value })} label="사용자가 닫을 수 있음" />
        </div>
      </SectionCard>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={!siteDirty || siteSaving} onClick={() => setSiteDraft(normalizeSiteSettings(siteSettings))}>변경 취소</Button>
        <Button type="button" disabled={!siteDirty || siteSaving} onClick={saveSiteSettings}><Save size={14} />{siteSaving ? '저장 중' : '서비스 운영 설정 저장'}</Button>
      </div>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="space-y-5">
      {!isOwner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
          관리자 보안 설정은 최고 관리자만 변경할 수 있습니다. 현재 값은 읽기 전용으로 표시됩니다.
        </div>
      ) : null}
      <SectionCard title="관리자 세션" description="마지막 활동 이후 자동 로그아웃 시간과 1회 로그인 절대 최대 유지시간을 설정합니다.">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="무활동 자동 로그아웃(분)" type="number" min="15" max="480" value={securityDraft.adminIdleTimeoutMinutes} onChange={(value) => setSecurityDraft({ ...securityDraft, adminIdleTimeoutMinutes: value })} disabled={!isOwner} />
          <Input label="1회 로그인 최대 유지시간(시간)" type="number" min="1" max="24" value={securityDraft.adminAbsoluteTimeoutHours} onChange={(value) => setSecurityDraft({ ...securityDraft, adminAbsoluteTimeoutHours: value })} disabled={!isOwner} />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
          정책 버전: {securityDraft.adminSecurityPolicyVersion}. 시간 설정을 변경하면 정책 버전이 증가하고 기존 관리자 세션은 다음 확인 시 로그아웃됩니다.
        </div>
      </SectionCard>
      <SectionCard title="로그인 공격 보호" description="Firebase Authentication의 자동 비정상 요청 제한을 사용합니다.">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
          <div>
            <div className="text-sm font-bold text-emerald-900">Firebase Authentication 자동 보호 사용</div>
            <p className="mt-1 text-xs leading-5 text-emerald-800">클라이언트가 임의로 실패 횟수를 기록하는 5회·5분 잠금은 계정 잠금 공격에 악용될 수 있어 사용하지 않습니다. 특정 관리자 계정의 수동 잠금은 관리자 ID 관리에서 처리합니다.</p>
          </div>
        </div>
      </SectionCard>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={!securityDirty || securitySaving} onClick={() => setSecurityDraft(normalizeSystemAdminSettings(systemAdminSettings))}>변경 취소</Button>
        <Button type="button" disabled={!isOwner || !securityDirty || securitySaving} onClick={saveSecuritySettings}><Save size={14} />{securitySaving ? '저장 중' : '관리자 보안 설정 저장'}</Button>
      </div>
    </div>
  );

  const renderDataTab = () => (
    <div className="space-y-5">
      <SectionCard title="Firestore 저장 구조" description="기존 분리 저장소 전환 상태와 데이터 스키마를 확인합니다.">
        {isSplitStorageReady ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 text-emerald-600" size={18} />
            <div>
              <div className="text-sm font-bold text-emerald-900">Firestore 분리 저장소 전환 완료</div>
              <p className="mt-1 text-xs leading-5 text-emerald-800">현재 서비스는 분리된 자산·예약·회원 컬렉션을 직접 사용합니다. 데이터 스키마 버전은 {systemAdminSettings?.schemaVersion || 1}입니다.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-bold text-amber-900">분리 저장소 최종 전환 필요</div>
            <p className="mt-1 text-xs leading-5 text-amber-800">전환 전에 서비스를 중지하고 기존 데이터 백업을 확보해 주세요.</p>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" disabled={splitStorageFinalizeLoading} onClick={() => triggerConfirm('Firestore 분리 저장소 최종 전환', '신규 컬렉션 데이터를 검증하고 예약 잠금 및 자산관리번호 레지스트리를 생성합니다. 계속하시겠습니까?', finalizeSplitStorageMigration)}>
                <Save size={14} />{splitStorageFinalizeLoading ? '최종 전환 중' : '분리 저장소 최종 전환'}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="시스템 데이터 점검" description="자동 복구하지 않고 참조 불일치와 누락 데이터를 먼저 확인합니다.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs leading-5 text-slate-500">자산, 신청, 예약 잠금, 회원 인덱스, 복구키, 대여 제한을 검사합니다.</div>
          <Button type="button" variant="outline" disabled={integrityLoading} onClick={runIntegrityCheck}><RefreshCw size={14} className={integrityLoading ? 'animate-spin' : ''} />{integrityLoading ? '점검 중' : '시스템 데이터 점검'}</Button>
        </div>
        {integrityResult ? (
          <div className="mt-5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">오류</div><div className="mt-1 text-2xl font-black text-rose-600">{integrityResult.errors}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">주의</div><div className="mt-1 text-2xl font-black text-amber-600">{integrityResult.warnings}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">검사 시각</div><div className="mt-1 text-sm font-bold text-slate-900">{integrityResult.checkedAtText}</div></div>
            </div>
            {integrityResult.issues.length > 0 ? (
              <div className="max-h-80 space-y-2 overflow-auto rounded-2xl border border-slate-200 p-3">
                {integrityResult.issues.map((issue, index) => (
                  <div key={`${issue.code}-${index}`} className={`rounded-xl border px-3 py-2 text-xs ${issue.level === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{issue.message}</div>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">현재 확인된 데이터 이상이 없습니다.</div>}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="수동 백업" description="복원 기능은 제공하지 않으며 JSON 파일을 관리자 PC에 내려받습니다.">
        <div className="space-y-3">
          <ToggleSwitch checked={backupIncludeOperations} onChange={setBackupIncludeOperations} label="자산·대여 운영 데이터 포함" />
          <ToggleSwitch checked={backupIncludeMembers} onChange={setBackupIncludeMembers} label="회원 계정 메타데이터 포함" />
          <ToggleSwitch checked={backupIncludePersonalData} disabled={!backupIncludeMembers} onChange={setBackupIncludePersonalData} label="회원 개인정보 포함" description="이메일·연락처·식별키가 포함될 수 있습니다. 안전한 위치에 보관해 주세요." />
          <div className="flex justify-end">
            <Button type="button" disabled={backupLoading} onClick={() => downloadBackup()}><Download size={14} />{backupLoading ? '백업 생성 중' : '백업 다운로드'}</Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderResetTab = () => (
    <div className="space-y-5">
      <div className="rounded-2xl border border-rose-300 bg-rose-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 shrink-0 text-rose-600" size={20} />
          <div>
            <div className="text-base font-black text-rose-900">되돌릴 수 없는 위험 작업</div>
            <p className="mt-1 text-xs leading-5 text-rose-800">관리자 ID, 관리자 Firebase Auth 계정, 초기화 감사 로그는 삭제하지 않습니다. Firestore 일반회원 문서를 삭제해도 Firebase Authentication 계정은 남으므로 UID 목록과 로컬 Admin SDK 스크립트를 함께 내려받습니다.</p>
          </div>
        </div>
      </div>

      {!isOwner ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">최고 관리자만 데이터 초기화를 실행할 수 있습니다.</div>
      ) : null}

      {latestResetJob && ['running', 'failed'].includes(latestResetJob.status) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-bold text-amber-900">중단된 초기화 작업이 있습니다.</div>
          <p className="mt-1 text-xs text-amber-800">작업 ID {latestResetJob.id} · 현재 단계 {latestResetJob.currentStep || '확인 불가'}</p>
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" disabled={resetRunning || !isOwner} onClick={() => executeReset({ resumeJob: latestResetJob })}><Play size={14} />중단된 초기화 계속하기</Button>
          </div>
        </div>
      ) : null}

      <SectionCard title="초기화 범위" description="테스트 데이터 초기화 프리셋은 자산·일반회원·대여내역만 선택하고 사이트 콘텐츠와 정책은 유지합니다.">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => { setSelectedResetScopes(TEST_DATA_PRESET); setResetCounts(null); setResetBackupReady(false); }}>테스트 데이터 초기화 선택</Button>
          <Button type="button" variant="dangerOutline" onClick={() => { setSelectedResetScopes(FULL_RESET_PRESET); setResetCounts(null); setResetBackupReady(false); }}>공장 초기화 범위 선택</Button>
          <Button type="button" variant="ghost" onClick={() => { setSelectedResetScopes([]); setResetCounts(null); setResetBackupReady(false); }}>선택 해제</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(RESET_SCOPE_META).map(([scope, meta]) => {
            const checked = selectedResetScopes.includes(scope);
            return (
              <label key={scope} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${checked ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white'}`}>
                <input type="checkbox" checked={checked} onChange={(event) => {
                  setSelectedResetScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope));
                  setResetCounts(null);
                  setResetBackupReady(false);
                }} className="mt-1 h-4 w-4 accent-[var(--mk-orange)]" />
                <span><span className="block text-sm font-bold text-slate-900">{meta.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{meta.description}</span></span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="outline" disabled={selectedResetScopes.length === 0 || resetScanLoading || !isOwner} onClick={scanResetTargets}><RefreshCw size={14} className={resetScanLoading ? 'animate-spin' : ''} />{resetScanLoading ? '확인 중' : '초기화 대상 확인'}</Button>
        </div>
      </SectionCard>

      {resetCounts ? (
        <SectionCard title="삭제 대상 문서" description="표시된 수는 Firestore 문서 수이며 삭제 과정에서 다시 확인됩니다.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(resetCounts).map(([name, count]) => (
              <div key={name} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><span className="font-semibold text-slate-700">{name}</span><span className="font-black text-slate-900">{count}건</span></div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="초기화 실행 확인" description="백업, 관리자 재인증, 확인 문구 입력을 모두 완료해야 실행할 수 있습니다.">
        <div className="space-y-4">
          <div className={`rounded-2xl border p-4 ${resetBackupReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs leading-5 text-slate-700">{resetBackupReady ? '초기화 전 개인정보 포함 백업 파일을 생성했습니다.' : '초기화 전 개인정보 포함 전체 백업 파일을 먼저 생성해야 합니다.'}</div>
              <Button type="button" variant="outline" disabled={backupLoading || resetRunning || !isOwner} onClick={downloadResetBackup}><Download size={14} />초기화 전 백업</Button>
            </div>
          </div>
          <Input label="현재 관리자 비밀번호" type="password" value={resetPassword} onChange={setResetPassword} disabled={resetRunning || !isOwner} />
          <Input label={`확인 문구: ${RESET_CONFIRM_TEXT}`} value={resetConfirmText} onChange={setResetConfirmText} disabled={resetRunning || !isOwner} />
          {resetProgress ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">{resetProgress.step}: {resetProgress.completed} / {resetProgress.total}</div>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" variant="danger" disabled={!isOwner || resetRunning || !resetCounts || !resetBackupReady || resetConfirmText !== RESET_CONFIRM_TEXT || !resetPassword} onClick={() => triggerConfirm('데이터 초기화', '선택한 Firestore 데이터를 삭제하고 서비스를 점검 모드로 전환합니다. 관리자 ID는 유지되며 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?', () => executeReset())}>
              <Trash2 size={14} />{resetRunning ? '초기화 진행 중' : '초기화 실행'}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderInfoTab = () => (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="애플리케이션" description="현재 브라우저에서 확인 가능한 읽기 전용 정보입니다.">
        <dl className="space-y-3 text-xs">
          {[
            ['애플리케이션 버전', 'system-management-v1'],
            ['데이터 스키마 버전', systemAdminSettings?.schemaVersion || 1],
            ['현재 접속 주소', window.location.href],
            ['실행 모드', import.meta.env.MODE || 'production'],
            ['시간대', Intl.DateTimeFormat().resolvedOptions().timeZone],
            ['온라인 상태', navigator.onLine ? '온라인' : '오프라인'],
          ].map(([label, value]) => <div key={label} className="flex gap-4 border-b border-slate-100 pb-3"><dt className="w-32 shrink-0 font-semibold text-slate-500">{label}</dt><dd className="min-w-0 break-all font-bold text-slate-800">{String(value)}</dd></div>)}
        </dl>
      </SectionCard>
      <SectionCard title="Firebase 연결" description="비밀키나 인증 토큰은 표시하지 않습니다.">
        <dl className="space-y-3 text-xs">
          {[
            ['프로젝트 ID', firebaseConfig.projectId],
            ['Auth 도메인', firebaseConfig.authDomain],
            ['현재 관리자 UID', authenticatedAdminAccount?.id || '확인 불가'],
            ['관리자 권한', getAdminRole(authenticatedAdminAccount) === 'owner' ? '최고 관리자' : '일반 관리자'],
            ['공개 설정', siteSettingsReady && !siteSettingsLoadErrorMessage ? '정상' : siteSettingsLoadErrorMessage || '로딩 중'],
            ['관리자 시스템 설정', systemAdminSettingsReady && !systemAdminSettingsLoadErrorMessage ? '정상' : systemAdminSettingsLoadErrorMessage || '로딩 중'],
          ].map(([label, value]) => <div key={label} className="flex gap-4 border-b border-slate-100 pb-3"><dt className="w-32 shrink-0 font-semibold text-slate-500">{label}</dt><dd className="min-w-0 break-all font-bold text-slate-800">{String(value)}</dd></div>)}
        </dl>
      </SectionCard>
      <SectionCard title="Firebase 사용량 안내" description="클라이언트에서는 Spark 실제 사용량과 잔여 한도를 정확하게 조회할 수 없습니다." className="lg:col-span-2">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs leading-5 text-sky-800">현재 화면의 문서 수나 수동 점검 읽기량은 표시할 수 있지만 Firebase Console의 실제 과금·사용량과 동일하지 않습니다. 정확한 읽기·쓰기 사용량은 Firebase Console에서 확인해 주세요.</div>
      </SectionCard>
    </div>
  );

  const renderAuditTab = () => (
    <SectionCard title="시스템 설정 변경 이력" description="최근 50건을 표시하며 변경 이력은 관리자 화면에서 수정하거나 삭제할 수 없습니다.">
      {!auditReady ? <div className="py-12 text-center text-xs text-slate-400">변경 이력을 불러오는 중입니다.</div> : auditLogs.length === 0 ? <div className="py-12 text-center text-xs text-slate-400">기록된 시스템 변경 이력이 없습니다.</div> : (
        <div className="space-y-2">
          {auditLogs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="text-sm font-bold text-slate-900">{log.section || '시스템'} · {log.action}</div><div className="mt-1 text-xs text-slate-600">{log.summary || '설정이 변경되었습니다.'}</div></div>
                <div className="text-[11px] text-slate-500">{formatTimestampValue(log.createdAt)} · {log.adminName || log.adminUid}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );

  const activeContent = useMemo(() => {
    if (activeTab === SYSTEM_MANAGEMENT_TAB.SITE) return renderSiteTab();
    if (activeTab === SYSTEM_MANAGEMENT_TAB.SERVICE) return renderServiceTab();
    if (activeTab === SYSTEM_MANAGEMENT_TAB.SECURITY) return renderSecurityTab();
    if (activeTab === SYSTEM_MANAGEMENT_TAB.DATA) return renderDataTab();
    if (activeTab === SYSTEM_MANAGEMENT_TAB.RESET) return renderResetTab();
    if (activeTab === SYSTEM_MANAGEMENT_TAB.INFO) return renderInfoTab();
    return renderAuditTab();
  }, [
    activeTab,
    siteDraft,
    securityDraft,
    siteSettings,
    systemAdminSettings,
    siteSaving,
    securitySaving,
    integrityLoading,
    integrityResult,
    backupLoading,
    backupIncludeOperations,
    backupIncludeMembers,
    backupIncludePersonalData,
    selectedResetScopes,
    resetCounts,
    resetScanLoading,
    resetRunning,
    resetProgress,
    resetPassword,
    resetConfirmText,
    resetBackupReady,
    latestResetJob,
    auditLogs,
    auditReady,
    isOwner,
    isSplitStorageReady,
    splitStorageFinalizeLoading,
    siteSettingsReady,
    siteSettingsLoadErrorMessage,
    systemAdminSettingsReady,
    systemAdminSettingsLoadErrorMessage,
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="시스템 관리"
        description="사이트 공통 설정, 서비스 운영상태, 관리자 보안, 데이터 점검·백업과 초기화를 관리합니다."
        badge={
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
            siteSettings?.serviceMode === SERVICE_MODE.NORMAL
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : siteSettings?.serviceMode === SERVICE_MODE.READ_ONLY
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-rose-300 bg-rose-50 text-rose-700'
          }`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            {siteSettings?.serviceMode === SERVICE_MODE.NORMAL ? '정상 운영' : siteSettings?.serviceMode === SERVICE_MODE.READ_ONLY ? '읽기 전용' : '점검 중'}
          </span>
        }
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-1">
          {SYSTEM_TABS.map(([key, Icon, label]) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${activeTab === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      </div>

      {siteSettingsLoadErrorMessage || systemAdminSettingsLoadErrorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-800">{siteSettingsLoadErrorMessage || systemAdminSettingsLoadErrorMessage}</div>
      ) : null}

      {activeContent}
    </div>
  );
}
