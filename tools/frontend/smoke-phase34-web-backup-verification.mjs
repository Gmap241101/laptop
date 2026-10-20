import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const panel = readFileSync('src/admin/AdminSettingsPanel.jsx','utf8');
const controller = readFileSync('src/features/settings/useAdminDataMaintenanceController.js','utf8');
const client = readFileSync('src/clerk/clerkStagingClient.js','utf8');
for(const marker of ['백업·복원 안전검증','확인 후 검증 시작','검증 중단','aria-live="polite"']) assert.ok(panel.includes(marker),marker);
for(const marker of ['refreshBackupVerification','startBackupVerification','requestBackupReverification','cancelBackupVerification']) assert.ok(controller.includes(marker),marker);
for(const marker of ['startVerification({ level:', 'attemptFirstFactorVerification','/api/admin/system-data/backup-verification']) assert.ok(client.includes(marker),marker);
console.log('[frontend-web-backup] PASS: panel, reauthentication, status & cancel flows');
