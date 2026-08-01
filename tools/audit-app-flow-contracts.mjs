import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

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
  return new Set(
    [...block.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(
      (match) => match[1]
    )
  );
};

const extractStringSet = (source, marker) => {
  const block = extractBlock(source, marker, ']);');
  return new Set(
    [...block.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
  );
};

const extractJsxProps = (source, componentName) => {
  const match = source.match(
    new RegExp(`<${componentName}\\s+([\\s\\S]*?)\\n\\s*/>`)
  );
  if (!match) return new Set();

  return new Set(
    [...match[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*(?:=|$)/gm)].map(
      (entry) => entry[1]
    )
  );
};

const extractDestructuredParameters = (source, marker, endMarker) => {
  const block = extractBlock(source, marker, endMarker);
  return new Set(
    block
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => /^[A-Za-z][A-Za-z0-9]*$/.test(entry))
  );
};

const appRoutes = read('src/routing/appRoutes.js');
const userWorkspace = read('src/user/UserWorkspace.jsx');
const contextSlices = read('src/context/appContextSlices.js');
const appSource = read('src/App.jsx');
const appShell = read('src/shell/AppShell.jsx');
const adminWorkspace = read('src/admin/AdminWorkspace.jsx');
const adminDashboard = read('src/admin/AdminDashboardPanel.jsx');
const adminWorkspaceBridge = read('src/admin/useAdminWorkspaceBridgeController.js');
const boardDerivedSelectors = read('src/features/boards/useBoardDerivedSelectors.js');
const assetCatalogViewController = read('src/features/assets/useAssetCatalogViewController.js');
const appInitializationReadinessController = read('src/shell/useAppInitializationReadinessController.js');
const appNavigationController = read('src/routing/useAppNavigationController.js');
const rentalDataSubscriptionController = read('src/features/requests/useRentalDataSubscriptionController.js');
const adminAccountManagementController = read('src/features/auth/useAdminAccountManagementController.js');
const appContextAssembler = read('src/context/useAppContextAssembler.js');
const appDynamicContextValues = read('src/context/appDynamicContextValues.js');

const protectedTabs = extractStringSet(
  appRoutes,
  'export const PROTECTED_USER_TABS = new Set(['
);
check(
  protectedTabs.size > 0,
  'Protected user tab set is declared in appRoutes.js.'
);
check(
  userWorkspace.includes('PROTECTED_USER_TABS.has(userTab)'),
  'UserWorkspace uses the shared protected user tab set.'
);
check(
  contextSlices.includes('PROTECTED_USER_TABS.has(userTab)'),
  'Context selection uses the shared protected user tab set.'
);

const hardcodedProtectedTabPattern =
  /\[\s*['"]rental['"]\s*,\s*['"]history['"]\s*\]\.includes\(userTab\)/;
check(
  !hardcodedProtectedTabPattern.test(userWorkspace) &&
    !hardcodedProtectedTabPattern.test(contextSlices),
  'No duplicate protected-tab array remains in workspace or context selection.'
);

const routeMapBlock = extractBlock(
  appRoutes,
  'export const USER_ROUTE_PATHS = {',
  '};'
);
const routeEntries = [...routeMapBlock.matchAll(
  /^\s{2}([A-Za-z][A-Za-z0-9]*):\s*['"]([^'"]*)['"],?$/gm
)].map((match) => ({ tab: match[1], route: match[2] }));

check(routeEntries.length >= 10, 'User route map contains the expected route set.');
routeEntries.forEach(({ tab, route }) => {
  if (tab === 'home') {
    check(
      appRoutes.includes("if (pathname === '/')") &&
        appRoutes.includes("userTab: 'home'"),
      'Home route resolves to the user home tab.'
    );
    return;
  }

  check(
    appRoutes.includes(`pathname === '${route}'`) &&
      appRoutes.includes(`userTab: '${tab}'`),
    `Route ${route} resolves to user tab ${tab}.`
  );
});

const appShellParameters = extractDestructuredParameters(
  appShell,
  'const AppShell = ({',
  '}) => {'
);
const appShellProps = extractJsxProps(appSource, 'AppShell');
const missingAppShellProps = [...appShellParameters].filter(
  (name) => !appShellProps.has(name)
);
const extraAppShellProps = [...appShellProps].filter(
  (name) => !appShellParameters.has(name)
);
check(
  appShellParameters.size > 0 && appShellProps.size > 0,
  'AppShell parameter and call-site contracts are readable.'
);
check(
  missingAppShellProps.length === 0,
  `AppShell call supplies every declared prop${
    missingAppShellProps.length ? `: ${missingAppShellProps.join(', ')}` : ''
  }.`
);
check(
  extraAppShellProps.length === 0,
  `AppShell call has no undeclared prop${
    extraAppShellProps.length ? `: ${extraAppShellProps.join(', ')}` : ''
  }.`
);

const guardCall = extractBlock(
  appSource,
  'useSelectedRentalAssetAvailabilityGuard({',
  '});'
);
[
  'selectedLaptop',
  'selectedLaptopAvailability',
  'selectedLaptopId',
  'setSelectedLaptopId',
  'triggerToast',
].forEach((requiredKey) => {
  check(
    new RegExp(`\\b${requiredKey}\\b`).test(guardCall),
    `Selected rental asset guard receives ${requiredKey}.`
  );
});

const adminMenuTabs = new Set(
  [...adminWorkspace.matchAll(
    /\[\s*['"]([A-Za-z][A-Za-z0-9]*)['"]\s*,\s*[A-Za-z][A-Za-z0-9]*\s*,/g
  )].map((match) => match[1])
);
const adminRenderedTabs = new Set(
  [...adminWorkspace.matchAll(/adminTab\s*===\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1]
  )
);
const adminContextTabs = extractObjectKeys(
  contextSlices,
  'const ADMIN_TAB_CONTEXT_KEY = Object.freeze({'
);

const missingAdminRenderTabs = [...adminMenuTabs].filter(
  (tab) => !adminRenderedTabs.has(tab)
);
const missingAdminContextTabs = [...adminMenuTabs].filter(
  (tab) => !adminContextTabs.has(tab)
);
check(adminMenuTabs.size >= 20, 'Administrator menu tabs are discoverable.');
check(
  missingAdminRenderTabs.length === 0,
  `Every administrator menu tab has a render branch${
    missingAdminRenderTabs.length ? `: ${missingAdminRenderTabs.join(', ')}` : ''
  }.`
);
check(
  missingAdminContextTabs.length === 0,
  `Every administrator menu tab has a context mapping${
    missingAdminContextTabs.length ? `: ${missingAdminContextTabs.join(', ')}` : ''
  }.`
);


check(
  appSource.includes("import useAdminWorkspaceBridgeController from './admin/useAdminWorkspaceBridgeController.js';") &&
    appSource.includes('} = useAdminWorkspaceBridgeController();'),
  'App delegates administrator workspace bridge state to the dedicated controller.'
);
[
  'adminMemberAccountsNavigationRequest',
  'adminRequestsMutationVersion',
  'adminRequestsNavigationRequest',
  'clearAdminRequestPanelSelection',
  'getAdminRequestById',
  'handleAdminRequestsControllerStateChange',
  'notifyAdminRequestMutation',
  'resetAdminRequestPanelPage',
  'setAdminMemberAccountsNavigationRequest',
  'setAdminRequestsNavigationRequest',
  'updateAdminRequestPanelRequests',
].forEach((bridgeKey) => {
  check(
    adminWorkspaceBridge.includes(bridgeKey),
    `Administrator workspace bridge exposes ${bridgeKey}.`
  );
});
check(
  !appSource.includes('const adminRequestsControllerRef = useRef(') &&
    !appSource.includes('setAdminRequestsMutationVersion((currentVersion)'),
  'App has no duplicate administrator request bridge registry or mutation-version state.'
);


check(
  appSource.includes("import useBoardDerivedSelectors from './features/boards/useBoardDerivedSelectors.js';") &&
    appSource.includes('} = useBoardDerivedSelectors({'),
  'App delegates board filtering, numbering, and pagination to the dedicated selector hook.'
);
[
  'activeFaqCategoryName',
  'adminFaqTotalPages',
  'adminNoticeTotalPages',
  'adminPinnedFaqPosts',
  'adminPinnedNoticePosts',
  'adminRegularFaqPosts',
  'adminRegularNoticePosts',
  'categoryFilteredFaqPosts',
  'displayedFaqPosts',
  'faqCategoryNameById',
  'faqTotalPages',
  'noticeRegularPostNumberById',
  'noticeTotalPages',
  'paginatedAdminFaqPosts',
  'paginatedAdminNoticePosts',
  'paginatedNoticePosts',
  'pinnedNoticePosts',
  'regularFaqPosts',
  'regularNoticePosts',
  'safeAdminFaqPage',
  'safeAdminNoticePage',
  'safeFaqPage',
  'safeNoticePage',
  'selectedNoticePost',
].forEach((selectorKey) => {
  check(
    boardDerivedSelectors.includes(selectorKey),
    `Board selector hook exposes ${selectorKey}.`
  );
});
check(
  !appSource.includes('const allPinnedNoticePosts = useMemo(') &&
    !appSource.includes('const categoryFilteredFaqPosts = useMemo(') &&
    !appSource.includes('const displayedFaqPosts = useMemo('),
  'App has no duplicate notice or FAQ derived-selector implementation.'
);


check(
  appSource.includes("import useAssetCatalogViewController from './features/assets/useAssetCatalogViewController.js';") &&
    appSource.includes('} = useAssetCatalogViewController();'),
  'App delegates asset catalog filters, upload visibility, and responsive grid state to the dedicated controller.'
);
[
  'adminAvailabilityFilter',
  'adminLaptopQuery',
  'adminSelectedAssetCategory',
  'assetGridColumns',
  'availabilityFilter',
  'query',
  'selectedAssetCategory',
  'setAdminAvailabilityFilter',
  'setAdminLaptopQuery',
  'setAdminSelectedAssetCategory',
  'setAvailabilityFilter',
  'setQuery',
  'setSelectedAssetCategory',
  'setShowUploadPanel',
  'showUploadPanel',
].forEach((viewKey) => {
  check(
    assetCatalogViewController.includes(viewKey),
    `Asset catalog view controller exposes ${viewKey}.`
  );
});
check(
  !appSource.includes("const [query, setQuery] = useState('');") &&
    !appSource.includes("const [adminLaptopQuery, setAdminLaptopQuery] = useState('');") &&
    !appSource.includes('const [showUploadPanel, setShowUploadPanel] = useState(false);') &&
    !appSource.includes('useResponsiveAssetGridColumns();'),
  'App has no duplicate asset catalog filter, upload-panel, or responsive-grid state implementation.'
);


check(
  appSource.includes("import useAppInitializationReadinessController from './shell/useAppInitializationReadinessController.js';") &&
    appSource.includes('} = useAppInitializationReadinessController();'),
  'App delegates Firebase initialization readiness state to the dedicated controller.'
);
[
  'firebaseLoadErrorMessage',
  'firebaseReady',
  'setFirebaseLoadErrorMessage',
  'setFirebaseReady',
].forEach((readinessKey) => {
  check(
    appInitializationReadinessController.includes(readinessKey),
    `App initialization readiness controller exposes ${readinessKey}.`
  );
});
check(
  !appSource.includes('const [firebaseReady, setFirebaseReady] = useState(false);') &&
    !appSource.includes("const [firebaseLoadErrorMessage, setFirebaseLoadErrorMessage] = useState('');"),
  'App has no duplicate Firebase initialization readiness state implementation.'
);
check(
  !appSource.includes('initializedRemoteFormRef') &&
    rentalDataSubscriptionController.includes('const initializedRemoteFormRef = useRef(false);'),
  'Remote rental form initialization guard is owned by the rental data subscription controller.'
);

check(
  appNavigationController.includes('readUserAccountStatusView') &&
    appNavigationController.includes('const [userAccountStatusView, setUserAccountStatusView] = useState('),
  'User account status view state is owned by the application navigation state hook.'
);
check(
  appNavigationController.includes('setUserAccountStatusView,') &&
    appNavigationController.includes('userAccountStatusView,'),
  'Application navigation state exposes the user account status view and setter.'
);
check(
  !appSource.includes('readUserAccountStatusView') &&
    !appSource.includes('const [userAccountStatusView, setUserAccountStatusView] = useState('),
  'App has no duplicate user account status navigation state implementation.'
);
const accountStatusNavigationBlock = extractBlock(
  appNavigationController,
  'const showUserAccountStatus = useCallback(',
  'useEffect(() => {'
);
check(
  accountStatusNavigationBlock.includes('writeUserAccountStatusView(nextView);'),
  'User account status navigation persists the selected status view.'
);
check(
  accountStatusNavigationBlock.includes('setUserAccountStatusView(nextView);'),
  'User account status navigation updates the in-memory navigation state.'
);
check(
  accountStatusNavigationBlock.includes("navigateToUserTab('accountStatus'"),
  'User account status navigation opens the account-status route.'
);


check(
  appSource.includes('} = useAdminAccountManagementState({ adminTab });'),
  'App delegates administrator account tab-entry initialization to the account management state hook.'
);
check(
  adminAccountManagementController.includes('export const useAdminAccountManagementState = ({ adminTab }) => {'),
  'Administrator account management state hook accepts the active administrator tab.'
);
const adminAccountStateBlock = extractBlock(
  adminAccountManagementController,
  'export const useAdminAccountManagementState = ({ adminTab }) => {',
  'export default function useAdminAccountManagementController('
);
check(
  adminAccountStateBlock.includes("if (adminTab !== 'adminAccounts') return;") &&
    adminAccountStateBlock.includes('setAdminAccountForm(createDefaultAdminAccountForm());') &&
    adminAccountStateBlock.includes('setAdminAccountPage(1);'),
  'Administrator account state hook resets the registration form and page when the administrator-account tab opens.'
);
check(
  !appSource.includes("if (adminTab === 'adminAccounts')") &&
    !appSource.includes('setAdminAccountForm(createDefaultAdminAccountForm());'),
  'App has no duplicate administrator account tab-entry initialization effect.'
);
check(
  !/\buseEffect\s*\(/.test(appSource),
  'App has no direct useEffect calls after administrator account initialization is delegated.'
);
check(
  !appSource.includes('createDefaultAdminAccountForm,'),
  'App no longer imports the administrator account form factory solely for tab-entry initialization.'
);


check(
  appSource.includes('const dynamicContextSourceValues = {') &&
    appSource.includes('dynamicSourceValues: dynamicContextSourceValues,'),
  'App supplies a flat dynamic context source contract to the context assembler.'
);
check(
  !appSource.includes('const dynamicContextValueGroups = {') &&
    !appSource.includes('dynamicValueGroups: dynamicContextValueGroups,'),
  'App no longer owns feature-grouped dynamic context assembly.'
);
check(
  appContextAssembler.includes("import { createAppDynamicContextValues } from './appDynamicContextValues.js';") &&
    appContextAssembler.includes('const dynamicValues = createAppDynamicContextValues(dynamicSourceValues);'),
  'The context assembler derives the flat dynamic context contract in the context layer.'
);
[
  'adminRequestsPrerequisitesReady',
  'memberAccountsPrerequisitesReady',
  'memberDirectoryBorrowers',
  'memberDirectorySettings',
  'memberDirectoryTeams',
  'onAdminRequestsControllerStateChange',
  'onMemberDirectoryDeferredStateChange',
  'onSignupPolicyDeferredStateChange',
  'signupPolicySettings',
].forEach((derivedKey) => {
  check(
    appDynamicContextValues.includes(derivedKey),
    `Dynamic context derivation exposes ${derivedKey}.`
  );
});
check(
  appDynamicContextValues.includes('...dynamicValues') &&
    appDynamicContextValues.includes('handleAdminRequestsControllerStateChange,') &&
    appDynamicContextValues.includes('handleMemberDirectoryDeferredStateChange,') &&
    appDynamicContextValues.includes('handleSignupPolicyDeferredStateChange,'),
  'Internal deferred-state handlers are converted to public context aliases instead of leaking as extra keys.'
);

const dashboardHeadingBlocks = [
  ...adminDashboard.matchAll(/<DashboardSectionHeading([\s\S]*?)\/>/g),
].map((match) => match[1]);
check(
  dashboardHeadingBlocks.length >= 3,
  'Administrator dashboard section headings are discoverable.'
);
check(
  dashboardHeadingBlocks.every((block) => /\bid=/.test(block)),
  'Every administrator dashboard section heading has a stable id.'
);
check(
  adminDashboard.includes('aria-labelledby="dashboard-today-work-heading"'),
  'Today-work dashboard section references its heading id.'
);

if (failures.length > 0) {
  console.error('Application flow contract audit: FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Application flow contract audit: PASS (${checks.length} contracts checked, ${routeEntries.length} user routes, ${adminMenuTabs.size} administrator tabs)`
);
