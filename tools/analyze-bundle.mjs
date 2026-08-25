import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
const assetsDir = path.join(distDir, 'assets');
const manifestPath = path.join(distDir, '.vite', 'manifest.json');
const measurementRoot = path.join(
  projectRoot,
  'docs',
  'performance-optimization',
  'measurements'
);
const reportJsonPath = path.join(measurementRoot, 'BUNDLE_ANALYSIS_REPORT.json');
const reportTextPath = path.join(measurementRoot, 'BUNDLE_ANALYSIS_REPORT.txt');
const defaultBaselinePath = path.join(measurementRoot, 'BUNDLE_ANALYSIS_BASELINE.json');

const INITIAL_JS_GZIP_BUDGET = 350 * 1024;
const INITIAL_TOTAL_GZIP_BUDGET = 400 * 1024;
const SINGLE_JS_RAW_BUDGET = 500 * 1024;

const args = new Set(process.argv.slice(2));
const baselineArgument = [...args].find((arg) => arg.startsWith('--baseline='));
const baselinePath = baselineArgument
  ? path.resolve(projectRoot, baselineArgument.slice('--baseline='.length))
  : args.has('--baseline')
    ? defaultBaselinePath
    : null;
const shouldSaveBaseline = args.has('--save-baseline');

fs.mkdirSync(measurementRoot, { recursive: true });

if (!fs.existsSync(assetsDir)) {
  console.error('dist/assets가 없습니다. 먼저 npm run build를 실행하세요.');
  process.exit(1);
}

const formatKb = (bytes) => `${(Number(bytes || 0) / 1024).toFixed(1)} KB`;
const formatDeltaKb = (bytes) => {
  const value = Number(bytes || 0);
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${(value / 1024).toFixed(1)} KB`;
};

const assetFiles = fs
  .readdirSync(assetsDir)
  .filter((name) => /\.(?:js|css)$/.test(name))
  .map((name) => {
    const filePath = path.join(assetsDir, name);
    const content = fs.readFileSync(filePath);

    return {
      name,
      outputPath: `assets/${name}`,
      type: path.extname(name).slice(1),
      bytes: content.byteLength,
      gzipBytes: gzipSync(content).byteLength,
      loadGroup: 'other',
      sourceEntries: [],
      surfaces: [],
    };
  });

const assetByOutputPath = new Map(
  assetFiles.map((file) => [file.outputPath, file])
);

const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : null;

const collectManifestGraph = (rootKeys, { includeDynamic = false } = {}) => {
  const visited = new Set();
  const dynamicRoots = new Set();

  const visit = (key) => {
    if (!key || visited.has(key) || !manifest?.[key]) return;
    visited.add(key);
    const item = manifest[key];

    for (const importedKey of item.imports || []) visit(importedKey);
    for (const dynamicKey of item.dynamicImports || []) {
      dynamicRoots.add(dynamicKey);
      if (includeDynamic) visit(dynamicKey);
    }
  };

  for (const rootKey of rootKeys) visit(rootKey);
  return { visited, dynamicRoots };
};

const collectOutputPaths = (manifestKeys) => {
  const outputs = new Set();

  for (const key of manifestKeys) {
    const item = manifest?.[key];
    if (!item) continue;
    if (item.file && /\.(?:js|css)$/.test(item.file)) outputs.add(item.file);
    for (const cssFile of item.css || []) outputs.add(cssFile);
  }

  return outputs;
};

const summarizeFiles = (targetFiles) => ({
  fileCount: targetFiles.length,
  bytes: targetFiles.reduce((sum, file) => sum + file.bytes, 0),
  gzipBytes: targetFiles.reduce((sum, file) => sum + file.gzipBytes, 0),
  jsBytes: targetFiles
    .filter((file) => file.type === 'js')
    .reduce((sum, file) => sum + file.bytes, 0),
  jsGzipBytes: targetFiles
    .filter((file) => file.type === 'js')
    .reduce((sum, file) => sum + file.gzipBytes, 0),
  cssBytes: targetFiles
    .filter((file) => file.type === 'css')
    .reduce((sum, file) => sum + file.bytes, 0),
  cssGzipBytes: targetFiles
    .filter((file) => file.type === 'css')
    .reduce((sum, file) => sum + file.gzipBytes, 0),
});

const filesForPaths = (outputPaths) =>
  [...outputPaths]
    .map((outputPath) => assetByOutputPath.get(outputPath))
    .filter(Boolean);

const summarizePaths = (outputPaths) => summarizeFiles(filesForPaths(outputPaths));
const difference = (first, second) => new Set([...first].filter((value) => !second.has(value)));
const intersection = (first, second) => new Set([...first].filter((value) => second.has(value)));
const union = (...sets) => new Set(sets.flatMap((set) => [...set]));

const entryKeys = manifest
  ? Object.entries(manifest)
      .filter(([, item]) => item.isEntry)
      .map(([key]) => key)
  : [];

const classifyEntrySurface = (key) => {
  const item = manifest?.[key] || {};
  const source = String(item.src || key || '').replaceAll('\\', '/');
  if (source === 'admin/index.html' || source.endsWith('/admin/index.html')) return 'admin';
  if (source === 'index.html' || source.endsWith('/index.html')) return 'user';
  return null;
};

const entryKeysBySurface = {
  user: entryKeys.filter((key) => classifyEntrySurface(key) === 'user'),
  admin: entryKeys.filter((key) => classifyEntrySurface(key) === 'admin'),
};

const surfaceGraphs = {};
for (const surface of ['user', 'admin']) {
  const roots = entryKeysBySurface[surface];
  const initialGraph = collectManifestGraph(roots, { includeDynamic: false });
  const completeGraph = collectManifestGraph(roots, { includeDynamic: true });
  const initialPaths = collectOutputPaths(initialGraph.visited);
  const completePaths = collectOutputPaths(completeGraph.visited);
  const asyncPaths = difference(completePaths, initialPaths);

  surfaceGraphs[surface] = {
    entryKeys: roots,
    initialPaths,
    asyncPaths,
    completePaths,
    dynamicRootKeys: [...initialGraph.dynamicRoots].sort(),
  };
}

const userInitialPaths = surfaceGraphs.user.initialPaths;
const adminInitialPaths = surfaceGraphs.admin.initialPaths;
const userCompletePaths = surfaceGraphs.user.completePaths;
const adminCompletePaths = surfaceGraphs.admin.completePaths;
const allInitialPaths = union(userInitialPaths, adminInitialPaths);
const allCompletePaths = union(userCompletePaths, adminCompletePaths);
const allAsyncPaths = difference(allCompletePaths, allInitialPaths);

const sharedInitialPaths = intersection(userInitialPaths, adminInitialPaths);
const sharedCompletePaths = intersection(userCompletePaths, adminCompletePaths);
const userOnlyCompletePaths = difference(userCompletePaths, adminCompletePaths);
const adminOnlyCompletePaths = difference(adminCompletePaths, userCompletePaths);

const dynamicRootKeys = manifest
  ? [...new Set(Object.values(manifest).flatMap((item) => item.dynamicImports || []))]
  : [];
const dynamicChunks = dynamicRootKeys.map((rootKey) => {
  const graph = collectManifestGraph([rootKey], { includeDynamic: false });
  const outputPaths = collectOutputPaths(graph.visited);
  const files = filesForPaths(outputPaths);

  return {
    manifestKey: rootKey,
    name: manifest?.[rootKey]?.name || rootKey,
    file: manifest?.[rootKey]?.file || '',
    rawBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    gzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
    files: files.map((file) => file.name).sort(),
  };
});

if (manifest) {
  for (const [manifestKey, item] of Object.entries(manifest)) {
    const outputPaths = [item.file, ...(item.css || [])].filter(Boolean);
    for (const outputPath of outputPaths) {
      const asset = assetByOutputPath.get(outputPath);
      if (!asset) continue;
      asset.sourceEntries.push(manifestKey);
      const memberships = [];
      if (userInitialPaths.has(outputPath)) memberships.push('user-initial');
      else if (surfaceGraphs.user.asyncPaths.has(outputPath)) memberships.push('user-async');
      if (adminInitialPaths.has(outputPath)) memberships.push('admin-initial');
      else if (surfaceGraphs.admin.asyncPaths.has(outputPath)) memberships.push('admin-async');
      asset.surfaces = [...new Set([...asset.surfaces, ...memberships])];
    }
  }
}

for (const asset of assetFiles) {
  if (allInitialPaths.has(asset.outputPath)) asset.loadGroup = 'initial';
  else if (allAsyncPaths.has(asset.outputPath)) asset.loadGroup = 'async';
}

const files = assetFiles.sort((first, second) => second.bytes - first.bytes);
const total = summarizeFiles(files);
const initial = summarizePaths(allInitialPaths);
const asyncSummary = summarizePaths(allAsyncPaths);
const other = summarizeFiles(files.filter((file) => !allCompletePaths.has(file.outputPath)));

const surfaces = {
  user: {
    entryKeys: entryKeysBySurface.user,
    initial: summarizePaths(userInitialPaths),
    async: summarizePaths(surfaceGraphs.user.asyncPaths),
    complete: summarizePaths(userCompletePaths),
    dynamicRootKeys: surfaceGraphs.user.dynamicRootKeys,
  },
  admin: {
    entryKeys: entryKeysBySurface.admin,
    initial: summarizePaths(adminInitialPaths),
    async: summarizePaths(surfaceGraphs.admin.asyncPaths),
    complete: summarizePaths(adminCompletePaths),
    dynamicRootKeys: surfaceGraphs.admin.dynamicRootKeys,
  },
  shared: {
    initial: summarizePaths(sharedInitialPaths),
    complete: summarizePaths(sharedCompletePaths),
  },
  userOnly: {
    complete: summarizePaths(userOnlyCompletePaths),
  },
  adminOnly: {
    complete: summarizePaths(adminOnlyCompletePaths),
  },
};

const warnings = [];
if (!manifest) {
  warnings.push('Vite manifest가 없어 사용자/관리자 진입점별 청크를 구분하지 못했습니다.');
}
for (const surface of ['user', 'admin']) {
  const surfaceInitial = surfaces[surface].initial;
  if (surfaceInitial.jsGzipBytes > INITIAL_JS_GZIP_BUDGET) {
    warnings.push(
      `${surface} 초기 JavaScript gzip ${formatKb(surfaceInitial.jsGzipBytes)}가 기준 ${formatKb(INITIAL_JS_GZIP_BUDGET)}를 초과했습니다.`
    );
  }
  if (surfaceInitial.gzipBytes > INITIAL_TOTAL_GZIP_BUDGET) {
    warnings.push(
      `${surface} 초기 전체 gzip ${formatKb(surfaceInitial.gzipBytes)}가 기준 ${formatKb(INITIAL_TOTAL_GZIP_BUDGET)}를 초과했습니다.`
    );
  }
}
for (const file of files.filter(
  (file) => file.type === 'js' && file.bytes > SINGLE_JS_RAW_BUDGET
)) {
  warnings.push(
    `${file.name}: JavaScript 원본 ${formatKb(file.bytes)}가 ${formatKb(SINGLE_JS_RAW_BUDGET)}를 초과했습니다.`
  );
}

let comparison = null;
if (baselinePath && fs.existsSync(baselinePath)) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  comparison = {
    baselinePath: path.relative(projectRoot, baselinePath).replaceAll(path.sep, '/'),
    totalBytesDelta: total.bytes - Number(baseline.total?.bytes || 0),
    totalGzipBytesDelta: total.gzipBytes - Number(baseline.total?.gzipBytes || 0),
    initialBytesDelta: initial.bytes - Number(baseline.initial?.bytes || 0),
    initialGzipBytesDelta: initial.gzipBytes - Number(baseline.initial?.gzipBytes || 0),
    initialJsGzipBytesDelta: initial.jsGzipBytes - Number(baseline.initial?.jsGzipBytes || 0),
    asyncGzipBytesDelta: asyncSummary.gzipBytes - Number(baseline.async?.gzipBytes || 0),
    userInitialGzipBytesDelta:
      surfaces.user.initial.gzipBytes - Number(baseline.surfaces?.user?.initial?.gzipBytes || 0),
    adminInitialGzipBytesDelta:
      surfaces.admin.initial.gzipBytes - Number(baseline.surfaces?.admin?.initial?.gzipBytes || 0),
  };
} else if (baselinePath) {
  warnings.push(
    `비교 기준 파일을 찾지 못했습니다: ${path.relative(projectRoot, baselinePath)}`
  );
}

const report = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  manifestAvailable: Boolean(manifest),
  budgets: {
    initialJsGzipBytes: INITIAL_JS_GZIP_BUDGET,
    initialTotalGzipBytes: INITIAL_TOTAL_GZIP_BUDGET,
    singleJsRawBytes: SINGLE_JS_RAW_BUDGET,
  },
  total,
  initial,
  async: asyncSummary,
  other,
  surfaces,
  entryKeys,
  dynamicChunks: dynamicChunks.sort(
    (first, second) => second.gzipBytes - first.gzipBytes
  ),
  files,
  comparison,
  warnings,
};

const fileLines = files.map(
  (file) =>
    `${file.loadGroup.padEnd(8)} ${file.name.padEnd(42)} ${formatKb(file.bytes).padStart(10)} ${formatKb(file.gzipBytes).padStart(10)} ${file.surfaces.join(',')}`
);
const dynamicLines = report.dynamicChunks.map(
  (chunk) =>
    `${chunk.name.padEnd(42)} ${formatKb(chunk.rawBytes).padStart(10)} ${formatKb(chunk.gzipBytes).padStart(10)}`
);
const comparisonLines = comparison
  ? [
      '',
      `Comparison baseline: ${comparison.baselinePath}`,
      `Total raw delta: ${formatDeltaKb(comparison.totalBytesDelta)}`,
      `Total gzip delta: ${formatDeltaKb(comparison.totalGzipBytesDelta)}`,
      `Initial raw delta: ${formatDeltaKb(comparison.initialBytesDelta)}`,
      `Initial gzip delta: ${formatDeltaKb(comparison.initialGzipBytesDelta)}`,
      `User initial gzip delta: ${formatDeltaKb(comparison.userInitialGzipBytesDelta)}`,
      `Admin initial gzip delta: ${formatDeltaKb(comparison.adminInitialGzipBytesDelta)}`,
      `Async gzip delta: ${formatDeltaKb(comparison.asyncGzipBytesDelta)}`,
    ]
  : [];

const lines = [
  'Vite bundle analysis',
  `Generated: ${report.generatedAt}`,
  `Manifest: ${report.manifestAvailable ? 'available' : 'missing'}`,
  '',
  `Total: ${formatKb(total.bytes)} / gzip ${formatKb(total.gzipBytes)}`,
  `User initial: ${formatKb(surfaces.user.initial.bytes)} / gzip ${formatKb(surfaces.user.initial.gzipBytes)}`,
  `User async: ${formatKb(surfaces.user.async.bytes)} / gzip ${formatKb(surfaces.user.async.gzipBytes)}`,
  `Admin initial: ${formatKb(surfaces.admin.initial.bytes)} / gzip ${formatKb(surfaces.admin.initial.gzipBytes)}`,
  `Admin async: ${formatKb(surfaces.admin.async.bytes)} / gzip ${formatKb(surfaces.admin.async.gzipBytes)}`,
  `Shared complete: ${formatKb(surfaces.shared.complete.bytes)} / gzip ${formatKb(surfaces.shared.complete.gzipBytes)}`,
  '',
  'Group    File                                           Raw       Gzip Surfaces',
  '---------------------------------------------------------------------------------------',
  ...fileLines,
  '',
  'Dynamic entry                                  Raw       Gzip',
  '----------------------------------------------------------------',
  ...(dynamicLines.length ? dynamicLines : ['none']),
  ...comparisonLines,
  '',
  ...(warnings.length ? ['Warnings:', ...warnings] : ['Warnings: none']),
];

fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(reportTextPath, `${lines.join('\n')}\n`);

if (shouldSaveBaseline) {
  fs.copyFileSync(reportJsonPath, defaultBaselinePath);
  lines.push('', `Baseline saved: ${path.basename(defaultBaselinePath)}`);
}

console.log(lines.join('\n'));
