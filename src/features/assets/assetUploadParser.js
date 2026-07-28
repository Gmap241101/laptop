import { STATUS } from '../../constants/appConstants.js';
import { today } from '../../utils/appUtils.js';

let sheetJsLoaderModulePromise = null;

const loadSheetJsLoaderModule = () => {
  if (!sheetJsLoaderModulePromise) {
    sheetJsLoaderModulePromise = import('../../services/sheetJsLoader.js').catch(
      (error) => {
        sheetJsLoaderModulePromise = null;
        throw error;
      }
    );
  }

  return sheetJsLoaderModulePromise;
};

const parseSimpleCsv = (csvText) => {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length === 0) return [];

  const headers = lines[0]
    .split(',')
    .map((header) => header.trim().replace(/"/g, ''));

  return lines.slice(1).map((line) => {
    const values = line
      .split(',')
      .map((value) => value.trim().replace(/"/g, ''));
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    return row;
  });
};

export const getAssetUploadFileType = (fileName) => {
  const normalizedName = String(fileName || '').toLowerCase();

  if (normalizedName.endsWith('.xlsx') || normalizedName.endsWith('.xls')) {
    return 'excel';
  }

  if (normalizedName.endsWith('.csv')) {
    return 'csv';
  }

  return 'unsupported';
};

export const parseAssetUploadFile = async (file) => {
  const fileType = getAssetUploadFileType(file?.name);

  if (fileType === 'unsupported') {
    const error = new Error('unsupported-asset-upload-file');
    error.userMessage =
      '엑셀(.xlsx, .xls) 또는 CSV(.csv) 파일만 업로드할 수 있습니다.';
    throw error;
  }

  let sheetJs = null;
  let sheetJsLoaderModule = null;

  try {
    sheetJsLoaderModule = await loadSheetJsLoaderModule();
    sheetJs = await sheetJsLoaderModule.loadSheetJs();
  } catch (sheetJsError) {
    if (fileType === 'excel') {
      const error = new Error('sheetjs-load-failed');
      error.cause = sheetJsError;
      error.userMessage =
        sheetJsLoaderModule?.getSheetJsLoadErrorMessage?.(sheetJsError) ||
        '엑셀 처리 도구를 불러오지 못했습니다. 네트워크 연결 또는 외부 스크립트 차단 설정을 확인해 주세요.';
      throw error;
    }

    console.error('SheetJS load error for CSV fallback:', sheetJsError);
  }

  const dataBuffer = await file.arrayBuffer();
  const dataBytes = new Uint8Array(dataBuffer);

  if (fileType === 'excel') {
    const workbook = sheetJs.read(dataBytes, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return sheetJs.utils.sheet_to_json(sheet);
  }

  const csvText = new TextDecoder('utf-8').decode(dataBytes);

  if (!sheetJs) {
    return parseSimpleCsv(csvText);
  }

  const workbook = sheetJs.read(csvText, { type: 'string' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return sheetJs.utils.sheet_to_json(sheet);
};

const findRowValue = (row, aliases) => {
  const matchedKey = Object.keys(row || {}).find((keyName) =>
    aliases.some((alias) =>
      String(keyName)
        .toLowerCase()
        .replace(/\s+/g, '')
        .includes(String(alias).toLowerCase())
    )
  );

  return matchedKey ? String(row[matchedKey]).trim() : '';
};

export const createAssetUploadCandidates = (
  jsonList,
  { currentDate = today() } = {}
) => {
  const parsedCandidates = [];
  let missingAssetNoCount = 0;

  (Array.isArray(jsonList) ? jsonList : []).forEach((row, index) => {
    const category = findRowValue(row, [
      '자산카테고리',
      '카테고리',
      '분류',
      'category',
      'assetcategory',
      'asset_category',
    ]);

    const assetNo = findRowValue(row, [
      '자산관리번호',
      '관리번호',
      '자산번호',
      'assetno',
      'asset_no',
    ]);

    const model = findRowValue(row, ['모델명', '모델', '기종', 'model']);
    const serialNo = findRowValue(row, [
      '시리얼번호',
      '시리얼',
      'serialno',
      'serial_no',
      'sn',
      's/n',
    ]);
    const manufactureDate = findRowValue(row, [
      '제조일자',
      '제조일',
      '구입일자',
      '구입일',
      'manufacturedate',
      'manufacture_date',
    ]);
    const note = findRowValue(row, ['비고', '메모', '특이사항', 'note']);
    const photo = findRowValue(row, [
      '사진url',
      '사진링크',
      '사진',
      'photo',
      'image',
    ]);
    const statusValue = findRowValue(row, [
      '대여가능여부',
      '대여가능',
      '대여상태',
      '상태',
      'status',
    ]);

    if (!assetNo) {
      missingAssetNoCount += 1;
      return;
    }

    const fallbackPhoto =
      'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80';

    const finalStatus =
      statusValue.includes('대여불가') ||
      statusValue.toLowerCase().includes('unavailable') ||
      statusValue.includes('불가')
        ? STATUS.UNAVAILABLE
        : STATUS.AVAILABLE;

    parsedCandidates.push({
      sourceIndex: index,
      category,
      assetNo: assetNo.trim(),
      serialNo:
        serialNo || `SN-AUTO-${Math.floor(Math.random() * 90000 + 10000)}`,
      model: model || '미지정 기종',
      manufactureDate: manufactureDate || currentDate,
      photo: photo || fallbackPhoto,
      note: note || '',
      status: finalStatus,
      currentRequestId: null,
    });
  });

  return {
    parsedCandidates,
    missingAssetNoCount,
  };
};
