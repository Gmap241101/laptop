import {
  getDocs,
  limit as firestoreLimit,
  query as firestoreQuery,
  startAfter,
} from 'firebase/firestore';

export const DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE = 100;

const getSafeBatchSize = (value) => {
  const parsed = Math.trunc(Number(value));

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE;
  }

  return Math.min(parsed, 500);
};

const getSafeTargetMatchCount = (value) => {
  if (value === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Math.trunc(Number(value));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

/**
 * Firestore는 임의 부분 문자열 검색을 직접 지원하지 않으므로, 정렬된 서버
 * 결과를 제한된 배치로 순차 조회하면서 현재 페이지에 필요한 검색 결과까지만
 * 누적한다. 호출자는 동일한 검색 키에 대해 반환된 cursor와 matches를 보관해
 * 다음 페이지에서 이전 문서를 다시 읽지 않도록 해야 한다.
 */
export const scanFirestoreMatches = async ({
  collectionRef,
  constraints = [],
  startCursor = null,
  existingMatches = [],
  targetMatchCount,
  batchSize = DEFAULT_PROGRESSIVE_SEARCH_BATCH_SIZE,
  mapDocument = (documentSnapshot) => ({
    ...documentSnapshot.data(),
    id: documentSnapshot.id,
  }),
  matchesDocument,
  isCancelled = () => false,
}) => {
  if (!collectionRef) {
    throw new Error('검색 대상 Firestore 컬렉션이 지정되지 않았습니다.');
  }

  if (typeof matchesDocument !== 'function') {
    throw new Error('검색 결과 판정 함수가 지정되지 않았습니다.');
  }

  const safeBatchSize = getSafeBatchSize(batchSize);
  const safeTargetMatchCount = getSafeTargetMatchCount(targetMatchCount);
  const accumulatedMatches = Array.isArray(existingMatches)
    ? [...existingMatches]
    : [];

  let cursor = startCursor || null;
  let exhausted = false;
  let scannedDocumentCount = 0;
  let fetchedBatchCount = 0;

  while (
    !exhausted &&
    accumulatedMatches.length < safeTargetMatchCount &&
    !isCancelled()
  ) {
    const source = firestoreQuery(
      collectionRef,
      ...constraints,
      ...(cursor ? [startAfter(cursor)] : []),
      firestoreLimit(safeBatchSize)
    );

    const snapshot = await getDocs(source);

    if (isCancelled()) {
      break;
    }

    fetchedBatchCount += 1;
    scannedDocumentCount += snapshot.docs.length;

    snapshot.docs.forEach((documentSnapshot) => {
      const mappedDocument = mapDocument(documentSnapshot);

      if (matchesDocument(mappedDocument)) {
        accumulatedMatches.push(mappedDocument);
      }
    });

    if (snapshot.docs.length > 0) {
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }

    exhausted = snapshot.docs.length < safeBatchSize;
  }

  return {
    cancelled: isCancelled(),
    cursor,
    exhausted,
    matches: accumulatedMatches,
    scannedDocumentCount,
    fetchedBatchCount,
  };
};
