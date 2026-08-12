import React from 'react';
import { createRoot } from 'react-dom/client';

import UserApp from '../UserApp.jsx';
import ClerkStagingDiagnostics from '../clerk/ClerkStagingDiagnostics.jsx';
import UserRuntimeErrorBoundary from '../user/UserRuntimeErrorBoundary.jsx';
import '../index.css';

export const renderUserRoot = () => {
  const root = createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <UserRuntimeErrorBoundary
        resetKey="user-root"
        onRecover={() => window.location.assign('/')}
      >
        <UserApp runtimeSurface="user" />
      </UserRuntimeErrorBoundary>
      <ClerkStagingDiagnostics runtimeSurface="user" />
    </React.StrictMode>
  );
};
