import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const measurementRoot = path.join(
  root,
  'docs',
  'performance-optimization',
  'measurements'
);
const entryFiles = Object.freeze({
  user: path.join(sourceRoot, 'user-main.jsx'),
  admin: path.join(sourceRoot, 'admin-main.jsx'),
});
const extensions = ['', '.js', '.jsx', '.mjs', '.json'];
const staticImportPattern = /(?:^|\n)\s*(?:import\s+(?!\()(?:(?:[\s\S]*?)\s+from\s+)?|export\s+(?:[\s\S]*?)\s+from\s+)['"]([^'"]+)['"]/g;
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

const readLocalImports = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  const staticImports = [];
  const dynamicImports = [];

  staticImportPattern.lastIndex = 0;
  let match;
  while ((match = staticImportPattern.exec(source))) {
    const resolved = resolveLocalImport(filePath, match[1]);
    if (resolved) staticImports.push(resolved);
  }

  dynamicImportPattern.lastIndex = 0;
  while ((match = dynamicImportPattern.exec(source))) {
    const resolved = resolveLocalImport(filePath, match[1]);
    if (resolved) dynamicImports.push(resolved);
  }

  return { staticImports, dynamicImports };
};

const collectGraph = (entryFile, { includeDynamic }) => {
  const visited = new Set();
  const dynamicEntries = new Set();
  const pending = [entryFile];

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || visited.has(filePath)) continue;
    visited.add(filePath);

    const { staticImports, dynamicImports } = readLocalImports(filePath);
    for (const importedFile of staticImports) {
      if (!visited.has(importedFile)) pending.push(importedFile);
    }
    for (const importedFile of dynamicImports) {
      dynamicEntries.add(importedFile);
      if (includeDynamic && !visited.has(importedFile)) pending.push(importedFile);
    }
  }

  return { visited, dynamicEntries };
};

const relativeFile = (filePath) =>
  path.relative(root, filePath).replaceAll(path.sep, '/');

const summarizeSet = (fileSet) => {
  const files = [...fileSet]
    .map((filePath) => ({
      file: relativeFile(filePath),
      bytes: fs.statSync(filePath).size,
    }))
    .sort((first, second) => second.bytes - first.bytes || first.file.localeCompare(second.file));

  return {
    moduleCount: files.length,
    sourceBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
};

const entryReports = {};
const completeSets = {};

for (const [surface, entryFile] of Object.entries(entryFiles)) {
  const initialGraph = collectGraph(entryFile, { includeDynamic: false });
  const completeGraph = collectGraph(entryFile, { includeDynamic: true });
  completeSets[surface] = completeGraph.visited;

  entryReports[surface] = {
    entry: relativeFile(entryFile),
    initial: summarizeSet(initialGraph.visited),
    complete: summarizeSet(completeGraph.visited),
    dynamicEntries: [...initialGraph.dynamicEntries]
      .map(relativeFile)
      .sort(),
  };
}

const sharedComplete = new Set(
  [...completeSets.user].filter((filePath) => completeSets.admin.has(filePath))
);
const userOnlyComplete = new Set(
  [...completeSets.user].filter((filePath) => !completeSets.admin.has(filePath))
);
const adminOnlyComplete = new Set(
  [...completeSets.admin].filter((filePath) => !completeSets.user.has(filePath))
);

const userInitial = entryReports.user.initial;
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  entries: entryReports,
  sharedComplete: summarizeSet(sharedComplete),
  userOnlyComplete: summarizeSet(userOnlyComplete),
  adminOnlyComplete: summarizeSet(adminOnlyComplete),
  // Backward-compatible aliases: the legacy single entry resolved to the user surface.
  initialModuleCount: userInitial.moduleCount,
  initialSourceBytes: userInitial.sourceBytes,
  files: userInitial.files,
  dynamicEntries: entryReports.user.dynamicEntries,
};

fs.mkdirSync(measurementRoot, { recursive: true });
fs.writeFileSync(
  path.join(measurementRoot, 'SOURCE_GRAPH_ANALYSIS_REPORT.json'),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(report, null, 2));
