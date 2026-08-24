import { useCallback, useEffect, useState } from 'react';

import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { SYSTEM_RESET_SCOPE } from '../../utils/systemSettings.js';
import { RESTORE_CONFIRM_TEXT, RESTORE_MODE, RESTORE_SCOPE_META } from '../../utils/systemRestore.js';
import { formatKoreanDateTime } from '../../utils/appUtils.js';

export const RESET_SCOPE_META = {
  [SYSTEM_RESET_SCOPE.ASSETS]: { label: '자산', description: 'PostgreSQL 자산 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.MEMBERS]: { label: '일반회원 정보', description: 'PostgreSQL 회원 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.RENTALS]: { label: '신청·대여내역', description: 'PostgreSQL 대여 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.ORGANIZATION]: { label: '부서·사용자 명부', description: 'PostgreSQL 명부 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.CONTENT]: { label: '게시물·사이트 콘텐츠', description: 'PostgreSQL 콘텐츠 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.SETTINGS]: { label: '사이트·운영 설정', description: 'PostgreSQL 설정 데이터를 관리합니다.', collections: [] },
};

export const TEST_DATA_PRESET = [SYSTEM_RESET_SCOPE.ASSETS, SYSTEM_RESET_SCOPE.MEMBERS, SYSTEM_RESET_SCOPE.RENTALS];
export const FULL_RESET_PRESET = Object.values(SYSTEM_RESET_SCOPE);
export const RESET_CONFIRM_TEXT = '테스트 데이터 전체 초기화';
export { RESTORE_CONFIRM_TEXT, RESTORE_MODE, RESTORE_SCOPE_META };

export const cloneForAudit = (value) => JSON.parse(JSON.stringify(value || {}));
export const getAdminDisplayName = (account) => account?.userName || account?.adminLoginId || account?.authEmail || account?.id || '관리자';
export const getAdminRole = (account) => account?.adminRole || 'owner';

const retiredOperation = async () => Object.freeze({ retired: true, source: 'postgresql-operations' });
const RESET_PROGRESS_IDLE = null;
const formatCheckedAt = (value) => formatKoreanDateTime(value, '기록 없음');

export default function useAdminDataMaintenanceController({ authenticatedAdminAccount, mode, triggerToast }) {
  const [backupIncludeOperations, setBackupIncludeOperations] = useState(true);
  const [backupIncludeMembers, setBackupIncludeMembers] = useState(false);
  const [backupIncludePersonalData, setBackupIncludePersonalData] = useState(false);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityResult, setIntegrityResult] = useState(null);
  const [repairLoading, setRepairLoading] = useState(false);
  const [catalogMetadataReconcileLoading, setCatalogMetadataReconcileLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [selectedResetScopes, setSelectedResetScopesState] = useState(TEST_DATA_PRESET);
  const [resetCounts, setResetCounts] = useState(null);
  const [resetScanLoading, setResetScanLoading] = useState(false);
  const [resetRunning, setResetRunning] = useState(false);
  const [resetProgress, setResetProgress] = useState(RESET_PROGRESS_IDLE);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetBackupReady, setResetBackupReady] = useState(false);
  const [latestResetJob, setLatestResetJob] = useState(null);

  const refreshOverview = useCallback(async ({ silent = false } = {}) => {
    if (!authenticatedAdminAccount?.id) return null;
    setOverviewLoading(true);
    setOverviewError('');
    try {
      const payload = await clerkStagingClient.getAdminSystemDataOverview();
      const next = payload?.systemDataOverview || null;
      setOverview(next);
      if (next?.integrity) {
        setIntegrityResult({
          ...next.integrity,
          checkedAtText: formatCheckedAt(next.integrity.checkedAt),
        });
      }
      if (!silent) triggerToast?.('PostgreSQL 데이터 현황을 새로고침했습니다.', 'success');
      return next;
    } catch (error) {
      const code = error?.code || error?.message || 'system_data_overview_failed';
      setOverviewError(code);
      if (!silent) triggerToast?.(`PostgreSQL 데이터 현황을 불러오지 못했습니다. 오류 코드: ${code}`, 'error');
      return null;
    } finally {
      setOverviewLoading(false);
    }
  }, [authenticatedAdminAccount?.id, triggerToast]);

  useEffect(() => {
    if (mode !== 'data' || !authenticatedAdminAccount?.id) return;
    void refreshOverview({ silent: true });
  }, [authenticatedAdminAccount?.id, mode, refreshOverview]);

  const runIntegrityCheck = useCallback(async () => {
    setIntegrityLoading(true);
    try {
      const payload = await clerkStagingClient.runAdminSystemDataIntegrity();
      const next = payload?.systemDataIntegrity || null;
      if (!next) throw new Error('system_data_integrity_payload_missing');
      setIntegrityResult({ ...next, checkedAtText: formatCheckedAt(next.checkedAt) });
      setOverview((previous) => previous ? { ...previous, integrity: next } : previous);
      triggerToast?.(
        next.errors || next.warnings
          ? `PostgreSQL 무결성 점검이 완료되었습니다. 오류 ${next.errors || 0}건, 주의 ${next.warnings || 0}건.`
          : 'PostgreSQL 무결성 점검 결과 이상이 없습니다.',
        next.errors ? 'error' : next.warnings ? 'warning' : 'success'
      );
      return next;
    } catch (error) {
      const code = error?.code || error?.message || 'system_data_integrity_failed';
      triggerToast?.(`PostgreSQL 무결성 점검에 실패했습니다. 오류 코드: ${code}`, 'error');
      return null;
    } finally {
      setIntegrityLoading(false);
    }
  }, [triggerToast]);

  const repairAssetReferences = useCallback(async () => {
    setRepairLoading(true);
    try {
      const payload = await clerkStagingClient.repairAdminSystemDataAssetReferences();
      const result = payload?.systemDataRepair;
      if (!result) throw new Error('system_data_repair_payload_missing');
      setIntegrityResult({ ...result.after, checkedAtText: formatCheckedAt(result.after?.checkedAt) });
      await refreshOverview({ silent: true });
      const repairedTotal = Number(result.repairedRequestCount || 0) + Number(result.repairedReservationCount || 0);
      triggerToast?.(
        repairedTotal > 0
          ? `자산 참조 ${repairedTotal}건을 PostgreSQL 자산관리번호 기준으로 복구했습니다.`
          : '자동 복구 가능한 자산 참조 불일치가 없습니다.',
        'success'
      );
      return result;
    } catch (error) {
      const code = error?.code || error?.message || 'system_data_repair_failed';
      triggerToast?.(`자산 참조 자동 복구에 실패했습니다. 오류 코드: ${code}`, 'error');
      return null;
    } finally {
      setRepairLoading(false);
    }
  }, [refreshOverview, triggerToast]);

  const reconcileAssetCatalogMetadata = useCallback(async () => {
    setCatalogMetadataReconcileLoading(true);
    try {
      const payload = await clerkStagingClient.reconcileAdminSystemDataAssetCatalogMetadata();
      const result = payload?.systemDataCatalogMetadataReconcile;
      if (!result) throw new Error('system_data_catalog_metadata_reconcile_payload_missing');
      setIntegrityResult({ ...result.after, checkedAtText: formatCheckedAt(result.after?.checkedAt) });
      await refreshOverview({ silent: true });
      triggerToast?.(
        `자산 카탈로그 메타데이터를 실제 PostgreSQL 기준(자산 ${result.metadata?.assetCount ?? 0} / 카테고리 ${result.metadata?.categoryCount ?? 0})으로 동기화했습니다.`,
        'success'
      );
      return result;
    } catch (error) {
      const code = error?.code || error?.message || 'system_data_catalog_metadata_reconcile_failed';
      triggerToast?.(`자산 카탈로그 메타데이터 동기화에 실패했습니다. 오류 코드: ${code}`, 'error');
      return null;
    } finally {
      setCatalogMetadataReconcileLoading(false);
    }
  }, [refreshOverview, triggerToast]);

  const downloadSnapshot = useCallback(async ({ includeOperations, includeMembers, includePersonalData, forReset = false } = {}) => {
    setBackupLoading(true);
    try {
      const payload = await clerkStagingClient.exportAdminSystemData({
        includeOperations,
        includeMembers,
        includePersonalData,
      });
      const snapshot = payload?.systemDataExport;
      if (!snapshot) throw new Error('system_data_export_payload_missing');
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      anchor.href = url;
      anchor.download = `${forReset ? 'rental-system-postgresql-pre-reset-backup' : 'rental-system-postgresql-backup'}-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      if (forReset) setResetBackupReady(true);
      triggerToast?.(forReset ? '초기화 전 PostgreSQL 전체 백업 파일을 생성했습니다.' : 'PostgreSQL 운영 데이터 백업 파일을 생성했습니다.', 'success');
      return snapshot;
    } catch (error) {
      const code = error?.code || error?.message || 'system_data_export_failed';
      if (forReset) setResetBackupReady(false);
      triggerToast?.(`PostgreSQL 백업 생성에 실패했습니다. 오류 코드: ${code}`, 'error');
      return null;
    } finally {
      setBackupLoading(false);
    }
  }, [triggerToast]);

  const downloadBackup = useCallback(() => downloadSnapshot({
    includeOperations: backupIncludeOperations,
    includeMembers: backupIncludeMembers,
    includePersonalData: backupIncludeMembers && backupIncludePersonalData,
  }), [backupIncludeMembers, backupIncludeOperations, backupIncludePersonalData, downloadSnapshot]);

  const downloadResetBackup = useCallback(() => downloadSnapshot({
    includeOperations: true,
    includeMembers: true,
    includePersonalData: true,
    forReset: true,
  }), [downloadSnapshot]);

  const setSelectedResetScopes = useCallback((nextValue) => {
    setSelectedResetScopesState((current) => {
      const raw = typeof nextValue === 'function' ? nextValue(current) : nextValue;
      const next = [...new Set((Array.isArray(raw) ? raw : []).filter((scope) => RESET_SCOPE_META[scope]))];
      return next;
    });
    setResetCounts(null);
    setResetBackupReady(false);
    setResetProgress(RESET_PROGRESS_IDLE);
  }, []);

  const scanResetTargets = useCallback(async () => {
    if (selectedResetScopes.length === 0) {
      triggerToast?.('초기화 범위를 하나 이상 선택해 주세요.', 'error');
      return null;
    }
    setResetScanLoading(true);
    setResetProgress({ step: '초기화 대상 확인', completed: 0, total: 1 });
    try {
      const payload = await clerkStagingClient.scanAdminSystemDataReset(selectedResetScopes);
      const result = payload?.systemDataResetScan;
      if (!result || result.authority !== 'postgresql') throw new Error('system_data_reset_scan_payload_missing');
      setResetCounts(result);
      setResetProgress({ step: '초기화 대상 확인 완료', completed: 1, total: 1 });
      triggerToast?.('PostgreSQL 초기화 대상을 확인했습니다.', 'success');
      return result;
    } catch (error) {
      const code = error?.code || error?.message || 'system_data_reset_scan_failed';
      setResetCounts(null);
      setResetProgress(RESET_PROGRESS_IDLE);
      triggerToast?.(`초기화 대상 확인에 실패했습니다. 오류 코드: ${code}`, 'error');
      return null;
    } finally {
      setResetScanLoading(false);
    }
  }, [selectedResetScopes, triggerToast]);

  const executeReset = useCallback(async () => {
    if (!resetCounts) {
      triggerToast?.('초기화 대상 확인을 먼저 실행해 주세요.', 'error');
      return null;
    }
    if (!resetBackupReady) {
      triggerToast?.('초기화 전 PostgreSQL 전체 백업을 먼저 생성해 주세요.', 'error');
      return null;
    }
    if (resetConfirmText !== RESET_CONFIRM_TEXT) {
      triggerToast?.('초기화 확인 문구가 일치하지 않습니다.', 'error');
      return null;
    }
    setResetRunning(true);
    setResetProgress({ step: 'PostgreSQL 초기화 실행', completed: 0, total: 1 });
    try {
      const payload = await clerkStagingClient.resetAdminSystemData({
        scopes: selectedResetScopes,
        confirmText: resetConfirmText,
        backupConfirmed: true,
      });
      const result = payload?.systemDataReset;
      if (!result || result.authority !== 'postgresql') throw new Error('system_data_reset_payload_missing');
      setLatestResetJob({ id: `postgresql-reset-${Date.now()}`, status: 'completed', currentStep: '완료', ...result });
      setResetCounts(result.after || null);
      setResetProgress({ step: 'PostgreSQL 초기화 완료', completed: 1, total: 1 });
      setResetConfirmText('');
      setResetBackupReady(false);
      await refreshOverview({ silent: true });
      triggerToast?.('선택한 PostgreSQL 데이터를 초기화했습니다.', 'success');
      return result;
    } catch (error) {
      const code = error?.code || error?.message || 'system_data_reset_failed';
      setLatestResetJob({ id: `postgresql-reset-${Date.now()}`, status: 'failed', currentStep: '실행', errorMessage: code });
      setResetProgress(RESET_PROGRESS_IDLE);
      triggerToast?.(`PostgreSQL 데이터 초기화에 실패했습니다. 오류 코드: ${code}`, 'error');
      return null;
    } finally {
      setResetRunning(false);
    }
  }, [refreshOverview, resetBackupReady, resetConfirmText, resetCounts, selectedResetScopes, triggerToast]);

  return {
    overview,
    overviewLoading,
    overviewError,
    refreshOverview,
    repairAssetReferences,
    repairLoading,
    reconcileAssetCatalogMetadata,
    catalogMetadataReconcileLoading,
    backupIncludeMembers,
    backupIncludeOperations,
    backupIncludePersonalData,
    backupLoading,
    downloadBackup,
    integrityLoading,
    integrityResult,
    runIntegrityCheck,
    setBackupIncludeMembers,
    setBackupIncludeOperations,
    setBackupIncludePersonalData,
    analyzeRestore: retiredOperation,
    clearRestoreState: () => {},
    downloadResetBackup,
    executeReset,
    executeRestore: retiredOperation,
    forceProjectConfirm: '',
    forceProjectMismatch: false,
    handleRestoreFile: retiredOperation,
    latestResetJob,
    latestRestoreJob: null,
    resetBackupReady,
    resetConfirmText,
    resetCounts,
    resetPassword: '',
    resetProgress,
    resetRunning,
    resetScanLoading,
    restoreAnalysis: null,
    restoreAnalyzeLoading: false,
    restoreConfirmText: '',
    restoreFileHash: '',
    restoreFileName: '',
    restoreMode: RESTORE_MODE.REPLACE,
    restorePassword: '',
    restorePayload: null,
    restoreProgress: null,
    restoreResult: null,
    restoreRunning: false,
    restoreValidation: null,
    scanResetTargets,
    selectedResetScopes,
    selectedRestoreScopes: [],
    setForceProjectConfirm: () => {},
    setForceProjectMismatch: () => {},
    setResetBackupReady,
    setResetConfirmText,
    setResetCounts,
    setResetPassword: () => {},
    setRestoreAnalysis: () => {},
    setRestoreConfirmText: () => {},
    setRestoreMode: () => {},
    setRestorePassword: () => {},
    setRestoreResult: () => {},
    setSelectedResetScopes,
    setSelectedRestoreScopes: () => {},
  };
}
