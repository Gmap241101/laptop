import { useEffect, useState } from 'react';

import { subscribeSiteContentInvalidation } from './siteContentCutover.js';

const normalizeDomains = (domains) => new Set(
  (Array.isArray(domains) ? domains : [domains])
    .map((domain) => String(domain || '').trim())
    .filter(Boolean)
);

export default function useSiteContentRefreshRevision(domains) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const acceptedDomains = normalizeDomains(domains);
    let wasAway = document.visibilityState === 'hidden';
    const refresh = () => setRevision((current) => current + 1);
    const shouldRefresh = (detail) => {
      const domain = String(detail?.domain || 'all').trim() || 'all';
      return domain === 'all' || acceptedDomains.has(domain);
    };
    const unsubscribe = subscribeSiteContentInvalidation((detail) => {
      if (shouldRefresh(detail)) refresh();
    });
    const markAway = () => {
      wasAway = true;
    };
    const refreshAfterAway = () => {
      if (!wasAway || document.visibilityState === 'hidden') return;
      wasAway = false;
      refresh();
    };
    const onPageShow = (event) => {
      if (event.persisted) wasAway = true;
      refreshAfterAway();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markAway();
        return;
      }
      refreshAfterAway();
    };
    window.addEventListener('blur', markAway);
    window.addEventListener('focus', refreshAfterAway);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener('blur', markAway);
      window.removeEventListener('focus', refreshAfterAway);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [domains]);

  return revision;
}
