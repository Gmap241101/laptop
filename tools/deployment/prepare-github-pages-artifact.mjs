import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const distDir = process.argv[2] || 'dist';
const indexPath = join(distDir, 'index.html');
const adminIndexPath = join(distDir, 'admin', 'index.html');
const notFoundPath = join(distDir, '404.html');
const noJekyllPath = join(distDir, '.nojekyll');

for (const required of [indexPath, adminIndexPath]) {
  if (!existsSync(required)) {
    console.error(`[github-pages] build artifact preparation FAIL: missing ${required}`);
    process.exit(1);
  }
}

// GitHub Pages does not provide SPA rewrites. Its custom 404 page is used as the
// user-surface fallback so direct visits such as /board/notice and /history still
// bootstrap the same Vite application and let appRoutes.js resolve the pathname.
copyFileSync(indexPath, notFoundPath);
writeFileSync(noJekyllPath, '', 'utf8');

console.log('[github-pages] artifact preparation PASS');
console.log(`- 404 fallback=${notFoundPath}`);
console.log(`- nojekyll=${noJekyllPath}`);
