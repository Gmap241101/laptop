import UserAuthPanel from './UserAuthPanel.jsx';
import UserBoardPanel from './UserBoardPanel.jsx';
import UserMyPagePanel from './UserMyPagePanel.jsx';
import UserRentalPanel from './UserRentalPanel.jsx';
import UserRequestHistoryPanel from './UserRequestHistoryPanel.jsx';
import UserFooterPagePanel from './UserFooterPagePanel.jsx';

export default function UserWorkspace({ ctx }) {
  const { userTab } = ctx;

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
