import { useCallback, useEffect, useState } from 'react';

import { loadAppDialogsModule } from '../dialogs/appDialogsLoader.js';

export const useGlobalUiState = () => {
  const [systemBannerDismissedKey, setSystemBannerDismissedKey] = useState('');
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [appDialogsActivated, setAppDialogsActivated] = useState(false);

  return {
    appDialogsActivated,
    confirmModal,
    setAppDialogsActivated,
    setConfirmModal,
    setSystemBannerDismissedKey,
    setToast,
    systemBannerDismissedKey,
    toast,
  };
};

export default function useGlobalUiController({
  appDialogsActivated,
  confirmModal,
  faqPostDialog,
  noticePostDialog,
  popupPostDialog,
  setAppDialogsActivated,
  setConfirmModal,
  setSystemBannerDismissedKey,
  setToast,
  systemBannerDismissedKey,
  systemBannerLevel,
  systemBannerMessage,
  systemBannerEnabled,
  toast,
  userActionDialog,
  view,
}) {
  const triggerToast = useCallback(
    (message, type = 'success') => {
      setToast({ message, type });
      window.setTimeout(() => setToast(null), 3000);
    },
    [setToast]
  );

  const triggerConfirm = useCallback(
    (title, message, onConfirm) => {
      setConfirmModal({ title, message, onConfirm });
    },
    [setConfirmModal]
  );

  const systemBannerKey = `${systemBannerLevel}:${systemBannerMessage}`;
  const shouldShowSystemBanner =
    view === 'user' &&
    systemBannerEnabled &&
    systemBannerMessage &&
    systemBannerDismissedKey !== systemBannerKey;

  const dismissSystemBanner = useCallback(() => {
    setSystemBannerDismissedKey(systemBannerKey);
  }, [setSystemBannerDismissedKey, systemBannerKey]);

  const hasVisibleAppDialog = Boolean(
    userActionDialog ||
      popupPostDialog ||
      faqPostDialog ||
      noticePostDialog ||
      confirmModal ||
      toast
  );

  useEffect(() => {
    if (hasVisibleAppDialog && !appDialogsActivated) {
      setAppDialogsActivated(true);
    }
  }, [appDialogsActivated, hasVisibleAppDialog, setAppDialogsActivated]);

  useEffect(() => {
    if (appDialogsActivated || typeof window === 'undefined') {
      return undefined;
    }

    const preloadAppDialogs = () => {
      void loadAppDialogsModule().catch((error) => {
        console.error('App dialogs preload error:', error);
      });
      window.removeEventListener('pointerdown', preloadAppDialogs);
      window.removeEventListener('keydown', preloadAppDialogs);
    };

    window.addEventListener('pointerdown', preloadAppDialogs, {
      once: true,
      passive: true,
    });
    window.addEventListener('keydown', preloadAppDialogs, {
      once: true,
    });

    return () => {
      window.removeEventListener('pointerdown', preloadAppDialogs);
      window.removeEventListener('keydown', preloadAppDialogs);
    };
  }, [appDialogsActivated]);

  return {
    dismissSystemBanner,
    shouldRenderAppDialogs: hasVisibleAppDialog || appDialogsActivated,
    shouldShowSystemBanner,
    systemBannerKey,
    triggerConfirm,
    triggerToast,
  };
}
