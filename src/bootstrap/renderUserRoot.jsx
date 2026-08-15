import React from 'react';
import { createRoot } from 'react-dom/client';

import { getRouteStateFromPath } from '../routing/appRoutes.js';
import UserHomeBootstrapScreen from '../user/UserHomeBootstrapScreen.jsx';
import UserRuntimeErrorBoundary from '../user/UserRuntimeErrorBoundary.jsx';
import '../index.css';

const UserApp = React.lazy(() => import('../UserApp.jsx'));
const ClerkStagingDiagnostics = React.lazy(() => import('../clerk/ClerkStagingDiagnostics.jsx'));

const shouldShowClerkDiagnostics = () => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search || '').get('clerkTest') === '1';
};

export const renderUserRoot = () => {
  const root = createRoot(document.getElementById('root'));
  const initialRoute = getRouteStateFromPath();
  const homeFallback = initialRoute.view === 'user' && initialRoute.userTab === 'home'
    ? <UserHomeBootstrapScreen />
    : null;

  root.render(
    <React.StrictMode>
      <UserRuntimeErrorBoundary
        resetKey="user-root"
        onRecover={() => window.location.assign('/')}
      >
        <React.Suspense fallback={homeFallback}>
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
