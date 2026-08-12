import { useState } from 'react';

// Historical schema marker retained because readiness selectors still compare against it.
// The migration action itself is retired: Phase 34 uses PostgreSQL authoritative storage only.
export const SPLIT_STORAGE_VERSION = 2;

export const useAdminSplitStorageMigrationState = () => {
  const [splitStorageFinalizeLoading, setSplitStorageFinalizeLoading] = useState(false);
  return { setSplitStorageFinalizeLoading, splitStorageFinalizeLoading };
};

export default function useAdminSplitStorageMigrationController({
  isAdminAuthenticated,
  setSplitStorageFinalizeLoading,
  splitStorageFinalizeLoading,
  triggerToast,
}) {
  const finalizeSplitStorageMigration = async () => {
    if (splitStorageFinalizeLoading) return;
    if (!isAdminAuthenticated) {
      triggerToast('저장소 상태 확인은 인증된 관리자만 실행할 수 있습니다.', 'error');
      return;
    }
    setSplitStorageFinalizeLoading(true);
    try {
      triggerToast('Phase 34에서는 PostgreSQL이 유일한 운영 저장소입니다. 기존 분리 저장소 전환 작업은 종료되었습니다.', 'success');
    } finally {
      setSplitStorageFinalizeLoading(false);
    }
  };

  return { finalizeSplitStorageMigration };
}
