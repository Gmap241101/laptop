import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

import {
  ADMIN_REQUEST_QUICK_FILTER,
  ADMIN_REQUEST_TAB,
} from '../constants/appConstants.js';

const ADMIN_HISTORY_STATE_KEY = '__mkRentalAdminHistoryV1';

const readAdminHistoryState = (state = globalThis.history?.state) => {
  const value = state?.[ADMIN_HISTORY_STATE_KEY];
  if (!value || value.surface !== 'admin') return null;
  const tab = String(value.tab || '').trim();
  return {
    boundary: value.boundary === true,
    tab: tab || 'dashboard',
  };
};

const createAdminHistoryState = (tab, { boundary = false } = {}) => ({
  ...(globalThis.history?.state || {}),
  [ADMIN_HISTORY_STATE_KEY]: {
    surface: 'admin',
    tab: String(tab || 'dashboard').trim() || 'dashboard',
    boundary: Boolean(boundary),
  },
});

const pushAdminHistoryEntry = (tab) => {
  if (typeof window === 'undefined') return;
  window.history.pushState(
    createAdminHistoryState(tab),
    '',
    window.location.href
  );
};

const replaceAdminHistoryEntry = (tab, options = {}) => {
  if (typeof window === 'undefined') return;
  window.history.replaceState(
    createAdminHistoryState(tab, options),
    '',
    window.location.href
  );
};

const LEGACY_ADMIN_UNSAVED_MARKERS = Object.freeze([
  {
    flag: '__mkHomeBannerUnsaved',
    message:
      '저장하지 않은 초기화면 배너 또는 표시 설정 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?',
  },
  {
    flag: '__mkFooterPageUnsaved',
    message:
      '저장하지 않은 푸터 메뉴 페이지 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?',
  },
  {
    flag: '__mkSystemSettingsUnsaved',
    message: (browserWindow) =>
      browserWindow.__mkSystemSettingsUnsavedMessage ||
      '저장하지 않은 설정 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?',
  },
]);

const getLegacyAdminUnsavedMarkers = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  const browserWindow = /** @type {any} */ (window);

  return LEGACY_ADMIN_UNSAVED_MARKERS.filter(({ flag }) =>
    Boolean(browserWindow[flag])
  );
};

const confirmLegacyAdminUnsavedMarkers = (markers) => {
  if (typeof window === 'undefined') {
    return true;
  }

  const browserWindow = /** @type {any} */ (window);

  return markers.every(({ message }) =>
    browserWindow.confirm(
      typeof message === 'function'
        ? message(browserWindow)
        : message
    )
  );
};

const clearLegacyAdminUnsavedMarkers = (markers) => {
  if (typeof window === 'undefined') {
    return;
  }

  const browserWindow = /** @type {any} */ (window);

  markers.forEach(({ flag }) => {
    browserWindow[flag] = false;
  });

  if (
    markers.some(
      ({ flag }) => flag === '__mkSystemSettingsUnsaved'
    )
  ) {
    browserWindow.__mkSystemSettingsUnsavedMessage = '';
  }
};

export const useAdminNavigationState = () => {
  const [adminTab, setAdminTab] = useState(
    () => readAdminHistoryState()?.tab || 'dashboard'
  );
  const [peopleSettingsDirty, setPeopleSettingsDirty] = useState(false);
  const [signupPolicyDirty, setSignupPolicyDirty] = useState(false);

  const memberDirectoryDeferredActionsRef = useRef({
    discard: null,
    save: null,
  });
  const signupPolicyDeferredActionsRef = useRef({
    discard: null,
    save: null,
  });

  const handleMemberDirectoryDeferredStateChange = useCallback(
    (nextState) => {
      const nextDirty = Boolean(nextState?.dirty);

      memberDirectoryDeferredActionsRef.current = {
        discard:
          typeof nextState?.discard === 'function'
            ? nextState.discard
            : null,
        save:
          typeof nextState?.save === 'function'
            ? nextState.save
            : null,
      };

      setPeopleSettingsDirty((currentDirty) =>
        currentDirty === nextDirty ? currentDirty : nextDirty
      );
    },
    []
  );

  const handleSignupPolicyDeferredStateChange = useCallback(
    (nextState) => {
      const nextDirty = Boolean(nextState?.dirty);

      signupPolicyDeferredActionsRef.current = {
        discard:
          typeof nextState?.discard === 'function'
            ? nextState.discard
            : null,
        save:
          typeof nextState?.save === 'function'
            ? nextState.save
            : null,
      };

      setSignupPolicyDirty((currentDirty) =>
        currentDirty === nextDirty ? currentDirty : nextDirty
      );
    },
    []
  );

  return {
    adminTab,
    handleMemberDirectoryDeferredStateChange,
    handleSignupPolicyDeferredStateChange,
    memberDirectoryDeferredActionsRef,
    peopleSettingsDirty,
    setAdminTab,
    signupPolicyDeferredActionsRef,
    signupPolicyDirty,
  };
};

export default function useAdminNavigationController({
  adminTab,
  assetCategorySettingsDirty,
  cancelTempAssetCategoryChanges,
  discardFaqBoardConfigChanges,
  discardHolidayChanges,
  discardNoticeBoardConfigChanges,
  discardRentalPolicyChanges,
  faqBoardSettingsDirty,
  footerConfig,
  footerConfigDirty,
  setAdminMemberAccountsNavigationRequest,
  setAdminRequestsNavigationRequest,
  holidaySettingsDirty,
  memberDirectoryDeferredActionsRef,
  navigateToAdminHome,
  noticeBoardSettingsDirty,
  peopleSettingsDirty,
  rentalPolicySettingsDirty,
  saveFaqBoardConfig,
  saveFooterConfig,
  saveHolidaySettings,
  saveNoticeBoardConfig,
  saveSystemSettings,
  saveTempAssetCategoryChanges,
  setAdminTab,
  setConfirmModal,
  setFooterConfigDraft,
  signupPolicyDeferredActionsRef,
  signupPolicyDirty,
  view,
  goToUserHome,
}) {
  const adminTabRef = useRef(adminTab);
  const adminHistoryInitializedRef = useRef(false);

  useEffect(() => {
    adminTabRef.current = adminTab;
  }, [adminTab]);

  const discardFooterConfigChanges = useCallback(() => {
    setFooterConfigDraft({
      enabled: Boolean(footerConfig.enabled),
      contentHtml: footerConfig.contentHtml || '',
    });
  }, [footerConfig.contentHtml, footerConfig.enabled, setFooterConfigDraft]);

  const getAdminDeferredChangesConfig = useCallback(
    (tab) => {
      if (tab === 'extensionSettings' && rentalPolicySettingsDirty) {
        return {
          label: '대여 정책',
          discard: discardRentalPolicyChanges,
          save: saveSystemSettings,
        };
      }

      if (tab === 'holidaySettings' && holidaySettingsDirty) {
        return {
          label: '휴일',
          discard: discardHolidayChanges,
          save: saveHolidaySettings,
        };
      }

      if (tab === 'categories' && assetCategorySettingsDirty) {
        return {
          label: '자산 카테고리',
          discard: () =>
            cancelTempAssetCategoryChanges({ silent: true }),
          save: saveTempAssetCategoryChanges,
        };
      }

      if (tab === 'people' && peopleSettingsDirty) {
        const { discard, save } =
          memberDirectoryDeferredActionsRef.current;

        if (
          typeof discard !== 'function' ||
          typeof save !== 'function'
        ) {
          return null;
        }

        return {
          label: '부서·사용자',
          discard,
          save,
        };
      }

      if (tab === 'signupPolicy' && signupPolicyDirty) {
        const { discard, save } =
          signupPolicyDeferredActionsRef.current;

        if (
          typeof discard !== 'function' ||
          typeof save !== 'function'
        ) {
          return null;
        }

        return {
          label: '회원가입 정책',
          discard,
          save,
        };
      }

      if (tab === 'noticePosts' && noticeBoardSettingsDirty) {
        return {
          label: '공지사항 목록 설정',
          discard: discardNoticeBoardConfigChanges,
          save: saveNoticeBoardConfig,
        };
      }

      if (tab === 'faqPosts' && faqBoardSettingsDirty) {
        return {
          label: 'FAQ 목록 설정',
          discard: discardFaqBoardConfigChanges,
          save: saveFaqBoardConfig,
        };
      }

      if (tab === 'footerManagement' && footerConfigDirty) {
        return {
          label: '푸터 공통 정보',
          discard: discardFooterConfigChanges,
          save: saveFooterConfig,
        };
      }

      return null;
    },
    [
      assetCategorySettingsDirty,
      cancelTempAssetCategoryChanges,
      discardFaqBoardConfigChanges,
      discardFooterConfigChanges,
      discardHolidayChanges,
      discardNoticeBoardConfigChanges,
      discardRentalPolicyChanges,
      faqBoardSettingsDirty,
      footerConfigDirty,
      holidaySettingsDirty,
      memberDirectoryDeferredActionsRef,
      noticeBoardSettingsDirty,
      peopleSettingsDirty,
      rentalPolicySettingsDirty,
      saveFaqBoardConfig,
      saveFooterConfig,
      saveHolidaySettings,
      saveNoticeBoardConfig,
      saveSystemSettings,
      saveTempAssetCategoryChanges,
      signupPolicyDeferredActionsRef,
      signupPolicyDirty,
    ]
  );

  const currentAdminDeferredSettingsDirty = Boolean(
    (adminTab === 'extensionSettings' && rentalPolicySettingsDirty) ||
      (adminTab === 'holidaySettings' && holidaySettingsDirty) ||
      (adminTab === 'categories' && assetCategorySettingsDirty) ||
      (adminTab === 'people' && peopleSettingsDirty) ||
      (adminTab === 'signupPolicy' && signupPolicyDirty) ||
      (adminTab === 'noticePosts' && noticeBoardSettingsDirty) ||
      (adminTab === 'faqPosts' && faqBoardSettingsDirty) ||
      (adminTab === 'footerManagement' && footerConfigDirty)
  );

  useEffect(() => {
    if (view !== 'admin' || !currentAdminDeferredSettingsDirty) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [view, currentAdminDeferredSettingsDirty]);

  const commitAdminTabChange = useCallback(
    ({ legacyMarkers, nextTab, onCommitted, historyMode = 'push' }) => {
      clearLegacyAdminUnsavedMarkers(legacyMarkers);
      if (view === 'admin') {
        if (historyMode === 'push') {
          pushAdminHistoryEntry(nextTab);
        } else if (historyMode === 'replace') {
          replaceAdminHistoryEntry(nextTab);
        }
      }
      startTransition(() => {
        setAdminTab(nextTab);
      });
      onCommitted?.();
    },
    [setAdminTab, view]
  );

  const handleAdminTabChange = useCallback(
    /**
     * @param {string} nextTab
     * @param {{ onCommitted?: () => void, historyMode?: 'push'|'replace'|'none' }} [options]
     */
    (nextTab, options = {}) => {
      const { historyMode = 'push', onCommitted } = options;
      const normalizedNextTab = String(nextTab || '').trim();

      if (!normalizedNextTab) {
        return false;
      }

      if (normalizedNextTab === adminTab) {
        onCommitted?.();
        return true;
      }

      const legacyMarkers = getLegacyAdminUnsavedMarkers();

      if (!confirmLegacyAdminUnsavedMarkers(legacyMarkers)) {
        return false;
      }

      const deferredChanges =
        getAdminDeferredChangesConfig(adminTab);

      if (!deferredChanges) {
        commitAdminTabChange({
          legacyMarkers,
          nextTab: normalizedNextTab,
          onCommitted,
          historyMode,
        });
        return true;
      }

      setConfirmModal({
        title: `저장되지 않은 ${deferredChanges.label} 변경사항`,
        message: `저장되지 않은 ${deferredChanges.label} 변경사항이 있습니다. 변경사항을 저장한 후 이동하시겠습니까?`,
        cancelLabel: '계속 편집',
        secondaryLabel: '저장하지 않고 이동',
        confirmLabel: '저장 후 이동',
        confirmLoadingLabel: '저장 중...',
        variant: 'primary',
        secondaryVariant: 'outline',
        onSecondary: async () => {
          const discarded = await deferredChanges.discard?.();

          if (discarded === false) {
            return false;
          }

          commitAdminTabChange({
            legacyMarkers,
            nextTab: normalizedNextTab,
            onCommitted,
            historyMode,
          });
          return true;
        },
        onConfirm: async () => {
          const saved = await deferredChanges.save();

          if (!saved) {
            return false;
          }

          commitAdminTabChange({
            legacyMarkers,
            nextTab: normalizedNextTab,
            onCommitted,
            historyMode,
          });
          return true;
        },
      });

      return false;
    },
    [
      adminTab,
      commitAdminTabChange,
      getAdminDeferredChangesConfig,
      setConfirmModal,
    ]
  );

  useEffect(() => {
    if (view !== 'admin' || typeof window === 'undefined') {
      return undefined;
    }

    if (!adminHistoryInitializedRef.current) {
      const currentTab = adminTabRef.current || 'dashboard';
      replaceAdminHistoryEntry(currentTab, { boundary: true });
      pushAdminHistoryEntry(currentTab);
      adminHistoryInitializedRef.current = true;
    }

    const restoreCurrentHistoryEntry = () => {
      window.history.forward();
    };

    const handlePopState = (event) => {
      const targetHistory = readAdminHistoryState(event.state);
      const currentTab = adminTabRef.current || 'dashboard';

      if (!targetHistory || targetHistory.boundary) {
        pushAdminHistoryEntry(currentTab);
        return;
      }

      const targetTab = targetHistory.tab;
      if (!targetTab || targetTab === currentTab) {
        return;
      }

      const legacyMarkers = getLegacyAdminUnsavedMarkers();
      if (!confirmLegacyAdminUnsavedMarkers(legacyMarkers)) {
        restoreCurrentHistoryEntry();
        return;
      }

      const deferredChanges = getAdminDeferredChangesConfig(currentTab);
      if (!deferredChanges) {
        commitAdminTabChange({
          legacyMarkers,
          nextTab: targetTab,
          historyMode: 'none',
        });
        return;
      }

      const shouldDiscard = window.confirm(
        `저장되지 않은 ${deferredChanges.label} 변경사항이 있습니다. 저장하지 않고 이전 관리자 메뉴로 이동하시겠습니까?`
      );
      if (!shouldDiscard) {
        restoreCurrentHistoryEntry();
        return;
      }

      void Promise.resolve(deferredChanges.discard?.())
        .then((discarded) => {
          if (discarded === false) {
            restoreCurrentHistoryEntry();
            return;
          }
          commitAdminTabChange({
            legacyMarkers,
            nextTab: targetTab,
            historyMode: 'none',
          });
        })
        .catch((error) => {
          console.error('Administrator history navigation discard error:', error);
          restoreCurrentHistoryEntry();
        });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [commitAdminTabChange, getAdminDeferredChangesConfig, view]);

  useEffect(() => {
    if (view !== 'admin' || !adminHistoryInitializedRef.current) return;
    const currentHistory = readAdminHistoryState();
    if (!currentHistory || currentHistory.boundary) return;
    if (currentHistory.tab !== adminTab) {
      replaceAdminHistoryEntry(adminTab);
    }
  }, [adminTab, view]);

  const openAdminMemberAccounts = useCallback(
    ({ query = '', statusFilter = 'all' } = {}) => {
      handleAdminTabChange('memberAccounts', {
        onCommitted: () =>
          setAdminMemberAccountsNavigationRequest((currentRequest) => ({
            requestId: Number(currentRequest?.requestId || 0) + 1,
            query: String(query || ''),
            statusFilter: String(statusFilter || 'all'),
          })),
      });
    },
    [handleAdminTabChange, setAdminMemberAccountsNavigationRequest]
  );

  const openAdminRequests = useCallback(
    ({
      query = '',
      quickFilter = ADMIN_REQUEST_QUICK_FILTER.ALL,
      requestTab = ADMIN_REQUEST_TAB.PENDING,
      selectedRequestId = '',
    } = {}) => {
      handleAdminTabChange('requests', {
        onCommitted: () =>
          setAdminRequestsNavigationRequest((currentRequest) => ({
            requestId: Number(currentRequest?.requestId || 0) + 1,
            query: String(query || ''),
            quickFilter: String(
              quickFilter || ADMIN_REQUEST_QUICK_FILTER.ALL
            ),
            requestTab: String(
              requestTab || ADMIN_REQUEST_TAB.PENDING
            ),
            selectedRequestId: String(selectedRequestId || ''),
          })),
      });
    },
    [handleAdminTabChange, setAdminRequestsNavigationRequest]
  );

  const goToAppHome = useCallback(() => {
    if (view === 'admin') {
      handleAdminTabChange('dashboard', {
        onCommitted: navigateToAdminHome,
      });
      return;
    }

    goToUserHome();
  }, [goToUserHome, handleAdminTabChange, navigateToAdminHome, view]);

  return {
    goToAppHome,
    handleAdminTabChange,
    openAdminMemberAccounts,
    openAdminRequests,
  };
}
