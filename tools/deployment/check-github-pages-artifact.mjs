import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PRODUCTION_FRONTEND_ORIGIN } from './production-domain-contract.mjs';

const distDir = process.argv[2] || 'dist';
const normalize = (value) => value.replaceAll('\\', '/');

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

const fail = (message) => {
  console.error(`[github-pages] artifact contract FAIL: ${message}`);
  process.exit(1);
};

try {
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) fail(`${distDir} is missing.`);

  const required = [
    'index.html',
    '404.html',
    'admin/index.html',
    'CNAME',
    '.nojekyll',
  ];
  for (const path of required) {
    if (!existsSync(join(distDir, path))) fail(`missing ${path}`);
  }

  const cname = readFileSync(join(distDir, 'CNAME'), 'utf8').trim();
  const expectedHost = new URL(PRODUCTION_FRONTEND_ORIGIN).hostname;
  if (cname !== expectedHost) fail(`CNAME mismatch: expected=${expectedHost}, actual=${cname || '(empty)'}`);

  const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf8');
  const adminHtml = readFileSync(join(distDir, 'admin/index.html'), 'utf8');
  const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf8');

  if (indexHtml !== notFoundHtml) fail('404.html must be the user index.html fallback.');

  for (const [label, html] of [['index.html', indexHtml], ['admin/index.html', adminHtml], ['404.html', notFoundHtml]]) {
    if (/\/src\/[A-Za-z0-9_./-]+\.(?:jsx?|tsx?)/.test(html)) {
      fail(`${label} still references raw /src source modules.`);
    }
    if (!/\/assets\/[A-Za-z0-9_.-]+\.js/.test(html)) {
      fail(`${label} does not reference a compiled Vite JavaScript asset.`);
    }
  }

  const files = walk(distDir).map((file) => normalize(relative(distDir, file)));
  const rawSource = files.filter((file) => /(^|\/)src\//.test(file) || /\.(?:jsx|tsx)$/.test(file));
  if (rawSource.length) fail(`raw source files leaked into dist: ${rawSource.join(', ')}`);

  const assetFiles = files.filter((file) => file.startsWith('assets/') && file.endsWith('.js'));
  if (!assetFiles.length) fail('compiled assets/*.js files are missing.');

  console.log('[github-pages] artifact contract PASS');
  console.log(`- CNAME=${cname}`);
  console.log(`- JS_ASSETS=${assetFiles.length}`);
  console.log('- raw /src references=0');
  console.log('- SPA 404 fallback=ready');
} catch (error) {
  fail(error.message);
}
