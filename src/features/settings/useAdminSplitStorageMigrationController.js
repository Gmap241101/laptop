import { useState } from 'react';
import {
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  RENTAL_BLOCKING_REQUEST_STATUSES,
  STATUS,
} from '../../constants/appConstants.js';
import { getLaptopRepresentativeRequest } from '../../domain/rentalPolicy.js';
import {
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_ASSET_NUMBERS_COLLECTION_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  RENTAL_AVAILABILITY_COLLECTION_REF,
  RENTAL_BORROWERS_COLLECTION_REF,
  firebaseAuth,
} from '../../firebase.js';
import {
  normalizeAssetReservations,
  toRentalAvailabilityRequest,
} from '../../services/publicAssetCatalog.js';
import { rebuildPublicAssetCatalogFromServer } from '../../services/publicAssetCatalogWriteThroughLoader.js';
import {
  getAssetNumberRegistryId,
  normalizeAssetNumber,
} from '../assets/useAdminAssetCrudController.js';
import { commitFirestoreOperations } from '../members/memberAccountIndexService.js';

export const SPLIT_STORAGE_VERSION = 2;

export const useAdminSplitStorageMigrationState = () => {
  const [splitStorageFinalizeLoading, setSplitStorageFinalizeLoading] =
    useState(false);

  return {
    setSplitStorageFinalizeLoading,
    splitStorageFinalizeLoading,
  };
};

export default function useAdminSplitStorageMigrationController({
  authenticatedAdminId,
  currentAuthAdminAccount,
  isAdminAuthenticated,
  setSplitStorageFinalizeLoading,
  splitStorageFinalizeLoading,
  triggerToast,
}) {
  const finalizeSplitStorageMigration = async () => {
    if (splitStorageFinalizeLoading) {
      return;
    }

    if (!isAdminAuthenticated) {
      triggerToast(
        '분리 저장소 최종 전환은 인증된 관리자만 실행할 수 있습니다.',
        'error'
      );
      return;
    }

    setSplitStorageFinalizeLoading(true);

    try {
      const [
        configSnapshot,
        assetsSnapshot,
        availabilitySnapshot,
        borrowersSnapshot,
        existingRegistrySnapshot,
      ] = await Promise.all([
        getDoc(PUBLIC_CONFIG_DOC_REF),
        getDocs(RENTAL_ASSETS_COLLECTION_REF),
        getDocs(RENTAL_AVAILABILITY_COLLECTION_REF),
        getDocs(RENTAL_BORROWERS_COLLECTION_REF),
        getDocs(RENTAL_ASSET_NUMBERS_COLLECTION_REF),
      ]);

      if (!configSnapshot.exists()) {
        throw new Error('public-config-not-found');
      }

      const currentConfig = configSnapshot.data();
      const currentStorageVersion = Number(currentConfig.storageVersion || 0);

      if (currentStorageVersion >= SPLIT_STORAGE_VERSION) {
        triggerToast(
          'Firestore 분리 저장소 최종 전환이 이미 완료되어 있습니다.',
          'success'
        );
        return;
      }

      const availabilityByAssetId = new Map();

      availabilitySnapshot.docs.forEach((availabilityDocument) => {
        const availabilityRequest = toRentalAvailabilityRequest({
          ...availabilityDocument.data(),
          id: availabilityDocument.id,
        });

        if (
          !availabilityRequest.id ||
          !availabilityRequest.laptopId ||
          !RENTAL_BLOCKING_REQUEST_STATUSES.includes(
            availabilityRequest.status
          )
        ) {
          throw new Error('invalid-availability-document');
        }

        const currentAssetReservations =
          availabilityByAssetId.get(availabilityRequest.laptopId) || [];

        currentAssetReservations.push(availabilityRequest);

        availabilityByAssetId.set(
          availabilityRequest.laptopId,
          currentAssetReservations
        );
      });

      const assetIdSet = new Set(
        assetsSnapshot.docs.map((assetDocument) => assetDocument.id)
      );

      for (const availabilityAssetId of availabilityByAssetId.keys()) {
        if (!assetIdSet.has(availabilityAssetId)) {
          throw new Error('availability-asset-not-found');
        }
      }

      const assetNumberRegistryIdSet = new Set();
      const assetOperations = [];
      const registryOperations = [];

      assetsSnapshot.docs.forEach((assetDocument) => {
        const assetData = assetDocument.data();
        const assetNo = String(assetData.assetNo || '').trim();

        if (!assetNo) {
          throw new Error('asset-number-missing');
        }

        const assetNoNormalized = normalizeAssetNumber(assetNo);
        const registryId = getAssetNumberRegistryId(assetNo);

        if (assetNumberRegistryIdSet.has(registryId)) {
          throw new Error('duplicate-asset-number');
        }

        assetNumberRegistryIdSet.add(registryId);

        const reservations = normalizeAssetReservations(
          availabilityByAssetId.get(assetDocument.id) || []
        );

        const representativeRequest = getLaptopRepresentativeRequest(
          reservations,
          assetDocument.id
        );

        const nextStatus =
          assetData.status === STATUS.UNAVAILABLE
            ? STATUS.UNAVAILABLE
            : representativeRequest
              ? representativeRequest.status
              : STATUS.AVAILABLE;

        assetOperations.push({
          type: 'set',
          ref: assetDocument.ref,
          data: {
            reservations,
            assetNoNormalized,
            status: nextStatus,
            currentRequestId: representativeRequest?.id || null,
            updatedAt: serverTimestamp(),
          },
          options: {
            merge: true,
          },
        });

        registryOperations.push({
          type: 'set',
          ref: doc(RENTAL_ASSET_NUMBERS_COLLECTION_REF, registryId),
          data: {
            id: registryId,
            assetId: assetDocument.id,
            assetNo,
            assetNoNormalized,
            updatedAt: serverTimestamp(),
          },
        });
      });

      const borrowerOperations = borrowersSnapshot.docs.map(
        (borrowerDocument, index) => ({
          type: 'set',
          ref: borrowerDocument.ref,
          data: {
            id: borrowerDocument.id,
            name: String(borrowerDocument.data().name || ''),
            team: String(borrowerDocument.data().team || ''),
            sortOrder: Number.isFinite(
              Number(borrowerDocument.data().sortOrder)
            )
              ? Number(borrowerDocument.data().sortOrder)
              : index,
            updatedAt: serverTimestamp(),
          },
          options: {
            merge: true,
          },
        })
      );

      const registryCleanupOperations = existingRegistrySnapshot.docs.map(
        (registryDocument) => ({
          type: 'delete',
          ref: registryDocument.ref,
        })
      );

      await commitFirestoreOperations(registryCleanupOperations);

      await commitFirestoreOperations([
        ...assetOperations,
        ...registryOperations,
        ...borrowerOperations,
      ]);

      await rebuildPublicAssetCatalogFromServer({
        updatedByUid:
          firebaseAuth.currentUser?.uid ||
          authenticatedAdminId ||
          currentAuthAdminAccount?.id ||
          '',
      });

      await setDoc(
        PUBLIC_CONFIG_DOC_REF,
        {
          storageVersion: SPLIT_STORAGE_VERSION,
          storageMode: 'split-collections',
          storageReady: true,
          storageFinalizedBy:
            firebaseAuth.currentUser?.uid || authenticatedAdminId || '',
          storageFinalizedAt: serverTimestamp(),
          storageFinalizedCounts: {
            assets: assetsSnapshot.size,
            availabilityRequests: availabilitySnapshot.size,
            borrowers: borrowersSnapshot.size,
          },
          updatedAt: serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      triggerToast(
        `Firestore 분리 저장소 최종 전환이 완료되었습니다. 자산 ${assetsSnapshot.size}건, 진행 중 예약 ${availabilitySnapshot.size}건, 대여자 ${borrowersSnapshot.size}건을 검증했습니다.`,
        'success'
      );
    } catch (error) {
      console.error('Split storage finalization error:', error);

      if (error?.message === 'availability-asset-not-found') {
        triggerToast(
          'rentalAvailability에 연결된 자산 문서가 없어 최종 전환을 중단했습니다. rentalAssets와 rentalAvailability의 laptopId를 확인해 주세요.',
          'error'
        );
        return;
      }

      if (error?.message === 'duplicate-asset-number') {
        triggerToast(
          '중복된 자산관리번호가 있어 최종 전환을 중단했습니다. rentalAssets의 assetNo 중복을 먼저 정리해 주세요.',
          'error'
        );
        return;
      }

      if (error?.message === 'asset-number-missing') {
        triggerToast(
          '자산관리번호가 없는 자산 문서가 있어 최종 전환을 중단했습니다.',
          'error'
        );
        return;
      }

      if (error?.code === 'permission-denied') {
        triggerToast(
          '분리 저장소 최종 전환 권한이 없습니다. 변경된 Firestore Rules가 게시되었는지 확인해 주세요.',
          'error'
        );
        return;
      }

      triggerToast(
        'Firestore 분리 저장소 최종 전환에 실패했습니다. 기존 분리 컬렉션은 삭제되지 않았으며, 원인을 수정한 뒤 다시 실행할 수 있습니다.',
        'error'
      );
    } finally {
      setSplitStorageFinalizeLoading(false);
    }
  };

  return {
    finalizeSplitStorageMigration,
  };
}
