import { useEffect, useMemo, useState } from 'react';
import { getDoc, onSnapshot } from 'firebase/firestore';
import { SITE_SETTINGS_DOC_REF } from '../../firebase.js';
import {
  DEFAULT_SITE_SETTINGS,
  normalizeSiteSettings,
} from '../../utils/systemSettings.js';
import {
  readSiteContentCutoverConfig,
  requestSiteContentDomain,
  SITE_CONTENT_DOMAINS,
} from '../content/siteContentCutover.js';
import useSiteContentRefreshRevision from '../content/useSiteContentRefreshRevision.js';

const applySiteDocumentPresentation = (siteSettings) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty('--mk-orange', siteSettings.primaryColor);
  root.style.setProperty('--mk-orange-dark', siteSettings.primaryDarkColor);
  root.style.setProperty('--mk-orange-soft', `${siteSettings.primaryColor}1A`);
  root.style.setProperty('--mk-orange-border', `${siteSettings.primaryColor}40`);
  root.style.setProperty('--mk-orange-ring', `${siteSettings.primaryColor}26`);
  root.style.setProperty('--mk-orange-shadow', `${siteSettings.primaryColor}33`);

  document.title = siteSettings.browserTitle || siteSettings.siteName;

  let descriptionMeta = document.querySelector('meta[name="description"]');
  if (!descriptionMeta) {
    descriptionMeta = document.createElement('meta');
    descriptionMeta.setAttribute('name', 'description');
    document.head.appendChild(descriptionMeta);
  }
  descriptionMeta.setAttribute('content', siteSettings.metaDescription || '');

  let favicon = document.querySelector('link[rel="icon"]');
  if (siteSettings.faviconUrl) {
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.setAttribute('rel', 'icon');
      document.head.appendChild(favicon);
    }
    favicon.setAttribute('href', siteSettings.faviconUrl);
  }
};

export default function useSiteSettingsController() {
  const [siteSettings, setSiteSettings] = useState(DEFAULT_SITE_SETTINGS);
  const [siteSettingsReady, setSiteSettingsReady] = useState(false);
  const [siteSettingsLoadErrorMessage, setSiteSettingsLoadErrorMessage] =
    useState('');

  const siteContentRefreshRevision = useSiteContentRefreshRevision(SITE_CONTENT_DOMAINS.SITE_SETTINGS);

  const normalizedSiteSettings = useMemo(
    () => normalizeSiteSettings(siteSettings),
    [siteSettings]
  );

  useEffect(() => {
    setSiteSettingsReady(false);
    const cutover = readSiteContentCutoverConfig();

    if (cutover.readRequested) {
      let cancelled = false;
      const load = async () => {
        try {
          const content = await requestSiteContentDomain({ domain: SITE_CONTENT_DOMAINS.SITE_SETTINGS, config: cutover });
          const document = content?.documents?.find((item) => item.key === 'siteSettings/config');
          if (!document?.payload) throw Object.assign(new Error('PostgreSQL site settings document is missing.'), { code: 'site_settings_postgres_missing' });
          if (cancelled) return;
          setSiteSettings(normalizeSiteSettings(document.payload));
          setSiteSettingsLoadErrorMessage('');
          setSiteSettingsReady(true);
          return;
        } catch (postgresError) {
          if (cutover.authorityRequested) {
            if (cancelled) return;
            console.error('Site settings PostgreSQL authority error:', postgresError);
            setSiteSettings(DEFAULT_SITE_SETTINGS);
            setSiteSettingsLoadErrorMessage('사이트 공통 설정을 PostgreSQL에서 불러오지 못했습니다.');
            setSiteSettingsReady(true);
            return;
          }
          try {
            const snapshot = await getDoc(SITE_SETTINGS_DOC_REF);
            if (cancelled) return;
            setSiteSettings(normalizeSiteSettings(snapshot.exists() ? snapshot.data() : DEFAULT_SITE_SETTINGS));
            setSiteSettingsLoadErrorMessage('');
            setSiteSettingsReady(true);
          } catch (firestoreError) {
            if (cancelled) return;
            console.error('Site settings PostgreSQL + Firestore fallback error:', postgresError, firestoreError);
            setSiteSettings(DEFAULT_SITE_SETTINGS);
            setSiteSettingsLoadErrorMessage('사이트 공통 설정을 불러오지 못했습니다. 기본 설정으로 표시합니다.');
            setSiteSettingsReady(true);
          }
        }
      };
      void load();
      return () => { cancelled = true; };
    }

    const unsubscribe = onSnapshot(
      SITE_SETTINGS_DOC_REF,
      (snapshot) => {
        setSiteSettings(normalizeSiteSettings(snapshot.exists() ? snapshot.data() : DEFAULT_SITE_SETTINGS));
        setSiteSettingsLoadErrorMessage('');
        setSiteSettingsReady(true);
      },
      (error) => {
        console.error('Site settings sync error:', error);
        setSiteSettings(DEFAULT_SITE_SETTINGS);
        setSiteSettingsLoadErrorMessage('사이트 공통 설정을 불러오지 못했습니다. 기본 설정으로 표시합니다.');
        setSiteSettingsReady(true);
      }
    );

    return unsubscribe;
  }, [siteContentRefreshRevision]);

  useEffect(() => {
    applySiteDocumentPresentation(normalizedSiteSettings);
  }, [normalizedSiteSettings]);

  return {
    normalizedSiteSettings,
    siteSettings,
    siteSettingsLoadErrorMessage,
    siteSettingsReady,
  };
}
