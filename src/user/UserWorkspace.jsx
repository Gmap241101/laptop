import { lazy, Suspense } from 'react';
import UserHomePanel from './UserHomePanel.jsx';

const UserAuthPanel = lazy(() => import('./UserAuthPanel.jsx'));
const UserAccountStatusPanel = lazy(() => import('./UserAccountStatusPanel.jsx'));
const UserBoardPanel = lazy(() => import('./UserBoardPanel.jsx'));
const UserMyPagePanel = lazy(() => import('./UserMyPagePanel.jsx'));
const UserRentalPanel = lazy(() => import('./UserRentalPanel.jsx'));
const UserRequestHistoryPanel = lazy(() => import('./UserRequestHistoryPanel.jsx'));
const UserFooterPagePanel = lazy(() => import('./UserFooterPagePanel.jsx'));

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

export default function UserWorkspace({ ctx }) {
  const {
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    hasFirebaseAuthSession,
    isUserDirectoryAccessRestricted,
    userTab,
  } = ctx;

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
    return renderLazyPanel(<UserAuthPanel ctx={{ ...ctx, userTab: 'login' }} />);
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

  if (isProtectedUserTab && hasFirebaseAuthSession && isUserDirectoryAccessRestricted) {
    return renderLazyPanel(<UserMyPagePanel ctx={ctx} />);
  }

  if (userTab === 'home') return <UserHomePanel ctx={ctx} />;
  if (userTab === 'rental') return renderLazyPanel(<UserRentalPanel ctx={ctx} />);
  if (userTab === 'mypage') return renderLazyPanel(<UserMyPagePanel ctx={ctx} />);

  if (['login', 'signup', 'findEmail', 'resetPassword'].includes(userTab)) {
    return renderLazyPanel(<UserAuthPanel ctx={ctx} />);
  }

  if (userTab === 'accountStatus') {
    return renderLazyPanel(<UserAccountStatusPanel ctx={ctx} />);
  }

  if (userTab === 'history') {
    return renderLazyPanel(<UserRequestHistoryPanel ctx={ctx} />);
  }

  if (userTab === 'footerPage') {
    return renderLazyPanel(<UserFooterPagePanel ctx={ctx} />);
  }

  return renderLazyPanel(<UserBoardPanel ctx={ctx} />);
}
