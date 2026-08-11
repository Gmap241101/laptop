import { useCallback, useEffect, useRef, useState } from 'react';

import { USER_PROFILE_STATUS } from '../constants/memberConstants.js';
import {
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from '../features/members/memberAccountPolicy.js';
import {
  PROTECTED_USER_TABS,
  clearAdminRouteIntent,
  clearUserLoginReturnTarget,
  getInitialFooterPageIdFromPath,
  getInitialUserTabFromPath,
  getInitialViewFromPath,
  getRouteStateFromPath,
  normalizeUserLoginReturnTarget,
  pushAppPath,
  readUserAccountStatusView,
  readUserLoginReturnTarget,
  replaceAppPath,
  writeUserAccountStatusView,
  writeUserLoginReturnTarget,
} from './appRoutes.js';

export const useAppNavigationState = () => {
  const pendingProtectedUserTabRef = useRef('');
  const communityMenuRef = useRef(null);
  const [view, setView] = useState(getInitialViewFromPath);
  const [userTab, setUserTab] = useState(getInitialUserTabFromPath);
  const [selectedFooterPageId, setSelectedFooterPageId] = useState(
    getInitialFooterPageIdFromPath
  );
  const [isCommunityMenuOpen, setIsCommunityMenuOpen] = useState(false);
  const [userAccountStatusView, setUserAccountStatusView] = useState(
    readUserAccountStatusView
  );

  return {
    communityMenuRef,
    isCommunityMenuOpen,
    pendingProtectedUserTabRef,
    selectedFooterPageId,
    setIsCommunityMenuOpen,
    setSelectedFooterPageId,
    setUserAccountStatusView,
    setUserTab,
    setView,
    userAccountStatusView,
    userTab,
    view,
  };
};

export default function useAppNavigationController({
  adminLogoutInProgress,
  communityMenuRef,
  currentAuthAdminAccount,
  currentAuthRoleReady,
  dataSettings,
  firebaseAuthReady,
  footerPages,
  footerPagesReady,
  hasFirebaseAuthSession,
  isAdminAuthenticated,
  isCommunityMenuOpen,
  pendingProtectedUserTabRef,
  selectedFooterPageId,
  selectedNoticePostId,
  setIsCommunityMenuOpen,
  setSelectedFooterPageId,
  setSelectedNoticePostId,
  setUserAccountStatusView,
  setUserTab,
  setView,
  triggerToast,
  userAuthLoading,
  userProfile,
  userStatusLogoutInProgressRef,
  userTab,
  view,
}) {
  const navigateToUserTab = useCallback(
    (
      nextUserTab,
      {
        noticePostId = '',
        preserveFooterSelection = false,
        preserveNoticeSelection = false,
        replace = false,
        routeId = '',
        scrollBehavior = null,
      } = {}
    ) => {
      const normalizedUserTab = String(nextUserTab || 'home').trim() || 'home';
      const normalizedRouteId =
        normalizedUserTab === 'footerPage'
          ? String(routeId || '').trim()
          : '';
      const normalizedNoticePostId =
        normalizedUserTab === 'notice'
          ? String(noticePostId || '').trim()
          : '';
      const updatePath = replace ? replaceAppPath : pushAppPath;

      updatePath('user', normalizedUserTab, normalizedRouteId);
      setView('user');
      setUserTab(normalizedUserTab);
      if (!preserveFooterSelection) {
        setSelectedFooterPageId(normalizedRouteId);
      }

      if (!preserveNoticeSelection) {
        setSelectedNoticePostId(normalizedNoticePostId);
      }
      setIsCommunityMenuOpen(false);

      if (typeof window !== 'undefined' && scrollBehavior) {
        window.scrollTo({
          top: 0,
          behavior: scrollBehavior,
        });
      }
    },
    [
      setIsCommunityMenuOpen,
      setSelectedFooterPageId,
      setSelectedNoticePostId,
      setUserTab,
      setView,
    ]
  );

  const navigateToAdminHome = useCallback(
    ({ replace = false } = {}) => {
      const updatePath = replace ? replaceAppPath : pushAppPath;

      updatePath('admin');
      setView('admin');
      setIsCommunityMenuOpen(false);
    },
    [setIsCommunityMenuOpen, setView]
  );

  const getCurrentUserLoginReturnTarget = useCallback(() => {
    if (view !== 'user') {
      return null;
    }

    if (userTab === 'login' || userTab === 'signup') {
      return readUserLoginReturnTarget();
    }

    if (userTab === 'notFound') {
      return {
        userTab: 'home',
        routeId: '',
        noticePostId: '',
      };
    }

    return normalizeUserLoginReturnTarget({
      userTab,
      routeId: userTab === 'footerPage' ? selectedFooterPageId : '',
      noticePostId: userTab === 'notice' ? selectedNoticePostId : '',
    });
  }, [selectedFooterPageId, selectedNoticePostId, userTab, view]);

  const saveCurrentUserLoginReturnTarget = useCallback(() => {
    const returnTarget = getCurrentUserLoginReturnTarget();

    if (!returnTarget) {
      return readUserLoginReturnTarget();
    }

    return writeUserLoginReturnTarget(returnTarget);
  }, [getCurrentUserLoginReturnTarget]);

  const navigateToUserReturnTarget = useCallback(
    (rawTarget, { replace = false } = {}) => {
      let target = normalizeUserLoginReturnTarget(rawTarget) || {
        userTab: 'rental',
        routeId: '',
        noticePostId: '',
      };

      if (target.userTab === 'footerPage') {
        const requestedFooterPage = (footerPages || []).find(
          (page) => page.id === target.routeId && page.enabled !== false
        );

        if (footerPagesReady && !requestedFooterPage) {
          target = {
            userTab: 'home',
            routeId: '',
            noticePostId: '',
          };
        }
      }

      navigateToUserTab(target.userTab, {
        noticePostId: target.noticePostId,
        replace,
        routeId: target.routeId,
        scrollBehavior: 'auto',
      });
    },
    [footerPages, footerPagesReady, navigateToUserTab]
  );

  const goToProtectedUserTab = useCallback(
    (nextUserTab) => {
      if (!PROTECTED_USER_TABS.has(nextUserTab)) {
        return;
      }

      if (!firebaseAuthReady || !currentAuthRoleReady) {
        pendingProtectedUserTabRef.current = nextUserTab;
        return;
      }

      pendingProtectedUserTabRef.current = '';

      if (!hasFirebaseAuthSession) {
        writeUserLoginReturnTarget({
          userTab: nextUserTab,
          routeId: '',
          noticePostId: '',
        });
        navigateToUserTab('login', { replace: true });
        return;
      }

      const directoryPolicyEnabled =
        isRegisteredMemberSignupRequired(dataSettings);
      const directoryVersion = getSafeMemberDirectoryVersion(dataSettings);
      const directoryAccessRestricted = Boolean(
        userProfile &&
          (userProfile.status === USER_PROFILE_STATUS.PROFILE_REQUIRED ||
            (directoryPolicyEnabled &&
              userProfile.status === USER_PROFILE_STATUS.ACTIVE &&
              Number(userProfile.directoryVerifiedVersion || 0) !==
                directoryVersion))
      );

      if (directoryAccessRestricted) {
        navigateToUserTab('mypage', { replace: true });
        triggerToast(
          '등록 정보 확인 후 서비스를 이용해 주세요.',
          'error'
        );
        return;
      }

      navigateToUserReturnTarget({
        userTab: nextUserTab,
        routeId: '',
        noticePostId: '',
      });
    },
    [
      currentAuthRoleReady,
      dataSettings,
      firebaseAuthReady,
      hasFirebaseAuthSession,
      navigateToUserReturnTarget,
      navigateToUserTab,
      pendingProtectedUserTabRef,
      triggerToast,
      userProfile,
      view,
    ]
  );

  const clearPendingAndAuthReturnTarget = useCallback(() => {
    pendingProtectedUserTabRef.current = '';

    if (userTab === 'login' || userTab === 'signup') {
      clearUserLoginReturnTarget();
    }
  }, [pendingProtectedUserTabRef, userTab]);

  const goToUserHome = useCallback(() => {
    if (view === 'admin') {
      clearAdminRouteIntent();
    }
    clearPendingAndAuthReturnTarget();
    navigateToUserReturnTarget({
      userTab: 'home',
      routeId: '',
      noticePostId: '',
    });
  }, [clearPendingAndAuthReturnTarget, navigateToUserReturnTarget, view]);

  const goToUserNotice = useCallback(() => {
    clearPendingAndAuthReturnTarget();
    navigateToUserReturnTarget({
      userTab: 'notice',
      routeId: '',
      noticePostId: '',
    });
  }, [clearPendingAndAuthReturnTarget, navigateToUserReturnTarget]);

  const goToUserFaq = useCallback(() => {
    clearPendingAndAuthReturnTarget();
    navigateToUserReturnTarget({
      userTab: 'faq',
      routeId: '',
      noticePostId: '',
    });
  }, [clearPendingAndAuthReturnTarget, navigateToUserReturnTarget]);

  const goToUserMypage = useCallback(() => {
    if (view === 'admin' && isAdminAuthenticated) {
      clearAdminRouteIntent();
    }

    if (currentAuthAdminAccount && !isAdminAuthenticated) {
      navigateToAdminHome();
      triggerToast(
        '관리자 계정은 관리자 모드에서 다시 인증해 주세요.',
        'error'
      );
      return;
    }

    navigateToUserTab('mypage', {
      preserveFooterSelection: true,
      preserveNoticeSelection: true,
    });
  }, [
    currentAuthAdminAccount,
    isAdminAuthenticated,
    navigateToAdminHome,
    navigateToUserTab,
    triggerToast,
    view,
  ]);

  const openFooterPage = useCallback(
    (pageId) => {
      const normalizedPageId = String(pageId || '').trim();
      if (!normalizedPageId) return;

      clearPendingAndAuthReturnTarget();
      navigateToUserTab('footerPage', {
        preserveNoticeSelection: true,
        routeId: normalizedPageId,
        scrollBehavior: 'smooth',
      });
    }, [clearPendingAndAuthReturnTarget, navigateToUserTab]
  );

  const showUserAccountStatus = useCallback(
    (type) => {
      const nextView = { type };
      writeUserAccountStatusView(nextView);
      setUserAccountStatusView(nextView);
      navigateToUserTab('accountStatus', {
        preserveFooterSelection: true,
        preserveNoticeSelection: true,
        replace: true,
      });
    }, [navigateToUserTab, setUserAccountStatusView]
  );

  useEffect(() => {
    if (
      !firebaseAuthReady ||
      !currentAuthRoleReady ||
      !pendingProtectedUserTabRef.current
    ) {
      return;
    }

    const pendingUserTab = pendingProtectedUserTabRef.current;
    pendingProtectedUserTabRef.current = '';
    goToProtectedUserTab(pendingUserTab);
  }, [
    currentAuthRoleReady,
    firebaseAuthReady,
    goToProtectedUserTab,
    pendingProtectedUserTabRef,
  ]);

  useEffect(() => {
    const syncViewWithPath = () => {
      const nextRouteState = getRouteStateFromPath();

      pendingProtectedUserTabRef.current = '';

      if (
        nextRouteState.redirectTo &&
        window.location.pathname !== nextRouteState.redirectTo
      ) {
        window.history.replaceState(null, '', nextRouteState.redirectTo);
      }

      if (
        nextRouteState.view === 'user' &&
        !['login', 'signup', 'rental', 'history'].includes(
          nextRouteState.userTab
        )
      ) {
        clearUserLoginReturnTarget();
      }

      setView(nextRouteState.view);
      setUserTab(nextRouteState.userTab);
      setSelectedFooterPageId(nextRouteState.footerPageId || '');
      setIsCommunityMenuOpen(false);
    };

    syncViewWithPath();
    window.addEventListener('popstate', syncViewWithPath);

    return () => {
      window.removeEventListener('popstate', syncViewWithPath);
    };
  }, [
    pendingProtectedUserTabRef,
    setIsCommunityMenuOpen,
    setSelectedFooterPageId,
    setUserTab,
    setView,
  ]);

  useEffect(() => {
    if (view !== 'user' || !PROTECTED_USER_TABS.has(userTab)) {
      return;
    }

    if (
      !firebaseAuthReady ||
      !currentAuthRoleReady ||
      userAuthLoading ||
      adminLogoutInProgress ||
      userStatusLogoutInProgressRef.current
    ) {
      return;
    }

    if (hasFirebaseAuthSession) {
      return;
    }

    writeUserLoginReturnTarget({
      userTab,
      routeId: '',
      noticePostId: '',
    });
    navigateToUserTab('login', { replace: true });
  }, [
    adminLogoutInProgress,
    currentAuthRoleReady,
    firebaseAuthReady,
    hasFirebaseAuthSession,
    navigateToUserTab,
    userAuthLoading,
    userStatusLogoutInProgressRef,
    userTab,
    view,
  ]);

  useEffect(() => {
    if (!isCommunityMenuOpen) return undefined;

    const handleCommunityMenuOutsideClick = (event) => {
      if (
        communityMenuRef.current &&
        !communityMenuRef.current.contains(event.target)
      ) {
        setIsCommunityMenuOpen(false);
      }
    };

    const handleCommunityMenuEscape = (event) => {
      if (event.key === 'Escape') {
        setIsCommunityMenuOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleCommunityMenuOutsideClick,
      true
    );
    document.addEventListener(
      'touchstart',
      handleCommunityMenuOutsideClick,
      true
    );
    document.addEventListener('keydown', handleCommunityMenuEscape, true);

    return () => {
      document.removeEventListener(
        'mousedown',
        handleCommunityMenuOutsideClick,
        true
      );
      document.removeEventListener(
        'touchstart',
        handleCommunityMenuOutsideClick,
        true
      );
      document.removeEventListener('keydown', handleCommunityMenuEscape, true);
    };
  }, [
    communityMenuRef,
    isCommunityMenuOpen,
    setIsCommunityMenuOpen,
  ]);

  return {
    getCurrentUserLoginReturnTarget,
    goToProtectedUserTab,
    goToUserFaq,
    goToUserHome,
    goToUserMypage,
    goToUserNotice,
    navigateToAdminHome,
    navigateToUserReturnTarget,
    navigateToUserTab,
    openFooterPage,
    saveCurrentUserLoginReturnTarget,
    showUserAccountStatus,
  };
}
