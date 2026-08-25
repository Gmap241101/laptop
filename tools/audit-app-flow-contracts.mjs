import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const failures = [];
const checks = [];
const check = (condition, message) => {
  checks.push(message);
  if (!condition) failures.push(message);
};

const extractBlock = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const contentStart = start + startMarker.length;
  const end = source.indexOf(endMarker, contentStart);
  return end < 0 ? '' : source.slice(contentStart, end);
};

const extractObjectKeys = (source, marker) => {
  const block = extractBlock(source, marker, '});');
  return new Set([...block.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]));
};

const extractStringSet = (source, marker) => {
  const block = extractBlock(source, marker, ']);');
  return new Set([...block.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]));
};

const appRoutes = read('src/routing/appRoutes.js');
const userMain = read('src/user-main.jsx');
const adminMain = read('src/admin-main.jsx');
const renderUserRoot = read('src/bootstrap/renderUserRoot.jsx');
const renderAdminRoot = read('src/bootstrap/renderAdminRoot.jsx');
const userApp = read('src/UserApp.jsx');
const adminApp = read('src/admin/AdminApp.jsx');
const userShell = read('src/user/UserShell.jsx');
const adminShell = read('src/admin/AdminShell.jsx');
const userWorkspace = read('src/user/UserWorkspace.jsx');
const adminWorkspace = read('src/admin/AdminWorkspace.jsx');
const contextSlices = read('src/context/appContextSlices.js');
const userContextAssembler = read('src/user/useUserContextAssembler.js');
const adminContextAssembler = read('src/admin/useAdminContextAssembler.js');
const adminDashboard = read('src/admin/AdminDashboardPanel.jsx');
const adminWorkspaceBridge = read('src/admin/useAdminWorkspaceBridgeController.js');
const boardDerivedSelectors = read('src/features/boards/useBoardDerivedSelectors.js');
const assetCatalogViewController = read('src/features/assets/useAssetCatalogViewController.js');
const appNavigationController = read('src/routing/useAppNavigationController.js');
const adminAccountManagementController = read('src/features/auth/useAdminAccountManagementController.js');

const legacyRootFiles = [
  'src/App.jsx',
  'src/main.jsx',
  'src/bootstrap/renderAppRoot.jsx',
  'src/shell/AppShell.jsx',
  'src/context/useAppContextAssembler.js',
  'src/context/appDynamicContextValues.js',
];
for (const file of legacyRootFiles) {
  check(!exists(file), `Retired shared application root stays deleted: ${file}.`);
}

check(renderUserRoot.includes("import '../index.css';"), 'User root imports the shared stylesheet.');
check(renderAdminRoot.includes("import '../index.css';"), 'Administrator root imports the shared stylesheet.');
check(userMain.includes("import('./bootstrap/renderUserRoot.jsx')"), 'User entry dynamically resolves the dedicated user root.');
check(!userMain.includes('renderAppRoot'), 'User entry never falls back to the retired shared root.');
check(adminMain.includes("import { renderAdminRoot } from './bootstrap/renderAdminRoot.jsx';"), 'Administrator entry mounts the dedicated administrator root.');
check(!adminMain.includes('renderAppRoot'), 'Administrator entry never falls back to the retired shared root.');
check(renderUserRoot.includes("import('../UserApp.jsx')"), 'User root lazy-loads UserApp.');
check(!renderUserRoot.includes('../admin/AdminApp.jsx'), 'User root never references AdminApp.');
check(renderAdminRoot.includes("import AdminApp from '../admin/AdminApp.jsx';"), 'Administrator root imports AdminApp.');
check(!renderAdminRoot.includes('../UserApp.jsx'), 'Administrator root never references UserApp.');

const protectedTabs = extractStringSet(appRoutes, 'export const PROTECTED_USER_TABS = new Set([');
check(protectedTabs.size > 0, 'Protected user tab set is declared in appRoutes.js.');
check(userWorkspace.includes('PROTECTED_USER_TABS.has(userTab)'), 'UserWorkspace uses the shared protected user tab set.');
check(contextSlices.includes('PROTECTED_USER_TABS.has(userTab)'), 'Context selection uses the shared protected user tab set.');

const routeMapBlock = extractBlock(appRoutes, 'export const USER_ROUTE_PATHS = {', '};');
const routeEntries = [...routeMapBlock.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*['"]([^'"]*)['"],?$/gm)]
  .map((match) => ({ tab: match[1], route: match[2] }));
check(routeEntries.length >= 10, 'User route map contains the expected route set.');
for (const { tab, route } of routeEntries) {
  if (tab === 'home') {
    check(appRoutes.includes("if (pathname === '/')") && appRoutes.includes("userTab: 'home'"), 'Home route resolves to the user home tab.');
  } else {
    check(appRoutes.includes(`pathname === '${route}'`) && appRoutes.includes(`userTab: '${tab}'`), `Route ${route} resolves to user tab ${tab}.`);
  }
}

check(userApp.includes("import useUserContextAssembler from './user/useUserContextAssembler.js';"), 'UserApp uses the dedicated user context assembler.');
check(userApp.includes("import UserShell from './user/UserShell.jsx';"), 'UserApp renders the dedicated user shell.');
check(userApp.includes('useUserContextAssembler({'), 'UserApp assembles only user panel contexts.');
check(!/\buseAdmin[A-Z]/.test(userApp), 'UserApp does not instantiate administrator controllers.');
check(!userApp.includes("./admin/"), 'UserApp has no direct administrator imports.');
check(adminApp.includes("import useAdminContextAssembler from './useAdminContextAssembler.js';"), 'AdminApp uses the dedicated administrator context assembler.');
check(adminApp.includes("import AdminShell from './AdminShell.jsx';"), 'AdminApp renders the dedicated administrator shell.');
check(adminApp.includes('useAdminContextAssembler({'), 'AdminApp assembles administrator panel contexts.');

for (const [source, label] of [[userContextAssembler, 'User'], [adminContextAssembler, 'Administrator']]) {
  check(source.includes('useStableContextGroups'), `${label} context assembler uses stable context groups.`);
  check(source.includes('APP_CONTEXT_GROUP_KEYS'), `${label} context assembler reuses the canonical context slice definitions.`);
}
check(userContextAssembler.includes('getUserPanelContextKey'), 'User context assembler resolves the current user panel context key.');
check(adminContextAssembler.includes('getAdminPanelContextKey'), 'Administrator context assembler resolves the current administrator panel context key.');
check(adminContextAssembler.includes('adminRequestsPrerequisitesReady:'), 'Administrator context assembler derives administrator request readiness.');
check(adminContextAssembler.includes('currentAuthRoleReady') && adminContextAssembler.includes('currentAuthRoleErrorMessage'), 'Administrator request readiness remains tied to the Clerk/PostgreSQL role gate.');

const guardCall = extractBlock(userApp, 'useSelectedRentalAssetAvailabilityGuard({', '});');
for (const requiredKey of ['selectedLaptop', 'selectedLaptopAvailability', 'requestSubmitLoading', 'selectedLaptopId', 'setSelectedLaptopId', 'triggerToast']) {
  check(new RegExp(`\\b${requiredKey}\\b`).test(guardCall), `Selected rental asset guard receives ${requiredKey}.`);
}

check(userApp.includes('useUserAssetCatalogViewController();'), 'UserApp owns only the user asset catalog view controller.');
check(adminApp.includes('useAssetCatalogViewController();'), 'AdminApp owns the administrator asset catalog view controller.');
for (const key of ['adminAvailabilityFilter', 'adminLaptopQuery', 'adminSelectedAssetCategory', 'availabilityFilter', 'query', 'selectedAssetCategory']) {
  check(assetCatalogViewController.includes(key), `Asset catalog view controller exposes ${key}.`);
}

check(userApp.includes('} = useBoardDerivedSelectors({'), 'UserApp delegates notice/FAQ derived state to the board selector hook.');
check(adminApp.includes('} = useBoardDerivedSelectors({'), 'AdminApp delegates notice/FAQ derived state to the board selector hook.');
for (const key of ['activeFaqCategoryName', 'categoryFilteredFaqPosts', 'displayedFaqPosts', 'paginatedAdminFaqPosts', 'paginatedAdminNoticePosts', 'selectedNoticePost']) {
  check(boardDerivedSelectors.includes(key), `Board selector hook exposes ${key}.`);
}

check(appNavigationController.includes('readUserAccountStatusView'), 'User account status view state is owned by the navigation controller.');
check(appNavigationController.includes('setUserAccountStatusView,'), 'Navigation controller exposes the account-status setter.');
check(userApp.includes('useAppNavigationController({'), 'UserApp uses the canonical application navigation controller.');

check(adminApp.includes('} = useAdminAccountManagementState({ adminTab });'), 'AdminApp delegates administrator account tab-entry state to the account management hook.');
check(adminAccountManagementController.includes('export const useAdminAccountManagementState = ({ adminTab }) => {'), 'Administrator account management state hook accepts the active administrator tab.');
const adminAccountStateBlock = extractBlock(adminAccountManagementController, 'export const useAdminAccountManagementState = ({ adminTab }) => {', 'export default function useAdminAccountManagementController(');
check(adminAccountStateBlock.includes("if (adminTab !== 'adminAccounts') return;") && adminAccountStateBlock.includes('setAdminAccountForm(createDefaultAdminAccountForm());'), 'Administrator account state hook owns tab-entry form reset.');

check(adminApp.includes("import useAdminWorkspaceBridgeController from './useAdminWorkspaceBridgeController.js';"), 'AdminApp delegates administrator workspace bridge state to the dedicated controller.');
for (const key of ['adminMemberAccountsNavigationRequest', 'adminRequestsMutationVersion', 'adminRequestsNavigationRequest', 'clearAdminRequestPanelSelection', 'handleAdminRequestsControllerStateChange', 'notifyAdminRequestMutation', 'updateAdminRequestPanelRequests']) {
  check(adminWorkspaceBridge.includes(key), `Administrator workspace bridge exposes ${key}.`);
}

const adminMenuTabs = new Set([...adminWorkspace.matchAll(/\[\s*['"]([A-Za-z][A-Za-z0-9]*)['"]\s*,\s*[A-Za-z][A-Za-z0-9]*\s*,/g)].map((match) => match[1]));
const adminRenderedTabs = new Set([...adminWorkspace.matchAll(/adminTab\s*===\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
const adminContextTabs = extractObjectKeys(contextSlices, 'const ADMIN_TAB_CONTEXT_KEY = Object.freeze({');
check(adminMenuTabs.size >= 20, 'Administrator menu tabs are discoverable.');
for (const tab of adminMenuTabs) {
  check(adminRenderedTabs.has(tab), `Administrator menu tab ${tab} has a render branch.`);
  check(adminContextTabs.has(tab), `Administrator menu tab ${tab} has a context mapping.`);
}

check(userShell.includes('<UserWorkspace'), 'UserShell renders UserWorkspace.');
check(adminShell.includes('<AdminWorkspace'), 'AdminShell renders AdminWorkspace.');
check(!userShell.includes('AdminWorkspace'), 'UserShell does not reference AdminWorkspace.');
check(!adminShell.includes('UserWorkspace'), 'AdminShell does not reference UserWorkspace.');

const dashboardHeadingBlocks = [...adminDashboard.matchAll(/<DashboardSectionHeading([\s\S]*?)\/>/g)].map((match) => match[1]);
check(dashboardHeadingBlocks.length >= 3, 'Administrator dashboard section headings are discoverable.');
check(dashboardHeadingBlocks.every((block) => /\bid=/.test(block)), 'Every administrator dashboard section heading has a stable id.');
check(adminDashboard.includes('aria-labelledby="dashboard-today-work-heading"'), 'Today-work dashboard section references its heading id.');

if (failures.length > 0) {
  console.error('Application flow contract audit: FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}



// Stage 4 final source-retirement contract: these files were confirmed unreachable from both MPA entries.
for (const retiredRelativePath of [
  'src/user/UserHomeBootstrapScreen.jsx',
  'src/features/compatibility/memberProfileIdentityAuthority.js',
  'src/features/compatibility/memberStatusRestrictionWriteMirrorRetirement.js',
  'src/features/compatibility/firestoreWriteMirrorRetirement.js',
]) {
  check(
    !exists(retiredRelativePath),
    `${retiredRelativePath} must stay retired after final runtime-source cleanup`,
  );
}

console.log(`Application flow contract audit: PASS (${checks.length} contracts checked, ${routeEntries.length} user routes, ${adminMenuTabs.size} administrator tabs)`);
