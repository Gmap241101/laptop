import { existsSync, statSync, readFileSync } from 'node:fs';

const manifestPath = process.argv[2] || 'package-meta/PACKAGE_FILES.txt';
const lines = readFileSync(manifestPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

const normalize = (value) => value.replaceAll('\\', '/').replace(/^\.\//, '');

function protectedReason(rawPath) {
  const path = normalize(rawPath);
  const lower = path.toLowerCase();
  const segments = lower.split('/');
  const basename = segments.at(-1) || '';

  if (segments.includes('.git') || lower === '.git') return '.git';
  if (segments.includes('node_modules')) return 'node_modules';
  if (segments.includes('dist')) return 'dist';
  if (segments.includes('secrets') || segments.includes('.secrets')) return 'secrets';
  if (basename === 'deploy.ps1') return 'deploy.ps1';
  if (segments.some((segment) => segment.startsWith('.env'))) return '.env*';
  return null;
}

const blocked = lines
  .map((path) => ({ path, reason: protectedReason(path) }))
  .filter((item) => item.reason);

const missing = lines.filter((path) => {
  const normalized = normalize(path);
  if (!existsSync(normalized)) return true;
  try {
    return !statSync(normalized).isFile();
  } catch {
    return true;
  }
});

if (blocked.length || missing.length) {
  if (blocked.length) {
    console.error('[package-guard] FAIL: protected paths are present in PACKAGE_FILES.txt');
    for (const item of blocked) console.error(`- ${item.path} (${item.reason})`);
  }
  if (missing.length) {
    console.error('[package-guard] FAIL: manifest paths are missing or are not regular files');
    for (const path of missing) console.error(`- ${path}`);
  }
  process.exit(1);
}

console.log(
  `[package-guard] PASS (${lines.length} manifest entries; protected paths=0; missing files=0)`,
);
