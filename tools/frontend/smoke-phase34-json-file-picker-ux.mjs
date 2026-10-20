import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const panel = readFileSync(resolve(root, 'src/admin/AdminSettingsPanel.jsx'), 'utf8');
const controller = readFileSync(resolve(root, 'src/features/settings/useAdminDataMaintenanceController.js'), 'utf8');
const pickerStart = panel.indexOf('id="postgres-restore-json-file"');
assert.ok(pickerStart > 0, 'JSON file input missing');
const picker = panel.slice(pickerStart - 140, pickerStart + 1550);
for (const marker of [
  'type="file"', 'className="peer sr-only"', 'htmlFor="postgres-restore-json-file"',
  'id="postgres-restore-selected-filename"', 'aria-live="polite"',
  "{restoreFileName || '선택된 파일 없음'}", "title={restoreFileName || undefined}",
  "const file = event.target.files?.[0]; event.target.value = ''; void handleRestoreFile(file);",
  'peer-focus-visible:ring-2', 'peer-disabled:cursor-not-allowed',
]) assert.ok(picker.includes(marker), `file picker UI missing: ${marker}`);
assert.ok(!panel.includes('선택한 파일: {restoreFileName}'), 'obsolete duplicate filename line must be removed');
assert.ok(controller.includes('restoreFileSelectionRef = useRef(0)'), 'race guard missing');
assert.ok(controller.includes('restorePreviewRequestRef = useRef(0)'), 'preview race guard missing');
assert.ok(controller.includes('++restorePreviewRequestRef.current'), 'stale preview invalidation missing');
assert.ok(!panel.includes('className="block w-full rounded-xl border border-slate-300 p-3 text-sm" />\n          {restoreFileName'), 'old native input used');

// Exercise the actual handler extracted from the controller, not a duplicate implementation.
function extractCallback(name) {
  const pos = controller.indexOf(`const ${name} = useCallback(`);
  assert.ok(pos >= 0, `${name} callback missing`);
  const begin = controller.indexOf('async (', pos);
  const end = controller.indexOf('\n  }, [', begin);
  assert.ok(begin > pos && end > begin, `${name} callback parsing failed`);
  return `(${controller.slice(begin, end)}\n  })`;
}

let name = '', payload = null, preview = null, confirmed = 'stale', scopes = [], fileReads = 0, toasts = [];
const fileRef = { current: 0 };
const previewRef = { current: 0 };
const state = {
  restoreFileSelectionRef: fileRef,
  restorePreviewRequestRef: previewRef,
  clearRestoreState: () => {
    previewRef.current++;
    name = ''; payload = null; preview = null; confirmed = '';
  },
  setRestorePayload: (value) => { payload = value; },
  setRestoreFileName: (value) => { name = value; },
  setSelectedRestoreScopesState: (value) => { scopes = value; },
  triggerToast: (...args) => { toasts.push(args); },
};
const handle = vm.runInNewContext(extractCallback('handleRestoreFile'), state);
const snapshot = JSON.stringify({ format: 'mk-rental-postgresql-backup-v1', authority: 'postgresql', schemaMigrations: [] });
const fixture = (filename, source = snapshot) => ({ name: filename, size: source.length, text: async () => { fileReads++; return source; } });

await handle(fixture('first.json'));
assert.equal(name, 'first.json');
assert.equal(payload.authority, 'postgresql');
assert.equal(scopes.join(','), 'site,boards');
await handle(fixture('first.json')); // reset input enables same-file re-selection
assert.equal(fileReads, 2);
assert.equal(name, 'first.json');
await handle(fixture('second.json'));
assert.equal(name, 'second.json');
assert.equal(confirmed, '');
assert.equal(preview, null);
await handle(fixture('invalid.json', '{broken'));
assert.equal(name, '');
assert.equal(payload, null);
assert.ok(toasts.some((item) => item[1] === 'error'));
await handle({ name: 'oversize.json', size: 8 * 1024 * 1024, text: async () => { throw Error('should-not-read'); } });
assert.equal(name, '');

let resolveOlder;
const older = { name: 'old.json', size: 1, text: () => new Promise((r) => { resolveOlder = r; }) };
const olderPromise = handle(older);
await handle(fixture('latest.json'));
resolveOlder(snapshot);
await olderPromise;
assert.equal(name, 'latest.json', 'late older file result overwrote newer selection');
assert.equal(payload.authority, 'postgresql');

// A pending preview for a superseded file must not reappear after file replacement.
let resolvePreview;
let previewValue = null;
let previewLoading = false;
const previewContext = {
  restorePreviewRequestRef: previewRef,
  restorePayload: payload,
  selectedRestoreScopes: ['site', 'boards'],
  restoreMode: 'addMissing',
  setRestoreAnalyzeLoading: (value) => { previewLoading = value; },
  setRestoreResult: () => {},
  setRestoreAnalysis: (value) => { previewValue = value; },
  triggerToast: (...args) => { toasts.push(args); },
  clerkStagingClient: {
    previewAdminSystemDataRestore: () => new Promise((r) => { resolvePreview = r; }),
  },
};
const analyze = vm.runInNewContext(extractCallback('analyzeRestore'), previewContext);
const pending = analyze();
assert.equal(previewLoading, true);
previewRef.current++; // new file or restore scope selection invalidates old preview
resolvePreview({ systemDataRestorePreview: { previewSha256: 'old-preview' } });
await pending;
assert.equal(previewValue, null, 'stale preview returned after file replacement');

const checked = { file: fileReads, stalePreviewIgnored: previewValue === null, staleFileIgnored: name === 'latest.json', scopeReset: scopes.join(',') === 'site,boards' };
console.log(`[phase34-json-file-picker] PASS: single accessible picker, same-file reselect, file replacement, invalid input, oversize, async stale read guard (${JSON.stringify(checked)})`);
