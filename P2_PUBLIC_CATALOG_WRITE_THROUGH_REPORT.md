# P2 공개 자산 카탈로그 Write-through 동기화 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p1-performance-measurement-deployment-package.zip`
- 작업 목적: `rentalAssets` 변경 후 별도 지연 effect가 `publicCatalog/main`을 뒤늦게 갱신하던 구조 제거
- 적용 원칙: 자산 원본과 공개 카탈로그를 동일 작업에서 저장하고, 복원·초기화·마이그레이션 경로도 누락 없이 재생성

## 2. 기존 문제

기존 `App.jsx`는 관리자 자산 관련 화면에서 `rentalAssets` 실시간 snapshot을 받은 뒤 다음 순서로 카탈로그를 갱신했습니다.

```text
rentalAssets 변경
→ 관리자 화면 snapshot 수신
→ 400ms setTimeout
→ publicCatalog/main getDoc
→ fingerprint 비교
→ publicCatalog/main setDoc
```

이 방식에는 다음 문제가 있었습니다.

1. 관리자 브라우저가 타이머 실행 전에 닫히면 카탈로그 쓰기가 누락될 수 있음
2. 관리자 자산·신청·카테고리·데이터 관리 화면을 방문해야 자동 복구됨
3. 자산 저장은 성공했지만 카탈로그 저장만 실패하는 부분 성공 상태 가능
4. 빠른 연속 변경 또는 다중 관리자 작업 시 오래된 snapshot이 최신 카탈로그를 덮을 가능성
5. 카테고리 변경, 분리 저장소 전환, 백업 복원·초기화 경로는 일반 자산 CRUD와 별도로 관리됨

## 3. 변경 파일

### 기존 파일 수정

```text
src/App.jsx
src/admin/AdminSettingsPanel.jsx
src/services/dashboardSummaryService.js
src/services/publicAssetCatalog.js
rules/firestore.rules
```

### 신규 파일

```text
src/services/publicAssetCatalogWriteThrough.js
```

## 4. 카탈로그 스키마 변경

```js
export const PUBLIC_ASSET_CATALOG_SCHEMA_VERSION = 2;
```

스키마 2 문서에는 다음 필드가 포함됩니다.

```js
{
  schemaVersion: 2,
  assets,
  assetCount,
  fingerprint,
  updatedAt,
  updatedByUid,
  synchronizationMode: 'write-through',
}
```

Firestore Rules도 스키마 2와 `write-through` 모드만 허용하도록 변경했습니다.

```rules
match /publicCatalog/main {
  allow read: if true;
  allow create, update: if isAdmin()
    && request.resource.data.get('schemaVersion', 0) == 2
    && request.resource.data.get('synchronizationMode', '') == 'write-through'
    && request.resource.data.get('assets', []) is list
    && request.resource.data.get('assets', []).size() <= 200
    && request.resource.data.get('assetCount', -1)
      == request.resource.data.get('assets', []).size();
  allow delete: if false;
}
```

## 5. 신규 Write-through 서비스

신규 파일 `src/services/publicAssetCatalogWriteThrough.js`에 다음 기능을 분리했습니다.

- 카탈로그 정규화 및 ID 기준 정렬
- 최대 자산 수 200대 검증
- 문서 크기 900,000바이트 안전 한도 검증
- 자산 upsert 및 삭제 반영
- Firestore transaction 내부 카탈로그 변경
- 서버 `rentalAssets` 전체 기준 카탈로그 재생성
- 기존 스키마 1 문서의 스키마 2 전환
- 사용자 표시용 오류 메시지 생성

핵심 함수:

```js
createPublicAssetCatalogPayload()
applyPublicAssetCatalogMutation()
writePublicAssetCatalogMutationInTransaction()
rebuildPublicAssetCatalogFromServer()
ensurePublicAssetCatalogWriteThrough()
getPublicAssetCatalogWriteErrorMessage()
```

## 6. 신규 자산 등록

### 수정 전

```text
transaction:
  rentalAssets 생성
  rentalAssetNumbers 생성

별도 effect:
  publicCatalog/main 갱신
```

### 수정 후

```js
await writePublicAssetCatalogMutationInTransaction(
  transaction,
  {
    fallbackAssets: splitRentalAssets,
    upsertAssets: [newLaptopDraft],
    updatedByUid: firebaseAuth.currentUser?.uid || '',
  }
);

transaction.set(assetDocRef, ...);
transaction.set(registryDocRef, ...);
```

자산 문서, 자산번호 레지스트리, 공개 카탈로그가 같은 transaction에서 커밋됩니다.

## 7. 자산 수정

자산관리번호, 카테고리, 모델, 시리얼번호, 제조일자, 사진 URL, 메모, 대여불가 상태를 수정할 때 최신 카탈로그 항목도 같은 transaction에서 upsert합니다.

```js
await writePublicAssetCatalogMutationInTransaction(
  transaction,
  {
    fallbackAssets: splitRentalAssets,
    upsertAssets: [nextAsset],
    updatedByUid: firebaseAuth.currentUser?.uid || '',
  }
);
```

카탈로그 크기 또는 자산 수 제한을 초과하면 자산 원본도 저장하지 않습니다.

## 8. 자산 삭제

삭제 transaction에서 카탈로그 항목도 동시에 제거합니다.

```js
await writePublicAssetCatalogMutationInTransaction(
  transaction,
  {
    fallbackAssets: splitRentalAssets,
    removeAssetIds: [id],
    updatedByUid: firebaseAuth.currentUser?.uid || '',
  }
);

transaction.delete(assetDocRef);
transaction.delete(registryDocRef);
```

자산 원본만 삭제되고 사용자 카탈로그에는 남는 상태가 발생하지 않도록 했습니다.

## 9. 엑셀·CSV 일괄 등록

기존 100건 단위 transaction 구조를 유지하면서 각 chunk에서 다음을 함께 처리합니다.

```text
중복 자산번호 레지스트리 확인
→ 실제 생성 대상 산출
→ publicCatalog/main에 생성 대상 upsert
→ rentalAssets 생성
→ rentalAssetNumbers 생성
```

한 chunk의 카탈로그 갱신이 실패하면 해당 chunk의 자산 문서와 레지스트리도 커밋되지 않습니다. 이미 완료된 이전 chunk는 기존 동작과 동일하게 유지됩니다.

## 10. 자산 카테고리 변경

카테고리명 변경 시 다음 세 항목을 하나의 write batch로 저장합니다.

```text
변경 대상 rentalAssets 문서
rentalSystem/publicConfig
publicCatalog/main
```

카테고리명 변경 이후 사용자 카탈로그가 이전 카테고리를 계속 표시하는 문제를 제거했습니다.

## 11. 분리 저장소 최종 전환

분리 저장소 전환 과정에서 자산 예약·상태·자산번호 레지스트리를 정리한 다음 서버의 최신 `rentalAssets` 전체를 기준으로 카탈로그를 재생성합니다.

```js
await rebuildPublicAssetCatalogFromServer({
  updatedByUid: firebaseAuth.currentUser?.uid || '',
});
```

## 12. 백업 복원 및 데이터 초기화

### 자산 영역 복원

복원된 `rentalAssets` 전체를 기준으로 카탈로그를 다시 만듭니다.

```js
if (scopes.includes(SYSTEM_RESTORE_SCOPE.ASSETS)) {
  await rebuildPublicAssetCatalogFromServer(...);
}
```

### 자산 영역 초기화

자산 컬렉션 삭제 후 빈 카탈로그 문서를 생성합니다.

```js
if (scopes.includes(SYSTEM_RESET_SCOPE.ASSETS)) {
  await rebuildPublicAssetCatalogFromServer(...);
}
```

## 13. 기존 스키마 자동 전환

관리자가 로그인하면 `publicCatalog/main`을 1건 확인합니다.

- 이미 스키마 2 + write-through이면 추가 작업 없음
- 이전 스키마 또는 문서 누락이면 `rentalAssets` 전체를 읽어 스키마 2로 재생성
- 마이그레이션 transaction은 최신 카탈로그가 다른 작업에서 먼저 생성됐으면 재시도 후 덮어쓰지 않음

사용자 화면은 스키마 2가 아닌 문서를 발견하면 기존 안전 fallback으로 `rentalAssets`를 읽습니다. 따라서 관리자 최초 로그인 전에도 자산 목록이 비어 보이지 않습니다.

## 14. 대시보드 복구 경로

대시보드 요약 갱신도 다음 조건을 카탈로그 복구 대상으로 판단합니다.

```text
문서 없음
assets 배열 없음
schemaVersion != 2
synchronizationMode != write-through
```

복구 시에는 기존 카탈로그 배열을 재사용하지 않고 최신 `rentalAssets` 전체를 읽어 재생성합니다.

## 15. 데이터 무결성 점검

관리자 데이터 무결성 점검에 다음 검사를 추가했습니다.

```text
rentalAssets 전체 fingerprint
vs.
publicCatalog/main fingerprint 및 assetCount
```

불일치 시 다음 경고를 표시합니다.

```text
public-catalog-out-of-sync
```

## 16. 제거된 코드

`App.jsx`에서 다음을 제거했습니다.

```text
publicCatalogFingerprintRef
publicCatalogExpectedFingerprintRef
관리자 탭 기반 shouldSynchronizeCatalog effect
400ms setTimeout 기반 synchronizeCatalog
별도 getDoc → setDoc 동기화
```

## 17. 읽기·쓰기 변화

### 기존

자산 snapshot 변경 후 별도 동기화가 실행될 때:

```text
publicCatalog/main 읽기 1건
필요 시 쓰기 1건
```

화면 이동이나 연속 snapshot에 따라 동기화 시도가 반복될 수 있었습니다.

### 수정 후

일반 자산 추가·수정·삭제:

```text
기존 transaction + publicCatalog/main 읽기 1건 + 쓰기 1건
```

엑셀·CSV 등록:

```text
transaction chunk당 publicCatalog/main 읽기 1건 + 쓰기 1건
```

관리자 로그인:

```text
카탈로그 상태 확인 읽기 1건
이전 스키마인 최초 1회에만 전체 자산 재생성
```

읽기 수 자체를 무조건 줄이는 변경이 아니라, 불확실한 사후 동기화를 제거하고 정확성과 원자성을 확보하는 변경입니다.

## 18. 검증 결과

- JavaScript·JSX·MJS 변환 검사: 69개, 오류 0건
- 상대 import 경로 검사: 69개, 누락 0건
- Rules 중괄호: 108 / 108
- Rules 스키마 2 확인: 통과
- Rules write-through 모드 확인: 통과
- 기존 지연 동기화 코드 잔존: 0건
- 신규 payload 정렬·스키마 검사: 통과
- upsert·삭제 mutation 검사: 통과
- transaction 카탈로그 갱신 검사: 통과
- 이전 스키마 마이그레이션 검사: 통과
- 201대 제한 오류 검사: 통과

## 19. 빌드 제한

작업 환경에서 `npm ci`가 제한 시간 내 완료되지 않았고 `vite` 실행 파일이 생성되지 않아 실제 Vite 프로덕션 빌드는 수행하지 못했습니다.

전체 소스 JSX 변환, import 경로, 신규 서비스 런타임 모의 검사와 ZIP 재추출 검사를 별도로 수행했습니다.

## 20. 배포 순서

카탈로그 Rules가 스키마 2를 요구하므로 Rules를 먼저 배포합니다.

```powershell
Set-Location "E:\project\rental-system\test_new"

firebase deploy --only firestore:rules

.\deploy.ps1
```

인덱스 변경은 없습니다.
