import { useEffect, useRef } from 'react';

import { firebaseAuth } from '../../firebase.js';
import { readAssetDomainCutoverConfig } from './assetDomainCutover.js';
import {
  ensurePublicAssetCatalogWriteThrough,
  getPublicAssetCatalogWriteErrorMessage,
} from '../../services/publicAssetCatalogWriteThroughLoader.js';

const DEFAULT_MIGRATION_ERROR_MESSAGE =
  '공개 자산 카탈로그 동기화 방식 전환에 실패했습니다. 데이터 관리에서 무결성 점검을 실행해 주세요.';

export default function usePublicAssetCatalogCompatibilityController({
  authenticatedAdminId,
  currentAuthAdminAccountId,
  isAdminAuthenticated,
  triggerToast,
}) {
  const migrationAdminUidRef = useRef('');
  const triggerToastRef = useRef(triggerToast);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    const assetCutoverConfig = readAssetDomainCutoverConfig();
    if (assetCutoverConfig.readRequested || assetCutoverConfig.writeRequested) {
      migrationAdminUidRef.current = '';
      return undefined;
    }

    if (!isAdminAuthenticated) {
      migrationAdminUidRef.current = '';
      return undefined;
    }

    const adminUid =
      firebaseAuth.currentUser?.uid ||
      authenticatedAdminId ||
      currentAuthAdminAccountId ||
      '';

    if (!adminUid || migrationAdminUidRef.current === adminUid) {
      return undefined;
    }

    migrationAdminUidRef.current = adminUid;
    let cancelled = false;

    const ensureWriteThroughCatalog = async () => {
      try {
        const result = await ensurePublicAssetCatalogWriteThrough({
          updatedByUid: adminUid,
        });

        if (!cancelled && result.rebuilt) {
          console.info(
            'Public asset catalog migrated to write-through synchronization:',
            result.assetCount
          );
        }
      } catch (error) {
        if (cancelled) return;

        migrationAdminUidRef.current = '';
        console.error(
          'Public asset catalog write-through migration error:',
          error
        );

        const catalogErrorMessage =
          await getPublicAssetCatalogWriteErrorMessage(error);

        triggerToastRef.current?.(
          catalogErrorMessage || DEFAULT_MIGRATION_ERROR_MESSAGE,
          'error'
        );
      }
    };

    void ensureWriteThroughCatalog();

    return () => {
      cancelled = true;
    };
  }, [
    authenticatedAdminId,
    currentAuthAdminAccountId,
    isAdminAuthenticated,
  ]);
}
