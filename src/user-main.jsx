import { clearAdminRouteIntent, getRouteStateFromPath, PROTECTED_USER_TABS } from './routing/appRoutes.js';
import { preconnectUserHomeAuthority, preloadUserHomeBootstrap } from './user/userHomeBootstrapService.js';

clearAdminRouteIntent();

const initialRoute = getRouteStateFromPath();
preconnectUserHomeAuthority();
if (initialRoute.view === 'user' && initialRoute.userTab === 'home') {
  void preloadUserHomeBootstrap().catch(() => {});
} else if (initialRoute.view === 'user' && initialRoute.userTab === 'signup') {
  void import('./features/terms/termsService.js')
    .then(({ preloadSignupTermsPolicy }) => preloadSignupTermsPolicy())
    .catch(() => {});
} else if (initialRoute.view === 'user' && PROTECTED_USER_TABS.has(initialRoute.userTab)) {
  void import('./features/terms/termsService.js')
    .then(({ preloadSignupTermsPolicy }) => preloadSignupTermsPolicy())
    .catch(() => {});
}

void import('./bootstrap/renderUserRoot.jsx')
  .then(({ renderUserRoot }) => {
    renderUserRoot();
  })
  .catch((error) => {
    console.error('User runtime bootstrap error:', error);
  });
