import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const entry = path.join(root, 'src', 'main.jsx');
const extensions = ['', '.js', '.jsx', '.mjs', '.json'];
const staticImportPattern = /(?:^|\n)\s*import\s+(?!\()(?:(?:[\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g;
const dynamicImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const resolveLocalImport = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);

  for (const extension of extensions) {
    const candidate = `${base}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  for (const extension of ['.js', '.jsx', '.mjs']) {
    const candidate = path.join(base, `index${extension}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
};

const visited = new Set();
const dynamicEntries = new Set();

const visit = (filePath) => {
  if (visited.has(filePath)) return;
  visited.add(filePath);
  const source = fs.readFileSync(filePath, 'utf8');

  staticImportPattern.lastIndex = 0;
  let match;
  while ((match = staticImportPattern.exec(source))) {
    const resolved = resolveLocalImport(filePath, match[1]);
    if (resolved) visit(resolved);
  }

  dynamicImportPattern.lastIndex = 0;
  while ((match = dynamicImportPattern.exec(source))) {
    const resolved = resolveLocalImport(filePath, match[1]);
    if (resolved) dynamicEntries.add(resolved);
  }
};

visit(entry);

const files = [...visited]
  .map((filePath) => ({
    file: path.relative(root, filePath).replaceAll(path.sep, '/'),
    bytes: fs.statSync(filePath).size,
  }))
  .sort((first, second) => second.bytes - first.bytes);

const report = {
  generatedAt: new Date().toISOString(),
  initialModuleCount: files.length,
  initialSourceBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
  dynamicEntries: [...dynamicEntries]
    .map((filePath) => path.relative(root, filePath).replaceAll(path.sep, '/'))
    .sort(),
};

fs.writeFileSync(
  path.join(root, 'SOURCE_GRAPH_ANALYSIS_REPORT.json'),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(report, null, 2));
