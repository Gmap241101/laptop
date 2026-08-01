import { useEffect, useMemo, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { SITE_SETTINGS_DOC_REF } from '../../firebase.js';
import {
  DEFAULT_SITE_SETTINGS,
  normalizeSiteSettings,
} from '../../utils/systemSettings.js';

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

  const normalizedSiteSettings = useMemo(
    () => normalizeSiteSettings(siteSettings),
    [siteSettings]
  );

  useEffect(() => {
    setSiteSettingsReady(false);

    const unsubscribe = onSnapshot(
      SITE_SETTINGS_DOC_REF,
      (snapshot) => {
        setSiteSettings(
          normalizeSiteSettings(
            snapshot.exists() ? snapshot.data() : DEFAULT_SITE_SETTINGS
          )
        );
        setSiteSettingsLoadErrorMessage('');
        setSiteSettingsReady(true);
      },
      (error) => {
        console.error('Site settings sync error:', error);
        setSiteSettings(DEFAULT_SITE_SETTINGS);
        setSiteSettingsLoadErrorMessage(
          '사이트 공통 설정을 불러오지 못했습니다. 기본 설정으로 표시합니다.'
        );
        setSiteSettingsReady(true);
      }
    );

    return unsubscribe;
  }, []);

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
