import React from 'react';
import { createRoot } from 'react-dom/client';

import { getRouteStateFromPath } from '../routing/appRoutes.js';
import UserRuntimeErrorBoundary from '../user/UserRuntimeErrorBoundary.jsx';
import { preloadCriticalUserHomeAssets, preloadUserHomeBootstrap } from '../user/userHomeBootstrapService.js';
import '../index.css';

const UserApp = React.lazy(async () => {
  const modulePromise = import('../UserApp.jsx');
  const initialRoute = getRouteStateFromPath();
  if (initialRoute.view === 'user' && initialRoute.userTab === 'home') {
    void preloadUserHomeBootstrap()
      .then((bootstrap) => preloadCriticalUserHomeAssets(bootstrap))
      .catch(() => {});
  }
  return modulePromise;
});
const ClerkStagingDiagnostics = React.lazy(() => import('../clerk/ClerkStagingDiagnostics.jsx'));

const shouldShowClerkDiagnostics = () => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search || '').get('clerkTest') === '1';
};

export const renderUserRoot = () => {
  const root = createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <UserRuntimeErrorBoundary
        resetKey="user-root"
        onRecover={() => window.location.assign('/')}
      >
        <React.Suspense fallback={null}>
          <UserApp runtimeSurface="user" />
        </React.Suspense>
      </UserRuntimeErrorBoundary>
      {shouldShowClerkDiagnostics() ? (
        <React.Suspense fallback={null}>
          <ClerkStagingDiagnostics runtimeSurface="user" />
        </React.Suspense>
      ) : null}
    </React.StrictMode>
  );
};
