import React from 'react';
import { Laptop } from 'lucide-react';

import { Button, Card, CardContent } from '../components/CommonUI.jsx';
import RentalStatusBoard from '../components/RentalStatusBoard.jsx';
import DevRenderProfiler from '../performance/DevRenderProfiler.jsx';
import { getHeaderSubtitle } from '../utils/systemSettings.js';

const AdminWorkspace = React.lazy(() => import('./AdminWorkspace.jsx'));
const AdminDialogs = React.lazy(() => import('./AdminDialogs.jsx'));
const DevPerformancePanel = React.lazy(() =>
  import('../performance/DevPerformancePanel.jsx')
);

const AdminWorkspaceFallback = () => (
  <Card className="mx-auto max-w-xl border-slate-200 bg-white shadow-sm">
    <CardContent className="p-8 text-center">
      <div className="text-sm font-bold text-slate-700">
        관리자 화면을 불러오는 중입니다.
      </div>
      <div className="mt-2 text-xs text-slate-500">
        관리자 전용 모듈을 불러오고 있습니다.
      </div>
    </CardContent>
  </Card>
);

const AdminShell = ({
  adminLogoutInProgress,
  adminPanelContextKey,
  authenticatedAdminAccount,
  contextGroups,
  firebaseAuthReady,
  goToAdminHome,
  goToUserMypage,
  isAdminAuthenticated,
  logoutAdmin,
  normalizedSiteSettings,
  shouldRenderAdminDialogs,
  shouldShowStats,
  stats,
  statsLoading,
}) => {
  const headerSubtitle = getHeaderSubtitle(normalizedSiteSettings);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 font-sans antialiased transition duration-200">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            onClick={goToAdminHome}
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

          <div className="flex w-fit items-center gap-2">
            {isAdminAuthenticated && authenticatedAdminAccount ? (
              <div className="hidden rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 sm:block">
                {authenticatedAdminAccount.adminLoginId} 인증됨
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
              관리자 모드
            </div>

            {isAdminAuthenticated ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToUserMypage}
                  className="px-3 py-2 text-xs"
                >
                  마이페이지
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={logoutAdmin}
                  disabled={adminLogoutInProgress || !firebaseAuthReady}
                  className="px-3 py-2 text-xs"
                >
                  {adminLogoutInProgress ? '로그아웃 중...' : '로그아웃'}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {shouldShowStats ? (
          <DevRenderProfiler id="Admin:RentalStatusBoard">
            <RentalStatusBoard
              stats={stats}
              loading={statsLoading}
              className="mb-6 sm:mb-8"
            />
          </DevRenderProfiler>
        ) : null}

        <React.Suspense fallback={<AdminWorkspaceFallback />}>
          <DevRenderProfiler id="AdminWorkspace">
            <AdminWorkspace
              ctx={contextGroups.admin.shell}
              panelCtx={contextGroups.admin[adminPanelContextKey]}
            />
          </DevRenderProfiler>
        </React.Suspense>
      </main>

      {shouldRenderAdminDialogs ? (
        <React.Suspense fallback={null}>
          <DevRenderProfiler id="Admin:Dialogs">
            <AdminDialogs ctx={contextGroups.app.dialogs} />
          </DevRenderProfiler>
        </React.Suspense>
      ) : null}

      {import.meta.env.DEV ? (
        <React.Suspense fallback={null}>
          <DevPerformancePanel />
        </React.Suspense>
      ) : null}
    </div>
  );
};

export default React.memo(AdminShell);
