import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

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
  if (segments.includes('.performance-reports')) return '.performance-reports';
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

const normalizedLines = lines.map(normalize);
const manifestSet = new Set(normalizedLines);
const duplicates = [...new Set(normalizedLines.filter((path, index) => normalizedLines.indexOf(path) !== index))];

const walkFiles = (directory) => {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkFiles(absolute));
    } else if (entry.isFile()) {
      output.push(normalize(relative('.', absolute)));
    }
  }
  return output;
};

const actualPackageFiles = walkFiles('.')
  .filter((path) => !path.startsWith('package-meta/'))
  .filter((path) => !protectedReason(path));
const unlisted = actualPackageFiles.filter((path) => !manifestSet.has(path));

if (blocked.length || missing.length || duplicates.length || unlisted.length) {
  if (blocked.length) {
    console.error('[package-guard] FAIL: protected paths are present in PACKAGE_FILES.txt');
    for (const item of blocked) console.error(`- ${item.path} (${item.reason})`);
  }
  if (missing.length) {
    console.error('[package-guard] FAIL: manifest paths are missing or are not regular files');
    for (const path of missing) console.error(`- ${path}`);
  }
  if (duplicates.length) {
    console.error('[package-guard] FAIL: duplicate manifest paths are present');
    for (const path of duplicates) console.error(`- ${path}`);
  }
  if (unlisted.length) {
    console.error('[package-guard] FAIL: non-protected source files are missing from PACKAGE_FILES.txt');
    for (const path of unlisted) console.error(`- ${path}`);
  }
  process.exit(1);
}

console.log(
  `[package-guard] PASS (${lines.length} manifest entries; protected paths=0; missing files=0; duplicates=0; unlisted files=0)`,
);
