import { renderAppRoot } from './bootstrap/renderAppRoot.jsx';
import { APP_SURFACE } from './runtime/appSurface.js';
import { writeAdminRouteIntent } from './routing/appRoutes.js';

writeAdminRouteIntent();
renderAppRoot({ runtimeSurface: APP_SURFACE.ADMIN });
