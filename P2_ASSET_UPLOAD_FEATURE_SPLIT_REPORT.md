# P2 자산 업로드 Feature 모듈 분리 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p2-sheetjs-lazy-loading-deployment-package.zip`
- 목적: `App.jsx`에 남아 있던 관리자 자산 엑셀·CSV 업로드 업무 로직을 실제 feature 모듈로 분리
- 변경 원칙: 화면 문구, Firestore 컬렉션·문서 구조, 자산 등록 transaction, 공개 카탈로그 write-through, 업로드 결과 정책 유지

## 2. 변경 파일

### 기존 파일 수정

- `src/App.jsx`
- `src/admin/AdminAssetsPanel.jsx`
- `src/context/appContextSlices.js`
- `SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규 파일

- `src/features/assets/assetUploadParser.js`
- `src/features/assets/useAssetBulkUpload.js`

## 3. 핵심 변경

### 3.1 App.jsx에서 제거한 책임

다음 로직을 `App.jsx`에서 제거했습니다.

- SheetJS 로더 모듈 동적 import Promise 관리
- `.xlsx`, `.xls`, `.csv` 파일 형식 판정
- 파일 ArrayBuffer 읽기
- SheetJS 워크북·첫 번째 시트 변환
- SheetJS 실패 시 단순 CSV 파서 fallback
- 업로드 헤더 별칭 매핑
- 기본 모델명·시리얼번호·제조일자·이미지·상태 생성
- 카테고리 유효성 검사
- 파일 내부 자산관리번호 중복 검사
- Firestore 자산번호 레지스트리 중복 검사
- 100건 단위 transaction 처리
- `publicCatalog/main` write-through
- 부분 성공·제외 건수 토스트 생성

### 3.2 지연 로딩되는 관리자 자산 패널로 이동

`useAssetBulkUpload()`는 `App.jsx`에서 호출하지 않습니다.

```jsx
// src/admin/AdminAssetsPanel.jsx
import useAssetBulkUpload from '../features/assets/useAssetBulkUpload.js';

const {
  assetUploadParserLoading,
  handleFileUpload,
} = useAssetBulkUpload({
  splitRentalAssets,
  authenticatedAdminId,
  currentAuthAdminAccountId: currentAuthAdminAccount?.id || '',
  setData,
  setShowUploadPanel,
  triggerToast,
});
```

`AdminAssetsPanel` 자체가 관리자 작업공간 안에서 `React.lazy()`로 로드되므로 일반 사용자와 관리자 다른 메뉴에서는 다음 모듈이 초기 경로에 포함되지 않습니다.

- `useAssetBulkUpload.js`
- `assetUploadParser.js`
- `sheetJsLoader.js`

### 3.3 파일 판독과 행 매핑 분리

`src/features/assets/assetUploadParser.js`가 다음 순수·반순수 작업을 담당합니다.

```js
getAssetUploadFileType(fileName)
parseAssetUploadFile(file)
createAssetUploadCandidates(jsonList, options)
```

지원 형식은 기존과 동일합니다.

- `.xlsx`
- `.xls`
- `.csv`

CSV에서 SheetJS CDN 로드가 실패한 경우 기존 단순 CSV 파서를 fallback으로 사용합니다.

### 3.4 Firestore 등록 컨트롤러 분리

`src/features/assets/useAssetBulkUpload.js`가 다음 업무 흐름을 담당합니다.

```text
파일 선택
→ 파일 파싱
→ 업로드 후보 생성
→ 공개 설정에서 등록 카테고리 확인
→ 파일 내부 중복 제거
→ 자산번호 레지스트리 중복 확인
→ 100건 단위 transaction
→ rentalAssets 생성
→ rentalAssetNumbers 생성
→ publicCatalog/main write-through
→ 로컬 자산 상태 반영
→ 결과 토스트
```

Firestore 저장 구조와 transaction 단위는 변경하지 않았습니다.

## 4. App.jsx 감소

| 지표 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 21,731줄 | 21,074줄 | **657줄 감소** |
| 파일 크기 | 628,913 bytes | 611,148 bytes | **17,765 bytes 감소** |

관리자 자산 패널은 훅 호출과 필요한 의존성 전달이 추가돼 17줄, 399 bytes 증가했습니다.

## 5. 초기 소스 그래프

| 지표 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 30개 | 30개 | 동일 |
| 초기 정적 소스 | 837,582 bytes | 819,859 bytes | **17,723 bytes 감소** |
| 감소율 | - | - | **약 2.12% 감소** |
| 최상위 동적 진입점 | 14개 | 13개 | 1개 감소 |

최상위 동적 진입점이 감소한 이유는 `sheetJsLoader.js`가 더 이상 `App.jsx`에서 직접 동적 import되지 않고, 지연 로딩된 `AdminAssetsPanel` 아래의 중첩 동적 import가 되었기 때문입니다.

## 6. 컨텍스트 계약 변경

관리자 자산 패널 컨텍스트에서 다음 두 항목을 제거했습니다.

```text
assetUploadParserLoading
handleFileUpload
```

다음 의존성을 패널에 전달하도록 변경했습니다.

```text
authenticatedAdminId
currentAuthAdminAccount
setData
splitRentalAssets
triggerToast
```

검사 결과:

```text
AdminAssetsPanel 사용 키: 38개
laptops 컨텍스트 키: 38개
누락 키: 0개
과잉 키: 0개
uiContext 원본 누락: 0개
```

## 7. 유지된 기능

다음 동작은 변경하지 않았습니다.

- 첫 번째 엑셀 시트만 읽기
- CSV 첫 줄을 헤더로 사용
- 자산카테고리와 자산관리번호 필수
- 등록 카테고리와 정확히 일치하는 행만 등록
- 모델명 기본값 `미지정 기종`
- 시리얼번호 자동 생성
- 제조일자 오늘 날짜 기본값
- 기본 이미지 URL
- `대여불가`, `불가`, `unavailable` 상태 변환
- 업로드 파일 내부 중복 제거
- 기존 자산번호 레지스트리 중복 차단
- 100건 단위 transaction
- 일부 chunk 성공 후 후속 chunk 실패 시 기존 성공분 유지
- 공개 자산 카탈로그 write-through
- 성공·부분 성공·실패 토스트 문구
- 파일 input 초기화와 동일 파일 재선택

## 8. 검증 결과

- TypeScript parser를 이용한 JS·JSX 구문 검사: 통과
- Firestore 엄격 접근 감사: PASS
- Firestore 호출 수: 123개 유지
- `onSnapshot()` 호출 위치: 32개 유지
- 자산 업로드 파일 확장자 판정: 통과
- 업로드 헤더 별칭 매핑: 통과
- 필수 자산번호 누락 집계: 통과
- 대여 가능·불가 상태 변환: 통과
- 기본 제조일자 적용: 통과
- 컨텍스트 계약 검사: 통과
- 상대 import 해석: 통과

## 9. 프로덕션 빌드 제한

`npm run build`의 `prebuild` 단계인 Firestore 엄격 감사는 통과했습니다.

이 실행 환경에는 `node_modules/.bin/vite`가 없어 실제 Vite 번들 생성은 완료하지 못했습니다.

```text
sh: 1: vite: not found
```

실제 프로젝트 PC의 `deploy.ps1`은 배포 전에 `npm run build`를 실행하므로 빌드 오류가 발생하면 게시 전에 중단됩니다.

## 10. 배포

Rules와 인덱스는 변경하지 않았습니다.

```powershell
Set-Location "E:\project\rental-system\test_new"
.\deploy.ps1
```
