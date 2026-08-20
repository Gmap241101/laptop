import { clearAdminRouteIntent, getRouteStateFromPath, PROTECTED_USER_TABS } from './routing/appRoutes.js';
import { preloadCriticalUserHomeAssets, preconnectUserHomeAuthority, preloadUserHomeBootstrap } from './user/userHomeBootstrapService.js';

clearAdminRouteIntent();

const initialRoute = getRouteStateFromPath();
preconnectUserHomeAuthority();

if (initialRoute.view === 'user' && initialRoute.userTab === 'home') {
  void preloadUserHomeBootstrap()
    .then((bootstrap) => preloadCriticalUserHomeAssets(bootstrap))
    .catch(() => {});
} else if (initialRoute.view === 'user' && initialRoute.userTab === 'signup') {
  void import('./features/terms/termsService.js')
    .then(({ preloadSignupTermsPolicy }) => preloadSignupTermsPolicy())
    .catch(() => {});
} else if (initialRoute.view === 'user' && PROTECTED_USER_TABS.has(initialRoute.userTab)) {
  // Protected user routes receive the current terms policy in the verified Clerk/PostgreSQL
  // session bootstrap. If that optional bundle is unavailable, useUserTermsCompliance falls
  // back to the standalone policy endpoint without bypassing the existing readiness gate.
}


void import('./bootstrap/renderUserRoot.jsx')
  .then(({ renderUserRoot }) => {
    renderUserRoot();
  })
  .catch((error) => {
    console.error('User runtime bootstrap error:', error);
  });
