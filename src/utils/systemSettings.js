export const DEFAULT_SITE_SETTINGS = {
  siteName: '매일경제아카데미 기기 대여 시스템',
  siteShortName: '기기 대여 시스템',
  organizationName: '매일경제아카데미',
  headerSubtitleMode: 'currentOrigin',
  headerSubtitleText: '',
  siteUrl: '',
  logoMode: 'icon',
  logoImageUrl: '',
  mobileLogoImageUrl: '',
  logoAltText: '기기 대여 시스템 로고',
  faviconUrl: '',
  browserTitle: '매일경제아카데미 기기 대여 시스템',
  metaDescription: '사내 대여 자산과 대여신청을 관리하는 서비스입니다.',
  primaryColor: '#FF6B00',
  primaryDarkColor: '#E65300',
  defaultHeroEnabled: true,
  defaultHeroTitle: '매일경제아카데미 기기 대여 시스템',
  defaultHeroDescription: '필요한 기기를 확인하고 신청 현황을 한곳에서 관리합니다.',
  supportEnabled: false,
  supportDepartment: '',
  supportEmail: '',
  supportPhone: '',
  supportHours: '',
  supportMessage: '',
  serviceMode: 'normal',
  maintenanceTitle: '서비스 점검 중입니다.',
  maintenanceMessage: '안정적인 서비스 제공을 위해 시스템을 점검하고 있습니다.',
  maintenanceStartAt: '',
  maintenanceEndAt: '',
  allowNewRentalRequests: true,
  allowNewMemberSignup: true,
  allowRequestChanges: true,
  allowExtensionRequests: true,
  allowReturnRequests: true,
  systemBannerEnabled: false,
  systemBannerLevel: 'info',
  systemBannerMessage: '',
  systemBannerUrl: '',
  systemBannerDismissible: true,
};

export const DEFAULT_SYSTEM_ADMIN_SETTINGS = {
  schemaVersion: 1,
  adminLogoutOnBrowserClose: true,
  adminIdleTimeoutMinutes: 60,
  adminAbsoluteTimeoutHours: 8,
  adminSecurityPolicyVersion: 1,
  migrationStatus: 'ready',
  lastIntegrityCheckAt: '',
  lastIntegrityCheckBy: '',
  lastIntegrityCheckSummary: null,
  lastBackupGeneratedAt: '',
  lastBackupGeneratedBy: '',
  lastRestoreCompletedAt: '',
  lastRestoreCompletedBy: '',
  lastRestoreSummary: null,
};


export const DEFAULT_USER_SESSION_POLICY = {
  userLogoutOnBrowserClose: false,
  userIdleTimeoutMinutes: 120,
  userAbsoluteTimeoutHours: 24,
  userSecurityPolicyVersion: 1,
};

export const SERVICE_MODE = {
  NORMAL: 'normal',
  READ_ONLY: 'readOnly',
  MAINTENANCE: 'maintenance',
};

export const SYSTEM_MANAGEMENT_TAB = {
  SITE: 'site',
  HOME: 'home',
  SERVICE: 'service',
  DATA: 'data',
  RESET: 'reset',
  INFO: 'info',
  AUDIT: 'audit',
};

export const SYSTEM_RESET_SCOPE = {
  ASSETS: 'assets',
  MEMBERS: 'members',
  RENTALS: 'rentals',
  ORGANIZATION: 'organization',
  CONTENT: 'content',
  SETTINGS: 'settings',
};

const clampInteger = (value, min, max, fallback) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
};

export const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(String(value || ''));

export const normalizeSiteSettings = (raw = {}) => {
  const next = {
    ...DEFAULT_SITE_SETTINGS,
    ...(raw || {}),
  };

  next.siteName = String(next.siteName || DEFAULT_SITE_SETTINGS.siteName).trim().slice(0, 80);
  next.siteShortName = String(next.siteShortName || DEFAULT_SITE_SETTINGS.siteShortName).trim().slice(0, 40);
  next.organizationName = String(next.organizationName || '').trim().slice(0, 80);
  next.headerSubtitleMode = ['currentOrigin', 'custom', 'hidden'].includes(next.headerSubtitleMode)
    ? next.headerSubtitleMode
    : DEFAULT_SITE_SETTINGS.headerSubtitleMode;
  next.headerSubtitleText = String(next.headerSubtitleText || '').trim().slice(0, 120);
  next.siteUrl = String(next.siteUrl || '').trim().slice(0, 500);
  next.logoMode = ['icon', 'image', 'text'].includes(next.logoMode)
    ? next.logoMode
    : DEFAULT_SITE_SETTINGS.logoMode;
  next.logoImageUrl = String(next.logoImageUrl || '').trim().slice(0, 1000);
  next.mobileLogoImageUrl = String(next.mobileLogoImageUrl || '').trim().slice(0, 1000);
  next.logoAltText = String(next.logoAltText || DEFAULT_SITE_SETTINGS.logoAltText).trim().slice(0, 120);
  next.faviconUrl = String(next.faviconUrl || '').trim().slice(0, 1000);
  next.browserTitle = String(next.browserTitle || next.siteName).trim().slice(0, 120);
  next.metaDescription = String(next.metaDescription || '').trim().slice(0, 240);
  next.primaryColor = isValidHexColor(next.primaryColor)
    ? next.primaryColor.toUpperCase()
    : DEFAULT_SITE_SETTINGS.primaryColor;
  next.primaryDarkColor = isValidHexColor(next.primaryDarkColor)
    ? next.primaryDarkColor.toUpperCase()
    : DEFAULT_SITE_SETTINGS.primaryDarkColor;
  next.defaultHeroTitle = String(next.defaultHeroTitle || '').trim().slice(0, 120);
  next.defaultHeroDescription = String(next.defaultHeroDescription || '').trim().slice(0, 240);
  next.supportDepartment = String(next.supportDepartment || '').trim().slice(0, 80);
  next.supportEmail = String(next.supportEmail || '').trim().slice(0, 160);
  next.supportPhone = String(next.supportPhone || '').trim().slice(0, 40);
  next.supportHours = String(next.supportHours || '').trim().slice(0, 120);
  next.supportMessage = String(next.supportMessage || '').trim().slice(0, 240);
  next.serviceMode = Object.values(SERVICE_MODE).includes(next.serviceMode)
    ? next.serviceMode
    : SERVICE_MODE.NORMAL;
  next.maintenanceTitle = String(next.maintenanceTitle || DEFAULT_SITE_SETTINGS.maintenanceTitle).trim().slice(0, 120);
  next.maintenanceMessage = String(next.maintenanceMessage || DEFAULT_SITE_SETTINGS.maintenanceMessage).trim().slice(0, 500);
  next.maintenanceStartAt = String(next.maintenanceStartAt || '').trim().slice(0, 40);
  next.maintenanceEndAt = String(next.maintenanceEndAt || '').trim().slice(0, 40);
  next.systemBannerLevel = ['info', 'warning', 'critical'].includes(next.systemBannerLevel)
    ? next.systemBannerLevel
    : 'info';
  next.systemBannerMessage = String(next.systemBannerMessage || '').trim().slice(0, 240);
  next.systemBannerUrl = String(next.systemBannerUrl || '').trim().slice(0, 1000);

  [
    'defaultHeroEnabled',
    'supportEnabled',
    'allowNewRentalRequests',
    'allowNewMemberSignup',
    'allowRequestChanges',
    'allowExtensionRequests',
    'allowReturnRequests',
    'systemBannerEnabled',
    'systemBannerDismissible',
  ].forEach((key) => {
    next[key] = Boolean(next[key]);
  });

  return next;
};

export const normalizeSystemAdminSettings = (raw = {}) => ({
  ...DEFAULT_SYSTEM_ADMIN_SETTINGS,
  ...(raw || {}),
  schemaVersion: clampInteger(raw?.schemaVersion, 1, 9999, DEFAULT_SYSTEM_ADMIN_SETTINGS.schemaVersion),
  adminLogoutOnBrowserClose:
    typeof raw?.adminLogoutOnBrowserClose === 'boolean'
      ? raw.adminLogoutOnBrowserClose
      : DEFAULT_SYSTEM_ADMIN_SETTINGS.adminLogoutOnBrowserClose,
  adminIdleTimeoutMinutes: clampInteger(
    raw?.adminIdleTimeoutMinutes,
    15,
    480,
    DEFAULT_SYSTEM_ADMIN_SETTINGS.adminIdleTimeoutMinutes
  ),
  adminAbsoluteTimeoutHours: clampInteger(
    raw?.adminAbsoluteTimeoutHours,
    0,
    168,
    DEFAULT_SYSTEM_ADMIN_SETTINGS.adminAbsoluteTimeoutHours
  ),
  adminSecurityPolicyVersion: clampInteger(
    raw?.adminSecurityPolicyVersion,
    1,
    999999,
    DEFAULT_SYSTEM_ADMIN_SETTINGS.adminSecurityPolicyVersion
  ),
});

export const normalizeUserSessionPolicy = (raw = {}) => ({
  ...DEFAULT_USER_SESSION_POLICY,
  ...(raw || {}),
  userLogoutOnBrowserClose:
    typeof raw?.userLogoutOnBrowserClose === 'boolean'
      ? raw.userLogoutOnBrowserClose
      : DEFAULT_USER_SESSION_POLICY.userLogoutOnBrowserClose,
  userIdleTimeoutMinutes: clampInteger(
    raw?.userIdleTimeoutMinutes,
    15,
    1440,
    DEFAULT_USER_SESSION_POLICY.userIdleTimeoutMinutes
  ),
  userAbsoluteTimeoutHours: clampInteger(
    raw?.userAbsoluteTimeoutHours,
    0,
    168,
    DEFAULT_USER_SESSION_POLICY.userAbsoluteTimeoutHours
  ),
  userSecurityPolicyVersion: clampInteger(
    raw?.userSecurityPolicyVersion,
    1,
    999999,
    DEFAULT_USER_SESSION_POLICY.userSecurityPolicyVersion
  ),
});

export const getHeaderSubtitle = (settings = DEFAULT_SITE_SETTINGS) => {
  const normalized = normalizeSiteSettings(settings);
  if (normalized.headerSubtitleMode === 'hidden') return '';
  if (normalized.headerSubtitleMode === 'custom') {
    return normalized.headerSubtitleText || normalized.siteUrl;
  }
  if (typeof window === 'undefined') return normalized.siteUrl;
  return window.location.origin;
};

export const getSupportSummaryLines = (settings = DEFAULT_SITE_SETTINGS) => {
  const normalized = normalizeSiteSettings(settings);
  if (!normalized.supportEnabled) return [];

  return [
    normalized.supportMessage,
    normalized.supportDepartment ? `담당 부서: ${normalized.supportDepartment}` : '',
    normalized.supportEmail ? `이메일: ${normalized.supportEmail}` : '',
    normalized.supportPhone ? `전화번호: ${normalized.supportPhone}` : '',
    normalized.supportHours ? `문의 시간: ${normalized.supportHours}` : '',
  ].filter(Boolean);
};

export const getServiceBlockReason = (settings, action) => {
  const normalized = normalizeSiteSettings(settings);

  if (normalized.serviceMode === SERVICE_MODE.MAINTENANCE) {
    return normalized.maintenanceMessage || '현재 시스템 점검 중입니다.';
  }

  if (normalized.serviceMode === SERVICE_MODE.READ_ONLY) {
    return '현재 서비스가 읽기 전용으로 운영 중이어서 변경 작업을 수행할 수 없습니다.';
  }

  const actionKeyMap = {
    signup: 'allowNewMemberSignup',
    rental: 'allowNewRentalRequests',
    change: 'allowRequestChanges',
    cancel: 'allowRequestChanges',
    extend: 'allowExtensionRequests',
    return: 'allowReturnRequests',
  };
  const key = actionKeyMap[action];
  if (key && normalized[key] === false) {
    const labelMap = {
      signup: '신규 회원가입 접수',
      rental: '신규 대여신청 접수',
      change: '신청 변경 요청',
      cancel: '신청 취소 요청',
      extend: '대여 연장 요청',
      return: '반납 요청',
    };
    return `현재 ${labelMap[action] || '해당 기능'}가 일시 중지되어 있습니다.`;
  }

  return '';
};

export const createDownload = (filename, content, mimeType = 'application/json;charset=utf-8') => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const formatBackupTimestamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}-${values.hour}${values.minute}${values.second}`;
};

export const redactBackupDocument = (collectionName, value, includePersonalData) => {
  if (includePersonalData || !value || typeof value !== 'object') return value;

  const next = { ...value };
  if (collectionName === 'userAccounts') {
    delete next.email;
    delete next.phone;
    delete next.maskedEmail;
    delete next.recoveryKey;
    delete next.identityKey;
  }
  if (collectionName === 'accountRecoveryKeys') {
    return { redacted: true };
  }
  if (collectionName === 'adminAccounts') {
    delete next.email;
    delete next.authEmail;
    delete next.phone;
    delete next.passwordHash;
    delete next.passwordSalt;
  }
  return next;
};
