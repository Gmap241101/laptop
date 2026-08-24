import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const renderUserRoot = read('src/bootstrap/renderUserRoot.jsx');
const userMain = read('src/user-main.jsx');
const homePanel = read('src/user/UserHomePanel.jsx');
const homeBootstrapService = read('src/user/userHomeBootstrapService.js');
const authPanel = read('src/user/UserAuthPanel.jsx');
const footerPagePanel = read('src/user/UserFooterPagePanel.jsx');
const myPagePanel = read('src/user/UserMyPagePanel.jsx');
const accountStatusPanel = read('src/user/UserAccountStatusPanel.jsx');
const adminWorkspace = read('src/admin/AdminWorkspace.jsx');
const appShell = read('src/shell/AppShell.jsx');

assert.equal(
  renderUserRoot.includes('await preloadUserHomeBootstrap()'),
  false,
  'user root must not block UserApp lazy resolution on the home bootstrap request',
);
assert.ok(
  renderUserRoot.includes('void preloadUserHomeBootstrap()'),
  'home bootstrap and critical image warmup should remain non-blocking background work',
);
assert.equal(
  renderUserRoot.includes('UserHomeBootstrapScreen'),
  false,
  'the obsolete intermediate home bootstrap screen must not be rendered during initial navigation',
);
assert.ok(
  renderUserRoot.includes('<React.Suspense fallback={null}>'),
  'the user root must avoid showing a separate placeholder surface before the real home shell',
);

assert.ok(
  authPanel.includes('mx-auto w-full max-w-xl overflow-hidden'),
  'the user auth card must fill the available flex width up to its original max-w-xl limit',
);

assert.ok(
  myPagePanel.includes('mx-auto w-full max-w-xl space-y-4'),
  'the my-page password re-verification surface must retain the full max-w-xl authentication width',
);
assert.ok(
  myPagePanel.includes('mx-auto w-full max-w-3xl space-y-6'),
  'the my-page root must explicitly fill available width before the max-w-3xl cap',
);
assert.ok(
  accountStatusPanel.includes('mx-auto w-full max-w-2xl overflow-hidden'),
  'account-status authentication-adjacent surfaces must explicitly fill available width',
);
assert.ok(
  (adminWorkspace.match(/mx-auto w-full max-w-xl overflow-hidden/g) || []).length >= 3,
  'administrator loading, error, and login cards must consistently use the full max-w-xl authentication width',
);
assert.ok(
  appShell.includes('mx-auto w-full max-w-xl border-slate-200 bg-white shadow-sm'),
  'the administrator lazy fallback must use the same explicit full-width authentication surface contract',
);

assert.ok(
  footerPagePanel.includes('flex flex-1 flex-col overflow-hidden border-slate-200 bg-white shadow-sm'),
  'content footer pages must grow their white article card into remaining viewport space',
);
assert.ok(
  footerPagePanel.includes('min-h-[320px] flex-1 px-6 py-7'),
  'content footer page body must absorb remaining white-space inside the article rather than outside it',
);

assert.match(
  userMain,
  /preloadUserHomeBootstrap\(\)[\s\S]*preloadCriticalUserHomeAssets\(bootstrap\)/,
  'critical home hero warmup must begin from the earliest user entry bootstrap path without blocking UserApp',
);
assert.match(
  homeBootstrapService,
  /const heroWarmup = warmImage\(heroUrl,[\s\S]*fetchPriority: 'high'[\s\S]*warmImage\(logoUrl, \{ fetchPriority: 'auto' \}\)/,
  'the main hero image must be explicitly warmed before the logo warmup and retain high fetch priority',
);
assert.match(
  homePanel,
  /!bannersReady \? \([\s\S]*aria-label="메인 비주얼 준비 중"[\s\S]*\) : heroBanners\.length === 0 \? \(/,
  'the default hero copy must not flash before authoritative hero-banner data is ready',
);
assert.match(
  homePanel,
  /getCachedSiteContentDomain\(SITE_CONTENT_DOMAINS\.HOME\) \|\| getCachedUserHomeBootstrap\(\)\?\.home/,
  'the real home panel must consume an already-resolved bootstrap home payload synchronously when available',
);

console.log('[phase34-user-layout-regressions-frontend-smoke] PASS');
