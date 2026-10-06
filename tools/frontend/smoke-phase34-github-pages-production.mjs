import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeClerkFrontendApiDomain as decodeUserDomain } from '../../src/clerk/clerkUserClient.js';
import { decodeClerkFrontendApiDomain as decodeAdminDomain } from '../../src/clerk/clerkStagingClient.js';

const workflow = readFileSync('.github/workflows/pages-production.yml', 'utf8');
const viteConfig = readFileSync('vite.config.js', 'utf8');
const cname = readFileSync('public/CNAME', 'utf8').trim();
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

assert.match(workflow, /branches:\s*\n\s*- gh-pages/);
assert.match(workflow, /actions\/checkout@v6/);
assert.match(workflow, /actions\/setup-node@v6/);
assert.match(workflow, /node-version:\s*22/);
assert.match(workflow, /actions\/configure-pages@v5/);
assert.match(workflow, /npm run build:production:pages/);
assert.match(workflow, /actions\/upload-pages-artifact@v4/);
assert.match(workflow, /path:\s*\.\/dist/);
assert.match(workflow, /actions\/deploy-pages@v4/);
assert.match(workflow, /VITE_API_URL:\s*https:\/\/api\.notebook\.recruit\.kro\.kr/);
assert.match(workflow, /secrets\.VITE_CLERK_PUBLISHABLE_KEY/);
assert.match(viteConfig, /base:\s*['"]\/['"]/);
assert.equal(cname, 'notebook.recruit.kro.kr');
assert.equal(typeof pkg.scripts['build:production:pages'], 'string');
assert.equal(typeof pkg.scripts['frontend:clerk:production-config:check'], 'string');
assert.equal(typeof pkg.scripts['production:pages-artifact:prepare'], 'string');
assert.equal(typeof pkg.scripts['production:pages-artifact:check'], 'string');

const encoded = Buffer.from('clerk.production.example$').toString('base64');
const key = `pk_live_${encoded}`;
const decode = (value) => Buffer.from(value, 'base64').toString('utf8');
assert.equal(decodeUserDomain(key, decode), 'clerk.production.example');
assert.equal(decodeAdminDomain(key, decode), 'clerk.production.example');

console.log('Phase 34 GitHub Pages production workflow smoke: PASS');
