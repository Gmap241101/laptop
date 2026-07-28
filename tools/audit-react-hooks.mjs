import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const SOURCE_ROOT = path.join(PROJECT_ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs']);

const REACT_HOOKS = [
  'useActionState',
  'useCallback',
  'useContext',
  'useDebugValue',
  'useDeferredValue',
  'useEffect',
  'useId',
  'useImperativeHandle',
  'useInsertionEffect',
  'useLayoutEffect',
  'useMemo',
  'useOptimistic',
  'useReducer',
  'useRef',
  'useState',
  'useSyncExternalStore',
  'useTransition',
];

const walkSourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return walkSourceFiles(absolutePath);
    }

    return SOURCE_EXTENSIONS.has(path.extname(entry.name))
      ? [absolutePath]
      : [];
  });

const stripCommentsAndStrings = (source) => {
  let result = '';
  let state = 'code';
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1] || '';

    if (state === 'code') {
      if (current === '/' && next === '/') {
        result += '  ';
        index += 1;
        state = 'line-comment';
      } else if (current === '/' && next === '*') {
        result += '  ';
        index += 1;
        state = 'block-comment';
      } else if (current === "'") {
        result += ' ';
        state = 'single-quote';
        escaped = false;
      } else if (current === '"') {
        result += ' ';
        state = 'double-quote';
        escaped = false;
      } else if (current === '`') {
        result += ' ';
        state = 'template';
        escaped = false;
      } else {
        result += current;
      }
      continue;
    }

    if (current === '\n') {
      result += '\n';
      if (state === 'line-comment') state = 'code';
      escaped = false;
      continue;
    }

    result += ' ';

    if (state === 'block-comment' && current === '*' && next === '/') {
      result += ' ';
      index += 1;
      state = 'code';
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (current === '\\') {
      escaped = true;
      continue;
    }

    if (
      (state === 'single-quote' && current === "'") ||
      (state === 'double-quote' && current === '"') ||
      (state === 'template' && current === '`')
    ) {
      state = 'code';
    }
  }

  return result;
};

const getNamedReactImports = (source) => {
  const importedNames = new Set();
  const importPattern = /import\s+([\s\S]*?)\s+from\s+['"]react['"]\s*;?/g;

  for (const match of source.matchAll(importPattern)) {
    const clause = match[1] || '';
    const namedMatch = clause.match(/\{([\s\S]*?)\}/);
    if (!namedMatch) continue;

    namedMatch[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const aliasParts = entry.split(/\s+as\s+/);
        importedNames.add((aliasParts[1] || aliasParts[0]).trim());
      });
  }

  return importedNames;
};

const removeImportDeclarations = (source) =>
  source.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"]\s*;?/g, '');

const isLocallyDeclared = (source, identifier) => {
  const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declarationPatterns = [
    new RegExp(`\\b(?:const|let|var)\\s+${escapedIdentifier}\\b`),
    new RegExp(`\\bfunction\\s+${escapedIdentifier}\\b`),
    new RegExp(`\\bclass\\s+${escapedIdentifier}\\b`),
  ];

  return declarationPatterns.some((pattern) => pattern.test(source));
};

const findings = [];
const sourceFiles = walkSourceFiles(SOURCE_ROOT);

sourceFiles.forEach((absolutePath) => {
  const rawSource = fs.readFileSync(absolutePath, 'utf8');
  const importedNames = getNamedReactImports(rawSource);
  const executableSource = removeImportDeclarations(
    stripCommentsAndStrings(rawSource)
  );

  REACT_HOOKS.forEach((hookName) => {
    const usagePattern = new RegExp(
      `(^|[^A-Za-z0-9_$\\.])${hookName}\\s*\\(`,
      'm'
    );

    if (!usagePattern.test(executableSource)) return;
    if (importedNames.has(hookName)) return;
    if (isLocallyDeclared(executableSource, hookName)) return;

    const beforeUsage = executableSource.slice(
      0,
      executableSource.search(usagePattern)
    );

    findings.push({
      file: path.relative(PROJECT_ROOT, absolutePath).replaceAll(path.sep, '/'),
      hook: hookName,
      line: beforeUsage.split('\n').length,
    });
  });
});

if (findings.length > 0) {
  console.error('React hook import audit: FAIL');
  findings.forEach((finding) => {
    console.error(
      `- ${finding.file}:${finding.line} ${finding.hook}() is used without a matching named import from react.`
    );
  });
  process.exit(1);
}

console.log(
  `React hook import audit: PASS (${sourceFiles.length} source files checked)`
);
