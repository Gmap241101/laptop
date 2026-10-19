import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const paths = {
  panel: '../../src/admin/AdminSettingsPanel.jsx',
  controller: '../../src/features/settings/useAdminDataMaintenanceController.js',
  client: '../../src/clerk/clerkStagingClient.js',
  app: '../../server/src/app.mjs',
};
const contents = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) =>
  [key, await readFile(new URL(path, import.meta.url), 'utf8')])));
for (const marker of ['백업 JSON 선택 복원', '복원 미리보기', '선택 데이터 복원 실행',
  '없는 데이터만 추가', '동일 ID 덮어쓰기', 'restoreAnalysis.restoreProof?.valid',
  'scope === \'organization\' && restorePayload?.members?.personalDataIncluded !== true',
]) assert.ok(contents.panel.includes(marker), `restore UI missing ${marker}`);
for (const marker of ['clearRestoreState', 'handleRestoreFile', 'analyzeRestore', 'executeRestore',
  'previewAdminSystemDataRestore', 'executeAdminSystemDataRestore', 'restoreConfirmText !== RESTORE_CONFIRM_TEXT']) {
  assert.ok(contents.controller.includes(marker), `restore controller missing ${marker}`);
}
for (const marker of ['requestAdminSystemDataRestore', 'systemDataRestorePreview',
  'systemDataRestoreResult', '/api/admin/system-data/restore/execute']) {
  assert.ok(contents.client.includes(marker), `restore API client missing ${marker}`);
}
assert.ok(contents.app.includes('maxBytes: 8 * 1024 * 1024'));
assert.ok(contents.app.includes('systemDataService.executeRestore(authority.adminAuth?.admin, body)'));
console.log('[phase34-scoped-restore-frontend-smoke] PASS');
