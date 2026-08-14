import { requestNoticeBoard } from './features/boards/boardContentCutover.js';
import {
  POLICY_CONTENT_DOMAINS,
  requestPolicyContentDomain,
} from './features/content/policyContentCutover.js';
import {
  requestSiteContentDomain,
  SITE_CONTENT_DOMAINS,
} from './features/content/siteContentCutover.js';
import { clearAdminRouteIntent, getRouteStateFromPath } from './routing/appRoutes.js';

const warmUserHomeCriticalData = () => {
  void Promise.allSettled([
    requestSiteContentDomain({
      domain: SITE_CONTENT_DOMAINS.SITE_SETTINGS,
      useCache: true,
    }),
    requestSiteContentDomain({
      domain: SITE_CONTENT_DOMAINS.HOME,
      useCache: true,
    }),
    requestNoticeBoard({
      home: true,
      useCache: true,
    }),
    requestPolicyContentDomain({
      domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
      useCache: true,
    }),
  ]);
};

clearAdminRouteIntent();

const initialRoute = getRouteStateFromPath();
if (initialRoute.view === 'user' && initialRoute.userTab === 'home') {
  warmUserHomeCriticalData();
}

void import('./bootstrap/renderUserRoot.jsx')
  .then(({ renderUserRoot }) => {
    renderUserRoot();
  })
  .catch((error) => {
    console.error('User runtime bootstrap error:', error);
  });
