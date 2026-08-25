import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Laptop, LogIn, LogOut, Menu, UserCircle, UserPlus, X } from 'lucide-react';

import { Button } from '../components/CommonUI.jsx';
import RentalStatusBoard from '../components/RentalStatusBoard.jsx';
import DevRenderProfiler from '../performance/DevRenderProfiler.jsx';
import UserFooter from './UserFooter.jsx';
import UserWorkspace from './UserWorkspace.jsx';
import UserRuntimeErrorBoundary from './UserRuntimeErrorBoundary.jsx';
import { getHeaderSubtitle } from '../utils/systemSettings.js';

const UserDialogs = React.lazy(() => import('./UserDialogs.jsx'));
const UserPopupLayer = React.lazy(() => import('./UserPopupLayer.jsx'));
const DevPerformancePanel = React.lazy(() =>
  import('../performance/DevPerformancePanel.jsx')
);

const MemoizedUserFooter = React.memo(UserFooter);
const MemoizedUserDialogs = React.memo(UserDialogs);
const MemoizedUserPopupLayer = React.memo(UserPopupLayer);

const prefetchUserNotice = () => {
  void import('../features/boards/boardContentCutover.js')
    .then(({ requestNoticeBoard }) => requestNoticeBoard({ search: '', page: 1, useCache: true }))
    .catch(() => {});
};

const prefetchUserFaq = () => {
  void import('../features/boards/boardContentCutover.js')
    .then(({ requestFaqBoard }) => requestFaqBoard({ search: '', page: 1, categoryId: 'all', useCache: true }))
    .catch(() => {});
};

const prefetchUserInquiry = (authenticated) => {
  void import('../features/inquiries/inquiryApi.js')
    .then(async ({ inquiryApi }) => {
      const reads = [
        inquiryApi.getPublicConfig({ includeGuestTerms: false, includeCategories: Boolean(authenticated) }),
      ];
      if (authenticated) reads.push(inquiryApi.listMember({ page: 1, search: '', pageSize: 10 }));
      await Promise.all(reads);
    })
    .catch(() => {});
};

const prefetchUserCommunity = (authenticated) => {
  prefetchUserNotice();
  prefetchUserFaq();
  prefetchUserInquiry(authenticated);
};

const UserShell = ({
  communityMenuRef,
  contextGroups,
  currentAuthRoleErrorMessage,
  dismissSystemBanner,
  firebaseAuthReady,
  firebaseAuthUser,
  firebaseReady,
  goToAppHome,
  goToProtectedUserTab,
  goToUserFaq,
  goToUserInquiry,
  goToUserLogin,
  goToUserMypage,
  goToUserNotice,
  goToUserSignup,
  isCommunityMenuOpen,
  logoutUser,
  normalizedSiteSettings,
  popupPosts,
  setIsCommunityMenuOpen,
  shouldRenderAppDialogs,
  shouldShowStats,
  shouldShowSystemBanner,
  stats,
  statsLoading,
  userAuthLoading,
  userPanelContextKey,
  userTab,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isMobileRentalStatusOpen, setIsMobileRentalStatusOpen] = React.useState(
    ['history', 'rentalStatus'].includes(userTab)
  );
  const [isMobileCommunityOpen, setIsMobileCommunityOpen] = React.useState(true);
  const [isRentalStatusMenuOpen, setIsRentalStatusMenuOpen] = React.useState(false);
  const showDataLoadingOverlay = userTab !== 'home' && !firebaseReady;
  const headerSubtitle = getHeaderSubtitle(normalizedSiteSettings);

  React.useEffect(() => {
    if (userTab !== 'home') return undefined;
    const timer = window.setTimeout(() => {
      prefetchUserCommunity(Boolean(firebaseAuthUser));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [firebaseAuthUser?.id, firebaseAuthUser?.uid, userTab]);

  React.useEffect(() => {
    if (['history', 'rentalStatus'].includes(userTab)) {
      setIsMobileRentalStatusOpen(true);
    }
    setIsRentalStatusMenuOpen(false);
  }, [userTab]);

  React.useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  const runMobileNavigation = (action) => {
    setIsMobileMenuOpen(false);
    action();
  };
  const shouldMountUserPopupLayer =
    Array.isArray(popupPosts) &&
    popupPosts.length > 0 &&
    (userTab === 'home' ||
      (userTab === 'rental' && Boolean(firebaseAuthUser)));

  return (
    <>
      <div
        className={`flex min-h-screen flex-col bg-slate-50 text-slate-900 font-sans antialiased transition duration-200 ${
          showDataLoadingOverlay ? 'pointer-events-none select-none blur-sm' : ''
        }`}
      >
        {shouldShowSystemBanner ? (
          <div
            className={`relative z-40 border-b px-4 py-2 text-center text-sm font-bold leading-5 ${
              normalizedSiteSettings.systemBannerLevel === 'critical'
                ? 'border-rose-300 bg-rose-600 text-white'
                : normalizedSiteSettings.systemBannerLevel === 'warning'
                  ? 'border-amber-300 bg-amber-100 text-amber-900'
                  : 'border-sky-300 bg-sky-100 text-sky-900'
            }`}
          >
            {normalizedSiteSettings.systemBannerUrl ? (
              <a
                href={normalizedSiteSettings.systemBannerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {normalizedSiteSettings.systemBannerMessage}
              </a>
            ) : (
              normalizedSiteSettings.systemBannerMessage
            )}
            {normalizedSiteSettings.systemBannerDismissible ? (
              <button
                type="button"
                onClick={dismissSystemBanner}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-black/10"
                aria-label="시스템 안내 닫기"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        ) : null}

        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full min-w-0 items-center justify-between gap-3 lg:w-auto">
              <button
                type="button"
                onClick={goToAppHome}
                className="flex min-w-0 shrink items-center gap-3.5 text-left sm:gap-4"
              >
                {normalizedSiteSettings.logoMode === 'image' &&
                normalizedSiteSettings.logoImageUrl ? (
                  <picture className="shrink-0">
                    {normalizedSiteSettings.mobileLogoImageUrl ? (
                      <source
                        media="(max-width: 639px)"
                        srcSet={normalizedSiteSettings.mobileLogoImageUrl}
                      />
                    ) : null}
                    <img
                      src={normalizedSiteSettings.logoImageUrl}
                      alt={normalizedSiteSettings.logoAltText}
                      className="h-11 max-w-[150px] object-contain sm:h-12"
                    />
                  </picture>
                ) : normalizedSiteSettings.logoMode === 'text' ? null : (
                  <div className="shrink-0 rounded-2xl mk-brand-gradient-tr p-2.5 text-white mk-brand-shadow-md sm:p-3">
                    <Laptop size={26} />
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="break-keep text-[16px] font-bold leading-snug tracking-tight text-slate-900 sm:text-lg lg:text-[21px]">
                    {normalizedSiteSettings.siteName}
                  </h1>
                  {headerSubtitle ? (
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500 sm:text-sm">
                      {headerSubtitle}
                    </p>
                  ) : null}
                </div>
              </button>

              <button
                type="button"
                onPointerDown={() => prefetchUserCommunity(Boolean(firebaseAuthUser))}
                onClick={() => setIsMobileMenuOpen(true)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden"
                aria-label="메뉴 열기"
                aria-expanded={isMobileMenuOpen}
              >
                <Menu size={23} />
              </button>
            </div>

            <nav
              ref={communityMenuRef}
              className="relative hidden w-full flex-wrap items-center justify-end gap-5 lg:flex lg:w-auto lg:gap-12 xl:gap-14"
            >
              <button
                type="button"
                onClick={() => goToProtectedUserTab('rental')}
                className={`rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                  userTab === 'rental'
                    ? 'bg-orange-50 font-semibold mk-brand-text'
                    : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                대여신청
              </button>

              <div
                className="relative"
                onPointerEnter={() => normalizedSiteSettings.memberRentalStatusEnabled !== false && setIsRentalStatusMenuOpen(true)}
                onPointerLeave={() => setIsRentalStatusMenuOpen(false)}
                onFocus={() => normalizedSiteSettings.memberRentalStatusEnabled !== false && setIsRentalStatusMenuOpen(true)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setIsRentalStatusMenuOpen(false);
                }}
              >
                <button
                  type="button"
                  onClick={() => goToProtectedUserTab('history')}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                    ['history', 'rentalStatus'].includes(userTab) || isRentalStatusMenuOpen
                      ? 'bg-orange-50 font-semibold mk-brand-text'
                      : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                  aria-haspopup={normalizedSiteSettings.memberRentalStatusEnabled !== false ? 'menu' : undefined}
                  aria-expanded={normalizedSiteSettings.memberRentalStatusEnabled !== false ? isRentalStatusMenuOpen : undefined}
                >
                  대여현황
                </button>

                <AnimatePresence>
                  {normalizedSiteSettings.memberRentalStatusEnabled !== false && isRentalStatusMenuOpen ? (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      className="absolute left-0 top-full z-40 mt-2 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsRentalStatusMenuOpen(false);
                          goToProtectedUserTab('history');
                        }}
                        className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                          userTab === 'history' ? 'bg-orange-50 mk-brand-text' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        나의 신청내역
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsRentalStatusMenuOpen(false);
                          goToProtectedUserTab('rentalStatus');
                        }}
                        className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                          userTab === 'rentalStatus' ? 'bg-orange-50 mk-brand-text' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        전체 대여현황
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onPointerEnter={() => prefetchUserCommunity(Boolean(firebaseAuthUser))}
                  onFocus={() => prefetchUserCommunity(Boolean(firebaseAuthUser))}
                  onClick={() => {
                    prefetchUserCommunity(Boolean(firebaseAuthUser));
                    setIsCommunityMenuOpen((prev) => !prev);
                  }}
                  className={`rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                    ['notice', 'faq', 'inquiry'].includes(userTab) || isCommunityMenuOpen
                      ? 'bg-orange-50 font-semibold mk-brand-text'
                      : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  커뮤니티
                </button>

                <AnimatePresence>
                  {isCommunityMenuOpen ? (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      className="absolute left-0 top-full z-40 mt-2 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={goToUserNotice}
                        onPointerEnter={prefetchUserNotice}
                        onFocus={prefetchUserNotice}
                        className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                          userTab === 'notice'
                            ? 'bg-orange-50 mk-brand-text'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        공지사항
                      </button>
                      <button
                        type="button"
                        onClick={goToUserFaq}
                        onPointerEnter={prefetchUserFaq}
                        onFocus={prefetchUserFaq}
                        className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                          userTab === 'faq'
                            ? 'bg-orange-50 mk-brand-text'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        FAQ
                      </button>
                      <button
                        type="button"
                        onClick={goToUserInquiry}
                        onPointerEnter={() => prefetchUserInquiry(Boolean(firebaseAuthUser))}
                        onFocus={() => prefetchUserInquiry(Boolean(firebaseAuthUser))}
                        className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                          userTab === 'inquiry'
                            ? 'bg-orange-50 mk-brand-text'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        문의하기
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-2">
                {firebaseAuthUser ? (
                  <>
                    {!currentAuthRoleErrorMessage ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={goToUserMypage}
                        className="px-3 py-2 text-xs"
                      >
                        <UserCircle size={14} />
                        마이페이지
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={logoutUser}
                      disabled={userAuthLoading || !firebaseAuthReady}
                      className="px-3 py-2 text-xs"
                    >
                      <LogOut size={14} />
                      로그아웃
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goToUserSignup}
                      disabled={userAuthLoading || !firebaseAuthReady}
                      className="px-3 py-2 text-xs"
                    >
                      <UserPlus size={14} />
                      회원가입
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goToUserLogin}
                      disabled={userAuthLoading || !firebaseAuthReady}
                      className="px-3 py-2 text-xs"
                    >
                      <LogIn size={14} />
                      로그인
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        </header>

        <div
          className={`fixed inset-0 z-[65] lg:hidden ${
            isMobileMenuOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
          }`}
          aria-hidden={!isMobileMenuOpen}
        >
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`absolute inset-0 bg-slate-950/45 transition-opacity duration-300 ${
              isMobileMenuOpen ? 'opacity-100' : 'opacity-0'
            }`}
            aria-label="메뉴 닫기"
            tabIndex={isMobileMenuOpen ? 0 : -1}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="모바일 메뉴"
            className={`absolute inset-y-0 right-0 flex w-[min(86vw,360px)] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
              isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="text-base font-black text-slate-900">메뉴</div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100"
                aria-label="메뉴 닫기"
              >
                <X size={22} />
              </button>
            </div>

            <div className="border-b border-slate-200 p-4">
              {firebaseAuthUser ? (
                <div className="grid grid-cols-2 gap-2">
                  {!currentAuthRoleErrorMessage ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => runMobileNavigation(goToUserMypage)}
                      className="w-full justify-center px-3 py-2.5 text-xs"
                    >
                      <UserCircle size={15} />
                      마이페이지
                    </Button>
                  ) : <div />}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runMobileNavigation(logoutUser)}
                    disabled={userAuthLoading || !firebaseAuthReady}
                    className="w-full justify-center px-3 py-2.5 text-xs"
                  >
                    <LogOut size={15} />
                    로그아웃
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runMobileNavigation(goToUserSignup)}
                    disabled={userAuthLoading || !firebaseAuthReady}
                    className="w-full justify-center px-3 py-2.5 text-xs"
                  >
                    <UserPlus size={15} />
                    회원가입
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runMobileNavigation(goToUserLogin)}
                    disabled={userAuthLoading || !firebaseAuthReady}
                    className="w-full justify-center px-3 py-2.5 text-xs"
                  >
                    <LogIn size={15} />
                    로그인
                  </Button>
                </div>
              )}
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="모바일 사용자 메뉴">
              <button
                type="button"
                onClick={() => runMobileNavigation(() => goToProtectedUserTab('rental'))}
                className={`block w-full rounded-xl px-4 py-3.5 text-left text-sm font-bold transition ${
                  userTab === 'rental' ? 'bg-orange-50 mk-brand-text' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                대여신청
              </button>
              <button
                type="button"
                onClick={() => setIsMobileRentalStatusOpen((prev) => !prev)}
                className={`mt-1 flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left text-sm font-bold transition ${
                  ['history', 'rentalStatus'].includes(userTab)
                    ? 'bg-orange-50 mk-brand-text'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
                aria-expanded={isMobileRentalStatusOpen}
              >
                <span>대여현황</span>
                <ChevronDown size={17} className={`transition-transform ${isMobileRentalStatusOpen ? 'rotate-180' : ''}`} />
              </button>
              {isMobileRentalStatusOpen ? (
                <div className="mt-1 space-y-1 border-l-2 border-orange-100 pl-3">
                  <button
                    type="button"
                    onClick={() => runMobileNavigation(() => goToProtectedUserTab('history'))}
                    className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                      userTab === 'history' ? 'bg-orange-50 mk-brand-text' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    나의 신청내역
                  </button>
                  {normalizedSiteSettings.memberRentalStatusEnabled !== false ? (
                    <button
                      type="button"
                      onClick={() => runMobileNavigation(() => goToProtectedUserTab('rentalStatus'))}
                      className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                        userTab === 'rentalStatus' ? 'bg-orange-50 mk-brand-text' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      전체 대여현황
                    </button>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onPointerDown={() => prefetchUserCommunity(Boolean(firebaseAuthUser))}
                onClick={() => {
                  prefetchUserCommunity(Boolean(firebaseAuthUser));
                  setIsMobileCommunityOpen((prev) => !prev);
                }}
                className={`mt-1 flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left text-sm font-bold transition ${
                  ['notice', 'faq', 'inquiry'].includes(userTab)
                    ? 'bg-orange-50 mk-brand-text'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
                aria-expanded={isMobileCommunityOpen}
              >
                <span>커뮤니티</span>
                <ChevronDown size={17} className={`transition-transform ${isMobileCommunityOpen ? 'rotate-180' : ''}`} />
              </button>

              {isMobileCommunityOpen ? (
                <div className="mt-1 space-y-1 border-l-2 border-orange-100 pl-3">
                  <button
                    type="button"
                    onClick={() => runMobileNavigation(goToUserNotice)}
                    onPointerEnter={prefetchUserNotice}
                    onFocus={prefetchUserNotice}
                    className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                      userTab === 'notice' ? 'bg-orange-50 mk-brand-text' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    공지사항
                  </button>
                  <button
                    type="button"
                    onClick={() => runMobileNavigation(goToUserFaq)}
                    onPointerEnter={prefetchUserFaq}
                    onFocus={prefetchUserFaq}
                    className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                      userTab === 'faq' ? 'bg-orange-50 mk-brand-text' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    FAQ
                  </button>
                  <button
                    type="button"
                    onClick={() => runMobileNavigation(goToUserInquiry)}
                    onPointerEnter={() => prefetchUserInquiry(Boolean(firebaseAuthUser))}
                    onFocus={() => prefetchUserInquiry(Boolean(firebaseAuthUser))}
                    className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                      userTab === 'inquiry' ? 'bg-orange-50 mk-brand-text' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    문의하기
                  </button>
                </div>
              ) : null}
            </nav>
          </aside>
        </div>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-8">
          {shouldShowStats ? (
            <DevRenderProfiler id="User:RentalStatusBoard">
              <RentalStatusBoard
                stats={stats}
                loading={statsLoading}
                className="mb-6 sm:mb-8"
              />
            </DevRenderProfiler>
          ) : null}

          <DevRenderProfiler id="UserWorkspace">
            <UserRuntimeErrorBoundary
              resetKey={`${userTab}:${firebaseAuthUser?.uid || firebaseAuthUser?.id || ''}`}
              onRecover={goToAppHome}
            >
              <UserWorkspace
                ctx={contextGroups.user.shell}
                panelCtx={contextGroups.user[userPanelContextKey]}
              />
            </UserRuntimeErrorBoundary>
          </DevRenderProfiler>
        </main>

        <DevRenderProfiler id="User:Footer">
          <MemoizedUserFooter ctx={contextGroups.app.footer} />
        </DevRenderProfiler>

        {shouldRenderAppDialogs ? (
          <React.Suspense fallback={null}>
            <DevRenderProfiler id="User:Dialogs">
              <MemoizedUserDialogs ctx={contextGroups.app.dialogs} />
            </DevRenderProfiler>
          </React.Suspense>
        ) : null}

        {shouldMountUserPopupLayer ? (
          <React.Suspense fallback={null}>
            <DevRenderProfiler id="User:PopupLayer">
              <MemoizedUserPopupLayer ctx={contextGroups.app.popup} />
            </DevRenderProfiler>
          </React.Suspense>
        ) : null}

        {import.meta.env.DEV ? (
          <React.Suspense fallback={null}>
            <DevPerformancePanel />
          </React.Suspense>
        ) : null}
      </div>

      {showDataLoadingOverlay ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/10 px-6 font-sans text-slate-900 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl mk-brand-gradient-tr text-white mk-brand-shadow-md">
              {normalizedSiteSettings.logoMode === 'image' &&
              normalizedSiteSettings.logoImageUrl ? (
                <img
                  src={normalizedSiteSettings.logoImageUrl}
                  alt={normalizedSiteSettings.logoAltText}
                  className="h-8 max-w-[120px] object-contain"
                />
              ) : (
                <Laptop size={24} />
              )}
            </div>
            <h1 className="text-base font-bold text-slate-900">
              데이터를 불러오는 중입니다.
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              PostgreSQL 운영 DB 기준으로 데이터를 불러오고 있습니다. 잠시만 기다려 주십시오.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default React.memo(UserShell);
