import { lazy, memo, Suspense, useMemo } from 'react';
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

const renderLazyPanel = (panel) => (
  <Suspense fallback={<UserPanelLoading />}>{panel}</Suspense>
);

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
    return renderLazyPanel(<UserAuthPanel ctx={protectedLoginContext} />);
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
    return renderLazyPanel(<UserMyPagePanel ctx={panelCtx} />);
  }

  if (userTab === 'home') {
    return <MemoizedUserHomePanel ctx={panelCtx} />;
  }
  if (userTab === 'rental') {
    return renderLazyPanel(<UserRentalPanel ctx={panelCtx} />);
  }
  if (userTab === 'mypage') {
    return renderLazyPanel(<UserMyPagePanel ctx={panelCtx} />);
  }

  if (['login', 'signup', 'findEmail', 'resetPassword'].includes(userTab)) {
    return renderLazyPanel(<UserAuthPanel ctx={panelCtx} />);
  }

  if (userTab === 'accountStatus') {
    return renderLazyPanel(<UserAccountStatusPanel ctx={panelCtx} />);
  }

  if (userTab === 'history') {
    return renderLazyPanel(<UserRequestHistoryPanel ctx={panelCtx} />);
  }

  if (userTab === 'footerPage') {
    return renderLazyPanel(<UserFooterPagePanel ctx={panelCtx} />);
  }

  return renderLazyPanel(<UserBoardPanel ctx={panelCtx} />);
}

export default memo(UserWorkspace);
