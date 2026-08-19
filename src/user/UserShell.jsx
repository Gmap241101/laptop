import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Laptop, LogIn, LogOut, UserCircle, UserPlus, X } from 'lucide-react';

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
  const showDataLoadingOverlay = userTab !== 'home' && !firebaseReady;
  const headerSubtitle = getHeaderSubtitle(normalizedSiteSettings);
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
            <button
              type="button"
              onClick={goToAppHome}
              className="flex min-w-0 shrink-0 items-center gap-3.5 text-left sm:gap-4"
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

            <nav
              ref={communityMenuRef}
              className="relative flex w-full flex-wrap items-center justify-end gap-5 sm:gap-8 lg:w-auto lg:gap-12 xl:gap-14"
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

              <button
                type="button"
                onClick={() => goToProtectedUserTab('history')}
                className={`rounded-lg px-2.5 py-2 text-[15px] transition sm:px-3 sm:text-base lg:px-4 lg:text-lg ${
                  userTab === 'history'
                    ? 'bg-orange-50 font-semibold mk-brand-text'
                    : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                신청내역
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsCommunityMenuOpen((prev) => !prev)}
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
