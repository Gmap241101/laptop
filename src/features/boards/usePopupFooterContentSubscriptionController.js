import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  legacyTextToRichHtml,
} from '../../utils/richTextCore.js';
import {
  getFirestoreTimestampMillis,
} from '../../utils/appUtils.js';
import {
  getPopupDateMillis,
  getPopupDisplayStatus,
  getPopupVersionKey,
} from '../../utils/popupUtils.js';
import {
  createDefaultFooterConfigDraft,
  sanitizeFooterCommonHtml,
} from './footerContentShared.js';
import {
  publishSiteContentObservation,
  requestSiteContentDomain,
  SITE_CONTENT_DOMAINS,
} from '../content/siteContentCutover.js';
import useSiteContentRefreshRevision from '../content/useSiteContentRefreshRevision.js';
import {
  preloadAdminFooterCatalog,
  preloadAdminPopupCatalog,
} from './adminSiteContentCatalogService.js';

const POPUP_DISMISSED_SESSION_KEY =
  'rentalSystemDismissedPopupVersions';
const POPUP_DISMISSED_LOCAL_KEY =
  'rentalSystemDismissedPopupVersionsUntil';
const POPUP_DISMISS_SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const scheduleAfterUserFirstPaint = (callback) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    const timeoutId = globalThis.setTimeout(callback, 0);
    return () => globalThis.clearTimeout(timeoutId);
  }

  let secondFrameId = 0;
  const firstFrameId = window.requestAnimationFrame(() => {
    secondFrameId = window.requestAnimationFrame(callback);
  });

  return () => {
    window.cancelAnimationFrame?.(firstFrameId);
    if (secondFrameId) window.cancelAnimationFrame?.(secondFrameId);
  };
};
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
  const popupLoadedRevisionRef = useRef(-1);
  const footerLoadedRevisionRef = useRef(-1);
  const popupRefreshRevision = useSiteContentRefreshRevision(SITE_CONTENT_DOMAINS.POPUP);
  const footerRefreshRevision = useSiteContentRefreshRevision(SITE_CONTENT_DOMAINS.FOOTER);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    const shouldLoadAdminPopup =
      isAdminAuthenticated && view === 'admin' && adminTab === 'popupPosts';
    const shouldLoadUserPopup =
      view === 'user' &&
      (userTab === 'home' || (userTab === 'rental' && Boolean(firebaseAuthUser)));
    const shouldLoadPopup = shouldLoadAdminPopup || shouldLoadUserPopup;

    if (!shouldLoadPopup) return undefined;
    if (popupLoadedRevisionRef.current === popupRefreshRevision) return undefined;

    const isInitialLoad = popupLoadedRevisionRef.current < 0;
    if (isInitialLoad) setPopupPostsReady(false);
    setPopupPostsLoadErrorMessage('');
    let cancelled = false;

    const load = async () => {
      try {
        const content = shouldLoadAdminPopup
          ? await preloadAdminPopupCatalog({ force: !isInitialLoad })
          : await requestSiteContentDomain({
              domain: SITE_CONTENT_DOMAINS.POPUP,
              useCache: true,
            });
        const remotePosts = content.documents
          .filter((item) => item.key.startsWith('popupPosts/') && (
            shouldLoadAdminPopup || (item.enabled !== false && item.payload?.enabled !== false)
          ))
          .map((item) => ({
            ...item.payload,
            id: item.payload?.id || item.key.split('/').pop(),
            enabled: typeof item.enabled === 'boolean' ? item.enabled : item.payload?.enabled !== false,
            sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : item.payload?.sortOrder,
            __publicVisibility: item.publicVisibility || null,
          }))
          .sort((first, second) => {
            const firstOrder = Number(first.sortOrder);
            const secondOrder = Number(second.sortOrder);
            const firstHasOrder = Number.isFinite(firstOrder) && firstOrder > 0;
            const secondHasOrder = Number.isFinite(secondOrder) && secondOrder > 0;
            if (firstHasOrder && secondHasOrder && firstOrder !== secondOrder) return firstOrder - secondOrder;
            if (firstHasOrder !== secondHasOrder) return firstHasOrder ? -1 : 1;
            return getPopupDateMillis(second.createdAt) - getPopupDateMillis(first.createdAt);
          });
        if (cancelled) return;
        popupLoadedRevisionRef.current = popupRefreshRevision;
        publishSiteContentObservation({
          readRequested: true,
          domain: SITE_CONTENT_DOMAINS.POPUP,
          readSource: 'postgresql',
          documentCount: content.documents.length,
          popupPostCount: remotePosts.length,
          popupActiveCount: remotePosts.filter((post) => getPopupDisplayStatus(post, Date.now()).key === 'active').length,
          error: null,
        });
        setPopupPosts(remotePosts);
        setPopupPostsLoadErrorMessage('');
        setPopupPostsReady(true);
      } catch (error) {
        if (cancelled) return;
        const message = '팝업을 PostgreSQL에서 불러오지 못했습니다.';
        console.error('PostgreSQL popup authority read error:', error);
        if (isInitialLoad) setPopupPosts([]);
        setPopupPostsLoadErrorMessage(message);
        setPopupPostsReady(true);
        if (shouldLoadAdminPopup) triggerToastRef.current?.(message, 'error');
      }
    };

    const cancelScheduledLoad = shouldLoadUserPopup && !shouldLoadAdminPopup
      ? scheduleAfterUserFirstPaint(() => { void load(); })
      : null;

    if (!cancelScheduledLoad) {
      void load();
    }

    return () => {
      cancelled = true;
      cancelScheduledLoad?.();
    };
  }, [
    adminTab,
    firebaseAuthUser?.uid,
    isAdminAuthenticated,
    setPopupPosts,
    setPopupPostsLoadErrorMessage,
    setPopupPostsReady,
    userTab,
    popupRefreshRevision,
    view,
  ]);

  useEffect(() => {
    const shouldLoadAdminFooter =
      isAdminAuthenticated && view === 'admin' && adminTab === 'footerManagement';
    const shouldLoadFooter = view === 'user' || shouldLoadAdminFooter;

    if (!shouldLoadFooter) return undefined;
    if (footerLoadedRevisionRef.current === footerRefreshRevision) return undefined;

    const isInitialLoad = footerLoadedRevisionRef.current < 0;
    if (isInitialLoad) {
      setFooterConfigReady(false);
      setFooterPagesReady(false);
    }
    setFooterConfigLoadErrorMessage('');
    setFooterPagesLoadErrorMessage('');
    let cancelled = false;

    const load = async () => {
      try {
        const content = shouldLoadAdminFooter
          ? await preloadAdminFooterCatalog({ force: !isInitialLoad })
          : await requestSiteContentDomain({
              domain: SITE_CONTENT_DOMAINS.FOOTER,
              useCache: true,
            });
        if (cancelled) return;

        const configDocument = content.documents.find((item) => item.key === 'siteFooter/config');
        if (configDocument?.payload) {
          const remoteData = configDocument.payload;
          const nextConfig = {
            enabled: remoteData.enabled !== false,
            content: remoteData.content || '',
            contentText: remoteData.contentText || remoteData.content || '',
            contentHtml: sanitizeFooterCommonHtml(
              remoteData.contentHtml || legacyTextToRichHtml(remoteData.contentText || remoteData.content || '')
            ),
            contentFormat: remoteData.contentFormat || 'rich-html-v1',
            updatedAt: remoteData.updatedAt || null,
          };
          setFooterConfig(nextConfig);
          setFooterConfigDraft({ enabled: nextConfig.enabled, contentHtml: nextConfig.contentHtml });
          setFooterConfigLoadErrorMessage('');
        } else {
          const defaultFooterConfig = createDefaultFooterConfigDraft();
          setFooterConfig(defaultFooterConfig);
          setFooterConfigDraft(defaultFooterConfig);
          setFooterConfigLoadErrorMessage('푸터 설정을 PostgreSQL에서 불러오지 못했습니다.');
        }

        const remotePages = content.documents
          .filter((item) => item.key.startsWith('footerPages/') && (
            shouldLoadAdminFooter || item.payload?.enabled !== false
          ))
          .map((item) => ({
            ...item.payload,
            id: item.payload?.id || item.key.split('/').pop(),
          }))
          .sort((first, second) => {
            const orderDifference = (Number(first.sortOrder) || 0) - (Number(second.sortOrder) || 0);
            if (orderDifference !== 0) return orderDifference;
            const createdDifference = getFirestoreTimestampMillis(first.createdAt) - getFirestoreTimestampMillis(second.createdAt);
            if (createdDifference !== 0) return createdDifference;
            return String(first.id || '').localeCompare(String(second.id || ''));
          });

        footerLoadedRevisionRef.current = footerRefreshRevision;
        setFooterPages(remotePages);
        setFooterPagesLoadErrorMessage('');
        setFooterConfigReady(true);
        setFooterPagesReady(true);
      } catch (error) {
        if (cancelled) return;
        const configMessage = '푸터 설정을 PostgreSQL에서 불러오지 못했습니다.';
        const pagesMessage = '푸터 메뉴를 PostgreSQL에서 불러오지 못했습니다.';
        console.error('PostgreSQL footer authority read error:', error);
        if (isInitialLoad) {
          const defaultFooterConfig = createDefaultFooterConfigDraft();
          setFooterConfig(defaultFooterConfig);
          setFooterConfigDraft(defaultFooterConfig);
          setFooterPages([]);
        }
        setFooterConfigLoadErrorMessage(configMessage);
        setFooterPagesLoadErrorMessage(pagesMessage);
        setFooterConfigReady(true);
        setFooterPagesReady(true);
        if (shouldLoadAdminFooter) triggerToastRef.current?.(pagesMessage, 'error');
      }
    };

    const shouldLoadUserFooter = view === 'user' && !shouldLoadAdminFooter;
    const cancelScheduledLoad = shouldLoadUserFooter
      ? scheduleAfterUserFirstPaint(() => { void load(); })
      : null;

    if (!cancelScheduledLoad) {
      void load();
    }

    return () => {
      cancelled = true;
      cancelScheduledLoad?.();
    };
  }, [
    adminTab,
    isAdminAuthenticated,
    setFooterConfig,
    setFooterConfigDraft,
    setFooterConfigLoadErrorMessage,
    setFooterConfigReady,
    setFooterPages,
    setFooterPagesLoadErrorMessage,
    setFooterPagesReady,
    footerRefreshRevision,
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
            (page) => String(page.addressId || '').trim() === selectedFooterPageId
          ) || footerPages.find(
            (page) => !String(page.addressId || '').trim() && page.id === selectedFooterPageId
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
