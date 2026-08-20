import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const renderUserRoot = read('src/bootstrap/renderUserRoot.jsx');
const authPanel = read('src/user/UserAuthPanel.jsx');
const footerPagePanel = read('src/user/UserFooterPagePanel.jsx');

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
  footerPagePanel.includes('flex flex-1 flex-col overflow-hidden border-slate-200 bg-white shadow-sm'),
  'content footer pages must grow their white article card into remaining viewport space',
);
assert.ok(
  footerPagePanel.includes('min-h-[320px] flex-1 px-6 py-7'),
  'content footer page body must absorb remaining white-space inside the article rather than outside it',
);

console.log('[phase34-user-layout-regressions-frontend-smoke] PASS');
