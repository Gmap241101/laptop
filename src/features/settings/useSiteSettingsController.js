import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SITE_SETTINGS,
  normalizeSiteSettings,
} from '../../utils/systemSettings.js';
import {
  getCachedSiteContentDomain,
  readSiteContentCutoverConfig,
  requestSiteContentDomain,
  SITE_CONTENT_DOMAINS,
} from '../content/siteContentCutover.js';
import useSiteContentRefreshRevision from '../content/useSiteContentRefreshRevision.js';

const readCachedSiteSettings = () => {
  const content = getCachedSiteContentDomain(SITE_CONTENT_DOMAINS.SITE_SETTINGS);
  const siteDocument = content?.documents?.find((item) => item.key === 'siteSettings/config');
  return siteDocument?.payload ? normalizeSiteSettings(siteDocument.payload) : null;
};

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
  const [siteSettings, setSiteSettings] = useState(() => readCachedSiteSettings() || DEFAULT_SITE_SETTINGS);
  const [siteSettingsReady, setSiteSettingsReady] = useState(() => Boolean(readCachedSiteSettings()));
  const [siteSettingsLoadErrorMessage, setSiteSettingsLoadErrorMessage] =
    useState('');

  const siteContentRefreshRevision = useSiteContentRefreshRevision(SITE_CONTENT_DOMAINS.SITE_SETTINGS);

  const normalizedSiteSettings = useMemo(
    () => normalizeSiteSettings(siteSettings),
    [siteSettings]
  );

  useEffect(() => {
    const cachedSiteSettings = readCachedSiteSettings();
    if (cachedSiteSettings) {
      setSiteSettings(cachedSiteSettings);
      setSiteSettingsReady(true);
    } else {
      setSiteSettingsReady(false);
    }
    let cancelled = false;
    const cutover = readSiteContentCutoverConfig();

    const load = async () => {
      try {
        const content = await requestSiteContentDomain({ domain: SITE_CONTENT_DOMAINS.SITE_SETTINGS, config: cutover });
        const siteDocument = content?.documents?.find((item) => item.key === 'siteSettings/config');
        if (!siteDocument?.payload) throw Object.assign(new Error('PostgreSQL site settings document is missing.'), { code: 'site_settings_postgres_missing' });
        if (cancelled) return;
        setSiteSettings(normalizeSiteSettings(siteDocument.payload));
        setSiteSettingsLoadErrorMessage('');
        setSiteSettingsReady(true);
      } catch (error) {
        if (cancelled) return;
        console.error('Site settings PostgreSQL authority error:', error);
        if (!cachedSiteSettings) setSiteSettings(DEFAULT_SITE_SETTINGS);
        setSiteSettingsLoadErrorMessage('사이트 공통 설정을 PostgreSQL에서 불러오지 못했습니다.');
        setSiteSettingsReady(true);
      }
    };

    void load();
    return () => { cancelled = true; };
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
