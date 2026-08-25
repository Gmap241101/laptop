import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { legacyTextToRichHtml } from '../../utils/richTextCore.js';
import { getFirestoreTimestampMillis } from '../../utils/appUtils.js';
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
  POPUP_DISMISSED_LOCAL_KEY,
  POPUP_DISMISSED_SESSION_KEY,
  POPUP_DISMISS_SEVEN_DAYS_MS,
  scheduleAfterUserFirstPaint,
  usePopupFooterContentSubscriptionState,
} from './popupFooterContentSubscriptionShared.js';

export { usePopupFooterContentSubscriptionState } from './popupFooterContentSubscriptionShared.js';

export default function useUserPopupFooterContentSubscriptionController({
  dismissedPopupLocalVersions,
  dismissedPopupSessionVersions,
  firebaseAuthUser,
  footerPages,
  selectedFooterPageId,
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
  userTab,
  view,
}) {
  const popupLoadedRevisionRef = useRef(-1);
  const footerLoadedRevisionRef = useRef(-1);
  const popupRefreshRevision = useSiteContentRefreshRevision(SITE_CONTENT_DOMAINS.POPUP);
  const footerRefreshRevision = useSiteContentRefreshRevision(SITE_CONTENT_DOMAINS.FOOTER);

  useEffect(() => {
    const shouldLoadUserPopup =
      view === 'user' &&
      (userTab === 'home' || (userTab === 'rental' && Boolean(firebaseAuthUser)));

    if (!shouldLoadUserPopup) return undefined;
    if (popupLoadedRevisionRef.current === popupRefreshRevision) return undefined;

    const isInitialLoad = popupLoadedRevisionRef.current < 0;
    if (isInitialLoad) setPopupPostsReady(false);
    setPopupPostsLoadErrorMessage('');
    let cancelled = false;

    const load = async () => {
      try {
        const content = await requestSiteContentDomain({
          domain: SITE_CONTENT_DOMAINS.POPUP,
          useCache: true,
        });
        const remotePosts = content.documents
          .filter((item) => item.key.startsWith('popupPosts/') && (
            item.enabled !== false && item.payload?.enabled !== false
          ))
          .map((item) => ({
            ...item.payload,
            id: item.payload?.id || item.key.split('/').pop(),
            enabled: typeof item.enabled === 'boolean'
              ? item.enabled
              : item.payload?.enabled !== false,
            sortOrder: Number.isFinite(Number(item.sortOrder))
              ? Number(item.sortOrder)
              : item.payload?.sortOrder,
            __publicVisibility: item.publicVisibility || null,
          }))
          .sort((first, second) => {
            const firstOrder = Number(first.sortOrder);
            const secondOrder = Number(second.sortOrder);
            const firstHasOrder = Number.isFinite(firstOrder) && firstOrder > 0;
            const secondHasOrder = Number.isFinite(secondOrder) && secondOrder > 0;
            if (firstHasOrder && secondHasOrder && firstOrder !== secondOrder) {
              return firstOrder - secondOrder;
            }
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
          popupActiveCount: remotePosts.filter(
            (post) => getPopupDisplayStatus(post, Date.now()).key === 'active'
          ).length,
          error: null,
        });
        setPopupPosts(remotePosts);
        setPopupPostsLoadErrorMessage('');
        setPopupPostsReady(true);
      } catch (error) {
        if (cancelled) return;
        console.error('PostgreSQL popup authority read error:', error);
        if (isInitialLoad) setPopupPosts([]);
        setPopupPostsLoadErrorMessage('팝업을 PostgreSQL에서 불러오지 못했습니다.');
        setPopupPostsReady(true);
      }
    };

    const cancelScheduledLoad = scheduleAfterUserFirstPaint(() => {
      void load();
    });

    return () => {
      cancelled = true;
      cancelScheduledLoad?.();
    };
  }, [
    firebaseAuthUser?.uid,
    popupRefreshRevision,
    setPopupPosts,
    setPopupPostsLoadErrorMessage,
    setPopupPostsReady,
    userTab,
    view,
  ]);

  useEffect(() => {
    if (view !== 'user') return undefined;
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
        const content = await requestSiteContentDomain({
          domain: SITE_CONTENT_DOMAINS.FOOTER,
          useCache: true,
        });
        if (cancelled) return;

        const configDocument = content.documents.find(
          (item) => item.key === 'siteFooter/config'
        );
        if (configDocument?.payload) {
          const remoteData = configDocument.payload;
          const nextConfig = {
            enabled: remoteData.enabled !== false,
            content: remoteData.content || '',
            contentText: remoteData.contentText || remoteData.content || '',
            contentHtml: sanitizeFooterCommonHtml(
              remoteData.contentHtml || legacyTextToRichHtml(
                remoteData.contentText || remoteData.content || ''
              )
            ),
            contentFormat: remoteData.contentFormat || 'rich-html-v1',
            updatedAt: remoteData.updatedAt || null,
          };
          setFooterConfig(nextConfig);
          setFooterConfigLoadErrorMessage('');
        } else {
          setFooterConfig(createDefaultFooterConfigDraft());
          setFooterConfigLoadErrorMessage(
            '푸터 설정을 PostgreSQL에서 불러오지 못했습니다.'
          );
        }

        const remotePages = content.documents
          .filter(
            (item) => item.key.startsWith('footerPages/') && item.payload?.enabled !== false
          )
          .map((item) => ({
            ...item.payload,
            id: item.payload?.id || item.key.split('/').pop(),
          }))
          .sort((first, second) => {
            const orderDifference =
              (Number(first.sortOrder) || 0) - (Number(second.sortOrder) || 0);
            if (orderDifference !== 0) return orderDifference;
            const createdDifference =
              getFirestoreTimestampMillis(first.createdAt) -
              getFirestoreTimestampMillis(second.createdAt);
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
        console.error('PostgreSQL footer authority read error:', error);
        if (isInitialLoad) {
          setFooterConfig(createDefaultFooterConfigDraft());
          setFooterPages([]);
        }
        setFooterConfigLoadErrorMessage(
          '푸터 설정을 PostgreSQL에서 불러오지 못했습니다.'
        );
        setFooterPagesLoadErrorMessage(
          '푸터 메뉴를 PostgreSQL에서 불러오지 못했습니다.'
        );
        setFooterConfigReady(true);
        setFooterPagesReady(true);
      }
    };

    const cancelScheduledLoad = scheduleAfterUserFirstPaint(() => {
      void load();
    });

    return () => {
      cancelled = true;
      cancelScheduledLoad?.();
    };
  }, [
    footerRefreshRevision,
    setFooterConfig,
    setFooterConfigLoadErrorMessage,
    setFooterConfigReady,
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
