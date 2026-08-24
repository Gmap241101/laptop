import { useEffect, useMemo, useState } from 'react';
import { getDocs, serverTimestamp, writeBatch } from '../../platform/retiredLegacyDataCompat.js';

import {
  PUBLIC_ASSET_CATALOG_DOC_REF,
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  db,
  firebaseAuth,
} from '../../platform/appDataRefs.js';
import { normalizeAssetReservations } from '../../services/publicAssetCatalog.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { publishAssetDomainCutoverObservation, readAssetDomainCutoverConfig } from './assetDomainCutover.js';
import {
  createPublicAssetCatalogPayload,
  getPublicAssetCatalogWriteErrorMessage,
} from '../../services/publicAssetCatalogWriteThroughLoader.js';

const normalizeCategories = (categories = []) =>
  categories
    .map((category) => String(category || '').trim())
    .filter(Boolean);

export const useAdminAssetCategoryState = ({
  adminTab,
  dataAssetCategories,
}) => {
  const [newAssetCategory, setNewAssetCategory] = useState('');
  const [tempAssetCategories, setTempAssetCategories] = useState(
    dataAssetCategories || []
  );
  const [tempAssetCategoryRenameMap, setTempAssetCategoryRenameMap] = useState(
    {}
  );
  const [editingAssetCategoryIndex, setEditingAssetCategoryIndex] =
    useState(null);
  const [editingAssetCategoryName, setEditingAssetCategoryName] = useState('');
  const [draggingAssetCategoryIndex, setDraggingAssetCategoryIndex] =
    useState(null);

  const dataAssetCategoriesKey = useMemo(
    () => JSON.stringify(normalizeCategories(dataAssetCategories || [])),
    [dataAssetCategories]
  );

  useEffect(() => {
    if (adminTab === 'categories') {
      const persistedCategories = JSON.parse(dataAssetCategoriesKey);
      setTempAssetCategories(persistedCategories);
      setTempAssetCategoryRenameMap({});
      setEditingAssetCategoryIndex(null);
      setEditingAssetCategoryName('');
      setDraggingAssetCategoryIndex(null);
      setNewAssetCategory('');
    }
  }, [adminTab, dataAssetCategoriesKey]);

  const assetCategorySettingsDirty = useMemo(
    () =>
      JSON.stringify(normalizeCategories(tempAssetCategories)) !==
        JSON.stringify(normalizeCategories(dataAssetCategories || [])) ||
      Object.keys(tempAssetCategoryRenameMap || {}).length > 0,
    [dataAssetCategories, tempAssetCategories, tempAssetCategoryRenameMap]
  );

  return {
    assetCategorySettingsDirty,
    draggingAssetCategoryIndex,
    editingAssetCategoryIndex,
    editingAssetCategoryName,
    newAssetCategory,
    setDraggingAssetCategoryIndex,
    setEditingAssetCategoryIndex,
    setEditingAssetCategoryName,
    setNewAssetCategory,
    setTempAssetCategories,
    setTempAssetCategoryRenameMap,
    tempAssetCategories,
    tempAssetCategoryRenameMap,
  };
};

export default function useAdminAssetCategoryController({
  authenticatedAdminId,
  currentAuthAdminAccount,
  dataAssetCategories,
  dataLaptops,
  assetCategoryUsageCounts = {},
  editingAssetCategoryName,
  isSplitStorageReady,
  newAssetCategory,
  setAdminSelectedAssetCategory,
  setData,
  setDraggingAssetCategoryIndex,
  setEditingAssetCategoryIndex,
  setEditingAssetCategoryName,
  setNewAssetCategory,
  setSelectedAssetCategory,
  setTempAssetCategories,
  setTempAssetCategoryRenameMap,
  tempAssetCategories,
  tempAssetCategoryRenameMap,
  triggerToast,
}) {
  const assetCutoverConfig = readAssetDomainCutoverConfig();

  const getOriginalAssetCategoryName = (category) => {
    const matchedEntry = Object.entries(tempAssetCategoryRenameMap).find(
      ([, renamedName]) => renamedName === category
    );

    return matchedEntry ? matchedEntry[0] : category;
  };

  const addTempAssetCategory = () => {
    const categoryName = newAssetCategory.trim();

    if (!categoryName) {
      triggerToast('자산 카테고리 명칭을 입력해 주세요.', 'error');
      return;
    }

    if (
      tempAssetCategories.some(
        (category) => String(category || '').trim() === categoryName
      )
    ) {
      triggerToast('이미 등록된 자산 카테고리입니다.', 'error');
      return;
    }

    setTempAssetCategories((prev) => [...prev, categoryName]);
    setNewAssetCategory('');
    triggerToast(
      `[${categoryName}] 자산 카테고리가 임시 추가되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  };

  const startEditTempAssetCategory = (category, index) => {
    setEditingAssetCategoryIndex(index);
    setEditingAssetCategoryName(category);
  };

  const applyEditTempAssetCategory = (category, index) => {
    const nextCategoryName = editingAssetCategoryName.trim();

    if (!nextCategoryName) {
      triggerToast('자산 카테고리 명칭을 입력해 주세요.', 'error');
      return;
    }

    if (
      tempAssetCategories.some(
        (item, itemIndex) =>
          itemIndex !== index &&
          String(item || '').trim() === nextCategoryName
      )
    ) {
      triggerToast('이미 등록된 자산 카테고리입니다.', 'error');
      return;
    }

    const originalCategoryName = getOriginalAssetCategoryName(category);

    setTempAssetCategories((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? nextCategoryName : item
      )
    );

    setTempAssetCategoryRenameMap((prev) => {
      const nextMap = { ...prev };

      if (
        (dataAssetCategories || []).includes(originalCategoryName) &&
        originalCategoryName !== nextCategoryName
      ) {
        nextMap[originalCategoryName] = nextCategoryName;
      } else {
        delete nextMap[originalCategoryName];
      }

      return nextMap;
    });

    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    triggerToast(
      `[${category}] 카테고리명이 임시 수정되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  };

  const deleteTempAssetCategory = (category, index) => {
    const originalCategoryName = getOriginalAssetCategoryName(category);
    const serverUsageCount = Math.max(
      Number(assetCategoryUsageCounts?.[originalCategoryName] || 0),
      Number(assetCategoryUsageCounts?.[category] || 0)
    );
    const isCategoryInUse = serverUsageCount > 0 || dataLaptops.some((asset) => {
      const assetCategory = asset.category || '노트북';
      return (
        assetCategory === originalCategoryName || assetCategory === category
      );
    });

    if (isCategoryInUse) {
      triggerToast(
        '해당 카테고리를 사용하는 자산이 있어 삭제할 수 없습니다.',
        'error'
      );
      return;
    }

    setTempAssetCategories((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    );
    setTempAssetCategoryRenameMap((prev) => {
      const nextMap = { ...prev };
      delete nextMap[originalCategoryName];
      return nextMap;
    });
    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    triggerToast(
      `[${category}] 자산 카테고리가 임시 삭제되었습니다. 변경사항 저장을 눌러야 최종 반영됩니다.`,
      'success'
    );
  };

  const moveTempAssetCategory = (fromIndex, toIndex) => {
    if (fromIndex === null || fromIndex === toIndex) return;

    setTempAssetCategories((prev) => {
      const next = [...prev];
      const [movedCategory] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedCategory);
      return next;
    });

    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
  };

  const cancelTempAssetCategoryChanges = ({ silent = false } = {}) => {
    setTempAssetCategories(dataAssetCategories || []);
    setTempAssetCategoryRenameMap({});
    setEditingAssetCategoryIndex(null);
    setEditingAssetCategoryName('');
    setDraggingAssetCategoryIndex(null);
    setNewAssetCategory('');

    if (!silent) {
      triggerToast(
        '자산 카테고리 변경사항이 취소되고 이전 상태로 복원되었습니다.',
        'success'
      );
    }
  };

  const saveTempAssetCategoryChanges = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 자산 카테고리를 저장할 수 없습니다.',
        'error'
      );
      return false;
    }

    const nextAssetCategories = normalizeCategories(tempAssetCategories);
    const duplicatedCategory = nextAssetCategories.find(
      (category, index) => nextAssetCategories.indexOf(category) !== index
    );

    if (duplicatedCategory) {
      triggerToast(
        `[${duplicatedCategory}] 카테고리명이 중복되어 저장할 수 없습니다.`,
        'error'
      );
      return false;
    }

    if (assetCutoverConfig.writeRequested) {
      try {
        const payload = await clerkStagingClient.saveAdminAssetCategories(
          '',
          nextAssetCategories,
          tempAssetCategoryRenameMap
        );
        const catalog = payload?.adminAssetMutation?.catalog;
        setData((prev) => ({
          ...prev,
          assetCategories: catalog?.categories || nextAssetCategories,
          laptops: catalog?.assets || prev.laptops,
          requests: catalog?.availability || prev.requests,
        }));
        setSelectedAssetCategory('전체');
        setAdminSelectedAssetCategory('전체');
        setTempAssetCategories(catalog?.categories || nextAssetCategories);
        setTempAssetCategoryRenameMap({});
        setEditingAssetCategoryIndex(null);
        setEditingAssetCategoryName('');
        setDraggingAssetCategoryIndex(null);
        publishAssetDomainCutoverObservation({
          readRequested: assetCutoverConfig.readRequested, writeRequested: true,
          activeSource: 'postgresql', writeSource: 'postgresql-authoritative', firestoreMirror: payload?.adminAssetMutation?.firestoreMirror || 'synced',
          assetWatcherDisabled: assetCutoverConfig.readRequested, availabilityWatcherDisabled: assetCutoverConfig.readRequested,
          assetCount: catalog?.assets?.length || 0, categoryCount: catalog?.categories?.length || 0,
          availabilityCount: catalog?.availability?.length || 0, firestoreFallbackReads: 0, error: '',
        });
        triggerToast('자산 카테고리 변경사항이 성공적으로 저장 및 반영되었습니다.', 'success');
        return true;
      } catch (error) {
        console.error('PostgreSQL asset category save error:', error);
        publishAssetDomainCutoverObservation({
          readRequested: assetCutoverConfig.readRequested, writeRequested: true,
          activeSource: 'postgresql', writeSource: 'postgresql-authoritative', firestoreMirror: 'failed',
          assetWatcherDisabled: assetCutoverConfig.readRequested, availabilityWatcherDisabled: assetCutoverConfig.readRequested,
          firestoreFallbackReads: 0, error: error?.code || error?.message || 'asset-category-write-failed',
        });
        if (error?.code === 'active-rental-category-rename') {
          triggerToast(`진행 중 예약이 있는 자산${error?.assetNo ? ` [${error.assetNo}]` : ''}이 포함되어 카테고리명을 변경할 수 없습니다.`, 'error');
          return false;
        }
        if (error?.code === 'asset-category-still-in-use') {
          triggerToast(`카테고리${error?.category ? ` [${error.category}]` : ''}를 사용하는 최신 자산이 있어 삭제할 수 없습니다.`, 'error');
          return false;
        }
        triggerToast(`자산 카테고리 저장에 실패했습니다. 기존 카테고리와 자산 정보는 유지됩니다. 오류 코드: ${error?.code || error?.name || 'asset_category_save_failed'}`, 'error');
        return false;
      }
    }

    try {
      const assetsSnapshot = await getDocs(RENTAL_ASSETS_COLLECTION_REF);
      const assetOperations = [];
      const nextCatalogAssets = [];

      assetsSnapshot.docs.forEach((assetDocument) => {
        const assetData = {
          ...assetDocument.data(),
          id: assetDocument.id,
        };

        const nextCategory =
          tempAssetCategoryRenameMap[assetData.category] || assetData.category;

        if (
          nextCategory !== assetData.category &&
          normalizeAssetReservations(assetData.reservations || []).length > 0
        ) {
          const activeRentalError = new Error(
            'active-rental-category-rename'
          );
          activeRentalError.assetNo = assetData.assetNo;
          throw activeRentalError;
        }

        if (!nextAssetCategories.includes(nextCategory)) {
          const categoryInUseError = new Error('asset-category-still-in-use');
          categoryInUseError.category = assetData.category;
          throw categoryInUseError;
        }

        const nextAsset = {
          ...assetData,
          category: nextCategory,
        };

        nextCatalogAssets.push(nextAsset);

        if (nextCategory !== assetData.category) {
          assetOperations.push({
            type: 'set',
            ref: assetDocument.ref,
            data: {
              category: nextCategory,
              updatedAt: serverTimestamp(),
            },
            options: {
              merge: true,
            },
          });
        }
      });

      const catalogPayload = await createPublicAssetCatalogPayload(
        nextCatalogAssets,
        {
          updatedByUid:
            firebaseAuth.currentUser?.uid ||
            authenticatedAdminId ||
            currentAuthAdminAccount?.id ||
            '',
        }
      );

      const categorySaveBatch = writeBatch(db);

      assetOperations.forEach((operation) => {
        categorySaveBatch.set(
          operation.ref,
          operation.data,
          operation.options
        );
      });

      categorySaveBatch.set(
        PUBLIC_CONFIG_DOC_REF,
        {
          assetCategories: nextAssetCategories,
          updatedAt: serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      categorySaveBatch.set(PUBLIC_ASSET_CATALOG_DOC_REF, catalogPayload, {
        merge: false,
      });

      await categorySaveBatch.commit();

      setData((prev) => ({
        ...prev,
        assetCategories: nextAssetCategories,
        laptops: (prev.laptops || []).map((asset) => ({
          ...asset,
          category:
            tempAssetCategoryRenameMap[asset.category] || asset.category,
        })),
      }));

      setSelectedAssetCategory('전체');
      setAdminSelectedAssetCategory('전체');
      setTempAssetCategories(nextAssetCategories);
      setTempAssetCategoryRenameMap({});
      setEditingAssetCategoryIndex(null);
      setEditingAssetCategoryName('');
      setDraggingAssetCategoryIndex(null);

      triggerToast(
        '자산 카테고리 변경사항이 성공적으로 저장 및 반영되었습니다.',
        'success'
      );

      return true;
    } catch (error) {
      console.error('Asset category save error:', error);

      if (error?.message === 'active-rental-category-rename') {
        triggerToast(
          `진행 중 예약이 있는 자산 [${error.assetNo}]이(가) 포함되어 카테고리명을 변경할 수 없습니다. 해당 신청을 먼저 완료해 주세요. 오류 코드: ${error?.code || error?.message || 'active-rental-category-rename'}`,
          'error'
        );
        return false;
      }

      if (error?.message === 'asset-category-still-in-use') {
        triggerToast(
          `카테고리 [${error.category}]를 사용하는 최신 자산이 있어 삭제할 수 없습니다. 오류 코드: ${error?.code || error?.message || 'asset-category-still-in-use'}`,
          'error'
        );
        return false;
      }

      const catalogErrorMessage =
        await getPublicAssetCatalogWriteErrorMessage(error);

      if (catalogErrorMessage) {
        triggerToast(`${catalogErrorMessage} 오류 코드: ${error?.code || error?.name || error?.message || 'public_asset_catalog_write_failed'}`, 'error');
        return false;
      }

      triggerToast(
        `자산 카테고리 저장에 실패했습니다. 기존 카테고리와 자산 정보는 유지됩니다. 오류 코드: ${error?.code || error?.name || 'asset_category_save_failed'}`,
        'error'
      );

      return false;
    }
  };

  return {
    addTempAssetCategory,
    applyEditTempAssetCategory,
    cancelTempAssetCategoryChanges,
    deleteTempAssetCategory,
    moveTempAssetCategory,
    saveTempAssetCategoryChanges,
    startEditTempAssetCategory,
  };
}
