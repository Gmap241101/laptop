import { useCallback, useState } from 'react';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import {
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_ASSET_NUMBERS_COLLECTION_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  db,
  firebaseAuth,
} from '../../firebase.js';
import {
  getPublicAssetCatalogWriteErrorMessage,
  writePublicAssetCatalogMutationInTransaction,
} from '../../services/publicAssetCatalogWriteThroughLoader.js';
import {
  createAssetUploadCandidates,
  getAssetUploadFileType,
  parseAssetUploadFile,
} from './assetUploadParser.js';

const normalizeAssetNumber = (assetNo) =>
  String(assetNo || '').trim().toLowerCase();

const getAssetNumberRegistryId = (assetNo) =>
  encodeURIComponent(normalizeAssetNumber(assetNo));

export default function useAssetBulkUpload({
  splitRentalAssets,
  authenticatedAdminId,
  currentAuthAdminAccountId,
  setData,
  setShowUploadPanel,
  triggerToast,
}) {
  const [assetUploadParserLoading, setAssetUploadParserLoading] =
    useState(false);

  const processParsedData = useCallback(
    async (jsonList) => {
      if (!jsonList || jsonList.length === 0) {
        triggerToast(
          '업로드된 파일에서 읽어올 수 있는 자산이 감지되지 않았습니다.',
          'error'
        );
        return;
      }

      const { parsedCandidates, missingAssetNoCount } =
        createAssetUploadCandidates(jsonList);

      if (parsedCandidates.length === 0) {
        if (missingAssetNoCount > 0) {
          triggerToast(
            '자산관리번호가 입력된 행이 없어 업로드하지 않았습니다.',
            'error'
          );
          return;
        }

        triggerToast(
          '헤더(자산카테고리, 자산관리번호, 모델명, 시리얼번호 등) 규격 정보가 일치하지 않아 가져오지 못했습니다.',
          'error'
        );
        return;
      }

      const acceptedAssets = [];
      const duplicateAssetNumbers = new Set();
      const invalidCategoryNames = new Set();
      let invalidCategoryCount = 0;
      let duplicateAssetNoCount = 0;

      try {
        const configSnapshot = await getDoc(PUBLIC_CONFIG_DOC_REF);

        if (!configSnapshot.exists()) {
          throw new Error('public-config-not-found');
        }

        const registeredCategoryMap = new Map(
          (configSnapshot.data().assetCategories || []).map((category) => [
            String(category || '').trim().toLowerCase(),
            category,
          ])
        );
        const fileAssetNoSet = new Set();
        const validatedCandidates = [];

        parsedCandidates.forEach((candidate) => {
          const normalizedCategory = String(candidate.category || '')
            .trim()
            .toLowerCase();
          const matchedCategory = registeredCategoryMap.get(normalizedCategory);

          if (!normalizedCategory || !matchedCategory) {
            invalidCategoryCount += 1;
            invalidCategoryNames.add(candidate.category || '미입력');
            return;
          }

          const normalizedAssetNo = normalizeAssetNumber(candidate.assetNo);

          if (fileAssetNoSet.has(normalizedAssetNo)) {
            duplicateAssetNoCount += 1;
            duplicateAssetNumbers.add(candidate.assetNo);
            return;
          }

          fileAssetNoSet.add(normalizedAssetNo);

          const generatedAssetRef = doc(RENTAL_ASSETS_COLLECTION_REF);
          const assetId = `NB-UP-${generatedAssetRef.id}`;

          validatedCandidates.push({
            ...candidate,
            id: assetId,
            category: matchedCategory,
            assetNoNormalized: normalizedAssetNo,
            reservations: [],
          });
        });

        const transactionChunkSize = 100;

        for (
          let startIndex = 0;
          startIndex < validatedCandidates.length;
          startIndex += transactionChunkSize
        ) {
          const candidateChunk = validatedCandidates.slice(
            startIndex,
            startIndex + transactionChunkSize
          );
          let chunkResult = null;

          await runTransaction(db, async (transaction) => {
            const registryEntries = candidateChunk.map((candidate) => {
              const registryId = getAssetNumberRegistryId(candidate.assetNo);

              return {
                candidate,
                registryId,
                registryRef: doc(
                  RENTAL_ASSET_NUMBERS_COLLECTION_REF,
                  registryId
                ),
                assetRef: doc(RENTAL_ASSETS_COLLECTION_REF, candidate.id),
              };
            });

            const registrySnapshots = await Promise.all(
              registryEntries.map((entry) => transaction.get(entry.registryRef))
            );
            const createdEntries = [];
            const duplicatedAssetNumbers = [];

            registryEntries.forEach((entry, index) => {
              if (registrySnapshots[index].exists()) {
                duplicatedAssetNumbers.push(entry.candidate.assetNo);
                return;
              }

              createdEntries.push({
                entry,
                asset: {
                  id: entry.candidate.id,
                  category: entry.candidate.category,
                  assetNo: entry.candidate.assetNo,
                  assetNoNormalized: entry.candidate.assetNoNormalized,
                  serialNo: entry.candidate.serialNo,
                  model: entry.candidate.model,
                  manufactureDate: entry.candidate.manufactureDate,
                  photo: entry.candidate.photo,
                  note: entry.candidate.note,
                  status: entry.candidate.status,
                  currentRequestId: null,
                  reservations: [],
                },
              });
            });

            const createdAssets = createdEntries.map(({ asset }) => asset);

            if (createdAssets.length > 0) {
              await writePublicAssetCatalogMutationInTransaction(transaction, {
                fallbackAssets: [...splitRentalAssets, ...acceptedAssets],
                upsertAssets: createdAssets,
                updatedByUid:
                  firebaseAuth.currentUser?.uid ||
                  authenticatedAdminId ||
                  currentAuthAdminAccountId ||
                  '',
              });
            }

            createdEntries.forEach(({ entry, asset }) => {
              transaction.set(entry.assetRef, {
                ...asset,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });

              transaction.set(entry.registryRef, {
                id: entry.registryId,
                assetId: asset.id,
                assetNo: asset.assetNo,
                assetNoNormalized: asset.assetNoNormalized,
                updatedAt: serverTimestamp(),
              });
            });

            chunkResult = {
              createdAssets,
              duplicatedAssetNumbers,
            };
          });

          if (!chunkResult) {
            throw new Error('bulk-upload-transaction-result-missing');
          }

          acceptedAssets.push(...chunkResult.createdAssets);
          chunkResult.duplicatedAssetNumbers.forEach((assetNo) => {
            duplicateAssetNoCount += 1;
            duplicateAssetNumbers.add(assetNo);
          });
        }

        if (acceptedAssets.length > 0) {
          setData((previousData) => ({
            ...previousData,
            laptops: [...(previousData.laptops || []), ...acceptedAssets],
          }));
          setShowUploadPanel(false);

          const skippedMessages = [];

          if (invalidCategoryCount > 0) {
            skippedMessages.push(
              `카테고리 불일치 ${invalidCategoryCount}건 제외`
            );
          }
          if (missingAssetNoCount > 0) {
            skippedMessages.push(
              `자산관리번호 누락 ${missingAssetNoCount}건 제외`
            );
          }
          if (duplicateAssetNoCount > 0) {
            skippedMessages.push(
              `중복 자산관리번호 ${duplicateAssetNoCount}건 제외`
            );
          }

          triggerToast(
            `총 ${acceptedAssets.length}대의 기기를 엑셀/CSV 데이터베이스로 일괄 추가 등록했습니다.` +
              `${
                skippedMessages.length
                  ? ` (${skippedMessages.join(', ')})`
                  : ''
              }`,
            'success'
          );
          return;
        }

        if (invalidCategoryCount > 0) {
          const invalidCategoryList = Array.from(invalidCategoryNames)
            .slice(0, 5)
            .join(', ');

          triggerToast(
            `등록된 자산 카테고리와 일치하는 행이 없어 업로드하지 않았습니다. 불일치 카테고리: ${invalidCategoryList}`,
            'error'
          );
          return;
        }

        if (duplicateAssetNoCount > 0) {
          const duplicateAssetNoList = Array.from(duplicateAssetNumbers)
            .slice(0, 5)
            .join(', ');

          triggerToast(
            `기존 자산 또는 업로드 파일 내부에 동일한 자산관리번호가 있어 업로드하지 않았습니다. 중복 번호: ${duplicateAssetNoList}`,
            'error'
          );
          return;
        }

        triggerToast('업로드할 수 있는 유효한 자산이 없습니다.', 'error');
      } catch (error) {
        console.error('Bulk asset upload transaction error:', error);

        const catalogErrorMessage =
          await getPublicAssetCatalogWriteErrorMessage(error);

        if (catalogErrorMessage) {
          triggerToast(
            acceptedAssets.length > 0
              ? `${catalogErrorMessage} 현재까지 ${acceptedAssets.length}건은 저장되었습니다.`
              : catalogErrorMessage,
            'error'
          );
          return;
        }

        triggerToast(
          acceptedAssets.length > 0
            ? `엑셀/CSV 등록 중 일부 작업이 중단되었습니다. 현재까지 ${acceptedAssets.length}건은 저장되었으며 나머지는 등록되지 않았습니다.`
            : '엑셀/CSV 자산 등록에 실패했습니다. 기존 자산 목록은 변경되지 않았습니다. Firestore 권한과 네트워크 상태를 확인해 주세요.',
          'error'
        );
      }
    },
    [
      authenticatedAdminId,
      currentAuthAdminAccountId,
      setData,
      setShowUploadPanel,
      splitRentalAssets,
      triggerToast,
    ]
  );

  const handleFileUpload = useCallback(
    async (event) => {
      const fileInput = event.currentTarget;
      const file = fileInput.files?.[0];

      if (!file || assetUploadParserLoading) return;

      if (getAssetUploadFileType(file.name) === 'unsupported') {
        triggerToast(
          '엑셀(.xlsx, .xls) 또는 CSV(.csv) 파일만 업로드할 수 있습니다.',
          'error'
        );
        fileInput.value = '';
        return;
      }

      setAssetUploadParserLoading(true);

      try {
        const jsonResult = await parseAssetUploadFile(file);
        await processParsedData(jsonResult);
      } catch (error) {
        console.error('Asset upload file parse error:', error);
        triggerToast(
          error?.userMessage ||
            '파일 파싱 중 에러가 발생했습니다. 파일 형식과 작성 규격을 확인해 주세요.',
          'error'
        );
      } finally {
        fileInput.value = '';
        setAssetUploadParserLoading(false);
      }
    },
    [assetUploadParserLoading, processParsedData, triggerToast]
  );

  return {
    assetUploadParserLoading,
    handleFileUpload,
  };
}
