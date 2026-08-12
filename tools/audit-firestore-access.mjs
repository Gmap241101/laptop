import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(process.cwd());
const SRC_ROOT = join(ROOT, 'src');
const SERVER_ROOT = join(ROOT, 'server', 'src');
const REPORT_ROOT = join(ROOT, '.performance-reports');
const JSON_REPORT_PATH = join(REPORT_ROOT, 'firestore-access-audit.json');
const TEXT_REPORT_PATH = join(REPORT_ROOT, 'firestore-access-audit.txt');
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs']);
const quietMode = process.argv.includes('--quiet');

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (SOURCE_EXTENSIONS.has(extname(name))) out.push(p);
  }
  return out;
};

const files = [...walk(SRC_ROOT), ...walk(SERVER_ROOT)];
const forbidden = [
  { label: 'Firebase SDK import', regex: /(?:from\s+|import\s*\()(['"])firebase(?:\/[^'"]*)?\1/g },
  { label: 'Firestore REST endpoint', regex: /firestore\.googleapis\.com/gi },
  { label: 'Firebase Identity Toolkit endpoint', regex: /identitytoolkit\.googleapis\.com/gi },
  { label: 'Firebase Secure Token endpoint', regex: /securetoken\.googleapis\.com/gi },
  { label: 'Firebase Auth domain', regex: /\.firebaseapp\.com/gi },
  { label: 'Firebase Storage domain', regex: /\.firebasestorage\.app/gi },
  { label: 'Firebase authorization header', regex: /X-Firebase-Authorization/gi },
];
const violations = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(source))) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push({ file: relative(ROOT, file).replaceAll('\\', '/'), line, rule: rule.label, text: match[0] });
    }
  }
}

mkdirSync(REPORT_ROOT, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  mode: 'phase34-hard-retirement',
  filesChecked: files.length,
  externalFirebaseRuntimeReferences: violations.length,
  result: violations.length ? 'fail' : 'pass',
  violations,
};
writeFileSync(JSON_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
const lines = [
  'External Firebase/Firestore runtime audit',
  `Files checked: ${files.length}`,
  `External Firebase runtime references: ${violations.length}`,
  `Result: ${report.result.toUpperCase()}`,
];
for (const item of violations) lines.push(`[${item.rule}] ${item.file}:${item.line} ${item.text}`);
writeFileSync(TEXT_REPORT_PATH, `${lines.join('\n')}\n`);
if (!quietMode) console.log(lines.join('\n'));
if (violations.length) process.exit(1);
