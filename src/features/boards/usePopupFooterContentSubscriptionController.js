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

const POPUP_DISMISSED_SESSION_KEY =
  'rentalSystemDismissedPopupVersions';
const POPUP_DISMISSED_LOCAL_KEY =
  'rentalSystemDismissedPopupVersionsUntil';
const POPUP_DISMISS_SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const USER_SITE_CONTENT_REFRESH_DOMAINS = Object.freeze([
  SITE_CONTENT_DOMAINS.POPUP,
  SITE_CONTENT_DOMAINS.FOOTER,
]);

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
  const siteContentRefreshRevision = useSiteContentRefreshRevision(USER_SITE_CONTENT_REFRESH_DOMAINS);

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

    if (!shouldLoadPopup) {
      setPopupPosts([]);
      setPopupPostsLoadErrorMessage('');
      setPopupPostsReady(true);
      return undefined;
    }

    setPopupPostsReady(false);
    setPopupPostsLoadErrorMessage('');
    let cancelled = false;

    const load = async () => {
      try {
        const content = await requestSiteContentDomain({
          domain: SITE_CONTENT_DOMAINS.POPUP,
          useCache: false,
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
        setPopupPosts([]);
        setPopupPostsLoadErrorMessage(message);
        setPopupPostsReady(true);
        if (shouldLoadAdminPopup) triggerToastRef.current?.(message, 'error');
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [
    adminTab,
    firebaseAuthUser?.uid,
    isAdminAuthenticated,
    setPopupPosts,
    setPopupPostsLoadErrorMessage,
    setPopupPostsReady,
    userTab,
    siteContentRefreshRevision,
    view,
  ]);

  useEffect(() => {
    const shouldLoadAdminFooter =
      isAdminAuthenticated && view === 'admin' && adminTab === 'footerManagement';
    const shouldLoadFooter = view === 'user' || shouldLoadAdminFooter;

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
    let cancelled = false;

    const load = async () => {
      try {
        const content = await requestSiteContentDomain({
          domain: SITE_CONTENT_DOMAINS.FOOTER,
          useCache: false,
        });
        const document = content.documents.find((item) => item.key === 'siteFooter/config');
        if (!document?.payload) throw Object.assign(new Error('PostgreSQL footer config is missing.'), { code: 'footer_config_postgres_missing' });
        if (cancelled) return;
        const remoteData = document.payload;
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
        setFooterConfigReady(true);
      } catch (error) {
        if (cancelled) return;
        const message = '푸터 설정을 PostgreSQL에서 불러오지 못했습니다.';
        console.error('PostgreSQL footer config authority read error:', error);
        setFooterConfig(createDefaultFooterConfigDraft());
        setFooterConfigDraft(createDefaultFooterConfigDraft());
        setFooterConfigLoadErrorMessage(message);
        setFooterConfigReady(true);
        if (shouldLoadAdminFooter) triggerToastRef.current?.(message, 'error');
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [
    adminTab,
    isAdminAuthenticated,
    setFooterConfig,
    setFooterConfigDraft,
    setFooterConfigLoadErrorMessage,
    setFooterConfigReady,
    siteContentRefreshRevision,
    view,
  ]);

  useEffect(() => {
    const shouldLoadAdminFooter =
      isAdminAuthenticated && view === 'admin' && adminTab === 'footerManagement';
    const shouldLoadFooter = view === 'user' || shouldLoadAdminFooter;

    if (!shouldLoadFooter) {
      setFooterPages([]);
      setFooterPagesLoadErrorMessage('');
      setFooterPagesReady(true);
      return undefined;
    }

    setFooterPagesReady(false);
    setFooterPagesLoadErrorMessage('');
    let cancelled = false;

    const load = async () => {
      try {
        const content = await requestSiteContentDomain({
          domain: SITE_CONTENT_DOMAINS.FOOTER,
          useCache: false,
        });
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
        if (cancelled) return;
        setFooterPages(remotePages);
        setFooterPagesLoadErrorMessage('');
        setFooterPagesReady(true);
      } catch (error) {
        if (cancelled) return;
        const message = '푸터 메뉴를 PostgreSQL에서 불러오지 못했습니다.';
        console.error('PostgreSQL footer pages authority read error:', error);
        setFooterPages([]);
        setFooterPagesLoadErrorMessage(message);
        setFooterPagesReady(true);
        if (shouldLoadAdminFooter) triggerToastRef.current?.(message, 'error');
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [
    adminTab,
    isAdminAuthenticated,
    setFooterPages,
    setFooterPagesLoadErrorMessage,
    setFooterPagesReady,
    siteContentRefreshRevision,
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
