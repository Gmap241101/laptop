import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FileSearch,
  FileClock,
  HardDrive,
  Info,
  Play,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  addDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  SITE_SETTINGS_DOC_REF,
  SYSTEM_AUDIT_LOGS_COLLECTION_REF,
  firebaseConfig,
} from '../firebase.js';
import {
  DEFAULT_SITE_SETTINGS,
  SERVICE_MODE,
  SYSTEM_MANAGEMENT_TAB,
  isValidHexColor,
  normalizeSiteSettings,
} from '../utils/systemSettings.js';
import {
  readSiteContentCutoverConfig,
  replaceSiteContentDomainInPostgresql,
  syncSiteContentDomainFromFirestore,
  SITE_CONTENT_DOMAINS,
} from '../features/content/siteContentCutover.js';
import {
  RESTORE_CONFIRM_TEXT,
  RESTORE_MODE,
  RESTORE_SCOPE_META,
} from '../utils/systemRestore.js';
import useAdminDataMaintenanceController, {
  FULL_RESET_PRESET,
  RESET_CONFIRM_TEXT,
  RESET_SCOPE_META,
  TEST_DATA_PRESET,
  cloneForAudit,
  getAdminDisplayName,
  getAdminRole,
} from '../features/settings/useAdminDataMaintenanceController.js';
const DATA_MANAGEMENT_TABS = [
  [SYSTEM_MANAGEMENT_TAB.DATA, Database, '점검·백업·복원'],
  [SYSTEM_MANAGEMENT_TAB.RESET, Trash2, '데이터 초기화'],
];

const SYSTEM_INFORMATION_TABS = [
  [SYSTEM_MANAGEMENT_TAB.INFO, Info, '시스템 정보'],
  [SYSTEM_MANAGEMENT_TAB.AUDIT, FileClock, '변경 이력'],
];

const SITE_BASIC_SETTING_FIELDS = [
  'siteName',
  'siteShortName',
  'organizationName',
  'headerSubtitleMode',
  'headerSubtitleText',
  'siteUrl',
  'logoMode',
  'logoImageUrl',
  'mobileLogoImageUrl',
  'logoAltText',
  'faviconUrl',
  'browserTitle',
  'metaDescription',
  'primaryColor',
  'primaryDarkColor',
  'supportEnabled',
  'supportDepartment',
  'supportEmail',
  'supportPhone',
  'supportHours',
  'supportMessage',
];

const HOME_CONTENT_SETTING_FIELDS = [
  'defaultHeroEnabled',
  'defaultHeroTitle',
  'defaultHeroDescription',
];

const SERVICE_OPERATION_SETTING_FIELDS = [
  'serviceMode',
  'maintenanceTitle',
  'maintenanceMessage',
  'maintenanceStartAt',
  'maintenanceEndAt',
  'allowNewRentalRequests',
  'allowNewMemberSignup',
  'allowRequestChanges',
  'allowExtensionRequests',
  'allowReturnRequests',
  'systemBannerEnabled',
  'systemBannerLevel',
  'systemBannerMessage',
  'systemBannerUrl',
  'systemBannerDismissible',
];

const SETTINGS_MODE = {
  SITE: SYSTEM_MANAGEMENT_TAB.SITE,
  HOME: SYSTEM_MANAGEMENT_TAB.HOME,
  SERVICE: SYSTEM_MANAGEMENT_TAB.SERVICE,
  DATA: SYSTEM_MANAGEMENT_TAB.DATA,
  INFO: SYSTEM_MANAGEMENT_TAB.INFO,
};

const pickSettingsFields = (settings, fields) =>
  Object.fromEntries(fields.map((field) => [field, settings[field]]));

const getEditableSiteSettingFields = (mode) => {
  if (mode === SETTINGS_MODE.SITE) return SITE_BASIC_SETTING_FIELDS;
  if (mode === SETTINGS_MODE.HOME) return HOME_CONTENT_SETTING_FIELDS;
  if (mode === SETTINGS_MODE.SERVICE) return SERVICE_OPERATION_SETTING_FIELDS;
  return [];
};

const formatTimestampValue = (value) => {
  if (!value) return '기록 없음';
  if (typeof value?.toDate === 'function') return value.toDate().toLocaleString('ko-KR');
  if (typeof value === 'string') return value;
  return new Date(value).toLocaleString('ko-KR');
};
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

export default function AdminSettingsPanel({ ctx, mode = SETTINGS_MODE.SERVICE, embedded = false }) {
  const {
    AdminPageHeader,
    Button,
    Input,
    Select,
    authenticatedAdminAccount,
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

  const initialSectionTab =
    mode === SETTINGS_MODE.DATA
      ? SYSTEM_MANAGEMENT_TAB.DATA
      : mode === SETTINGS_MODE.INFO
        ? SYSTEM_MANAGEMENT_TAB.INFO
        : mode;
  const [activeTab, setActiveTab] = useState(initialSectionTab);
  const [siteDraft, setSiteDraft] = useState(() => normalizeSiteSettings(siteSettings));
  const [siteSaving, setSiteSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditReady, setAuditReady] = useState(false);
  const isOwner = getAdminRole(authenticatedAdminAccount) === 'owner';
  const editableSiteFields = getEditableSiteSettingFields(mode);
  const normalizedSavedSiteSettings = normalizeSiteSettings(siteSettings);
  const siteDirty =
    editableSiteFields.length > 0 &&
    JSON.stringify(pickSettingsFields(siteDraft, editableSiteFields)) !==
      JSON.stringify(pickSettingsFields(normalizedSavedSiteSettings, editableSiteFields));

  useEffect(() => {
    setActiveTab(
      mode === SETTINGS_MODE.DATA
        ? SYSTEM_MANAGEMENT_TAB.DATA
        : mode === SETTINGS_MODE.INFO
          ? SYSTEM_MANAGEMENT_TAB.INFO
          : mode
    );
  }, [mode]);

  useEffect(() => {
    setSiteDraft(normalizeSiteSettings(siteSettings));
  }, [siteSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const managedMode = [SETTINGS_MODE.SITE, SETTINGS_MODE.HOME, SETTINGS_MODE.SERVICE].includes(mode);
    window.__mkSystemSettingsUnsaved = managedMode && siteDirty;
    window.__mkSystemSettingsUnsavedMessage =
      mode === SETTINGS_MODE.SITE
        ? '저장하지 않은 사이트 기본 설정 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?'
        : mode === SETTINGS_MODE.HOME
          ? '저장하지 않은 홈 화면 기본 설정 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?'
          : '저장하지 않은 서비스 운영 설정 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?';

    return () => {
      window.__mkSystemSettingsUnsaved = false;
      window.__mkSystemSettingsUnsavedMessage = '';
    };
  }, [mode, siteDirty]);

  useEffect(() => {
    if (!authenticatedAdminAccount || mode !== SETTINGS_MODE.INFO) {
      setAuditLogs([]);
      setAuditReady(false);
      return undefined;
    }

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

    return unsubscribeAudit;
  }, [authenticatedAdminAccount?.id, mode]);

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

  const {
    analyzeRestore,
    backupIncludeMembers,
    backupIncludeOperations,
    backupIncludePersonalData,
    backupLoading,
    clearRestoreState,
    downloadBackup,
    downloadResetBackup,
    executeReset,
    executeRestore,
    forceProjectConfirm,
    forceProjectMismatch,
    handleRestoreFile,
    integrityLoading,
    integrityResult,
    latestResetJob,
    latestRestoreJob,
    resetBackupReady,
    resetConfirmText,
    resetCounts,
    resetPassword,
    resetProgress,
    resetRunning,
    resetScanLoading,
    restoreAnalysis,
    restoreAnalyzeLoading,
    restoreConfirmText,
    restoreFileHash,
    restoreFileName,
    restoreMode,
    restorePassword,
    restorePayload,
    restoreProgress,
    restoreResult,
    restoreRunning,
    restoreValidation,
    runIntegrityCheck,
    scanResetTargets,
    selectedResetScopes,
    selectedRestoreScopes,
    setBackupIncludeMembers,
    setBackupIncludeOperations,
    setBackupIncludePersonalData,
    setForceProjectConfirm,
    setForceProjectMismatch,
    setResetBackupReady,
    setResetConfirmText,
    setResetCounts,
    setResetPassword,
    setRestoreAnalysis,
    setRestoreConfirmText,
    setRestoreMode,
    setRestorePassword,
    setRestoreResult,
    setSelectedResetScopes,
    setSelectedRestoreScopes,
  } = useAdminDataMaintenanceController({
    authenticatedAdminAccount,
    mode,
    siteSettings,
    systemAdminSettings,
    triggerToast,
    writeAuditLog,
  });

  const validateSiteDraft = () => {
    if (mode === SETTINGS_MODE.SITE) {
      if (!siteDraft.siteName.trim()) return '사이트 정식 명칭을 입력해 주세요.';
      if (!siteDraft.siteShortName.trim()) return '사이트 짧은 명칭을 입력해 주세요.';
      if (!isValidHexColor(siteDraft.primaryColor)) return '기본 강조색은 #RRGGBB 형식으로 입력해 주세요.';
      if (!isValidHexColor(siteDraft.primaryDarkColor)) return '진한 강조색은 #RRGGBB 형식으로 입력해 주세요.';
    }
    if (
      mode === SETTINGS_MODE.SERVICE &&
      siteDraft.serviceMode === SERVICE_MODE.MAINTENANCE &&
      !siteDraft.maintenanceTitle.trim()
    ) {
      return '점검 제목을 입력해 주세요.';
    }
    return '';
  };

  const getSiteSettingsSectionMeta = () => {
    if (mode === SETTINGS_MODE.HOME) {
      return {
        action: 'home-content-settings-update',
        section: '홈 화면 기본 설정',
        summary: '등록된 메인 비주얼이 없을 때 표시할 기본 콘텐츠를 변경했습니다.',
        successMessage: '홈 화면 기본 설정이 저장되었습니다.',
      };
    }
    if (mode === SETTINGS_MODE.SERVICE) {
      return {
        action: 'service-operation-settings-update',
        section: '서비스 운영',
        summary: '서비스 운영상태와 기능별 접수 정책을 변경했습니다.',
        successMessage: '서비스 운영 설정이 저장되었습니다.',
      };
    }
    return {
      action: 'site-basic-settings-update',
      section: '사이트 기본 설정',
      summary: '사이트 명칭, 브랜드, 헤더와 문의 정보를 변경했습니다.',
      successMessage: '사이트 기본 설정이 저장되었습니다.',
    };
  };

  const saveSiteSettings = async () => {
    const validationMessage = validateSiteDraft();
    if (validationMessage) {
      triggerToast(validationMessage, 'error');
      return;
    }

    const fields = getEditableSiteSettingFields(mode);
    if (fields.length === 0) return;

    setSiteSaving(true);
    const beforeValues = pickSettingsFields(normalizeSiteSettings(siteSettings), fields);
    const afterValues = pickSettingsFields(normalizeSiteSettings(siteDraft), fields);
    const sectionMeta = getSiteSettingsSectionMeta();

    try {
      if (readSiteContentCutoverConfig().adminAuthorityRequested) {
        const nextSettings = {
          ...normalizeSiteSettings(siteSettings),
          ...afterValues,
          updatedAt: new Date(),
          updatedBy: authenticatedAdminAccount?.id || '',
          updatedByName: getAdminDisplayName(authenticatedAdminAccount),
        };
        await replaceSiteContentDomainInPostgresql({
          domain: SITE_CONTENT_DOMAINS.SITE_SETTINGS,
          documents: [{ key: 'siteSettings/config', payload: nextSettings }],
        });
      } else {
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
      await syncSiteContentDomainFromFirestore({ domain: SITE_CONTENT_DOMAINS.SITE_SETTINGS });
      }
      await writeAuditLog({
        action: sectionMeta.action,
        section: sectionMeta.section,
        beforeValues,
        afterValues,
        summary: sectionMeta.summary,
      });
      triggerToast(sectionMeta.successMessage, 'success');
    } catch (error) {
      console.error('Site settings save error:', error);
      triggerToast('설정 저장에 실패했습니다. Firestore 권한을 확인해 주세요.', 'error');
    } finally {
      setSiteSaving(false);
    }
  };

  const resetSiteDraft = () => {
    setSiteDraft(normalizeSiteSettings(siteSettings));
  };

  const renderSiteTab = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <div className="space-y-5">
        <SectionCard title="사이트 명칭" description="헤더, 로그인 화면과 브라우저 제목에 적용됩니다.">
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

        <SectionCard title="로고·브랜드" description="오류·경고·성공 상태 색상은 유지하고 주요 버튼과 선택 요소에만 적용됩니다.">
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
        <SectionCard title="실시간 미리보기" description="저장 전 사이트 헤더와 주요 브랜드 요소를 확인합니다.">
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
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500">브라우저 제목</div>
              <div className="mt-1 text-sm font-black text-slate-900">{siteDraft.browserTitle || siteDraft.siteName}</div>
              <div className="mt-4 flex items-center gap-2">
                <span className="inline-flex rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: siteDraft.primaryColor }}>주요 버튼</span>
                <span className="text-xs font-bold" style={{ color: siteDraft.primaryDarkColor }}>강조 링크</span>
              </div>
            </div>
          </div>
        </SectionCard>
        <div className="sticky top-24 flex justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <Button type="button" variant="outline" disabled={!siteDirty || siteSaving} onClick={resetSiteDraft}>변경 취소</Button>
          <Button type="button" disabled={!siteDirty || siteSaving} onClick={saveSiteSettings}><Save size={14} />{siteSaving ? '저장 중' : '사이트 기본 설정 저장'}</Button>
        </div>
      </div>
    </div>
  );

  const renderHomeContentTab = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <div className="space-y-5">
        <SectionCard title="기본 메인 비주얼" description="등록된 메인 비주얼 배너가 없을 때 사용자 홈 화면에 표시할 기본 콘텐츠입니다.">
          <div className="space-y-4">
            <ToggleSwitch checked={siteDraft.defaultHeroEnabled} onChange={(value) => setSiteDraft({ ...siteDraft, defaultHeroEnabled: value })} label="기본 메인 비주얼 사용" description="끄면 등록된 메인 비주얼이 없는 경우 간소화된 빈 영역으로 표시됩니다." />
            <Input label="기본 제목" value={siteDraft.defaultHeroTitle} onChange={(value) => setSiteDraft({ ...siteDraft, defaultHeroTitle: value })} placeholder="비워 두면 사이트 정식 명칭 사용" />
            <Input label="기본 설명" value={siteDraft.defaultHeroDescription} onChange={(value) => setSiteDraft({ ...siteDraft, defaultHeroDescription: value })} />
          </div>
        </SectionCard>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs leading-5 text-sky-800">
          💡<b>운영 안내:</b> 이 화면은 메인 비주얼 미등록 시 노출되는 '대체 콘텐츠' 전용 관리 창입니다.
            &nbsp;&nbsp; <b>• 기존 관리 메뉴 유지 항목:</b> 메인 비주얼, 프로모션 배너, 바로가기 배너
            &nbsp;&nbsp; <b>• 관리 가능 범위:</b> 각 배너의 등록 · 순서 · 노출 일정
        </div>
      </div>

      <div className="space-y-5">
        <SectionCard title="홈 화면 미리보기" description="기본 메인 비주얼의 제목과 설명을 저장 전에 확인합니다.">
          {siteDraft.defaultHeroEnabled ? (
            <div className="rounded-2xl px-6 py-10 text-white shadow-sm" style={{ background: `linear-gradient(135deg, #0f172a, ${siteDraft.primaryDarkColor})` }}>
              <div className="text-xl font-black">{siteDraft.defaultHeroTitle || siteDraft.siteName}</div>
              <div className="mt-3 text-sm leading-6 text-white/80">{siteDraft.defaultHeroDescription || '기본 메인 비주얼 설명이 표시됩니다.'}</div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-xs font-semibold text-slate-500">
              기본 메인 비주얼을 사용하지 않습니다.
            </div>
          )}
        </SectionCard>
        <div className="sticky top-24 flex justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <Button type="button" variant="outline" disabled={!siteDirty || siteSaving} onClick={resetSiteDraft}>변경 취소</Button>
          <Button type="button" disabled={!siteDirty || siteSaving} onClick={saveSiteSettings}><Save size={14} />{siteSaving ? '저장 중' : '홈 화면 기본 설정 저장'}</Button>
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

      <SectionCard title="전역 시스템 안내" description="운영 장애나 예정된 점검처럼 사용자 화면 상단에 계속 표시할 짧은 안내입니다.">
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

      <SectionCard title="수동 백업" description="애플리케이션 전용 JSON 파일을 관리자 PC에 내려받습니다. 동일한 형식의 파일은 아래 복원 기능에서 사용할 수 있습니다.">
        <div className="space-y-3">
          <ToggleSwitch checked={backupIncludeOperations} onChange={setBackupIncludeOperations} label="자산·대여 운영 데이터 포함" />
          <ToggleSwitch checked={backupIncludeMembers} onChange={setBackupIncludeMembers} label="회원 계정 메타데이터 포함" />
          <ToggleSwitch checked={backupIncludePersonalData} disabled={!backupIncludeMembers} onChange={setBackupIncludePersonalData} label="회원 개인정보 포함" description="이메일·연락처·식별키가 포함될 수 있습니다. 안전한 위치에 보관해 주세요." />
          <div className="flex justify-end">
            <Button type="button" disabled={backupLoading} onClick={() => downloadBackup()}><Download size={14} />{backupLoading ? '백업 생성 중' : '백업 다운로드'}</Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="JSON 백업 복원" description="백업 파일을 검사한 뒤 선택한 영역만 복원합니다. 관리자 ID, 관리자 Firebase Auth 계정과 초기화·감사 로그는 복원 대상에 포함되지 않습니다.">
        <div className="space-y-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">{restoreFileName || '선택된 백업 파일이 없습니다.'}</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">현재 시스템이 생성한 rental-system-backup-*.json 파일을 선택해 주세요.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
                <Upload size={14} />백업 파일 선택
                <input type="file" accept="application/json,.json" className="hidden" disabled={restoreRunning || restoreAnalyzeLoading} onChange={handleRestoreFile} />
              </label>
              {restorePayload ? <Button type="button" variant="ghost" disabled={restoreRunning} onClick={clearRestoreState}>선택 해제</Button> : null}
            </div>
          </div>

          {restoreValidation ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-[11px] text-slate-500">백업 생성일</div><div className="mt-1 text-xs font-bold text-slate-900">{restoreValidation.metadata?.exportedAtKorea || restoreValidation.metadata?.exportedAt || '확인 불가'}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-[11px] text-slate-500">백업 프로젝트</div><div className={`mt-1 break-all text-xs font-bold ${restoreValidation.projectMismatch ? 'text-rose-700' : 'text-slate-900'}`}>{restoreValidation.metadata?.firebaseProjectId || '기록 없음'}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-[11px] text-slate-500">스키마</div><div className="mt-1 text-xs font-bold text-slate-900">v{restoreValidation.metadata?.schemaVersion || 1} → 현재 v{systemAdminSettings?.schemaVersion || 1}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-[11px] text-slate-500">개인정보</div><div className="mt-1 text-xs font-bold text-slate-900">{restoreValidation.metadata?.includePersonalData ? '포함' : '제외'}</div></div>
              </div>
              {restoreValidation.errors.map((message) => <div key={message} className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{message}</div>)}
              {restoreValidation.warnings.map((message) => <div key={message} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{message}</div>)}
            </div>
          ) : null}

          {restoreValidation?.valid ? (
            <>
              <div>
                <div className="mb-2 text-sm font-black text-slate-900">복원 영역</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(RESTORE_SCOPE_META).map(([scope, meta]) => {
                    const available = restoreValidation.availableScopes.includes(scope);
                    const disabled = !available || (meta.ownerOnly && !isOwner) || restoreRunning;
                    const checked = selectedRestoreScopes.includes(scope);
                    return (
                      <label key={scope} className={`flex items-start gap-3 rounded-2xl border p-4 ${disabled ? 'cursor-not-allowed bg-slate-50 opacity-55' : 'cursor-pointer'} ${checked ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white'}`}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => {
                          setSelectedRestoreScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope));
                          setRestoreAnalysis(null);
                          setRestoreResult(null);
                        }} className="mt-1 h-4 w-4 accent-[var(--mk-orange)]" />
                        <span><span className="block text-sm font-bold text-slate-900">{meta.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{meta.description}</span>{!available ? <span className="mt-1 block text-[11px] font-semibold text-slate-400">이 백업에는 해당 데이터가 없습니다.</span> : null}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Select label="복원 방식" value={restoreMode} disabled={restoreRunning} onChange={(value) => { setRestoreMode(value); setRestoreAnalysis(null); }}>
                  <option value={RESTORE_MODE.ADD_MISSING}>없는 문서만 추가</option>
                  <option value={RESTORE_MODE.MERGE}>기존 문서와 필드 병합</option>
                  <option value={RESTORE_MODE.OVERWRITE}>같은 ID 문서 덮어쓰기</option>
                  <option value={RESTORE_MODE.REPLACE} disabled={!isOwner}>선택 영역을 비우고 백업 상태로 복원</option>
                </Select>
                <div className="flex items-end justify-end">
                  <Button type="button" variant="outline" disabled={restoreAnalyzeLoading || restoreRunning || selectedRestoreScopes.length === 0} onClick={analyzeRestore}><FileSearch size={14} className={restoreAnalyzeLoading ? 'animate-spin' : ''} />{restoreAnalyzeLoading ? '검사 중' : '백업·현재 데이터 충돌 검사'}</Button>
                </div>
              </div>

              {restoreValidation.projectMismatch ? (
                <div className="space-y-3 rounded-2xl border border-rose-300 bg-rose-50 p-4">
                  <div className="text-sm font-black text-rose-900">Firebase 프로젝트 ID 불일치</div>
                  {!isOwner ? <p className="text-xs leading-5 text-rose-800">타 프로젝트 백업은 최고 관리자만 강제 복원할 수 있습니다.</p> : (
                    <>
                      <ToggleSwitch checked={forceProjectMismatch} disabled={restoreRunning} onChange={(value) => { setForceProjectMismatch(value); setRestoreAnalysis(null); }} label="타 프로젝트 백업 강제 복원" description="백업의 프로젝트 ID가 달라도 현재 프로젝트에 기록합니다. Firebase Auth 계정과 외부 참조는 자동 이전되지 않습니다." />
                      {forceProjectMismatch ? <Input label={`현재 프로젝트 ID를 입력: ${firebaseConfig.projectId}`} value={forceProjectConfirm} onChange={setForceProjectConfirm} disabled={restoreRunning} /> : null}
                    </>
                  )}
                </div>
              ) : null}

              {restoreAnalysis ? (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[11px] text-slate-500">백업 문서</div><div className="mt-1 text-xl font-black text-slate-900">{restoreAnalysis.plan.totalDocuments}</div></div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[11px] text-slate-500">현재와 ID 중복</div><div className="mt-1 text-xl font-black text-amber-700">{restoreAnalysis.existingCount}</div></div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[11px] text-slate-500">백업에 없는 현재 문서</div><div className="mt-1 text-xl font-black text-rose-700">{restoreAnalysis.currentExtraCount}</div></div>
                  </div>
                  <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white">
                    {restoreAnalysis.collectionResults.map((item) => <div key={item.name} className="grid grid-cols-[minmax(120px,1fr)_repeat(4,70px)] gap-2 border-b border-slate-100 px-3 py-2 text-[11px]"><span className="font-bold text-slate-700">{item.name}</span><span>백업 {item.backup}</span><span>현재 {item.current}</span><span>중복 {item.overlap}</span><span>추가 {item.extras}</span></div>)}
                  </div>
                  {restoreAnalysis.blockingIssues?.map((message) => <div key={message} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{message}</div>)}
                  {restoreAnalysis.warnings.map((message) => <div key={message} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{message}</div>)}
                </div>
              ) : null}

              {latestRestoreJob && ['running', 'failed'].includes(latestRestoreJob.status) ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-bold text-amber-900">중단된 복원 작업이 있습니다.</div>
                  <p className="mt-1 text-xs leading-5 text-amber-800">{latestRestoreJob.fileName || '백업 파일'} · 단계 {latestRestoreJob.currentStep || '확인 불가'}. 같은 파일을 선택하면 완료된 단계를 건너뛰고 이어서 실행합니다.</p>
                </div>
              ) : null}

              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-800">복원 실행 직전에 현재 Firestore 상태를 개인정보 포함 JSON으로 자동 다운로드하며, 복원 완료 후에도 점검 모드를 유지합니다.</div>
                <Input label="현재 관리자 비밀번호" type="password" value={restorePassword} onChange={setRestorePassword} disabled={restoreRunning} />
                <Input label={`확인 문구: ${RESTORE_CONFIRM_TEXT}`} value={restoreConfirmText} onChange={setRestoreConfirmText} disabled={restoreRunning} />
                {restoreProgress ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{restoreProgress.step}: {restoreProgress.completed} / {restoreProgress.total}</div> : null}
                <div className="flex flex-wrap justify-end gap-2">
                  {latestRestoreJob && ['running', 'failed'].includes(latestRestoreJob.status) ? <Button type="button" variant="outline" disabled={restoreRunning || !restoreAnalysis || restoreAnalysis.blockingIssues?.length > 0 || latestRestoreJob.fileHash !== restoreFileHash || !restorePassword || restoreConfirmText !== RESTORE_CONFIRM_TEXT} onClick={() => triggerConfirm('중단된 백업 복원 계속하기', '같은 백업 파일로 완료되지 않은 단계부터 복원을 계속합니다.', () => executeRestore({ resumeJob: latestRestoreJob }))}><Play size={14} />복원 계속하기</Button> : null}
                  <Button type="button" disabled={restoreRunning || !restoreAnalysis || restoreAnalysis.blockingIssues?.length > 0 || !restorePassword || restoreConfirmText !== RESTORE_CONFIRM_TEXT || (restoreValidation.projectMismatch && (!isOwner || !forceProjectMismatch || forceProjectConfirm !== firebaseConfig.projectId))} onClick={() => triggerConfirm('JSON 백업 복원', '현재 상태를 자동 백업한 뒤 선택한 Firestore 데이터를 복원합니다. 복원 중에는 서비스가 점검 모드로 전환됩니다.', () => executeRestore())}><Upload size={14} />{restoreRunning ? '복원 진행 중' : '복원 실행'}</Button>
                </div>
              </div>

              {restoreResult ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">백업 복원이 완료되었습니다. 데이터 점검 결과를 확인한 후 서비스 운영 탭에서 정상 운영으로 전환해 주세요.</div> : null}
            </>
          ) : null}
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
          {latestResetJob.errorMessage ? (
            <p className="mt-1 break-words text-xs leading-5 text-rose-700">중단 원인: {latestResetJob.errorMessage}</p>
          ) : null}
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
            ['애플리케이션 버전', 'site-system-menu-split-v1'],
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
            ['최근 백업', formatTimestampValue(systemAdminSettings?.lastBackupGeneratedAt)],
            ['최근 복원', formatTimestampValue(systemAdminSettings?.lastRestoreCompletedAt)],
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

  const sectionTabs =
    mode === SETTINGS_MODE.DATA
      ? DATA_MANAGEMENT_TABS
      : mode === SETTINGS_MODE.INFO
        ? SYSTEM_INFORMATION_TABS
        : [];

  const pageMeta = (() => {
    if (mode === SETTINGS_MODE.SITE) {
      return {
        title: '사이트 기본 설정',
        description: '사이트 명칭, 헤더, 로고, 브랜드 색상과 공통 문의 정보를 관리합니다.',
      };
    }
    if (mode === SETTINGS_MODE.HOME) {
      return {
        title: '홈 화면 기본 설정',
        description: '등록된 메인 비주얼이 없을 때 표시할 사용자 홈 화면의 기본 콘텐츠를 관리합니다.',
      };
    }
    if (mode === SETTINGS_MODE.DATA) {
      return {
        title: '데이터 관리',
        description: '데이터 건전성 점검, JSON 백업·복원과 위험 초기화 작업을 관리합니다.',
      };
    }
    if (mode === SETTINGS_MODE.INFO) {
      return {
        title: '시스템 정보·로그',
        description: '애플리케이션과 Firebase 연결정보, 시스템 설정 변경 이력을 확인합니다.',
      };
    }
    return {
      title: '서비스 운영',
      description: '서비스 운영모드, 기능별 접수 상태와 전역 시스템 안내를 관리합니다.',
    };
  })();

  const activeContent = (() => {
    if (mode === SETTINGS_MODE.SITE) return renderSiteTab();
    if (mode === SETTINGS_MODE.HOME) return renderHomeContentTab();
    if (mode === SETTINGS_MODE.SERVICE) return renderServiceTab();
    if (mode === SETTINGS_MODE.DATA) {
      return activeTab === SYSTEM_MANAGEMENT_TAB.RESET
        ? renderResetTab()
        : renderDataTab();
    }
    return activeTab === SYSTEM_MANAGEMENT_TAB.AUDIT
      ? renderAuditTab()
      : renderInfoTab();
  })();

  const loadErrorMessage =
    mode === SETTINGS_MODE.SITE ||
    mode === SETTINGS_MODE.HOME ||
    mode === SETTINGS_MODE.SERVICE
      ? siteSettingsLoadErrorMessage
      : siteSettingsLoadErrorMessage || systemAdminSettingsLoadErrorMessage;

  const serviceStatusBadge =
    mode === SETTINGS_MODE.SERVICE ? (
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
        siteSettings?.serviceMode === SERVICE_MODE.NORMAL
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : siteSettings?.serviceMode === SERVICE_MODE.READ_ONLY
            ? 'border-amber-300 bg-amber-50 text-amber-700'
            : 'border-rose-300 bg-rose-50 text-rose-700'
      }`}>
        <span className="h-2 w-2 rounded-full bg-current" />
        {siteSettings?.serviceMode === SERVICE_MODE.NORMAL
          ? '정상 운영'
          : siteSettings?.serviceMode === SERVICE_MODE.READ_ONLY
            ? '읽기 전용'
            : '점검 중'}
      </span>
    ) : null;

  return (
    <div className="space-y-6">
      {embedded ? (
        <div>
          <h3 className="text-base font-bold text-slate-900">{pageMeta.title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{pageMeta.description}</p>
        </div>
      ) : (
        <AdminPageHeader
          title={pageMeta.title}
          description={pageMeta.description}
          badge={serviceStatusBadge}
        />
      )}

      {sectionTabs.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex min-w-max gap-1">
            {sectionTabs.map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                  activeTab === key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loadErrorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-800">
          {loadErrorMessage}
        </div>
      ) : null}

      {activeContent}
    </div>
  );

}
