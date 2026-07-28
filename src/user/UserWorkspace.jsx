import { lazy, memo, Suspense, useMemo } from 'react';
import DevRenderProfiler from '../performance/DevRenderProfiler.jsx';
import UserHomePanel from './UserHomePanel.jsx';

const UserAuthPanel = memo(lazy(() => import('./UserAuthPanel.jsx')));
const UserAccountStatusPanel = memo(
  lazy(() => import('./UserAccountStatusPanel.jsx'))
);
const UserBoardPanel = memo(lazy(() => import('./UserBoardPanel.jsx')));
const UserMyPagePanel = memo(lazy(() => import('./UserMyPagePanel.jsx')));
const UserRentalPanel = memo(lazy(() => import('./UserRentalPanel.jsx')));
const UserRequestHistoryPanel = memo(
  lazy(() => import('./UserRequestHistoryPanel.jsx'))
);
const UserFooterPagePanel = memo(
  lazy(() => import('./UserFooterPagePanel.jsx'))
);
const MemoizedUserHomePanel = memo(UserHomePanel);

const UserPanelLoading = () => (
  <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
    <div className="text-sm font-bold text-slate-900">
      화면을 불러오는 중입니다.
    </div>
    <p className="mt-2 text-xs text-slate-500">
      잠시 후 요청한 화면이 표시됩니다.
    </p>
  </div>
);

const renderProfiledPanel = (id, panel, { lazyPanel = true } = {}) => {
  const content = lazyPanel ? (
    <Suspense fallback={<UserPanelLoading />}>{panel}</Suspense>
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
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    hasFirebaseAuthSession,
    isUserDirectoryAccessRestricted,
    userTab,
  } = ctx;

  const protectedLoginContext = useMemo(
    () => ({ ...panelCtx, userTab: 'login' }),
    [panelCtx]
  );
  const isProtectedUserTab = ['rental', 'history'].includes(userTab);

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

  return renderProfiledPanel(
    `board-${userTab}`,
    <UserBoardPanel ctx={panelCtx} />
  );
}

export default memo(UserWorkspace);
