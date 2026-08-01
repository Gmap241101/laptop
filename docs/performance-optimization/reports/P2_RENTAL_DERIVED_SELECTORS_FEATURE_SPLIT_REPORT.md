# P2 대시보드·대여 파생값 선택자 분리 보고서

## 1. 기준본

- 입력 기준본: `rental-system-global-ui-controller-split-20260801_2108_deployment_package.zip`
- 작업 범위: 대여 신청 병합, 현재 사용자 신청 선택, 대여 제한 상태, 대여 현황 통계, 사용자·관리자 자산 필터, 선택 자산 가용성, 자산 편집 삽입 위치
- 기능 정책 변경: 없음
- Firestore Rules·인덱스 변경: 없음

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/features/requests/useRentalDerivedSelectors.js`
- 본 작업의 diff·보고서·검증 보고서·소스 그래프 비교 파일

### 삭제

- 신규 삭제 파일 없음
- 기존 `package-meta/REMOVED_FILES.txt` 누적 목록을 그대로 승계

## 3. 분리한 파생값

`App.jsx`에서 다음 계산을 `useRentalDerivedSelectors()`로 이동했다.

- 공개 예약 요약과 본인 신청내역 병합
- 현재 Firebase UID, 이전 계정 UID, 가입 이메일 기준 본인 신청 선택
- 현재 사용자의 대여 제한 상태 계산
- 사용자 홈·대여 화면의 대여 현황 통계
- 관리자 대시보드 요약값의 대여 상태 보드 변환
- 사용자 대여 신청 화면의 검색·카테고리·가용성 필터
- 관리자 자산 화면의 검색·카테고리·가용성 필터
- 선택 자산과 선택 기간 가용성 계산
- 기간 기반 대여 모드 안내 문구
- 선택 부서의 대여자 목록
- 자산 수정 패널 삽입 위치 계산

## 4. 순수 선택자

신규 모듈은 React Hook 외에도 다음 순수 함수를 export한다.

```js
mergeRentalRequestSources();
selectCurrentUserRequests();
createRentalStatusSummary();
selectAdminRentalStatusStats();
filterUserRentalLaptops();
filterAdminRentalLaptops();
getUserLaptopStatusLabel();
getEditLaptopInsertIndex();
```

따라서 후속 테스트와 최종 App 셸 정리에서 동일 계산을 복제하지 않고 재사용할 수 있다.

## 5. App.jsx 연결

기존 여러 `useMemo()` 블록을 다음 단일 Hook 연결로 교체했다.

```jsx
const {
  adminFilteredLaptops,
  availableFilterLabel,
  currentUserRentalRestrictionStatus,
  currentUserRequests,
  editLaptopInsertIndex,
  filteredBorrowers,
  filteredLaptops,
  isPeriodBasedRentalMode,
  rentalDeviceSectionDescription,
  rentalDeviceSectionTitle,
  selectedLaptop,
  selectedLaptopAvailability,
  shouldShowStats,
  stats,
  statsLoading,
  unavailableFilterLabel,
} = useRentalDerivedSelectors({
  adminAvailabilityFilter,
  adminLaptopQuery,
  adminSelectedAssetCategory,
  adminTab,
  assetGridColumns,
  availabilityFilter,
  currentUserRestriction,
  dashboardSummary,
  dashboardSummaryReady,
  dataBorrowers: data.borrowers,
  dataLaptops: data.laptops,
  dataRequests: data.requests,
  dataSettings: data.settings,
  editLaptop,
  firebaseAuthUser,
  form,
  hasAdminAccess,
  isAdminAuthenticated,
  query,
  rentalRequests,
  selectedAssetCategory,
  selectedLaptopId,
  userProfile,
  userTab,
  view,
});
```

기존 패널 context에 제공되는 변수명은 변경하지 않았다.

## 6. 기능 보존

- 사용자 화면에서는 공개 예약 요약과 본인 상세 신청을 ID 기준으로 병합
- 관리자 화면에서는 본인 신청 구독 데이터만 사용하고 공개 요약을 불필요하게 병합하지 않음
- 현재 UID, 이전 UID, 이메일 호환 조회 규칙 유지
- 신청중·보류·대여중 자산 차단 규칙 유지
- 예약중·대여중·연체 판정 기준일과 상태 계산 유지
- 관리자 대시보드 통계 필드 매핑 유지
- 자산 검색 대상 필드와 카테고리·가용성 필터 유지
- 선택 기간 중 자산 가용성 계산 유지
- 선택 불가 자산 자동 해제 effect는 기존 App 위치와 동작 유지
- 사용자 화면 문구와 상태 라벨 변경 없음

## 7. App.jsx 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 4,667 | 4,390 | -277 |
| 크기 | 137,290 bytes | 129,405 bytes | -7,885 bytes |
| `useState()` | 21 | 21 | 0 |
| `useEffect()` | 7 | 7 | 0 |
| `useRef()` | 5 | 5 | 0 |
| `useMemo()` | 26 | 19 | -7 |

신규 선택자 모듈은 494줄, 12,650 bytes다.

## 8. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 71 | 72 | +1 |
| 초기 정적 소스 | 865,008 bytes | 869,773 bytes | +4,765 bytes |

대여 현황과 필터 계산은 사용자·관리자 셸 렌더에 즉시 필요하므로 정적 import를 유지했다. 이번 단계의 목적은 번들 지연이 아니라 App 책임과 계산 경계 분리다.

## 9. Firestore 영향

전체 감사 대상 호출은 129개로 동일하다.

- `onSnapshot`: 35
- `getDocs`: 48
- `getDoc`: 28
- `getCountFromServer`: 18

신규 선택자 모듈은 Firestore를 직접 호출하지 않는다. Rules, 인덱스, Firebase 설정, 감사 정책 파일도 변경하지 않았다.

## 10. 검증 및 빌드 판정

- 입력 패키지 SHA-256 검증 통과
- React Hook import 감사 통과
- Firestore strict 감사 통과
- 전체 JS·JSX 변환 검사 통과
- 기준본 대비 신규 프로젝트 코드 의미 오류 0건
- 상대 import 누락 0건
- 선택자 런타임 모의시험 통과
- 이동한 한국어 문자열 집합과 발생 횟수 보존

검증 환경의 내부 npm 저장소에서 `yargs-parser-21.1.1.tgz`를 찾지 못해 `npm ci`가 E404로 중단됐다. 실제 Vite 프로덕션 빌드는 로컬 `deploy.ps1`에서 확인해야 한다.
