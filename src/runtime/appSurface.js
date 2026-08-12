export const APP_SURFACE = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

export const getAppSurfaceFromPath = (pathname = '') => {
  const normalizedPath = String(pathname || '/').replace(/\/+$/, '') || '/';
  return normalizedPath === '/admin' || normalizedPath.startsWith('/admin/')
    ? APP_SURFACE.ADMIN
    : APP_SURFACE.USER;
};

export const getCurrentAppSurface = () =>
  typeof window === 'undefined'
    ? APP_SURFACE.USER
    : getAppSurfaceFromPath(window.location.pathname);

export const isAdminAppSurface = (surface = getCurrentAppSurface()) =>
  surface === APP_SURFACE.ADMIN;

export const isUserAppSurface = (surface = getCurrentAppSurface()) =>
  surface === APP_SURFACE.USER;

export const navigateToAdminSurface = ({ replace = false } = {}) => {
  if (typeof window === 'undefined') return;
  const method = replace ? 'replace' : 'assign';
  window.location[method]('/admin');
};

export const navigateToUserSurface = ({ path = '/', replace = false } = {}) => {
  if (typeof window === 'undefined') return;
  const normalizedPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`;
  const method = replace ? 'replace' : 'assign';
  window.location[method](normalizedPath || '/');
};
