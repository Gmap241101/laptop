import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getDoc,
  getDocs,
  onSnapshot,
  query as firestoreQuery,
  where,
} from 'firebase/firestore';

import {
  FOOTER_PAGES_COLLECTION_REF,
  POPUP_POSTS_COLLECTION_REF,
  SITE_FOOTER_CONFIG_DOC_REF,
} from '../../firebase.js';
import {
  legacyTextToRichHtml,
} from '../../utils/richTextCore.js';
import {
  getFirestoreTimestampMillis,
} from '../../utils/appUtils.js';
import {
  getPopupDateMillis,
  getPopupVersionKey,
} from '../../utils/popupUtils.js';
import {
  createDefaultFooterConfigDraft,
  sanitizeFooterCommonHtml,
} from './useAdminFooterContentController.js';
import {
  readSiteContentCutoverConfig,
  requestSiteContentDomain,
  SITE_CONTENT_DOMAINS,
} from '../content/siteContentCutover.js';

const POPUP_DISMISSED_SESSION_KEY =
  'rentalSystemDismissedPopupVersions';
const POPUP_DISMISSED_LOCAL_KEY =
  'rentalSystemDismissedPopupVersionsUntil';
const POPUP_DISMISS_SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const readDismissedPopupSessionVersions = () => {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(POPUP_DISMISSED_SESSION_KEY) || '[]'
    );
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const readDismissedPopupLocalVersions = () => {
  if (typeof window === 'undefined') return {};

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(POPUP_DISMISSED_LOCAL_KEY) || '{}'
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const nowMillis = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([versionKey, expiresAt]) =>
          versionKey && Number(expiresAt) > nowMillis
      )
    );
  } catch {
    return {};
  }
};

export const usePopupFooterContentSubscriptionState = () => {
  const [popupPosts, setPopupPosts] = useState([]);
  const [popupPostsReady, setPopupPostsReady] = useState(true);
  const [
    popupPostsLoadErrorMessage,
    setPopupPostsLoadErrorMessage,
  ] = useState('');

  const [footerConfig, setFooterConfig] = useState(
    createDefaultFooterConfigDraft
  );
  const [footerConfigReady, setFooterConfigReady] = useState(false);
  const [
    footerConfigLoadErrorMessage,
    setFooterConfigLoadErrorMessage,
  ] = useState('');
  const [footerPages, setFooterPages] = useState([]);
  const [footerPagesReady, setFooterPagesReady] = useState(false);
  const [
    footerPagesLoadErrorMessage,
    setFooterPagesLoadErrorMessage,
  ] = useState('');

  const [
    temporarilyDismissedPopupVersions,
    setTemporarilyDismissedPopupVersions,
  ] = useState([]);
  const [
    dismissedPopupSessionVersions,
    setDismissedPopupSessionVersions,
  ] = useState(readDismissedPopupSessionVersions);
  const [
    dismissedPopupLocalVersions,
    setDismissedPopupLocalVersions,
  ] = useState(readDismissedPopupLocalVersions);

  return {
    dismissedPopupLocalVersions,
    dismissedPopupSessionVersions,
    footerConfig,
    footerConfigLoadErrorMessage,
    footerConfigReady,
    footerPages,
    footerPagesLoadErrorMessage,
    footerPagesReady,
    popupPosts,
    popupPostsLoadErrorMessage,
    popupPostsReady,
    setDismissedPopupLocalVersions,
    setDismissedPopupSessionVersions,
    setFooterConfig,
    setFooterConfigLoadErrorMessage,
    setFooterConfigReady,
    setFooterPages,
    setFooterPagesLoadErrorMessage,
    setFooterPagesReady,
    setPopupPosts,
    setPopupPostsLoadErrorMessage,
    setPopupPostsReady,
    setTemporarilyDismissedPopupVersions,
    temporarilyDismissedPopupVersions,
  };
};

export default function usePopupFooterContentSubscriptionController({
  adminTab,
  dismissedPopupLocalVersions,
  dismissedPopupSessionVersions,
  firebaseAuthUser,
  footerPages,
  isAdminAuthenticated,
  selectedFooterPageId,
  setDismissedPopupLocalVersions,
  setDismissedPopupSessionVersions,
  setFooterConfig,
  setFooterConfigDraft,
  setFooterConfigLoadErrorMessage,
  setFooterConfigReady,
  setFooterPages,
  setFooterPagesLoadErrorMessage,
  setFooterPagesReady,
  setPopupPosts,
  setPopupPostsLoadErrorMessage,
  setPopupPostsReady,
  setTemporarilyDismissedPopupVersions,
  triggerToast,
  userTab,
  view,
}) {
  const triggerToastRef = useRef(triggerToast);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    const shouldLoadAdminPopup =
      isAdminAuthenticated && view === 'admin' && adminTab === 'popupPosts';
    const shouldLoadUserPopup =
      view === 'user' &&
      (
        userTab === 'home' ||
        (userTab === 'rental' && Boolean(firebaseAuthUser))
      );
    const shouldLoadPopup = shouldLoadAdminPopup || shouldLoadUserPopup;

    if (!shouldLoadPopup) {
      setPopupPosts([]);
      setPopupPostsLoadErrorMessage('');
      setPopupPostsReady(true);
      return undefined;
    }

    setPopupPostsReady(false);
    setPopupPostsLoadErrorMessage('');

    const popupSource = shouldLoadAdminPopup
      ? POPUP_POSTS_COLLECTION_REF
      : firestoreQuery(
          POPUP_POSTS_COLLECTION_REF,
          where('enabled', '==', true)
        );

    const applyPopupSnapshot = (snapshot) => {
      const remotePosts = snapshot.docs
        .map((popupDoc) => ({
          ...popupDoc.data(),
          id: popupDoc.id,
        }))
        .sort((first, second) => {
          const firstOrder = Number(first.sortOrder);
          const secondOrder = Number(second.sortOrder);
          const firstHasOrder = Number.isFinite(firstOrder) && firstOrder > 0;
          const secondHasOrder =
            Number.isFinite(secondOrder) && secondOrder > 0;

          if (
            firstHasOrder &&
            secondHasOrder &&
            firstOrder !== secondOrder
          ) {
            return firstOrder - secondOrder;
          }
          if (firstHasOrder !== secondHasOrder) {
            return firstHasOrder ? -1 : 1;
          }

          return (
            getPopupDateMillis(second.createdAt) -
            getPopupDateMillis(first.createdAt)
          );
        });

      setPopupPosts(remotePosts);
      setPopupPostsLoadErrorMessage('');
      setPopupPostsReady(true);
    };

    const handlePopupLoadError = (error) => {
      const message =
        '팝업을 불러오지 못했습니다. Firestore Rules의 popupPosts 읽기 권한을 확인해 주세요.';

      console.error('Popup posts load error:', error);
      setPopupPosts([]);
      setPopupPostsLoadErrorMessage(message);
      setPopupPostsReady(true);

      if (shouldLoadAdminPopup) {
        triggerToastRef.current?.(message, 'error');
      }
    };

    if (shouldLoadUserPopup) {
      let cancelled = false;
      const cutover = readSiteContentCutoverConfig();

      const load = async () => {
        if (cutover.readRequested) {
          try {
            const content = await requestSiteContentDomain({ domain: SITE_CONTENT_DOMAINS.POPUP, config: cutover });
            if (cancelled) return;
            const remotePosts = content.documents
              .filter((item) => item.key.startsWith('popupPosts/') && item.payload?.enabled !== false)
              .map((item) => ({ ...item.payload, id: item.payload?.id || item.key.split('/').pop() }))
              .sort((first, second) => {
                const firstOrder = Number(first.sortOrder);
                const secondOrder = Number(second.sortOrder);
                const firstHasOrder = Number.isFinite(firstOrder) && firstOrder > 0;
                const secondHasOrder = Number.isFinite(secondOrder) && secondOrder > 0;
                if (firstHasOrder && secondHasOrder && firstOrder !== secondOrder) return firstOrder - secondOrder;
                if (firstHasOrder !== secondHasOrder) return firstHasOrder ? -1 : 1;
                return getPopupDateMillis(second.createdAt) - getPopupDateMillis(first.createdAt);
              });
            setPopupPosts(remotePosts);
            setPopupPostsLoadErrorMessage('');
            setPopupPostsReady(true);
            return;
          } catch (postgresError) {
            console.warn('PostgreSQL popup read fallback:', postgresError);
          }
        }
        try {
          const snapshot = await getDocs(popupSource);
          if (!cancelled) applyPopupSnapshot(snapshot);
        } catch (error) {
          if (!cancelled) handlePopupLoadError(error);
        }
      };
      void load();
      return () => { cancelled = true; };
    }

    return onSnapshot(
      popupSource,
      applyPopupSnapshot,
      handlePopupLoadError
    );
  }, [
    adminTab,
    firebaseAuthUser?.uid,
    isAdminAuthenticated,
    setPopupPosts,
    setPopupPostsLoadErrorMessage,
    setPopupPostsReady,
    userTab,
    view,
  ]);

  useEffect(() => {
    const shouldLoadUserFooter = view === 'user';
    const shouldLoadAdminFooter =
      isAdminAuthenticated &&
      view === 'admin' &&
      adminTab === 'footerManagement';
    const shouldLoadFooter = shouldLoadUserFooter || shouldLoadAdminFooter;

    if (!shouldLoadFooter) {
      const defaultFooterConfig = createDefaultFooterConfigDraft();
      setFooterConfig(defaultFooterConfig);
      setFooterConfigDraft(defaultFooterConfig);
      setFooterConfigLoadErrorMessage('');
      setFooterConfigReady(true);
      return undefined;
    }

    setFooterConfigReady(false);
    setFooterConfigLoadErrorMessage('');

    const applyFooterConfigSnapshot = (snapshot) => {
      const remoteData = snapshot.exists() ? snapshot.data() : {};
      const nextConfig = {
        enabled: snapshot.exists() ? remoteData.enabled !== false : true,
        content: remoteData.content || '',
        contentText: remoteData.contentText || remoteData.content || '',
        contentHtml: sanitizeFooterCommonHtml(
          remoteData.contentHtml ||
            legacyTextToRichHtml(
              remoteData.contentText || remoteData.content || ''
            )
        ),
        contentFormat: remoteData.contentFormat || 'rich-html-v1',
        updatedAt: remoteData.updatedAt || null,
      };

      setFooterConfig(nextConfig);
      setFooterConfigDraft({
        enabled: nextConfig.enabled,
        contentHtml: nextConfig.contentHtml,
      });
      setFooterConfigLoadErrorMessage('');
      setFooterConfigReady(true);
    };

    const handleFooterConfigError = (error) => {
      const message =
        '푸터 공통 정보를 불러오지 못했습니다. Firestore Rules의 siteFooter 읽기 권한을 확인해 주세요.';
      console.error('Footer config load error:', error);
      setFooterConfig(createDefaultFooterConfigDraft());
      setFooterConfigDraft(createDefaultFooterConfigDraft());
      setFooterConfigLoadErrorMessage(message);
      setFooterConfigReady(true);
      if (shouldLoadAdminFooter) {
        triggerToastRef.current?.(message, 'error');
      }
    };

    if (shouldLoadUserFooter) {
      let cancelled = false;
      const cutover = readSiteContentCutoverConfig();
      const load = async () => {
        if (cutover.readRequested) {
          try {
            const content = await requestSiteContentDomain({ domain: SITE_CONTENT_DOMAINS.FOOTER, config: cutover });
            const document = content.documents.find((item) => item.key === 'siteFooter/config');
            if (!document?.payload) throw new Error('PostgreSQL footer config is missing.');
            if (cancelled) return;
            const remoteData = document.payload;
            const nextConfig = {
              enabled: remoteData.enabled !== false,
              content: remoteData.content || '',
              contentText: remoteData.contentText || remoteData.content || '',
              contentHtml: sanitizeFooterCommonHtml(remoteData.contentHtml || legacyTextToRichHtml(remoteData.contentText || remoteData.content || '')),
              contentFormat: remoteData.contentFormat || 'rich-html-v1',
              updatedAt: remoteData.updatedAt || null,
            };
            setFooterConfig(nextConfig);
            setFooterConfigDraft({ enabled: nextConfig.enabled, contentHtml: nextConfig.contentHtml });
            setFooterConfigLoadErrorMessage('');
            setFooterConfigReady(true);
            return;
          } catch (postgresError) {
            console.warn('PostgreSQL footer config read fallback:', postgresError);
          }
        }
        try {
          const snapshot = await getDoc(SITE_FOOTER_CONFIG_DOC_REF);
          if (!cancelled) applyFooterConfigSnapshot(snapshot);
        } catch (error) {
          if (!cancelled) handleFooterConfigError(error);
        }
      };
      void load();
      return () => { cancelled = true; };
    }

    return onSnapshot(
      SITE_FOOTER_CONFIG_DOC_REF,
      applyFooterConfigSnapshot,
      handleFooterConfigError
    );
  }, [
    adminTab,
    isAdminAuthenticated,
    setFooterConfig,
    setFooterConfigDraft,
    setFooterConfigLoadErrorMessage,
    setFooterConfigReady,
    view,
  ]);

  useEffect(() => {
    const shouldLoadUserFooter = view === 'user';
    const shouldLoadAdminFooter =
      isAdminAuthenticated &&
      view === 'admin' &&
      adminTab === 'footerManagement';
    const shouldLoadFooter = shouldLoadUserFooter || shouldLoadAdminFooter;

    if (!shouldLoadFooter) {
      setFooterPages([]);
      setFooterPagesLoadErrorMessage('');
      setFooterPagesReady(true);
      return undefined;
    }

    setFooterPagesReady(false);
    setFooterPagesLoadErrorMessage('');

    const footerPagesSource = shouldLoadAdminFooter
      ? FOOTER_PAGES_COLLECTION_REF
      : firestoreQuery(
          FOOTER_PAGES_COLLECTION_REF,
          where('enabled', '==', true)
        );

    const applyFooterPagesSnapshot = (snapshot) => {
      const remotePages = snapshot.docs
        .map((pageDoc) => ({
          ...pageDoc.data(),
          id: pageDoc.id,
        }))
        .sort((first, second) => {
          const orderDifference =
            (Number(first.sortOrder) || 0) -
            (Number(second.sortOrder) || 0);
          if (orderDifference !== 0) return orderDifference;

          const createdDifference =
            getFirestoreTimestampMillis(first.createdAt) -
            getFirestoreTimestampMillis(second.createdAt);
          if (createdDifference !== 0) return createdDifference;

          return String(first.id || '').localeCompare(
            String(second.id || '')
          );
        });

      setFooterPages(remotePages);
      setFooterPagesLoadErrorMessage('');
      setFooterPagesReady(true);
    };

    const handleFooterPagesError = (error) => {
      const message =
        '푸터 메뉴 페이지를 불러오지 못했습니다. Firestore Rules의 footerPages 읽기 권한을 확인해 주세요.';
      console.error('Footer pages load error:', error);
      setFooterPages([]);
      setFooterPagesLoadErrorMessage(message);
      setFooterPagesReady(true);
      if (shouldLoadAdminFooter) {
        triggerToastRef.current?.(message, 'error');
      }
    };

    if (shouldLoadUserFooter) {
      let cancelled = false;
      const cutover = readSiteContentCutoverConfig();
      const load = async () => {
        if (cutover.readRequested) {
          try {
            const content = await requestSiteContentDomain({ domain: SITE_CONTENT_DOMAINS.FOOTER, config: cutover });
            if (cancelled) return;
            const remotePages = content.documents
              .filter((item) => item.key.startsWith('footerPages/') && item.payload?.enabled !== false)
              .map((item) => ({ ...item.payload, id: item.payload?.id || item.key.split('/').pop() }))
              .sort((first, second) => {
                const orderDifference = (Number(first.sortOrder) || 0) - (Number(second.sortOrder) || 0);
                if (orderDifference !== 0) return orderDifference;
                const createdDifference = getFirestoreTimestampMillis(first.createdAt) - getFirestoreTimestampMillis(second.createdAt);
                if (createdDifference !== 0) return createdDifference;
                return String(first.id || '').localeCompare(String(second.id || ''));
              });
            setFooterPages(remotePages);
            setFooterPagesLoadErrorMessage('');
            setFooterPagesReady(true);
            return;
          } catch (postgresError) {
            console.warn('PostgreSQL footer pages read fallback:', postgresError);
          }
        }
        try {
          const snapshot = await getDocs(footerPagesSource);
          if (!cancelled) applyFooterPagesSnapshot(snapshot);
        } catch (error) {
          if (!cancelled) handleFooterPagesError(error);
        }
      };
      void load();
      return () => { cancelled = true; };
    }

    return onSnapshot(
      footerPagesSource,
      applyFooterPagesSnapshot,
      handleFooterPagesError
    );
  }, [
    adminTab,
    isAdminAuthenticated,
    setFooterPages,
    setFooterPagesLoadErrorMessage,
    setFooterPagesReady,
    view,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      POPUP_DISMISSED_SESSION_KEY,
      JSON.stringify(dismissedPopupSessionVersions)
    );
  }, [dismissedPopupSessionVersions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      POPUP_DISMISSED_LOCAL_KEY,
      JSON.stringify(dismissedPopupLocalVersions)
    );
  }, [dismissedPopupLocalVersions]);

  useEffect(() => {
    setTemporarilyDismissedPopupVersions([]);
  }, [setTemporarilyDismissedPopupVersions, userTab, view]);

  const selectedFooterPage = useMemo(
    () =>
      selectedFooterPageId
        ? footerPages.find(
            (page) => page.id === selectedFooterPageId
          ) || null
        : null,
    [footerPages, selectedFooterPageId]
  );

  const dismissUserPopup = useCallback(
    (popup, dismissMode = 'temporary') => {
      const versionKey = getPopupVersionKey(popup);
      if (!versionKey) return;

      if (dismissMode === 'session') {
        setDismissedPopupSessionVersions((currentVersions) =>
          currentVersions.includes(versionKey)
            ? currentVersions
            : [...currentVersions, versionKey]
        );
        return;
      }

      if (dismissMode === 'sevenDays') {
        setDismissedPopupLocalVersions((currentVersions) => ({
          ...currentVersions,
          [versionKey]: Date.now() + POPUP_DISMISS_SEVEN_DAYS_MS,
        }));
        return;
      }

      setTemporarilyDismissedPopupVersions((currentVersions) =>
        currentVersions.includes(versionKey)
          ? currentVersions
          : [...currentVersions, versionKey]
      );
    },
    [
      setDismissedPopupLocalVersions,
      setDismissedPopupSessionVersions,
      setTemporarilyDismissedPopupVersions,
    ]
  );

  const dismissAllUserPopups = useCallback(
    (popups, dismissMode = 'temporary') => {
      const versionKeys = [
        ...new Set(
          (Array.isArray(popups) ? popups : [])
            .map((popup) => getPopupVersionKey(popup))
            .filter(Boolean)
        ),
      ];

      if (!versionKeys.length) return;

      if (dismissMode === 'session') {
        setDismissedPopupSessionVersions((currentVersions) => [
          ...new Set([...currentVersions, ...versionKeys]),
        ]);
        return;
      }

      if (dismissMode === 'sevenDays') {
        const expiresAt = Date.now() + POPUP_DISMISS_SEVEN_DAYS_MS;
        setDismissedPopupLocalVersions((currentVersions) => ({
          ...currentVersions,
          ...Object.fromEntries(
            versionKeys.map((versionKey) => [versionKey, expiresAt])
          ),
        }));
        return;
      }

      setTemporarilyDismissedPopupVersions((currentVersions) => [
        ...new Set([...currentVersions, ...versionKeys]),
      ]);
    },
    [
      setDismissedPopupLocalVersions,
      setDismissedPopupSessionVersions,
      setTemporarilyDismissedPopupVersions,
    ]
  );

  return {
    dismissAllUserPopups,
    dismissUserPopup,
    selectedFooterPage,
  };
}
