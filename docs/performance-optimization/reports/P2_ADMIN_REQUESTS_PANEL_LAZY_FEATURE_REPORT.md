# P2 관리자 신청 목록 컨트롤러 패널 지연 로딩 보고서

## 1. 작업 목적

`App.jsx`에 남아 있던 관리자 대여 신청 목록의 상태·검색·필터·페이지네이션·상태별 집계 로직을 실제 사용 화면인 `AdminRequestsPanel` 내부로 이동했습니다.

분리 대상은 다음과 같습니다.

- 관리자 신청 목록 실시간 구독
- 검색어 및 디바운스 상태
- 신청 탭과 대시보드 빠른 필터
- 페이지 크기와 서버 커서 페이지네이션
- 전체 범위 순차 검색
- 탭별 신청 건수 집계
- 선택 신청 단건 보충 조회
- 목록 정렬·검색·페이지 계산
- 목록 로딩·오류 상태

일반 사용자와 신청 관리 이외의 관리자 화면에서는 위 컨트롤러 및 관리자 신청 검색 서비스가 초기 정적 경로에 포함되지 않습니다.

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `src/admin/AdminDashboardPanel.jsx`
- `src/admin/AdminRequestsPanel.jsx`
- `src/context/appContextSlices.js`
- `src/hooks/useDashboardSummary.js`
- `docs/performance-optimization/README.md`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규

- `src/features/requests/useAdminRequestsController.js`
- `docs/performance-optimization/reports/P2_ADMIN_REQUESTS_PANEL_LAZY_FEATURE_REPORT.md`
- `docs/performance-optimization/validation/P2_ADMIN_REQUESTS_PANEL_LAZY_FEATURE_VALIDATION_REPORT.txt`
- `docs/performance-optimization/diffs/P2_ADMIN_REQUESTS_PANEL_LAZY_FEATURE.diff`
- `docs/performance-optimization/measurements/P2_ADMIN_REQUESTS_PANEL_LAZY_SOURCE_GRAPH_COMPARISON.json`

### 삭제

- 없음

Firestore Rules, 인덱스, Firebase 설정 및 npm 의존성은 변경하지 않았습니다.

## 3. 수정 전 구조

```text
App.jsx
├─ 사용자 본인 신청 목록 상태
├─ 관리자 전체 신청 목록 상태
├─ 관리자 신청 탭·빠른 필터·검색어
├─ 관리자 페이지·페이지 크기·커서
├─ useAdminRequestProgressiveSearch
├─ 관리자 신청 목록 onSnapshot
├─ 관리자 신청 탭별 getCountFromServer
├─ 선택 신청 getDoc
└─ 관리자 목록 필터·정렬·페이지 계산

AdminRequestsPanel
└─ App 컨텍스트에서 완성된 목록 상태와 setter 전달
```

사용자 본인의 신청 구독과 관리자 전체 신청 관리가 동일한 `rentalRequests` 상태를 공유하고 있어, 일반 사용자 접속에서도 관리자 검색 훅과 쿼리 서비스가 초기 모듈 그래프에 포함됐습니다.

## 4. 수정 후 구조

```text
App.jsx
├─ 사용자 본인의 활성 신청 구독만 유지
├─ 관리자 신청 화면 이동 요청
├─ 관리자 신청 목록 제어 브리지
└─ 신청 승인·수정·복구 등 Firestore 업무 액션

AdminWorkspace (React.lazy)
└─ AdminRequestsPanel
   └─ useAdminRequestsController
      ├─ useAdminRequestProgressiveSearch
      ├─ adminRequestQuery
      ├─ 목록 onSnapshot
      ├─ 검색 getDocs 순차 스캔
      ├─ 탭별 getCountFromServer
      ├─ 선택 신청 getDoc
      └─ 검색·필터·페이지 상태
```

관리자 신청 컨트롤러는 `AdminRequestsPanel`이 실제로 마운트될 때만 로드됩니다.

## 5. 신규 관리자 신청 컨트롤러

신규 파일:

```text
src/features/requests/useAdminRequestsController.js
```

패널 호출:

```jsx
const {
  adminRequestPageSize,
  adminRequestQuery,
  adminRequestQuickFilter,
  adminRequestTab,
  adminRequestTabCounts,
  adminRequestTotalPages,
  filteredAdminRequests,
  mergedRentalRequests,
  paginatedAdminRequests,
  rentalRequestIdSet,
  rentalRequestsLoadErrorMessage,
  rentalRequestsReady,
  safeAdminRequestPage,
  selectedAdminRequest,
  setAdminRequestPage,
  setAdminRequestPageSize,
  setAdminRequestQuery,
  setAdminRequestQuickFilter,
  setAdminRequestTab,
} = useAdminRequestsController({
  enabled: isAdminAuthenticated,
  mutationVersion: adminRequestsMutationVersion,
  navigationRequest: adminRequestsNavigationRequest,
  onControllerStateChange: onAdminRequestsControllerStateChange,
  prerequisitesReady: adminRequestsPrerequisitesReady,
  selectedRequestId: selectedAdminRequestId,
  triggerToast,
});
```

컨트롤러가 소유하는 상태:

```text
requests
ready
loadErrorMessage
requestTab
quickFilter
query
pageSize
page
hasNextPage
totalCount
tabCounts
페이지별 Firestore cursor
검색 cache
```

## 6. 사용자 신청과 관리자 신청 상태 분리

`App.jsx`의 `rentalRequests`는 이제 사용자 본인의 진행 중 신청만 구독합니다.

```jsx
const ownRequestSource = firestoreQuery(
  RENTAL_REQUESTS_COLLECTION_REF,
  where('requesterUid', '==', firebaseAuthUser.uid),
  where('status', 'in', [
    STATUS.REQUESTED,
    STATUS.ON_HOLD,
    STATUS.APPROVED,
  ])
);
```

관리자로 인증된 경우 사용자용 목록 상태는 비우고 관리자 목록은 패널 컨트롤러가 별도로 처리합니다.

```jsx
if (isAdminAuthenticated) {
  setRentalRequests([]);
  setRentalRequestsLoadErrorMessage('');
  setRentalRequestsReady(true);
  return undefined;
}
```

다음 사용자 기능은 기존 상태를 그대로 사용합니다.

- 나의 대여 신청
- 대여 신청 수정·취소
- 연장·반납 요청
- 회원 탈퇴 가능 여부 판정
- 사용자 대여 제한 상태 계산

## 7. 관리자 신청 화면 이동 브리지

대시보드는 기존에 관리자 신청 컨트롤러의 setter를 직접 호출했습니다.

수정 전:

```jsx
setAdminRequestTab(requestTab);
setAdminRequestQuickFilter(quickFilter);
setAdminRequestQuery('');
setAdminRequestPage(1);
setSelectedAdminRequestId('');
setAdminTab('requests');
```

수정 후에는 이동 요청 객체만 전달합니다.

```jsx
const openAdminRequests = useCallback(
  ({
    query = '',
    quickFilter = ADMIN_REQUEST_QUICK_FILTER.ALL,
    requestTab = ADMIN_REQUEST_TAB.PENDING,
    selectedRequestId = '',
  } = {}) => {
    setAdminRequestsNavigationRequest((currentRequest) => ({
      requestId: Number(currentRequest?.requestId || 0) + 1,
      query: String(query || ''),
      quickFilter: String(quickFilter || ADMIN_REQUEST_QUICK_FILTER.ALL),
      requestTab: String(requestTab || ADMIN_REQUEST_TAB.PENDING),
    }));
    setSelectedAdminRequestId(String(selectedRequestId || ''));
    setAdminTab('requests');
  },
  []
);
```

유지되는 이동 경로:

- 대시보드 연체 목록
- 오늘 반납 목록
- 오늘 대여 시작 목록
- 사용자 요청 검토 대기
- 신규 신청·보류·예약중 빠른 필터
- 대시보드 최근 신청 상세

## 8. 관리자 액션과 패널 목록 최소 브리지

신청 승인·수정·복구·메모 저장 함수는 기존 Firestore 업무 트랜잭션을 유지하기 위해 `App.jsx`에 남겨 두었습니다.

패널은 다음 세 기능만 등록합니다.

```text
getRequestById
updateRequests
resetPage
```

등록 코드:

```jsx
onControllerStateChange({
  getRequestById,
  resetPage,
  updateRequests,
});
```

`App.jsx`는 이 브리지로 현재 신청을 찾고, 성공한 업무 액션을 패널 목록에 즉시 반영합니다.

```jsx
const currentRequest = getAdminRequestById(id);

updateAdminRequestPanelRequests((currentRequests) =>
  currentRequests.map((request) =>
    request.id === id ? committedRequest : request
  )
);
```

브리지는 목록 데이터 전체를 `App.jsx`로 끌어올리지 않습니다.

## 9. 상태 변경 후 집계 갱신

상태 변경이나 기간 수정으로 탭·빠른 필터 건수가 달라질 수 있으므로 성공한 관리자 액션은 mutation version을 증가시킵니다.

```jsx
const notifyAdminRequestMutation = useCallback(() => {
  setAdminRequestsMutationVersion(
    (currentVersion) => currentVersion + 1
  );
}, []);
```

컨트롤러의 탭별 집계 effect는 해당 버전을 의존성으로 사용합니다.

```jsx
useEffect(() => {
  // pending, rental, closed, returned 집계
}, [enabled, mutationVersion, prerequisitesReady]);
```

적용 대상:

- 사용자 연장·반납 요청 승인 또는 불허
- 관리자 신청 기간·목적 수정
- 신청 상태 복구
- 승인·불허·반납 등 신청 상태 변경

메모 저장은 탭 건수에 영향을 주지 않으므로 목록만 갱신합니다.

## 10. 검색·필터 세션 유지

패널은 관리자 메뉴를 이동하면 언마운트됩니다. 기존과 동일하게 마지막 선택값을 유지하기 위해 모듈 세션 상태를 사용합니다.

```js
const adminRequestsSessionState = {
  lastNavigationRequestId: 0,
  page: 1,
  pageSize: 10,
  query: '',
  quickFilter: ADMIN_REQUEST_QUICK_FILTER.ALL,
  requestTab: ADMIN_REQUEST_TAB.PENDING,
};
```

유지되는 값:

- 신청 탭
- 대시보드 빠른 필터
- 검색어
- 페이지당 표시 건수
- 현재 페이지

Firestore 문서 cursor는 패널 재진입 시 안전하게 다시 구성합니다.

## 11. 선택 신청 단건 보충 조회

대시보드에서 신청 상세로 바로 이동할 경우 해당 문서가 현재 페이지 목록에 없을 수 있습니다.

컨트롤러는 선택 ID가 목록에 없을 때만 단건 조회합니다.

```jsx
void getDoc(
  doc(RENTAL_REQUESTS_COLLECTION_REF, selectedRequestId)
).then((snapshot) => {
  if (!snapshot.exists()) return;

  setRequests((currentRequests) => [
    ...currentRequests,
    {
      ...snapshot.data(),
      id: snapshot.id,
    },
  ]);
});
```

신청 처리 이력 구독은 기존과 같이 `App.jsx`에서 선택 ID 기준으로만 최대 100건을 조회합니다.

## 12. 대시보드 요약과 신청 목록 집계 결합 제거

기존 `useDashboardSummary`는 대시보드 요약 문서를 받을 때 관리자 신청 패널의 탭 건수 상태까지 직접 갱신했습니다.

```text
useDashboardSummary
→ setAdminRequestTabCountsRemote
→ 관리자 신청 패널 탭 건수
```

수정 후:

- 대시보드 요약 훅은 대시보드 데이터만 관리
- 신청 패널 탭 건수는 신청 컨트롤러가 직접 집계
- 관리자 업무 성공 시 mutation version으로 재집계

이로써 대시보드와 신청 목록 컨트롤러의 교차 상태 의존성이 제거됐습니다.

## 13. 컨텍스트 계약 축소

### 관리자 신청 패널

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 컨텍스트 키 | 56개 | 44개 | -12개 |

제거된 주요 전달값:

```text
adminRequestPageSize
adminRequestQuery
adminRequestQuickFilter
adminRequestTab
adminRequestTabCounts
adminRequestTotalPages
filteredAdminRequests
mergedRentalRequests
paginatedAdminRequests
rentalRequestIdSet
rentalRequestsLoadErrorMessage
rentalRequestsReady
safeAdminRequestPage
selectedAdminRequest
각 목록 setter
```

새 브리지 의존성:

```text
adminRequestsMutationVersion
adminRequestsNavigationRequest
adminRequestsPrerequisitesReady
onAdminRequestsControllerStateChange
selectedAdminRequestId
```

### 관리자 대시보드

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 컨텍스트 키 | 27개 | 22개 | -5개 |

다섯 개의 신청 목록 setter를 제거하고 `openAdminRequests` 하나로 통합했습니다.

검증 결과:

```text
AdminRequestsPanel: 44 / 44
AdminDashboardPanel: 22 / 22
누락 키: 0
과잉 키: 0
uiContext 누락: 0
```

## 14. `App.jsx` 규모 변화

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 줄 수 | 18,783줄 | 18,217줄 | -566줄 |
| 파일 크기 | 541,803 bytes | 526,542 bytes | -15,261 bytes |
| `useState()` | 211개 | 205개 | -6개 |
| `useEffect()` | 64개 | 60개 | -4개 |
| `useRef()` | 21개 | 20개 | -1개 |
| `useMemo()` | 39개 | 35개 | -4개 |

브리지 콜백이 추가되어 `useCallback()`은 3개에서 9개로 증가했습니다. 이는 목록 전체 상태를 끌어올리지 않고 최소 명령 인터페이스만 제공하기 위한 증가입니다.

## 15. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 34개 | 32개 | -2개 |
| 초기 정적 소스 | 769,652 bytes | 746,259 bytes | -23,393 bytes |
| 초기 소스 감소율 | - | - | 약 3.04% |
| `App.jsx` | 541,803 bytes | 526,542 bytes | -15,261 bytes |
| 최상위 동적 진입점 | 13개 | 13개 | 동일 |

초기 정적 경로에서 제외된 파일:

```text
src/features/requests/useAdminRequestProgressiveSearch.js
src/services/adminRequestQuery.js
```

신규 `useAdminRequestsController.js`와 위 두 의존성은 `AdminRequestsPanel` 아래의 중첩 지연 경로에 포함됩니다.

## 16. Firestore 영향

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 Firestore 접근 | 123개 | 123개 |
| `onSnapshot()` | 32개 | 32개 |
| `getDocs()` | 48개 | 48개 |
| `getDoc()` | 23개 | 23개 |
| `getCountFromServer()` | 20개 | 20개 |

조회 횟수와 쿼리 조건은 변경하지 않았습니다.

새 컨트롤러로 이동한 접근 위치는 7개입니다.

```text
목록 onSnapshot 1개
선택 신청 getDoc 1개
빠른 필터 getCountFromServer 1개
탭별 getCountFromServer 4개
```

검색의 `getDocs()` 순차 스캔은 기존 `useAdminRequestProgressiveSearch`를 그대로 재사용합니다.

유지된 쿼리 정책:

- 페이지 크기 + 1건 조회
- 페이지별 Firestore cursor
- 검색 배치 100건
- 검색 결과가 필요한 수량에 도달할 때까지 순차 조회
- 일반 목록은 `onSnapshot()`
- 검색 목록은 일회성 `getDocs()`
- 선택 신청 이력은 최대 100건

## 17. 유지된 화면과 기능

- 신청 대기·대여 승인·대여 불허·반납 완료 탭
- 대시보드 빠른 필터
- 신청 검색
- 페이지당 표시 건수
- 이전·다음 페이지
- 신청 상세 화면
- 관리자 메모 편집·저장
- 신청 정보 수정
- 상태 복구
- 승인·불허·반납 처리
- 사용자 연장·반납 요청 검토
- 신청 처리 이력
- 기존 JSX·className·화면 문구

한국어 고유 문자열 비교:

```text
수정 전: 1,352개
수정 후: 1,352개
삭제: 0개
추가: 0개
```

## 18. 검증 결과

- React Hook import 감사: PASS
- JS·JSX·MJS 변환 검사: 86개, 오류 0건
- 미정의 식별자 `TS2304/TS2552`: 0건
- 상대 import 검사: 173개, 누락 0건
- Firestore 엄격 감사: PASS
- 미승인 경고: 0건
- 미승인 오류: 0건
- 패널 컨텍스트 계약: PASS
- `uiContext` 계약: PASS
- 초기 정적 그래프에서 관리자 검색 서비스 제외: 확인
- 기존 한국어 문구 변경: 0건

## 19. 프로덕션 빌드 제한

`npm run build`의 사전 검사는 통과했습니다.

```text
React hook import audit: PASS
Firestore access audit: PASS
```

현재 검증 환경에는 Vite 실행 파일이 없어 실제 번들 생성은 완료하지 못했습니다.

```text
sh: 1: vite: not found
```

실제 프로젝트 PC의 `deploy.ps1`은 게시 전에 동일 감사와 Vite 빌드를 실행하므로 빌드 오류가 있으면 배포 전에 중단됩니다.

## 20. 배포 범위

Firestore Rules와 인덱스 변경은 없습니다. 전체 패키지를 교체한 후 웹만 배포합니다.

```powershell
Set-Location "E:\project\rental-system\test_new"

npm run audit:react-hooks
npm run audit:firestore:strict
npm run build
.\deploy.ps1
```
