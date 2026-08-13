import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walk(path));
    else if (extname(name) === '.mjs') out.push(path);
  }
  return out;
};

const serverFiles = walk('server/src');
for (const file of serverFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const required of [
  'server/src/app.mjs',
  'server/src/index.mjs',
  'server/src/config/env.mjs',
  'server/src/db/pool.mjs',
  'server/src/auth/clerk-session.mjs',
  'server/src/clerk/clerk-api.mjs',
  'server/src/content/site-content-repository.mjs',
  'server/src/content/site-content-service.mjs',
  'server/src/assets/asset-repository.mjs',
  'server/src/boards/board-repository.mjs',
  'server/src/members/member-authority-repository.mjs',
  'server/src/rentals/admin-rental-request-repository.mjs',
]) {
  if (!existsSync(required)) throw new Error(`Required PostgreSQL runtime module missing: ${required}`);
}
if (existsSync('server/src/firebase') || existsSync('server/src/firestore')) {
  throw new Error('Firebase/Firestore server runtime directories must not exist after hard retirement.');
}
const app = readFileSync('server/src/app.mjs', 'utf8');
for (const route of [
  '/api/admin/rental-dashboard',
  '/api/admin/members',
  '/api/admin/assets',
  '/api/admin/boards',
  '/api/admin/site-content/',
  '/api/users/me/rental-requests',
  '/api/users/me/member-profile',
]) {
  if (!app.includes(route)) throw new Error(`Required PostgreSQL API route marker missing: ${route}`);
}
for (const forbidden of ['X-Firebase-Authorization', 'firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com']) {
  if (app.includes(forbidden)) throw new Error(`Removed Firebase runtime marker remains in server app: ${forbidden}`);
}
const index = readFileSync('server/src/index.mjs', 'utf8');
for (const forbidden of ["./firebase/", "./firestore/", 'createFirebaseIdTokenVerifier', 'createFirestore']) {
  if (index.includes(forbidden)) throw new Error(`Removed Firebase server wiring remains: ${forbidden}`);
}
const config = readFileSync('server/src/config/env.mjs', 'utf8');
if (!config.includes('const firebaseRuntimeDisabled = true')) throw new Error('Hard Firebase retirement config is not enabled.');
const procfile = readFileSync('Procfile', 'utf8');
if (!procfile.includes('release: npm --prefix server run db:migrate')) throw new Error('Release migration command missing.');
if (!procfile.includes('web: npm --prefix server start')) throw new Error('Web process command missing.');
console.log(`[server-check] PASS (${serverFiles.length} JavaScript files, Clerk/PostgreSQL runtime, retired external network runtime removed)`);
