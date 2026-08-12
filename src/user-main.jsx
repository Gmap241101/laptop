import { renderAppRoot } from './bootstrap/renderAppRoot.jsx';
import { APP_SURFACE } from './runtime/appSurface.js';
import { clearAdminRouteIntent } from './routing/appRoutes.js';

clearAdminRouteIntent();
renderAppRoot({ runtimeSurface: APP_SURFACE.USER });
