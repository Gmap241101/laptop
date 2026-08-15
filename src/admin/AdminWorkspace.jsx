import { lazy, memo, Suspense } from 'react';
import { Activity, CalendarDays, ChevronDown, Database, Info, Menu, Paintbrush } from 'lucide-react';
import DevRenderProfiler from '../performance/DevRenderProfiler.jsx';
import DeviceTrustVerificationPanel from '../components/DeviceTrustVerificationPanel.jsx';
import { requestSiteContentDomain, SITE_CONTENT_DOMAINS } from '../features/content/siteContentCutover.js';
import { preloadAdminFooterCatalog, preloadAdminPopupCatalog } from '../features/boards/adminSiteContentCatalogService.js';
import { requestFaqBoard, requestNoticeBoard } from '../features/boards/boardContentCutover.js';
import { clerkStagingClient } from '../clerk/clerkStagingClient.js';
import { today } from '../utils/appUtils.js';
import AdminDashboardPanelView from './AdminDashboardPanel.jsx';

const AdminDashboardPanel = memo(AdminDashboardPanelView);
const loadAdminRequestsPanel = () => import('./AdminRequestsPanel.jsx');
const AdminRequestsPanel = memo(lazy(loadAdminRequestsPanel));
const AdminAssetsPanel = memo(lazy(() => import('./AdminAssetsPanel.jsx')));
const AdminAssetCategoriesPanel = memo(lazy(() => import('./AdminAssetCategoriesPanel.jsx')));
const AdminOrganizationPanel = memo(lazy(() => import('./AdminOrganizationPanel.jsx')));
const AdminSignupPolicyPanel = memo(lazy(() => import('./AdminSignupPolicyPanel.jsx')));
const loadAdminNoticePanel = () => import('./AdminNoticePanel.jsx');
const AdminNoticePanel = memo(lazy(loadAdminNoticePanel));
const loadAdminPopupPanel = () => import('./AdminPopupPanel.jsx');
const AdminPopupPanel = memo(lazy(loadAdminPopupPanel));
const loadAdminFaqPanel = () => import('./AdminFaqPanel.jsx');
const AdminFaqPanel = memo(lazy(loadAdminFaqPanel));
const loadAdminFooterPanel = () => import('./AdminFooterPanel.jsx');
const AdminFooterPanel = memo(lazy(loadAdminFooterPanel));
const AdminMemberAccountsPanel = memo(lazy(() => import('./AdminMemberAccountsPanel.jsx')));
const AdminAccountsPanel = memo(lazy(() => import('./AdminAccountsPanel.jsx')));
const AdminSettingsPanel = memo(lazy(() => import('./AdminSettingsPanel.jsx')));
const AdminAccountSecurityPanel = memo(lazy(() => import('./AdminAccountSecurityPanel.jsx')));
const AdminExtensionSettingsPanel = memo(lazy(() => import('./AdminExtensionSettingsPanel.jsx')));
const AdminHolidayManagementPanel = memo(lazy(() => import('./AdminHolidayManagementPanel.jsx')));
const loadAdminHomeManagementPanel = () => import('./AdminHomeManagementPanel.jsx');
const AdminHomeManagementPanel = memo(lazy(loadAdminHomeManagementPanel));

const ADMIN_PANEL_INTENT_LOADERS = Object.freeze({
  requests: Object.freeze({
    loadModule: loadAdminRequestsPanel,
    preloadData: () => clerkStagingClient.getAdminRentalRequests('', {
      tab: 'pending',
      quickFilter: 'all',
      query: '',
      page: 1,
      pageSize: 10,
      referenceDate: today(),
    }),
  }),
  noticePosts: Object.freeze({
    loadModule: loadAdminNoticePanel,
    preloadData: () => requestNoticeBoard({ page: 1, useCache: true }),
  }),
  faqPosts: Object.freeze({
    loadModule: loadAdminFaqPanel,
    preloadData: () => requestFaqBoard({ page: 1, categoryId: 'all', useCache: true }),
  }),
  homeManagement: Object.freeze({
    loadModule: loadAdminHomeManagementPanel,
    preloadData: () => requestSiteContentDomain({ domain: SITE_CONTENT_DOMAINS.HOME, useCache: true }),
  }),
  popupPosts: Object.freeze({
    loadModule: loadAdminPopupPanel,
    preloadData: () => preloadAdminPopupCatalog(),
  }),
  footerManagement: Object.freeze({
    loadModule: loadAdminFooterPanel,
    preloadData: () => preloadAdminFooterCatalog(),
  }),
});

const preloadAdminPanelOnIntent = (adminTab) => {
  const loader = ADMIN_PANEL_INTENT_LOADERS[adminTab];
  if (!loader) return;

  void loader.loadModule();
  void loader.preloadData?.().catch(() => {});
};

const ADMIN_MENU_GROUP_STATE_KEY = 'mk_laptop_admin_menu_groups';

const ADMIN_TAB_GROUP = {
  laptops: 'rental',
  extensionSettings: 'rental',
  holidaySettings: 'rental',
  categories: 'rental',
  noticePosts: 'community',
  faqPosts: 'community',
  siteSettings: 'site',
  homeManagement: 'site',
  homeContent: 'site',
  heroBanners: 'site',
  promotionBanners: 'site',
  quickLinkBanners: 'site',
  popupPosts: 'site',
  footerManagement: 'site',
  people: 'accounts',
  signupPolicy: 'accounts',
  memberAccounts: 'accounts',
  adminAccounts: 'accounts',
  settings: 'system',
  serviceOperations: 'system',
  accountSecurity: 'system',
  dataManagement: 'system',
  systemInfo: 'system',
};

function AdminWorkspace({ ctx, panelCtx }) {
  const {
    AlertCircle,
    Button,
    Card,
    CardContent,
    ClipboardList,
    Clock,
    Input,
    Laptop,
    LayoutDashboard,
    LockIcon,
    React,
    Settings,
    ShieldCheck,
    UserCircle,
    Users,
    adminAccountsLoadErrorMessage,
    adminAuthForm,
    adminAuthLoading,
    adminTab,
    authenticateAdmin,
    currentAuthRoleErrorMessage,
    goToUserHome,
    handleAdminTabChange,
    setAdminAuthForm,
    setAdminTab,
    shouldShowAdminAccountsErrorPage,
    shouldShowAdminLoadingPage,
    shouldShowAdminLoginPage,
  } = ctx;

  const scrollAdminPageToTop = React.useCallback(() => {
    if (typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'auto',
      });

      // 일부 브라우저나 레이아웃에서 window.scrollTo만으로 위치가 남는 경우를 보정합니다.
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }, []);

  const [expandedAdminMenuGroups, setExpandedAdminMenuGroups] = React.useState(() => {
    const activeGroup = ADMIN_TAB_GROUP[adminTab];

    if (typeof window === 'undefined') {
      return activeGroup ? [activeGroup] : ['rental'];
    }

    try {
      const savedGroups = JSON.parse(
        window.sessionStorage.getItem(ADMIN_MENU_GROUP_STATE_KEY) || '[]'
      );
      const validGroups = Array.isArray(savedGroups)
        ? savedGroups.filter((groupKey) =>
            ['rental', 'community', 'site', 'accounts', 'system'].includes(groupKey)
          )
        : [];

      if (activeGroup && !validGroups.includes(activeGroup)) {
        validGroups.push(activeGroup);
      }

      return validGroups.length ? validGroups : activeGroup ? [activeGroup] : ['rental'];
    } catch {
      return activeGroup ? [activeGroup] : ['rental'];
    }
  });

  React.useEffect(() => {
    scrollAdminPageToTop();
  }, [adminTab, scrollAdminPageToTop]);

  React.useEffect(() => {
    const activeGroup = ADMIN_TAB_GROUP[adminTab];
    if (!activeGroup) return;

    setExpandedAdminMenuGroups((currentGroups) =>
      currentGroups.includes(activeGroup)
        ? currentGroups
        : [...currentGroups, activeGroup]
    );
  }, [adminTab]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    window.sessionStorage.setItem(
      ADMIN_MENU_GROUP_STATE_KEY,
      JSON.stringify(expandedAdminMenuGroups)
    );
  }, [expandedAdminMenuGroups]);

  React.useEffect(() => {
    if (adminTab === 'settings') {
      React.startTransition(() => {
        setAdminTab('serviceOperations');
      });
      return;
    }

    const legacyHomeTabs = {
      homeContent: 'basic',
      heroBanners: 'hero',
      promotionBanners: 'promotion',
      quickLinkBanners: 'quickLink',
    };
    const nextHomeTab = legacyHomeTabs[adminTab];
    if (nextHomeTab) {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('mk_home_management_tab', nextHomeTab);
      }
      React.startTransition(() => {
        setAdminTab('homeManagement');
      });
    }
  }, [adminTab, setAdminTab]);

  const adminMenuGroups = [
    {
      key: 'rental',
      label: '대여 운영',
      Icon: Laptop,
      items: [
        ['laptops', Laptop, '대여 자산 관리'],
        ['extensionSettings', Clock, '대여 정책 관리'],
        ['holidaySettings', CalendarDays, '휴일 관리'],
        ['categories', ClipboardList, '자산 카테고리 관리'],
      ],
    },
    {
      key: 'community',
      label: '커뮤니티 관리',
      Icon: ClipboardList,
      items: [
        ['noticePosts', ClipboardList, '공지사항 관리'],
        ['faqPosts', ClipboardList, 'FAQ 관리'],
      ],
    },
    {
      key: 'site',
      label: '사이트 관리',
      Icon: LayoutDashboard,
      items: [
        ['siteSettings', Paintbrush, '사이트 기본 설정'],
        ['homeManagement', LayoutDashboard, '홈 화면 관리'],
        ['popupPosts', ClipboardList, '팝업 관리'],
        ['footerManagement', ClipboardList, '푸터 관리'],
      ],
    },
    {
      key: 'accounts',
      label: '사용자·권한',
      Icon: ShieldCheck,
      items: [
        ['people', Users, '부서·사용자 관리'],
        ['signupPolicy', ShieldCheck, '회원가입 정책'],
        ['memberAccounts', UserCircle, '회원 계정 관리'],
        ['adminAccounts', ShieldCheck, '관리자 ID 관리'],
      ],
    },
    {
      key: 'system',
      label: '시스템',
      Icon: Settings,
      items: [
        ['serviceOperations', Activity, '서비스 운영'],
        ['accountSecurity', ShieldCheck, '계정 보안 설정'],
        ['dataManagement', Database, '데이터 관리'],
        ['systemInfo', Info, '시스템 정보·로그'],
      ],
    },
  ];

  const toggleAdminMenuGroup = (groupKey) => {
    setExpandedAdminMenuGroups((currentGroups) =>
      currentGroups.includes(groupKey)
        ? currentGroups.filter((key) => key !== groupKey)
        : [...currentGroups, groupKey]
    );
  };

  const renderAdminMenuButton = ([key, Icon, label], options = {}) => {
    const isNested = options.nested === true;
    const isActive = adminTab === key;

    return (
      <Button
        key={key}
        variant={isActive ? 'primary' : 'ghost'}
        onPointerEnter={() => preloadAdminPanelOnIntent(key)}
        onPointerDown={() => preloadAdminPanelOnIntent(key)}
        onFocus={() => preloadAdminPanelOnIntent(key)}
        onClick={() => {
          if (isActive) {
            scrollAdminPageToTop();
            return;
          }

          handleAdminTabChange(key, {
            onCommitted: () => preloadAdminPanelOnIntent(key),
          });
        }}
        className={`relative h-9 w-full justify-start !py-0 text-left ${
          isNested ? 'px-1.5 pl-1.5 text-[13px]' : 'px-3 text-sm'
        } ${isActive ? '' : 'text-slate-700 hover:bg-slate-100'}`}
      >
        {isNested ? (
          <span
            aria-hidden="true"
            className={`mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              isActive ? 'bg-white' : 'bg-slate-300'
            }`}
          />
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <Icon size={16} />
          </span>
        )}
        <span className="min-w-0 flex-1 text-left">{label}</span>
      </Button>
    );
  };

  return (
          shouldShowAdminLoadingPage ? (
            <Card className="mx-auto max-w-xl overflow-hidden border-slate-200 bg-white shadow-sm">
              <CardContent className="p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl mk-brand-gradient-tr text-white mk-brand-shadow-md">
                  <ShieldCheck size={26} />
                </div>
                <h2 className="text-lg font-black tracking-tight text-slate-900">
                  관리자 데이터를 확인하는 중입니다.
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">
                  PostgreSQL 관리자 레지스트리와 Clerk 인증 상태를 확인한 뒤 관리자 인증 화면을 표시합니다.
                </p>
              </CardContent>
            </Card>
          ) : shouldShowAdminAccountsErrorPage ? (
            <Card className="mx-auto max-w-xl overflow-hidden border-rose-200 bg-white shadow-sm">
              <div className="relative overflow-hidden bg-gradient-to-br from-rose-700 via-rose-600 to-orange-600 px-6 py-8 text-white">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

                <div className="relative flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <AlertCircle size={26} />
                  </div>

                  <div>
                    <h2 className="text-xl font-black tracking-tight">
                      관리자 ID 데이터 연결 오류
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-rose-100">
                      관리자 ID 전용 데이터에 접근하지 못해 관리자 화면 진입을 차단했습니다.
                    </p>
                  </div>
                </div>
              </div>

              <CardContent className="space-y-4 p-6">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                  {adminAccountsLoadErrorMessage || currentAuthRoleErrorMessage}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
                  PostgreSQL 관리자 레지스트리와 Clerk 관리자 권한 상태를 확인해 주세요.
                  기존 관리자 ID 데이터 보호를 위해, 전용 관리자 ID 문서가 정상 연결되기 전에는 관리자 화면을 열지 않습니다.
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToUserHome}
                  >
                    사용자 화면으로 이동
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => window.location.reload()}
                  >
                    다시 시도
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : shouldShowAdminLoginPage ? (
            <Card className="mx-auto max-w-xl overflow-hidden border-slate-200 bg-white shadow-sm">
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                <div className="relative flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <ShieldCheck size={26} />
                  </div>

                  <div>
                    <h2 className="text-xl font-black tracking-tight">
                      {adminAuthForm.clientTrustRequired ? '새 기기 인증' : '관리자 인증'}
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-slate-300">
                      {adminAuthForm.clientTrustRequired
                        ? '관리자 로그인 이메일로 전송된 6자리 인증코드를 확인합니다.'
                        : '등록된 관리자 로그인 이메일로 인증해야 관리자 모드에 접근할 수 있습니다.'}
                    </p>
                  </div>
                </div>
              </div>

              <CardContent className="space-y-4 p-6">
                {!adminAuthForm.clientTrustRequired ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                      <LockIcon size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        관리자 화면 잠금 상태
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        관리자 ID 또는 로그인 이메일과 비밀번호를 입력하면 인증 후 관리자 메뉴와 세부 기능이 표시됩니다.
                      </p>
                    </div>
                  </div>
                </div>
                ) : null}

                {adminAuthForm.clientTrustRequired ? (
                  <DeviceTrustVerificationPanel
                    surface="admin"
                    email={adminAuthForm.adminLoginId}
                    code={adminAuthForm.clientTrustCode}
                    onChange={(value) =>
                      setAdminAuthForm({
                        ...adminAuthForm,
                        clientTrustCode: value,
                      })
                    }
                    onSubmit={authenticateAdmin}
                    disabled={adminAuthLoading}
                  />
                ) : (
                  <>
                    <Input
                      label="관리자 로그인 이메일"
                      value={adminAuthForm.adminLoginId}
                      onChange={(v) =>
                        setAdminAuthForm({
                          ...adminAuthForm,
                          adminLoginId: v,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          authenticateAdmin();
                        }
                      }}
                      placeholder="관리자 로그인 이메일 입력"
                      autoFocus
                    />
                    <Input
                      label="비밀번호"
                      type="password"
                      value={adminAuthForm.password}
                      onChange={(v) =>
                        setAdminAuthForm({
                          ...adminAuthForm,
                          password: v,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          authenticateAdmin();
                        }
                      }}
                      placeholder="비밀번호 입력"
                    />
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                      Clerk + PostgreSQL 관리자 권한을 기준으로 인증합니다. 새로운 기기에서는 이메일 인증코드 확인이 추가됩니다.
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToUserHome}
                  >
                    사용자 화면으로 이동
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={authenticateAdmin}
                    disabled={adminAuthLoading}
                  >
                    {adminAuthLoading
                      ? '인증 중...'
                      : adminAuthForm.clientTrustRequired
                        ? '인증코드 확인'
                        : '관리자 인증'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
          /* ==================== [관리자 설정 화면] ==================== */
          <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            
            {/* 좌측 사이드 네비게이션 메뉴 */}
            <div className="lg:sticky lg:top-24 h-fit">
              <Card>
                <div className="flex h-[52px] items-center gap-2.5 border-b-2 border-orange-500 bg-[#3b5b78] px-5 text-white">
                  <Menu size={17} className="shrink-0 text-slate-100" />
                  <h3 className="text-left text-base font-extrabold text-white">
                    관리 메뉴
                  </h3>
                </div>

                <CardContent className="p-3">
                  <div className="space-y-1">
                    {renderAdminMenuButton([
                      'dashboard',
                      LayoutDashboard,
                      '실시간 대시보드',
                    ])}

                    {renderAdminMenuButton([
                      'requests',
                      ClipboardList,
                      '기기 대여 신청 관리',
                    ])}
                  </div>

                  <div className="mb-2 mt-3 border-t border-slate-200" />

                  <div className="space-y-1.5">
                    {adminMenuGroups.map((group) => {
                      const isExpanded = expandedAdminMenuGroups.includes(group.key);
                      const hasActiveItem = group.items.some(([key]) => key === adminTab);
                      const GroupIcon = group.Icon;

                      return (
                        <div key={group.key}>
                          <button
                            type="button"
                            onClick={() => toggleAdminMenuGroup(group.key)}
                            aria-expanded={isExpanded}
                            className={`flex h-10 w-full items-center rounded-lg px-3 text-left text-[13px] font-extrabold transition ${
                              hasActiveItem
                                ? 'bg-slate-200 text-slate-950'
                                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <span className="mr-2.5 flex h-5 w-5 shrink-0 items-center justify-center">
                              <GroupIcon size={16} />
                            </span>
                            <span className="min-w-0 flex-1">{group.label}</span>
                            <ChevronDown
                              size={15}
                              className={`ml-2 shrink-0 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {isExpanded ? (
                            <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-1">
                              {group.items.map((item) =>
                                renderAdminMenuButton(item, { nested: true })
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 우측 세부 탭 컨텐츠 영역 */}
            <div className="min-w-0 space-y-6">
              <Card className="min-w-0">
                <CardContent className="min-w-0 p-6">
                  <DevRenderProfiler id={`AdminPanel:${adminTab}`}>
                    <Suspense fallback={null}>
                  {/* 대시보드 탭 */}
                  {adminTab === 'dashboard' && (
                    <AdminDashboardPanel ctx={panelCtx} />
                  )}

                  {/* 신청 관리 원장 탭 */}
                  {adminTab === 'requests' && (
                    <AdminRequestsPanel ctx={panelCtx} />
                  )}

                  {/* 자산 목록 관리 탭 */}
                  {adminTab === 'laptops' && (
                    <AdminAssetsPanel ctx={panelCtx} />
                  )}

                  {/* 휴일 관리 탭 */}
                  {adminTab === 'holidaySettings' && (
                    <AdminHolidayManagementPanel ctx={panelCtx} />
                  )}

                  {/* 자산 카테고리 관리 탭 */}
                  {adminTab === 'categories' && (
                    <AdminAssetCategoriesPanel ctx={panelCtx} />
                  )}

                  {/* 팀명 및 대여자 관리 탭 */}
                  {adminTab === 'people' && (
                    <AdminOrganizationPanel ctx={panelCtx} />
                  )}

                  {/* 회원가입 정책 관리 탭 */}
                  {adminTab === 'signupPolicy' && (
                    <AdminSignupPolicyPanel ctx={panelCtx} />
                  )}

                                    {/* 공지사항 관리 탭 */}
                  {adminTab === 'noticePosts' && (
                    <AdminNoticePanel ctx={panelCtx} />
                  )}

                  {/* 사이트 기본 설정 탭 */}
                  {adminTab === 'siteSettings' && (
                    <AdminSettingsPanel ctx={panelCtx} mode="site" />
                  )}

                  {/* 홈 화면 관리 탭 */}
                  {adminTab === 'homeManagement' && (
                    <AdminHomeManagementPanel ctx={panelCtx} />
                  )}

                  {/* 팝업 관리 탭 */}
                  {adminTab === 'popupPosts' && (
                    <AdminPopupPanel ctx={panelCtx} />
                  )}

                                    {/* FAQ 관리 탭 */}
                  {adminTab === 'faqPosts' && (
                    <AdminFaqPanel ctx={panelCtx} />
                  )}

                  {/* 푸터 관리 탭 */}
                  {adminTab === 'footerManagement' && (
                    <AdminFooterPanel ctx={panelCtx} />
                  )}

                  {/* 회원 계정 승인·차단 관리 탭 */}
                  {adminTab === 'memberAccounts' && (
                    <AdminMemberAccountsPanel ctx={panelCtx} />
                  )}

                  {/* 관리자 ID 관리 탭 */}
                  {adminTab === 'adminAccounts' && (
                    <AdminAccountsPanel ctx={panelCtx} />
                  )}
                  
                  {/* 서비스 운영 탭 */}
                  {adminTab === 'serviceOperations' && (
                    <AdminSettingsPanel ctx={panelCtx} mode="service" />
                  )}

                  {/* 계정 보안 설정 탭 */}
                  {adminTab === 'accountSecurity' && (
                    <AdminAccountSecurityPanel ctx={panelCtx} />
                  )}

                  {/* 데이터 관리 탭 */}
                  {adminTab === 'dataManagement' && (
                    <AdminSettingsPanel ctx={panelCtx} mode="data" />
                  )}

                  {/* 시스템 정보·로그 탭 */}
                  {adminTab === 'systemInfo' && (
                    <AdminSettingsPanel ctx={panelCtx} mode="info" />
                  )}

                  {/* 이전 시스템 관리 메뉴 키 호환 */}
                  {adminTab === 'settings' && (
                    <AdminSettingsPanel ctx={panelCtx} mode="service" />
                  )}

                  {/* 대여 정책 관리 탭 */}
                  {adminTab === 'extensionSettings' && (
                    <AdminExtensionSettingsPanel ctx={panelCtx} />
                  )}
                    </Suspense>
                  </DevRenderProfiler>
                </CardContent>
              </Card>
            </div>
          </div>
          )
  );
}

export default memo(AdminWorkspace);
