import { lazy, memo, Suspense, useMemo, useState } from 'react';
import DevRenderProfiler from '../performance/DevRenderProfiler.jsx';
import { PROTECTED_USER_TABS } from '../routing/appRoutes.js';
import UserHomePanel from './UserHomePanel.jsx';
import useUserTermsCompliance from '../features/terms/useUserTermsCompliance.js';

const UserAuthPanel = memo(lazy(() => import('./UserAuthPanel.jsx')));
const UserAccountStatusPanel = memo(
  lazy(() => import('./UserAccountStatusPanel.jsx'))
);
const UserBoardPanel = memo(lazy(() => import('./UserBoardPanel.jsx')));
const UserInquiryPanel = memo(lazy(() => import('./UserInquiryPanel.jsx')));
const UserMyPagePanel = memo(lazy(() => import('./UserMyPagePanel.jsx')));
const UserRentalPanel = memo(lazy(() => import('./UserRentalPanel.jsx')));
const UserRentalStatusPanel = memo(lazy(() => import('./UserRentalStatusPanel.jsx')));
const UserRequestHistoryPanel = memo(
  lazy(() => import('./UserRequestHistoryPanel.jsx'))
);
const UserFooterPagePanel = memo(
  lazy(() => import('./UserFooterPagePanel.jsx'))
);
const UserTermsConsentPanel = memo(
  lazy(() => import('./UserTermsConsentPanel.jsx'))
);
const MemoizedUserHomePanel = memo(UserHomePanel);

const renderProfiledPanel = (id, panel, { lazyPanel = true } = {}) => {
  const content = lazyPanel ? (
    <Suspense fallback={null}>{panel}</Suspense>
  ) : (
    panel
  );

  return (
    <DevRenderProfiler id={`UserPanel:${id}`}>
      {content}
    </DevRenderProfiler>
  );
};

function UserWorkspace({ ctx, panelCtx }) {
  const {
    Button,
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    hasFirebaseAuthSession,
    isUserDirectoryAccessRestricted,
    triggerToast,
    userProfile,
    userProfileReady,
    userTab,
  } = ctx;

  const protectedLoginContext = useMemo(
    () => ({ ...panelCtx, userTab: 'login' }),
    [panelCtx]
  );
  const isProtectedUserTab = PROTECTED_USER_TABS.has(userTab);
  const [termsComplianceRefreshKey, setTermsComplianceRefreshKey] = useState(0);
  const termsCompliance = useUserTermsCompliance({
    account: userProfile,
    enabled: isProtectedUserTab && hasFirebaseAuthSession && firebaseAuthReady,
    refreshKey: termsComplianceRefreshKey,
  });

  if (isProtectedUserTab && (!firebaseAuthReady || !currentAuthRoleReady)) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <div className="text-sm font-bold text-slate-900">
          로그인 상태를 확인하는 중입니다.
        </div>
        <p className="mt-2 text-xs text-slate-500">
          확인이 완료되면 요청한 화면으로 이동합니다.
        </p>
      </div>
    );
  }

  if (isProtectedUserTab && !hasFirebaseAuthSession) {
    return renderProfiledPanel(
      'login',
      <UserAuthPanel ctx={protectedLoginContext} />
    );
  }

  if (isProtectedUserTab && hasFirebaseAuthSession && !firebaseAuthUser) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <div className="text-sm font-bold text-slate-900">
          로그인 정보를 적용하는 중입니다.
        </div>
        <p className="mt-2 text-xs text-slate-500">
          잠시 후 요청한 화면이 표시됩니다.
        </p>
      </div>
    );
  }

  if (
    isProtectedUserTab &&
    hasFirebaseAuthSession &&
    isUserDirectoryAccessRestricted
  ) {
    return renderProfiledPanel(
      'mypage',
      <UserMyPagePanel ctx={panelCtx} />
    );
  }

  if (
    isProtectedUserTab &&
    hasFirebaseAuthSession &&
    (!userProfileReady || !termsCompliance.ready)
  ) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <div className="text-sm font-bold text-slate-900">약관 적용 상태를 확인하는 중입니다.</div>
        <p className="mt-2 text-xs text-slate-500">확인이 완료되면 요청한 화면으로 이동합니다.</p>
      </div>
    );
  }

  if (isProtectedUserTab && hasFirebaseAuthSession && termsCompliance.errorMessage) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-center shadow-sm">
        <div className="text-sm font-bold text-rose-900">약관 적용 상태를 확인하지 못했습니다.</div>
        <p className="mt-2 text-xs text-rose-700">{termsCompliance.errorMessage}</p>
      </div>
    );
  }

  if (isProtectedUserTab && hasFirebaseAuthSession && termsCompliance.consentRequired) {
    return renderProfiledPanel(
      'terms-reconsent',
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-slate-50/60 p-5 shadow-sm">
        <UserTermsConsentPanel
          account={userProfile}
          Button={Button}
          triggerToast={triggerToast}
          mode="gate"
          initialPolicy={termsCompliance.policy}
          onCompleted={(revision) => {
            termsCompliance.markConsentRevision(revision);
            setTermsComplianceRefreshKey((current) => current + 1);
          }}
        />
      </div>
    );
  }

  if (userTab === 'home') {
    return renderProfiledPanel(
      'home',
      <MemoizedUserHomePanel ctx={panelCtx} />,
      { lazyPanel: false }
    );
  }
  if (userTab === 'rental') {
    return renderProfiledPanel(
      'rental',
      <UserRentalPanel ctx={panelCtx} />
    );
  }
  if (userTab === 'rentalStatus') {
    return renderProfiledPanel(
      'rentalStatus',
      <UserRentalStatusPanel ctx={panelCtx} />
    );
  }
  if (userTab === 'mypage') {
    return renderProfiledPanel(
      'mypage',
      <UserMyPagePanel ctx={panelCtx} />
    );
  }

  if (['login', 'signup', 'findEmail', 'resetPassword'].includes(userTab)) {
    return renderProfiledPanel(
      userTab,
      <UserAuthPanel ctx={panelCtx} />
    );
  }

  if (userTab === 'accountStatus') {
    return renderProfiledPanel(
      'accountStatus',
      <UserAccountStatusPanel ctx={panelCtx} />
    );
  }

  if (userTab === 'history') {
    return renderProfiledPanel(
      'history',
      <UserRequestHistoryPanel ctx={panelCtx} />
    );
  }

  if (userTab === 'footerPage') {
    return renderProfiledPanel(
      'footerPage',
      <UserFooterPagePanel ctx={panelCtx} />
    );
  }

  if (userTab === 'inquiry') {
    return renderProfiledPanel(
      'inquiry',
      <UserInquiryPanel ctx={panelCtx} />
    );
  }

  return renderProfiledPanel(
    `board-${userTab}`,
    <UserBoardPanel ctx={panelCtx} />
  );
}

export default memo(UserWorkspace);
