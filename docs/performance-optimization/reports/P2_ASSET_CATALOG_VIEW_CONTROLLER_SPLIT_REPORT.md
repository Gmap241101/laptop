# P2 자산 카탈로그 보기 상태 컨트롤러 분리 보고서

## 1. 작업 목적

`App.jsx`가 직접 소유하던 사용자·관리자 자산 검색어, 카테고리 필터, 대여 가능 상태 필터, 엑셀·CSV 업로드 패널 표시 상태와 반응형 자산 그리드 계산을 전용 컨트롤러로 이동했습니다. 자산 목록 필터링 결과, CRUD, 카테고리 저장, 업로드 처리, Context 공개 변수명과 화면 문구는 변경하지 않았습니다.

## 2. 변경 파일

- 수정: `src/App.jsx`
- 신규: `src/features/assets/useAssetCatalogViewController.js`
- 수정: `tools/audit-app-flow-contracts.mjs`
- 수정: `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`
- 신규: 본 보고서, 검증 보고서, 전후 비교 JSON, 전체 diff

## 3. 이동한 상태와 계산

- 사용자 자산 검색어 `query`
- 사용자 자산 카테고리 `selectedAssetCategory`
- 사용자 가용성 필터 `availabilityFilter`
- 관리자 자산 검색어 `adminLaptopQuery`
- 관리자 자산 카테고리 `adminSelectedAssetCategory`
- 관리자 가용성 필터 `adminAvailabilityFilter`
- 엑셀·CSV 업로드 패널 표시 상태 `showUploadPanel`
- 반응형 자산 카드 열 수 `assetGridColumns`

전용 컨트롤러는 기존 화면과 컨트롤러가 사용하는 15개 공개값을 동일한 이름으로 반환합니다.

## 4. 구조 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `App.jsx` 줄 수 | 2,174 | 2,180 | +6 |
| `App.jsx` 바이트 | 67,919 | 67,726 | -193 |
| `App.jsx useState` | 11 | 4 | -7 |
| `App.jsx useEffect` | 1 | 1 | 0 |
| `App.jsx useMemo` | 0 | 0 | 0 |
| `App.jsx useRef` | 1 | 1 | 0 |
| 초기 정적 모듈 | 85 | 86 | +1 |
| 초기 정적 소스 | 879,438 bytes | 880,448 bytes | +1,010 bytes |
| 동적 엔트리 | 14 | 14 | 0 |

신규 컨트롤러는 33줄, 1,203 bytes이며 `useState` 7개와 반응형 그리드 Hook 1개를 소유합니다. `App.jsx`의 줄 수는 반환 계약을 명시적으로 구조 분해하면서 6줄 증가했지만, 최상위 상태 소유권은 11개에서 4개로 감소했습니다.

## 5. 기능 보존 검증

런타임 모의 검증에서 다음을 확인했습니다.

1. 사용자 검색어 기본값은 빈 문자열
2. 사용자·관리자 카테고리 기본값은 `전체`
3. 사용자 가용성 기본값은 `STATUS.AVAILABLE`과 동일한 `대여가능`
4. 관리자 가용성 기본값은 `전체`
5. 업로드 패널 기본값은 `false`
6. 반응형 그리드 계산값이 그대로 반환됨
7. 7개 Setter가 직접 값과 함수형 갱신을 정상 처리함
8. 공개 반환 계약 15개가 모두 존재함

`useRentalDerivedSelectors`, `useAdminAssetCategoryController`, `useAdminAssetCrudController`, `AdminAssetsPanel`, `UserRentalPanel`이 사용하는 기존 변수명과 Setter 계약은 유지했습니다.

## 6. 자동 회귀 감사 확장

`tools/audit-app-flow-contracts.mjs`에 다음 검사를 추가했습니다.

- `App.jsx`가 전용 자산 보기 컨트롤러를 import하고 호출하는지 검사
- 공개값 15개가 컨트롤러에 모두 존재하는지 검사
- `App.jsx`에 사용자·관리자 필터 `useState`가 중복 잔존하지 않는지 검사
- `App.jsx`에 업로드 패널 상태가 중복 잔존하지 않는지 검사
- `App.jsx`가 반응형 자산 그리드 Hook을 직접 호출하지 않는지 검사

앱 흐름 감사 계약은 69개에서 86개로 증가했고 모두 통과했습니다.

## 7. Firestore 영향

| 호출 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| `onSnapshot()` | 35 | 35 | 0 |
| `getDocs()` | 48 | 48 | 0 |
| `getDoc()` | 28 | 28 | 0 |
| `getCountFromServer()` | 18 | 18 | 0 |
| `runTransaction()` | 24 | 24 | 0 |
| `setDoc()` | 34 | 34 | 0 |
| `updateDoc()` | 5 | 5 | 0 |
| `deleteDoc()` | 6 | 6 | 0 |

Rules, 인덱스, Firebase 설정과 `package.json`, `package-lock.json`은 변경하지 않았습니다.

## 8. 검증 결과

- 입력 manifest 475개 및 SHA-256 전수 검증: PASS
- React Hook 감사 143개 파일: PASS
- 앱 흐름 계약 86개: PASS
- 상대 import 430개, 누락 0개: PASS
- Firestore strict 감사 읽기 호출 129개: PASS
- 자산 보기 컨트롤러 런타임 모의 검증: PASS
- 한국어 문자열 리터럴 추가 0개, 삭제 0개: PASS
- 기준본 대비 신규 의미 TypeScript 진단: 0개
- `npm run prebuild`: PASS
- `npm ci`: 내부 npm 저장소의 `yargs-parser-21.1.1.tgz` E404로 실패
- 실제 Vite build: 미수행, 로컬 `deploy.ps1` 확인 필요

## 9. 다음 순차 작업 및 잔여량

현재 구조 분리 진행률은 약 93~95%로 추정합니다. 남은 주요 묶음은 앱 초기화·준비 상태 브리지, 잔여 인라인 액션, 동적 Context 그룹 조립 경계, 최종 미사용 계약 감사와 실제 프로덕션 빌드 확인입니다.

- 최소 예상: 3회
- 권장 예상: 5회
- 최대 예상: 7회
- 다음 우선순위: 앱 초기화·준비 상태 브리지 분리 및 초기 원격 폼 Ref 재평가
