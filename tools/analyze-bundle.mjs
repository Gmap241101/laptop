import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const projectRoot = process.cwd();
const assetsDir = path.join(projectRoot, 'dist', 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('dist/assets가 없습니다. 먼저 npm run build를 실행하세요.');
  process.exit(1);
}

const files = fs
  .readdirSync(assetsDir)
  .filter((name) => /\.(?:js|css)$/.test(name))
  .map((name) => {
    const filePath = path.join(assetsDir, name);
    const content = fs.readFileSync(filePath);
    return {
      name,
      type: path.extname(name).slice(1),
      bytes: content.byteLength,
      gzipBytes: gzipSync(content).byteLength,
    };
  })
  .sort((first, second) => second.bytes - first.bytes);

const summary = {
  generatedAt: new Date().toISOString(),
  totalFiles: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  totalGzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
  files,
  warnings: files
    .filter((file) => file.type === 'js' && file.bytes > 500 * 1024)
    .map((file) => `${file.name}: 500KB를 초과했습니다.`),
};

const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const lines = [
  'Vite bundle analysis',
  `Generated: ${summary.generatedAt}`,
  `Files: ${summary.totalFiles}`,
  `Total: ${formatKb(summary.totalBytes)}`,
  `Total gzip: ${formatKb(summary.totalGzipBytes)}`,
  '',
  'File                                      Raw        Gzip',
  '------------------------------------------------------------',
  ...files.map(
    (file) =>
      `${file.name.padEnd(40)} ${formatKb(file.bytes).padStart(10)} ${formatKb(
        file.gzipBytes
      ).padStart(10)}`
  ),
  '',
  ...(summary.warnings.length ? ['Warnings:', ...summary.warnings] : ['Warnings: none']),
];

fs.writeFileSync(
  path.join(projectRoot, 'BUNDLE_ANALYSIS_REPORT.json'),
  `${JSON.stringify(summary, null, 2)}\n`
);
fs.writeFileSync(
  path.join(projectRoot, 'BUNDLE_ANALYSIS_REPORT.txt'),
  `${lines.join('\n')}\n`
);

console.log(lines.join('\n'));
