import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN,
} from './production-domain-contract.mjs';

const distDir = process.argv[2] || 'dist';

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

try {
  if (!statSync(distDir).isDirectory()) throw new Error(`${distDir} is not a directory.`);
  const cname = readFileSync(join(distDir, 'CNAME'), 'utf8').trim();
  if (cname !== new URL(PRODUCTION_FRONTEND_ORIGIN).hostname) {
    throw new Error(`dist/CNAME mismatch: expected=${new URL(PRODUCTION_FRONTEND_ORIGIN).hostname}, actual=${cname || '(empty)'}`);
  }

  const jsFiles = walk(distDir).filter((file) => file.endsWith('.js'));
  if (!jsFiles.length) throw new Error('No production JavaScript assets were found in dist.');

  const bundleText = jsFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
  if (!bundleText.includes(PRODUCTION_API_ORIGIN)) {
    throw new Error(`Production bundle does not contain ${PRODUCTION_API_ORIGIN}.`);
  }
  if (/https:\/\/[^"'`\s]+\.herokuapp\.com/i.test(bundleText)) {
    throw new Error('Production bundle still contains a direct herokuapp.com origin.');
  }

  console.log('[production-domain] build artifact contract PASS');
  console.log(`CNAME=${cname}`);
  console.log(`API_ORIGIN=${PRODUCTION_API_ORIGIN}`);
  console.log(`JS_ASSETS=${jsFiles.length}`);
} catch (error) {
  console.error(`[production-domain] build artifact contract FAIL: ${error.message}`);
  process.exit(1);
}
