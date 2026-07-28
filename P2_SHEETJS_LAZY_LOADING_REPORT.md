# SheetJS 관리자 업로드 전용 지연 로딩 적용 보고서

## 1. 작업 기준

- 기준 패키지: `rental-system-p1-progressive-search-optimization-deployment-package.zip`
- 작업 목적: 일반 사용자와 관리자 일반 화면에서 불필요하게 내려받던 SheetJS 엑셀 처리 라이브러리를 자산 업로드 파일 선택 시점까지 지연
- 업무 로직 변경 범위: 자산 엑셀·CSV 파일 파싱 시작 경로만 변경
- Firestore Rules·인덱스·컬렉션 구조 변경: 없음

## 2. 기존 문제

`App.jsx` 최상위 effect가 앱이 마운트되자마자 다음 외부 스크립트를 삽입했습니다.

```jsx
useEffect(() => {
  if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.async = true;
    document.body.appendChild(script);
  }
}, []);
```

그 결과 다음 이용자도 엑셀 파서 다운로드 비용을 부담했습니다.

- 비로그인 사용자
- 일반 사용자 홈·공지·FAQ 이용자
- 관리자 대시보드·신청·회원 관리 이용자
- 자산 업로드 기능을 전혀 사용하지 않는 세션

## 3. 변경 파일

### 기존 파일 수정

- `src/App.jsx`
- `src/admin/AdminAssetsPanel.jsx`
- `src/context/appContextSlices.js`
- `SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규 파일

- `src/services/sheetJsLoader.js`

## 4. 전역 자동 로드 제거

`App.jsx`에서 앱 시작 시 SheetJS 스크립트를 삽입하던 effect를 완전히 제거했습니다.

수정 후 다음 조건에서는 `xlsx.full.min.js` 요청이 발생하지 않습니다.

- 사이트 최초 접속
- 사용자 홈 진입
- 로그인·회원가입
- 공지사항·FAQ
- 사용자 대여 신청
- 관리자 대시보드
- 관리자 신청·회원·설정 화면
- 관리자 자산 관리 화면 진입 및 업로드 패널 열기

외부 스크립트 요청은 관리자가 실제 업로드 파일을 선택한 경우에만 발생합니다.

## 5. 로더 모듈 자체도 동적 import

`App.jsx`는 SheetJS 로더를 정적 import하지 않습니다.

```jsx
let sheetJsLoaderModulePromise = null;

const loadSheetJsLoaderModule = () => {
  if (!sheetJsLoaderModulePromise) {
    sheetJsLoaderModulePromise = import(
      './services/sheetJsLoader.js'
    ).catch((error) => {
      sheetJsLoaderModulePromise = null;
      throw error;
    });
  }

  return sheetJsLoaderModulePromise;
};
```

따라서 최초 JavaScript 경로에는 다음 항목이 포함되지 않습니다.

- SheetJS 외부 런타임
- SheetJS 스크립트 로더 구현
- 타임아웃 및 재시도 처리 코드

로더 청크는 파일 선택 시 처음 불러옵니다.

## 6. 신규 SheetJS 로더

신규 파일 `src/services/sheetJsLoader.js`는 다음 기능을 제공합니다.

- 이미 `window.XLSX`가 존재하면 즉시 재사용
- 동시 호출 시 하나의 Promise와 하나의 `<script>`만 사용
- 고정 script ID를 이용한 중복 삽입 방지
- `read()` 및 `utils.sheet_to_json()` API 검증
- 20초 로드 타임아웃
- 로드 실패 script 제거
- 실패 후 Promise 초기화 및 재시도 허용
- `crossOrigin="anonymous"`
- `referrerPolicy="no-referrer"`

핵심 코드:

```js
export const loadSheetJs = () => {
  const loadedSheetJs = getLoadedSheetJs();

  if (loadedSheetJs) {
    return Promise.resolve(loadedSheetJs);
  }

  if (sheetJsLoadPromise) {
    return sheetJsLoadPromise;
  }

  sheetJsLoadPromise = new Promise((resolve, reject) => {
    // script 생성, 중복 방지, 타임아웃, API 검증
  });

  return sheetJsLoadPromise;
};
```

## 7. 파일 업로드 처리 변경

기존 `FileReader.onload` 중첩 구조를 `async` 함수와 `File.arrayBuffer()` 구조로 정리했습니다.

```jsx
const handleFileUpload = async (event) => {
  const fileInput = event.currentTarget;
  const file = fileInput.files?.[0];

  if (!file || assetUploadParserLoading) return;

  setAssetUploadParserLoading(true);

  try {
    const sheetJsLoaderModule =
      await loadSheetJsLoaderModule();

    const sheetJs =
      await sheetJsLoaderModule.loadSheetJs();

    const dataBuffer = await file.arrayBuffer();
    // 엑셀 또는 CSV 변환
  } finally {
    fileInput.value = '';
    setAssetUploadParserLoading(false);
  }
};
```

효과:

- 파일이 선택되기 전까지 SheetJS를 로드하지 않음
- 동일 파일 재선택을 위해 input 값을 항상 초기화
- 처리 도중 추가 파일 선택 방지
- 스크립트 로드 오류와 파일 파싱 오류를 구분
- 엑셀 파일은 SheetJS 로드 실패 시 즉시 중단
- CSV 파일은 SheetJS 로드 실패 시 기존 단순 CSV 파서로 보조 처리

## 8. 업로드 UI 상태 추가

업로드 처리 중 파일 선택 input을 비활성화합니다.

```jsx
<input
  type="file"
  onChange={handleFileUpload}
  disabled={assetUploadParserLoading}
/>
```

버튼 문구:

```text
일반 상태: 엑셀 또는 CSV 파일 선택
처리 상태: 파일 분석 및 등록 중
```

`aria-disabled`도 함께 반영했습니다.

## 9. 초기 소스 그래프 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 30개 | 30개 | 변동 없음 |
| 초기 정적 소스 | 836,826 bytes | 837,582 bytes | +756 bytes |
| 동적 진입점 | 13개 | 14개 | +1개 |

초기 소스가 756 bytes 증가한 이유는 `App.jsx`에 동적 로더 Promise와 업로드 상태 처리가 추가됐기 때문입니다.

그러나 기존에 앱 시작과 동시에 다운로드되던 외부 `xlsx.full.min.js` 요청은 제거됐습니다. 소스 그래프 분석기는 외부 CDN 스크립트를 포함하지 않으므로, 위 756 bytes 증가는 외부 런타임 지연 효과를 반영하지 않습니다.

## 10. 기능별 실행 시점

| 사용자 행동 | SheetJS 로더 청크 | 외부 SheetJS 스크립트 |
|---|---:|---:|
| 사이트 접속 | 로드 안 함 | 요청 안 함 |
| 사용자 화면 이용 | 로드 안 함 | 요청 안 함 |
| 관리자 로그인 | 로드 안 함 | 요청 안 함 |
| 자산 관리 진입 | 로드 안 함 | 요청 안 함 |
| 업로드 패널 열기 | 로드 안 함 | 요청 안 함 |
| 파일 선택 | 최초 1회 로드 | 최초 1회 요청 |
| 같은 세션에서 재업로드 | 재사용 | 재사용 |
| 최초 로드 실패 후 재시도 | 다시 로드 | 새 script로 재시도 |

## 11. 변경하지 않은 기능

- 지원 확장자 `.xlsx`, `.xls`, `.csv`
- 엑셀 첫 번째 시트 사용
- `sheet_to_json()` 변환
- 업로드 데이터 필드 매칭
- 카테고리 검증
- 자산관리번호 중복 검증
- 100건 단위 Firestore transaction
- 공개 자산 카탈로그 write-through
- CSV 보조 파서
- 샘플 엑셀 다운로드

## 12. 검증 결과

- JS·JSX·MJS 변환 검사: 66개 파일, 오류 0건
- 상대 import 검사: 115개, 누락 0건
- Firestore 엄격 감사: PASS
- Firestore 호출 수: 변경 전후 123개로 동일
- 동시 `loadSheetJs()` 호출 Promise 재사용: 통과
- 이미 로드된 `window.XLSX` 재사용: 통과
- 실패 script 제거: 통과
- 실패 후 재시도: 통과
- `App.jsx`의 `window.XLSX` 직접 참조: 0건
- 초기 전역 SheetJS effect: 제거
- SheetJS URL 위치: 지연 로더 모듈 1곳만 존재

## 13. 프로덕션 빌드 제한

`npm run build`의 `prebuild` 단계인 Firestore 엄격 감사는 통과했습니다.

이후 실행 환경에 `node_modules/.bin/vite`가 없어 다음 오류로 중단됐습니다.

```text
sh: 1: vite: not found
```

따라서 이 환경에서는 실제 Vite 프로덕션 번들을 생성하지 못했습니다. 실제 프로젝트 PC의 `deploy.ps1`은 배포 전에 동일한 `npm run build`를 실행하므로 빌드 오류가 있으면 게시 전에 중단됩니다.

## 14. 배포

Firestore Rules와 인덱스 변경은 없습니다.

```powershell
Set-Location "E:\project\rental-system\test_new"

.\deploy.ps1
```
