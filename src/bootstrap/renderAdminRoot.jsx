import React from 'react';
import { createRoot } from 'react-dom/client';

import AdminApp from '../admin/AdminApp.jsx';
import AdminPanelRuntimeErrorBoundary from '../admin/AdminPanelRuntimeErrorBoundary.jsx';
import ClerkStagingDiagnostics from '../clerk/ClerkStagingDiagnostics.jsx';
import { clerkAdminClient } from '../clerk/clerkAdminClient.js';
import { setActiveClerkRuntimeClient } from '../clerk/clerkRuntimeClient.js';
import '../index.css';

setActiveClerkRuntimeClient(clerkAdminClient, 'admin');

export const renderAdminRoot = () => {
  const root = createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <AdminPanelRuntimeErrorBoundary
        resetKey="admin-root"
        onRecover={() => window.location.reload()}
      >
        <AdminApp />
      </AdminPanelRuntimeErrorBoundary>
      <ClerkStagingDiagnostics runtimeSurface="admin" />
    </React.StrictMode>
  );
};
