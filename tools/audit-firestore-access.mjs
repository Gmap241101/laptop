import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(process.cwd());
const SRC_ROOT = join(ROOT, 'src');
const POLICY_PATH = join(ROOT, 'tools', 'firestore-audit-policy.json');
const REPORT_ROOT = join(ROOT, '.performance-reports');
const JSON_REPORT_PATH = join(REPORT_ROOT, 'firestore-access-audit.json');
const TEXT_REPORT_PATH = join(REPORT_ROOT, 'firestore-access-audit.txt');
const TARGET_CALLS = new Set([
  'onSnapshot',
  'getDocs',
  'getDoc',
  'getDocsFromServer',
  'getDocFromServer',
  'getCountFromServer',
]);
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs']);
const strictMode = process.argv.includes('--strict');
const quietMode = process.argv.includes('--quiet');

const normalizeSpace = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const sha = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);

const walkFiles = (directory) => {
  const result = [];
  for (const name of readdirSync(directory)) {
    const fullPath = join(directory, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      result.push(...walkFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(extname(name))) {
      result.push(fullPath);
    }
  }
  return result.sort();
};

const maskNonCode = (source) => {
  const chars = source.split('');
  let state = 'code';
  let escaped = false;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const next = chars[index + 1];

    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      else chars[index] = ' ';
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        index += 1;
        state = 'code';
      } else if (char !== '\n') {
        chars[index] = ' ';
      }
      continue;
    }

    if (state === 'single' || state === 'double' || state === 'template') {
      const closing = state === 'single' ? "'" : state === 'double' ? '"' : '`';
      if (char === '\n' && state !== 'template') {
        state = 'code';
        escaped = false;
        continue;
      }
      if (!escaped && char === closing) {
        chars[index] = ' ';
        state = 'code';
      } else {
        if (char !== '\n') chars[index] = ' ';
        escaped = !escaped && char === '\\';
        if (char !== '\\') escaped = false;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'line-comment';
      continue;
    }
    if (char === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'block-comment';
      continue;
    }
    if (char === "'") {
      chars[index] = ' ';
      state = 'single';
      escaped = false;
      continue;
    }
    if (char === '"') {
      chars[index] = ' ';
      state = 'double';
      escaped = false;
      continue;
    }
    if (char === '`') {
      chars[index] = ' ';
      state = 'template';
      escaped = false;
    }
  }
  return chars.join('');
};

const skipSpace = (source, start) => {
  let index = start;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
};

const findMatching = (masked, openIndex, openChar = '(', closeChar = ')') => {
  let depth = 0;
  for (let index = openIndex; index < masked.length; index += 1) {
    if (masked[index] === openChar) depth += 1;
    if (masked[index] === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const splitTopLevelArgs = (source, masked, start, end) => {
  const args = [];
  let partStart = start;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  for (let index = start; index < end; index += 1) {
    const char = masked[index];
    if (char === '(') paren += 1;
    else if (char === ')') paren -= 1;
    else if (char === '[') bracket += 1;
    else if (char === ']') bracket -= 1;
    else if (char === '{') brace += 1;
    else if (char === '}') brace -= 1;
    else if (char === ',' && paren === 0 && bracket === 0 && brace === 0) {
      args.push(source.slice(partStart, index).trim());
      partStart = index + 1;
    }
  }
  if (partStart < end) args.push(source.slice(partStart, end).trim());
  return args;
};

const findExpressionEnd = (masked, start) => {
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  for (let index = start; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === '(') paren += 1;
    else if (char === ')') paren -= 1;
    else if (char === '[') bracket += 1;
    else if (char === ']') bracket -= 1;
    else if (char === '{') brace += 1;
    else if (char === '}') brace -= 1;
    else if (char === ';' && paren === 0 && bracket === 0 && brace === 0) return index;
  }
  return masked.length;
};

const collectSymbolTable = (files) => {
  const table = new Map();
  const declarationPattern = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g;
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    const masked = maskNonCode(source);
    declarationPattern.lastIndex = 0;
    let match;
    while ((match = declarationPattern.exec(masked))) {
      const expressionStart = skipSpace(masked, match.index + match[0].length);
      const expressionEnd = findExpressionEnd(masked, expressionStart);
      const expression = source.slice(expressionStart, expressionEnd).trim();
      if (!table.has(match[1])) table.set(match[1], expression);
    }
  }
  return table;
};

const findLocalDeclaration = (source, masked, identifier, beforeIndex) => {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=`, 'g');
  let last = null;
  let match;
  while ((match = pattern.exec(masked)) && match.index < beforeIndex) last = match;
  if (!last) return null;
  const expressionStart = skipSpace(masked, last.index + last[0].length);
  const expressionEnd = findExpressionEnd(masked, expressionStart);
  return source.slice(expressionStart, expressionEnd).trim();
};

const resolveExpression = ({ expression, source, masked, beforeIndex, symbols, seen = new Set() }) => {
  const trimmed = expression.trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(trimmed) || seen.has(trimmed)) return trimmed;
  seen.add(trimmed);
  const local = findLocalDeclaration(source, masked, trimmed, beforeIndex);
  const candidate = local || symbols.get(trimmed);
  if (!candidate) return trimmed;
  return resolveExpression({ expression: candidate, source, masked, beforeIndex, symbols, seen });
};

const findCalls = (filePath, symbols) => {
  const source = readFileSync(filePath, 'utf8');
  const masked = maskNonCode(source);
  const pattern = /\b(onSnapshot|getDocsFromServer|getDocFromServer|getDocs|getDoc|getCountFromServer)\s*\(/g;
  const calls = [];
  let match;
  while ((match = pattern.exec(masked))) {
    const rawCallName = match[1];
    if (!TARGET_CALLS.has(rawCallName)) continue;
    const callName = rawCallName === 'getDocsFromServer'
      ? 'getDocs'
      : rawCallName === 'getDocFromServer'
        ? 'getDoc'
        : rawCallName;
    const openIndex = masked.indexOf('(', match.index + rawCallName.length);
    const closeIndex = findMatching(masked, openIndex);
    if (closeIndex < 0) continue;
    const args = splitTopLevelArgs(source, masked, openIndex + 1, closeIndex);
    const rawSource = args[0] || '';
    const resolvedSource = resolveExpression({
      expression: rawSource,
      source,
      masked,
      beforeIndex: match.index,
      symbols,
    });
    const line = source.slice(0, match.index).split('\n').length;
    const contextStart = Math.max(0, source.lastIndexOf('\n', Math.max(0, match.index - 700)) + 1);
    const contextEndRaw = source.indexOf('\n', Math.min(source.length, closeIndex + 500));
    const contextEnd = contextEndRaw < 0 ? source.length : contextEndRaw;
    calls.push({
      callName,
      line,
      index: match.index,
      rawSource,
      resolvedSource,
      context: source.slice(contextStart, contextEnd),
    });
    pattern.lastIndex = closeIndex + 1;
  }
  return calls;
};

const extractCollectionLabels = (expression) => {
  const labels = new Set();
  for (const match of expression.matchAll(/\b([A-Z][A-Z0-9_]*_COLLECTION_REF)\b/g)) labels.add(match[1]);
  for (const match of expression.matchAll(/\bcollection\s*\([^,]+,\s*['"]([^'"]+)['"]/g)) labels.add(match[1]);
  for (const match of expression.matchAll(/\bdoc\s*\([^,]+,\s*['"]([^'"]+)['"]/g)) labels.add(match[1]);
  return [...labels];
};

const isDocumentSource = (rawSource, resolvedSource) => {
  const combined = `${rawSource} ${resolvedSource}`;
  return /\bdoc\s*\(/.test(combined) || /\b[A-Z][A-Z0-9_]*_DOC_REF\b/.test(combined) || /DocRef\b/.test(combined);
};

const hasAny = (expression, names) => names.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(expression));

const classifyFinding = (call, policy, occurrence) => {
  const expression = normalizeSpace(call.resolvedSource || call.rawSource);
  const raw = normalizeSpace(call.rawSource);
  const documentSource = isDocumentSource(raw, expression);
  const hasLimit = hasAny(expression, ['limit', 'firestoreLimit']);
  const hasWhere = hasAny(expression, ['where']);
  const hasOrderBy = hasAny(expression, ['orderBy']);
  const hasCursor = hasAny(expression, ['startAfter', 'startAt', 'endAt', 'endBefore']);
  const collectionLabels = extractCollectionLabels(`${raw} ${expression}`);
  const highGrowth = collectionLabels.some((label) => policy.highGrowthCollections.includes(label));
  const directCollection = /_COLLECTION_REF\b/.test(expression) || /\bcollection\s*\(/.test(expression);
  const scopeSignal = /\b(view|userTab|adminTab|mode|selected[A-Z]|should[A-Z]|isAdminAuthenticated|firebaseAuthUser|authenticatedAdminId)\b/.test(call.context);

  let severity = 'info';
  let rule = 'bounded-or-document';
  let message = '문서 단건 또는 제한된 쿼리입니다.';

  if (call.callName === 'onSnapshot') {
    if (documentSource) {
      rule = 'document-listener';
      message = '문서 단건 실시간 구독입니다.';
    } else if (hasLimit) {
      rule = 'bounded-listener';
      message = 'limit이 적용된 실시간 쿼리입니다.';
    } else if (highGrowth && !hasWhere) {
      severity = 'error';
      rule = 'unbounded-high-growth-listener';
      message = '증가 가능성이 큰 컬렉션을 조건과 limit 없이 실시간 구독합니다.';
    } else if (highGrowth && hasWhere) {
      severity = 'warning';
      rule = 'filtered-unbounded-high-growth-listener';
      message = '증가 가능성이 큰 컬렉션을 where 조건으로 제한하지만 결과 개수 limit이 없습니다.';
    } else if (hasWhere) {
      severity = 'warning';
      rule = 'filtered-unbounded-collection-listener';
      message = 'where 조건은 있지만 결과 개수 limit이 없는 실시간 쿼리입니다.';
    } else if (directCollection) {
      severity = 'warning';
      rule = 'unbounded-collection-listener';
      message = '컬렉션 전체 실시간 구독이며 limit이 없습니다.';
    } else {
      severity = 'warning';
      rule = 'unresolved-listener-source';
      message = '실시간 구독 데이터 원본과 제한 조건을 자동 판정하지 못했습니다.';
    }
  } else if (call.callName === 'getDocs') {
    if (hasLimit) {
      rule = 'bounded-read';
      message = 'limit이 적용된 일회성 조회입니다.';
    } else if (highGrowth && !hasWhere) {
      severity = 'warning';
      rule = 'full-high-growth-read';
      message = '증가 가능성이 큰 컬렉션을 전체 일회성 조회합니다.';
    } else if (highGrowth && hasWhere) {
      severity = 'warning';
      rule = 'filtered-unbounded-high-growth-read';
      message = '증가 가능성이 큰 컬렉션을 where로 제한하지만 결과 개수 limit이 없습니다.';
    } else if (hasWhere) {
      severity = 'warning';
      rule = 'filtered-unbounded-collection-read';
      message = 'where 조건은 있지만 결과 개수 limit이 없는 일회성 쿼리입니다.';
    } else if (directCollection) {
      severity = 'warning';
      rule = 'full-collection-read';
      message = '컬렉션 전체 일회성 조회이며 limit이 없습니다.';
    } else {
      rule = 'query-read';
      message = '일회성 쿼리 조회입니다.';
    }
  } else if (call.callName === 'getCountFromServer') {
    rule = 'aggregation-read';
    message = '서버 집계 조회입니다.';
  } else if (call.callName === 'getDoc') {
    rule = 'document-read';
    message = '문서 단건 조회입니다.';
  }

  const signatureSource = normalizeSpace(expression).slice(0, 1200);
  const relativeFile = relative(ROOT, call.filePath).replaceAll('\\', '/');
  const id = `${call.callName}:${sha(`${relativeFile}|${call.callName}|${rule}|${signatureSource}|${occurrence}`)}`;
  const approval = policy.approvedFindings.find((item) => item.id === id) || null;

  return {
    id,
    occurrence,
    severity,
    effectiveSeverity: approval ? 'approved' : severity,
    approved: Boolean(approval),
    approvalReason: approval?.reason || '',
    rule,
    message,
    call: call.callName,
    file: relativeFile,
    line: call.line,
    source: raw.slice(0, 500),
    resolvedSource: expression.slice(0, 1200),
    collections: collectionLabels,
    highGrowth,
    documentSource,
    hasWhere,
    hasOrderBy,
    hasLimit,
    hasCursor,
    scopeSignal,
  };
};

if (!existsSync(SRC_ROOT)) {
  console.error('src directory not found:', SRC_ROOT);
  process.exit(2);
}
if (!existsSync(POLICY_PATH)) {
  console.error('Firestore audit policy not found:', POLICY_PATH);
  process.exit(2);
}

const policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
const files = walkFiles(SRC_ROOT);
const symbols = collectSymbolTable(files);
const calls = [];
for (const filePath of files) {
  for (const call of findCalls(filePath, symbols)) calls.push({ ...call, filePath });
}

const occurrenceMap = new Map();
const findings = calls.map((call) => {
  const key = `${relative(ROOT, call.filePath).replaceAll('\\', '/')}|${call.callName}|${normalizeSpace(call.resolvedSource || call.rawSource)}`;
  const occurrence = (occurrenceMap.get(key) || 0) + 1;
  occurrenceMap.set(key, occurrence);
  return classifyFinding(call, policy, occurrence);
});
const unapproved = findings.filter((item) => !item.approved && ['warning', 'error'].includes(item.severity));
const unapprovedErrors = unapproved.filter((item) => item.severity === 'error');
const unapprovedWarnings = unapproved.filter((item) => item.severity === 'warning');
const approved = findings.filter((item) => item.approved);
const REPORT_CALLS = ['onSnapshot', 'getDocs', 'getDoc', 'getCountFromServer'];
const countsByCall = Object.fromEntries(REPORT_CALLS.map((name) => [name, findings.filter((item) => item.call === name).length]));
const countsByRule = {};
for (const item of findings) countsByRule[item.rule] = (countsByRule[item.rule] || 0) + 1;

const report = {
  generatedAt: new Date().toISOString(),
  project: basename(ROOT),
  strictMode,
  sourceFilesScanned: files.length,
  totalCalls: findings.length,
  countsByCall,
  countsByRule,
  approvedRiskFindings: approved.length,
  unapprovedWarnings: unapprovedWarnings.length,
  unapprovedErrors: unapprovedErrors.length,
  result: unapprovedErrors.length > 0 || (strictMode && unapprovedWarnings.length > 0) ? 'fail' : 'pass',
  policy: {
    path: relative(ROOT, POLICY_PATH).replaceAll('\\', '/'),
    highGrowthCollections: policy.highGrowthCollections,
  },
  findings,
};

mkdirSync(REPORT_ROOT, { recursive: true });
writeFileSync(JSON_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const lines = [];
lines.push('Firestore access audit');
lines.push('======================');
lines.push(`Generated: ${report.generatedAt}`);
lines.push(`Result: ${report.result.toUpperCase()}`);
lines.push(`Source files: ${report.sourceFilesScanned}`);
lines.push(`Total calls: ${report.totalCalls}`);
lines.push(`onSnapshot: ${countsByCall.onSnapshot}`);
lines.push(`getDocs: ${countsByCall.getDocs}`);
lines.push(`getDoc: ${countsByCall.getDoc}`);
lines.push(`getCountFromServer: ${countsByCall.getCountFromServer}`);
lines.push(`Approved risk findings: ${approved.length}`);
lines.push(`Unapproved warnings: ${unapprovedWarnings.length}`);
lines.push(`Unapproved errors: ${unapprovedErrors.length}`);
lines.push('');
lines.push('Unapproved findings');
lines.push('-------------------');
if (unapproved.length === 0) {
  lines.push('None');
} else {
  for (const item of unapproved) {
    lines.push(`[${item.severity.toUpperCase()}] ${item.id}`);
    lines.push(`  ${item.file}:${item.line}`);
    lines.push(`  ${item.message}`);
    lines.push(`  source: ${item.resolvedSource}`);
  }
}
lines.push('');
lines.push('Approved exceptions');
lines.push('-------------------');
if (approved.length === 0) {
  lines.push('None');
} else {
  for (const item of approved) {
    lines.push(`[APPROVED ${item.severity.toUpperCase()}] ${item.id}`);
    lines.push(`  ${item.file}:${item.line}`);
    lines.push(`  ${item.approvalReason}`);
  }
}
lines.push('');
lines.push('All calls');
lines.push('---------');
for (const item of findings) {
  lines.push(`[${item.effectiveSeverity.toUpperCase()}] ${item.call} ${item.file}:${item.line} ${item.rule}`);
}
writeFileSync(TEXT_REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');

if (!quietMode) console.log(lines.slice(0, unapproved.length === 0 ? 14 : Math.min(lines.length, 80)).join('\n'));

if (unapprovedErrors.length > 0 || (strictMode && unapprovedWarnings.length > 0)) process.exit(1);
