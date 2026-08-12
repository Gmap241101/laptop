import React from 'react';
import { createRoot } from 'react-dom/client';

import AdminApp from '../admin/AdminApp.jsx';
import ClerkStagingDiagnostics from '../clerk/ClerkStagingDiagnostics.jsx';
import '../index.css';

export const renderAdminRoot = () => {
  const root = createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <AdminApp />
      <ClerkStagingDiagnostics runtimeSurface="admin" />
    </React.StrictMode>
  );
};
