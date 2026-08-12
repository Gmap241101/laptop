import { useState } from 'react';

import {
  SYSTEM_RESET_SCOPE,
} from '../../utils/systemSettings.js';
import {
  RESTORE_CONFIRM_TEXT,
  RESTORE_MODE,
  RESTORE_SCOPE_META,
} from '../../utils/systemRestore.js';

export const RESET_SCOPE_META = {
  [SYSTEM_RESET_SCOPE.ASSETS]: { label: '자산', description: 'PostgreSQL 자산 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.MEMBERS]: { label: '일반회원 정보', description: 'PostgreSQL 회원 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.RENTALS]: { label: '신청·대여내역', description: 'PostgreSQL 대여 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.ORGANIZATION]: { label: '부서·사용자 명부', description: 'PostgreSQL 명부 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.CONTENT]: { label: '게시물·사이트 콘텐츠', description: 'PostgreSQL 콘텐츠 데이터를 관리합니다.', collections: [] },
  [SYSTEM_RESET_SCOPE.SETTINGS]: { label: '사이트·운영 설정', description: 'PostgreSQL 설정 데이터를 관리합니다.', collections: [] },
};

export const TEST_DATA_PRESET = [
  SYSTEM_RESET_SCOPE.ASSETS,
  SYSTEM_RESET_SCOPE.MEMBERS,
  SYSTEM_RESET_SCOPE.RENTALS,
];
export const FULL_RESET_PRESET = Object.values(SYSTEM_RESET_SCOPE);
export const RESET_CONFIRM_TEXT = '테스트 데이터 전체 초기화';
export { RESTORE_CONFIRM_TEXT, RESTORE_MODE, RESTORE_SCOPE_META };

export const cloneForAudit = (value) => JSON.parse(JSON.stringify(value || {}));
export const getAdminDisplayName = (account) =>
  account?.userName || account?.adminLoginId || account?.authEmail || account?.id || '관리자';
export const getAdminRole = (account) => account?.adminRole || 'owner';

const MAINTENANCE_MESSAGE = '브라우저 기반 백업·복원·초기화 기능은 Phase 34에서 제거되었습니다. 데이터 유지보수는 PostgreSQL 전용 운영 절차로 수행해 주세요.';

export default function useAdminDataMaintenanceController({ triggerToast }) {
  const [backupIncludeOperations, setBackupIncludeOperations] = useState(true);
  const [backupIncludeMembers, setBackupIncludeMembers] = useState(false);
  const [backupIncludePersonalData, setBackupIncludePersonalData] = useState(false);
  const [selectedResetScopes, setSelectedResetScopes] = useState(TEST_DATA_PRESET);
  const [selectedRestoreScopes, setSelectedRestoreScopes] = useState([]);
  const [restoreMode, setRestoreMode] = useState(RESTORE_MODE.REPLACE);
  const [forceProjectMismatch, setForceProjectMismatch] = useState(false);
  const [forceProjectConfirm, setForceProjectConfirm] = useState('');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetBackupReady, setResetBackupReady] = useState(false);
  const [resetCounts, setResetCounts] = useState(null);
  const [restoreAnalysis, setRestoreAnalysis] = useState(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreResult, setRestoreResult] = useState(null);

  const inform = () => {
    triggerToast?.(MAINTENANCE_MESSAGE, 'info');
    return Promise.resolve(Object.freeze({ retired: true, source: 'postgresql-operations' }));
  };

  const clearRestoreState = () => {
    setSelectedRestoreScopes([]);
    setRestoreAnalysis(null);
    setRestoreConfirmText('');
    setRestorePassword('');
    setRestoreResult(null);
    setForceProjectMismatch(false);
    setForceProjectConfirm('');
  };

  return {
    analyzeRestore: inform,
    backupIncludeMembers,
    backupIncludeOperations,
    backupIncludePersonalData,
    backupLoading: false,
    clearRestoreState,
    downloadBackup: inform,
    downloadResetBackup: inform,
    executeReset: inform,
    executeRestore: inform,
    forceProjectConfirm,
    forceProjectMismatch,
    handleRestoreFile: inform,
    integrityLoading: false,
    integrityResult: null,
    latestResetJob: null,
    latestRestoreJob: null,
    resetBackupReady,
    resetConfirmText,
    resetCounts,
    resetPassword,
    resetProgress: null,
    resetRunning: false,
    resetScanLoading: false,
    restoreAnalysis,
    restoreAnalyzeLoading: false,
    restoreConfirmText,
    restoreFileHash: '',
    restoreFileName: '',
    restoreMode,
    restorePassword,
    restorePayload: null,
    restoreProgress: null,
    restoreResult,
    restoreRunning: false,
    restoreValidation: null,
    runIntegrityCheck: inform,
    scanResetTargets: inform,
    selectedResetScopes,
    selectedRestoreScopes,
    setBackupIncludeMembers,
    setBackupIncludeOperations,
    setBackupIncludePersonalData,
    setForceProjectConfirm,
    setForceProjectMismatch,
    setResetBackupReady,
    setResetConfirmText,
    setResetCounts,
    setResetPassword,
    setRestoreAnalysis,
    setRestoreConfirmText,
    setRestoreMode,
    setRestorePassword,
    setRestoreResult,
    setSelectedResetScopes,
    setSelectedRestoreScopes,
  };
}
