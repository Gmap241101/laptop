export const USER_ROUTE_PATHS = {
  home: '',
  rental: '/rental',
  history: '/history',
  notice: '/board/notice',
  faq: '/board/faq',
  login: '/login',
  signup: '/signup',
  findEmail: '/find-email',
  resetPassword: '/reset-password',
  accountStatus: '/account-status',
  mypage: '/mypage',
};

export const USER_LOGIN_RETURN_TARGET_SESSION_KEY =
  'mk_laptop_login_return_target';

export const USER_ACCOUNT_STATUS_SESSION_KEY =
  'mk_laptop_user_account_status';

export const readUserAccountStatusView = () => {
  if (typeof window === 'undefined') return { type: 'loginRetired' };

  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(USER_ACCOUNT_STATUS_SESSION_KEY) || 'null'
    );

    return parsed && typeof parsed.type === 'string'
      ? parsed
      : { type: 'loginRetired' };
  } catch (error) {
    return { type: 'loginRetired' };
  }
};

export const writeUserAccountStatusView = (nextView) => {
  if (typeof window === 'undefined') return;

  window.sessionStorage.setItem(
    USER_ACCOUNT_STATUS_SESSION_KEY,
    JSON.stringify(nextView || { type: 'loginRetired' })
  );
};

export const PROTECTED_USER_TABS = new Set([
  'rental',
  'history',
]);

export const LOGIN_RETURN_USER_TABS = new Set([
  'home',
  'rental',
  'history',
  'notice',
  'faq',
  'footerPage',
  'mypage',
]);

export const normalizeUserLoginReturnTarget = (
  target
) => {
  if (!target || typeof target !== 'object') {
    return null;
  }

  const userTab = String(
    target.userTab || ''
  ).trim();

  if (!LOGIN_RETURN_USER_TABS.has(userTab)) {
    return null;
  }

  const routeId =
    userTab === 'footerPage'
      ? String(target.routeId || '').trim()
      : '';

  if (userTab === 'footerPage' && !routeId) {
    return null;
  }

  return {
    userTab,
    routeId,
    noticePostId:
      userTab === 'notice'
        ? String(
            target.noticePostId || ''
          ).trim()
        : '',
  };
};

export const readUserLoginReturnTarget = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return normalizeUserLoginReturnTarget(
      JSON.parse(
        window.sessionStorage.getItem(
          USER_LOGIN_RETURN_TARGET_SESSION_KEY
        ) || 'null'
      )
    );
  } catch (error) {
    console.error(
      'User login return target read error:',
      error
    );
    return null;
  }
};

export const writeUserLoginReturnTarget = (
  target
) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const normalizedTarget =
    normalizeUserLoginReturnTarget(target);

  if (!normalizedTarget) {
    window.sessionStorage.removeItem(
      USER_LOGIN_RETURN_TARGET_SESSION_KEY
    );
    return null;
  }

  window.sessionStorage.setItem(
    USER_LOGIN_RETURN_TARGET_SESSION_KEY,
    JSON.stringify(normalizedTarget)
  );

  return normalizedTarget;
};

export const clearUserLoginReturnTarget = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(
    USER_LOGIN_RETURN_TARGET_SESSION_KEY
  );
};

export const getNormalizedPathname = () => {
  if (typeof window === 'undefined') return '/';

  const pathname = window.location.pathname.replace(/\/+$/, '');

  return pathname || '/';
};

export const getRouteStateFromPath = () => {
  const pathname = getNormalizedPathname();

  if (pathname === '/') {
    return { view: 'user', userTab: 'home' };
  }

  if (pathname === '/admin') {
    return { view: 'admin', userTab: 'home' };
  }

  if (pathname === '/rental') {
    return { view: 'user', userTab: 'rental' };
  }

  if (pathname === '/history') {
    return { view: 'user', userTab: 'history' };
  }

  if (pathname === '/login') {
    return { view: 'user', userTab: 'login' };
  }

  if (pathname === '/signup') {
    return { view: 'user', userTab: 'signup' };
  }

  if (pathname === '/find-email') {
    return { view: 'user', userTab: 'findEmail' };
  }

  if (pathname === '/reset-password') {
    return { view: 'user', userTab: 'resetPassword' };
  }

  if (pathname === '/account-status') {
    return { view: 'user', userTab: 'accountStatus' };
  }

  if (pathname === '/mypage') {
    return { view: 'user', userTab: 'mypage' };
  }

  if (pathname === '/board') {
    return {
      view: 'user',
      userTab: 'notice',
      redirectTo: '/board/notice',
    };
  }

  if (pathname === '/board/notice') {
    return { view: 'user', userTab: 'notice' };
  }

  if (pathname === '/board/faq') {
    return { view: 'user', userTab: 'faq' };
  }

  if (pathname.startsWith('/info/')) {
    const footerPageId = decodeURIComponent(pathname.slice('/info/'.length));
    if (footerPageId) {
      return { view: 'user', userTab: 'footerPage', footerPageId };
    }
  }

  return { view: 'user', userTab: 'notFound', footerPageId: '' };
};

export const getInitialViewFromPath = () => getRouteStateFromPath().view;

export const getInitialUserTabFromPath = () => getRouteStateFromPath().userTab;
export const getInitialFooterPageIdFromPath = () => getRouteStateFromPath().footerPageId || '';

export const getAppPath = (
  nextView,
  nextUserTab = 'home',
  routeId = ''
) => {
  const routeSuffix =
    nextView === 'admin'
      ? '/admin'
      : nextUserTab === 'footerPage' && routeId
        ? `/info/${encodeURIComponent(routeId)}`
        : USER_ROUTE_PATHS[nextUserTab] || '';

  return routeSuffix || '/';
};

export const pushAppPath = (nextView, nextUserTab = 'home', routeId = '') => {
  if (typeof window === 'undefined') return;

  const nextPath = getAppPath(
    nextView,
    nextUserTab,
    routeId
  );

  if (window.location.pathname !== nextPath) {
    window.history.pushState(null, '', nextPath);
  }
};

export const replaceAppPath = (
  nextView,
  nextUserTab = 'home',
  routeId = ''
) => {
  if (typeof window === 'undefined') return;

  const nextPath = getAppPath(
    nextView,
    nextUserTab,
    routeId
  );

  if (window.location.pathname !== nextPath) {
    window.history.replaceState(
      null,
      '',
      nextPath
    );
  }
};
