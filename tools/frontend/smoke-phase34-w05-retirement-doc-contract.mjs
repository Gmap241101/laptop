import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { findRetiredSourceEntries } from '../lib/retired-source-paths.mjs';

const read = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = read('package-lock.json');
const api = read('server/src/app.mjs');
const restore = read('server/src/settings/system-data-restore.mjs');
const authClient = read('src/clerk/clerkStagingClient.js');
const service = read('server/src/settings/backup-verification-single-db.mjs');
const docs = read('server/README.md');
const runbook = read('docs/phase34-w05-firebase-retirement-operations-20261021.md');
const pages = read('.github/workflows/pages-production.yml');
const ignored = read('.gitignore');

const forbidden = ['src/firebase.js', 'server/src/firestore', 'server/src/firebase'];
for (const p of forbidden) {
  if (p.endsWith('.js')) {
    assert.equal(existsSync(p), false, `Retired entrypoint must stay absent: ${p}`);
  } else {
    assert.deepEqual(findRetiredSourceEntries(p), [], `Retired source files must stay absent: ${p}`);
  }
}

// Regression: an empty leftover Windows directory is benign, but any nested
// retired file must still fail the retirement check.
const fixtureRoot = mkdtempSync(join(tmpdir(), 'w05-retired-folders-'));
try {
  assert.deepEqual(findRetiredSourceEntries(join(fixtureRoot, 'absent')), []);
  const retired = join(fixtureRoot, 'server', 'src', 'firestore');
  mkdirSync(join(retired, 'nested'), { recursive: true });
  assert.deepEqual(findRetiredSourceEntries(retired), []);
  const forbiddenFile = join(retired, 'nested', 'legacy.mjs');
  writeFileSync(forbiddenFile, 'export const legacy = true;\n');
  assert.deepEqual(findRetiredSourceEntries(retired), [forbiddenFile]);
  rmSync(forbiddenFile);
  assert.deepEqual(findRetiredSourceEntries(retired), []);
} finally {
  rmSync(fixtureRoot, { force: true, recursive: true });
}
assert.equal(pkg.dependencies?.firebase, undefined);
assert.equal(pkg.devDependencies?.firebase, undefined);
assert.ok(!lock.includes('node_modules/firebase'), 'firebase package must not re-enter lockfile');
assert.ok(!lock.includes('node_modules/@firebase/'), '@firebase packages must not re-enter lockfile');

function walk(dir) {
  const entries = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) entries.push(...walk(p));
    else if (['.js','.jsx','.mjs'].includes(extname(p))) entries.push(p);
  }
  return entries;
}
let scanCount = 0;
const networkRules = [
  /\b(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)(['"`])(?:firebase|@firebase)(?:\/[^'"`]+)?\1/gi,
  /(?:firestore|identitytoolkit|securetoken)\.googleapis\.com/gi,
  /(?:firebaseapp\.com|firebasestorage\.app)/gi,
  /X-Firebase-Authorization/gi,
];
for (const example of [
  "import 'firebase/auth'",
  "import { getAuth } from 'firebase/auth'",
  "import('firebase/firestore')",
  "require('@firebase/app')",
]) {
  networkRules[0].lastIndex = 0;
  assert.ok(networkRules[0].test(example), `Detector must reject: ${example}`);
}
for (const file of [...walk('src'),...walk('server/src')]) {
  const data = read(file); scanCount += 1;
  for (const rule of networkRules) {
    rule.lastIndex = 0;
    assert.equal(rule.test(data), false, `Retired external network provider in ${file}: ${rule}`);
  }
}
assert.ok(scanCount > 200, `Suspiciously small runtime source scan: ${scanCount}`);
assert.match(read('src/features/auth/firebaseRuntimeRetirement.js'), /mode: 'removed'/);
assert.match(read('server/src/config/env.mjs'), /const firebaseRuntimeDisabled = true/);
assert.match(read('src/platform/retiredLegacyDataCompat.js'), /firebase_runtime_removed/);
assert.match(read('server/migrations/003_phase6_firebase_identity_bridge.sql'), /firebase_uid/);
assert.match(read('server/migrations/025_phase34_hard_firebase_retirement.sql'), /firebase/i);
assert.ok(existsSync('server/migrations/043_phase34_w02_device_trust_operation_recovery.sql'), 'Migration 043 must be present');
assert.match(read('server/migrations/043_phase34_w02_device_trust_operation_recovery.sql'), /app_device_trust_operations/);
assert.match(read('tools/ops/verify-phase34-w03-postmigration-backup.ps1'), /pg_restore --file NUL/);
assert.match(read('tools/ops/verify-phase34-w03-postmigration-backup.ps1'), /app_device_trust_operations/);
assert.doesNotMatch(authClient, /X-Firebase-Authorization/);

assert.match(restore, /RESTORE_PREVIEW_MAX_AGE_MS/);
assert.match(restore, /previewIssuedAt/);
assert.match(api, /process\.env\.BACKUP_VERIFY_MODE !== 'single-db'/);
assert.match(service, /backup_verification_independent_restore_required/);
assert.match(api, /await backupVerificationJobs\.assertDurableProof\(\)/);
for(const expected of [
  '043_phase34_w02_device_trust_operation_recovery.sql',
  'BACKUP_VERIFY_MODE=single-db',
  '10-minute',
  'Full database reset',
  'Production',
  'Staging',
]) assert.ok(docs.includes(expected), `Current README missing: ${expected}`);
for(const expected of ['a004', 'app_device_trust_operations', 'AC-S04', 'Never create a new', 'gh-pages-3']) {
  assert.ok(runbook.includes(expected), `W05 runbook missing: ${expected}`);
}
assert.match(pages, /actions\/setup-node@v6/);
assert.match(pages, /node-version:\s*22/);
assert.match(pages, /npm run build:production:pages/);
assert.match(runbook, /promote-github-pages-actions-production\.ps1/);
assert.match(ignored, /\*\.dump/);
assert.match(ignored, /\.performance-reports\//);
for (const existing of ['server:phase34:external-runtime:smoke','frontend:phase34:external-runtime:smoke',
  'server:phase34:runtime-retirement:smoke','frontend:phase34:runtime-retirement:smoke']) {
  assert.ok(pkg.scripts[existing], `Retirement test must remain in package scripts: ${existing}`);
}
assert.match(pkg.scripts['verify:phase34'], /frontend:phase34:w05-retirement:smoke/);
console.log(`[phase34-w05-retirement-doc-contract] PASS (${scanCount} runtime JS files; Firebase external references 0; current migrations/restore/production doc contracts pass)`);
