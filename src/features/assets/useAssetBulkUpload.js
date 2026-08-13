import { useCallback, useState } from 'react';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { publishAssetDomainCutoverObservation, readAssetDomainCutoverConfig } from './assetDomainCutover.js';
import {
  createAssetUploadCandidates,
  getAssetUploadFileType,
  parseAssetUploadFile,
} from './assetUploadParser.js';

export default function useAssetBulkUpload({
  setData,
  setShowUploadPanel,
  triggerToast,
}) {
  const [assetUploadParserLoading, setAssetUploadParserLoading] =
    useState(false);
  const assetCutoverConfig = readAssetDomainCutoverConfig();

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

      try {
        const payload = await clerkStagingClient.bulkCreateAdminAssets('', parsedCandidates);
        const mutation = payload?.adminAssetMutation;
        const catalog = mutation?.catalog;
        const createdAssets = mutation?.assets || [];
        setData((previousData) => ({
          ...previousData,
          laptops: catalog?.assets || previousData.laptops,
          assetCategories: catalog?.categories || previousData.assetCategories,
          requests: catalog?.availability || previousData.requests,
        }));
        setShowUploadPanel(false);
        publishAssetDomainCutoverObservation({
          readRequested: assetCutoverConfig.readRequested,
          writeRequested: true,
          activeSource: 'postgresql',
          writeSource: 'postgresql-authoritative',
          firestoreMirror: 'retired',
          assetWatcherDisabled: true,
          availabilityWatcherDisabled: true,
          assetCount: catalog?.assets?.length || 0,
          categoryCount: catalog?.categories?.length || 0,
          availabilityCount: catalog?.availability?.length || 0,
          firestoreFallbackReads: 0,
          error: '',
        });
        const skipped = [];
        if (missingAssetNoCount > 0) skipped.push(`자산관리번호 누락 ${missingAssetNoCount}건 제외`);
        if ((mutation?.invalidCategories || []).length) skipped.push(`카테고리 불일치 ${mutation.invalidCategories.length}건 제외`);
        if ((mutation?.duplicateAssetNumbers || []).length) skipped.push(`중복 자산관리번호 ${mutation.duplicateAssetNumbers.length}건 제외`);
        triggerToast(
          `DB 저장 성공: 총 ${createdAssets.length}대의 기기를 일괄 추가 등록했습니다.${skipped.length ? ` (${skipped.join(', ')})` : ''}`,
          'success'
        );
      } catch (error) {
        console.error('PostgreSQL bulk asset upload error:', error);
        if (error?.code === 'asset-bulk-no-valid-assets') {
          triggerToast('업로드할 수 있는 유효한 자산이 없습니다. 카테고리와 중복 자산관리번호를 확인해 주세요.', 'error');
        } else {
          triggerToast(`엑셀/CSV 자산 등록에 실패했습니다. 기존 자산 목록은 변경되지 않았습니다. 오류 코드: ${error?.code || error?.name || 'asset_bulk_upload_failed'}`, 'error');
        }
      }
    },
    [
      assetCutoverConfig.readRequested,
      assetCutoverConfig.writeRequested,
      setData,
      setShowUploadPanel,
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
