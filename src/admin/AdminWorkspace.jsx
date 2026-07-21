import { CalendarDays, ChevronDown } from 'lucide-react';
import AdminDashboardPanel from './AdminDashboardPanel.jsx';
import AdminRequestsPanel from './AdminRequestsPanel.jsx';
import AdminAssetsPanel from './AdminAssetsPanel.jsx';
import AdminAssetCategoriesPanel from './AdminAssetCategoriesPanel.jsx';
import AdminOrganizationPanel from './AdminOrganizationPanel.jsx';
import AdminNoticePanel from './AdminNoticePanel.jsx';
import AdminPopupPanel from './AdminPopupPanel.jsx';
import AdminFaqPanel from './AdminFaqPanel.jsx';
import AdminFooterPanel from './AdminFooterPanel.jsx';
import AdminMemberAccountsPanel from './AdminMemberAccountsPanel.jsx';
import AdminAccountsPanel from './AdminAccountsPanel.jsx';
import AdminSettingsPanel from './AdminSettingsPanel.jsx';
import AdminExtensionSettingsPanel from './AdminExtensionSettingsPanel.jsx';
import AdminHolidayManagementPanel from './AdminHolidayManagementPanel.jsx';

const ADMIN_MENU_GROUP_STATE_KEY = 'mk_laptop_admin_menu_groups';

const ADMIN_TAB_GROUP = {
  laptops: 'rental',
  extensionSettings: 'rental',
  holidaySettings: 'rental',
  categories: 'rental',
  noticePosts: 'content',
  popupPosts: 'content',
  faqPosts: 'content',
  footerManagement: 'content',
  people: 'accounts',
  memberAccounts: 'accounts',
  adminAccounts: 'accounts',
  settings: 'system',
};

export default function AdminWorkspace({ ctx }) {
  const {
    ADMIN_ACCOUNT_PAGE_SIZE,
    ADMIN_CUSTOM_OPTION_VALUE,
    ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
    ADMIN_REQUEST_TAB,
    AlertCircle,
    AnimatePresence,
    Badge,
    Button,
    Card,
    CardContent,
    CheckCircle2,
    ClipboardList,
    Clock,
    DEFAULT_EXCLUDE_HOLIDAYS_FOR_START_DATE,
    DEFAULT_EXCLUDE_WEEKENDS_FOR_START_DATE,
    DEFAULT_HOLIDAY_TYPE,
    DEFAULT_WORK_END_TIME,
    Edit3,
    FAQ_POSTS_PER_PAGE_OPTIONS,
    HOLIDAY_TYPE_LABEL,
    Input,
    Laptop,
    LayoutDashboard,
    LockIcon,
    LogOut,
    NOTICE_POSTS_PER_PAGE_OPTIONS,
    Plus,
    RENTAL_REQUEST_AUDIT_ACTION,
    React,
    STATUS,
    Save,
    Search,
    Select,
    Settings,
    ShieldCheck,
    Trash2,
    USER_PROFILE_STATUS,
    USER_REQUEST_ACTION,
    USER_REQUEST_REVIEW_STATUS,
    UserCircle,
    Users,
    X,
    XCircle,
    addFaqCategory,
    addTempAssetCategory,
    addTempBorrower,
    addTempHoliday,
    addTempTeam,
    adminAccountEditForm,
    adminAccountForm,
    adminAccountTotalPages,
    adminAccountUserOptions,
    adminAccountsLoadErrorMessage,
    adminAuthForm,
    adminAuthLoading,
    adminAvailabilityFilter,
    adminExpandedFaqPostId,
    adminFaqTotalPages,
    adminFilteredLaptops,
    adminLaptopQuery,
    adminNoticeTotalPages,
    adminPinnedFaqPosts,
    adminRegularFaqPosts,
    adminRequestPageSize,
    adminRequestQuery,
    adminRequestTab,
    adminRequestTabCounts,
    adminRequestTotalPages,
    adminSelectedAssetCategory,
    adminTab,
    adminUserAccountQuery,
    adminUserAccountSavingUid,
    adminUserAccountStatusCounts,
    adminUserAccountStatusFilter,
    adminUserAccountsLoadErrorMessage,
    adminUserAccountsReady,
    adminUserActionSavingRequestId,
    applyEditTempAssetCategory,
    applyEditTempBorrower,
    applyEditTempTeam,
    authenticateAdmin,
    authenticatedAdminId,
    cancelEditAdminAccount,
    cancelTempAssetCategoryChanges,
    cancelTempPeopleChanges,
    confirmDeleteFaqCategory,
    confirmDeleteFaqPost,
    confirmDeleteNoticePost,
    confirmUserAccountStatusChange,
    createDefaultAdminAccountForm,
    createLaptop,
    currentAuthRoleErrorMessage,
    data,
    deleteAdminAccount,
    deleteLaptop,
    deleteTempAssetCategory,
    deleteTempBorrower,
    deleteTempHoliday,
    deleteTempTeam,
    displayedTempBorrowers,
    draggingAssetCategoryIndex,
    draggingBorrowerIndex,
    draggingTeamIndex,
    editLaptop,
    editLaptopInsertIndex,
    editingAdminAccountId,
    editingAssetCategoryIndex,
    editingAssetCategoryName,
    editingBorrowerIndex,
    editingBorrowerName,
    editingFaqCategoryId,
    editingFaqCategoryName,
    editingTeamIndex,
    editingTeamName,
    faqBoardConfigLoadErrorMessage,
    faqBoardConfigReady,
    faqBoardConfigSaving,
    faqCategories,
    faqCategoriesLoadErrorMessage,
    faqCategoriesReady,
    faqCategoryDeletingId,
    faqCategoryNameById,
    faqCategorySavingId,
    faqPostDeletingId,
    faqPosts,
    faqPostsLoadErrorMessage,
    faqPostsPerPageInput,
    faqPostsReady,
    filteredAdminRequests,
    filteredManagedUserAccounts,
    finalizeSplitStorageMigration,
    formatDateWithKoreanWeekday,
    formatFirestoreDate,
    formatFirestoreTimestamp,
    getAdminRequestRestoreTargets,
    getDisplayRentalStatus,
    getKoreaNow,
    getLaptopAdminDisplayStatus,
    getUserAccountStatusClassName,
    getUserAccountStatusLabel,
    getUserRequestActionLabel,
    getUserRequestReviewStatusLabel,
    goToUserHome,
    handleAddLaptopClick,
    handleFileUpload,
    handleAdminTabChange,
    holidayImportLoading,
    holidayImportYear,
    importKoreanPublicHolidaysFromJson,
    isSplitStorageReady,
    mergedRentalRequests,
    motion,
    moveTempAssetCategory,
    moveTempBorrower,
    moveTempTeam,
    newAssetCategory,
    newBorrower,
    newBorrowerTeam,
    newFaqCategoryName,
    newHolidayDate,
    newHolidayName,
    newHolidayType,
    newLaptop,
    newTeam,
    noticeBoardConfigLoadErrorMessage,
    noticeBoardConfigReady,
    noticeBoardConfigSaving,
    noticePostDeletingId,
    noticePosts,
    noticePostsLoadErrorMessage,
    noticePostsPerPage,
    noticePostsPerPageInput,
    noticePostsReady,
    openAdminRequestEditDialog,
    openAdminRequestRestoreDialog,
    openFaqPostDialog,
    openNoticePostDialog,
    orphanedRentalAvailabilityRequests,
    paginatedAdminAccounts,
    paginatedAdminFaqPosts,
    paginatedAdminNoticePosts,
    paginatedAdminRequests,
    pinnedNoticePosts,
    registerAdminAccount,
    registeredAdminAccounts,
    regularNoticePosts,
    renderRequestActionButtons,
    rentalRequestIdSet,
    rentalRequestLogsByRequestId,
    rentalRequestLogsLoadErrorMessage,
    rentalRequestLogsReady,
    rentalRequestsLoadErrorMessage,
    rentalRequestsReady,
    reviewUserActionRequest,
    safeAdminAccountPage,
    safeAdminFaqPage,
    safeAdminNoticePage,
    safeAdminRequestPage,
    saveAdminAccountEdit,
    saveFaqBoardConfig,
    saveFaqCategoryName,
    saveLaptop,
    saveNoticeBoardConfig,
    saveRequestMemo,
    saveSystemSettings,
    saveTempAssetCategoryChanges,
    saveTempPeopleChanges,
    selectedAdminRequest,
    sendAdminAccountPasswordResetEmail,
    setAdminAccountEditForm,
    setAdminAccountForm,
    setAdminAccountPage,
    setAdminAuthForm,
    setAdminAvailabilityFilter,
    setAdminExpandedFaqPostId,
    setAdminFaqPage,
    setAdminLaptopQuery,
    setAdminNoticePage,
    setAdminRequestPage,
    setAdminRequestPageSize,
    setAdminRequestQuery,
    setAdminRequestTab,
    setAdminSelectedAssetCategory,
    setAdminTab,
    setAdminUserAccountQuery,
    setAdminUserAccountStatusFilter,
    setDraggingAssetCategoryIndex,
    setDraggingBorrowerIndex,
    setDraggingTeamIndex,
    setEditLaptop,
    setEditingAssetCategoryIndex,
    setEditingAssetCategoryName,
    setEditingBorrowerIndex,
    setEditingBorrowerName,
    setEditingFaqCategoryId,
    setEditingFaqCategoryName,
    setEditingTeamIndex,
    setEditingTeamName,
    setFaqPostsPerPageInput,
    setHolidayImportLoading,
    setHolidayImportYear,
    setNewAssetCategory,
    setNewBorrower,
    setNewBorrowerTeam,
    setNewFaqCategoryName,
    setNewHolidayDate,
    setNewHolidayName,
    setNewHolidayType,
    setNewLaptop,
    setNewTeam,
    setNoticePostsPerPageInput,
    setSelectedAdminRequestId,
    setShowUploadPanel,
    setTempSettings,
    shouldShowAdminAccountsErrorPage,
    shouldShowAdminLoadingPage,
    shouldShowAdminLoginPage,
    showUploadPanel,
    splitStorageFinalizeLoading,
    startEditAdminAccount,
    startEditFaqCategory,
    startEditTempAssetCategory,
    startEditTempBorrower,
    startEditTempTeam,
    tempAllowNonOverlappingSameAssetRequests,
    tempAssetCategories,
    tempBusinessDayAdjustmentEnabled,
    tempHolidayList,
    tempSettings,
    tempTeams,
    today,
    toggleAdminFaqPost,
    triggerConfirm,
    triggerToast,
    updateRequestMemo,
  } = ctx;

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
            ['rental', 'content', 'accounts', 'system'].includes(groupKey)
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

  const adminMenuGroups = [
    {
      key: 'rental',
      label: '대여 운영',
      items: [
        ['laptops', Laptop, '대여 자산 관리'],
        ['extensionSettings', Clock, '대여 정책 관리'],
        ['holidaySettings', CalendarDays, '휴일 관리'],
        ['categories', ClipboardList, '자산 카테고리 관리'],
      ],
    },
    {
      key: 'content',
      label: '콘텐츠 관리',
      items: [
        ['noticePosts', ClipboardList, '공지사항 관리'],
        ['popupPosts', ClipboardList, '팝업 관리'],
        ['faqPosts', ClipboardList, 'FAQ 관리'],
        ['footerManagement', ClipboardList, '푸터 관리'],
      ],
    },
    {
      key: 'accounts',
      label: '사용자·권한',
      items: [
        ['people', Users, '부서·사용자 관리'],
        ['memberAccounts', UserCircle, '회원 계정 관리'],
        ['adminAccounts', ShieldCheck, '관리자 ID 관리'],
      ],
    },
    {
      key: 'system',
      label: '시스템',
      items: [['settings', Settings, '시스템 관리']],
    },
  ];

  const toggleAdminMenuGroup = (groupKey) => {
    setExpandedAdminMenuGroups((currentGroups) =>
      currentGroups.includes(groupKey)
        ? currentGroups.filter((key) => key !== groupKey)
        : [...currentGroups, groupKey]
    );
  };

  const renderAdminMenuButton = ([key, Icon, label]) => (
    <Button
      key={key}
      variant={adminTab === key ? 'primary' : 'ghost'}
      onClick={() => handleAdminTabChange(key)}
      className={`h-9 w-full justify-start px-3 !py-0 text-left ${
        adminTab === key ? '' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1 text-left">{label}</span>
    </Button>
  );

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
                  Firebase 원격 DB 기준으로 관리자 ID 등록 상태를 확인한 뒤 관리자 인증 화면을 표시합니다.
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
                  Firestore 보안 규칙에서 <span className="font-semibold text-slate-900">adminAccounts/{`{uid}`}</span> 컬렉션의 읽기/쓰기 권한이 허용되어 있는지 확인해 주세요.
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
                      관리자 인증
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-slate-300">
                      등록된 관리자 로그인 이메일로 인증해야 관리자 모드에 접근할 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>

              <CardContent className="space-y-4 p-6">
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

                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs leading-5 text-orange-800">
                  신규 관리자 계정은 Firebase Authentication 이메일/비밀번호 방식으로 인증합니다.
                  기존 PBKDF2 관리자 계정은 이메일이 등록되어 있으면 로그인 성공 시 Firebase Auth 계정으로 자동 연결됩니다.
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
                    onClick={authenticateAdmin}
                    disabled={adminAuthLoading}
                  >
                    {adminAuthLoading ? '인증 중...' : '관리자 인증'}
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
                <div className="border-b-2 border-orange-500 bg-slate-700 px-5 py-4 text-white">
                  <h3 className="text-left text-xs font-bold uppercase tracking-wider text-slate-100">
                    관리 메뉴
                  </h3>
                </div>

                <CardContent className="space-y-1.5 p-3">
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

                  <div className="space-y-1">
                    {adminMenuGroups.map((group) => {
                      const isExpanded = expandedAdminMenuGroups.includes(group.key);
                      const hasActiveItem = group.items.some(([key]) => key === adminTab);

                      return (
                        <div key={group.key}>
                          <button
                            type="button"
                            onClick={() => toggleAdminMenuGroup(group.key)}
                            aria-expanded={isExpanded}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[11px] font-bold tracking-wide transition ${
                              hasActiveItem
                                ? 'bg-slate-100 text-slate-900'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                            }`}
                          >
                            <span>{group.label}</span>
                            <ChevronDown
                              size={14}
                              className={`shrink-0 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {isExpanded ? (
                            <div className="mt-0.5 space-y-0.5">
                              {group.items.map(renderAdminMenuButton)}
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
                  
                  {/* 대시보드 탭 */}
                  {adminTab === 'dashboard' && (
                    <AdminDashboardPanel ctx={ctx} />
                  )}

                  {/* 신청 관리 원장 탭 */}
                  {adminTab === 'requests' && (
                    <AdminRequestsPanel ctx={ctx} />
                  )}

                  {/* 자산 목록 관리 탭 */}
                  {adminTab === 'laptops' && (
                    <AdminAssetsPanel ctx={ctx} />
                  )}

                  {/* 휴일 관리 탭 */}
                  {adminTab === 'holidaySettings' && (
                    <AdminHolidayManagementPanel ctx={ctx} />
                  )}

                  {/* 자산 카테고리 관리 탭 */}
                  {adminTab === 'categories' && (
                    <AdminAssetCategoriesPanel ctx={ctx} />
                  )}

                  {/* 팀명 및 대여자 관리 탭 */}
                  {adminTab === 'people' && (
                    <AdminOrganizationPanel ctx={ctx} />
                  )}

                                    {/* 공지사항 관리 탭 */}
                  {adminTab === 'noticePosts' && (
                    <AdminNoticePanel ctx={ctx} />
                  )}

                  {/* 팝업 관리 탭 */}
                  {adminTab === 'popupPosts' && (
                    <AdminPopupPanel ctx={ctx} />
                  )}

                                    {/* FAQ 관리 탭 */}
                  {adminTab === 'faqPosts' && (
                    <AdminFaqPanel ctx={ctx} />
                  )}

                  {/* 푸터 관리 탭 */}
                  {adminTab === 'footerManagement' && (
                    <AdminFooterPanel ctx={ctx} />
                  )}

                  {/* 회원 계정 승인·차단 관리 탭 */}
                  {adminTab === 'memberAccounts' && (
                    <AdminMemberAccountsPanel ctx={ctx} />
                  )}

                  {/* 관리자 ID 관리 탭 */}
                  {adminTab === 'adminAccounts' && (
                    <AdminAccountsPanel ctx={ctx} />
                  )}
                  
                  {/* 시스템 관리 탭 */}
                  {adminTab === 'settings' && (
                    <AdminSettingsPanel ctx={ctx} />
                  )}

                  {/* 대여 정책 관리 탭 */}
                  {adminTab === 'extensionSettings' && (
                    <AdminExtensionSettingsPanel ctx={ctx} />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          )
  );
}
