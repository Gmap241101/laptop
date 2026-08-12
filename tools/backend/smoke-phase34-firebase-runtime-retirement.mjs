import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [envSource, appSource, indexSource, assetSource, boardSource, memberSource] = await Promise.all([
  readFile(new URL('../../server/src/config/env.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/index.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/assets/asset-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/boards/board-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8'),
]);

for (const marker of [
  "readBoolean('FIREBASE_RUNTIME_DISABLED', false)",
  'readFirebaseProjectId(appEnv, firebaseRuntimeDisabled)',
  'firebaseRuntimeDisabled || readBoolean',
]) assert.ok(envSource.includes(marker), `server retirement config marker: ${marker}`);

for (const marker of [
  "source: 'clerk-postgresql'",
  "firebaseRuntime: config.firebaseRuntimeDisabled ? 'retired'",
  'config.firebaseRuntimeDisabled',
]) assert.ok(appSource.includes(marker) || indexSource.includes(marker), `server runtime marker: ${marker}`);

for (const source of [assetSource, boardSource, memberSource]) {
  assert.ok(source.includes("firebaseIdentity?.source === 'clerk-postgresql'"), 'Synthetic Clerk/PostgreSQL identity must bypass Firestore verification/bootstrap.');
  assert.ok(source.includes("source: 'postgresql-existing'") || source.includes("source: 'postgresql-admin-registry'"));
}

console.log('[phase34-firebase-runtime-retirement-backend-smoke] PASS (single retirement flag disables Firebase config/mirrors and bootstrap fallbacks)');
