import { useState } from 'react';
import { doc, runTransaction, serverTimestamp } from '../../platform/retiredLegacyDataCompat.js';

import {
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_ASSET_NUMBERS_COLLECTION_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  db,
  firebaseAuth,
} from '../../platform/appDataRefs.js';
import { STATUS } from '../../constants/appConstants.js';
import {
  findSameAssetBlockingRequest,
  getLaptopRepresentativeRequest,
} from '../../domain/rentalPolicy.js';
import {
  normalizeAssetReservations,
} from '../../services/publicAssetCatalog.js';
import {
  getPublicAssetCatalogWriteErrorMessage,
  writePublicAssetCatalogMutationInTransaction,
} from '../../services/publicAssetCatalogWriteThroughLoader.js';
import { getDisplayRentalStatus, today } from '../../utils/appUtils.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { publishAssetDomainCutoverObservation, readAssetDomainCutoverConfig } from './assetDomainCutover.js';

export const normalizeAssetNumber = (assetNo) =>
  String(assetNo || '').trim().toLowerCase();

export const getAssetNumberRegistryId = (assetNo) =>
  encodeURIComponent(normalizeAssetNumber(assetNo));

export const useAdminAssetCrudState = () => {
  const [editLaptop, setEditLaptop] = useState(null);
  const [newLaptop, setNewLaptop] = useState(null);

  return {
    editLaptop,
    newLaptop,
    setEditLaptop,
    setNewLaptop,
  };
};

export default function useAdminAssetCrudController({
  authenticatedAdminId,
  currentAuthAdminAccount,
  data,
  editLaptop,
  isSplitStorageReady,
  newLaptop,
  selectedLaptopId,
  setData,
  setEditLaptop,
  setNewLaptop,
  setSelectedLaptopId,
  setShowUploadPanel,
  splitRentalAssets,
  triggerConfirm,
  triggerToast,
}) {
  const assetCutoverConfig = readAssetDomainCutoverConfig();

  const applyPostgresCatalog = (catalog, firestoreMirror = 'synced') => {
    if (!catalog) return;
    setData((prev) => ({
      ...prev,
      laptops: Array.isArray(catalog.assets) ? catalog.assets : prev.laptops,
      assetCategories: Array.isArray(catalog.categories) && catalog.categories.length ? catalog.categories : prev.assetCategories,
      requests: Array.isArray(catalog.availability) ? catalog.availability : prev.requests,
    }));
    publishAssetDomainCutoverObservation({
      readRequested: assetCutoverConfig.readRequested, writeRequested: assetCutoverConfig.writeRequested,
      activeSource: 'postgresql', writeSource: 'postgresql-authoritative', firestoreMirror,
      assetWatcherDisabled: assetCutoverConfig.readRequested, availabilityWatcherDisabled: assetCutoverConfig.readRequested,
      assetCount: catalog.assets?.length || 0, categoryCount: catalog.categories?.length || 0, availabilityCount: catalog.availability?.length || 0,
      firestoreFallbackReads: 0, error: '',
    });
  };

  const showPostgresAssetError = (error, fallbackMessage) => {
    const code = error?.code || '';
    publishAssetDomainCutoverObservation({
      readRequested: assetCutoverConfig.readRequested,
      writeRequested: assetCutoverConfig.writeRequested,
      activeSource: 'postgresql',
      writeSource: 'postgresql-authoritative',
      firestoreMirror: 'failed',
      assetWatcherDisabled: assetCutoverConfig.readRequested,
      availabilityWatcherDisabled: assetCutoverConfig.readRequested,
      firestoreFallbackReads: 0,
      error: code || error?.message || 'asset-write-failed',
    });
    if (code === 'duplicate-asset-number') { triggerToast('동일한 자산관리번호가 이미 등록되어 있습니다.', 'error'); return; }
    if (code === 'asset-category-not-found') { triggerToast('선택한 자산 카테고리가 최신 카테고리 목록에 없습니다.', 'error'); return; }
    if (code === 'active-rental-identity-change') { triggerToast('현재 진행 중인 신청이 있어 자산 카테고리 또는 자산관리번호를 변경할 수 없습니다.', 'error'); return; }
    if (code === 'active-rental-exists') { triggerToast('현재 진행 중인 신청이 있어 자산을 삭제할 수 없습니다.', 'error'); return; }
    if (code === 'laptop-not-found') { triggerToast('자산이 이미 삭제되었거나 최신 자산 목록에서 찾을 수 없습니다.', 'error'); return; }
    if (code === 'public-catalog-asset-limit-exceeded') { triggerToast('공개 자산 카탈로그의 최대 등록 수를 초과했습니다.', 'error'); return; }
    triggerToast(fallbackMessage, 'error');
  };

  const handleAddLaptopClick = () => {
    setShowUploadPanel(false);
    setEditLaptop(null);

    if (newLaptop) {
      setNewLaptop(null);
      return;
    }

    setNewLaptop({
      category: data.assetCategories?.[0] || '노트북',
      assetNo: '',
      serialNo: '',
      model: '',
      manufactureDate: today(),
      photo: `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`,
      note: '',
      status: STATUS.AVAILABLE,
      currentRequestId: null,
    });
  };

  const createLaptop = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 신규 자산을 등록할 수 없습니다.',
        'error'
      );
      return;
    }

    if (!newLaptop) {
      triggerToast(
        '신규 등록할 자산 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const newAssetNo = String(
      newLaptop.assetNo || ''
    ).trim();

    const newCategory = String(
      newLaptop.category || ''
    ).trim();

    if (!newAssetNo) {
      triggerToast(
        '자산 관리 번호를 정확히 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!newCategory) {
      triggerToast(
        '자산 카테고리를 선택해 주세요.',
        'error'
      );
      return;
    }

    if (assetCutoverConfig.writeRequested) {
      try {
        const payload = await clerkStagingClient.createAdminAsset(
          '',
          {
            ...newLaptop,
            assetNo: newAssetNo,
            category: newCategory,
            baseStatus: newLaptop.status === STATUS.UNAVAILABLE ? STATUS.UNAVAILABLE : STATUS.AVAILABLE,
          }
        );
        const mutation = payload?.adminAssetMutation;
        applyPostgresCatalog(mutation?.catalog, mutation?.firestoreMirror || 'synced');
        setNewLaptop(null);
        triggerToast(`자산 ${newAssetNo}이(가) 신규 등록되었습니다.`, 'success');
      } catch (error) {
        console.error('PostgreSQL asset create error:', error);
        showPostgresAssetError(error, '신규 자산 등록에 실패했습니다. 입력 내용은 유지됩니다.');
      }
      return;
    }

    const generatedAssetRef = doc(
      RENTAL_ASSETS_COLLECTION_REF
    );

    const newId =
      `NB-${generatedAssetRef.id}`;

    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      newId
    );

    const registryId =
      getAssetNumberRegistryId(
        newAssetNo
      );

    const registryDocRef = doc(
      RENTAL_ASSET_NUMBERS_COLLECTION_REF,
      registryId
    );

    const newLaptopDraft = {
      ...newLaptop,
      id: newId,
      assetNo: newAssetNo,
      assetNoNormalized:
        normalizeAssetNumber(
          newAssetNo
        ),
      category: newCategory,
      status:
        newLaptop.status ===
        STATUS.UNAVAILABLE
          ? STATUS.UNAVAILABLE
          : STATUS.AVAILABLE,
      currentRequestId: null,
      reservations: [],
    };

    let committedAsset = null;

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const [
            configSnapshot,
            registrySnapshot,
          ] = await Promise.all([
            transaction.get(
              PUBLIC_CONFIG_DOC_REF
            ),
            transaction.get(
              registryDocRef
            ),
          ]);

          if (!configSnapshot.exists()) {
            throw new Error(
              'public-config-not-found'
            );
          }

          const categoryExists =
            (
              configSnapshot.data()
                .assetCategories || []
            ).some(
              (category) =>
                String(
                  category || ''
                ).trim() ===
                newCategory
            );

          if (!categoryExists) {
            throw new Error(
              'asset-category-not-found'
            );
          }

          if (registrySnapshot.exists()) {
            const duplicateError =
              new Error(
                'duplicate-asset-number'
              );

            duplicateError.duplicatedLaptop =
              registrySnapshot.data();

            throw duplicateError;
          }

          await writePublicAssetCatalogMutationInTransaction(
            transaction,
            {
              fallbackAssets: splitRentalAssets,
              upsertAssets: [newLaptopDraft],
              updatedByUid:
                firebaseAuth.currentUser?.uid ||
                authenticatedAdminId ||
                currentAuthAdminAccount?.id ||
                '',
            }
          );

          transaction.set(
            assetDocRef,
            {
              ...newLaptopDraft,
              createdAt:
                serverTimestamp(),
              updatedAt:
                serverTimestamp(),
            }
          );

          transaction.set(
            registryDocRef,
            {
              id: registryId,
              assetId: newId,
              assetNo: newAssetNo,
              assetNoNormalized:
                normalizeAssetNumber(
                  newAssetNo
                ),
              updatedAt:
                serverTimestamp(),
            }
          );

          committedAsset =
            newLaptopDraft;
        }
      );

      if (!committedAsset) {
        throw new Error(
          'laptop-create-transaction-result-missing'
        );
      }

      setData((prev) => ({
        ...prev,
        laptops: [
          ...(prev.laptops || []),
          committedAsset,
        ],
      }));

      setNewLaptop(null);

      triggerToast(
        `자산 ${newAssetNo}이(가) 신규 등록되었습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'Laptop create transaction error:',
        error
      );

      if (
        error?.message ===
        'duplicate-asset-number'
      ) {
        const duplicatedAssetNo =
          error.duplicatedLaptop?.assetNo ||
          newAssetNo;

        triggerToast(
          `자산관리번호 [${duplicatedAssetNo}]은(는) 이미 등록되어 있어 신규 자산으로 추가할 수 없습니다.`,
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'asset-category-not-found'
      ) {
        triggerToast(
          '선택한 자산 카테고리가 최신 카테고리 목록에 없습니다. 신규 등록 패널을 닫고 다시 열어 주세요.',
          'error'
        );
        return;
      }

      const catalogErrorMessage =
        await getPublicAssetCatalogWriteErrorMessage(error);

      if (catalogErrorMessage) {
        triggerToast(catalogErrorMessage, 'error');
        return;
      }

      triggerToast(
        '신규 자산 등록에 실패했습니다. 입력 내용은 유지됩니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
        'error'
      );
    }
  };

  const deleteLaptop = (id, assetNo) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 자산을 삭제할 수 없습니다.',
        'error'
      );
      return;
    }

    const currentBlockingRequest =
      findSameAssetBlockingRequest(
        data.requests,
        id
      );

    if (currentBlockingRequest) {
      const currentBlockingStatus =
        getDisplayRentalStatus(
          currentBlockingRequest.status,
          currentBlockingRequest.startDate
        );

      triggerToast(
        `자산 ${assetNo}에는 현재 [${currentBlockingStatus}] 상태의 신청이 있어 삭제할 수 없습니다. 해당 신청을 불허 또는 반납완료 처리한 후 다시 삭제해 주세요.`,
        'error'
      );
      return;
    }

    triggerConfirm(
      '자산 삭제',
      `정말로 자산 [${assetNo}] 기기를 시스템 목록에서 영구적으로 삭제하시겠습니까? 완료된 신청 원장은 보존되나 기기 목록에서는 삭제됩니다.`,
      async () => {
        if (assetCutoverConfig.writeRequested) {
          try {
            const payload = await clerkStagingClient.deleteAdminAsset('', id);
            applyPostgresCatalog(payload?.adminAssetMutation?.catalog, payload?.adminAssetMutation?.firestoreMirror || 'synced');
            if (selectedLaptopId === id) setSelectedLaptopId(null);
            if (editLaptop?.id === id) setEditLaptop(null);
            triggerToast(`자산 ${assetNo}이(가) 성공적으로 삭제되었습니다.`, 'success');
          } catch (error) {
            console.error('PostgreSQL asset delete error:', error);
            showPostgresAssetError(error, `자산 ${assetNo} 삭제에 실패했습니다.`);
          }
          return;
        }

        let deletedAsset = null;

        try {
          await runTransaction(
            db,
            async (transaction) => {
              const assetDocRef = doc(
                RENTAL_ASSETS_COLLECTION_REF,
                id
              );

              const assetSnapshot =
                await transaction.get(
                  assetDocRef
                );

              if (!assetSnapshot.exists()) {
                throw new Error(
                  'laptop-not-found'
                );
              }

              const latestAsset = {
                ...assetSnapshot.data(),
                id: assetSnapshot.id,
              };

              const latestReservations =
                normalizeAssetReservations(
                  latestAsset.reservations ||
                  []
                );

              const latestBlockingRequest =
                findSameAssetBlockingRequest(
                  latestReservations,
                  id
                );

              if (
                latestBlockingRequest
              ) {
                const conflictError =
                  new Error(
                    'active-rental-exists'
                  );

                conflictError.blockingRequest =
                  latestBlockingRequest;

                throw conflictError;
              }

              const registryDocRef = doc(
                RENTAL_ASSET_NUMBERS_COLLECTION_REF,
                getAssetNumberRegistryId(
                  latestAsset.assetNo
                )
              );

              await transaction.get(
                registryDocRef
              );

              await writePublicAssetCatalogMutationInTransaction(
                transaction,
                {
                  fallbackAssets: splitRentalAssets,
                  removeAssetIds: [id],
                  updatedByUid:
                    firebaseAuth.currentUser?.uid ||
                    authenticatedAdminId ||
                    currentAuthAdminAccount?.id ||
                    '',
                }
              );

              transaction.delete(
                assetDocRef
              );

              transaction.delete(
                registryDocRef
              );

              deletedAsset =
                latestAsset;
            }
          );

          if (!deletedAsset) {
            throw new Error(
              'laptop-delete-transaction-result-missing'
            );
          }

          setData((prev) => ({
            ...prev,
            laptops:
              (prev.laptops || []).filter(
                (asset) =>
                  asset.id !== id
              ),
          }));

          if (
            selectedLaptopId === id
          ) {
            setSelectedLaptopId(null);
          }

          if (
            editLaptop?.id === id
          ) {
            setEditLaptop(null);
          }

          triggerToast(
            `자산 ${assetNo}이(가) 성공적으로 삭제되었습니다.`,
            'success'
          );
        } catch (error) {
          console.error(
            'Laptop delete transaction error:',
            error
          );

          if (
            error?.message ===
            'active-rental-exists'
          ) {
            const blockingRequest =
              error.blockingRequest;

            const blockingStatus =
              getDisplayRentalStatus(
                blockingRequest?.status,
                blockingRequest?.startDate
              );

            triggerToast(
              `삭제 확인 중 자산 ${assetNo}에 새로운 [${blockingStatus}] 신청이 확인되어 삭제를 중단했습니다. 해당 신청을 먼저 처리해 주세요.`,
              'error'
            );
            return;
          }

          if (
            error?.message ===
            'laptop-not-found'
          ) {
            triggerToast(
              `자산 ${assetNo}은(는) 이미 삭제되었거나 최신 자산 목록에서 찾을 수 없습니다.`,
              'error'
            );
            return;
          }

          const catalogErrorMessage =
            await getPublicAssetCatalogWriteErrorMessage(error);

          if (catalogErrorMessage) {
            triggerToast(catalogErrorMessage, 'error');
            return;
          }

          triggerToast(
            `자산 ${assetNo} 삭제에 실패했습니다. 자산 목록과 Firestore 권한 및 네트워크 상태를 확인해 주세요.`,
            'error'
          );
        }
      }
    );
  };

  const saveLaptop = async () => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 자산 정보를 저장할 수 없습니다.',
        'error'
      );
      return;
    }

    if (!editLaptop?.id) {
      triggerToast(
        '수정할 자산 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const editingLaptopId =
      editLaptop.id;

    const editedAssetNo = String(
      editLaptop.assetNo || ''
    ).trim();

    const editedCategory = String(
      editLaptop.category || ''
    ).trim();

    if (!editedAssetNo) {
      triggerToast(
        '자산 관리 번호를 정확히 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!editedCategory) {
      triggerToast(
        '자산 카테고리를 선택해 주세요.',
        'error'
      );
      return;
    }

    const editedLaptopDraft = {
      ...editLaptop,
      assetNo: editedAssetNo,
      assetNoNormalized:
        normalizeAssetNumber(
          editedAssetNo
        ),
      category: editedCategory,
    };

    if (assetCutoverConfig.writeRequested) {
      try {
        const payload = await clerkStagingClient.editAdminAsset(
          '',
          editingLaptopId,
          { ...editedLaptopDraft, baseStatus: editedLaptopDraft.status === STATUS.UNAVAILABLE ? STATUS.UNAVAILABLE : STATUS.AVAILABLE }
        );
        applyPostgresCatalog(payload?.adminAssetMutation?.catalog, payload?.adminAssetMutation?.firestoreMirror || 'synced');
        setEditLaptop(null);
        triggerToast('자산 상세 정보가 성공적으로 반영되었습니다.', 'success');
      } catch (error) {
        console.error('PostgreSQL asset edit error:', error);
        showPostgresAssetError(error, '자산 정보 저장에 실패했습니다. 기존 자산 정보는 변경되지 않았습니다.');
      }
      return;
    }

    let committedAsset = null;

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const assetDocRef = doc(
            RENTAL_ASSETS_COLLECTION_REF,
            editingLaptopId
          );

          const [
            assetSnapshot,
            configSnapshot,
          ] = await Promise.all([
            transaction.get(
              assetDocRef
            ),
            transaction.get(
              PUBLIC_CONFIG_DOC_REF
            ),
          ]);

          if (!assetSnapshot.exists()) {
            throw new Error(
              'laptop-not-found'
            );
          }

          if (!configSnapshot.exists()) {
            throw new Error(
              'public-config-not-found'
            );
          }

          const latestAsset = {
            ...assetSnapshot.data(),
            id: assetSnapshot.id,
          };

          const categoryExists =
            (
              configSnapshot.data()
                .assetCategories || []
            ).some(
              (category) =>
                String(
                  category || ''
                ).trim() ===
                editedCategory
            );

          if (!categoryExists) {
            throw new Error(
              'asset-category-not-found'
            );
          }

          const oldRegistryId =
            getAssetNumberRegistryId(
              latestAsset.assetNo
            );

          const newRegistryId =
            getAssetNumberRegistryId(
              editedAssetNo
            );

          const oldRegistryDocRef = doc(
            RENTAL_ASSET_NUMBERS_COLLECTION_REF,
            oldRegistryId
          );

          const newRegistryDocRef = doc(
            RENTAL_ASSET_NUMBERS_COLLECTION_REF,
            newRegistryId
          );

          const registrySnapshots =
            oldRegistryId ===
            newRegistryId
              ? [
                  await transaction.get(
                    oldRegistryDocRef
                  ),
                ]
              : await Promise.all([
                  transaction.get(
                    oldRegistryDocRef
                  ),
                  transaction.get(
                    newRegistryDocRef
                  ),
                ]);

          const newRegistrySnapshot =
            oldRegistryId ===
            newRegistryId
              ? registrySnapshots[0]
              : registrySnapshots[1];

          if (
            newRegistrySnapshot.exists() &&
            newRegistrySnapshot.data()
              .assetId !==
              editingLaptopId
          ) {
            const duplicateError =
              new Error(
                'duplicate-asset-number'
              );

            duplicateError.duplicatedLaptop =
              newRegistrySnapshot.data();

            throw duplicateError;
          }

          const reservations =
            normalizeAssetReservations(
              latestAsset.reservations ||
              []
            );

          const blockingRequest =
            findSameAssetBlockingRequest(
              reservations,
              editingLaptopId
            );

          const assetIdentityChanged =
            String(
              latestAsset.assetNo || ''
            ).trim() !==
              editedAssetNo ||
            String(
              latestAsset.category || ''
            ).trim() !==
              editedCategory;

          if (
            blockingRequest &&
            assetIdentityChanged
          ) {
            const identityChangeError =
              new Error(
                'active-rental-identity-change'
              );

            identityChangeError.blockingRequest =
              blockingRequest;

            throw identityChangeError;
          }

          const representativeRequest =
            getLaptopRepresentativeRequest(
              reservations,
              editingLaptopId
            );

          const nextStatus =
            editedLaptopDraft.status ===
            STATUS.UNAVAILABLE
              ? STATUS.UNAVAILABLE
              : representativeRequest
                ? representativeRequest.status
                : STATUS.AVAILABLE;

          const nextAsset = {
            ...latestAsset,
            ...editedLaptopDraft,
            id: latestAsset.id,
            category: editedCategory,
            assetNo: editedAssetNo,
            assetNoNormalized:
              normalizeAssetNumber(
                editedAssetNo
              ),
            reservations,
            status: nextStatus,
            currentRequestId:
              representativeRequest?.id ||
              null,
          };

          await writePublicAssetCatalogMutationInTransaction(
            transaction,
            {
              fallbackAssets: splitRentalAssets,
              upsertAssets: [nextAsset],
              updatedByUid:
                firebaseAuth.currentUser?.uid ||
                authenticatedAdminId ||
                currentAuthAdminAccount?.id ||
                '',
            }
          );

          transaction.set(
            assetDocRef,
            {
              ...nextAsset,
              updatedAt:
                serverTimestamp(),
            },
            {
              merge: true,
            }
          );

          if (
            oldRegistryId !==
            newRegistryId
          ) {
            transaction.delete(
              oldRegistryDocRef
            );
          }

          transaction.set(
            newRegistryDocRef,
            {
              id: newRegistryId,
              assetId:
                editingLaptopId,
              assetNo:
                editedAssetNo,
              assetNoNormalized:
                normalizeAssetNumber(
                  editedAssetNo
                ),
              updatedAt:
                serverTimestamp(),
            }
          );

          committedAsset =
            nextAsset;
        }
      );

      if (!committedAsset) {
        throw new Error(
          'laptop-save-transaction-result-missing'
        );
      }

      setData((prev) => ({
        ...prev,
        laptops:
          (prev.laptops || []).map(
            (asset) =>
              asset.id ===
              editingLaptopId
                ? committedAsset
                : asset
          ),
      }));

      setEditLaptop(null);

      triggerToast(
        '자산 상세 정보가 성공적으로 반영되었습니다.',
        'success'
      );
    } catch (error) {
      console.error(
        'Laptop save transaction error:',
        error
      );

      if (
        error?.message ===
        'duplicate-asset-number'
      ) {
        const duplicatedAssetNo =
          error.duplicatedLaptop?.assetNo ||
          editedAssetNo;

        triggerToast(
          `자산관리번호 [${duplicatedAssetNo}]은(는) 이미 다른 자산에 등록되어 있어 저장할 수 없습니다.`,
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'active-rental-identity-change'
      ) {
        const blockingRequest =
          error.blockingRequest;

        const blockingStatus =
          getDisplayRentalStatus(
            blockingRequest?.status,
            blockingRequest?.startDate
          );

        triggerToast(
          `현재 [${blockingStatus}] 상태의 신청이 있어 자산 카테고리 또는 자산관리번호를 변경할 수 없습니다. 신청을 불허 또는 반납완료 처리한 후 다시 변경해 주세요.`,
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'asset-category-not-found'
      ) {
        triggerToast(
          '선택한 자산 카테고리가 최신 카테고리 목록에 없습니다. 자산 수정 패널을 닫고 다시 열어 주세요.',
          'error'
        );
        return;
      }

      if (
        error?.message ===
        'laptop-not-found'
      ) {
        triggerToast(
          '수정하려는 자산이 이미 삭제되었거나 최신 자산 목록에서 찾을 수 없습니다.',
          'error'
        );
        setEditLaptop(null);
        return;
      }

      const catalogErrorMessage =
        await getPublicAssetCatalogWriteErrorMessage(error);

      if (catalogErrorMessage) {
        triggerToast(catalogErrorMessage, 'error');
        return;
      }

      triggerToast(
        '자산 정보 저장에 실패했습니다. 기존 자산 정보는 변경되지 않았습니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
        'error'
      );
    }
  };

  return {
    createLaptop,
    deleteLaptop,
    handleAddLaptopClick,
    saveLaptop,
  };
}
