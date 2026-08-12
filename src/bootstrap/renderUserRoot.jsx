import React from 'react';
import { createRoot } from 'react-dom/client';

import UserApp from '../UserApp.jsx';
import ClerkStagingDiagnostics from '../clerk/ClerkStagingDiagnostics.jsx';
import '../index.css';

export const renderUserRoot = () => {
  const root = createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <UserApp runtimeSurface="user" />
      <ClerkStagingDiagnostics runtimeSurface="user" />
    </React.StrictMode>
  );
};
