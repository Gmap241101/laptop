# P2 회원 계정 목록 컨트롤러 패널 지연 로딩 보고서

## 1. 작업 목적

`App.jsx`에서 정적으로 실행되던 `useAdminMemberAccountsController`를 실제 사용 화면인 `AdminMemberAccountsPanel` 내부로 이동했습니다.

분리 대상은 다음과 같습니다.

- 회원 계정 목록 실시간 구독
- 상태별 회원 수 집계
- 상태 필터
- 회원 검색과 순차 Firestore 스캔
- 서버 커서 페이지네이션
- 관리자 계정 제외 처리
- 목록 로딩·오류 상태

일반 사용자와 회원 계정 관리 이외의 관리자 화면에서는 이 컨트롤러와 관련 조회 코드가 초기 정적 경로에 포함되지 않습니다.

## 2. 변경 파일

### 수정

- `src/App.jsx`
- `src/admin/AdminDashboardPanel.jsx`
- `src/admin/AdminMemberAccountsPanel.jsx`
- `src/admin/AdminSignupPolicyPanel.jsx`
- `src/context/appContextSlices.js`
- `src/features/members/useAdminMemberAccountsController.js`
- `src/features/members/useAdminMemberDirectoryAuditActions.js`
- `docs/performance-optimization/README.md`
- `docs/performance-optimization/measurements/SOURCE_GRAPH_ANALYSIS_REPORT.json`

### 신규 문서

- `docs/performance-optimization/reports/P2_MEMBER_ACCOUNTS_PANEL_LAZY_FEATURE_REPORT.md`
- `docs/performance-optimization/validation/P2_MEMBER_ACCOUNTS_PANEL_LAZY_FEATURE_VALIDATION_REPORT.txt`
- `docs/performance-optimization/diffs/P2_MEMBER_ACCOUNTS_PANEL_LAZY_FEATURE.diff`
- `docs/performance-optimization/measurements/P2_MEMBER_ACCOUNTS_PANEL_LAZY_SOURCE_GRAPH_COMPARISON.json`

### 삭제

- 없음

Firestore Rules, 인덱스, Firebase 설정 및 npm 의존성은 변경하지 않았습니다.

## 3. 수정 전 구조

```text
App.jsx
└─ useAdminMemberAccountsController (정적 import)
   ├─ 회원 목록 onSnapshot
   ├─ 상태별 getCountFromServer
   ├─ 검색 getDocs 순차 스캔
   ├─ 페이지 커서
   └─ 검색·필터·페이지 상태

AdminMemberAccountsPanel
└─ App 컨텍스트에서 완성된 목록 상태와 setter 16개 전달
```

컨트롤러가 `App.jsx`에 정적으로 연결되어 있어 일반 사용자 접속에서도 초기 모듈 그래프에 포함됐습니다.

## 4. 수정 후 구조

```text
App.jsx
├─ 회원 목록 컨트롤러 없음
├─ 회원 계정 화면 이동 요청만 보관
└─ openAdminMemberAccounts()

AdminWorkspace (React.lazy)
└─ AdminMemberAccountsPanel
   ├─ useAdminMemberAccountsController
   ├─ useAdminMemberAccountStatusActions
   └─ memberAccountHistoryService
```

패널 내부 호출:

```jsx
const {
  adminUserAccountHasNextPage,
  adminUserAccountQuery,
  adminUserAccountSearchMode,
  adminUserAccountTotalPages,
  adminUserAccountStatusCounts,
  adminUserAccountStatusFilter,
  adminUserAccountsLoadErrorMessage,
  adminUserAccountsReady,
  filteredManagedUserAccounts,
  safeAdminUserAccountPage,
  setAdminUserAccountPage,
  setAdminUserAccountQuery,
  setAdminUserAccountStatusFilter,
} = useAdminMemberAccountsController({
  prerequisitesReady: memberAccountsPrerequisitesReady,
  enabled: isAdminAuthenticated,
  navigationRequest: adminMemberAccountsNavigationRequest,
  registeredAdminAccounts,
  triggerToast,
});
```

## 5. `App.jsx`에서 제거한 코드

정적 import를 제거했습니다.

```jsx
import useAdminMemberAccountsController
  from './features/members/useAdminMemberAccountsController.js';
```

최상위 훅 호출과 다음 반환값 전달도 제거했습니다.

```text
adminUserAccountHasNextPage
adminUserAccountQuery
adminUserAccountSearchMode
adminUserAccountStatusCounts
adminUserAccountStatusFilter
adminUserAccountTotalPages
adminUserAccountsLoadErrorMessage
adminUserAccountsReady
filteredManagedUserAccounts
safeAdminUserAccountPage
setAdminUserAccountPage
setAdminUserAccountQuery
setAdminUserAccountStatusFilter
```

`App.jsx`는 18,801줄·542,334 bytes에서 18,783줄·541,803 bytes로 감소했습니다.

## 6. 회원 계정 화면 이동 브리지

대시보드의 승인 대기 회원 카드와 회원가입 정책의 정보 수정 필요 회원 링크는 기존에 회원 컨트롤러의 setter를 직접 호출했습니다.

수정 후에는 최소 이동 요청만 `App.jsx`에 전달합니다.

```jsx
const openAdminMemberAccounts = useCallback(
  ({ query = '', statusFilter = 'all' } = {}) => {
    setAdminMemberAccountsNavigationRequest((currentRequest) => ({
      requestId: Number(currentRequest?.requestId || 0) + 1,
      query: String(query || ''),
      statusFilter: String(statusFilter || 'all'),
    }));
    setAdminTab('memberAccounts');
  },
  []
);
```

대시보드 승인 대기 회원 이동:

```jsx
openAdminMemberAccounts({
  query: '',
  statusFilter: USER_PROFILE_STATUS.PENDING,
});
```

명부 검사 결과의 정보 수정 필요 회원 이동:

```jsx
openAdminMemberAccounts({
  query: '',
  statusFilter: USER_PROFILE_STATUS.PROFILE_REQUIRED,
});
```

## 7. 검색·필터 상태 유지

컨트롤러가 패널 내부로 이동하면 메뉴 전환 시 패널이 언마운트됩니다. 기존과 동일하게 검색어와 상태 필터를 유지하기 위해 컨트롤러 모듈 내부에 세션 상태를 둡니다.

```js
const memberAccountsSessionState = {
  lastNavigationRequestId: 0,
  page: 1,
  query: '',
  statusFilter: 'all',
};
```

다음 항목은 유지됩니다.

- 다른 관리자 메뉴를 다녀온 뒤 검색어 유지
- 상태 필터 유지
- 대시보드·명부 검사 화면에서 전달한 강제 필터 적용
- 새 이동 요청이 없으면 사용자가 마지막으로 선택한 검색·필터 재사용

페이지 커서는 Firestore 문서 스냅샷을 보관하므로 패널 재진입 시 1페이지부터 안전하게 다시 구성됩니다. 이는 기존 컨트롤러가 비활성화될 때 커서를 초기화하던 동작과 동일합니다.

## 8. 컨텍스트 계약 축소

### 회원 계정 패널

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 컨텍스트 키 | 23개 | 13개 | -10개 |

수정 후 전달값:

```text
AdminPageHeader
Button
CheckCircle2
LogOut
Search
USER_PROFILE_STATUS
XCircle
adminMemberAccountsNavigationRequest
isAdminAuthenticated
memberAccountsPrerequisitesReady
registeredAdminAccounts
triggerConfirm
triggerToast
```

목록 상태와 setter는 패널 내부 컨트롤러가 직접 생성합니다.

### 관련 패널 계약

| 패널 | 정의 키 | 실제 사용 키 | 누락·과잉 |
|---|---:|---:|---:|
| 관리자 대시보드 | 27 | 27 | 0 |
| 회원가입 정책 | 16 | 16 | 0 |
| 회원 계정 관리 | 13 | 13 | 0 |

## 9. 초기 소스 그래프

| 항목 | 수정 전 | 수정 후 | 변화 |
|---|---:|---:|---:|
| 초기 정적 모듈 | 35개 | 34개 | -1개 |
| 초기 정적 소스 | 782,310 bytes | 769,652 bytes | -12,658 bytes |
| 초기 소스 감소율 | - | - | 약 1.62% |
| `App.jsx` | 542,334 bytes | 541,803 bytes | -531 bytes |
| 최상위 동적 진입점 | 13개 | 13개 | 동일 |

초기 정적 그래프에서 제외된 파일:

```text
src/features/members/useAdminMemberAccountsController.js
```

컨트롤러는 현재 13,745 bytes이며 `AdminMemberAccountsPanel`이 실제로 로드될 때만 평가됩니다.

## 10. Firestore 영향

| 호출 | 수정 전 | 수정 후 |
|---|---:|---:|
| 전체 Firestore 접근 | 123개 | 123개 |
| `onSnapshot()` | 32개 | 32개 |
| `getDocs()` | 48개 | 48개 |
| `getDoc()` | 23개 | 23개 |
| `getCountFromServer()` | 20개 | 20개 |

다음 조건은 변경하지 않았습니다.

- 페이지당 회원 20명
- 다음 페이지 확인용 1건 추가 조회
- 검색 배치 100건
- `createdAt desc` 정렬
- 상태별 `where` 조건
- 관리자 UID 제외 처리
- 검색 대상: 이름, 이메일, 부서, 전화번호, UID

코드 위치만 정적 `App.jsx` 경로에서 지연 패널 경로로 이동했습니다.

## 11. 유지된 화면 동작

- 승인 대기·활성·정보 수정 필요·차단·이용 종료 건수
- 상태 필터
- 회원 검색 디바운스
- 전체 범위 순차 검색
- 이전·다음 페이지
- 회원 상태 변경
- 재가입 이력 확인
- 대시보드에서 승인 대기 회원으로 이동
- 명부 검사 결과에서 정보 수정 필요 회원으로 이동
- 기존 JSX, className, 한국어 문구

한국어 고유 문자열 비교 결과는 수정 전·후 각각 1,598개이며 삭제·추가된 문자열은 없습니다.

## 12. 검증 결과

- React Hook import 감사: PASS
- JS·JSX·MJS 변환: 85개, 오류 0건
- 상대 import: 164개, 누락 0건
- 미정의 식별자 `TS2304/TS2552`: 0건
- Firestore 엄격 감사: PASS
- 컨텍스트 계약: PASS
- 초기 그래프에서 회원 컨트롤러 제외 확인
- 한국어 화면 문자열 변경: 0건

## 13. 프로덕션 빌드 제한

`npm run build`의 사전 단계는 통과했습니다.

```text
React hook import audit: PASS
Firestore access audit: PASS
```

현재 검증 환경에는 Vite 실행 파일이 없어 실제 번들 생성은 완료하지 못했습니다.

```text
sh: 1: vite: not found
```

실제 프로젝트 PC의 `deploy.ps1`은 배포 전에 동일 감사를 거쳐 Vite 빌드를 수행하므로, 빌드 오류가 있으면 게시 전에 중단됩니다.


## 14. 패키지 검증

| 항목 | 결과 |
|---|---:|
| 전체 패키지 manifest | 225개 |
| 변경 파일 패키지 manifest | 13개 |
| 전체 패키지 SHA-256 불일치 | 0개 |
| 변경 패키지 SHA-256 불일치 | 0개 |
| 변경 패키지와 작업본 불일치 | 0개 |
| ZIP 무결성 | 통과 |
| 자동 교체 시뮬레이션 | 통과 |
| 누적 삭제 목록 | 66개 경로 처리 |
| `.git` 보존 | 통과 |
| `node_modules` 보존 | 통과 |
| `.env.local` 보존 | 통과 |
| 패키지 외 로컬 파일 보존 | 통과 |

전체 패키지는 기존 정리 패키지의 누적 삭제 목록을 유지하므로, PowerShell 교체 스크립트로 적용할 때 프로젝트 루트의 과거 보고서와 이미 폐기된 feature 파일도 함께 정리됩니다.
