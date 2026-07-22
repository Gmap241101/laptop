import UserAuthPanel from './UserAuthPanel.jsx';
import UserBoardPanel from './UserBoardPanel.jsx';
import UserMyPagePanel from './UserMyPagePanel.jsx';
import UserRentalPanel from './UserRentalPanel.jsx';
import UserRequestHistoryPanel from './UserRequestHistoryPanel.jsx';
import UserFooterPagePanel from './UserFooterPagePanel.jsx';
import UserHomePanel from './UserHomePanel.jsx';

export default function UserWorkspace({ ctx }) {
  const {
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    hasFirebaseAuthSession,
    userTab,
  } = ctx;

  const isProtectedUserTab = [
    'rental',
    'history',
  ].includes(userTab);

  if (
    isProtectedUserTab &&
    (!firebaseAuthReady ||
      !currentAuthRoleReady)
  ) {
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

  if (
    isProtectedUserTab &&
    !hasFirebaseAuthSession
  ) {
    return (
      <UserAuthPanel
        ctx={{ ...ctx, userTab: 'login' }}
      />
    );
  }

  if (
    isProtectedUserTab &&
    hasFirebaseAuthSession &&
    !firebaseAuthUser
  ) {
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

  if (userTab === 'home') {
    return <UserHomePanel ctx={ctx} />;
  }

  if (userTab === 'rental') {
    return <UserRentalPanel ctx={ctx} />;
  }

  if (userTab === 'mypage') {
    return <UserMyPagePanel ctx={ctx} />;
  }

  if (['login', 'signup'].includes(userTab)) {
    return <UserAuthPanel ctx={ctx} />;
  }

  if (userTab === 'history') {
    return <UserRequestHistoryPanel ctx={ctx} />;
  }

  if (userTab === 'footerPage') {
    return <UserFooterPagePanel ctx={ctx} />;
  }

  return <UserBoardPanel ctx={ctx} />;
}
