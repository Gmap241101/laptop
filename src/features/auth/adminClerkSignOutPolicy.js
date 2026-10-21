import { APP_SURFACE } from '../../runtime/appSurface.js';

// ClerkJS may redirect to its default after-sign-out URL (often '/') when
// signOut() has no explicit destination. The administrator has its own /admin
// document and must remain on that document after a successful sign-out.
// User-surface sign-out semantics remain unchanged.
export const getAdminClerkSignOutOptions = (runtimeSurface) =>
  runtimeSurface === APP_SURFACE.ADMIN
    ? { redirectUrl: '/admin' }
    : undefined;
