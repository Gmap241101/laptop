import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const panel = await readFile(new URL('../../src/admin/AdminSettingsPanel.jsx', import.meta.url), 'utf8');
const controller = await readFile(new URL('../../src/features/settings/useAdminDataMaintenanceController.js', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../../src/hooks/useDashboardSummary.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../../src/clerk/clerkStagingClient.js', import.meta.url), 'utf8');

for (const text of [
  'PostgreSQL 저장소 현황',
  '자산 등록 상태',
  'SQL 무결성 점검',
  '자산 참조 자동 복구',
  'PostgreSQL 백업 JSON 다운로드',
  'PostgreSQL 데이터 초기화',
  '초기화 대상 확인',
  '선택 데이터 초기화',
]) assert.ok(panel.includes(text), `data management UI missing: ${text}`);

for (const method of [
  'getAdminSystemDataOverview',
  'runAdminSystemDataIntegrity',
  'repairAdminSystemDataAssetReferences',
  'exportAdminSystemData',
  'scanAdminSystemDataReset',
  'resetAdminSystemData',
]) assert.ok(client.includes(method), `client missing ${method}`);

assert.ok(controller.includes('clerkStagingClient.getAdminSystemDataOverview()'));
assert.ok(controller.includes('clerkStagingClient.runAdminSystemDataIntegrity()'));
assert.ok(controller.includes('clerkStagingClient.repairAdminSystemDataAssetReferences()'));
assert.ok(controller.includes('clerkStagingClient.exportAdminSystemData('));
assert.ok(controller.includes('clerkStagingClient.scanAdminSystemDataReset(selectedResetScopes)'));
assert.ok(controller.includes('clerkStagingClient.resetAdminSystemData({'));
assert.ok(controller.includes('includePersonalData: true'));
assert.ok(panel.includes('백업·초기화'));
assert.ok(panel.includes('테스트 데이터 선택'));
assert.ok(panel.includes('전체 초기화 범위 선택'));
assert.ok(dashboard.includes('clerkStagingClient.getAdminSystemDataOverview()'));
assert.ok(dashboard.includes('missingAsset: Number(assetReference.missingRequestCount || 0)'));
assert.ok(!panel.includes('브라우저에서 직접 데이터베이스를 덤프하거나 초기화하는 기능은 Phase 34에서 제거되었습니다.'));

console.log('[phase34-system-data-frontend-smoke] PASS');
